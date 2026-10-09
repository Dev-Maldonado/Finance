-- Financial integrity: authenticated readers keep RLS; derived writes use guarded RPCs.
-- This migration is additive and can be rerun. Never infer or overwrite financial balances.
alter table categories add column if not exists spending_kind text not null default 'unclassified' check(spending_kind in ('essential','optional','unclassified'));
alter table savings_goals add column if not exists is_emergency_reserve boolean not null default false;
alter table user_settings add column if not exists emergency_months_target int not null default 6 check(emergency_months_target between 1 and 24);
alter table recurring_transactions add column if not exists end_date date;
alter table investment_operations add column if not exists status text not null default 'confirmed' check(status in ('confirmed','cancelled'));
alter table investment_operations add column if not exists created_at timestamptz not null default clock_timestamp();
alter table savings_lots add column if not exists status text not null default 'confirmed' check(status in ('confirmed','cancelled'));
alter table savings_movements add column if not exists status text not null default 'confirmed' check(status in ('confirmed','cancelled'));
alter table savings_movements add column if not exists created_at timestamptz not null default clock_timestamp();
alter table operation_requests add column if not exists action text;
alter table operation_requests add column if not exists payload_hash text;
alter table transactions add column if not exists linked_income_id uuid;
alter table investment_income add column if not exists transaction_id uuid;
alter table investment_income drop constraint if exists investment_income_status_check;
alter table investment_income add constraint investment_income_status_check check(status in ('announced','received','cancelled'));
alter table savings_movements drop constraint if exists savings_movements_type_check;
alter table savings_movements add constraint savings_movements_type_check check(type in ('deposit','withdrawal','confirmed_yield','withdrawn_yield','tax','yield_reversal'));
alter table credit_cards drop constraint if exists credit_cards_closing_day_check;
alter table credit_cards add constraint credit_cards_closing_day_check check(closing_day between 1 and 31);
alter table credit_cards drop constraint if exists credit_cards_due_day_check;
alter table credit_cards add constraint credit_cards_due_day_check check(due_day between 1 and 31);
create unique index if not exists transactions_id_owner on transactions(id,user_id);
create unique index if not exists investment_income_id_owner on investment_income(id,user_id);
create unique index if not exists investment_income_transaction on investment_income(transaction_id) where transaction_id is not null;
do $$begin
 if not exists(select 1 from pg_constraint where conname='income_cash_owner') then alter table investment_income add constraint income_cash_owner foreign key(transaction_id,user_id) references transactions(id,user_id);end if;
 if not exists(select 1 from pg_constraint where conname='cash_income_owner') then alter table transactions add constraint cash_income_owner foreign key(linked_income_id,user_id) references investment_income(id,user_id);end if;
 if not exists(select 1 from pg_constraint where conname='card_payment_cash_owner') then alter table credit_card_payments add constraint card_payment_cash_owner foreign key(transaction_id,user_id) references transactions(id,user_id);end if;
end $$;

-- Link a legacy receipt only when both sides have exactly one unambiguous match.
with candidates as (
 select i.id income_id,t.id transaction_id,
 count(*) over(partition by i.id) income_matches,count(*) over(partition by t.id) transaction_matches
 from investment_income i join transactions t on t.user_id=i.user_id and t.account_id=i.account_id
 and t.date=i.date and t.amount=i.amount and t.description='Provento confirmado'
 and t.type in ('yield','redemption') and t.status='confirmed'
 where i.status='received' and i.transaction_id is null and t.linked_income_id is null
) update investment_income i set transaction_id=c.transaction_id from candidates c
where i.id=c.income_id and c.income_matches=1 and c.transaction_matches=1;
update transactions t set linked_income_id=i.id,group_id=i.id from investment_income i where i.transaction_id=t.id and t.linked_income_id is null;

create table if not exists financial_integrity_revisions(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users on delete cascade,
 entity text not null,entity_id uuid not null,previous jsonb not null,next jsonb,reason text not null,changed_at timestamptz not null default now());
alter table financial_integrity_revisions enable row level security;
drop policy if exists owner on financial_integrity_revisions;
create policy owner on financial_integrity_revisions for select to authenticated using(user_id=auth.uid());
grant select on financial_integrity_revisions to authenticated;

create table if not exists account_reconciliations(
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users on delete cascade,
 account_id uuid not null,date date not null,confirmed_balance numeric(20,2) not null,registered_balance numeric(20,2) not null,
 difference numeric(20,2) not null,notes text not null default '',transaction_id uuid,created_at timestamptz not null default now(),
 foreign key(account_id,user_id) references financial_accounts(id,user_id),foreign key(transaction_id,user_id) references transactions(id,user_id));
create table if not exists invoice_reconciliations(
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users on delete cascade,
 invoice_id uuid not null,date date not null,confirmed_balance numeric(20,2) not null check(confirmed_balance>=0),registered_balance numeric(20,2) not null,
 difference numeric(20,2) not null,notes text not null default '',created_at timestamptz not null default now(),
 foreign key(invoice_id,user_id) references credit_card_invoices(id,user_id));
alter table savings_reconciliations add column if not exists registered_balance numeric(20,2);
alter table savings_reconciliations add column if not exists difference numeric(20,2);
alter table savings_reconciliations add column if not exists transaction_id uuid references transactions;
create table if not exists financial_obligations(
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users on delete cascade,
 name text not null,amount numeric(20,2) not null check(amount>0),due_date date not null,status text not null default 'pending' check(status in ('pending','paid','cancelled')),
 transaction_id uuid,category_id uuid,liability_id uuid,principal_reduction numeric(20,2) not null default 0 check(principal_reduction>=0),paid_at date,
 foreign key(transaction_id,user_id) references transactions(id,user_id),foreign key(category_id,user_id) references categories(id,user_id));
