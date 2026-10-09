-- Preserve every historical category ID and financial entry while adding two-level
-- classification, anchored forecasts and corrections to future card installments.
alter table categories add column if not exists merged_into_id uuid;
alter table categories add column if not exists archived boolean not null default false;
do $$begin
 if not exists(select 1 from pg_constraint where conname='category_alias_owner') then
  alter table categories add constraint category_alias_owner foreign key(merged_into_id,user_id) references categories(id,user_id);
 end if;
end $$;
drop trigger if exists category_tree on categories;

-- A corrupt cycle is not a classification decision: stop rather than infer a parent.
do $$begin
 if exists(with recursive ancestors as (
  select id origin,id,parent_id,user_id,array[id] visited,false cycle from categories
  union all select a.origin,c.id,c.parent_id,c.user_id,a.visited||c.id,c.id=any(a.visited)
  from ancestors a join categories c on c.id=a.parent_id and c.user_id=a.user_id where not a.cycle
 ) select 1 from ancestors where cycle) then raise exception 'Há uma hierarquia circular de categorias; revise os vínculos antes da migração';end if;
end $$;
with recursive ancestors as (
 select id origin,id,parent_id,user_id,0 depth from categories
 union all select a.origin,c.id,c.parent_id,c.user_id,a.depth+1 from ancestors a join categories c on c.id=a.parent_id and c.user_id=a.user_id
), corrections as (
 select c.id,c.user_id,c.parent_id old_parent,a.id new_parent,to_jsonb(c) previous
 from categories c join ancestors a on a.origin=c.id and a.parent_id is null
 where c.parent_id is not null and c.parent_id<>a.id
), audited as (
 insert into financial_integrity_revisions(user_id,entity,entity_id,previous,next,reason)
 select user_id,'categories',id,previous,previous||jsonb_build_object('parent_id',new_parent),'Adequação de hierarquia explícita a dois níveis; IDs e lançamentos preservados' from corrections returning entity_id
) update categories c set parent_id=x.new_parent from corrections x where c.id=x.id and exists(select 1 from audited where entity_id=c.id);

-- Equivalent legacy siblings become aliases. Their references and original labels
-- remain in place; applications resolve merged_into_id for display and grouping.
do $$declare c record;target uuid;begin
 for c in select * from categories where parent_id is null and merged_into_id is null and not archived order by user_id,lower(btrim(name)),id loop
  select id into target from categories where user_id=c.user_id and parent_id is null and lower(btrim(name))=lower(btrim(c.name)) and merged_into_id is null and not archived order by id limit 1;
  if c.id<>target then
   insert into financial_integrity_revisions(user_id,entity,entity_id,previous,next,reason) values(c.user_id,'categories',c.id,to_jsonb(c),to_jsonb(c)||jsonb_build_object('merged_into_id',target),'Alias de categoria legada equivalente, sem substituir IDs financeiros');
   update categories set merged_into_id=target where id=c.id;
  end if;
 end loop;
 for c in select ch.*,p.merged_into_id new_parent from categories ch join categories p on p.id=ch.parent_id where p.merged_into_id is not null loop
  insert into financial_integrity_revisions(user_id,entity,entity_id,previous,next,reason) values(c.user_id,'categories',c.id,to_jsonb(c)-'new_parent',(to_jsonb(c)-'new_parent')||jsonb_build_object('parent_id',c.new_parent),'Vínculo ao pai canônico equivalente; ID e histórico preservados');
  update categories set parent_id=c.new_parent where id=c.id;
 end loop;
 for c in select * from categories where parent_id is not null and merged_into_id is null and not archived order by user_id,parent_id,lower(btrim(name)),id loop
  select id into target from categories where user_id=c.user_id and parent_id=c.parent_id and lower(btrim(name))=lower(btrim(c.name)) and merged_into_id is null and not archived order by id limit 1;
  if c.id<>target then
   insert into financial_integrity_revisions(user_id,entity,entity_id,previous,next,reason) values(c.user_id,'categories',c.id,to_jsonb(c),to_jsonb(c)||jsonb_build_object('merged_into_id',target),'Alias de subcategoria legada equivalente, sem substituir IDs financeiros');
   update categories set merged_into_id=target where id=c.id;
  end if;
 end loop;
