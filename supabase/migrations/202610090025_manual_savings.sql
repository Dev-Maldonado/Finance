-- Manual valuations only. Existing lots, flows, reconciliations and cash amounts are preserved.
create table manual_savings_updates (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade,
 goal_id uuid not null, date date not null, month date generated always as (date_trunc('month',date::timestamp)::date) stored,
 balance numeric(20,2) not null check(balance>=0 and balance::text not in ('NaN','Infinity','-Infinity')), adjustment numeric(20,2) not null default 0 check(adjustment::text not in ('NaN','Infinity','-Infinity')),
 cutoff timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(goal_id,month), foreign key(goal_id,user_id) references savings_goals(id,user_id)
);
alter table manual_savings_updates enable row level security;
create policy own_manual_savings_updates on manual_savings_updates for select to authenticated using(user_id=auth.uid());
revoke all on manual_savings_updates from public,anon,authenticated;
grant select on manual_savings_updates to authenticated;
grant all on manual_savings_updates to service_role;
alter table savings_movements drop constraint savings_movements_type_check;
alter table savings_movements add constraint savings_movements_type_check check(type in ('deposit','withdrawal','confirmed_yield','withdrawn_yield','tax','yield_reversal','manual_withdrawal'));

-- Recalculate valuation adjustments chronologically. Deposits/withdrawals after a same-day
-- observation stay after it; changing an old month never overwrites subsequent observations.
create function rebuild_manual_savings(goal_key uuid) returns void language plpgsql security definer set search_path=public as $$
declare goal savings_goals; observation manual_savings_updates; base numeric; prior numeric:=0; delta numeric; live numeric;
begin
 select * into strict goal from savings_goals where id=goal_key and user_id=auth.uid() for update;
 for observation in select * from manual_savings_updates where goal_id=goal_key and user_id=auth.uid() order by date,cutoff loop
  select a.initial_balance+coalesce((select sum(t.amount) from transactions t where t.account_id=a.id and t.user_id=auth.uid() and t.status='confirmed'
   and coalesce(t.source_id,'') not like 'manual-savings:%' and t.date<=observation.date
   and (t.date<observation.date or not exists(select 1 from savings_movements m where m.transaction_group=t.group_id and m.goal_id=goal_key and m.status='confirmed' and m.created_at>observation.cutoff))),0)
  into base from financial_accounts a where a.id=goal.account_id;
  delta:=observation.balance-base-prior;
  update manual_savings_updates set adjustment=delta where id=observation.id;
  if delta=0 then delete from transactions where user_id=auth.uid() and source_id='manual-savings:'||observation.id;
  else
   insert into transactions(user_id,account_id,description,type,amount,date,status,source_id,group_id,notes)
   values(auth.uid(),goal.account_id,'Saldo manual: '||goal.name,'adjustment',delta,observation.date,'confirmed','manual-savings:'||observation.id,observation.id,'Valorização manual; não é entrada na conta bancária')
   on conflict(user_id,source_id) do update set amount=excluded.amount,date=excluded.date;
  end if;
  prior:=prior+delta;
 end loop;
 select a.initial_balance+coalesce((select sum(t.amount) from transactions t where t.account_id=a.id and t.status='confirmed'),0) into live from financial_accounts a where a.id=goal.account_id;
 if live<0 then raise exception 'Esse saldo deixaria a caixinha negativa após os resgates registrados. Confira o valor e as movimentações posteriores';end if;
end $$;
revoke all on function rebuild_manual_savings(uuid) from public,anon,authenticated;

create function manual_savings_operation(action text,payload jsonb,request_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); today date:=(now() at time zone 'America/Sao_Paulo')::date;
 dt date; g savings_goals; req operation_requests; fingerprint text:=encode(sha256(convert_to(payload::text,'UTF8')),'hex');
 result jsonb; key uuid; source_account uuid; group_key uuid:=gen_random_uuid(); amount numeric; ir numeric;iof numeric;net numeric; available numeric; capital numeric; portion numeric; left_capital numeric; lot savings_lots; old jsonb;
