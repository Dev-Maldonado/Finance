create or replace function execute_operation(action text, payload jsonb, request_id uuid) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare u uuid:=auth.uid(); operation_result jsonb; x uuid; y uuid; z uuid; g uuid:=gen_random_uuid(); a numeric; b numeric; n int; i int; dt date; due date; c credit_cards; goal savings_goals; lot savings_lots; available numeric; portion numeric; left_amount numeric; principal numeric;
begin
 if u is null then raise exception 'Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select r.result into operation_result from operation_requests r where r.user_id=u and r.request_id=execute_operation.request_id;
 if found then return operation_result; end if;
 insert into operation_requests(user_id,request_id) values(u,request_id);
 dt:=coalesce((payload->>'date')::date,current_date); a:=(payload->>'amount')::numeric;
 if a is not null and (a<=0 or a<>round(a,2) or a>999999999999.99) then raise exception 'Valor inválido: use valor positivo com até 2 casas decimais'; end if;
 case action
 when 'transaction' then
  if payload->>'type' not in ('income','expense','yield','adjustment') then raise exception 'Tipo inválido'; end if;
  insert into transactions(user_id,account_id,category_id,description,type,amount,date,status,notes,recurrence,source_id) values(u,(payload->>'account_id')::uuid,nullif(payload->>'category_id','')::uuid,payload->>'description',payload->>'type',case when payload->>'type'='expense' then -a else a end,dt,coalesce(payload->>'status','confirmed'),coalesce(payload->>'notes',''),coalesce(payload->>'recurrence',''),nullif(payload->>'source_id','')) returning id into x;
 when 'transfer' then
  x:=(payload->>'from_account')::uuid; y:=(payload->>'to_account')::uuid;
  if x=y then raise exception 'Selecione contas diferentes'; end if;
  perform id from financial_accounts where id in(x,y) and not archived;
  if (select count(*) from financial_accounts where id in(x,y) and not archived)<>2 then raise exception 'Conta inválida'; end if;
  insert into transactions(user_id,account_id,description,type,amount,date,group_id) values(u,x,'Transferência enviada','transfer',-a,dt,g),(u,y,'Transferência recebida','transfer',a,dt,g);
  x:=g;
 when 'purchase' then
  select * into strict c from credit_cards where id=(payload->>'card_id')::uuid;
  n:=(payload->>'installments')::int; if n not between 1 and 120 then raise exception 'Parcelas inválidas'; end if;
  select coalesce(sum(ci.amount),0)-(select coalesce(sum(cp.amount),0) from credit_card_payments cp join credit_card_invoices inv on inv.id=cp.invoice_id where inv.card_id=c.id) into b from credit_card_installments ci join credit_card_invoices inv on inv.id=ci.invoice_id where inv.card_id=c.id;
  if b+a>c.credit_limit then raise exception 'Limite insuficiente'; end if;
  insert into credit_card_purchases(user_id,card_id,description,amount,date,installments,category_id) values(u,c.id,payload->>'description',a,dt,n,nullif(payload->>'category_id','')::uuid) returning id into x;
  due:=date_trunc('month',dt)::date;
  if extract(day from dt)>=c.closing_day then due:=(due+interval '1 month')::date; end if;
  if c.due_day<=c.closing_day then due:=(due+interval '1 month')::date; end if;
  due:=due+(c.due_day-1);
  b:=trunc(a/n,2);
  for i in 1..n loop
   insert into credit_card_invoices(user_id,card_id,due_date) values(u,c.id,(due+make_interval(months=>i-1))::date) on conflict(card_id,due_date) do update set due_date=excluded.due_date returning id into y;
   insert into credit_card_installments(user_id,purchase_id,invoice_id,number,amount) values(u,x,y,i,case when i=n then a-b*(n-1) else b end);
  end loop;
 when 'pay_invoice' then
  y:=(payload->>'invoice_id')::uuid;
  select coalesce(sum(amount),0) into b from credit_card_installments where invoice_id=y;
  b:=b-(select coalesce(sum(amount),0) from credit_card_payments where invoice_id=y);
  if a>b or b<=0 then raise exception 'Pagamento excede saldo da fatura'; end if;
  insert into transactions(user_id,account_id,description,type,amount,date) values(u,(payload->>'account_id')::uuid,'Pagamento de fatura','invoice_payment',-a,dt) returning id into x;
  insert into credit_card_payments(user_id,invoice_id,transaction_id,amount,date) values(u,y,x,a,dt);
 when 'create_goal' then
  insert into financial_accounts(user_id,name,institution,kind,initial_balance) values(u,payload->>'name',coalesce(payload->>'institution',''),'savings',0) returning id into y;
  insert into savings_goals(user_id,name,description,account_id,target,target_date,indexer,percentage,annual_rate,product,tax_exempt,institution) values(u,payload->>'name',coalesce(payload->>'description',''),y,(payload->>'target')::numeric,nullif(payload->>'target_date','')::date,coalesce(payload->>'indexer','cdi'),coalesce((payload->>'percentage')::numeric,100),coalesce((payload->>'annual_rate')::numeric,0),coalesce(payload->>'product','custom'),coalesce((payload->>'tax_exempt')::boolean,false),coalesce(payload->>'institution','')) returning id into x;
 when 'savings_deposit' then
  select * into strict goal from savings_goals where id=(payload->>'goal_id')::uuid;
  y:=(payload->>'account_id')::uuid;
  if y=goal.account_id then raise exception 'Conta de origem inválida'; end if;
  insert into savings_lots(user_id,goal_id,principal,remaining,start_date,indexer,percentage,annual_rate,product,tax_exempt) values(u,goal.id,a,a,dt,goal.indexer,goal.percentage,goal.annual_rate,goal.product,goal.tax_exempt) returning id into x;
  insert into savings_movements(user_id,goal_id,lot_id,type,amount,date,transaction_group) values(u,goal.id,x,'deposit',a,dt,g);
  insert into transactions(user_id,account_id,description,type,amount,date,group_id) values(u,y,'Aporte: '||goal.name,'transfer',-a,dt,g),(u,goal.account_id,'Aporte: '||goal.name,'transfer',a,dt,g);
 when 'savings_withdraw' then
  select * into strict goal from savings_goals where id=(payload->>'goal_id')::uuid;
  y:=(payload->>'account_id')::uuid;
  if y=goal.account_id then raise exception 'Conta de destino inválida'; end if;
  select coalesce(sum(remaining),0) into b from savings_lots where goal_id=goal.id;
  if a>b then raise exception 'Resgate de principal excede saldo; concilie rendimentos separadamente'; end if;
  left_amount:=a;
  for lot in select * from savings_lots where goal_id=goal.id and remaining>0 order by start_date,id for update loop
   if dt<lot.start_date then raise exception 'Resgate anterior ao aporte'; end if;
   portion:=least(lot.remaining,left_amount);
   if portion>0 then
    update savings_lots set remaining=remaining-portion where id=lot.id;
    insert into savings_movements(user_id,goal_id,lot_id,type,amount,date,transaction_group) values(u,goal.id,lot.id,'withdrawal',portion,dt,g);
    left_amount:=left_amount-portion;
   end if;
   exit when left_amount=0;
  end loop;
  insert into transactions(user_id,account_id,description,type,amount,date,group_id) values(u,goal.account_id,'Resgate: '||goal.name,'transfer',-a,dt,g),(u,y,'Resgate: '||goal.name,'transfer',a,dt,g);
  x:=g;
 when 'confirm_yield' then
  select * into strict goal from savings_goals where id=(payload->>'goal_id')::uuid;
  insert into savings_movements(user_id,goal_id,type,amount,date,transaction_group) values(u,goal.id,'confirmed_yield',a,dt,g);
  insert into transactions(user_id,account_id,description,type,amount,date,group_id) values(u,goal.account_id,'Rendimento conciliado: '||goal.name,'yield',a,dt,g) returning id into x;
 when 'investment' then
  if payload->>'type' not in ('buy','sell') then raise exception 'Operação inválida'; end if;
  b:=(payload->>'quantity')::numeric; a:=(payload->>'price')::numeric;
  if b<=0 or a<=0 or coalesce((payload->>'fees')::numeric,0)<0 then raise exception 'Quantidade/preço/taxas inválidos'; end if;
  y:=(payload->>'asset_id')::uuid;
  if (select currency from investment_assets where id=y)<>'BRL' then raise exception 'Operações em outra moeda exigem suporte cambial; não registre valores como BRL';end if;
  if payload->>'type'='sell' then
   select investment_quantity(y,dt) into available;
   -- Opening positions and corporate events are applied before validating chronological holdings.
   if b>available then raise exception 'Quantidade insuficiente'; end if;
  end if;
  insert into investment_operations(user_id,asset_id,account_id,type,quantity,price,fees,date,broker) values(u,y,(payload->>'account_id')::uuid,payload->>'type',b,a,coalesce((payload->>'fees')::numeric,0),dt,coalesce(payload->>'broker','')) returning id into x;
  a:=round(a*b,2);
  if payload->>'type'='buy' then a:=-a-coalesce((payload->>'fees')::numeric,0); else a:=a-coalesce((payload->>'fees')::numeric,0); end if;
  if a=0 then raise exception 'Valor líquido zero'; end if;
  insert into transactions(user_id,account_id,description,type,amount,date,group_id) values(u,(payload->>'account_id')::uuid,'Operação de investimento','investment',a,dt,x);
 when 'confirm_income' then
  select asset_id,amount into strict y,a from investment_income where id=(payload->>'income_id')::uuid and status='announced' for update;
  update investment_income set status='received',account_id=(payload->>'account_id')::uuid,date=dt where id=(payload->>'income_id')::uuid;
  insert into transactions(user_id,account_id,description,type,amount,date) values(u,(payload->>'account_id')::uuid,'Provento confirmado',case when (select type from investment_income where id=(payload->>'income_id')::uuid)='amortization' then 'redemption' else 'yield' end,a,dt) returning id into x;
 else raise exception 'Operação desconhecida';
 end case;
 operation_result:=jsonb_build_object('id',x,'ok',true);
 update operation_requests set result=operation_result where user_id=u and operation_requests.request_id=execute_operation.request_id;
 return operation_result;
end $$;
revoke all on function execute_operation(text,jsonb,uuid) from public;
grant execute on function execute_operation(text,jsonb,uuid) to authenticated;
