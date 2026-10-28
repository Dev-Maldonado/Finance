import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {periodMetrics,monthEnd} from '../src/lib/dashboard';
import {projectedRecurringExpenses} from '../src/lib/recurrence';
import {transactionHistory} from '../src/lib/transaction-history';
import type {Snapshot} from '../src/lib/summary';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname),'Local disposable users only');
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}}),users:string[]=[];
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date()),month=today.slice(0,7);
async function user(){const email=`recurring-removal-${randomUUID()}@example.test`,password=randomUUID()+'Aa1!';const u=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(u.error,null);users.push(u.data.user!.id);const db=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false}});assert.equal((await db.auth.signInWithPassword({email,password})).error,null);return db;}
let passed=0;async function check(label:string,fn:()=>Promise<void>){await fn();console.log('PASS',label);passed++;}
try{
 const db=await user(),other=await user();const a=await db.from('financial_accounts').insert({name:'Conta isolada',kind:'bank',initial_balance:'1000'}).select('id').single();assert.equal(a.error,null);const account=a.data!.id;
 const rec=async(description:string,extra:object={})=>{const r=await db.from('recurring_transactions').insert({account_id:account,description,type:'expense',amount:'20',frequency:'monthly',next_date:today,...extra}).select('id').single();assert.equal(r.error,null,r.error?.message);return r.data!.id;};
 const tx=async(id:string,amount:string,status='pending')=>{const r=await admin.from('transactions').insert({user_id:users[0],account_id:account,description:'Histórico '+id,type:Number(amount)<0?'expense':'income',amount,status,date:today,source_id:`recurrence:${id}:${today}`}).select('id').single();assert.equal(r.error,null,r.error?.message);return r.data!.id;};
 const removal=(id:string,history=false)=>({recurrence_id:id,transaction_id:null,include_history:history,request_id:randomUUID()});
 const entry=(id:string)=>({recurrence_id:null,transaction_id:id,include_history:false,request_id:randomUUID()});
 const balance=async()=>{const b=await db.from('account_balances').select('balance').eq('id',account).single();assert.equal(b.error,null);return Number(b.data!.balance);};
 const snap=async():Promise<Snapshot>=>{const s=await db.rpc('read_financial_snapshot');assert.equal(s.error,null);return {user:{id:users[0],email:''},...s.data};};
 let ended:string,paid:string;
 await check('ended/cancelled recurrence can be removed while preserving every posted occurrence and cash',async()=>{
  ended=await rec('Encerrada',{active:false,cancelled_at:new Date().toISOString()});paid=await tx(ended,'-20','confirmed');
  assert.equal(await balance(),980);const r=await db.rpc('remove_recurring_records',removal(ended));assert.equal(r.error,null,r.error?.message);
  const row=await db.from('recurring_transactions').select('*').eq('id',ended).single();assert.ok(row.data!.deleted_at);assert.equal(row.data!.active,false);
  const t=await db.from('transactions').select('*').eq('id',paid).single();assert.equal(t.data!.status,'confirmed');assert.equal(t.data!.deleted_at,null);assert.equal(await balance(),980);
 });
 await check('removing a paid occurrence reverses only its amount and keeps an audited source tombstone',async()=>{
  const p=entry(paid),r=await db.rpc('remove_recurring_records',p);assert.equal(r.error,null,r.error?.message);assert.equal(await balance(),1000);
  assert.equal((await db.rpc('remove_recurring_records',p)).data,paid);const t=await db.from('transactions').select('*').eq('id',paid).single();assert.equal(t.data!.status,'cancelled');assert.ok(t.data!.deleted_at);assert.equal(t.data!.source_id,`recurrence:${ended}:${today}`);
  const audit=await db.from('financial_integrity_revisions').select('previous,next').eq('entity_id',paid);assert.equal(audit.error,null);assert.equal(audit.data!.length,1);assert.equal(audit.data![0].previous.status,'confirmed');
  assert.ok(!transactionHistory(await snap(),today).some(t=>t.id===paid));
 });
 await check('cancelled history is removable and cannot reappear when a generator revisits the original date',async()=>{
  const r=await rec('Não recriar'),id=await tx(r,'-20','cancelled');assert.equal((await db.rpc('remove_recurring_records',entry(id))).error,null);
  const gen=await db.rpc('generate_recurring',{until_date:today});assert.equal(gen.error,null,gen.error?.message);const rows=await db.from('transactions').select('*').eq('source_id',`recurrence:${r}:${today}`);assert.equal(rows.data!.length,1);assert.ok(rows.data![0].deleted_at);
  const s=await snap();assert.equal(projectedRecurringExpenses(s,`${month}-01`,today).length,0);assert.equal(periodMetrics(s,`${month}-01`,today,false,today).expenses,'0.00');
 });
 await check('full history removal includes paid income/expense and pending entries but preserves unrelated transactions',async()=>{
  const r=await rec('Excluir histórico'),out=await tx(r,'-20','confirmed');
  const income=await rec('Receita recorrente',{type:'income',active:false});await tx(income,'30','confirmed');assert.equal(await balance(),1010);
  const future=new Date(Date.parse(today+'T12:00:00Z')+86400000).toISOString().slice(0,10);assert.equal((await admin.from('transactions').insert({user_id:users[0],account_id:account,description:'Pendente futuro',type:'expense',amount:'-20',date:future,status:'pending',source_id:`recurrence:${r}:${future}`})).error,null);
  const p=removal(r,true);const result=await Promise.all([db.rpc('remove_recurring_records',p),db.rpc('remove_recurring_records',p)]);for(const x of result)assert.equal(x.error,null,x.error?.message);assert.equal(await balance(),1030);
  assert.equal((await db.from('transactions').select('status').eq('id',out).single()).data!.status,'cancelled');const all=await db.from('transactions').select('status,deleted_at').like('source_id',`recurrence:${r}:%`);assert.equal(all.data!.length,2);assert.ok(all.data!.every(t=>t.status==='cancelled'&&t.deleted_at));
  assert.equal((await db.rpc('remove_recurring_records',removal(income,true))).error,null);assert.equal(await balance(),1000);
  assert.ok((await db.rpc('remove_recurring_records',{...p,include_history:false})).error);
 });
 await check('another user, anonymous calls and nonrecurring financial entries cannot be removed',async()=>{
  const r=await rec('Privada'),id=await tx(r,'-20');assert.ok((await other.rpc('remove_recurring_records',removal(r,true))).error);assert.ok((await other.rpc('remove_recurring_records',entry(id))).error);
  const normal=await admin.from('transactions').insert({user_id:users[0],account_id:account,description:'Sem recorrência',type:'expense',amount:'-5',date:today,status:'confirmed'}).select('id').single();assert.equal(normal.error,null);
  assert.ok((await db.rpc('remove_recurring_records',entry(normal.data!.id))).error);const anon=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false}});assert.ok((await anon.rpc('remove_recurring_records',removal(r,true))).error);assert.equal(await balance(),995);
 });
 await check('a linked financial movement rejects full removal atomically without changing other occurrences',async()=>{
  const r=await rec('Rollback'),normal=await tx(r,'-20'),future=new Date(Date.parse(today+'T12:00:00Z')+86400000).toISOString().slice(0,10);
  const linked=await admin.from('transactions').insert({user_id:users[0],account_id:account,description:'Movimento vinculado',type:'expense',amount:'-10',date:future,status:'pending',group_id:randomUUID(),source_id:`recurrence:${r}:${future}`});assert.equal(linked.error,null,linked.error?.message);
  assert.ok((await db.rpc('remove_recurring_records',removal(r,true))).error);
  assert.equal((await db.from('recurring_transactions').select('deleted_at,active').eq('id',r).single()).data!.deleted_at,null);
  assert.equal((await db.from('transactions').select('status,deleted_at').eq('id',normal).single()).data!.status,'pending');
  const audit=await db.from('financial_integrity_revisions').select('id').eq('entity_id',r);assert.equal(audit.data!.length,0);assert.equal(await balance(),995);
 });
 console.log(`Recurring removal checks: ${passed} passed`);
}finally{for(const id of users)assert.equal((await admin.auth.admin.deleteUser(id)).error,null);}
