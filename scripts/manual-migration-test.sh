#!/usr/bin/env bash
# Entirely local: rebuild the published baseline in an isolated disposable database.
set -euo pipefail
cd "$(dirname "$0")/.."
finora_upgrade_sql=${1:-docs/supabase-update-manual-investments.sql}
test -f "$finora_upgrade_sql"
test -f .local-db.env
finora_fixture_db="finora_manual_fixture_$$"
finora_compose=(docker compose -p finora-local --env-file .local-db.env -f scripts/local/compose.yml)
finora_psql=("${finora_compose[@]}" exec -T db psql -U postgres -v ON_ERROR_STOP=1 -d "$finora_fixture_db")
finora_cleanup() { "${finora_compose[@]}" exec -T db dropdb -U postgres --if-exists "$finora_fixture_db" >/dev/null; }
trap finora_cleanup EXIT
"${finora_compose[@]}" exec -T db createdb -U postgres "$finora_fixture_db"
"${finora_psql[@]}" >/dev/null <<'SQL'
create schema auth;
create schema extensions;
create schema supabase_migrations;
create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role')$$;
grant usage on schema public,auth to anon,authenticated,service_role;
grant execute on function auth.uid(),auth.role() to anon,authenticated,service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;
SQL
for finora_baseline in supabase/migrations/*.sql; do
  if [[ $(basename "$finora_baseline") > 202610090023_investment_cancelled_history.sql ]]; then break; fi
  "${finora_psql[@]}" < "$finora_baseline" >/dev/null
done
"${finora_psql[@]}" >/dev/null <<'SQL'
insert into supabase_migrations.schema_migrations(version,name,statements) values('202610090023','baseline',array[]::text[]);
insert into auth.users values('00000000-0000-4000-8000-000000000001');
insert into financial_accounts(id,user_id,name,initial_balance) values('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','Preserved checking',5000);
insert into investment_assets(id,user_id,ticker,name,asset_class) values
 ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000001','OLD11','Old fund','fii'),
 ('00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000001','OLD34','Old BDR','bdr');
insert into investment_opening_positions(user_id,asset_id,quantity,cost,date) values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000022',1,0,'2026-01-01');
insert into manual_asset_prices(user_id,asset_id,ticker,price,date) values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000021','OLD11',100,'2026-01-01');
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
select execute_operation('investment','{"asset_id":"00000000-0000-4000-8000-000000000021","account_id":"00000000-0000-4000-8000-000000000011","type":"buy","quantity":"10","price":"100","fees":"5","date":"2026-01-01"}',gen_random_uuid());
insert into investment_income(id,user_id,asset_id,description,amount,date) values('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000021','Received before reset',10,'2026-01-01');
select execute_operation('confirm_income','{"income_id":"00000000-0000-4000-8000-000000000031","account_id":"00000000-0000-4000-8000-000000000011","date":"2026-01-01"}',gen_random_uuid());
reset role;
create table fixture_before as select jsonb_build_object('cash',(select jsonb_agg(to_jsonb(b) order by id) from account_balances b),'ledger',(select jsonb_agg(to_jsonb(t)-'linked_income_id' order by id) from transactions t)) data;
SQL
for finora_pass in 1 2; do
 "${finora_psql[@]}" < "$finora_upgrade_sql" >/dev/null
 "${finora_psql[@]}" >/dev/null <<'SQL'
do $$declare before jsonb;after jsonb;begin
 select data into before from fixture_before;
 select jsonb_build_object('cash',(select jsonb_agg(to_jsonb(b) order by id) from account_balances b),'ledger',(select jsonb_agg(to_jsonb(t)-'linked_income_id' order by id) from transactions t)) into after;
 if before<>after then raise exception 'Investment reset changed cash, transaction IDs, amounts, dates or statuses';end if;
 if exists(select 1 from investment_assets) or exists(select 1 from investment_operations) or exists(select 1 from investment_opening_positions) or exists(select 1 from investment_income) or exists(select 1 from manual_asset_prices) then raise exception 'Old investment records were not cleared';end if;
 if exists(select 1 from manual_investment_purchases) or exists(select 1 from manual_investment_updates) then raise exception 'New manual ledger is not empty';end if;
end $$;
SQL
 echo "PASS manual upgrade $finora_pass: investment reset, cash and transaction history preserved"
done
"${finora_psql[@]}" >/dev/null <<'SQL'
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
do $$declare result jsonb;a uuid;begin
 result:=manual_investment_operation('create','{"name":"Fresh fund","manual_kind":"fund","quantity":"10","amount":"1000","date":"2026-01-01"}',gen_random_uuid());a:=(result->>'asset_id')::uuid;
 perform manual_investment_operation('purchase',jsonb_build_object('asset_id',a,'quantity','5','amount','600','date','2026-01-02'),gen_random_uuid());
 perform manual_investment_operation('price',jsonb_build_object('asset_id',a,'price','130','date','2026-01-20'),gen_random_uuid());
 if jsonb_array_length(read_financial_snapshot()->'manual_investment_purchases')<>2 then raise exception 'New purchases unavailable';end if;
 if (select sum(amount) from manual_investment_purchases)<>1600 then raise exception 'Wrong exact capital';end if;
 if (select balance::numeric from account_balances where id='00000000-0000-4000-8000-000000000011')<>4005 then raise exception 'Manual purchases changed cash';end if;
end $$;
SQL
"${finora_psql[@]}" < "$finora_upgrade_sql" >/dev/null
"${finora_psql[@]}" -tAc "select case when (select count(*) from manual_investment_purchases)=2 then 'PASS rerun preserves new manual purchases' else 'FAIL' end" | grep -Fx 'PASS rerun preserves new manual purchases'