end $$;
create unique index if not exists category_active_sibling_name on categories(user_id,coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(btrim(name))) where merged_into_id is null and not archived;

create or replace function validate_category_tree() returns trigger language plpgsql security definer set search_path=public as $$
declare p categories;begin
 if btrim(new.name)='' or length(new.name)>200 then raise exception 'Nome de categoria inválido';end if;
 if TG_OP='UPDATE' and new.user_id<>old.user_id then raise exception 'O proprietário da categoria não pode mudar';end if;
 if coalesce(auth.role(),'')='authenticated' then
  if (TG_OP='INSERT' and new.merged_into_id is not null) or (TG_OP='UPDATE' and new.merged_into_id is distinct from old.merged_into_id) then raise exception 'Aliases históricos não podem ser alterados';end if;
  if TG_OP='UPDATE' and old.merged_into_id is not null and (new.name is distinct from old.name or new.parent_id is distinct from old.parent_id or new.budget is distinct from old.budget or new.spending_kind is distinct from old.spending_kind) then raise exception 'Aliases históricos não podem ser alterados';end if;
 end if;
 if new.id=new.parent_id or new.id=new.merged_into_id then raise exception 'Hierarquia circular de categorias';end if;
 if new.parent_id is not null then
  select * into strict p from categories where id=new.parent_id and user_id=new.user_id;
  if p.parent_id is not null or p.merged_into_id is not null then raise exception 'Subcategorias devem pertencer diretamente a uma categoria principal';end if;
  if p.archived and not new.archived then raise exception 'Selecione uma categoria principal ativa';end if;
  if exists(select 1 from categories where parent_id=new.id) then raise exception 'Uma categoria com subcategorias não pode tornar-se subcategoria';end if;
 end if;
 if TG_OP='UPDATE' and new.archived and not old.archived and exists(select 1 from categories where parent_id=new.id and not archived) then raise exception 'Arquive a categoria e suas subcategorias pela operação de gerenciamento';end if;
 return new;
