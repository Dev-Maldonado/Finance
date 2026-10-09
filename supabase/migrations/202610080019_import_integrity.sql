-- All imported financial effects go through authenticated, atomic operations.
create table if not exists import_links (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users on delete cascade,
 account_id uuid not null,
 source_id text not null check(length(source_id) between 1 and 500),
 transaction_id uuid references transactions(id),
 operation_request_id uuid,
 classification text not null,
 created_at timestamptz not null default now(),
 unique(user_id,account_id,source_id),
 foreign key(account_id,user_id) references financial_accounts(id,user_id)
);
alter table import_links enable row level security;
drop policy if exists owner_read on import_links;
create policy owner_read on import_links for select to authenticated using(user_id=auth.uid());
revoke all on import_links from anon,authenticated;
grant select on import_links to authenticated;
grant all on import_links to service_role;
create index if not exists import_links_transaction on import_links(transaction_id);

create or replace function import_classified_transactions(items jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
 u uuid:=auth.uid(); item jsonb; classification text; source text; aid uuid; tid uuid;
 req uuid; result jsonb; op_payload jsonb; dt date; val numeric; imported int:=0;
 duplicates int:=0; matched int:=0; used_matches uuid[]:=array[]::uuid[]; gid uuid;
begin
 if u is null then raise exception 'Authentication required'; end if;
 if items is null or jsonb_typeof(items)<>'array' or jsonb_array_length(items)>5000 then raise exception 'Máximo de 5000 linhas por importação'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 for item in select value from jsonb_array_elements(items) loop
  aid:=(item->>'account_id')::uuid; source:=item->>'source_id'; classification:=item->>'classification';
  req:=(item->>'request_id')::uuid; dt:=(item->>'date')::date; val:=(item->>'amount')::numeric;
  if not exists(select 1 from financial_accounts where id=aid and user_id=u and kind<>'savings' and not archived) then raise exception 'Conta inválida'; end if;
  if source is null or length(source) not between 1 and 500 or source not like aid::text||':%' then raise exception 'Identificador de origem inválido'; end if;
  if dt is null or dt>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Importe apenas movimentos efetivamente realizados até hoje'; end if;
  if val is null or val=0 or val<>round(val,2) or abs(val)>999999999999.99 then raise exception 'Valor inválido'; end if;
  if exists(select 1 from import_links where user_id=u and account_id=aid and source_id=source)
     or exists(select 1 from transactions where user_id=u and account_id=aid and source_id=source) then duplicates:=duplicates+1;continue;end if;
  if classification is null or classification not in ('income','expense','yield','adjustment','transfer','invoice_payment','savings_deposit','savings_withdraw','match') then raise exception 'Classificação inválida';end if;
  if classification in ('income','yield','savings_withdraw') and val<=0 then raise exception 'Classificação exige entrada positiva';end if;
  if classification in ('expense','invoice_payment','savings_deposit') and val>=0 then raise exception 'Classificação exige saída negativa';end if;
  if classification='match' then
   tid:=(item->>'transaction_id')::uuid;
   if tid=any(used_matches) then raise exception 'Duas linhas não podem conciliar o mesmo movimento';end if;
   if not exists(select 1 from transactions where id=tid and user_id=u and account_id=aid and status='confirmed' and date=dt and amount=val) then raise exception 'O lançamento existente deve coincidir em conta, data e valor';end if;
   used_matches:=array_append(used_matches,tid);
   insert into import_links(user_id,account_id,source_id,transaction_id,classification) values(u,aid,source,tid,classification);
   matched:=matched+1;continue;
  end if;
  if req is null then raise exception 'Identificador de operação obrigatório';end if;
  if exists(select 1 from operation_requests where user_id=u and request_id=req) then duplicates:=duplicates+1;continue;end if;
  case classification
   when 'income','expense','yield','adjustment' then
    op_payload:=jsonb_build_object('account_id',aid,'category_id',nullif(item->>'category_id',''),'description',item->>'description','type',classification,'amount',case when classification='adjustment' then val else abs(val) end,'date',dt,'status','confirmed','source_id',source);
    result:=execute_operation('transaction',op_payload,req);
   when 'transfer' then
    op_payload:=jsonb_build_object('from_account',case when val<0 then aid else (item->>'counter_account_id')::uuid end,'to_account',case when val<0 then (item->>'counter_account_id')::uuid else aid end,'amount',abs(val),'date',dt);
    result:=execute_operation('transfer',op_payload,req);
   when 'invoice_payment' then
    result:=execute_operation('pay_invoice',jsonb_build_object('invoice_id',item->>'invoice_id','account_id',aid,'amount',abs(val),'date',dt),req);
   when 'savings_deposit' then
    result:=execute_operation('savings_deposit',jsonb_build_object('goal_id',item->>'goal_id','account_id',aid,'amount',abs(val),'date',dt),req);
   when 'savings_withdraw' then
    result:=execute_operation('savings_withdraw',jsonb_build_object('goal_id',item->>'goal_id','account_id',aid,'amount',abs(val),'yield_amount','0','ir_amount','0','iof_amount','0','date',dt),req);
  end case;
  gid:=(result->>'id')::uuid; tid:=null;
  select t.id into tid from transactions t where t.user_id=u and t.account_id=aid and t.date=dt and t.amount=val and t.status='confirmed'
   and (t.id=gid or t.group_id=gid or t.group_id in(select transaction_group from savings_movements where user_id=u and lot_id=gid)) order by t.id limit 1;
  if tid is null then raise exception 'A operação não gerou o movimento esperado; importação revertida';end if;
  insert into import_links(user_id,account_id,source_id,transaction_id,operation_request_id,classification) values(u,aid,source,tid,req,classification);
  imported:=imported+1;
 end loop;
 return jsonb_build_object('imported',imported,'duplicates',duplicates,'matched',matched);
end $$;
revoke all on function import_classified_transactions(jsonb) from public,anon;
grant execute on function import_classified_transactions(jsonb) to authenticated;

-- Count only new effects, including concurrent/repeated investment imports.
create or replace function import_investment_operations(items jsonb) returns int
language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();item jsonb;n int:=0;rid uuid;
begin
 if u is null then raise exception 'Authentication required';end if;
 if items is null or jsonb_typeof(items)<>'array' or jsonb_array_length(items)>1000 then raise exception 'Máximo de 1000 operações por importação';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 for item in select value from jsonb_array_elements(items) loop
  rid:=(item->>'request_id')::uuid;
  if rid is null then raise exception 'Identificador de operação obrigatório';end if;
  if exists(select 1 from operation_requests where user_id=u and request_id=rid) then continue;end if;
  perform execute_operation('investment',item->'payload',rid);n:=n+1;
 end loop;
 return n;
end $$;
revoke all on function import_investment_operations(jsonb) from public,anon;
grant execute on function import_investment_operations(jsonb) to authenticated;
