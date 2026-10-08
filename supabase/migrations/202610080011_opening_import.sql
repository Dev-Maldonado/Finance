create table investment_opening_positions(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users on delete cascade,asset_id uuid not null,quantity numeric(24,8) not null check(quantity>0),cost numeric(20,2) not null check(cost>=0),date date not null,notes text default '',unique(asset_id),foreign key(asset_id,user_id) references investment_assets(id,user_id));
alter table investment_opening_positions enable row level security;create policy owner on investment_opening_positions for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());grant select,insert on investment_opening_positions to authenticated;
create or replace function investment_quantity(asset uuid,until_date date) returns numeric language plpgsql security invoker set search_path=public as $$
declare item record;q numeric:=0;begin
 for item in select date,quantity change,null::numeric ratio,1 kind from investment_operations where asset_id=asset and type='buy' and date<=until_date union all select date,-quantity,null::numeric,2 from investment_operations where asset_id=asset and type='sell' and date<=until_date union all select date,quantity,null::numeric,1 from investment_opening_positions where asset_id=asset and date<=until_date union all select date,0,ratio,0 from investment_corporate_actions where asset_id=asset and type<>'ticker_change' and date<=until_date order by date,kind loop
 if item.ratio is not null then q:=q*item.ratio;else q:=q+item.change;end if;
 if q<0 then raise exception 'Operação gera posição negativa no histórico';end if;
 end loop;return q;
end $$;
create trigger opening_timeline after insert on investment_opening_positions for each row execute function validate_investment_timeline();
create function import_investment_operations(items jsonb) returns int language plpgsql security invoker set search_path=public as $$
declare item jsonb;n int:=0;begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if jsonb_array_length(items)>1000 then raise exception 'Máximo de 1000 operações por importação';end if;
 for item in select value from jsonb_array_elements(items) loop
 perform execute_operation('investment',item->'payload',(item->>'request_id')::uuid);n:=n+1;
 end loop;return n;
end $$;
revoke all on function import_investment_operations(jsonb) from public;grant execute on function import_investment_operations(jsonb) to authenticated;
