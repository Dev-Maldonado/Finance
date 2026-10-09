#!/usr/bin/env bash
# Entirely local: rebuild the published baseline in an isolated disposable database.
set -euo pipefail
cd "$(dirname "$0")/.."
finora_upgrade_sql=${1:-docs/supabase-update-manual-savings.sql}
test -f "$finora_upgrade_sql"
test -f .local-db.env
finora_fixture_db="finora_savings_fixture_$$"
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
 if [[ $(basename "$finora_baseline") > 202610090024_manual_investments.sql ]]; then break; fi
 { printf 'BEGIN;\n'; cat "$finora_baseline"; printf '\nCOMMIT;\n'; } | "${finora_psql[@]}" >/dev/null
done
"${finora_psql[@]}" >/dev/null <<'SQL'
insert into supabase_migrations.schema_migrations(version,name,statements) values('202610090024','baseline',array[]::text[]);
insert into auth.users values('00000000-0000-4000-8000-000000000001');
insert into financial_accounts(id,user_id,name,initial_balance) values('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','Preserved checking',5000);
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
select execute_operation('create_goal','{"name":"Preserved reserve","target":"3000","indexer":"cdi","product":"rdb"}',gen_random_uuid());
select execute_operation('savings_deposit',jsonb_build_object('goal_id',(select id from savings_goals),'account_id','00000000-0000-4000-8000-000000000011','amount','1000','date','2026-01-01'),gen_random_uuid());
select execute_operation('confirm_yield',jsonb_build_object('goal_id',(select id from savings_goals),'amount','50','date','2026-02-01'),gen_random_uuid());
select manual_investment_operation('create','{"name":"Preserved fund","manual_kind":"fund","quantity":"10","amount":"100","date":"2026-01-01"}',gen_random_uuid());
reset role;
SQL
for finora_pass in 1 2; do
 "${finora_psql[@]}" < "$finora_upgrade_sql" >/dev/null
 echo "PASS savings upgrade $finora_pass: all financial records preserved, migration idempotent"
done
"${finora_psql[@]}" >/dev/null <<'SQL'
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
do $$declare g uuid;begin
 select id into g from savings_goals;
 perform manual_savings_operation('balance',jsonb_build_object('goal_id',g,'balance','1100','date','2026-03-01'),gen_random_uuid());
 if (select sum(balance::numeric) from account_balances)<>5100 then raise exception 'Manual valuation did not preserve existing balances';end if;
 if (select count(*) from manual_investment_purchases)<>1 then raise exception 'Unrelated manual purchase lost';end if;
 if (select count(*) from savings_movements)<>2 then raise exception 'Legacy flows changed';end if;
 insert into investment_income(user_id,asset_id,description,amount,date) values(auth.uid(),(select id from investment_assets),'Legacy compatibility',1,'2026-03-01');
 perform execute_operation('confirm_income',jsonb_build_object('income_id',(select id from investment_income),'account_id','00000000-0000-4000-8000-000000000011','date','2026-03-01'),gen_random_uuid());
 if (select sum(balance::numeric) from account_balances)<>5101 then raise exception 'Operation wrapper broke existing income confirmation';end if;

end $$;
SQL
echo 'PASS migrated legacy jar accepts manual values without duplicating confirmed earnings'
