alter table recurring_transactions add column anchor_day int check(anchor_day between 1 and 31);
update recurring_transactions set anchor_day=extract(day from next_date);
create function recurrence_anchor() returns trigger language plpgsql as $$begin new.anchor_day:=coalesce(new.anchor_day,extract(day from new.next_date)::int);return new;end $$;
create trigger recurrence_anchor before insert on recurring_transactions for each row execute function recurrence_anchor();
create or replace function generate_recurring(until_date date) returns int language plpgsql security invoker set search_path=public as $$
declare r recurring_transactions;d date;next_month date;n int:=0;begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if until_date>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Gere apenas até hoje';end if;
 for r in select * from recurring_transactions where active and next_date<=until_date for update loop
 d:=r.next_date;
 while d<=until_date loop
 insert into transactions(user_id,account_id,category_id,description,type,amount,date,status,source_id) values(r.user_id,r.account_id,r.category_id,r.description,r.type,case when r.type='expense' then -r.amount else r.amount end,d,'pending','recurrence:'||r.id||':'||d) on conflict(user_id,source_id) do nothing;
 if r.frequency='weekly' then d:=d+7;else next_month:=(date_trunc('month',d)+interval '1 month')::date;d:=make_date(extract(year from next_month)::int,extract(month from next_month)::int,least(r.anchor_day,extract(day from next_month+interval '1 month'-interval '1 day')::int));end if;
 n:=n+1;if n>5000 then raise exception 'Limite de recorrências excedido';end if;
 end loop;update recurring_transactions set next_date=d where id=r.id;
 end loop;return n;
end $$;