create unique index if not exists financial_liabilities_id_owner on financial_liabilities(id,user_id);
do $$begin if not exists(select 1 from pg_constraint where conname='obligation_liability_owner') then alter table financial_obligations add constraint obligation_liability_owner foreign key(liability_id,user_id) references financial_liabilities(id,user_id);end if;end $$;
do $$declare t text;begin
 foreach t in array array['account_reconciliations','invoice_reconciliations','financial_obligations'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('drop policy if exists owner_read on public.%I',t);
 execute format('create policy owner_read on public.%I for select to authenticated using(user_id=auth.uid())',t);
 execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
drop policy if exists pending_insert on financial_obligations;
create policy pending_insert on financial_obligations for insert to authenticated with check(user_id=auth.uid() and status='pending' and transaction_id is null and principal_reduction=0 and paid_at is null);
drop policy if exists pending_update on financial_obligations;
create policy pending_update on financial_obligations for update to authenticated using(user_id=auth.uid() and status='pending') with check(user_id=auth.uid() and status in ('pending','cancelled') and transaction_id is null and principal_reduction=0 and paid_at is null);
grant insert on financial_obligations to authenticated;
grant update(name,amount,due_date,status,category_id,liability_id) on financial_obligations to authenticated;

create or replace function recurrence_anchor() returns trigger language plpgsql set search_path=public as $$begin
 if TG_OP='INSERT' then new.anchor_day:=coalesce(new.anchor_day,extract(day from new.next_date)::int);
 elsif new.next_date is distinct from old.next_date and current_user='authenticated' then new.anchor_day:=extract(day from new.next_date)::int;end if;
 if new.end_date is not null and new.active then raise exception 'Uma recorrência encerrada não pode ser reativada; crie uma nova';end if;
 if TG_OP='UPDATE' and old.end_date is not null and new.end_date is distinct from old.end_date then raise exception 'Encerramento de recorrência é preservado; crie uma nova série';end if;
 return new;
end $$;
drop trigger if exists recurrence_anchor on recurring_transactions;
create trigger recurrence_anchor before insert or update on recurring_transactions for each row execute function recurrence_anchor();

create or replace function financial_owned(resource text,entity uuid) returns void language plpgsql security definer set search_path=public as $$
declare ok boolean;begin
 if auth.uid() is null or entity is null then raise exception 'Recurso financeiro não autorizado';end if;
 if resource not in ('financial_accounts','categories','credit_cards','credit_card_invoices','savings_goals','investment_assets','investment_income','transactions','investment_operations','financial_obligations') then raise exception 'Recurso inválido';end if;
 execute format('select exists(select 1 from public.%I where id=$1 and user_id=$2)',resource) into ok using entity,auth.uid();
 if not ok then raise exception 'Recurso financeiro não autorizado';end if;
end $$;
revoke all on function financial_owned(text,uuid) from public,anon,authenticated;

create or replace function investment_quantity(asset uuid,until_date date) returns numeric language plpgsql security invoker set search_path=public as $$
declare item record;q numeric:=0;begin
 for item in
 select date,quantity change,null::numeric ratio,1 kind from investment_operations where asset_id=asset and type='buy' and status='confirmed' and date<=until_date
 union all select date,-quantity,null::numeric,2 from investment_operations where asset_id=asset and type='sell' and status='confirmed' and date<=until_date
 union all select date,quantity,null::numeric,1 from investment_opening_positions where asset_id=asset and date<=until_date
 union all select date,0,ratio,0 from investment_corporate_actions where asset_id=asset and type<>'ticker_change' and date<=until_date order by date,kind loop
 if item.ratio is not null then q:=q*item.ratio;else q:=q+item.change;end if;
 if q<0 then raise exception 'Operação gera posição negativa no histórico';end if;
 end loop;return q;
end $$;
create or replace function financial_cash_account(account_id uuid) returns void language plpgsql security definer set search_path=public as $$begin
 if auth.uid() is null or not exists(select 1 from financial_accounts a where a.id=financial_cash_account.account_id and a.user_id=auth.uid() and a.kind in ('bank','cash') and not a.archived) then raise exception 'Selecione uma conta bancária ou de dinheiro ativa; caixinhas usam operações próprias';end if;
end $$;
revoke all on function financial_cash_account(uuid) from public,anon,authenticated,service_role;

create or replace function execute_operation_core(action text, payload jsonb, request_id uuid) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare u uuid:=auth.uid(); operation_result jsonb; x uuid; y uuid; z uuid; g uuid:=gen_random_uuid(); a numeric; b numeric; n int; i int; dt date; due date; c credit_cards; goal savings_goals; lot savings_lots; available numeric; portion numeric; left_amount numeric; principal numeric;
begin
 if u is null then raise exception 'Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select r.result into operation_result from operation_requests r where r.user_id=u and r.request_id=execute_operation_core.request_id;
 if found then return operation_result; end if;
 insert into operation_requests(user_id,request_id) values(u,request_id);
 dt:=coalesce((payload->>'date')::date,current_date); a:=(payload->>'amount')::numeric;
 if a is not null and (a<=0 or a<>round(a,2) or a>999999999999.99) then raise exception 'Valor inválido: use valor positivo com até 2 casas decimais'; end if;
 case action
 when 'transaction' then
  if payload->>'type' not in ('income','expense','yield','adjustment') then raise exception 'Tipo inválido'; end if;
  insert into transactions(user_id,account_id,category_id,description,type,amount,date,status,notes,recurrence,source_id) values(u,(payload->>'account_id')::uuid,nullif(payload->>'category_id','')::uuid,payload->>'description',payload->>'type',case when payload->>'type'='expense' then -a else a end,dt,coalesce(payload->>'status','confirmed'),coalesce(payload->>'notes',''),coalesce(payload->>'recurrence',''),nullif(payload->>'source_id','')) returning id into x;
 when 'transfer' then
  x:=(payload->>'from_account')::uuid; y:=(payload->>'to_account')::uuid;
  if x=y then raise exception 'Selecione contas diferentes'; end if;
  perform id from financial_accounts where id in(x,y) and not archived;
  if (select count(*) from financial_accounts where id in(x,y) and not archived)<>2 then raise exception 'Conta inválida'; end if;
  insert into transactions(user_id,account_id,description,type,amount,date,group_id) values(u,x,'Transferência enviada','transfer',-a,dt,g),(u,y,'Transferência recebida','transfer',a,dt,g);
  x:=g;
 when 'purchase' then
  select * into strict c from credit_cards where id=(payload->>'card_id')::uuid;
  n:=(payload->>'installments')::int; if n not between 1 and 120 then raise exception 'Parcelas inválidas'; end if;
  select coalesce(sum(ci.amount),0)-(select coalesce(sum(cp.amount),0) from credit_card_payments cp join credit_card_invoices inv on inv.id=cp.invoice_id where inv.card_id=c.id and cp.date<=(now() at time zone 'America/Sao_Paulo')::date) into b from credit_card_installments ci join credit_card_invoices inv on inv.id=ci.invoice_id where inv.card_id=c.id;
  if b+a>c.credit_limit then raise exception 'Limite insuficiente'; end if;
  insert into credit_card_purchases(user_id,card_id,description,amount,date,installments,category_id) values(u,c.id,payload->>'description',a,dt,n,nullif(payload->>'category_id','')::uuid) returning id into x;
  due:=date_trunc('month',dt)::date;
  if extract(day from dt)>=least(c.closing_day,extract(day from date_trunc('month',dt)+interval '1 month'-interval '1 day')::int) then due:=(due+interval '1 month')::date; end if;
  if c.due_day<=c.closing_day then due:=(due+interval '1 month')::date; end if;

  b:=trunc(a/n,2);
  for i in 1..n loop
   insert into credit_card_invoices(user_id,card_id,due_date) values(u,c.id,((due+make_interval(months=>i-1))::date+(least(c.due_day,extract(day from due+make_interval(months=>i)-interval '1 day')::int)-1))) on conflict(card_id,due_date) do update set due_date=excluded.due_date returning id into y;
   insert into credit_card_installments(user_id,purchase_id,invoice_id,number,amount) values(u,x,y,i,case when i=n then a-b*(n-1) else b end);
  end loop;
 when 'pay_invoice' then
  y:=(payload->>'invoice_id')::uuid;
  select coalesce(sum(amount),0) into b from credit_card_installments where invoice_id=y;
  b:=b-(select coalesce(sum(amount),0) from credit_card_payments where invoice_id=y and date<=dt);
  if a>b or b<=0 then raise exception 'Pagamento excede saldo da fatura'; end if;
  insert into transactions(user_id,account_id,description,type,amount,date) values(u,(payload->>'account_id')::uuid,'Pagamento de fatura','invoice_payment',-a,dt) returning id into x;
  insert into credit_card_payments(user_id,invoice_id,transaction_id,amount,date) values(u,y,x,a,dt);
 when 'create_goal' then
  insert into financial_accounts(user_id,name,institution,kind,initial_balance) values(u,payload->>'name',coalesce(payload->>'institution',''),'savings',0) returning id into y;
  insert into savings_goals(user_id,name,description,account_id,target,target_date,indexer,percentage,annual_rate,product,tax_exempt,institution) values(u,payload->>'name',coalesce(payload->>'description',''),y,(payload->>'target')::numeric,nullif(payload->>'target_date','')::date,coalesce(payload->>'indexer','cdi'),coalesce((payload->>'percentage')::numeric,100),coalesce((payload->>'annual_rate')::numeric,0),coalesce(payload->>'product','custom'),coalesce((payload->>'tax_exempt')::boolean,false),coalesce(payload->>'institution','')) returning id into x;
 when 'savings_deposit' then
  select * into strict goal from savings_goals where id=(payload->>'goal_id')::uuid;
  y:=(payload->>'account_id')::uuid;
  if y=goal.account_id then raise exception 'Conta de origem inválida'; end if;
  insert into savings_lots(user_id,goal_id,principal,remaining,start_date,indexer,percentage,annual_rate,product,tax_exempt) values(u,goal.id,a,a,dt,goal.indexer,goal.percentage,goal.annual_rate,goal.product,goal.tax_exempt) returning id into x;
  insert into savings_movements(user_id,goal_id,lot_id,type,amount,date,transaction_group) values(u,goal.id,x,'deposit',a,dt,g);
  insert into transactions(user_id,account_id,description,type,amount,date,group_id) values(u,y,'Aporte: '||goal.name,'transfer',-a,dt,g),(u,goal.account_id,'Aporte: '||goal.name,'transfer',a,dt,g);
 when 'savings_withdraw' then
  select * into strict goal from savings_goals where id=(payload->>'goal_id')::uuid;
  y:=(payload->>'account_id')::uuid;
  if y=goal.account_id then raise exception 'Conta de destino inválida'; end if;
  select coalesce(sum(remaining),0) into b from savings_lots where goal_id=goal.id;
  if a>b then raise exception 'Resgate de principal excede saldo; concilie rendimentos separadamente'; end if;
  left_amount:=a;
  for lot in select * from savings_lots where goal_id=goal.id and remaining>0 order by start_date,id for update loop
   if dt<lot.start_date then raise exception 'Resgate anterior ao aporte'; end if;
   portion:=least(lot.remaining,left_amount);
   if portion>0 then
    update savings_lots set remaining=remaining-portion where id=lot.id;
    insert into savings_movements(user_id,goal_id,lot_id,type,amount,date,transaction_group) values(u,goal.id,lot.id,'withdrawal',portion,dt,g);
    left_amount:=left_amount-portion;
   end if;
   exit when left_amount=0;
  end loop;
  insert into transactions(user_id,account_id,description,type,amount,date,group_id) values(u,goal.account_id,'Resgate: '||goal.name,'transfer',-a,dt,g),(u,y,'Resgate: '||goal.name,'transfer',a,dt,g);
  x:=g;
 when 'confirm_yield' then
  select * into strict goal from savings_goals where id=(payload->>'goal_id')::uuid;
  insert into savings_movements(user_id,goal_id,type,amount,date,transaction_group) values(u,goal.id,'confirmed_yield',a,dt,g);
  insert into transactions(user_id,account_id,description,type,amount,date,group_id) values(u,goal.account_id,'Rendimento conciliado: '||goal.name,'yield',a,dt,g) returning id into x;
 when 'investment' then
  if payload->>'type' not in ('buy','sell') then raise exception 'Operação inválida'; end if;
  b:=(payload->>'quantity')::numeric; a:=(payload->>'price')::numeric;
  if b<=0 or a<=0 or financial_money(coalesce(payload->>'fees','0'))<0 then raise exception 'Quantidade/preço/taxas inválidos'; end if;
  y:=(payload->>'asset_id')::uuid;
  if (select currency from investment_assets where id=y)<>'BRL' then raise exception 'Operações em outra moeda exigem suporte cambial; não registre valores como BRL';end if;
  if payload->>'type'='sell' then
   select investment_quantity(y,dt) into available;
   -- Opening positions and corporate events are applied before validating chronological holdings.
   if b>available then raise exception 'Quantidade insuficiente'; end if;
  end if;
  insert into investment_operations(user_id,asset_id,account_id,type,quantity,price,fees,date,broker) values(u,y,(payload->>'account_id')::uuid,payload->>'type',b,a,financial_money(coalesce(payload->>'fees','0')),dt,coalesce(payload->>'broker','')) returning id into x;
  a:=round(a*b,2);
  if payload->>'type'='buy' then a:=-a-financial_money(coalesce(payload->>'fees','0')); else a:=a-financial_money(coalesce(payload->>'fees','0')); end if;
  if a=0 then raise exception 'Valor líquido zero'; end if;
  insert into transactions(user_id,account_id,description,type,amount,date,group_id) values(u,(payload->>'account_id')::uuid,'Operação de investimento','investment',a,dt,x);
 when 'confirm_income' then
  select asset_id,amount into strict y,a from investment_income where id=(payload->>'income_id')::uuid and status='announced' for update;
  update investment_income set status='received',account_id=(payload->>'account_id')::uuid,date=dt where id=(payload->>'income_id')::uuid;
  insert into transactions(user_id,account_id,description,type,amount,date) values(u,(payload->>'account_id')::uuid,'Provento confirmado',case when (select type from investment_income where id=(payload->>'income_id')::uuid)='amortization' then 'redemption' else 'yield' end,a,dt) returning id into x;
 else raise exception 'Operação desconhecida';
 end case;
 operation_result:=jsonb_build_object('id',x,'ok',true);
 update operation_requests set result=operation_result where user_id=u and operation_requests.request_id=execute_operation_core.request_id;
 return operation_result;
end $$;

create or replace function revise_card_purchase_core(purchase_id uuid, replacement jsonb, cancel boolean default false)
returns uuid language plpgsql security invoker set search_path=public as $$
declare p credit_card_purchases; c credit_cards; a numeric; b numeric; n int; i int; due date; dt date; invoice uuid; financial_change boolean;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into strict p from credit_card_purchases where id=revise_card_purchase_core.purchase_id for update;
 if p.status='cancelled' then raise exception 'Compra já excluída'; end if;
 if cancel then financial_change:=true;
 else
  a:=(replacement->>'amount')::numeric; n:=(replacement->>'installments')::int; dt:=(replacement->>'date')::date;
  if a is null or a<=0 or a<>round(a,2) or a>999999999999.99 or n is null or n not between 1 and 120 or dt is null
   or nullif(trim(replacement->>'description'),'') is null or length(replacement->>'description')>200 then raise exception 'Dados da compra inválidos'; end if;
  select * into strict c from credit_cards where id=(replacement->>'card_id')::uuid;
  financial_change:=a<>p.amount or n<>p.installments or dt<>p.date or c.id<>p.card_id;
 end if;
 if financial_change and exists (
  select 1 from credit_card_payments cp join credit_card_installments ci on ci.invoice_id=cp.invoice_id
  where ci.purchase_id=p.id
 ) then raise exception 'Esta compra está em uma fatura com pagamento. É possível corrigir descrição/categoria; valor, parcelas e exclusão exigem conciliar o pagamento primeiro.'; end if;
 if cancel then
  update credit_card_purchases set status='cancelled' where id=p.id;
  delete from credit_card_installments where credit_card_installments.purchase_id=p.id;
 else
  update credit_card_purchases set card_id=c.id,description=trim(replacement->>'description'),amount=a,date=dt,installments=n,
   category_id=nullif(replacement->>'category_id','')::uuid where id=p.id;
  if financial_change then
   delete from credit_card_installments where credit_card_installments.purchase_id=p.id;
   select coalesce(sum(ci.amount),0)-(select coalesce(sum(cp.amount),0) from credit_card_payments cp join credit_card_invoices inv on inv.id=cp.invoice_id where inv.card_id=c.id and cp.date<=(now() at time zone 'America/Sao_Paulo')::date)
   into b from credit_card_installments ci join credit_card_invoices inv on inv.id=ci.invoice_id where inv.card_id=c.id;
   if b+a>c.credit_limit then raise exception 'Limite insuficiente para a compra corrigida'; end if;
   due:=date_trunc('month',dt)::date;
   if extract(day from dt)>=least(c.closing_day,extract(day from date_trunc('month',dt)+interval '1 month'-interval '1 day')::int) then due:=(due+interval '1 month')::date; end if;
   if c.due_day<=c.closing_day then due:=(due+interval '1 month')::date; end if;
    b:=trunc(a/n,2);
   for i in 1..n loop
    insert into credit_card_invoices(user_id,card_id,due_date) values(auth.uid(),c.id,((due+make_interval(months=>i-1))::date+(least(c.due_day,extract(day from due+make_interval(months=>i)-interval '1 day')::int)-1)))
     on conflict(card_id,due_date) do update set due_date=excluded.due_date returning id into invoice;
    insert into credit_card_installments(user_id,purchase_id,invoice_id,number,amount)
     values(auth.uid(),p.id,invoice,i,case when i=n then a-b*(n-1) else b end);
   end loop;
  end if;
 end if;
 delete from credit_card_invoices inv where inv.user_id=auth.uid()
  and not exists(select 1 from credit_card_installments ci where ci.invoice_id=inv.id)
  and not exists(select 1 from credit_card_payments cp where cp.invoice_id=inv.id);
 return p.id;
end $$;

create or replace function financial_money(value text,allow_zero boolean default true,allow_negative boolean default false)
returns numeric language plpgsql immutable set search_path=public as $$declare n numeric;begin
 if value is null or value !~ (case when allow_negative then '^-?[0-9]{1,12}(\.[0-9]{1,2})?$' else '^[0-9]{1,12}(\.[0-9]{1,2})?$' end) then raise exception 'Valor monetário inválido: use até duas casas decimais';end if;
 n:=value::numeric;if not allow_zero and n=0 then raise exception 'Valor deve ser diferente de zero';end if;return n;
end $$;
revoke all on function financial_money(text,boolean,boolean) from public,anon,authenticated;

create or replace function execute_operation(action text,payload jsonb,request_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();today date:=(now() at time zone 'America/Sao_Paulo')::date;dt date:=coalesce((payload->>'date')::date,today);
 financial_result jsonb;previous_request operation_requests;fingerprint text:=encode(sha256(convert_to(payload::text,'UTF8')),'hex');
 x uuid;y uuid;g uuid:=gen_random_uuid();goal savings_goals;lot savings_lots;ob financial_obligations;
 a numeric;b numeric;principal numeric;interest numeric;ir numeric;iof numeric;net numeric;registered numeric;difference numeric;left_amount numeric;portion numeric;debt_principal_reduction numeric;
begin
 if u is null or request_id is null or payload is null or jsonb_typeof(payload)<>'object' then raise exception 'Solicitação financeira não autorizada';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select * into previous_request from operation_requests r where r.user_id=u and r.request_id=execute_operation.request_id;
 if found then
  if previous_request.action is not null and (previous_request.action<>action or previous_request.payload_hash<>fingerprint) then raise exception 'Chave de operação reutilizada com dados diferentes';end if;
  if previous_request.result is null then raise exception 'Operação anterior incompleta; revise antes de repetir';end if;
  return previous_request.result;
 end if;
 -- Guard every reference before a privileged writer is called. Composite foreign keys alone are not authorization.
 if payload ? 'account_id' then perform financial_owned('financial_accounts',(payload->>'account_id')::uuid);end if;
 if nullif(payload->>'category_id','') is not null then perform financial_owned('categories',(payload->>'category_id')::uuid);end if;
 if payload ? 'asset_id' then perform financial_owned('investment_assets',(payload->>'asset_id')::uuid);end if;
 if payload ? 'card_id' then perform financial_owned('credit_cards',(payload->>'card_id')::uuid);end if;
 if payload ? 'goal_id' then perform financial_owned('savings_goals',(payload->>'goal_id')::uuid);end if;
 if payload ? 'invoice_id' then perform financial_owned('credit_card_invoices',(payload->>'invoice_id')::uuid);end if;
 if payload ? 'income_id' then perform financial_owned('investment_income',(payload->>'income_id')::uuid);end if;
 if action='transfer' then perform financial_cash_account((payload->>'from_account')::uuid);perform financial_cash_account((payload->>'to_account')::uuid);end if;
 if action in ('transaction','investment','confirm_income','pay_invoice','pay_obligation') then perform financial_cash_account((payload->>'account_id')::uuid);end if;
 if action in ('pay_invoice','confirm_income','savings_withdraw','confirm_yield','reconcile_account','reconcile_invoice','reconcile_savings','pay_obligation') and dt>today then raise exception 'Esta confirmação financeira não pode ter data futura';end if;
 if action in ('transaction','transfer','purchase','pay_invoice','savings_deposit','confirm_yield') then perform financial_money(payload->>'amount',false,action='transaction' and payload->>'type'='adjustment');end if;
 if action='create_goal' then perform financial_money(payload->>'target',false);end if;
 if action='purchase' and financial_money(payload->>'amount',false)<(payload->>'installments')::int*0.01 then raise exception 'Valor insuficiente para parcelas de pelo menos um centavo';end if;
 if action='investment' and (payload->>'quantity' !~ '^[0-9]{1,12}(\.[0-9]{1,8})?$' or payload->>'price' !~ '^[0-9]{1,12}(\.[0-9]{1,8})?$') then raise exception 'Quantidade ou preço inválido';end if;
 if action in ('savings_deposit','savings_withdraw') and not exists(select 1 from financial_accounts where id=(payload->>'account_id')::uuid and user_id=u and kind in ('bank','cash') and not archived) then raise exception 'Selecione uma conta disponível de origem/destino';end if;

 if action in ('reconcile_account','reconcile_invoice','reconcile_savings','savings_withdraw','pay_obligation')
 or (action='transaction' and payload->>'type'='adjustment' and (payload->>'amount')::numeric<0) then
  insert into operation_requests(user_id,request_id,action,payload_hash) values(u,request_id,action,fingerprint);
  case action
  when 'transaction' then
   a:=financial_money(payload->>'amount',false,true);
   insert into transactions(user_id,account_id,category_id,description,type,amount,date,status,notes,source_id)
   values(u,(payload->>'account_id')::uuid,nullif(payload->>'category_id','')::uuid,payload->>'description','adjustment',a,dt,coalesce(payload->>'status','confirmed'),coalesce(payload->>'notes',''),nullif(payload->>'source_id','')) returning id into x;
  when 'reconcile_account' then
   y:=(payload->>'account_id')::uuid;a:=financial_money(payload->>'confirmed_balance',true,true);
   select initial_balance+coalesce((select sum(amount) from transactions where account_id=y and user_id=u and status='confirmed' and date<=dt),0) into registered from financial_accounts where id=y and user_id=u;
   difference:=a-registered;
   if coalesce((payload->>'apply_adjustment')::boolean,false) and difference<>0 then
    if dt<>today then raise exception 'Ajuste de saldo somente hoje; datas passadas registram divergência sem alterar caixa';end if;
    if exists(select 1 from savings_goals where account_id=y and user_id=u) then raise exception 'Use a conciliação específica da caixinha';end if;
    insert into transactions(user_id,account_id,description,type,amount,date,group_id,notes) values(u,y,'Ajuste de saldo oficial','adjustment',difference,dt,g,coalesce(payload->>'notes','')) returning id into x;
   end if;
   insert into account_reconciliations(user_id,account_id,date,confirmed_balance,registered_balance,difference,notes,transaction_id) values(u,y,dt,a,registered,difference,coalesce(payload->>'notes',''),x) returning id into y;x:=y;
  when 'reconcile_invoice' then
   y:=(payload->>'invoice_id')::uuid;a:=financial_money(payload->>'confirmed_balance');
   select coalesce(sum(ci.amount),0) into registered from credit_card_installments ci join credit_card_purchases p on p.id=ci.purchase_id where ci.invoice_id=y and ci.user_id=u and p.status='confirmed' and p.date<=dt;
   registered:=registered-coalesce((select sum(cp.amount) from credit_card_payments cp join transactions t on t.id=cp.transaction_id where cp.invoice_id=y and cp.user_id=u and cp.date<=dt and t.status='confirmed'),0);
   insert into invoice_reconciliations(user_id,invoice_id,date,confirmed_balance,registered_balance,difference,notes) values(u,y,dt,a,registered,a-registered,coalesce(payload->>'notes','')) returning id into x;
  when 'reconcile_savings' then
   if coalesce((payload->>'apply_adjustment')::boolean,false) and dt<>today then raise exception 'Ajuste da caixinha somente com o saldo oficial de hoje';end if;
   select * into strict goal from savings_goals where id=(payload->>'goal_id')::uuid and user_id=u for update;
   a:=financial_money(payload->>'confirmed_balance');
   select coalesce(sum(remaining),0) into principal from savings_lots where goal_id=goal.id and user_id=u and status='confirmed' and start_date<=dt;
   if coalesce((payload->>'apply_adjustment')::boolean,false) and a<principal then raise exception 'Saldo oficial abaixo do principal: corrija aportes/resgates antes de conciliar rendimentos';end if;
   select initial_balance+coalesce((select sum(amount) from transactions where account_id=goal.account_id and user_id=u and status='confirmed' and date<=dt),0) into registered from financial_accounts where id=goal.account_id;
   difference:=a-registered;
   if difference<>0 and coalesce((payload->>'apply_adjustment')::boolean,false) then
    insert into savings_movements(user_id,goal_id,type,amount,date,transaction_group) values(u,goal.id,case when difference>0 then 'confirmed_yield' else 'yield_reversal' end,abs(difference),dt,g);
    insert into transactions(user_id,account_id,description,type,amount,date,group_id,notes) values(u,goal.account_id,'Conciliação oficial: '||goal.name,case when difference>0 then 'yield' else 'adjustment' end,difference,dt,g,coalesce(payload->>'notes','')) returning id into x;
   end if;
   insert into savings_reconciliations(user_id,goal_id,date,confirmed_balance,registered_balance,difference,transaction_id,notes) values(u,goal.id,dt,a,registered,difference,x,coalesce(payload->>'notes','')) returning id into x;
  when 'savings_withdraw' then
   select * into strict goal from savings_goals where id=(payload->>'goal_id')::uuid and user_id=u for update;
   y:=(payload->>'account_id')::uuid;a:=financial_money(payload->>'amount');
   interest:=financial_money(coalesce(payload->>'yield_amount','0'));ir:=financial_money(coalesce(payload->>'ir_amount','0'));iof:=financial_money(coalesce(payload->>'iof_amount','0'));
   if a+interest=0 or ir+iof>interest then raise exception 'Resgate ou tributos inválidos';end if;
   if interest>0 and dt<>today then raise exception 'Resgate de rendimento confirmado somente na data de hoje';end if;
   select coalesce(sum(remaining),0) into b from savings_lots where goal_id=goal.id and user_id=u and status='confirmed' and start_date<=dt;
   if a>b then raise exception 'Principal de resgate excede o saldo disponível na data';end if;
   select coalesce(sum(case when type='confirmed_yield' then amount when type in ('yield_reversal','withdrawn_yield') then -amount else 0 end),0) into registered from savings_movements where goal_id=goal.id and user_id=u and status='confirmed' and date<=dt;
   if interest>greatest(registered,0) then raise exception 'Concilie o rendimento oficial antes de resgatá-lo; estimativa não é saldo confirmado';end if;
   left_amount:=a;
   for lot in select * from savings_lots where goal_id=goal.id and user_id=u and status='confirmed' and start_date<=dt and remaining>0 order by start_date,id for update loop
    exit when left_amount=0;portion:=least(lot.remaining,left_amount);
    update savings_lots set remaining=remaining-portion where id=lot.id;
    insert into savings_movements(user_id,goal_id,lot_id,type,amount,date,transaction_group) values(u,goal.id,lot.id,'withdrawal',portion,dt,g);
    left_amount:=left_amount-portion;
   end loop;
   if interest>0 then insert into savings_movements(user_id,goal_id,type,amount,date,transaction_group) values(u,goal.id,'withdrawn_yield',interest,dt,g);end if;
   net:=a+interest-ir-iof;
   if net>0 then insert into transactions(user_id,account_id,description,type,amount,date,group_id) values(u,goal.account_id,'Resgate: '||goal.name,'transfer',-net,dt,g),(u,y,'Resgate: '||goal.name,'transfer',net,dt,g);end if;
   if ir+iof>0 then
    insert into savings_movements(user_id,goal_id,type,amount,date,transaction_group) values(u,goal.id,'tax',ir+iof,dt,g);
    insert into transactions(user_id,account_id,description,type,amount,date,group_id,notes) values(u,goal.account_id,'IR/IOF confirmado no resgate','expense',-(ir+iof),dt,g,'IR: '||ir||'; IOF: '||iof);
   end if;x:=g;
  when 'pay_obligation' then
   perform financial_owned('financial_obligations',(payload->>'obligation_id')::uuid);
   select * into strict ob from financial_obligations where id=(payload->>'obligation_id')::uuid and user_id=u and status='pending' for update;
   debt_principal_reduction:=financial_money(coalesce(payload->>'principal_reduction','0'));
   if debt_principal_reduction>ob.amount then raise exception 'Amortização excede o pagamento';end if;
   if debt_principal_reduction>0 then
    if ob.liability_id is null then raise exception 'Informe a dívida vinculada para amortizar principal';end if;
    update financial_liabilities set amount=amount-debt_principal_reduction where id=ob.liability_id and user_id=u and amount>=debt_principal_reduction;
    if not found then raise exception 'Amortização excede o saldo devedor';end if;
   end if;
   insert into transactions(user_id,account_id,category_id,description,type,amount,date,group_id) values(u,(payload->>'account_id')::uuid,ob.category_id,'Pagamento: '||ob.name,'expense',-ob.amount,dt,ob.id) returning id into x;
   insert into financial_integrity_revisions(user_id,entity,entity_id,previous,reason) values(u,'financial_obligations',ob.id,to_jsonb(ob),'Pagamento confirmado');
   update financial_obligations set status='paid',transaction_id=x,paid_at=dt,principal_reduction=debt_principal_reduction where id=ob.id;
  end case;
  financial_result:=jsonb_build_object('id',x,'ok',true);
  update operation_requests set result=financial_result where user_id=u and operation_requests.request_id=execute_operation.request_id;
 else
  financial_result:=execute_operation_core(action,payload,request_id);
  if action='create_goal' then
   update savings_goals set is_emergency_reserve=coalesce((payload->>'is_emergency_reserve')::boolean,false) where id=(financial_result->>'id')::uuid and user_id=u;
  end if;
  if action='confirm_income' then
   x:=(financial_result->>'id')::uuid;y:=(payload->>'income_id')::uuid;
   update transactions set linked_income_id=y,group_id=y where id=x and user_id=u;
   update investment_income set transaction_id=x where id=y and user_id=u;
  end if;
  update operation_requests set action=execute_operation.action,payload_hash=fingerprint where user_id=u and operation_requests.request_id=execute_operation.request_id;
 end if;
 return financial_result;
end $$;
revoke all on function execute_operation_core(text,jsonb,uuid),revise_card_purchase_core(uuid,jsonb,boolean) from public,anon,authenticated;
revoke all on function execute_operation(text,jsonb,uuid) from public,anon;
grant execute on function execute_operation(text,jsonb,uuid) to authenticated;

create or replace function revise_income(income_id uuid,replacement jsonb,cancel boolean default false) returns uuid
language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();i investment_income;t transactions;val numeric;acct uuid;asset uuid;dt date;kind text;income_description text;begin
 if u is null then raise exception 'Authentication required';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select * into strict i from investment_income where id=revise_income.income_id and user_id=u for update;
 if i.status='cancelled' then raise exception 'Provento já estornado/cancelado';end if;
 if i.status='received' then
  if i.transaction_id is null then raise exception 'Recebimento legado sem vínculo inequívoco: concilie o extrato antes de corrigir';end if;
  select * into strict t from transactions where id=i.transaction_id and user_id=u and linked_income_id=i.id for update;
 end if;
 insert into financial_integrity_revisions(user_id,entity,entity_id,previous,reason) values(u,'investment_income',i.id,to_jsonb(i),case when cancel then 'Estorno/cancelamento' else 'Correção conciliada' end);
 if cancel then
  if i.transaction_id is not null then update transactions set status='cancelled' where id=i.transaction_id and user_id=u;end if;
  update investment_income set status='cancelled' where id=i.id and user_id=u;return i.id;
 end if;
 val:=financial_money(replacement->>'amount',false);asset:=(replacement->>'asset_id')::uuid;dt:=(replacement->>'date')::date;
 income_description:=trim(replacement->>'description');kind:=coalesce(replacement->>'type',i.type);acct:=coalesce(nullif(replacement->>'account_id','')::uuid,i.account_id);
 perform financial_owned('investment_assets',asset);
 if income_description is null or length(income_description) not between 1 and 200 or dt is null or kind not in ('dividend','jcp','interest','amortization') then raise exception 'Dados do provento inválidos';end if;
 if i.status='received' then
  perform financial_cash_account(acct);
  if dt>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Recebimento confirmado não pode ter data futura';end if;
  update transactions set account_id=acct,description=income_description,type=case when kind='amortization' then 'redemption' else 'yield' end,amount=val,date=dt where id=i.transaction_id and user_id=u;
 end if;
 update investment_income set asset_id=asset,description=income_description,amount=val,date=dt,type=kind,account_id=acct where id=i.id and user_id=u;
 update financial_integrity_revisions set next=(select to_jsonb(r) from investment_income r where r.id=i.id) where entity_id=i.id and user_id=u and next is null;
 return i.id;
end $$;
revoke all on function revise_income(uuid,jsonb,boolean) from public,anon;
grant execute on function revise_income(uuid,jsonb,boolean) to authenticated;

create or replace function revise_transaction(transaction_id uuid,replacement jsonb,cancel boolean default false) returns uuid
language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();t transactions;val numeric;kind text;linked investment_income;begin
 if u is null then raise exception 'Authentication required';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select * into strict t from transactions where id=revise_transaction.transaction_id and user_id=u for update;
 if t.linked_income_id is not null then
  select * into strict linked from investment_income where id=t.linked_income_id and user_id=u;
  perform revise_income(linked.id,replacement||jsonb_build_object('asset_id',linked.asset_id,'type',linked.type),cancel);return t.id;
 end if;
 if t.type not in ('income','expense','adjustment','yield') or t.group_id is not null then raise exception 'Movimento vinculado exige correção na origem';end if;
 if t.status='cancelled' then raise exception 'Lançamento já cancelado';end if;
 if cancel then update transactions set status='cancelled' where id=t.id and user_id=u;return t.id;end if;
 kind:=replacement->>'type';val:=financial_money(replacement->>'amount',false,kind='adjustment');
 perform financial_cash_account((replacement->>'account_id')::uuid);
 if nullif(replacement->>'category_id','') is not null then perform financial_owned('categories',(replacement->>'category_id')::uuid);end if;
 if kind not in ('income','expense','adjustment','yield') or nullif(trim(replacement->>'description'),'') is null or length(replacement->>'description')>200 or replacement->>'status' not in ('confirmed','pending') then raise exception 'Dados do lançamento inválidos';end if;
 update transactions set account_id=(replacement->>'account_id')::uuid,category_id=nullif(replacement->>'category_id','')::uuid,description=trim(replacement->>'description'),type=kind,
 amount=case when kind='expense' then -abs(val) else val end,date=(replacement->>'date')::date,status=coalesce(replacement->>'status','confirmed'),notes=coalesce(replacement->>'notes','') where id=t.id and user_id=u;
 return t.id;
end $$;
revoke all on function revise_transaction(uuid,jsonb,boolean) from public,anon;
grant execute on function revise_transaction(uuid,jsonb,boolean) to authenticated;

create or replace function revise_card_purchase(purchase_id uuid,replacement jsonb,cancel boolean default false) returns uuid
language plpgsql security definer set search_path=public as $$begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if not exists(select 1 from credit_card_purchases where id=purchase_id and user_id=auth.uid()) then raise exception 'Compra não autorizada';end if;
 if not cancel then
  perform financial_owned('credit_cards',(replacement->>'card_id')::uuid);
  if nullif(replacement->>'category_id','') is not null then perform financial_owned('categories',(replacement->>'category_id')::uuid);end if;
  if financial_money(replacement->>'amount',false)<(replacement->>'installments')::int*0.01 then raise exception 'Parcelas precisam ter ao menos um centavo';end if;
 end if;
 return revise_card_purchase_core(purchase_id,replacement,cancel);
end $$;
revoke all on function revise_card_purchase(uuid,jsonb,boolean) from public,anon;
grant execute on function revise_card_purchase(uuid,jsonb,boolean) to authenticated;

create or replace function revise_investment(operation_id uuid,replacement jsonb,cancel boolean default false) returns uuid
language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();o investment_operations;asset uuid;acct uuid;qty numeric;unit_price numeric;operation_fees numeric;cash numeric;dt date;kind text;begin
 if u is null then raise exception 'Authentication required';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select * into strict o from investment_operations where id=operation_id and user_id=u for update;
 if o.status='cancelled' then raise exception 'Operação já cancelada';end if;
 if exists(select 1 from investment_operations where asset_id=o.asset_id and user_id=u and status='confirmed' and id<>o.id and date>=o.date)
 or exists(select 1 from investment_corporate_actions where asset_id=o.asset_id and user_id=u and date>=o.date)
 or exists(select 1 from investment_income where asset_id=o.asset_id and user_id=u and status='received' and date>=o.date) then raise exception 'Há operações/eventos/recebimentos dependentes; corrija os mais recentes primeiro';end if;
 insert into financial_integrity_revisions(user_id,entity,entity_id,previous,reason) values(u,'investment_operations',o.id,to_jsonb(o),case when cancel then 'Cancelamento com estorno de caixa' else 'Correção com recálculo de caixa' end);
 if cancel then
  update investment_operations set status='cancelled' where id=o.id and user_id=u;
  update transactions set status='cancelled' where group_id=o.id and user_id=u and type='investment';
 else
  asset:=(replacement->>'asset_id')::uuid;acct:=(replacement->>'account_id')::uuid;dt:=(replacement->>'date')::date;kind:=replacement->>'type';
  perform financial_owned('investment_assets',asset);perform financial_cash_account(acct);
  if (select currency from investment_assets where id=asset and user_id=u)<>'BRL' then raise exception 'Operação cambial não suportada';end if;
  if replacement->>'quantity' !~ '^[0-9]{1,12}(\.[0-9]{1,8})?$' or replacement->>'price' !~ '^[0-9]{1,12}(\.[0-9]{1,8})?$' then raise exception 'Quantidade/preço inválidos';end if;
  qty:=(replacement->>'quantity')::numeric;unit_price:=(replacement->>'price')::numeric;operation_fees:=financial_money(coalesce(replacement->>'fees','0'));
  if qty<=0 or unit_price<=0 or dt is null or kind not in ('buy','sell') then raise exception 'Dados da operação inválidos';end if;
  if exists(select 1 from investment_operations where asset_id=asset and user_id=u and status='confirmed' and id<>o.id and date>=dt)
  or exists(select 1 from investment_corporate_actions where asset_id=asset and user_id=u and date>=dt) then raise exception 'Nova data/ativo possui dependências; concilie a sequência primeiro';end if;
  update investment_operations set asset_id=asset,account_id=acct,type=kind,quantity=qty,price=unit_price,fees=operation_fees,date=dt,broker=coalesce(replacement->>'broker','') where id=o.id and user_id=u;
  perform investment_quantity(o.asset_id,'9999-12-31'::date);perform investment_quantity(asset,'9999-12-31'::date);
  cash:=case when kind='buy' then -round(qty*unit_price,2)-operation_fees else round(qty*unit_price,2)-operation_fees end;
  if cash=0 then raise exception 'Valor líquido da operação não pode ser zero';end if;
  update transactions set account_id=acct,amount=cash,date=dt where group_id=o.id and user_id=u and type='investment' and status='confirmed';
  if not found then raise exception 'Operação sem movimento de caixa conciliado';end if;
 end if;
 update financial_integrity_revisions set next=(select to_jsonb(r) from investment_operations r where r.id=o.id) where entity_id=o.id and user_id=u and next is null;
 return o.id;
end $$;
revoke all on function revise_investment(uuid,jsonb,boolean) from public,anon;
grant execute on function revise_investment(uuid,jsonb,boolean) to authenticated;

create or replace function revise_opening_position(position_id uuid,replacement jsonb) returns uuid
language plpgsql security definer set search_path=public as $$declare p investment_opening_positions;asset uuid;qty numeric;cost numeric;dt date;begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into strict p from investment_opening_positions where id=position_id and user_id=auth.uid() for update;
 asset:=(replacement->>'asset_id')::uuid;perform financial_owned('investment_assets',asset);
 if exists(select 1 from investment_operations where asset_id in(p.asset_id,asset) and user_id=auth.uid() and status='confirmed')
 or exists(select 1 from investment_corporate_actions where asset_id in(p.asset_id,asset) and user_id=auth.uid()) then raise exception 'Posição inicial possui operações/eventos dependentes; corrija na sequência antes';end if;
 if replacement->>'quantity' !~ '^[0-9]{1,12}(\.[0-9]{1,8})?$' then raise exception 'Quantidade inválida';end if;
 qty:=(replacement->>'quantity')::numeric;cost:=financial_money(replacement->>'cost');dt:=(replacement->>'date')::date;
 if qty<=0 or dt is null then raise exception 'Posição inicial inválida';end if;
 insert into financial_integrity_revisions(user_id,entity,entity_id,previous,reason) values(auth.uid(),'investment_opening_positions',p.id,to_jsonb(p),'Correção da posição inicial');
 update investment_opening_positions set asset_id=asset,quantity=qty,cost=revise_opening_position.cost,date=dt,notes=coalesce(replacement->>'notes','') where id=p.id and user_id=auth.uid();
 perform investment_quantity(p.asset_id,'9999-12-31'::date);perform investment_quantity(asset,'9999-12-31'::date);return p.id;
end $$;
revoke all on function revise_opening_position(uuid,jsonb) from public,anon;
grant execute on function revise_opening_position(uuid,jsonb) to authenticated;

create or replace function cancel_savings_operation(operation_group uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();movement savings_movements;lot savings_lots;goal uuid;latest date;latest_created timestamptz;begin
 if u is null then raise exception 'Authentication required';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select goal_id,max(date),max(created_at) into goal,latest,latest_created from savings_movements where transaction_group=operation_group and user_id=u and status='confirmed' group by goal_id;
 if goal is null then raise exception 'Operação de caixinha não encontrada ou já estornada';end if;
 if exists(select 1 from savings_movements where goal_id=goal and user_id=u and status='confirmed' and transaction_group is distinct from operation_group and (date>latest or (date=latest and created_at>latest_created))) then raise exception 'Há movimentações posteriores/dependentes; estorne as mais recentes primeiro';end if;
 if exists(select 1 from savings_reconciliations where goal_id=goal and user_id=u and transaction_id in(select id from transactions where group_id=operation_group)) then raise exception 'Esta conciliação oficial deve ser corrigida com um novo saldo oficial auditado';end if;
 for movement in select * from savings_movements where transaction_group=operation_group and user_id=u and status='confirmed' for update loop
  insert into financial_integrity_revisions(user_id,entity,entity_id,previous,reason) values(u,'savings_movements',movement.id,to_jsonb(movement),'Estorno integral da operação');
  if movement.type='withdrawal' then
   update savings_lots set remaining=remaining+movement.amount where id=movement.lot_id and user_id=u and status='confirmed' and remaining+movement.amount<=principal;
   if not found then raise exception 'Lote não permite estorno do principal';end if;
  elsif movement.type='deposit' then
   select * into strict lot from savings_lots where id=movement.lot_id and user_id=u for update;
   if lot.remaining<>lot.principal then raise exception 'Aporte possui resgates dependentes';end if;
   update savings_lots set remaining=0,status='cancelled' where id=lot.id and user_id=u;
  end if;
 end loop;
 update savings_movements set status='cancelled' where transaction_group=operation_group and user_id=u;
 update transactions set status='cancelled' where group_id=operation_group and user_id=u;
 return operation_group;
end $$;
revoke all on function cancel_savings_operation(uuid) from public,anon;
grant execute on function cancel_savings_operation(uuid) to authenticated;

create or replace function cancel_obligation_payment(obligation_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$declare o financial_obligations;begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into strict o from financial_obligations where id=obligation_id and user_id=auth.uid() and status='paid' for update;
 insert into financial_integrity_revisions(user_id,entity,entity_id,previous,reason) values(auth.uid(),'financial_obligations',o.id,to_jsonb(o),'Estorno do pagamento');
 update transactions set status='cancelled' where id=o.transaction_id and user_id=auth.uid();
 if o.principal_reduction>0 then update financial_liabilities set amount=amount+o.principal_reduction where id=o.liability_id and user_id=auth.uid();end if;
 update financial_obligations set status='pending',transaction_id=null,paid_at=null,principal_reduction=0 where id=o.id and user_id=auth.uid();return o.id;
end $$;
revoke all on function cancel_obligation_payment(uuid) from public,anon;
grant execute on function cancel_obligation_payment(uuid) to authenticated;
alter table financial_obligations add column if not exists notes text not null default '';
grant update(notes) on financial_obligations to authenticated;

-- Revoke direct writes to financial derivatives. Simple accounts/categories/budgets remain editable.
revoke insert,update,delete on transactions,credit_card_purchases,credit_card_installments,credit_card_invoices,credit_card_payments,
 savings_lots,savings_movements,investment_operations,operation_requests,savings_reconciliations from authenticated;
revoke insert,update,delete on savings_goals from authenticated;
grant update(name,description,target,target_date,institution,indexer,percentage,annual_rate,product,tax_exempt,is_emergency_reserve) on savings_goals to authenticated;
revoke update,delete on investment_income,investment_corporate_actions from authenticated;
drop policy if exists owner on investment_income;
drop policy if exists owner_read on investment_income;
drop policy if exists announcement_insert on investment_income;
create policy owner_read on investment_income for select to authenticated using(user_id=auth.uid());
create policy announcement_insert on investment_income for insert to authenticated with check(user_id=auth.uid() and status='announced' and transaction_id is null and account_id is null);

create or replace function validate_cash_account_edit() returns trigger language plpgsql set search_path=public as $$begin
 if current_user in ('authenticated','anon') then
  if TG_OP='INSERT' and new.kind='savings' then raise exception 'Crie a conta da caixinha pela operação transacional';end if;
  if TG_OP='UPDATE' and (old.kind='savings' or new.kind='savings') then raise exception 'Conta vinculada à caixinha exige operação transacional';end if;
 end if;return new;
end $$;
drop trigger if exists financial_account_integrity on financial_accounts;
create trigger financial_account_integrity before insert or update on financial_accounts for each row execute function validate_cash_account_edit();

create or replace function validate_asset_currency_edit() returns trigger language plpgsql set search_path=public as $$begin
 if new.currency is distinct from old.currency and (exists(select 1 from investment_operations where asset_id=old.id and status='confirmed') or exists(select 1 from investment_opening_positions where asset_id=old.id)) then raise exception 'Ativo com posição não permite trocar moeda sem conciliação cambial';end if;return new;
end $$;
drop trigger if exists investment_currency_integrity on investment_assets;
create trigger investment_currency_integrity before update on investment_assets for each row execute function validate_asset_currency_edit();

create or replace function validate_ticker_event_date() returns trigger language plpgsql set search_path=public as $$begin
 if new.type='ticker_change' and new.date>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Registre a troca de ticker quando ela entrar em vigor; anúncio futuro não altera o ativo atual';end if;return new;
end $$;
drop trigger if exists ticker_event_date on investment_corporate_actions;
create trigger ticker_event_date before insert on investment_corporate_actions for each row execute function validate_ticker_event_date();

create or replace function generate_recurring(until_date date) returns int language plpgsql security definer set search_path=public as $$
declare r recurring_transactions;d date;next_month date;n int:=0;begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if until_date>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Gere apenas até hoje';end if;
 for r in select * from recurring_transactions where user_id=auth.uid() and active and next_date<=until_date and (end_date is null or next_date<=end_date) for update loop
 d:=r.next_date;
 while d<=until_date and (r.end_date is null or d<=r.end_date) loop
  insert into transactions(user_id,account_id,category_id,description,type,amount,date,status,source_id) values(r.user_id,r.account_id,r.category_id,r.description,r.type,case when r.type='expense' then -r.amount else r.amount end,d,'pending','recurrence:'||r.id||':'||d) on conflict(user_id,source_id) do nothing;
  if r.frequency='weekly' then d:=d+7;else next_month:=(date_trunc('month',d)+interval '1 month')::date;d:=make_date(extract(year from next_month)::int,extract(month from next_month)::int,least(r.anchor_day,extract(day from next_month+interval '1 month'-interval '1 day')::int));end if;
  n:=n+1;if n>5000 then raise exception 'Limite de recorrências excedido';end if;
 end loop;
 -- Internal progression must preserve the original anchor (the edit trigger handles user changes only).
 update recurring_transactions set next_date=d,anchor_day=r.anchor_day where id=r.id and user_id=auth.uid();
 end loop;return n;
end $$;
revoke all on function generate_recurring(date) from public,anon;
grant execute on function generate_recurring(date) to authenticated;

create table if not exists market_data_revisions(id uuid primary key default gen_random_uuid(),table_name text not null,record_key text not null,previous jsonb not null,next jsonb not null,changed_at timestamptz not null default now());
alter table market_data_revisions enable row level security;
drop policy if exists market_read on market_data_revisions;
create policy market_read on market_data_revisions for select to authenticated using(true);
grant select on market_data_revisions to authenticated;
create or replace function audit_market_data() returns trigger language plpgsql security definer set search_path=public as $$
declare before jsonb:=to_jsonb(old)-array['collected_at','id','revision','updated_at'];after jsonb:=to_jsonb(new)-array['collected_at','id','revision','updated_at'];key text;begin
 if before is distinct from after then
  key:=case TG_TABLE_NAME when 'asset_price_history' then (to_jsonb(new)->>'ticker')||'/'||(to_jsonb(new)->>'date')||'/'||(to_jsonb(new)->>'source') when 'fund_nav_history' then (to_jsonb(new)->>'fund_id')||'/'||(to_jsonb(new)->>'date') else to_jsonb(new)->>'source_id' end;
  insert into market_data_revisions(table_name,record_key,previous,next) values(TG_TABLE_NAME,key,before,after);
 end if;return new;
end $$;
drop trigger if exists market_revision on asset_price_history;
create trigger market_revision before update on asset_price_history for each row execute function audit_market_data();
drop trigger if exists market_revision on fund_nav_history;
create trigger market_revision before update on fund_nav_history for each row execute function audit_market_data();
drop trigger if exists market_revision on asset_cash_events;
create trigger market_revision before update on asset_cash_events for each row execute function audit_market_data();

-- STABLE keeps every query on the same PostgreSQL statement snapshot. Every numeric is serialized as text.
create or replace function read_financial_snapshot() returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare tab text;col record;expr text;query text;filter text;records jsonb;result jsonb:='{}';oldest date;begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select least((select min(start_date) from savings_lots),(select min(date) from investment_operations),(select min(date) from investment_opening_positions),(now() at time zone 'America/Sao_Paulo')::date-365) into oldest;
 foreach tab in array array['financial_accounts','account_balances','categories','recurring_transactions','credit_cards','transactions','credit_card_purchases','credit_card_installments','credit_card_invoices','credit_card_payments','savings_goals','savings_lots','savings_movements','savings_reconciliations','investment_assets','investment_opening_positions','investment_operations','investment_income','investment_corporate_actions','manual_asset_prices','financial_liabilities','financial_obligations','budgets','financial_goals','net_worth_snapshots','user_settings','account_reconciliations','invoice_reconciliations','tax_rules','benchmark_rates','asset_cash_events','asset_price_history','fund_nav_history','provider_sync_states','provider_sync_logs'] loop
  expr:='to_jsonb(t)';
  for col in select column_name from information_schema.columns where table_schema='public' and table_name=tab and data_type in ('numeric','decimal','real','double precision') loop
   expr:=expr||format(' || jsonb_build_object(%L,t.%I::text)',col.column_name,col.column_name);
  end loop;
  filter:='';
  if tab='asset_price_history' then filter:='where t.ticker in (select ticker from investment_assets)';
  elsif tab='asset_cash_events' then filter:='where t.ticker in (select ticker from investment_assets)';
  elsif tab='fund_nav_history' then filter:=$f$where t.fund_id in (select regexp_replace(cnpj,'\D','','g')||case when trim(coalesce(share_class,''))='' then '' else ':'||trim(share_class) end from investment_assets where asset_class='fund')$f$;
  elsif tab='benchmark_rates' then filter:=format('where t.date >= %L::date',oldest);
  elsif tab in ('savings_lots','savings_movements','investment_operations') then filter:='where t.status=''confirmed''';
  end if;
  query:=format('select coalesce(jsonb_agg(v),''[]''::jsonb) from (select %s v from public.%I t %s %s) records',expr,tab,filter,case when tab='provider_sync_logs' then 'order by t.started_at desc limit 200' else '' end);
  execute query into records;result:=result||jsonb_build_object(tab,records);
 end loop;return result||jsonb_build_object('snapshot_metadata',jsonb_build_array(jsonb_build_object('benchmark_start',oldest::text)));
end $$;
revoke all on function read_financial_snapshot() from public,anon;
grant execute on function read_financial_snapshot() to authenticated;
