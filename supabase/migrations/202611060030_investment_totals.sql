-- Consolidated manual holdings. Does not modify cash, savings or old asset history.
create table public.investment_totals (
 user_id uuid primary key references auth.users(id) on delete cascade,
 equities numeric(14,2) not null check (equities >= 0),
 crypto numeric(14,2) not null check (crypto >= 0),
 updated_at timestamptz not null default now()
);
alter table public.investment_totals enable row level security;
create policy own_investment_totals on public.investment_totals for all to authenticated
 using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on public.investment_totals to authenticated;
grant all on public.investment_totals to service_role;
