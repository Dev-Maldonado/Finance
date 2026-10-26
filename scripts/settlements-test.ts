import assert from 'node:assert/strict';
import { scopedSource } from '../src/lib/import';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { periodMetrics, monthEnd } from '../src/lib/dashboard';
import { forecastItems } from '../src/lib/financial-plan';
import { monthlyCommitments } from '../src/lib/monthly-commitments';
import { shiftInvoiceMonth } from '../src/lib/card-invoices';
import { rows, type Snapshot } from '../src/lib/summary';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname),'Local disposable database only');
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}}),users:string[]=[];
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date()),month=today.slice(0,7),previous=shiftInvoiceMonth(month,-1),next=shiftInvoiceMonth(month,1);
let passed=0;
async function check(name:string,fn:()=>Promise<void>){await fn();console.log('PASS',name);passed++;}
async function user(){const email=`settlement-${randomUUID()}@example.test`,password=randomUUID()+'Aa1!';const r=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(r.error,null);users.push(r.data.user!.id);const db=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false}});assert.equal((await db.auth.signInWithPassword({email,password})).error,null);return db;}
async function snap(db:SupabaseClient):Promise<Snapshot>{const r=await db.rpc('read_financial_snapshot');assert.equal(r.error,null,r.error?.message);return {user:{id:users[0],email:''},...r.data};}
try{
 const db=await user(),other=await user();
 const a=await db.from('financial_accounts').insert({name:'Conta principal',kind:'bank',initial_balance:'1000'}).select('id').single();assert.equal(a.error,null);const account=a.data!.id;
 const b=await other.from('financial_accounts').insert({name:'Conta alheia',kind:'bank'}).select('id').single();assert.equal(b.error,null);
 const op=async(type:string,amount:string,date:string,status='pending',extra={})=>{const r=await db.rpc('execute_operation',{action:'transaction',payload:{account_id:account,description:'Conta de teste',type,amount,date,status,...extra},request_id:randomUUID()});assert.equal(r.error,null,r.error?.message);return r.data.id as string;};
 const pay=(transaction_id:string)=>({transaction_id,recurrence_id:null,occurrence_date:null,obligation_id:null,account_id:account,settled_on:today,request_id:randomUUID()});
 const balance=async()=>{const r=await db.from('account_balances').select('balance').eq('id',account).single();assert.equal(r.error,null);return r.data!.balance;};
 const early=await op('expense','60',`${next}-01`),late=await op('income','200',`${previous}-01`);
 await check('payments preserve competence and count cash only in the effective month, including retries',async()=>{
  const p=pay(early),r=await Promise.all([db.rpc('settle_financial_entry',p),db.rpc('settle_financial_entry',p)]);for(const x of r)assert.equal(x.error,null,x.error?.message);assert.equal(r[0].data,r[1].data);
  assert.equal((await db.rpc('settle_financial_entry',pay(late))).error,null);
  assert.equal(await balance(),'1140.00');const s=await snap(db);
  assert.deepEqual(rows(s,'transactions').find(t=>t.id===early)?.date,`${next}-01`);
  assert.deepEqual(rows(s,'transactions').find(t=>t.id===early)?.settled_on,today);
  assert.equal(periodMetrics(s,`${next}-01`,monthEnd(next),false,today).expenses,'60.00');
  const m=periodMetrics(s,`${month}-01`,monthEnd(month),false,today);assert.equal(m.income,'0.00');assert.equal(m.received,'200.00');assert.equal(m.paidExpense,'60.00');assert.equal(m.cashNet,'140.00');
  assert.equal(monthlyCommitments(s,next,today).totals.scheduled,'0.00');assert.ok(!forecastItems(s,today,monthEnd(next)).some(t=>t.id===`transaction:${early}`));
  assert.ok((await db.rpc('settle_financial_entry',pay(early))).error);assert.ok((await db.rpc('settle_financial_entry',{...p,settled_on:`${previous}-01`})).error);
 });
 await check('bank-statement reconciliation matches an effective date without duplicating the transaction',async()=>{
  const r=await db.rpc('import_classified_transactions',{items:[{account_id:account,source_id:scopedSource(account,'settlement-match-'+randomUUID()),request_id:randomUUID(),description:'Conta de teste',date:today,amount:'-60',classification:'match',transaction_id:early}]});
  assert.equal(r.error,null,r.error?.message);assert.equal(r.data.matched,1);assert.equal(await balance(),'1140.00');
  const reconcile=await db.rpc('execute_operation',{action:'reconcile_account',payload:{account_id:account,date:today,confirmed_balance:'1140',apply_adjustment:false},request_id:randomUUID()});assert.equal(reconcile.error,null,reconcile.error?.message);
  const saved=await db.from('account_reconciliations').select('difference').eq('id',reconcile.data.id).single();assert.equal(saved.error,null);assert.equal(Number(saved.data!.difference),0);
 });
 await check('cross-user accounts, future actual dates and direct wrapper bypasses are rejected',async()=>{
  const pending=await op('expense','10',`${next}-02`),p=pay(pending);
  assert.ok((await other.rpc('settle_financial_entry',p)).error);
  assert.ok((await db.rpc('settle_financial_entry',{...p,account_id:b.data!.id})).error);
  assert.ok((await db.rpc('settle_financial_entry',{...p,settled_on:`${next}-01`})).error);
  assert.ok((await db.rpc('execute_operation_before_settlement',{action:'transaction',payload:{},request_id:randomUUID()})).error);
  assert.equal(await balance(),'1140.00');
 });
 await check('settling future recurring projection materializes one occurrence; generator and future edits cannot duplicate or rewrite it',async()=>{
  const r=await db.from('recurring_transactions').insert({account_id:account,description:'Assinatura',amount:'20',type:'expense',frequency:'monthly',next_date:`${next}-01`}).select('id').single();assert.equal(r.error,null);
  const p={...pay(''),transaction_id:null,recurrence_id:r.data!.id,occurrence_date:`${next}-01`};
  const result=await db.rpc('settle_financial_entry',p);assert.equal(result.error,null,result.error?.message);
  assert.ok((await db.rpc('generate_recurring',{until_date:`${next}-01`})).error);
  assert.equal((await db.rpc('generate_recurring',{until_date:today})).error,null);
  const tx=await db.from('transactions').select('*').eq('source_id',`recurrence:${r.data!.id}:${next}-01`);assert.equal(tx.data!.length,1);assert.equal(tx.data![0].id,result.data);
  assert.equal(monthlyCommitments(await snap(db),next,today).totals.fixed,'0.00');
  const revise=await db.rpc('revise_recurring_occurrence',{recurrence_id:r.data!.id,occurrence_date:`${next}-01`,scope:'future',cancel:true,replacement:{},request_id:randomUUID()});assert.ok(revise.error);
  assert.equal(await balance(),'1120.00');
 });
 await check('defaults enforce ownership and hierarchy references without altering existing transactions',async()=>{
  const c=await db.from('categories').insert({name:'Despesas'}).select('id').single();assert.equal(c.error,null);
  assert.equal((await db.from('user_settings').upsert({user_id:users[0],default_account_id:account,default_expense_category_id:c.data!.id})).error,null);
  assert.ok((await db.from('user_settings').update({default_account_id:b.data!.id}).eq('user_id',users[0])).error);
  assert.ok((await other.from('user_settings').upsert({user_id:users[1],default_expense_category_id:c.data!.id})).error);
  assert.equal(await balance(),'1120.00');
 });
 await check('editing or cancelling a paid transaction keeps correct cash and supports type corrections',async()=>{
  const payload={account_id:account,description:'Receita corrigida',type:'income',amount:'200',date:`${previous}-01`,status:'confirmed',settled_on:today};
  assert.equal((await db.rpc('revise_transaction',{transaction_id:late,replacement:payload})).error,null);
  assert.equal((await db.rpc('revise_transaction',{transaction_id:late,replacement:{...payload,type:'yield',settled_on:null}})).error,null);
  assert.equal((await db.from('transactions').select('settled_on').eq('id',late).single()).data!.settled_on,null);
  assert.equal((await db.rpc('revise_transaction',{transaction_id:early,replacement:{},cancel:true})).error,null);
  assert.equal(await balance(),'1180.00');
 });
 await check('creation actual dates are idempotent; pending clears settlement; legacy null dates retain behavior',async()=>{
  const p={action:'transaction',payload:{account_id:account,description:'Receita antecipada',type:'income',amount:'30',date:`${next}-03`,settled_on:today,status:'confirmed'},request_id:randomUUID()};
  const r=await db.rpc('execute_operation',p);assert.equal(r.error,null,r.error?.message);assert.equal((await db.rpc('execute_operation',p)).data.id,r.data.id);assert.equal(await balance(),'1210.00');
  const changed={...p.payload,status:'pending',settled_on:null};assert.equal((await db.rpc('revise_transaction',{transaction_id:r.data.id,replacement:changed})).error,null);
  assert.equal((await db.rpc('execute_operation',p)).data.id,r.data.id);assert.equal(await balance(),'1180.00');
  await op('expense','5',today,'confirmed');await op('expense','500',`${next}-04`,'confirmed');assert.equal(await balance(),'1175.00');
 });
 await check('an obligation is paid once while preserving its due date',async()=>{
  const o=await db.from('financial_obligations').insert({name:'Licenciamento',amount:'15',due_date:`${next}-05`}).select('id').single();assert.equal(o.error,null);
  const p={...pay(''),transaction_id:null,obligation_id:o.data!.id};const r=await db.rpc('settle_financial_entry',p);assert.equal(r.error,null,r.error?.message);
  const tx=await db.from('transactions').select('date,settled_on,amount').eq('id',r.data).single();assert.deepEqual(tx.data,{date:`${next}-05`,settled_on:today,amount:-15});
  assert.ok((await db.rpc('settle_financial_entry',{...p,request_id:randomUUID()})).error);assert.equal(await balance(),'1160.00');
  const linked=await db.from('financial_obligations').select('status,transaction_id').eq('id',o.data!.id).single();assert.deepEqual(linked.data,{status:'paid',transaction_id:r.data});
  const bogus=await admin.from('transactions').insert({user_id:users[0],account_id:account,description:'Invalid internal settlement',type:'expense',amount:'-15',date:`${next}-05`,status:'confirmed',settled_on:today,group_id:randomUUID()});assert.ok(bogus.error);
  const reversed=await db.rpc('cancel_obligation_payment',{obligation_id:o.data!.id});assert.equal(reversed.error,null,reversed.error?.message);assert.equal(await balance(),'1175.00');
  const cancelled=await db.from('transactions').select('status,settled_on').eq('id',r.data).single();assert.deepEqual(cancelled.data,{status:'cancelled',settled_on:today});

 });
 console.log(`${passed} settlement integration scenarios passed.`);
}finally{for(const uid of users)assert.equal((await admin.auth.admin.deleteUser(uid)).error,null);}
