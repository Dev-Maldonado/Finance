-- FINORA: instalação inicial via Supabase SQL Editor.
-- Gerado das migrations. Use apenas em um schema public vazio.
-- Uma transação: erro cancela todas as alterações; não remove dados existentes.
BEGIN;
SET LOCAL search_path = public, extensions;
DO $$ BEGIN
 IF EXISTS (
  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')
   AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')
 ) THEN RAISE EXCEPTION 'Instalação inicial interrompida: schema public contém relações. Revise/backup e aplique migrations incrementais.';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='supabase_migrations' AND tablename='schema_migrations') THEN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations) THEN
   RAISE EXCEPTION 'Projeto já possui histórico de migrations; use o fluxo incremental do CLI.';
  END IF;
 END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
 version text PRIMARY KEY, statements text[], name text
);

-- 202610080001_foundation.sql
create extension if not exists pgcrypto;
create table profiles (id uuid primary key references auth.users on delete cascade, name text not null default '', created_at timestamptz not null default now());
create table financial_accounts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade,
 name text not null, institution text not null default '', kind text not null default 'bank' check(kind in ('bank','cash','savings')), initial_balance numeric(20,2) not null default 0, color text default '#5B35D5', archived boolean not null default false,
 unique(id,user_id));
create table categories (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, name text not null, parent_id uuid, budget numeric(20,2) check(budget>=0), unique(id,user_id), foreign key(parent_id,user_id) references categories(id,user_id));
create table credit_cards (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, name text not null, institution text default '', brand text default '', last_four text check(last_four ~ '^\d{4}$' or last_four=''), credit_limit numeric(20,2) not null check(credit_limit>0), closing_day int not null check(closing_day between 1 and 28), due_day int not null check(due_day between 1 and 28), account_id uuid not null, unique(id,user_id), foreign key(account_id,user_id) references financial_accounts(id,user_id));
create table transactions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, account_id uuid, category_id uuid,
 description text not null, type text not null check(type in ('income','expense','transfer','invoice_payment','investment','redemption','yield','adjustment')), amount numeric(20,2) not null check(amount<>0), date date not null, status text not null default 'confirmed' check(status in ('confirmed','pending')), notes text default '', recurrence text default '', source_id text, group_id uuid,
 unique(user_id,source_id), foreign key(account_id,user_id) references financial_accounts(id,user_id), foreign key(category_id,user_id) references categories(id,user_id));
create index transactions_owner_date on transactions(user_id,date);
create table credit_card_purchases (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, card_id uuid not null, description text not null, amount numeric(20,2) not null check(amount>0), date date not null, installments int not null check(installments between 1 and 120), category_id uuid, unique(id,user_id), foreign key(card_id,user_id) references credit_cards(id,user_id), foreign key(category_id,user_id) references categories(id,user_id));
create table credit_card_invoices (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, card_id uuid not null, due_date date not null, unique(card_id,due_date), unique(id,user_id), foreign key(card_id,user_id) references credit_cards(id,user_id));
create table credit_card_installments (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, purchase_id uuid not null, invoice_id uuid not null, number int not null, amount numeric(20,2) not null check(amount>0), unique(purchase_id,number), foreign key(purchase_id,user_id) references credit_card_purchases(id,user_id), foreign key(invoice_id,user_id) references credit_card_invoices(id,user_id));
create table credit_card_payments (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, invoice_id uuid not null, transaction_id uuid not null unique references transactions, amount numeric(20,2) not null check(amount>0), date date not null, foreign key(invoice_id,user_id) references credit_card_invoices(id,user_id));
create table savings_goals (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, name text not null, description text default '', account_id uuid not null unique, target numeric(20,2) not null check(target>0), target_date date, institution text default '', indexer text not null default 'cdi' check(indexer in ('none','cdi','fixed','selic','manual')), percentage numeric(10,4) not null default 100 check(percentage>=0), annual_rate numeric(10,4) default 0, product text not null default 'custom', tax_exempt boolean not null default false, unique(id,user_id), foreign key(account_id,user_id) references financial_accounts(id,user_id));
create table savings_lots (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, goal_id uuid not null, principal numeric(20,2) not null check(principal>0), remaining numeric(20,2) not null check(remaining>=0), start_date date not null, indexer text not null, percentage numeric(10,4) not null, annual_rate numeric(10,4) default 0, product text not null, tax_exempt boolean not null, unique(id,user_id), foreign key(goal_id,user_id) references savings_goals(id,user_id));
create table savings_movements (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, goal_id uuid not null, lot_id uuid, type text not null check(type in ('deposit','withdrawal','confirmed_yield')), amount numeric(20,2) not null check(amount>0), date date not null, transaction_group uuid, foreign key(goal_id,user_id) references savings_goals(id,user_id), foreign key(lot_id,user_id) references savings_lots(id,user_id));
create table investment_assets (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, ticker text not null, name text not null, asset_class text not null, currency text not null default 'BRL', cnpj text default '', share_class text default '', maturity date, indexer text default '', percentage numeric(10,4), annual_rate numeric(10,4), unique(user_id,ticker), unique(id,user_id));
create table investment_operations (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, asset_id uuid not null, account_id uuid not null, type text not null check(type in ('buy','sell')), quantity numeric(24,8) not null check(quantity>0), price numeric(24,8) not null check(price>0), fees numeric(20,2) not null default 0 check(fees>=0), date date not null, broker text default '', unique(id,user_id), foreign key(asset_id,user_id) references investment_assets(id,user_id), foreign key(account_id,user_id) references financial_accounts(id,user_id));
create table investment_income (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, asset_id uuid not null, description text not null, amount numeric(20,2) not null check(amount>0), date date not null, status text not null default 'announced' check(status in ('announced','received')), account_id uuid, type text default 'dividend' check(type in ('dividend','jcp','interest','amortization')), source_id text, unique(user_id,source_id), foreign key(asset_id,user_id) references investment_assets(id,user_id), foreign key(account_id,user_id) references financial_accounts(id,user_id));
create table investment_corporate_actions (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, asset_id uuid not null, type text not null check(type in ('split','reverse_split','bonus','ticker_change')), ratio numeric(24,8) not null check(ratio>0), date date not null, new_ticker text, foreign key(asset_id,user_id) references investment_assets(id,user_id));
create table budgets (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, name text not null, category_id uuid, amount numeric(20,2) not null check(amount>0), month date not null, foreign key(category_id,user_id) references categories(id,user_id));
create table financial_goals (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, name text not null, kind text default 'savings', target numeric(20,2) not null check(target>0), target_date date);
create table user_settings (user_id uuid primary key default auth.uid() references auth.users on delete cascade, name text default '', currency text default 'BRL');
create table benchmark_rates (id uuid primary key default gen_random_uuid(), series text not null, date date not null, value numeric(24,12) not null check(value>=0), source text not null, collected_at timestamptz not null default now(), validated boolean not null default true, revision int not null default 1, unique(series,date));
create table asset_price_history (id uuid primary key default gen_random_uuid(), ticker text not null, date date not null, price numeric(24,8) not null check(price>0), currency text not null default 'BRL', source text not null, collected_at timestamptz not null default now(), unique(ticker,date,source));
create table fund_registry (id text primary key, name text not null, cnpj text not null, administrator text, share_class text, metadata jsonb default '{}');
create table fund_nav_history (id uuid primary key default gen_random_uuid(), fund_id text not null, date date not null, nav numeric(24,8) not null check(nav>0), source text not null, collected_at timestamptz not null default now(), unique(fund_id,date));
create table provider_sync_logs (id uuid primary key default gen_random_uuid(), provider text not null, started_at timestamptz not null default now(), status text not null, records int default 0, message text default '');
create table provider_sync_states (provider text primary key, last_success timestamptz, last_date date);
create table financial_data_providers (name text primary key, mode text default 'automatic', enabled boolean default true);
insert into financial_data_providers(name) values ('bcb'),('brapi'),('cvm');
create table benchmark_rate_revisions (id uuid primary key default gen_random_uuid(), series text, date date, previous_value numeric(24,12), next_value numeric(24,12), changed_at timestamptz default now());
create or replace function audit_rate() returns trigger language plpgsql as $$begin if new.value<>old.value then insert into benchmark_rate_revisions(series,date,previous_value,next_value) values(old.series,old.date,old.value,new.value); new.revision=old.revision+1; end if; return new; end$$;
create trigger rate_revision before update on benchmark_rates for each row execute function audit_rate();
-- Tenant policies and composite foreign keys prevent cross-user references.
do $$ declare t text; begin
 foreach t in array array['financial_accounts','categories','credit_cards','transactions','credit_card_purchases','credit_card_invoices','credit_card_installments','credit_card_payments','savings_goals','savings_lots','savings_movements','investment_assets','investment_operations','investment_income','investment_corporate_actions','budgets','financial_goals','user_settings'] loop
 execute format('alter table %I enable row level security',t);
 execute format('create policy owner on %I for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid())',t);
 execute format('grant select,insert,update,delete on %I to authenticated',t);
 end loop;
 foreach t in array array['benchmark_rates','asset_price_history','fund_registry','fund_nav_history','provider_sync_logs','provider_sync_states','financial_data_providers','benchmark_rate_revisions'] loop
 execute format('alter table %I enable row level security',t);
 execute format('create policy market_read on %I for select to authenticated using (true)',t);
 execute format('grant select on %I to authenticated',t);
 end loop;
