-- Return cancelled operations for explicit history display. Financial summaries filter them out.
create or replace function read_financial_snapshot() returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare tab text;col record;expr text;query text;filter text;records jsonb;result jsonb:='{}';oldest date;begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select least((select min(start_date) from savings_lots),(select min(date) from investment_operations),(select min(date) from investment_opening_positions),(now() at time zone 'America/Sao_Paulo')::date-365) into oldest;
 foreach tab in array array['financial_accounts','account_balances','categories','recurring_transactions','credit_cards','transactions','credit_card_purchases','credit_card_installments','credit_card_invoices','credit_card_payments','savings_goals','savings_lots','savings_movements','savings_reconciliations','investment_assets','investment_opening_positions','investment_operations','investment_income','investment_corporate_actions','manual_asset_prices','financial_liabilities','financial_obligations','budgets','financial_goals','net_worth_snapshots','user_settings','account_reconciliations','invoice_reconciliations','tax_rules','benchmark_rates','asset_cash_events','asset_price_history','fund_nav_history','provider_sync_states','provider_sync_logs'] loop
  expr:='to_jsonb(t)';
  for col in select column_name from information_schema.columns where table_schema='public' and table_name=tab and data_type in ('numeric','decimal','real','double precision') loop
   expr:=expr||format(' || jsonb_build_object(%L,t.%I::text)',col.column_name,col.column_name);
  end loop;
  filter:='';
  if tab='asset_price_history' then filter:='where t.ticker in (select ticker from investment_assets)';
  elsif tab='asset_cash_events' then filter:='where t.ticker in (select ticker from investment_assets)';
  elsif tab='fund_nav_history' then filter:=$f$where t.fund_id in (select regexp_replace(cnpj,'\D','','g')||case when trim(coalesce(share_class,''))='' then '' else ':'||trim(share_class) end from investment_assets where asset_class='fund')$f$;
  elsif tab='benchmark_rates' then filter:=format('where t.date >= %L::date',oldest);
  elsif tab in ('savings_lots','savings_movements') then filter:='where t.status=''confirmed''';
  end if;
  query:=format('select coalesce(jsonb_agg(v),''[]''::jsonb) from (select %s v from public.%I t %s %s) records',expr,tab,filter,case when tab='provider_sync_logs' then 'order by t.started_at desc limit 200' else '' end);
  execute query into records;result:=result||jsonb_build_object(tab,records);
 end loop;return result||jsonb_build_object('snapshot_metadata',jsonb_build_array(jsonb_build_object('benchmark_start',oldest::text)));
end $$;
revoke all on function read_financial_snapshot() from public,anon;
grant execute on function read_financial_snapshot() to authenticated;
