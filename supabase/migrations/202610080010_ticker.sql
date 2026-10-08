create function apply_ticker_change() returns trigger language plpgsql security invoker set search_path=public as $$begin
 if new.type='ticker_change' then
  if new.new_ticker is null or new.new_ticker !~ '^[A-Za-z0-9.-]{1,30}$' then raise exception 'Informe um novo ticker válido';end if;
  update investment_assets set ticker=upper(new.new_ticker) where id=new.asset_id;
 end if;return new;
end $$;
create trigger corporate_ticker after insert on investment_corporate_actions for each row execute function apply_ticker_change();