end $$;
alter table profiles enable row level security;
create policy profile_owner on profiles for all to authenticated using(id=auth.uid()) with check(id=auth.uid());
grant select,insert,update on profiles to authenticated;
create view account_balances with (security_invoker=true) as select a.*, (a.initial_balance+coalesce(sum(t.amount) filter(where t.status='confirmed'),0))::text balance from financial_accounts a left join transactions t on t.account_id=a.id group by a.id;
grant select on account_balances to authenticated;

INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('202610080001','foundation',ARRAY[]::text[]);

-- 202610080002_operations.sql
create table operation_requests (user_id uuid not null default auth.uid() references auth.users on delete cascade, request_id uuid not null, result jsonb, primary key(user_id,request_id));
alter table operation_requests enable row level security;
create policy owner on operation_requests for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update on operation_requests to authenticated;
create or replace function execute_operation(action text, payload jsonb, request_id uuid) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare u uuid:=auth.uid(); operation_result jsonb; x uuid; y uuid; z uuid; g uuid:=gen_random_uuid(); a numeric; b numeric; n int; i int; dt date; due date; c credit_cards; goal savings_goals; lot savings_lots; available numeric; portion numeric; left_amount numeric; principal numeric;
begin
 if u is null then raise exception 'Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select r.result into operation_result from operation_requests r where r.user_id=u and r.request_id=execute_operation.request_id;
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
  select coalesce(sum(ci.amount),0)-(select coalesce(sum(cp.amount),0) from credit_card_payments cp join credit_card_invoices inv on inv.id=cp.invoice_id where inv.card_id=c.id) into b from credit_card_installments ci join credit_card_invoices inv on inv.id=ci.invoice_id where inv.card_id=c.id;
  if b+a>c.credit_limit then raise exception 'Limite insuficiente'; end if;
  insert into credit_card_purchases(user_id,card_id,description,amount,date,installments,category_id) values(u,c.id,payload->>'description',a,dt,n,nullif(payload->>'category_id','')::uuid) returning id into x;
  due:=date_trunc('month',dt)::date;
  if extract(day from dt)>=c.closing_day then due:=(due+interval '1 month')::date; end if;
  if c.due_day<=c.closing_day then due:=(due+interval '1 month')::date; end if;
  due:=due+(c.due_day-1);
  b:=trunc(a/n,2);
  for i in 1..n loop
   insert into credit_card_invoices(user_id,card_id,due_date) values(u,c.id,(due+make_interval(months=>i-1))::date) on conflict(card_id,due_date) do update set due_date=excluded.due_date returning id into y;
   insert into credit_card_installments(user_id,purchase_id,invoice_id,number,amount) values(u,x,y,i,case when i=n then a-b*(n-1) else b end);
  end loop;
 when 'pay_invoice' then
  y:=(payload->>'invoice_id')::uuid;
  select coalesce(sum(amount),0) into b from credit_card_installments where invoice_id=y;
  b:=b-(select coalesce(sum(amount),0) from credit_card_payments where invoice_id=y);
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
  if b<=0 or a<=0 or coalesce((payload->>'fees')::numeric,0)<0 then raise exception 'Quantidade/preço/taxas inválidos'; end if;
  y:=(payload->>'asset_id')::uuid;
  if (select currency from investment_assets where id=y)<>'BRL' then raise exception 'Operações em outra moeda exigem suporte cambial; não registre valores como BRL';end if;
  if payload->>'type'='sell' then
   select investment_quantity(y,dt) into available;
   -- Opening positions and corporate events are applied before validating chronological holdings.
   if b>available then raise exception 'Quantidade insuficiente'; end if;
  end if;
  insert into investment_operations(user_id,asset_id,account_id,type,quantity,price,fees,date,broker) values(u,y,(payload->>'account_id')::uuid,payload->>'type',b,a,coalesce((payload->>'fees')::numeric,0),dt,coalesce(payload->>'broker','')) returning id into x;
  a:=round(a*b,2);
  if payload->>'type'='buy' then a:=-a-coalesce((payload->>'fees')::numeric,0); else a:=a-coalesce((payload->>'fees')::numeric,0); end if;
  if a=0 then raise exception 'Valor líquido zero'; end if;
  insert into transactions(user_id,account_id,description,type,amount,date,group_id) values(u,(payload->>'account_id')::uuid,'Operação de investimento','investment',a,dt,x);
 when 'confirm_income' then
  select asset_id,amount into strict y,a from investment_income where id=(payload->>'income_id')::uuid and status='announced' for update;
  update investment_income set status='received',account_id=(payload->>'account_id')::uuid,date=dt where id=(payload->>'income_id')::uuid;
  insert into transactions(user_id,account_id,description,type,amount,date) values(u,(payload->>'account_id')::uuid,'Provento confirmado',case when (select type from investment_income where id=(payload->>'income_id')::uuid)='amortization' then 'redemption' else 'yield' end,a,dt) returning id into x;
 else raise exception 'Operação desconhecida';
 end case;
 operation_result:=jsonb_build_object('id',x,'ok',true);
 update operation_requests set result=operation_result where user_id=u and operation_requests.request_id=execute_operation.request_id;
 return operation_result;
