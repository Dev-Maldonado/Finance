-- A savings account is maintained by lots and their paired cash movements.
-- Generic account CRUD must not change this relationship or fabricate principal.
create or replace function protect_savings_account() returns trigger language plpgsql set search_path=public as $$begin
 if current_user='authenticated' then
  if TG_OP='INSERT' and new.kind='savings' then raise exception 'Crie caixinhas pela operação transacional';end if;
  if TG_OP='UPDATE' and (new.kind='savings' or old.kind='savings') and
   (new.kind is distinct from old.kind or new.initial_balance is distinct from old.initial_balance or new.user_id is distinct from old.user_id) then
   raise exception 'O saldo e o vínculo da caixinha são mantidos por aportes, resgates e conciliação';
  end if;
 end if;
 return new;
end $$;
drop trigger if exists savings_account_integrity on financial_accounts;
create trigger savings_account_integrity before insert or update on financial_accounts for each row execute function protect_savings_account();

-- PostgreSQL treats NaN as greater than ordinary numbers; amount>0 alone is
-- insufficient. Reject non-finite values in both RPC and direct permitted CRUD.
do $$declare c record;constraint_name text;begin
 for c in select table_name,column_name from information_schema.columns
  where table_schema='public' and data_type in ('numeric','decimal','real','double precision')
  and table_name in (select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE')
 loop
  constraint_name:='finite_'||c.column_name;
  if not exists(select 1 from pg_constraint where conrelid=format('public.%I',c.table_name)::regclass and conname=constraint_name) then
   execute format('alter table public.%I add constraint %I check (%I::text not in (''NaN'',''Infinity'',''-Infinity'')) not valid',c.table_name,constraint_name,c.column_name);
   -- Validation aborts the migration rather than silently correcting old data.
   execute format('alter table public.%I validate constraint %I',c.table_name,constraint_name);
  end if;
 end loop;
end $$;
