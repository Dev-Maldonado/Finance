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