end $$;
revoke all on function execute_operation(text,jsonb,uuid) from public;
grant execute on function execute_operation(text,jsonb,uuid) to authenticated;

INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('202610080002','operations',ARRAY[]::text[]);

-- 202610080003_manual.sql
create table manual_asset_prices (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, asset_id uuid not null, ticker text not null, price numeric(24,8) not null check(price>0), currency text not null default 'BRL', date date not null, source text not null default 'manual', collected_at timestamptz default now(), unique(asset_id,date), foreign key(asset_id,user_id) references investment_assets(id,user_id));
alter table manual_asset_prices enable row level security;
create policy owner on manual_asset_prices for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update,delete on manual_asset_prices to authenticated;

INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('202610080003','manual',ARRAY[]::text[]);

-- 202610080004_audit.sql
alter table transactions drop constraint transactions_status_check;
alter table transactions add constraint transactions_status_check check(status in ('confirmed','pending','cancelled'));
create table transaction_revisions (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, transaction_id uuid not null references transactions, previous jsonb not null, changed_at timestamptz not null default now());
alter table transaction_revisions enable row level security;
create policy owner on transaction_revisions for select to authenticated using(user_id=auth.uid());
grant select on transaction_revisions to authenticated;
create function audit_transaction() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into transaction_revisions(user_id,transaction_id,previous) values(old.user_id,old.id,to_jsonb(old));return new;end $$;
create trigger audit_transaction before update on transactions for each row execute function audit_transaction();
create or replace function revise_transaction(transaction_id uuid, replacement jsonb, cancel boolean default false) returns uuid language plpgsql security invoker set search_path=public as $$
declare t transactions; val numeric;begin
 select * into strict t from transactions where id=transaction_id for update;
 if t.type not in ('income','expense','adjustment','yield') or t.group_id is not null then raise exception 'Movimento vinculado exige conciliação específica'; end if;
 if t.status='cancelled' then raise exception 'Lançamento já cancelado';end if;
 if cancel then update transactions set status='cancelled' where id=t.id;return t.id;end if;
 val:=(replacement->>'amount')::numeric;
 if val<=0 or val<>round(val,2) or replacement->>'type' not in ('income','expense','adjustment','yield') then raise exception 'Valor ou tipo inválido';end if;
 update transactions set account_id=(replacement->>'account_id')::uuid,category_id=nullif(replacement->>'category_id','')::uuid,description=replacement->>'description',type=replacement->>'type',amount=case when replacement->>'type'='expense' then -val else val end,date=(replacement->>'date')::date,status=coalesce(replacement->>'status','confirmed'),notes=coalesce(replacement->>'notes','') where id=t.id;
 return t.id;
