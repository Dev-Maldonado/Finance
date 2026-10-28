#!/usr/bin/env bash
# Entirely local: rebuild the published baseline in an isolated disposable database.
set -euo pipefail
cd "$(dirname "$0")/.."
finora_upgrade_sql=${1:-supabase/migrations/202610280029_recurring_removal.sql}
test -f "$finora_upgrade_sql"
test -f .local-db.env
finora_fixture_db="finora_recurring_fixture_$$"
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
 if [[ $(basename "$finora_baseline") > 202610270028_obligation_settlement_guard.sql ]]; then break; fi
 { printf 'BEGIN;\n'; cat "$finora_baseline"; printf '\nCOMMIT;\n'; } | "${finora_psql[@]}" >/dev/null
done
"${finora_psql[@]}" >/dev/null <<'SQL'
insert into auth.users values('00000000-0000-4000-8000-000000000001');
insert into financial_accounts(id,user_id,name,initial_balance) values('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','Legacy checking',1000);
insert into recurring_transactions(id,user_id,account_id,description,type,amount,next_date,frequency,active,cancelled_at) values('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011','Ended legacy series','expense',50,'2026-01-01','monthly',false,now());
insert into transactions(user_id,account_id,description,type,amount,date,status,source_id) values
 ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011','Paid before upgrade','expense',-50,'2026-01-01','confirmed','recurrence:00000000-0000-4000-8000-000000000021:2026-01-01'),
 ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011','Pending before upgrade','expense',-50,'2026-02-01','pending','recurrence:00000000-0000-4000-8000-000000000021:2026-02-01');
create table saved_transactions as select * from transactions;
create table saved_recurring as select * from recurring_transactions;
create table saved_balances as select * from account_balances;
SQL
for finora_pass in 1 2; do
 "${finora_psql[@]}" < "$finora_upgrade_sql" >/dev/null
 "${finora_psql[@]}" >/dev/null <<'SQL'
do $$begin
 if (select jsonb_agg(to_jsonb(t)-'deleted_at' order by id) from transactions t) is distinct from (select jsonb_agg(to_jsonb(t) order by id) from saved_transactions t) then raise exception 'Transaction history changed';end if;
 if (select jsonb_agg(to_jsonb(t)-'deleted_at' order by id) from recurring_transactions t) is distinct from (select jsonb_agg(to_jsonb(t) order by id) from saved_recurring t) then raise exception 'Recurring schedules changed';end if;
 if exists(select 1 from transactions where deleted_at is not null) or exists(select 1 from recurring_transactions where deleted_at is not null) then raise exception 'Existing history was removed';end if;
 if (select jsonb_agg(to_jsonb(t) order by id) from account_balances t) is distinct from (select jsonb_agg(to_jsonb(t) order by id) from saved_balances t) then raise exception 'Existing cash changed';end if;
 if has_function_privilege('anon','remove_recurring_records(uuid,uuid,boolean,uuid)','execute') or not has_function_privilege('authenticated','remove_recurring_records(uuid,uuid,boolean,uuid)','execute') then raise exception 'RPC grants unsafe';end if;
end $$;
SQL
 echo "PASS recurrence removal upgrade $finora_pass: schedules, history, cash and RPC isolation preserved"
done