begin
 if u is null or request_id is null or payload is null or jsonb_typeof(payload)<>'object' then raise exception 'Solicitação não autorizada';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select * into req from operation_requests r where r.user_id=u and r.request_id=manual_savings_operation.request_id;
 if found then
  if req.action<>'manual_savings:'||action or req.payload_hash<>fingerprint then raise exception 'Chave reutilizada com dados diferentes';end if;
  return req.result;
 end if;
 if action not in ('create','deposit','withdraw','balance','balance-delete') then raise exception 'Operação inválida';end if;
 dt:=coalesce((payload->>'date')::date,today);
 if dt>today then raise exception 'A movimentação não pode ter data futura';end if;
 if action='create' then
  amount:=financial_money(coalesce(payload->>'initial_balance','0'));
  result:=execute_operation('create_goal',(payload-'account_id')||jsonb_build_object('indexer','manual'),gen_random_uuid());key:=(result->>'id')::uuid;
  select * into strict g from savings_goals where id=key and user_id=u;
  if amount>0 then
   source_account:=nullif(payload->>'account_id','')::uuid;
   if source_account is not null then
    perform execute_operation('savings_deposit',jsonb_build_object('goal_id',key,'account_id',source_account,'amount',amount::text,'date',dt),gen_random_uuid());
   else
    -- Opening balance already deposited outside this system: never debit a bank twice.
    update financial_accounts set initial_balance=amount where id=g.account_id and user_id=u;
    insert into savings_lots(user_id,goal_id,principal,remaining,start_date,indexer,percentage,annual_rate,product,tax_exempt)
    values(u,key,amount,amount,dt,'manual',100,0,'custom',false) returning id into source_account;
    insert into savings_movements(user_id,goal_id,lot_id,type,amount,date,transaction_group) values(u,key,source_account,'deposit',amount,dt,group_key);
   end if;
  end if;
 else
  key:=nullif(payload->>'id','')::uuid;
  if action='balance-delete' then
   select to_jsonb(t),t.goal_id into strict old,source_account from manual_savings_updates t where t.id=key and t.user_id=u for update;
  else source_account:=(payload->>'goal_id')::uuid;end if;
  perform financial_owned('savings_goals',source_account);
  select * into strict g from savings_goals where id=source_account and user_id=u for update;
  if action in ('deposit','withdraw') then
   if dt<greatest(coalesce((select max(date) from manual_savings_updates where goal_id=g.id),'0001-01-01'::date),coalesce((select max(date) from savings_movements where goal_id=g.id and status='confirmed'),'0001-01-01'::date)) then raise exception 'Registre o depósito ou retirada após a última movimentação ou saldo informado';end if;
   amount:=financial_money(payload->>'amount',false);
   source_account:=(payload->>'account_id')::uuid;perform financial_cash_account(source_account);
   if action='deposit' then
    result:=execute_operation('savings_deposit',payload,gen_random_uuid());key:=(result->>'id')::uuid;
   else
    ir:=financial_money(coalesce(payload->>'ir_amount','0'));iof:=financial_money(coalesce(payload->>'iof_amount','0'));
    if ir+iof>amount then raise exception 'Os impostos não podem superar a retirada';end if;net:=amount-ir-iof;
    select a.initial_balance+coalesce((select sum(t.amount) from transactions t where t.account_id=a.id and t.user_id=u and t.status='confirmed' and t.date<=dt),0) into available from financial_accounts a where a.id=g.account_id;
    if amount>available then raise exception 'Retirada excede o saldo atual informado da caixinha';end if;
    select coalesce(sum(remaining),0) into capital from savings_lots where goal_id=g.id and user_id=u and status='confirmed';
    left_capital:=case when amount=available then capital else least(capital,round(capital*amount/available,2)) end;
    for lot in select * from savings_lots where goal_id=g.id and user_id=u and status='confirmed' and remaining>0 order by start_date,id for update loop
     exit when left_capital=0;portion:=least(lot.remaining,left_capital);
     update savings_lots set remaining=remaining-portion where id=lot.id;left_capital:=left_capital-portion;
    end loop;
    insert into savings_movements(user_id,goal_id,type,amount,date,transaction_group) values(u,g.id,'manual_withdrawal',amount,dt,group_key);
    if net>0 then insert into transactions(user_id,account_id,description,type,amount,date,group_id) values(u,g.account_id,'Retirada: '||g.name,'transfer',-net,dt,group_key),(u,source_account,'Retirada: '||g.name,'transfer',net,dt,group_key);end if;
    if ir+iof>0 then
     insert into savings_movements(user_id,goal_id,type,amount,date,transaction_group) values(u,g.id,'tax',ir+iof,dt,group_key);
     insert into transactions(user_id,account_id,description,type,amount,date,group_id,notes) values(u,g.account_id,'IR/IOF confirmado no resgate','expense',-(ir+iof),dt,group_key,'IR: '||ir||'; IOF: '||iof);
    end if;
    key:=group_key;
   end if;
  elsif action='balance' then
   amount:=financial_money(payload->>'balance');
   if dt<coalesce((select min(start_date) from savings_lots where goal_id=g.id and user_id=u and status='confirmed'),today) then raise exception 'Saldo anterior ao primeiro depósito';end if;
   if key is not null then
    select to_jsonb(t) into strict old from manual_savings_updates t where t.id=key and t.goal_id=g.id and t.user_id=u for update;
    if exists(select 1 from manual_savings_updates where goal_id=g.id and month=date_trunc('month',dt)::date and id<>key) then raise exception 'Já existe uma atualização nesse mês';end if;
    update manual_savings_updates set balance=amount,date=dt,updated_at=clock_timestamp(),cutoff=case when date=dt then cutoff else clock_timestamp() end where id=key and user_id=u;
   else
    select to_jsonb(t) into old from manual_savings_updates t where t.goal_id=g.id and t.month=date_trunc('month',dt)::date;
    insert into manual_savings_updates(user_id,goal_id,date,balance) values(u,g.id,dt,amount)
    on conflict(goal_id,month) do update set balance=excluded.balance,date=excluded.date,cutoff=excluded.cutoff,updated_at=clock_timestamp() returning id into key;
   end if;
   perform rebuild_manual_savings(g.id);
  elsif action='balance-delete' then
   delete from transactions where user_id=u and source_id='manual-savings:'||key;
   delete from manual_savings_updates where id=key and user_id=u;
   perform rebuild_manual_savings(g.id);
  end if;
 end if;
 if old is not null then insert into financial_integrity_revisions(user_id,entity,entity_id,previous,reason) values(u,'manual_savings_updates',key,old,'Correção de saldo manual: '||action);end if;
 result:=jsonb_build_object('id',key,'goal_id',g.id,'ok',true);
 insert into operation_requests(user_id,request_id,action,payload_hash,result) values(u,request_id,'manual_savings:'||action,fingerprint,result);
 return result;