end $$;
revoke all on function revise_transaction(uuid,jsonb,boolean) from public;
grant execute on function revise_transaction(uuid,jsonb,boolean) to authenticated;
create table recurring_transactions (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, account_id uuid not null, category_id uuid, description text not null, type text not null check(type in('income','expense')), amount numeric(20,2) not null check(amount>0), next_date date not null, frequency text not null check(frequency in('monthly','weekly')), active boolean not null default true, foreign key(account_id,user_id) references financial_accounts(id,user_id), foreign key(category_id,user_id) references categories(id,user_id));
alter table recurring_transactions enable row level security;
create policy owner on recurring_transactions for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update,delete on recurring_transactions to authenticated;
create function generate_recurring(until_date date) returns int language plpgsql security invoker set search_path=public as $$
declare r recurring_transactions;d date;n int:=0;begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if until_date>current_date then raise exception 'Gere apenas até hoje';end if;
 for r in select * from recurring_transactions where active and next_date<=until_date for update loop
 d:=r.next_date;
 while d<=until_date loop
 insert into transactions(user_id,account_id,category_id,description,type,amount,date,status,source_id) values(r.user_id,r.account_id,r.category_id,r.description,r.type,case when r.type='expense' then -r.amount else r.amount end,d,'pending','recurrence:'||r.id||':'||d) on conflict(user_id,source_id) do nothing;
 d:=case when r.frequency='weekly' then d+7 else (d+interval '1 month')::date end;n:=n+1;if n>5000 then raise exception 'Limite de recorrências excedido';end if;
 end loop;update recurring_transactions set next_date=d where id=r.id;
 end loop;return n;
end $$;
revoke all on function generate_recurring(date) from public;grant execute on function generate_recurring(date) to authenticated;
create table net_worth_snapshots (id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users on delete cascade,date date not null,assets numeric(20,2) not null,liabilities numeric(20,2) not null,source text default 'user_snapshot',unique(user_id,date));
alter table net_worth_snapshots enable row level security;create policy owner on net_worth_snapshots for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());grant select,insert,update on net_worth_snapshots to authenticated;
create table tax_rules (id uuid primary key default gen_random_uuid(),product text not null,valid_from date not null,valid_to date,min_days int not null,max_days int,ir_rate numeric(8,5) not null,iof_applicable boolean not null default true,source text not null);
alter table tax_rules enable row level security;create policy rules_read on tax_rules for select to authenticated using(true);grant select on tax_rules to authenticated;
insert into tax_rules(product,valid_from,min_days,max_days,ir_rate,source) select product,'2005-01-01'::date,min_days,max_days,rate,'Lei 11.033/2004; verificar vigência antes de produção' from unnest(array['cdb','rdb','treasury']) product cross join (values(0,180,0.225),(181,360,0.20),(361,720,0.175),(721,null,0.15)) r(min_days,max_days,rate);

INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('202610080004','audit',ARRAY[]::text[]);

-- 202610080005_rpc_fix.sql
create or replace function execute_operation(action text, payload jsonb, request_id uuid) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare u uuid:=auth.uid(); operation_result jsonb; x uuid; y uuid; z uuid; g uuid:=gen_random_uuid(); a numeric; b numeric; n int; i int; dt date; due date; c credit_cards; goal savings_goals; lot savings_lots; available numeric; portion numeric; left_amount numeric; principal numeric;
begin
 if u is null then raise exception 'Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select r.result into operation_result from operation_requests r where r.user_id=u and r.request_id=execute_operation.request_id;
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
  select coalesce(sum(ci.amount),0)-(select coalesce(sum(cp.amount),0) from credit_card_payments cp join credit_card_invoices inv on inv.id=cp.invoice_id where inv.card_id=c.id) into b from credit_card_installments ci join credit_card_invoices inv on inv.id=ci.invoice_id where inv.card_id=c.id;
  if b+a>c.credit_limit then raise exception 'Limite insuficiente'; end if;
  insert into credit_card_purchases(user_id,card_id,description,amount,date,installments,category_id) values(u,c.id,payload->>'description',a,dt,n,nullif(payload->>'category_id','')::uuid) returning id into x;
  due:=date_trunc('month',dt)::date;
  if extract(day from dt)>=c.closing_day then due:=(due+interval '1 month')::date; end if;
  if c.due_day<=c.closing_day then due:=(due+interval '1 month')::date; end if;
  due:=due+(c.due_day-1);
  b:=trunc(a/n,2);
  for i in 1..n loop
   insert into credit_card_invoices(user_id,card_id,due_date) values(u,c.id,(due+make_interval(months=>i-1))::date) on conflict(card_id,due_date) do update set due_date=excluded.due_date returning id into y;
   insert into credit_card_installments(user_id,purchase_id,invoice_id,number,amount) values(u,x,y,i,case when i=n then a-b*(n-1) else b end);
  end loop;
 when 'pay_invoice' then
  y:=(payload->>'invoice_id')::uuid;
  select coalesce(sum(amount),0) into b from credit_card_installments where invoice_id=y;
  b:=b-(select coalesce(sum(amount),0) from credit_card_payments where invoice_id=y);
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
  if b<=0 or a<=0 or coalesce((payload->>'fees')::numeric,0)<0 then raise exception 'Quantidade/preço/taxas inválidos'; end if;
  y:=(payload->>'asset_id')::uuid;
  if payload->>'type'='sell' then
   select coalesce(sum(case when type='buy' then quantity else -quantity end),0) into available from investment_operations where asset_id=y;
   -- Corporate events are applied to chronological positions by the backend. SQL disallows selling unadjusted holdings.
   if b>available then raise exception 'Quantidade insuficiente'; end if;
  end if;
  insert into investment_operations(user_id,asset_id,account_id,type,quantity,price,fees,date,broker) values(u,y,(payload->>'account_id')::uuid,payload->>'type',b,a,coalesce((payload->>'fees')::numeric,0),dt,coalesce(payload->>'broker','')) returning id into x;
  a:=round(a*b,2);
  if payload->>'type'='buy' then a:=-a-coalesce((payload->>'fees')::numeric,0); else a:=a-coalesce((payload->>'fees')::numeric,0); end if;
  if a=0 then raise exception 'Valor líquido zero'; end if;
  insert into transactions(user_id,account_id,description,type,amount,date,group_id) values(u,(payload->>'account_id')::uuid,'Operação de investimento','investment',a,dt,x);
 when 'confirm_income' then
  select asset_id,amount into strict y,a from investment_income where id=(payload->>'income_id')::uuid and status='announced' for update;
  update investment_income set status='received',account_id=(payload->>'account_id')::uuid,date=dt where id=(payload->>'income_id')::uuid;
  insert into transactions(user_id,account_id,description,type,amount,date) values(u,(payload->>'account_id')::uuid,'Provento confirmado','yield',a,dt) returning id into x;
 else raise exception 'Operação desconhecida';
 end case;
 operation_result:=jsonb_build_object('id',x,'ok',true);
 update operation_requests set result=operation_result where user_id=u and operation_requests.request_id=execute_operation.request_id;
 return operation_result;