end $$;
create trigger category_tree before insert or update on categories for each row execute function validate_category_tree();
revoke delete on categories from authenticated;
create or replace function archive_category(category_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare c categories;begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into strict c from categories where id=archive_category.category_id and user_id=auth.uid() for update;
 if c.merged_into_id is not null then raise exception 'Selecione a categoria canônica';end if;
 insert into financial_integrity_revisions(user_id,entity,entity_id,previous,next,reason)
 select user_id,'categories',id,to_jsonb(t),to_jsonb(t)||jsonb_build_object('archived',true),'Categoria arquivada; lançamentos e classificação histórica preservados'
 from categories t where (id=c.id or parent_id=c.id) and user_id=auth.uid() and not archived;
 update categories set archived=true where parent_id=c.id and user_id=auth.uid();
 update categories set archived=true where id=c.id and user_id=auth.uid();
 return c.id;
end $$;
revoke all on function archive_category(uuid) from public,anon;
grant execute on function archive_category(uuid) to authenticated;

alter table recurring_transactions add column if not exists start_date date;
alter table recurring_transactions add column if not exists anchor_month int;
alter table recurring_transactions add column if not exists cancelled_at timestamptz;
drop trigger if exists recurrence_anchor on recurring_transactions;
update recurring_transactions set start_date=coalesce(start_date,next_date),anchor_month=coalesce(anchor_month,extract(month from next_date)::int);
alter table recurring_transactions alter column start_date set not null;
alter table recurring_transactions drop constraint if exists recurring_transactions_frequency_check;
alter table recurring_transactions add constraint recurring_transactions_frequency_check check(frequency in ('weekly','monthly','annual'));
do $$begin
 if not exists(select 1 from pg_constraint where conname='recurrence_anchor_month_check') then alter table recurring_transactions add constraint recurrence_anchor_month_check check(anchor_month between 1 and 12);end if;
end $$;
create or replace function recurrence_anchor() returns trigger language plpgsql set search_path=public as $$begin
 if TG_OP='INSERT' or new.account_id is distinct from old.account_id then
  if not exists(select 1 from financial_accounts where id=new.account_id and user_id=new.user_id and kind in ('bank','cash') and not archived) then raise exception 'Selecione uma conta disponível para a recorrência';end if;
 end if;
 if TG_OP='INSERT' then
  new.start_date:=coalesce(new.start_date,new.next_date);new.anchor_day:=coalesce(new.anchor_day,extract(day from new.next_date)::int);new.anchor_month:=coalesce(new.anchor_month,extract(month from new.next_date)::int);
 elsif new.next_date is distinct from old.next_date and current_user='authenticated' then
  new.anchor_day:=extract(day from new.next_date)::int;new.anchor_month:=extract(month from new.next_date)::int;
 end if;
 if new.end_date is not null and new.end_date<new.start_date then raise exception 'O término deve ser igual ou posterior ao início';end if;
 if new.next_date<new.start_date then raise exception 'O próximo lançamento não pode anteceder o início';end if;
 if TG_OP='UPDATE' and old.cancelled_at is not null and (new.active or new.cancelled_at is distinct from old.cancelled_at) then raise exception 'Recorrência cancelada preservada; crie uma nova série';end if;
 if new.cancelled_at is not null then new.active:=false;end if;
 return new;
end $$;
create trigger recurrence_anchor before insert or update on recurring_transactions for each row execute function recurrence_anchor();
revoke delete on recurring_transactions from authenticated;

create or replace function recurrence_next_date(d date,frequency text,anchor_day int,anchor_month int) returns date language plpgsql immutable set search_path=public as $$
declare m date;begin
 if frequency='weekly' then return d+7;end if;
 if frequency='annual' then m:=make_date(extract(year from d)::int+1,anchor_month,1);
 elsif frequency='monthly' then m:=(date_trunc('month',d)+interval '1 month')::date;
 else raise exception 'Frequência inválida';end if;
 return make_date(extract(year from m)::int,extract(month from m)::int,least(anchor_day,extract(day from m+interval '1 month'-interval '1 day')::int));
end $$;
revoke all on function recurrence_next_date(date,text,int,int) from public,anon,authenticated,service_role;

create or replace function revise_recurring(recurrence_id uuid,replacement jsonb,cancel boolean default false) returns uuid language plpgsql security definer set search_path=public as $$
declare r recurring_transactions;n recurring_transactions;today date:=(now() at time zone 'America/Sao_Paulo')::date;steps int:=0;explicit_date_change boolean;begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into strict r from recurring_transactions where id=revise_recurring.recurrence_id and user_id=auth.uid() for update;
 if r.cancelled_at is not null then raise exception 'Recorrência já cancelada';end if;
 insert into financial_integrity_revisions(user_id,entity,entity_id,previous,reason) values(auth.uid(),'recurring_transactions',r.id,to_jsonb(r),case when cancel then 'Cancelamento da série; histórico financeiro preservado' else 'Edição/pausa da série; lançamentos existentes preservados' end);
 if cancel then
  update recurring_transactions set active=false,cancelled_at=clock_timestamp() where id=r.id and user_id=auth.uid();
  update transactions set status='cancelled' where user_id=auth.uid() and status='pending' and date>today and source_id like 'recurrence:'||r.id||':%';
 else
  if jsonb_typeof(replacement)<>'object' or replacement ?| array['id','user_id','cancelled_at'] then raise exception 'Dados da recorrência inválidos';end if;
  n:=jsonb_populate_record(r,replacement);
  n.start_date:=coalesce(n.start_date,r.start_date);
  explicit_date_change:=n.next_date is distinct from r.next_date;
  perform financial_owned('financial_accounts',n.account_id);
  if n.category_id is not null then perform financial_owned('categories',n.category_id);end if;
  if n.amount is null or n.amount<=0 or n.amount<>round(n.amount,2) or n.amount>999999999999.99 or nullif(btrim(n.description),'') is null or length(n.description)>200 or n.frequency not in ('weekly','monthly','annual') or n.type not in ('income','expense') then raise exception 'Dados da recorrência inválidos';end if;
  if explicit_date_change or n.frequency is distinct from r.frequency then n.anchor_day:=extract(day from n.next_date)::int;n.anchor_month:=extract(month from n.next_date)::int;end if;
  -- Resume skips the paused interval. A deliberate edited date still allows the
  -- owner to backfill a correction; no already-generated entry is rewritten.
  if not r.active and n.active and not explicit_date_change then
   while n.next_date<today loop
    n.next_date:=recurrence_next_date(n.next_date,n.frequency,n.anchor_day,n.anchor_month);steps:=steps+1;
    if steps>10000 then raise exception 'Agenda antiga demais; selecione a próxima data explicitamente';end if;
   end loop;
  end if;
  update recurring_transactions set account_id=n.account_id,category_id=n.category_id,description=n.description,type=n.type,amount=n.amount,next_date=n.next_date,frequency=n.frequency,active=n.active,end_date=n.end_date,start_date=n.start_date,anchor_day=n.anchor_day,anchor_month=n.anchor_month where id=r.id and user_id=auth.uid();
 end if;
 update financial_integrity_revisions set next=(select to_jsonb(t) from recurring_transactions t where t.id=r.id) where entity='recurring_transactions' and entity_id=r.id and user_id=auth.uid() and next is null;
 return r.id;
end $$;
revoke all on function revise_recurring(uuid,jsonb,boolean) from public,anon;
grant execute on function revise_recurring(uuid,jsonb,boolean) to authenticated;

create or replace function generate_recurring_for(owner_id uuid,until_date date) returns int language plpgsql security definer set search_path=public as $$
declare r recurring_transactions;d date;n int:=0;inserted int;begin
 if owner_id is null or until_date is null or until_date>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Gere apenas até hoje';end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text,0));
 for r in select * from recurring_transactions where user_id=owner_id and active and cancelled_at is null and next_date<=until_date and (end_date is null or next_date<=end_date)
 and exists(select 1 from financial_accounts where id=recurring_transactions.account_id and user_id=owner_id and kind in ('bank','cash') and not archived) for update loop
  d:=r.next_date;
  while d<=until_date and (r.end_date is null or d<=r.end_date) loop
   insert into transactions(user_id,account_id,category_id,description,type,amount,date,status,source_id)
   values(r.user_id,r.account_id,r.category_id,r.description,r.type,case when r.type='expense' then -r.amount else r.amount end,d,'pending','recurrence:'||r.id||':'||d) on conflict(user_id,source_id) do nothing;
   get diagnostics inserted=row_count;n:=n+inserted;
   d:=recurrence_next_date(d,r.frequency,r.anchor_day,r.anchor_month);
   if n>5000 then raise exception 'Limite de recorrências excedido';end if;
  end loop;
  update recurring_transactions set next_date=d,anchor_day=r.anchor_day,anchor_month=r.anchor_month where id=r.id and user_id=owner_id;
 end loop;return n;
end $$;
revoke all on function generate_recurring_for(uuid,date) from public,anon,authenticated,service_role;
create or replace function generate_recurring(until_date date) returns int language plpgsql security definer set search_path=public as $$begin
 if auth.uid() is null then raise exception 'Authentication required';end if;return generate_recurring_for(auth.uid(),until_date);
end $$;
revoke all on function generate_recurring(date) from public,anon;
grant execute on function generate_recurring(date) to authenticated;
create or replace function generate_all_recurring(until_date date) returns jsonb language plpgsql security definer set search_path=public set statement_timeout='8s' as $$
declare u uuid;n int:=0;users int:=0;begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'A execução global exige acesso de serviço';end if;
 for u in select distinct user_id from recurring_transactions where active and cancelled_at is null and next_date<=until_date order by user_id limit 500 loop
  n:=n+generate_recurring_for(u,until_date);users:=users+1;
 end loop;return jsonb_build_object('generated',n,'users',users);
end $$;
revoke all on function generate_all_recurring(date) from public,anon,authenticated;
grant execute on function generate_all_recurring(date) to service_role;

create or replace function revise_card_installment(installment_id uuid,replacement jsonb,request_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();i credit_card_installments;p credit_card_purchases;inv credit_card_invoices;c credit_cards;
 val numeric;committed numeric;fingerprint text;prior operation_requests;today date:=(now() at time zone 'America/Sao_Paulo')::date;begin
 if u is null or request_id is null or replacement is null or jsonb_typeof(replacement)<>'object' then raise exception 'Solicitação financeira não autorizada';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('installment_id',installment_id,'replacement',replacement)::text,'UTF8')),'hex');
 select * into prior from operation_requests r where r.user_id=u and r.request_id=revise_card_installment.request_id;
 if found then
  if prior.action<>'revise_card_installment' or prior.payload_hash<>fingerprint or prior.result is null then raise exception 'Chave de operação reutilizada com dados diferentes';end if;
  return (prior.result->>'id')::uuid;
 end if;
 val:=financial_money(replacement->>'amount',false);
 if length(coalesce(replacement->>'notes',''))>2000 then raise exception 'Observação muito longa';end if;
 select * into strict i from credit_card_installments where id=revise_card_installment.installment_id and user_id=u for update;
 select * into strict p from credit_card_purchases where id=i.purchase_id and user_id=u for update;
 select * into strict inv from credit_card_invoices where id=i.invoice_id and user_id=u for update;
 select * into strict c from credit_cards where id=inv.card_id and user_id=u for update;
 if p.status<>'confirmed' or inv.due_date<=today or exists(select 1 from credit_card_payments where invoice_id=inv.id and user_id=u) then raise exception 'Somente parcelas futuras de faturas sem pagamento podem ser ajustadas';end if;
 select coalesce(sum(ci.amount),0)-coalesce((select sum(cp.amount) from credit_card_payments cp join credit_card_invoices v on v.id=cp.invoice_id join transactions t on t.id=cp.transaction_id where v.card_id=c.id and cp.user_id=u and cp.date<=today and t.status='confirmed'),0)
 into committed from credit_card_installments ci join credit_card_invoices v on v.id=ci.invoice_id join credit_card_purchases purchase on purchase.id=ci.purchase_id where v.card_id=c.id and ci.user_id=u and purchase.status='confirmed';
 if committed+val-i.amount>c.credit_limit then raise exception 'Limite insuficiente para o valor corrigido';end if;
 insert into financial_integrity_revisions(user_id,entity,entity_id,previous,next,reason) values(u,'credit_card_installments',i.id,to_jsonb(i),to_jsonb(i)||jsonb_build_object('amount',val,'notes',coalesce(replacement->>'notes','')),'Correção explícita de parcela futura; demais parcelas preservadas');
 update credit_card_installments set amount=val where id=i.id and user_id=u;
 update credit_card_purchases set amount=(select sum(amount) from credit_card_installments where purchase_id=p.id and user_id=u) where id=p.id and user_id=u;
 insert into operation_requests(user_id,request_id,action,payload_hash,result) values(u,request_id,'revise_card_installment',fingerprint,jsonb_build_object('id',i.id,'ok',true));
 return i.id;
