-- User explicitly requested a fresh investment start. Preserve all cash ledger amounts/statuses.
create temporary table finora_manual_cleanup_guard on commit drop as select jsonb_build_object(
'financial_accounts',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) from financial_accounts x),
'categories',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) from categories x),
'credit_cards',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) from credit_cards x),
'transactions',(select md5(coalesce(jsonb_agg(to_jsonb(x)-'linked_income_id' order by id)::text,'[]')) from transactions x),
'credit_card_purchases',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) from credit_card_purchases x),
'credit_card_invoices',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) from credit_card_invoices x),
'credit_card_installments',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) from credit_card_installments x),
'credit_card_payments',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) from credit_card_payments x),
'savings_goals',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) from savings_goals x),
'savings_lots',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) from savings_lots x),
'savings_movements',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) from savings_movements x),
'budgets',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) from budgets x),
'financial_goals',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) from financial_goals x),
'financial_liabilities',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) from financial_liabilities x),
'financial_obligations',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) from financial_obligations x),
'net_worth_snapshots',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) from net_worth_snapshots x),
'account_balances',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) from account_balances x)
) as fingerprint;
update transactions set linked_income_id=null where linked_income_id is not null;
delete from investment_income;
delete from investment_corporate_actions;
delete from investment_operations;
delete from investment_opening_positions;
delete from manual_asset_prices;
delete from investment_assets;
delete from asset_price_history;
delete from asset_cash_events;
delete from fund_nav_history;
delete from fund_registry;
delete from market_data_revisions where table_name in ('asset_price_history','asset_cash_events','fund_nav_history');
delete from provider_sync_states where provider like 'brapi%' or provider like 'cvm%' or provider like 'quotes%';
delete from provider_sync_logs where provider like 'brapi%' or provider like 'cvm%' or provider like 'quotes%';
delete from financial_integrity_revisions where entity in ('investment_assets','investment_operations','investment_income','investment_opening_positions','investment_corporate_actions','manual_asset_prices');
delete from operation_requests where action in ('investment','confirm_income');
DO $guard$ BEGIN
 IF (select fingerprint from finora_manual_cleanup_guard) IS DISTINCT FROM jsonb_build_object(
'financial_accounts',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) from financial_accounts x),
'categories',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) from categories x),
'credit_cards',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) from credit_cards x),
'transactions',(select md5(coalesce(jsonb_agg(to_jsonb(x)-'linked_income_id' order by id)::text,'[]')) from transactions x),
'credit_card_purchases',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) from credit_card_purchases x),
'credit_card_invoices',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) from credit_card_invoices x),
'credit_card_installments',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) from credit_card_installments x),
'credit_card_payments',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) from credit_card_payments x),
'savings_goals',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) from savings_goals x),
'savings_lots',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) from savings_lots x),
'savings_movements',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) from savings_movements x),
'budgets',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) from budgets x),
'financial_goals',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) from financial_goals x),
'financial_liabilities',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) from financial_liabilities x),
'financial_obligations',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) from financial_obligations x),
'net_worth_snapshots',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) from net_worth_snapshots x),
'account_balances',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by id)::text,'[]')) from account_balances x)
) THEN
  RAISE EXCEPTION 'Investment cleanup attempted to change other financial data';
 END IF;
END $guard$;
-- Historical migration functions/tables remain for reproducible upgrades; no old investment API is exposed.
alter table investment_assets add column manual_control boolean not null default true;
alter table investment_assets add column manual_kind text check(manual_kind in ('fund','crypto'));

create function guard_manual_investment_name() returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));
 if exists(select 1 from investment_assets where user_id=new.user_id and id<>new.id
 and lower(regexp_replace(trim(name),'\s+',' ','g'))=lower(regexp_replace(trim(new.name),'\s+',' ','g'))) then
  raise exception 'Já existe um investimento com esse nome. Adicione uma compra ao cadastro existente';
 end if;return new;
end $$;
revoke all on function guard_manual_investment_name() from public,anon,authenticated;
create trigger manual_investment_name before insert or update of name on investment_assets for each row execute function guard_manual_investment_name();

