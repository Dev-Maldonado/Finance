-- Obligation payments use group_id to retain their liability/reversal link.
-- They are real expenses, unlike transfers. Keep that link and allow an actual
-- payment date only when the paid obligation explicitly owns this expense.
create or replace function validate_settlement_date() returns trigger language plpgsql set search_path=public as $$begin
 if new.status='pending' then new.settled_on:=null;end if;
 if new.settled_on is not null then
  if new.type not in ('income','expense') or new.linked_income_id is not null or new.settled_on>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Informe uma data efetiva de pagamento/recebimento até hoje';end if;
  if new.group_id is not null and new.status='confirmed' and not exists(
   select 1 from financial_obligations o where o.id=new.group_id and o.transaction_id=new.id and o.user_id=new.user_id and o.status='paid'
  ) then raise exception 'Use a operação vinculada para confirmar este movimento';end if;
  if not exists(select 1 from financial_accounts where id=new.account_id and user_id=new.user_id and kind in ('bank','cash')) then raise exception 'Data de pagamento exige uma conta de movimentação de sua titularidade';end if;
 end if;return new;
end $$;
notify pgrst,'reload schema';