end $$;
revoke all on function revise_card_installment(uuid,jsonb,uuid) from public,anon;
grant execute on function revise_card_installment(uuid,jsonb,uuid) to authenticated;

alter table investment_income add column if not exists announced_amount numeric(20,2);
update investment_income set announced_amount=amount where announced_amount is null;
create or replace function preserve_announced_income() returns trigger language plpgsql set search_path=public as $$begin
 if TG_OP='INSERT' then new.announced_amount:=new.amount;
 elsif old.status='announced' and new.status='announced' then new.announced_amount:=new.amount;
 elsif old.announced_amount is not null then new.announced_amount:=old.announced_amount;end if;
 return new;
end $$;
drop trigger if exists income_announced_value on investment_income;
create trigger income_announced_value before insert or update on investment_income for each row execute function preserve_announced_income();

-- Preserve the already validated operation implementation behind a private name.
-- Word boundaries avoid changing execute_operation_core and qualify its local vars.
do $$declare definition text;begin
 if to_regprocedure('public.execute_operation_v18(text,jsonb,uuid)') is null then
  definition:=pg_get_functiondef('public.execute_operation(text,jsonb,uuid)'::regprocedure);
  execute regexp_replace(definition,'\mexecute_operation\M','execute_operation_v18','g');
 end if;