create table manual_investment_purchases (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade,
 asset_id uuid not null, quantity numeric(24,8) not null check(quantity>0 and quantity<>'NaN'::numeric),
 amount numeric(20,2) not null check(amount>0 and amount<>'NaN'::numeric), date date not null,
 status text not null default 'confirmed' check(status in ('confirmed','cancelled')),
 foreign key(asset_id,user_id) references investment_assets(id,user_id)
);
create table manual_investment_updates (
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users on delete cascade,
 asset_id uuid not null,month date not null check(extract(day from month)=1),date date not null,
 price numeric(24,8) not null check(price>=0 and price<>'NaN'::numeric),updated_at timestamptz not null default now(),
 unique(asset_id,month),foreign key(asset_id,user_id) references investment_assets(id,user_id),check(date_trunc('month',date)::date=month)
);
alter table manual_investment_purchases enable row level security;
alter table manual_investment_updates enable row level security;
create policy owner on manual_investment_purchases for select to authenticated using(user_id=auth.uid());
create policy owner on manual_investment_updates for select to authenticated using(user_id=auth.uid());
grant select on manual_investment_purchases,manual_investment_updates to authenticated;
revoke insert,update,delete on manual_investment_purchases,manual_investment_updates from authenticated,anon;
grant all on manual_investment_purchases,manual_investment_updates to service_role;

create or replace function manual_investment_operation(action text,payload jsonb,request_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); a uuid;record_id uuid;req operation_requests;old jsonb;
 name_value text;kind_value text;qty numeric;paid numeric;price_value numeric;dt date;
 fingerprint text:=encode(sha256(convert_to(payload::text,'UTF8')),'hex');result jsonb;
