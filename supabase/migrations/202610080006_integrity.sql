create function validate_category_tree() returns trigger language plpgsql security invoker as $$
begin
 if new.parent_id=new.id then raise exception 'Uma categoria não pode ser filha de si mesma';end if;
 if exists(with recursive ancestors as (select id,parent_id,array[id] visited from categories where id=new.parent_id union all select c.id,c.parent_id,a.visited||c.id from categories c join ancestors a on c.id=a.parent_id where not c.id=any(a.visited)) select 1 from ancestors where id=new.id) then raise exception 'Hierarquia circular de categorias';end if;
 return new;
end $$;
create trigger category_tree before insert or update on categories for each row execute function validate_category_tree();
create function investment_quantity(asset uuid,until_date date) returns numeric language plpgsql security invoker set search_path=public as $$
declare item record;q numeric:=0;begin
 for item in select date,quantity change,null::numeric ratio,1 kind from investment_operations where asset_id=asset and type='buy' and date<=until_date union all select date,-quantity,null::numeric,1 from investment_operations where asset_id=asset and type='sell' and date<=until_date union all select date,0,ratio,0 from investment_corporate_actions where asset_id=asset and type<>'ticker_change' and date<=until_date order by date,kind loop
 if item.ratio is not null then q:=q*item.ratio;else q:=q+item.change;end if;
 if q<0 then raise exception 'Operação gera posição negativa no histórico';end if;
 end loop;return q;
end $$;
create function validate_investment_timeline() returns trigger language plpgsql security invoker as $$begin perform investment_quantity(new.asset_id,'9999-12-31'::date);return new;end $$;
create trigger investment_timeline after insert or update on investment_operations for each row execute function validate_investment_timeline();
create trigger corporate_timeline after insert or update on investment_corporate_actions for each row execute function validate_investment_timeline();
revoke all on function investment_quantity(uuid,date) from public;grant execute on function investment_quantity(uuid,date) to authenticated;
create or replace view account_balances with (security_invoker=true) as select a.*, (a.initial_balance+coalesce(sum(t.amount) filter(where t.status='confirmed' and t.date<=(now() at time zone 'America/Sao_Paulo')::date),0))::text balance from financial_accounts a left join transactions t on t.account_id=a.id group by a.id;
