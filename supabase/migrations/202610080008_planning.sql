create table financial_liabilities(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users on delete cascade,name text not null,amount numeric(20,2) not null check(amount>=0),due_date date,notes text default '');
alter table financial_liabilities enable row level security;
create policy owner on financial_liabilities for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update,delete on financial_liabilities to authenticated;
-- Liability records are manual balances; invoice liabilities are calculated separately.
create table savings_reconciliations(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users on delete cascade,goal_id uuid not null,date date not null,confirmed_balance numeric(20,2) not null check(confirmed_balance>=0),notes text,foreign key(goal_id,user_id) references savings_goals(id,user_id));
alter table savings_reconciliations enable row level security;create policy owner on savings_reconciliations for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());grant select,insert,update on savings_reconciliations to authenticated;
