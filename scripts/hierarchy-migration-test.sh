#!/usr/bin/env bash
# Entirely local: rebuild the published baseline in an isolated disposable database.
set -euo pipefail
cd "$(dirname "$0")/.."
finora_upgrade_sql=${1:-docs/supabase-update-financial-upgrade.sql}
test -f "$finora_upgrade_sql"
test -f .local-db.env
finora_fixture_db="finora_upgrade_fixture_$$"
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
  if [[ $(basename "$finora_baseline") > 202610080017_card_corrections.sql ]]; then break; fi
  "${finora_psql[@]}" < "$finora_baseline" >/dev/null
done
"${finora_psql[@]}" >/dev/null <<'SQL'
insert into supabase_migrations.schema_migrations(version,name,statements) values('202610080017','card_corrections',array[]::text[]);
insert into auth.users values('00000000-0000-4000-8000-000000000001');
insert into financial_accounts(id,user_id,name,initial_balance) values('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','Legacy checking',1000);
insert into categories(id,user_id,name,parent_id) values
 ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000001','Transportes',null),
 ('00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000001',' TRANSPORTES ',null),
 ('00000000-0000-4000-8000-000000000023','00000000-0000-4000-8000-000000000001','Uber','00000000-0000-4000-8000-000000000021'),
 ('00000000-0000-4000-8000-000000000024','00000000-0000-4000-8000-000000000001','UBER','00000000-0000-4000-8000-000000000022'),
 ('00000000-0000-4000-8000-000000000025','00000000-0000-4000-8000-000000000001','Combustível','00000000-0000-4000-8000-000000000023'),
 ('00000000-0000-4000-8000-000000000026','00000000-0000-4000-8000-000000000001','Alimentação',null),
 ('00000000-0000-4000-8000-000000000027','00000000-0000-4000-8000-000000000001','Lanches','00000000-0000-4000-8000-000000000026');
insert into transactions(user_id,account_id,category_id,description,type,amount,date)
select '00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011',id,'Legacy '||name,'expense',case when id::text like '%22' then -10 when id::text like '%24' then -20 else -30 end,'2026-01-01' from categories where id::text like '%22' or id::text like '%24' or id::text like '%25';
insert into credit_cards(id,user_id,name,account_id,closing_day,due_day,credit_limit) values('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000001','Legacy card','00000000-0000-4000-8000-000000000011',13,25,5000);
insert into credit_card_purchases(id,user_id,card_id,description,amount,date,installments,category_id) values('00000000-0000-4000-8000-000000000032','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000031','Legacy cents',100,'2026-01-01',3,'00000000-0000-4000-8000-000000000024');
insert into credit_card_invoices(user_id,card_id,due_date)
select '00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000031',(date_trunc('month',now() at time zone 'America/Sao_Paulo')+make_interval(months=>n)+interval '1 month'-interval '1 day')::date from generate_series(1,3) n;
insert into credit_card_installments(user_id,purchase_id,invoice_id,number,amount)
select '00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000032',id,row_number() over(order by due_date),case when row_number() over(order by due_date)=3 then 33.34 else 33.33 end from credit_card_invoices;
insert into recurring_transactions(user_id,account_id,description,type,amount,next_date,frequency) values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011','Legacy monthly','expense',59.90,'2026-01-31','monthly');
create table fixture_before as select jsonb_build_object(
 'categories',(select jsonb_agg(id order by id) from categories),
 'transactions',(select jsonb_agg(jsonb_build_object('id',id,'category_id',category_id,'amount',amount::text,'date',date,'status',status) order by id) from transactions),
 'installments',(select jsonb_agg(jsonb_build_object('id',id,'purchase_id',purchase_id,'invoice_id',invoice_id,'number',number,'amount',amount::text) order by id) from credit_card_installments),
 'purchases',(select jsonb_agg(jsonb_build_object('id',id,'category_id',category_id,'amount',amount::text,'date',date,'status',status) order by id) from credit_card_purchases),
 'balance',(select balance from account_balances where id='00000000-0000-4000-8000-000000000011')
) data;
SQL
for finora_pass in 1 2; do
  "${finora_psql[@]}" < "$finora_upgrade_sql" >/dev/null
  "${finora_psql[@]}" >/dev/null <<'SQL'
