#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
python3 scripts/local/init-env.py
compose=(docker compose -p finora-local --env-file .local-db.env -f scripts/local/compose.yml)
chmod 644 scripts/local/kong.yml
"${compose[@]}" up -d
if ! "${compose[@]}" exec -T db psql -U postgres -tAc "select 1 from pg_roles where rolname='authenticator'" | rg -q 1; then
  finora_password=$(python3 -c "from pathlib import Path; print(dict(l.split('=',1) for l in Path('.local-db.env').read_text().splitlines())['FINORA_DB_PASSWORD'])")
  "${compose[@]}" exec -T db psql -U postgres -v ON_ERROR_STOP=1 -v db_password="$finora_password" < scripts/local/init.sql
fi
"${compose[@]}" restart auth rest gateway
for finora_attempt in $(seq 1 45); do
  if "${compose[@]}" exec -T db psql -U postgres -tAc "select 1 from pg_tables where schemaname='auth' and tablename='users'" | rg -q 1; then break; fi
  if [[ "$finora_attempt" == 45 ]]; then echo 'Supabase Auth did not initialize.' >&2; exit 1; fi
  sleep 1
done
"${compose[@]}" exec -T db psql -U postgres -v ON_ERROR_STOP=1 -c 'create schema if not exists extensions; create table if not exists public.finora_migrations(name text primary key);'
for finora_migration in supabase/migrations/*.sql; do
  finora_name=$(basename "$finora_migration")
  if ! "${compose[@]}" exec -T db psql -U postgres -tAc "select 1 from finora_migrations where name='$finora_name'" | rg -q 1; then
    { printf 'BEGIN;\n'; cat "$finora_migration"; printf "\nINSERT INTO finora_migrations VALUES ('%s');\nCOMMIT;\n" "$finora_name"; } | "${compose[@]}" exec -T db psql -U postgres -v ON_ERROR_STOP=1
  fi
done
"${compose[@]}" exec -T db psql -U postgres -v ON_ERROR_STOP=1 -c "NOTIFY pgrst, 'reload schema';"
for finora_attempt in $(seq 1 30); do
 if curl -fsS http://localhost:54321/auth/v1/health >/dev/null && curl -fsS http://localhost:54321/rest/v1/ >/dev/null; then echo 'Local PostgreSQL, Supabase Auth and API initialized.'; exit 0; fi
 sleep 1
done
exit 1