end $$;
revoke all on function execute_operation(text,jsonb,uuid) from public;
grant execute on function execute_operation(text,jsonb,uuid) to authenticated;

INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('202610080005','rpc_fix',ARRAY[]::text[]);

-- 202610080006_integrity.sql
create function validate_category_tree() returns trigger language plpgsql security invoker as $$
begin
 if new.parent_id=new.id then raise exception 'Uma categoria não pode ser filha de si mesma';end if;
 if exists(with recursive ancestors as (select id,parent_id,array[id] visited from categories where id=new.parent_id union all select c.id,c.parent_id,a.visited||c.id from categories c join ancestors a on c.id=a.parent_id where not c.id=any(a.visited)) select 1 from ancestors where id=new.id) then raise exception 'Hierarquia circular de categorias';end if;
 return new;
end $$;
create trigger category_tree before insert or update on categories for each row execute function validate_category_tree();
create function investment_quantity(asset uuid,until_date date) returns numeric language plpgsql security invoker set search_path=public as $$
declare item record;q numeric:=0;begin
 for item in select date,quantity change,null::numeric ratio,1 kind from investment_operations where asset_id=asset and type='buy' and date<=until_date union all select date,-quantity,null::numeric,1 from investment_operations where asset_id=asset and type='sell' and date<=until_date union all select date,0,ratio,0 from investment_corporate_actions where asset_id=asset and type<>'ticker_change' and date<=until_date order by date,kind loop
 if item.ratio is not null then q:=q*item.ratio;else q:=q+item.change;end if;
 if q<0 then raise exception 'Operação gera posição negativa no histórico';end if;
 end loop;return q;
end $$;
create function validate_investment_timeline() returns trigger language plpgsql security invoker as $$begin perform investment_quantity(new.asset_id,'9999-12-31'::date);return new;end $$;
create trigger investment_timeline after insert or update on investment_operations for each row execute function validate_investment_timeline();
create trigger corporate_timeline after insert or update on investment_corporate_actions for each row execute function validate_investment_timeline();
revoke all on function investment_quantity(uuid,date) from public;grant execute on function investment_quantity(uuid,date) to authenticated;
create or replace view account_balances with (security_invoker=true) as select a.*, (a.initial_balance+coalesce(sum(t.amount) filter(where t.status='confirmed' and t.date<=(now() at time zone 'America/Sao_Paulo')::date),0))::text balance from financial_accounts a left join transactions t on t.account_id=a.id group by a.id;

INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('202610080006','integrity',ARRAY[]::text[]);

-- 202610080007_operations_events.sql
create or replace function execute_operation(action text, payload jsonb, request_id uuid) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare u uuid:=auth.uid(); operation_result jsonb; x uuid; y uuid; z uuid; g uuid:=gen_random_uuid(); a numeric; b numeric; n int; i int; dt date; due date; c credit_cards; goal savings_goals; lot savings_lots; available numeric; portion numeric; left_amount numeric; principal numeric;
begin
 if u is null then raise exception 'Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select r.result into operation_result from operation_requests r where r.user_id=u and r.request_id=execute_operation.request_id;
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
  select coalesce(sum(ci.amount),0)-(select coalesce(sum(cp.amount),0) from credit_card_payments cp join credit_card_invoices inv on inv.id=cp.invoice_id where inv.card_id=c.id) into b from credit_card_installments ci join credit_card_invoices inv on inv.id=ci.invoice_id where inv.card_id=c.id;
  if b+a>c.credit_limit then raise exception 'Limite insuficiente'; end if;
  insert into credit_card_purchases(user_id,card_id,description,amount,date,installments,category_id) values(u,c.id,payload->>'description',a,dt,n,nullif(payload->>'category_id','')::uuid) returning id into x;
  due:=date_trunc('month',dt)::date;
  if extract(day from dt)>=c.closing_day then due:=(due+interval '1 month')::date; end if;
  if c.due_day<=c.closing_day then due:=(due+interval '1 month')::date; end if;
  due:=due+(c.due_day-1);
  b:=trunc(a/n,2);
  for i in 1..n loop
   insert into credit_card_invoices(user_id,card_id,due_date) values(u,c.id,(due+make_interval(months=>i-1))::date) on conflict(card_id,due_date) do update set due_date=excluded.due_date returning id into y;
   insert into credit_card_installments(user_id,purchase_id,invoice_id,number,amount) values(u,x,y,i,case when i=n then a-b*(n-1) else b end);
  end loop;
 when 'pay_invoice' then
  y:=(payload->>'invoice_id')::uuid;
  select coalesce(sum(amount),0) into b from credit_card_installments where invoice_id=y;
  b:=b-(select coalesce(sum(amount),0) from credit_card_payments where invoice_id=y);
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
  if b<=0 or a<=0 or coalesce((payload->>'fees')::numeric,0)<0 then raise exception 'Quantidade/preço/taxas inválidos'; end if;
  y:=(payload->>'asset_id')::uuid;
  if payload->>'type'='sell' then
   select investment_quantity(y,dt) into available;
   -- Corporate events are applied to chronological positions by the backend. SQL disallows selling unadjusted holdings.
   if b>available then raise exception 'Quantidade insuficiente'; end if;
  end if;
  insert into investment_operations(user_id,asset_id,account_id,type,quantity,price,fees,date,broker) values(u,y,(payload->>'account_id')::uuid,payload->>'type',b,a,coalesce((payload->>'fees')::numeric,0),dt,coalesce(payload->>'broker','')) returning id into x;
  a:=round(a*b,2);
  if payload->>'type'='buy' then a:=-a-coalesce((payload->>'fees')::numeric,0); else a:=a-coalesce((payload->>'fees')::numeric,0); end if;
  if a=0 then raise exception 'Valor líquido zero'; end if;
  insert into transactions(user_id,account_id,description,type,amount,date,group_id) values(u,(payload->>'account_id')::uuid,'Operação de investimento','investment',a,dt,x);
 when 'confirm_income' then
  select asset_id,amount into strict y,a from investment_income where id=(payload->>'income_id')::uuid and status='announced' for update;
  update investment_income set status='received',account_id=(payload->>'account_id')::uuid,date=dt where id=(payload->>'income_id')::uuid;
  insert into transactions(user_id,account_id,description,type,amount,date) values(u,(payload->>'account_id')::uuid,'Provento confirmado',case when (select type from investment_income where id=(payload->>'income_id')::uuid)='amortization' then 'redemption' else 'yield' end,a,dt) returning id into x;
 else raise exception 'Operação desconhecida';
 end case;
 operation_result:=jsonb_build_object('id',x,'ok',true);
 update operation_requests set result=operation_result where user_id=u and operation_requests.request_id=execute_operation.request_id;
 return operation_result;
