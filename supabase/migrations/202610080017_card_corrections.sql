alter table credit_cards add column color text not null default '#5B35D5'
 check (color ~ '^#[0-9A-Fa-f]{6}$');
alter table credit_card_purchases add column status text not null default 'confirmed'
 check (status in ('confirmed','cancelled'));

create table credit_card_purchase_revisions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users on delete cascade,
 purchase_id uuid not null references credit_card_purchases on delete cascade,
 previous jsonb not null, previous_installments jsonb not null,
 changed_at timestamptz not null default now()
);
alter table credit_card_purchase_revisions enable row level security;
create policy owner on credit_card_purchase_revisions for select to authenticated using(user_id=auth.uid());
grant select on credit_card_purchase_revisions to authenticated;
create function audit_card_purchase() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into credit_card_purchase_revisions(user_id,purchase_id,previous,previous_installments)
 values(old.user_id,old.id,to_jsonb(old),coalesce((select jsonb_agg(to_jsonb(i)) from credit_card_installments i where i.purchase_id=old.id),'[]'::jsonb));
 return new;
end $$;
create trigger audit_card_purchase before update on credit_card_purchases for each row execute function audit_card_purchase();

create function revise_card_purchase(purchase_id uuid, replacement jsonb, cancel boolean default false)
returns uuid language plpgsql security invoker set search_path=public as $$
declare p credit_card_purchases; c credit_cards; a numeric; b numeric; n int; i int; due date; dt date; invoice uuid; financial_change boolean;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into strict p from credit_card_purchases where id=revise_card_purchase.purchase_id for update;
 if p.status='cancelled' then raise exception 'Compra já excluída'; end if;
 if cancel then financial_change:=true;
 else
  a:=(replacement->>'amount')::numeric; n:=(replacement->>'installments')::int; dt:=(replacement->>'date')::date;
  if a is null or a<=0 or a<>round(a,2) or a>999999999999.99 or n is null or n not between 1 and 120 or dt is null
   or nullif(trim(replacement->>'description'),'') is null or length(replacement->>'description')>200 then raise exception 'Dados da compra inválidos'; end if;
  select * into strict c from credit_cards where id=(replacement->>'card_id')::uuid;
  financial_change:=a<>p.amount or n<>p.installments or dt<>p.date or c.id<>p.card_id;
 end if;
 if financial_change and exists (
  select 1 from credit_card_payments cp join credit_card_installments ci on ci.invoice_id=cp.invoice_id
  where ci.purchase_id=p.id
 ) then raise exception 'Esta compra está em uma fatura com pagamento. É possível corrigir descrição/categoria; valor, parcelas e exclusão exigem conciliar o pagamento primeiro.'; end if;
 if cancel then
  update credit_card_purchases set status='cancelled' where id=p.id;
  delete from credit_card_installments where credit_card_installments.purchase_id=p.id;
 else
  update credit_card_purchases set card_id=c.id,description=trim(replacement->>'description'),amount=a,date=dt,installments=n,
   category_id=nullif(replacement->>'category_id','')::uuid where id=p.id;
  if financial_change then
   delete from credit_card_installments where credit_card_installments.purchase_id=p.id;
   select coalesce(sum(ci.amount),0)-(select coalesce(sum(cp.amount),0) from credit_card_payments cp join credit_card_invoices inv on inv.id=cp.invoice_id where inv.card_id=c.id)
   into b from credit_card_installments ci join credit_card_invoices inv on inv.id=ci.invoice_id where inv.card_id=c.id;
   if b+a>c.credit_limit then raise exception 'Limite insuficiente para a compra corrigida'; end if;
   due:=date_trunc('month',dt)::date;
   if extract(day from dt)>=c.closing_day then due:=(due+interval '1 month')::date; end if;
   if c.due_day<=c.closing_day then due:=(due+interval '1 month')::date; end if;
   due:=due+(c.due_day-1); b:=trunc(a/n,2);
   for i in 1..n loop
    insert into credit_card_invoices(user_id,card_id,due_date) values(auth.uid(),c.id,(due+make_interval(months=>i-1))::date)
     on conflict(card_id,due_date) do update set due_date=excluded.due_date returning id into invoice;
    insert into credit_card_installments(user_id,purchase_id,invoice_id,number,amount)
     values(auth.uid(),p.id,invoice,i,case when i=n then a-b*(n-1) else b end);
   end loop;
  end if;
 end if;
 delete from credit_card_invoices inv where inv.user_id=auth.uid()
  and not exists(select 1 from credit_card_installments ci where ci.invoice_id=inv.id)
  and not exists(select 1 from credit_card_payments cp where cp.invoice_id=inv.id);
 return p.id;
end $$;
revoke all on function revise_card_purchase(uuid,jsonb,boolean) from public;
grant execute on function revise_card_purchase(uuid,jsonb,boolean) to authenticated;