end $$;
revoke all on function execute_operation_v18(text,jsonb,uuid) from public,anon,authenticated,service_role;
create or replace function execute_operation(action text,payload jsonb,request_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();i investment_income;x uuid;val numeric;dt date;fingerprint text;prior operation_requests;result jsonb;begin
 if action is null then raise exception 'Operação financeira inválida';end if;
 if action<>'confirm_income' then
  if action='purchase' and payload->>'entry_method'='installment' then
   val:=financial_money(payload->>'installment_amount',false)*(payload->>'installments')::int;
   if val<>financial_money(payload->>'amount',false) then raise exception 'O total da compra deve corresponder ao valor individual multiplicado pelas parcelas';end if;
  end if;
  return execute_operation_v18(action,payload,request_id);
 end if;
 if u is null or request_id is null or payload is null or jsonb_typeof(payload)<>'object' then raise exception 'Solicitação financeira não autorizada';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 fingerprint:=encode(sha256(convert_to(payload::text,'UTF8')),'hex');
 select * into prior from operation_requests r where r.user_id=u and r.request_id=execute_operation.request_id;
 if found then
  if prior.action is not null and (prior.action<>action or prior.payload_hash<>fingerprint) or prior.result is null then raise exception 'Chave de operação reutilizada com dados diferentes';end if;
  return prior.result;
 end if;
 perform financial_owned('investment_income',(payload->>'income_id')::uuid);perform financial_owned('financial_accounts',(payload->>'account_id')::uuid);
 if not exists(select 1 from financial_accounts where id=(payload->>'account_id')::uuid and user_id=u and kind in ('bank','cash') and not archived) then raise exception 'Selecione uma conta disponível para o recebimento';end if;
 dt:=coalesce((payload->>'date')::date,(now() at time zone 'America/Sao_Paulo')::date);
 if dt>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Esta confirmação financeira não pode ter data futura';end if;
 select * into strict i from investment_income where id=(payload->>'income_id')::uuid and user_id=u and status='announced' for update;
 val:=financial_money(coalesce(nullif(payload->>'received_amount',''),i.amount::text),false);
 insert into financial_integrity_revisions(user_id,entity,entity_id,previous,reason) values(u,'investment_income',i.id,to_jsonb(i),'Confirmação do valor efetivamente recebido, com anúncio original preservado');
 insert into transactions(user_id,account_id,description,type,amount,date,linked_income_id,group_id)
 values(u,(payload->>'account_id')::uuid,'Provento confirmado',case when i.type='amortization' then 'redemption' else 'yield' end,val,dt,i.id,i.id) returning id into x;
 update investment_income set amount=val,status='received',account_id=(payload->>'account_id')::uuid,date=dt,transaction_id=x where id=i.id and user_id=u;
 update financial_integrity_revisions set next=(select to_jsonb(t) from investment_income t where t.id=i.id) where user_id=u and entity='investment_income' and entity_id=i.id and next is null;
 result:=jsonb_build_object('id',x,'ok',true);
 insert into operation_requests(user_id,request_id,action,payload_hash,result) values(u,request_id,action,fingerprint,result);return result;
end $$;
revoke all on function execute_operation(text,jsonb,uuid) from public,anon;
grant execute on function execute_operation(text,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