end $$;
revoke all on function execute_operation(text,jsonb,uuid) from public;
grant execute on function execute_operation(text,jsonb,uuid) to authenticated;

INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('202610080007','operations_events',ARRAY[]::text[]);

-- 202610080008_planning.sql
create table financial_liabilities(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users on delete cascade,name text not null,amount numeric(20,2) not null check(amount>=0),due_date date,notes text default '');
alter table financial_liabilities enable row level security;
create policy owner on financial_liabilities for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update,delete on financial_liabilities to authenticated;
-- Liability records are manual balances; invoice liabilities are calculated separately.
create table savings_reconciliations(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users on delete cascade,goal_id uuid not null,date date not null,confirmed_balance numeric(20,2) not null check(confirmed_balance>=0),notes text,foreign key(goal_id,user_id) references savings_goals(id,user_id));
alter table savings_reconciliations enable row level security;create policy owner on savings_reconciliations for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());grant select,insert,update on savings_reconciliations to authenticated;

INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('202610080008','planning',ARRAY[]::text[]);

-- 202610080009_currency_guard.sql
create or replace function execute_operation(action text, payload jsonb, request_id uuid) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare u uuid:=auth.uid(); operation_result jsonb; x uuid; y uuid; z uuid; g uuid:=gen_random_uuid(); a numeric; b numeric; n int; i int; dt date; due date; c credit_cards; goal savings_goals; lot savings_lots; available numeric; portion numeric; left_amount numeric; principal numeric;
begin
 if u is null then raise exception 'Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select r.result into operation_result from operation_requests r where r.user_id=u and r.request_id=execute_operation.request_id;
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
  select coalesce(sum(ci.amount),0)-(select coalesce(sum(cp.amount),0) from credit_card_payments cp join credit_card_invoices inv on inv.id=cp.invoice_id where inv.card_id=c.id) into b from credit_card_installments ci join credit_card_invoices inv on inv.id=ci.invoice_id where inv.card_id=c.id;
  if b+a>c.credit_limit then raise exception 'Limite insuficiente'; end if;
  insert into credit_card_purchases(user_id,card_id,description,amount,date,installments,category_id) values(u,c.id,payload->>'description',a,dt,n,nullif(payload->>'category_id','')::uuid) returning id into x;
  due:=date_trunc('month',dt)::date;
  if extract(day from dt)>=c.closing_day then due:=(due+interval '1 month')::date; end if;
  if c.due_day<=c.closing_day then due:=(due+interval '1 month')::date; end if;
  due:=due+(c.due_day-1);
  b:=trunc(a/n,2);
  for i in 1..n loop
   insert into credit_card_invoices(user_id,card_id,due_date) values(u,c.id,(due+make_interval(months=>i-1))::date) on conflict(card_id,due_date) do update set due_date=excluded.due_date returning id into y;
   insert into credit_card_installments(user_id,purchase_id,invoice_id,number,amount) values(u,x,y,i,case when i=n then a-b*(n-1) else b end);
  end loop;
 when 'pay_invoice' then
  y:=(payload->>'invoice_id')::uuid;
  select coalesce(sum(amount),0) into b from credit_card_installments where invoice_id=y;
  b:=b-(select coalesce(sum(amount),0) from credit_card_payments where invoice_id=y);
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
  if b<=0 or a<=0 or coalesce((payload->>'fees')::numeric,0)<0 then raise exception 'Quantidade/preço/taxas inválidos'; end if;
  y:=(payload->>'asset_id')::uuid;
  if (select currency from investment_assets where id=y)<>'BRL' then raise exception 'Operações em outra moeda exigem suporte cambial; não registre valores como BRL';end if;
  if payload->>'type'='sell' then
   select coalesce(sum(case when type='buy' then quantity else -quantity end),0) into available from investment_operations where asset_id=y;
   -- Corporate events are applied to chronological positions by the backend. SQL disallows selling unadjusted holdings.
   if b>available then raise exception 'Quantidade insuficiente'; end if;
  end if;
  insert into investment_operations(user_id,asset_id,account_id,type,quantity,price,fees,date,broker) values(u,y,(payload->>'account_id')::uuid,payload->>'type',b,a,coalesce((payload->>'fees')::numeric,0),dt,coalesce(payload->>'broker','')) returning id into x;
  a:=round(a*b,2);
  if payload->>'type'='buy' then a:=-a-coalesce((payload->>'fees')::numeric,0); else a:=a-coalesce((payload->>'fees')::numeric,0); end if;
  if a=0 then raise exception 'Valor líquido zero'; end if;
  insert into transactions(user_id,account_id,description,type,amount,date,group_id) values(u,(payload->>'account_id')::uuid,'Operação de investimento','investment',a,dt,x);
 when 'confirm_income' then
  select asset_id,amount into strict y,a from investment_income where id=(payload->>'income_id')::uuid and status='announced' for update;
  update investment_income set status='received',account_id=(payload->>'account_id')::uuid,date=dt where id=(payload->>'income_id')::uuid;
  insert into transactions(user_id,account_id,description,type,amount,date) values(u,(payload->>'account_id')::uuid,'Provento confirmado','yield',a,dt) returning id into x;
 else raise exception 'Operação desconhecida';
 end case;
 operation_result:=jsonb_build_object('id',x,'ok',true);
 update operation_requests set result=operation_result where user_id=u and operation_requests.request_id=execute_operation.request_id;
 return operation_result;
