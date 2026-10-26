-- New dates are nullable: legacy cash/competence behavior and historical values
-- remain unchanged until the owner explicitly registers a payment/receipt.
alter table transactions add column if not exists settled_on date;
alter table user_settings add column if not exists default_account_id uuid references financial_accounts(id) on delete set null;
alter table user_settings add column if not exists default_expense_category_id uuid references categories(id) on delete set null;
alter table user_settings add column if not exists default_income_category_id uuid references categories(id) on delete set null;

create or replace function validate_settlement_date() returns trigger language plpgsql set search_path=public as $$begin
 if new.status='pending' then new.settled_on:=null;end if;
 if new.settled_on is not null then
  if new.type not in ('income','expense') or new.group_id is not null or new.linked_income_id is not null or new.settled_on>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Informe uma data efetiva de pagamento/recebimento até hoje';end if;
  if not exists(select 1 from financial_accounts where id=new.account_id and user_id=new.user_id and kind in ('bank','cash')) then raise exception 'Data de pagamento exige uma conta de movimentação de sua titularidade';end if;
 end if;return new;
end $$;
drop trigger if exists transaction_settlement_date on transactions;
create trigger transaction_settlement_date before insert or update on transactions for each row execute function validate_settlement_date();
create or replace view account_balances with (security_invoker=true) as select a.*,
 (a.initial_balance+coalesce(sum(t.amount) filter(where t.status='confirmed' and coalesce(t.settled_on,t.date)<=(now() at time zone 'America/Sao_Paulo')::date),0))::text balance
 from financial_accounts a left join transactions t on t.account_id=a.id group by a.id;

create or replace function validate_financial_preferences() returns trigger language plpgsql set search_path=public as $$declare category_key uuid;begin
 if new.default_account_id is not null and not exists(select 1 from financial_accounts where id=new.default_account_id and user_id=new.user_id and kind in ('bank','cash') and not archived) then raise exception 'Selecione uma conta padrão ativa de sua titularidade';end if;
 foreach category_key in array array[new.default_expense_category_id,new.default_income_category_id] loop
  if category_key is not null and not exists(select 1 from categories where id=category_key and user_id=new.user_id and not archived and merged_into_id is null) then raise exception 'Selecione uma categoria padrão ativa de sua titularidade';end if;
 end loop;return new;
end $$;
drop trigger if exists financial_preferences_integrity on user_settings;
create trigger financial_preferences_integrity before insert or update on user_settings for each row execute function validate_financial_preferences();

-- Upgrade only the exact bank-reconciliation query and the two recurrence paid
-- guards. Never replace unqualified date clauses in investment/savings queries.
do $upgrade$ declare f record;definition text;old_query text:='from transactions where account_id=y and user_id=u and status=''confirmed'' and date<=dt';begin
 for f in select oid from pg_proc where pronamespace='public'::regnamespace and prokind='f' and position(old_query in prosrc)>0 loop
  definition:=pg_get_functiondef(f.oid);definition:=replace(definition,old_query,'from transactions where account_id=y and user_id=u and status=''confirmed'' and coalesce(settled_on,date)<=dt');execute definition;
 end loop;
 definition:=pg_get_functiondef('revise_recurring_occurrence(uuid,date,text,jsonb,boolean,uuid)'::regprocedure);
 definition:=replace(definition,'existing.date<=today','coalesce(existing.settled_on,existing.date)<=today');
 definition:=replace(definition,'t.date<=today','coalesce(t.settled_on,t.date)<=today');execute definition;
 definition:=pg_get_functiondef('import_classified_transactions(jsonb)'::regprocedure);
 definition:=replace(definition,'status=''confirmed'' and date=dt and amount=val','status=''confirmed'' and (date=dt or settled_on=dt) and amount=val');execute definition;
end $upgrade$;

do $$begin
 if to_regprocedure('public.revise_transaction_before_settlement(uuid,jsonb,boolean)') is null then alter function revise_transaction(uuid,jsonb,boolean) rename to revise_transaction_before_settlement;end if;
 if to_regprocedure('public.execute_operation_before_settlement(text,jsonb,uuid)') is null then alter function execute_operation(text,jsonb,uuid) rename to execute_operation_before_settlement;end if;
end $$;
-- Function bodies use qualified parameter names; renaming a function does not
-- rewrite those textual references in PL/pgSQL.
do $$declare n text;f regprocedure;definition text;begin
 foreach n in array array['revise_transaction','execute_operation'] loop
  f:=case when n='revise_transaction' then 'revise_transaction_before_settlement(uuid,jsonb,boolean)'::regprocedure else 'execute_operation_before_settlement(text,jsonb,uuid)'::regprocedure end;
  definition:=pg_get_functiondef(f);
  definition:=replace(definition,n||'.',n||'_before_settlement.');execute definition;
 end loop;
end $$;
revoke all on function revise_transaction_before_settlement(uuid,jsonb,boolean) from public,anon,authenticated,service_role;
revoke all on function execute_operation_before_settlement(text,jsonb,uuid) from public,anon,authenticated,service_role;
create or replace function revise_transaction(transaction_id uuid,replacement jsonb,cancel boolean default false) returns uuid
language plpgsql security definer set search_path=public as $$declare result_id uuid;begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if not cancel and replacement->>'type' not in ('income','expense') then
  update transactions set settled_on=null where id=transaction_id and user_id=auth.uid();
 end if;
 result_id:=revise_transaction_before_settlement(transaction_id,replacement,cancel);
 if not cancel and replacement ? 'settled_on' then update transactions set settled_on=nullif(replacement->>'settled_on','')::date where id=result_id and user_id=auth.uid();end if;
 return result_id;