do $$declare before jsonb;after jsonb;begin
 select data into before from fixture_before;
 select jsonb_build_object(
 'categories',(select jsonb_agg(id order by id) from categories),
 'transactions',(select jsonb_agg(jsonb_build_object('id',id,'category_id',category_id,'amount',amount::text,'date',date,'status',status) order by id) from transactions),
 'installments',(select jsonb_agg(jsonb_build_object('id',id,'purchase_id',purchase_id,'invoice_id',invoice_id,'number',number,'amount',amount::text) order by id) from credit_card_installments),
 'purchases',(select jsonb_agg(jsonb_build_object('id',id,'category_id',category_id,'amount',amount::text,'date',date,'status',status) order by id) from credit_card_purchases),
 'balance',(select balance from account_balances where id='00000000-0000-4000-8000-000000000011')) into after;
 if before<>after then raise exception 'Migration changed historical financial entries, IDs, amounts or balances';end if;
 if not exists(select 1 from categories where id='00000000-0000-4000-8000-000000000022' and merged_into_id='00000000-0000-4000-8000-000000000021') then raise exception 'Root alias not consolidated';end if;
 if not exists(select 1 from categories where id='00000000-0000-4000-8000-000000000024' and merged_into_id='00000000-0000-4000-8000-000000000023') then raise exception 'Child alias not consolidated';end if;
 if not exists(select 1 from categories where id='00000000-0000-4000-8000-000000000025' and parent_id='00000000-0000-4000-8000-000000000021') then raise exception 'Explicit depth-three ancestor not flattened';end if;
 if (select count(*) from financial_integrity_revisions where entity='categories')<>4 then raise exception 'Category repair audit not stable across reruns';end if;
end $$;
SQL
  echo "PASS upgrade SQL pass $finora_pass: historical IDs, ledger, installments and balance preserved"
done
"${finora_psql[@]}" >/dev/null <<'SQL'
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
do $$declare result jsonb;goal uuid;gid uuid;lot uuid;begin
 result:=execute_operation('create_goal',jsonb_build_object('name','Fresh RPC reserve','target','1000','indexer','cdi','percentage','100','product','rdb'),gen_random_uuid());goal:=(result->>'id')::uuid;
 perform execute_operation('savings_deposit',jsonb_build_object('goal_id',goal,'account_id','00000000-0000-4000-8000-000000000011','amount','100','date',(now() at time zone 'America/Sao_Paulo')::date),gen_random_uuid());
 perform execute_operation('reconcile_savings',jsonb_build_object('goal_id',goal,'confirmed_balance','110','apply_adjustment',true,'date',(now() at time zone 'America/Sao_Paulo')::date),gen_random_uuid());
 result:=execute_operation('savings_withdraw',jsonb_build_object('goal_id',goal,'account_id','00000000-0000-4000-8000-000000000011','amount','20','yield_amount','5','ir_amount','1','iof_amount','0','date',(now() at time zone 'America/Sao_Paulo')::date),gen_random_uuid());
 if (select balance::numeric from account_balances where id='00000000-0000-4000-8000-000000000011')<>864 then raise exception 'Fresh guarded savings RPC cash is inconsistent';end if;
 perform cancel_savings_operation((result->>'id')::uuid);
 if (select balance::numeric from account_balances where id='00000000-0000-4000-8000-000000000011')<>840 then raise exception 'Fresh savings reversal failed';end if;
 if jsonb_typeof(read_financial_snapshot()->'financial_accounts'->0->'initial_balance')<>'string' then raise exception 'Fresh snapshot loses numeric precision';end if;
 if jsonb_array_length(read_financial_snapshot()->'recurring_transactions')<>1 then raise exception 'Recurring snapshot unavailable';end if;
end $$;
SQL
echo 'PASS fresh migrated guarded RPCs: savings reconciliation, withdrawal, reversal and exact snapshot'