end $$;
revoke all on function execute_operation(text,jsonb,uuid) from public;
grant execute on function execute_operation(text,jsonb,uuid) to authenticated;

INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('202610080009','currency_guard',ARRAY[]::text[]);

-- 202610080010_ticker.sql
create function apply_ticker_change() returns trigger language plpgsql security invoker set search_path=public as $$begin
 if new.type='ticker_change' then
  if new.new_ticker is null or new.new_ticker !~ '^[A-Za-z0-9.-]{1,30}$' then raise exception 'Informe um novo ticker válido';end if;
  update investment_assets set ticker=upper(new.new_ticker) where id=new.asset_id;
 end if;return new;
end $$;
create trigger corporate_ticker after insert on investment_corporate_actions for each row execute function apply_ticker_change();

INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('202610080010','ticker',ARRAY[]::text[]);

-- 202610080011_opening_import.sql
create table investment_opening_positions(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users on delete cascade,asset_id uuid not null,quantity numeric(24,8) not null check(quantity>0),cost numeric(20,2) not null check(cost>=0),date date not null,notes text default '',unique(asset_id),foreign key(asset_id,user_id) references investment_assets(id,user_id));
alter table investment_opening_positions enable row level security;create policy owner on investment_opening_positions for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());grant select,insert on investment_opening_positions to authenticated;
create or replace function investment_quantity(asset uuid,until_date date) returns numeric language plpgsql security invoker set search_path=public as $$
declare item record;q numeric:=0;begin
 for item in select date,quantity change,null::numeric ratio,1 kind from investment_operations where asset_id=asset and type='buy' and date<=until_date union all select date,-quantity,null::numeric,2 from investment_operations where asset_id=asset and type='sell' and date<=until_date union all select date,quantity,null::numeric,1 from investment_opening_positions where asset_id=asset and date<=until_date union all select date,0,ratio,0 from investment_corporate_actions where asset_id=asset and type<>'ticker_change' and date<=until_date order by date,kind loop
 if item.ratio is not null then q:=q*item.ratio;else q:=q+item.change;end if;
 if q<0 then raise exception 'Operação gera posição negativa no histórico';end if;
 end loop;return q;
end $$;
create trigger opening_timeline after insert on investment_opening_positions for each row execute function validate_investment_timeline();
create function import_investment_operations(items jsonb) returns int language plpgsql security invoker set search_path=public as $$
declare item jsonb;n int:=0;begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if jsonb_array_length(items)>1000 then raise exception 'Máximo de 1000 operações por importação';end if;
 for item in select value from jsonb_array_elements(items) loop
 perform execute_operation('investment',item->'payload',(item->>'request_id')::uuid);n:=n+1;
 end loop;return n;
end $$;
revoke all on function import_investment_operations(jsonb) from public;grant execute on function import_investment_operations(jsonb) to authenticated;

INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('202610080011','opening_import',ARRAY[]::text[]);

-- 202610080012_daily_order.sql
create or replace function investment_quantity(asset uuid,until_date date) returns numeric language plpgsql security invoker set search_path=public as $$
declare item record;q numeric:=0;begin
 for item in select date,quantity change,null::numeric ratio,1 kind from investment_operations where asset_id=asset and type='buy' and date<=until_date union all select date,-quantity,null::numeric,2 from investment_operations where asset_id=asset and type='sell' and date<=until_date union all select date,quantity,null::numeric,1 from investment_opening_positions where asset_id=asset and date<=until_date union all select date,0,ratio,0 from investment_corporate_actions where asset_id=asset and type<>'ticker_change' and date<=until_date order by date,kind loop
 if item.ratio is not null then q:=q*item.ratio;else q:=q+item.change;end if;
 if q<0 then raise exception 'Operação gera posição negativa no histórico';end if;
 end loop;return q;
end $$;

INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('202610080012','daily_order',ARRAY[]::text[]);

