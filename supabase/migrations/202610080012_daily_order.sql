create or replace function investment_quantity(asset uuid,until_date date) returns numeric language plpgsql security invoker set search_path=public as $$
declare item record;q numeric:=0;begin
 for item in select date,quantity change,null::numeric ratio,1 kind from investment_operations where asset_id=asset and type='buy' and date<=until_date union all select date,-quantity,null::numeric,2 from investment_operations where asset_id=asset and type='sell' and date<=until_date union all select date,quantity,null::numeric,1 from investment_opening_positions where asset_id=asset and date<=until_date union all select date,0,ratio,0 from investment_corporate_actions where asset_id=asset and type<>'ticker_change' and date<=until_date order by date,kind loop
 if item.ratio is not null then q:=q*item.ratio;else q:=q+item.change;end if;
 if q<0 then raise exception 'Operação gera posição negativa no histórico';end if;
 end loop;return q;
end $$;
