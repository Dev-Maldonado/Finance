-- Explicit, audited removal. Tombstones keep occurrence keys so generation can
-- never resurrect a removed occurrence. Existing rows and balances are unchanged.
alter table recurring_transactions add column if not exists deleted_at timestamptz;
alter table transactions add column if not exists deleted_at timestamptz;

create or replace function remove_recurring_records(recurrence_id uuid,transaction_id uuid,include_history boolean,request_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();r recurring_transactions;t transactions;target uuid;fingerprint text;prior operation_requests;revision_id uuid;
begin
 if u is null or request_id is null or include_history is null or (recurrence_id is null)=(transaction_id is null) then raise exception 'Selecione uma recorrência ou uma ocorrência';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('recurrence_id',recurrence_id,'transaction_id',transaction_id,'include_history',include_history)::text,'UTF8')),'hex');
 select * into prior from operation_requests p where p.user_id=u and p.request_id=remove_recurring_records.request_id;
 if found then
  if prior.action<>'remove_recurring_records' or prior.payload_hash<>fingerprint or prior.result is null then raise exception 'Chave de operação reutilizada com dados diferentes';end if;
  return (prior.result->>'id')::uuid;
 end if;
 if recurrence_id is not null then
  select * into strict r from recurring_transactions where id=recurrence_id and user_id=u for update;
  target:=r.id;
  if r.deleted_at is null then
   insert into financial_integrity_revisions(user_id,entity,entity_id,previous,reason) values(u,'recurring_transactions',r.id,to_jsonb(r),'Exclusão explícita do cadastro recorrente; lançamentos somente com opção de histórico') returning id into revision_id;
   update recurring_transactions set active=false,cancelled_at=coalesce(cancelled_at,clock_timestamp()),deleted_at=clock_timestamp() where id=r.id and user_id=u;
   update financial_integrity_revisions set next=(select to_jsonb(x) from recurring_transactions x where x.id=r.id) where id=revision_id and user_id=u;
  end if;
 else
  select * into strict t from transactions where id=transaction_id and user_id=u for update;
  if t.source_id is null or t.source_id !~ '^recurrence:[0-9a-f-]{36}:[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Selecione um lançamento recorrente';end if;
  select * into strict r from recurring_transactions where id=split_part(t.source_id,':',2)::uuid and user_id=u;
  target:=t.id;
 end if;
 for t in select x.* from transactions x where x.user_id=u and x.deleted_at is null and
  ((transaction_id is not null and x.id=transaction_id) or (recurrence_id is not null and include_history and x.source_id ~ ('^recurrence:'||r.id||':[0-9]{4}-[0-9]{2}-[0-9]{2}$'))) for update loop
  if t.type not in ('income','expense') or t.group_id is not null or t.linked_income_id is not null then raise exception 'Movimento vinculado exige correção na origem';end if;
  insert into financial_integrity_revisions(user_id,entity,entity_id,previous,reason) values(u,'transactions',t.id,to_jsonb(t),'Exclusão explícita do histórico recorrente; saldo e indicadores recalculados') returning id into revision_id;
  update transactions set status='cancelled',deleted_at=clock_timestamp() where id=t.id and user_id=u;
  update financial_integrity_revisions set next=(select to_jsonb(x) from transactions x where x.id=t.id) where id=revision_id and user_id=u;
 end loop;
 insert into operation_requests(user_id,request_id,action,payload_hash,result) values(u,request_id,'remove_recurring_records',fingerprint,jsonb_build_object('id',target));
 return target;
end $$;
revoke all on function remove_recurring_records(uuid,uuid,boolean,uuid) from public,anon;
grant execute on function remove_recurring_records(uuid,uuid,boolean,uuid) to authenticated;
notify pgrst,'reload schema';