-- 202610080013_position_rpc.sql
create or replace function execute_operation(action text, payload jsonb, request_id uuid) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare u uuid:=auth.uid(); operation_result jsonb; x uuid; y uuid; z uuid; g uuid:=gen_random_uuid(); a numeric; b numeric; n int; i int; dt date; due date; c credit_cards; goal savings_goals; lot savings_lots; available numeric; portion numeric; left_amount numeric; principal numeric;
begin
 if u is null then raise exception 'Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select r.result into operation_result from operation_requests r where r.user_id=u and r.request_id=execute_operation.request_id;
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
  select coalesce(sum(ci.amount),0)-(select coalesce(sum(cp.amount),0) from credit_card_payments cp join credit_card_invoices inv on inv.id=cp.invoice_id where inv.card_id=c.id) into b from credit_card_installments ci join credit_card_invoices inv on inv.id=ci.invoice_id where inv.card_id=c.id;
  if b+a>c.credit_limit then raise exception 'Limite insuficiente'; end if;
  insert into credit_card_purchases(user_id,card_id,description,amount,date,installments,category_id) values(u,c.id,payload->>'description',a,dt,n,nullif(payload->>'category_id','')::uuid) returning id into x;
  due:=date_trunc('month',dt)::date;
  if extract(day from dt)>=c.closing_day then due:=(due+interval '1 month')::date; end if;
  if c.due_day<=c.closing_day then due:=(due+interval '1 month')::date; end if;
  due:=due+(c.due_day-1);
  b:=trunc(a/n,2);
  for i in 1..n loop
   insert into credit_card_invoices(user_id,card_id,due_date) values(u,c.id,(due+make_interval(months=>i-1))::date) on conflict(card_id,due_date) do update set due_date=excluded.due_date returning id into y;
   insert into credit_card_installments(user_id,purchase_id,invoice_id,number,amount) values(u,x,y,i,case when i=n then a-b*(n-1) else b end);
  end loop;
 when 'pay_invoice' then
  y:=(payload->>'invoice_id')::uuid;
  select coalesce(sum(amount),0) into b from credit_card_installments where invoice_id=y;
  b:=b-(select coalesce(sum(amount),0) from credit_card_payments where invoice_id=y);
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
  if b<=0 or a<=0 or coalesce((payload->>'fees')::numeric,0)<0 then raise exception 'Quantidade/preço/taxas inválidos'; end if;
  y:=(payload->>'asset_id')::uuid;
  if (select currency from investment_assets where id=y)<>'BRL' then raise exception 'Operações em outra moeda exigem suporte cambial; não registre valores como BRL';end if;
  if payload->>'type'='sell' then
   select investment_quantity(y,dt) into available;
   -- Opening positions and corporate events are applied before validating chronological holdings.
   if b>available then raise exception 'Quantidade insuficiente'; end if;
  end if;
  insert into investment_operations(user_id,asset_id,account_id,type,quantity,price,fees,date,broker) values(u,y,(payload->>'account_id')::uuid,payload->>'type',b,a,coalesce((payload->>'fees')::numeric,0),dt,coalesce(payload->>'broker','')) returning id into x;
  a:=round(a*b,2);
  if payload->>'type'='buy' then a:=-a-coalesce((payload->>'fees')::numeric,0); else a:=a-coalesce((payload->>'fees')::numeric,0); end if;
  if a=0 then raise exception 'Valor líquido zero'; end if;
  insert into transactions(user_id,account_id,description,type,amount,date,group_id) values(u,(payload->>'account_id')::uuid,'Operação de investimento','investment',a,dt,x);
 when 'confirm_income' then
  select asset_id,amount into strict y,a from investment_income where id=(payload->>'income_id')::uuid and status='announced' for update;
  update investment_income set status='received',account_id=(payload->>'account_id')::uuid,date=dt where id=(payload->>'income_id')::uuid;
  insert into transactions(user_id,account_id,description,type,amount,date) values(u,(payload->>'account_id')::uuid,'Provento confirmado',case when (select type from investment_income where id=(payload->>'income_id')::uuid)='amortization' then 'redemption' else 'yield' end,a,dt) returning id into x;
 else raise exception 'Operação desconhecida';
 end case;
 operation_result:=jsonb_build_object('id',x,'ok',true);
 update operation_requests set result=operation_result where user_id=u and operation_requests.request_id=execute_operation.request_id;
 return operation_result;
end $$;
revoke all on function execute_operation(text,jsonb,uuid) from public;
grant execute on function execute_operation(text,jsonb,uuid) to authenticated;

INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('202610080013','position_rpc',ARRAY[]::text[]);

-- 202610080014_recurrence_anchor.sql
alter table recurring_transactions add column anchor_day int check(anchor_day between 1 and 31);
update recurring_transactions set anchor_day=extract(day from next_date);
create function recurrence_anchor() returns trigger language plpgsql as $$begin new.anchor_day:=coalesce(new.anchor_day,extract(day from new.next_date)::int);return new;end $$;
create trigger recurrence_anchor before insert on recurring_transactions for each row execute function recurrence_anchor();
create or replace function generate_recurring(until_date date) returns int language plpgsql security invoker set search_path=public as $$
declare r recurring_transactions;d date;next_month date;n int:=0;begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if until_date>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Gere apenas até hoje';end if;
 for r in select * from recurring_transactions where active and next_date<=until_date for update loop
 d:=r.next_date;
 while d<=until_date loop
 insert into transactions(user_id,account_id,category_id,description,type,amount,date,status,source_id) values(r.user_id,r.account_id,r.category_id,r.description,r.type,case when r.type='expense' then -r.amount else r.amount end,d,'pending','recurrence:'||r.id||':'||d) on conflict(user_id,source_id) do nothing;
 if r.frequency='weekly' then d:=d+7;else next_month:=(date_trunc('month',d)+interval '1 month')::date;d:=make_date(extract(year from next_month)::int,extract(month from next_month)::int,least(r.anchor_day,extract(day from next_month+interval '1 month'-interval '1 day')::int));end if;
 n:=n+1;if n>5000 then raise exception 'Limite de recorrências excedido';end if;
 end loop;update recurring_transactions set next_date=d where id=r.id;
 end loop;return n;
end $$;

INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('202610080014','recurrence_anchor',ARRAY[]::text[]);

-- 202610080015_cvm_nav.sql
-- Official CVM reports can publish zero or negative NAV. Preserve the published value and provenance.
alter table fund_nav_history drop constraint fund_nav_history_nav_check;

INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('202610080015','cvm_nav',ARRAY[]::text[]);

-- 202610080016_dividend_events.sql
create table asset_cash_events(id uuid primary key default gen_random_uuid(),ticker text not null,date_com date not null,payment_date date not null,rate numeric(24,8) not null check(rate>0),label text not null,source text not null,source_id text not null unique,collected_at timestamptz not null default now());
alter table asset_cash_events enable row level security;create policy market_read on asset_cash_events for select to authenticated using(true);grant select on asset_cash_events to authenticated;

INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('202610080016','dividend_events',ARRAY[]::text[]);

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
