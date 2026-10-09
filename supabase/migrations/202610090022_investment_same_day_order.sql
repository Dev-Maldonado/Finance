-- Same-day operations follow registration order; ambiguous legacy timestamps remain guarded.
-- Preserve all historical operations and cash movements.
create or replace function revise_investment(operation_id uuid,replacement jsonb,cancel boolean default false) returns uuid
language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();o investment_operations;asset uuid;acct uuid;qty numeric;unit_price numeric;operation_fees numeric;cash numeric;dt date;kind text;begin
 if u is null then raise exception 'Authentication required';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select * into strict o from investment_operations where id=operation_id and user_id=u for update;
 if o.status='cancelled' then raise exception 'Operação já cancelada';end if;
 if exists(select 1 from investment_operations where asset_id=o.asset_id and user_id=u and status='confirmed' and id<>o.id and (date>o.date or (date=o.date and created_at>=o.created_at)))
 or exists(select 1 from investment_corporate_actions where asset_id=o.asset_id and user_id=u and date>=o.date)
 or exists(select 1 from investment_income where asset_id=o.asset_id and user_id=u and status='received' and date>=o.date) then raise exception 'Há operações/eventos/recebimentos dependentes; corrija os mais recentes primeiro';end if;
 insert into financial_integrity_revisions(user_id,entity,entity_id,previous,reason) values(u,'investment_operations',o.id,to_jsonb(o),case when cancel then 'Cancelamento com estorno de caixa' else 'Correção com recálculo de caixa' end);
 if cancel then
  update investment_operations set status='cancelled' where id=o.id and user_id=u;
  update transactions set status='cancelled' where group_id=o.id and user_id=u and type='investment';
 else
  asset:=(replacement->>'asset_id')::uuid;acct:=(replacement->>'account_id')::uuid;dt:=(replacement->>'date')::date;kind:=replacement->>'type';
  perform financial_owned('investment_assets',asset);perform financial_cash_account(acct);
  if (select currency from investment_assets where id=asset and user_id=u)<>'BRL' then raise exception 'Operação cambial não suportada';end if;
  if replacement->>'quantity' !~ '^[0-9]{1,12}(\.[0-9]{1,8})?$' or replacement->>'price' !~ '^[0-9]{1,12}(\.[0-9]{1,8})?$' then raise exception 'Quantidade/preço inválidos';end if;
  qty:=(replacement->>'quantity')::numeric;unit_price:=(replacement->>'price')::numeric;operation_fees:=financial_money(coalesce(replacement->>'fees','0'));
  if qty<=0 or unit_price<=0 or dt is null or kind not in ('buy','sell') then raise exception 'Dados da operação inválidos';end if;
  if exists(select 1 from investment_operations where asset_id=asset and user_id=u and status='confirmed' and id<>o.id and (date>dt or (date=dt and created_at>=o.created_at)))
  or exists(select 1 from investment_corporate_actions where asset_id=asset and user_id=u and date>=dt) then raise exception 'Nova data/ativo possui dependências; concilie a sequência primeiro';end if;
  update investment_operations set asset_id=asset,account_id=acct,type=kind,quantity=qty,price=unit_price,fees=operation_fees,date=dt,broker=coalesce(replacement->>'broker','') where id=o.id and user_id=u;
  perform investment_quantity(o.asset_id,'9999-12-31'::date);perform investment_quantity(asset,'9999-12-31'::date);
  cash:=case when kind='buy' then -round(qty*unit_price,2)-operation_fees else round(qty*unit_price,2)-operation_fees end;
  if cash=0 then raise exception 'Valor líquido da operação não pode ser zero';end if;
  update transactions set account_id=acct,amount=cash,date=dt where group_id=o.id and user_id=u and type='investment' and status='confirmed';
  if not found then raise exception 'Operação sem movimento de caixa conciliado';end if;
 end if;
 update financial_integrity_revisions set next=(select to_jsonb(r) from investment_operations r where r.id=o.id) where entity_id=o.id and user_id=u and next is null;
 return o.id;
end $$;
revoke all on function revise_investment(uuid,jsonb,boolean) from public,anon;
grant execute on function revise_investment(uuid,jsonb,boolean) to authenticated;
