-- Scoped recurrence edits reuse ledger source keys: saved/cancelled occurrences
-- replace projections. Splitting a series never rewrites earlier months.
alter table recurring_transactions add column if not exists series_id uuid references recurring_transactions(id) on delete set null;
create index if not exists recurring_series_idx on recurring_transactions(user_id,series_id);

create or replace function validate_recurring_series() returns trigger language plpgsql set search_path=public as $$begin
 if new.series_id is not null and not exists(select 1 from recurring_transactions r where r.id=new.series_id and r.user_id=new.user_id and r.series_id is null) then raise exception 'Série de recorrência inválida';end if;
 return new;
end $$;
drop trigger if exists recurring_series_integrity on recurring_transactions;
create trigger recurring_series_integrity before insert or update of series_id,user_id on recurring_transactions for each row execute function validate_recurring_series();

create or replace function revise_recurring_occurrence(recurrence_id uuid,occurrence_date date,scope text,replacement jsonb,cancel boolean,request_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();today date:=(now() at time zone 'America/Sao_Paulo')::date;
 r recurring_transactions;segment recurring_transactions;t transactions;existing transactions;new_id uuid;root_id uuid;result_id uuid;
 key text;fingerprint text;prior operation_requests;val numeric;account uuid;category uuid;description text;due date;last_date date;nominal date;valid boolean;
begin
 if u is null or request_id is null or occurrence_date is null or scope is null or scope not in ('occurrence','future') or cancel is null then raise exception 'Solicitação inválida';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('recurrence',recurrence_id,'date',occurrence_date,'scope',scope,'replacement',replacement,'cancel',cancel)::text,'UTF8')),'hex');
 select * into prior from operation_requests p where p.user_id=u and p.request_id=revise_recurring_occurrence.request_id;
 if found then
  if prior.action<>'revise_recurring_occurrence' or prior.payload_hash<>fingerprint or prior.result is null then raise exception 'Chave de operação reutilizada com dados diferentes';end if;
  return (prior.result->>'id')::uuid;
 end if;
 select * into strict r from recurring_transactions where id=recurrence_id and user_id=u for update;
 if r.type<>'expense' then raise exception 'Selecione uma despesa recorrente';end if;
 key:='recurrence:'||r.id||':'||occurrence_date;
 select * into existing from transactions where user_id=u and source_id=key for update;
 if existing.id is not null then
  if existing.type<>'expense' or existing.status='cancelled' or (existing.status='confirmed' and existing.date<=today) then raise exception 'Ocorrência já paga ou excluída; confira o histórico de transações';end if;
  if scope='future' and date_trunc('month',existing.date)<>date_trunc('month',occurrence_date) then raise exception 'Esta ocorrência foi transferida de mês; ajuste somente esta ocorrência para preservar os outros meses';end if;
 else
  valid:=r.active and r.cancelled_at is null and occurrence_date>=r.next_date and (r.end_date is null or occurrence_date<=r.end_date);
  if r.frequency='weekly' then valid:=valid and (occurrence_date-r.next_date)%7=0;
  else
   valid:=valid and extract(day from occurrence_date)::int=least(r.anchor_day,extract(day from date_trunc('month',occurrence_date)+interval '1 month - 1 day')::int);
   if r.frequency='annual' then valid:=valid and extract(month from occurrence_date)::int=r.anchor_month;end if;
  end if;
  if not coalesce(valid,false) then raise exception 'A data não corresponde a uma ocorrência ativa';end if;
 end if;
 if not cancel then
  if replacement is null or jsonb_typeof(replacement)<>'object' then raise exception 'Informe os dados da despesa';end if;
  val:=financial_money(replacement->>'amount',false);account:=(replacement->>'account_id')::uuid;category:=nullif(replacement->>'category_id','')::uuid;
  description:=btrim(replacement->>'description');due:=(replacement->>'date')::date;
  perform financial_cash_account(account);
  if category is not null then perform financial_owned('categories',category);end if;
  if nullif(description,'') is null or length(description)>200 or due is null or date_trunc('month',due)<>date_trunc('month',coalesce(existing.date,occurrence_date)) then raise exception 'Informe descrição e vencimento dentro do mês selecionado';end if;
  if scope='future' and due<>occurrence_date then raise exception 'Para ajustar um vencimento isolado, selecione somente este mês';end if;
 end if;
 if scope='occurrence' then
  if existing.id is not null then
   if cancel then result_id:=revise_transaction(existing.id,'{}',true);
   else result_id:=revise_transaction(existing.id,jsonb_build_object('account_id',account,'category_id',category,'description',description,'type','expense','amount',val::text,'date',due,'status',existing.status,'notes',existing.notes),false);end if;
  else
   insert into transactions(user_id,account_id,category_id,description,type,amount,date,status,source_id)
   values(u,case when cancel then r.account_id else account end,case when cancel then r.category_id else category end,case when cancel then r.description else description end,'expense',-case when cancel then r.amount else val end,case when cancel then occurrence_date else due end,case when cancel then 'cancelled' else 'pending' end,key) returning id into result_id;
  end if;
 else
  root_id:=coalesce(r.series_id,r.id);
  -- All later segments of this family are replaced, including previously split ones.
  select case when bool_or(x.end_date is null) then null else max(x.end_date) end into last_date from recurring_transactions x where x.user_id=u and (x.id=root_id or x.series_id=root_id) and x.cancelled_at is null and (x.end_date is null or x.end_date>=occurrence_date);
  for segment in select * from recurring_transactions x where x.user_id=u and (x.id=root_id or x.series_id=root_id) and x.cancelled_at is null and (x.end_date is null or x.end_date>=occurrence_date) for update loop
   insert into financial_integrity_revisions(user_id,entity,entity_id,previous,reason) values(u,'recurring_transactions',segment.id,to_jsonb(segment),'Alteração explícita desta ocorrência em diante; meses anteriores preservados');
   if segment.start_date>=occurrence_date then
    update recurring_transactions set active=false,cancelled_at=clock_timestamp() where id=segment.id and user_id=u;
   else
    update recurring_transactions set end_date=occurrence_date-1 where id=segment.id and user_id=u;
   end if;
   update financial_integrity_revisions set next=(select to_jsonb(x) from recurring_transactions x where x.id=segment.id) where entity='recurring_transactions' and entity_id=segment.id and user_id=u and next is null;
  end loop;
  if not cancel then
   insert into recurring_transactions(user_id,series_id,account_id,category_id,description,type,amount,next_date,frequency,active,start_date,end_date,anchor_day,anchor_month)
   values(u,root_id,account,category,description,'expense',val,occurrence_date,r.frequency,true,occurrence_date,last_date,r.anchor_day,r.anchor_month) returning id into new_id;
  end if;
  for t in select x.* from transactions x join recurring_transactions parent on x.source_id like 'recurrence:'||parent.id||':%' and parent.user_id=u
   where x.user_id=u and (parent.id=root_id or parent.series_id=root_id) and x.source_id ~ '^recurrence:[0-9a-f-]{36}:[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   and right(x.source_id,10)::date>=occurrence_date for update of x loop
   nominal:=right(t.source_id,10)::date;
   -- Settled amounts and cancelled exceptions remain intact; source linkage alone
   -- moves to the replacement segment so generation cannot duplicate them.
   if t.status<>'cancelled' and not(t.status='confirmed' and t.date<=today) then
    if cancel then perform revise_transaction(t.id,'{}',true);
    else perform revise_transaction(t.id,jsonb_build_object('account_id',account,'category_id',category,'description',description,'type','expense','amount',val::text,'date',t.date,'status',t.status,'notes',t.notes),false);end if;
   end if;
   if new_id is not null then update transactions set source_id='recurrence:'||new_id||':'||nominal where id=t.id and user_id=u;end if;
  end loop;
  result_id:=coalesce(new_id,r.id);
  -- Due dates use the existing idempotent generator. Future entries remain projections.
  if not cancel then perform generate_recurring_for(u,today);end if;
 end if;
 insert into operation_requests(user_id,request_id,action,payload_hash,result) values(u,request_id,'revise_recurring_occurrence',fingerprint,jsonb_build_object('id',result_id));
 return result_id;
end $$;
revoke all on function revise_recurring_occurrence(uuid,date,text,jsonb,boolean,uuid) from public,anon;
grant execute on function revise_recurring_occurrence(uuid,date,text,jsonb,boolean,uuid) to authenticated;
notify pgrst,'reload schema';