end $$;
revoke all on function manual_savings_operation(text,jsonb,uuid) from public,anon;
grant execute on function manual_savings_operation(text,jsonb,uuid) to authenticated;
alter function read_financial_snapshot() rename to read_financial_snapshot_before_manual_savings;
create function read_financial_snapshot() returns jsonb language sql stable security invoker set search_path=public as $$
 select read_financial_snapshot_before_manual_savings()||jsonb_build_object('manual_savings_updates',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('balance',t.balance::text,'adjustment',t.adjustment::text)) from manual_savings_updates t),'[]'::jsonb));
$$;
revoke all on function read_financial_snapshot() from public,anon;
grant execute on function read_financial_snapshot() to authenticated;
notify pgrst,'reload schema';

-- Preserve legacy import/API flows, but never let them overdraw a manually valued jar
-- or silently cancel flows already included in a monthly observation.
-- Clone and qualify the old function: ALTER RENAME would leave PL/pgSQL
-- self-qualified parameter references pointing at a nonexistent block name.
do $clone$ declare definition text;begin
 definition:=pg_get_functiondef('public.execute_operation(text,jsonb,uuid)'::regprocedure);
 execute regexp_replace(definition,'\mexecute_operation\M','execute_operation_before_manual_savings','g');
end $clone$;
create or replace function execute_operation(action text,payload jsonb,request_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare g savings_goals;dt date:=coalesce((payload->>'date')::date,(now() at time zone 'America/Sao_Paulo')::date);available numeric;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if exists(select 1 from operation_requests r where r.user_id=auth.uid() and r.request_id=execute_operation.request_id) then return execute_operation_before_manual_savings(action,payload,request_id);end if;
 if action in ('savings_deposit','savings_withdraw') then
  select * into strict g from savings_goals where id=(payload->>'goal_id')::uuid and user_id=auth.uid();
  if dt<coalesce((select max(date) from manual_savings_updates where goal_id=g.id and user_id=auth.uid()),'0001-01-01'::date) then raise exception 'Movimentação anterior ao último saldo mensal informado';end if;
  if action='savings_withdraw' then
   select a.initial_balance+coalesce((select sum(t.amount) from transactions t where t.account_id=a.id and t.user_id=auth.uid() and t.status='confirmed' and t.date<=dt),0) into available from financial_accounts a where a.id=g.account_id;
   if financial_money(payload->>'amount')+financial_money(coalesce(payload->>'yield_amount','0'))>available then raise exception 'Resgate excede o saldo atual informado da caixinha';end if;
  end if;
 end if;
 return execute_operation_before_manual_savings(action,payload,request_id);
end $$;
revoke all on function execute_operation_before_manual_savings(text,jsonb,uuid) from public,anon,authenticated;
revoke all on function execute_operation(text,jsonb,uuid) from public,anon;
grant execute on function execute_operation(text,jsonb,uuid) to authenticated;

alter function cancel_savings_operation(uuid) rename to cancel_savings_operation_before_manual;
create function cancel_savings_operation(operation_group uuid) returns uuid language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if exists(select 1 from savings_movements m where m.user_id=auth.uid() and m.transaction_group=operation_group and m.type='manual_withdrawal') then raise exception 'Retirada manual: registre o depósito de devolução para preservar o histórico';end if;
 if exists(select 1 from savings_movements m where m.user_id=auth.uid() and m.transaction_group=operation_group and not exists(select 1 from transactions t where t.user_id=auth.uid() and t.group_id=operation_group)) then raise exception 'Saldo inicial já depositado: corrija o saldo ou registre a retirada';end if;
 if exists(select 1 from savings_movements m join manual_savings_updates o on o.goal_id=m.goal_id and o.user_id=m.user_id where m.user_id=auth.uid() and m.transaction_group=operation_group and (o.date>m.date or (o.date=m.date and o.cutoff>=m.created_at))) then raise exception 'Há saldo mensal que inclui esta operação. Corrija os saldos dependentes antes de estornar';end if;
 return cancel_savings_operation_before_manual(operation_group);
end $$;
revoke all on function cancel_savings_operation_before_manual(uuid) from public,anon,authenticated;
revoke all on function cancel_savings_operation(uuid) from public,anon;
grant execute on function cancel_savings_operation(uuid) to authenticated;
