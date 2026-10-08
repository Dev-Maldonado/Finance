create table manual_asset_prices (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, asset_id uuid not null, ticker text not null, price numeric(24,8) not null check(price>0), currency text not null default 'BRL', date date not null, source text not null default 'manual', collected_at timestamptz default now(), unique(asset_id,date), foreign key(asset_id,user_id) references investment_assets(id,user_id));
alter table manual_asset_prices enable row level security;
create policy owner on manual_asset_prices for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update,delete on manual_asset_prices to authenticated;