end $$;
revoke all on function revise_transaction(uuid,jsonb,boolean) from public,anon;
grant execute on function revise_transaction(uuid,jsonb,boolean) to authenticated;
create or replace function execute_operation(action text,payload jsonb,request_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$declare result jsonb;replayed boolean;begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select exists(select 1 from operation_requests r where r.user_id=auth.uid() and r.request_id=execute_operation.request_id) into replayed;
 result:=execute_operation_before_settlement(action,payload,request_id);
 if not replayed and action='transaction' and payload ? 'settled_on' then update transactions set settled_on=nullif(payload->>'settled_on','')::date where id=(result->>'id')::uuid and user_id=auth.uid();end if;
 return result;
end $$;
revoke all on function execute_operation(text,jsonb,uuid) from public,anon;
grant execute on function execute_operation(text,jsonb,uuid) to authenticated;

create or replace function settle_financial_entry(transaction_id uuid,recurrence_id uuid,occurrence_date date,obligation_id uuid,account_id uuid,settled_on date,request_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();today date:=(now() at time zone 'America/Sao_Paulo')::date;t transactions;r recurring_transactions;o financial_obligations;
 key text;fingerprint text;prior operation_requests;result_id uuid;result jsonb;
begin
 if u is null or request_id is null or settled_on is null or settled_on>today or num_nonnulls(transaction_id,recurrence_id,obligation_id)<>1 then raise exception 'Informe uma conta a pagar/receber e uma data efetiva até hoje';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('transaction',transaction_id,'recurrence',recurrence_id,'occurrence',occurrence_date,'obligation',obligation_id,'account',account_id,'paid',settled_on)::text,'UTF8')),'hex');
 select * into prior from operation_requests p where p.user_id=u and p.request_id=settle_financial_entry.request_id;
 if found then
  if prior.action<>'settle_financial_entry' or prior.payload_hash<>fingerprint or prior.result is null then raise exception 'Chave reutilizada com dados diferentes';end if;
  return (prior.result->>'id')::uuid;
 end if;
 perform financial_cash_account(account_id);
 if obligation_id is not null then
  select * into strict o from financial_obligations where id=obligation_id and user_id=u and status='pending' for update;
  if o.transaction_id is not null and exists(select 1 from transactions where id=o.transaction_id and user_id=u and status<>'cancelled') then raise exception 'Compromisso já vinculado a um lançamento; confira a transação para não duplicar o pagamento';end if;
  result:=execute_operation('pay_obligation',jsonb_build_object('obligation_id',o.id,'account_id',account_id,'date',settled_on,'principal_reduction','0'),gen_random_uuid());result_id:=(result->>'id')::uuid;
  update transactions set date=o.due_date,settled_on=settle_financial_entry.settled_on where id=result_id and user_id=u;
 else
  if recurrence_id is not null then
   if occurrence_date is null then raise exception 'Informe a ocorrência da recorrência';end if;
   select * into strict r from recurring_transactions where id=recurrence_id and user_id=u and type='expense' for update;
   key:='recurrence:'||r.id||':'||occurrence_date;
   select * into t from transactions where user_id=u and source_id=key for update;
   if t.id is null then
    result_id:=revise_recurring_occurrence(r.id,occurrence_date,'occurrence',jsonb_build_object('account_id',account_id,'category_id',r.category_id,'description',r.description,'amount',r.amount::text,'date',occurrence_date),false,gen_random_uuid());
   else result_id:=t.id;end if;
  else result_id:=transaction_id;end if;
  select * into strict t from transactions where id=result_id and user_id=u for update;
  if t.type not in ('income','expense') or t.group_id is not null or t.linked_income_id is not null or t.status='cancelled' then raise exception 'Use a operação vinculada para confirmar este movimento';end if;
  if t.status='confirmed' and coalesce(t.settled_on,t.date)<=today then raise exception 'Lançamento já pago ou recebido';end if;
  insert into financial_integrity_revisions(user_id,entity,entity_id,previous,reason) values(u,'transactions',t.id,to_jsonb(t),'Pagamento/recebimento confirmado; vencimento original preservado');
  update transactions set account_id=settle_financial_entry.account_id,status='confirmed',settled_on=settle_financial_entry.settled_on where id=t.id and user_id=u;
  update financial_integrity_revisions set next=(select to_jsonb(x) from transactions x where x.id=t.id) where user_id=u and entity='transactions' and entity_id=t.id and next is null;
 end if;
 insert into operation_requests(user_id,request_id,action,payload_hash,result) values(u,request_id,'settle_financial_entry',fingerprint,jsonb_build_object('id',result_id));return result_id;
end $$;
revoke all on function settle_financial_entry(uuid,uuid,date,uuid,uuid,date,uuid) from public,anon;
grant execute on function settle_financial_entry(uuid,uuid,date,uuid,uuid,date,uuid) to authenticated;

create table if not exists economic_indicator_cache (
 indicator text primary key check(indicator in ('selic','ipca','usd')),value numeric(20,8) not null check(value::text not in ('NaN','Infinity','-Infinity')),
 reference text not null,source text not null,url text not null,fetched_at timestamptz not null default now()
);
alter table economic_indicator_cache enable row level security;
drop policy if exists economic_cache_read on economic_indicator_cache;
create policy economic_cache_read on economic_indicator_cache for select to authenticated using(true);
revoke all on economic_indicator_cache from anon,authenticated;
grant select on economic_indicator_cache to authenticated;
grant all on economic_indicator_cache to service_role;
notify pgrst,'reload schema';