begin
 if u is null or request_id is null or jsonb_typeof(payload)<>'object' then raise exception 'Authentication required';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select * into req from operation_requests r where r.user_id=u and r.request_id=manual_investment_operation.request_id;
 if found then
  if req.action is distinct from 'manual:'||action or req.payload_hash is distinct from fingerprint then raise exception 'Chave de operação reutilizada com dados diferentes';end if;
  if req.result is null then raise exception 'Operação anterior incompleta';end if;return req.result;
 end if;
 if action not in ('create','asset','purchase','purchase-delete','price','price-delete') then raise exception 'Operação manual inválida';end if;
 record_id:=nullif(payload->>'id','')::uuid;a:=nullif(payload->>'asset_id','')::uuid;
 if action in ('create','asset') then
  name_value:=regexp_replace(trim(payload->>'name'),'\s+',' ','g');kind_value:=payload->>'manual_kind';
  if name_value is null or length(name_value) not between 1 and 200 or kind_value not in ('fund','crypto') or kind_value is null then raise exception 'Informe nome e tipo do investimento';end if;
  if action='asset' then a:=record_id;perform financial_owned('investment_assets',a);end if;
  if exists(select 1 from investment_assets where user_id=u and lower(regexp_replace(trim(name),'\s+',' ','g'))=lower(name_value) and id is distinct from a) then raise exception 'Já existe um investimento com esse nome. Adicione uma compra ao cadastro existente';end if;
  if action='create' then
   a:=gen_random_uuid();insert into investment_assets(id,user_id,ticker,name,asset_class,currency,manual_control,manual_kind)
   values(a,u,'M-'||substr(replace(a::text,'-',''),1,16),name_value,'custom','BRL',true,kind_value);
  else
   select to_jsonb(t) into old from investment_assets t where id=a and user_id=u;
   update investment_assets set name=name_value,manual_kind=kind_value,manual_control=true where id=a and user_id=u;
  end if;
 end if;
 if action in ('create','purchase') then
  perform financial_owned('investment_assets',a);
  if action='purchase' and record_id is not null then
   select to_jsonb(t),asset_id into strict old,a from manual_investment_purchases t where id=record_id and asset_id=a and user_id=u and status='confirmed' for update;
  end if;
  perform financial_owned('investment_assets',a);
  if not exists(select 1 from investment_assets where id=a and user_id=u and currency='BRL') then raise exception 'O controle manual utiliza valores em reais';end if;
  if coalesce(payload->>'quantity','') !~ '^[0-9]{1,12}(\.[0-9]{1,8})?$' then raise exception 'Quantidade inválida: use até oito casas decimais';end if;
  qty:=(payload->>'quantity')::numeric;paid:=financial_money(payload->>'amount',false,false);dt:=(payload->>'date')::date;
  if qty<=0 or dt is null or dt>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Confira a quantidade e a data da compra';end if;
  if record_id is null or action='create' then
   insert into manual_investment_purchases(user_id,asset_id,quantity,amount,date) values(u,a,qty,paid,dt) returning id into record_id;
  else update manual_investment_purchases set quantity=qty,amount=paid,date=dt where id=record_id and user_id=u;end if;
  update investment_assets set manual_control=true where id=a and user_id=u;
  
 elsif action='purchase-delete' then
  select to_jsonb(t),asset_id into strict old,a from manual_investment_purchases t where id=record_id and user_id=u for update;
  update manual_investment_purchases set status='cancelled' where id=record_id and user_id=u;
 elsif action='price' then
  perform financial_owned('investment_assets',a);
  if not exists(select 1 from investment_assets where id=a and user_id=u and currency='BRL') then raise exception 'O controle manual utiliza preços em reais';end if;
  if coalesce(payload->>'price','') !~ '^[0-9]{1,12}(\.[0-9]{1,8})?$' then raise exception 'Preço inválido: use até oito casas decimais';end if;
  price_value:=(payload->>'price')::numeric;dt:=(payload->>'date')::date;
  if dt is null or dt>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'A atualização não pode ter data futura';end if;
  if record_id is not null then
   select to_jsonb(t) into strict old from manual_investment_updates t where id=record_id and asset_id=a and user_id=u for update;
   if exists(select 1 from manual_investment_updates where asset_id=a and month=date_trunc('month',dt)::date and id<>record_id) then raise exception 'Já existe uma atualização nesse mês. Corrija o registro existente';end if;
   update manual_investment_updates set month=date_trunc('month',dt)::date,date=dt,price=price_value,updated_at=now() where id=record_id and user_id=u;
  else
   select to_jsonb(t) into old from manual_investment_updates t where asset_id=a and month=date_trunc('month',dt)::date for update;
   insert into manual_investment_updates(user_id,asset_id,month,date,price) values(u,a,date_trunc('month',dt)::date,dt,price_value)
   on conflict(asset_id,month) do update set date=excluded.date,price=excluded.price,updated_at=now() returning id into record_id;
  end if;
  update investment_assets set manual_control=true where id=a and user_id=u;
 elsif action='price-delete' then
  select to_jsonb(t),asset_id into strict old,a from manual_investment_updates t where id=record_id and user_id=u for update;
  delete from manual_investment_updates where id=record_id and user_id=u;
 end if;
 if old is not null then insert into financial_integrity_revisions(user_id,entity,entity_id,previous,reason)
 values(u,case when action='asset' then 'investment_assets' when action in ('price','price-delete') then 'manual_investment_updates' else 'manual_investment_purchases' end,coalesce(record_id,a),old,'Correção manual: '||action);end if;
 result:=jsonb_build_object('id',coalesce(record_id,a),'asset_id',a);
 insert into operation_requests(user_id,request_id,action,payload_hash,result) values(u,request_id,'manual:'||action,fingerprint,result);
 return result;
end $$;
revoke all on function manual_investment_operation(text,jsonb,uuid) from public,anon;
grant execute on function manual_investment_operation(text,jsonb,uuid) to authenticated;

alter function read_financial_snapshot() rename to read_financial_snapshot_legacy;
create function read_financial_snapshot() returns jsonb language sql stable security invoker set search_path=public as $$
 select read_financial_snapshot_legacy() || jsonb_build_object(
 'manual_investment_purchases',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('quantity',p.quantity::text,'amount',p.amount::text)) from manual_investment_purchases p),'[]'::jsonb),
 'manual_investment_updates',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('price',p.price::text)) from manual_investment_updates p),'[]'::jsonb));
$$;
revoke all on function read_financial_snapshot() from public,anon;
grant execute on function read_financial_snapshot() to authenticated;
