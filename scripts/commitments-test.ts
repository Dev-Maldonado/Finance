import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { monthlyCommitments } from '../src/lib/monthly-commitments';
import { shiftInvoiceMonth, invoiceDate } from '../src/lib/card-invoices';
import type { Snapshot } from '../src/lib/summary';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname), 'Use only the disposable local database');
const admin = createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}}), users: string[] = [];
const today = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
const month=today.slice(0,7), previous=shiftInvoiceMonth(month,-1), next=shiftInvoiceMonth(month,1), second=shiftInvoiceMonth(month,2), third=shiftInvoiceMonth(month,3);
let passed=0;
async function check(name:string, fn:()=>Promise<void>) {await fn(); console.log('PASS',name);passed++;}
async function user() {
  const email=`commitments-${randomUUID()}@example.test`, password=randomUUID()+'Aa1!';
  const result=await admin.auth.admin.createUser({email,password,email_confirm:true}); assert.equal(result.error,null);users.push(result.data.user!.id);
  const db=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false}});assert.equal((await db.auth.signInWithPassword({email,password})).error,null);return db;
}
async function snapshot(db:SupabaseClient):Promise<Snapshot> {const r=await db.rpc('read_financial_snapshot');assert.equal(r.error,null);return {user:{id:'test',email:''},...r.data};}
try {
  const db=await user(), other=await user();
  const a=await db.from('financial_accounts').insert({name:'Conta de teste',kind:'bank',initial_balance:'1000'}).select('id').single();assert.equal(a.error,null);const account=a.data!.id;
  const rec=await db.from('recurring_transactions').insert({account_id:account,description:'Internet',amount:'100',type:'expense',frequency:'monthly',next_date:`${previous}-01`}).select('id').single();assert.equal(rec.error,null);const rid=rec.data!.id;
  assert.equal((await db.rpc('generate_recurring',{until_date:today})).error,null);
  const historical=await db.from('transactions').select('*').eq('source_id',`recurrence:${rid}:${previous}-01`).single();assert.equal(historical.error,null);
  assert.equal((await db.rpc('revise_transaction',{transaction_id:historical.data!.id,replacement:{account_id:account,description:'Histórico pago',type:'expense',amount:'100',date:`${previous}-01`,status:'confirmed'},cancel:false})).error,null);
  const before=await db.from('transactions').select('*').eq('id',historical.data!.id).single();
  const payload=(date:string,scope='occurrence',amount='120', recurrence_id=rid)=>({recurrence_id,occurrence_date:date,scope,cancel:false,request_id:randomUUID(),replacement:{account_id:account,description:'Internet corrigida',amount,date}});
  await check('single future edit replaces its projection without changing other months or current cash',async()=>{
    assert.equal((await db.rpc('revise_recurring_occurrence',payload(`${next}-01`))).error,null);
    const s=await snapshot(db);assert.equal(monthlyCommitments(s,next,today).totals.fixed,'120.00');assert.equal(monthlyCommitments(s,second,today).totals.fixed,'100.00');
    assert.equal((await db.from('account_balances').select('balance').eq('id',account).single()).data!.balance,'900.00');
  });
  await check('single cancellation suppresses projection and is idempotent under concurrent retries',async()=>{
    const p={...payload(`${second}-01`),cancel:true,replacement:{}};
    const results=await Promise.all([db.rpc('revise_recurring_occurrence',p),db.rpc('revise_recurring_occurrence',p)]);assert.ok(results.every(r=>!r.error));assert.equal(results[0].data,results[1].data);
    assert.equal(monthlyCommitments(await snapshot(db),second,today).totals.fixed,'0.00');
    assert.ok((await db.rpc('revise_recurring_occurrence',{...p,cancel:false})).error);
  });
  let split='';
  await check('future split updates existing future occurrences and retains cancelled exceptions',async()=>{
    const p=payload(`${next}-01`,'future','150');const r=await db.rpc('revise_recurring_occurrence',p);assert.equal(r.error,null,r.error?.message);split=r.data;
    assert.equal((await db.rpc('revise_recurring_occurrence',p)).data,split);
    const s=await snapshot(db);assert.equal(monthlyCommitments(s,next,today).totals.fixed,'150.00');assert.equal(monthlyCommitments(s,second,today).totals.fixed,'0.00');assert.equal(monthlyCommitments(s,third,today).totals.fixed,'150.00');assert.equal(monthlyCommitments(s,month,today).totals.fixed,'100.00');
    assert.deepEqual((await db.from('transactions').select('*').eq('id',historical.data!.id).single()).data,before.data);
  });
  let splitAgain='';
  await check('editing an earlier occurrence replaces all later segments while preserving previous months',async()=>{
    const r=await db.rpc('revise_recurring_occurrence',payload(`${month}-01`,'future','180'));assert.equal(r.error,null,r.error?.message);splitAgain=r.data;
    const s=await snapshot(db);assert.equal(monthlyCommitments(s,month,today).totals.fixed,'180.00');assert.equal(monthlyCommitments(s,next,today).totals.fixed,'180.00');assert.equal(monthlyCommitments(s,second,today).totals.fixed,'0.00');assert.equal(monthlyCommitments(s,third,today).totals.fixed,'180.00');
    assert.deepEqual((await db.from('transactions').select('*').eq('id',historical.data!.id).single()).data,before.data);
    assert.equal((await db.rpc('generate_recurring',{until_date:today})).data,0);
    const active=(await db.from('transactions').select('id').eq('date',`${month}-01`).neq('status','cancelled')).data;assert.equal(active!.length,1);
  });
  await check('future cancellation stops subsequent forecasts and keeps earlier registered expenses',async()=>{
    const r=await db.rpc('revise_recurring_occurrence',{...payload(`${third}-01`,'future','180',splitAgain),cancel:true,replacement:{}});assert.equal(r.error,null,r.error?.message);
    const s=await snapshot(db);assert.equal(monthlyCommitments(s,next,today).totals.fixed,'180.00');assert.equal(monthlyCommitments(s,third,today).totals.fixed,'0.00');assert.equal(monthlyCommitments(s,shiftInvoiceMonth(third,2),today).totals.fixed,'0.00');
  });
  await check('ownership, occurrence dates, settled entries, accounts and null scopes are enforced by the RPC',async()=>{
    assert.ok((await other.rpc('revise_recurring_occurrence',payload(`${next}-01`,'occurrence','120',splitAgain))).error);
    assert.ok((await db.rpc('revise_recurring_occurrence',payload(`${next}-02`,'occurrence','120',splitAgain))).error);
    assert.ok((await db.rpc('revise_recurring_occurrence',payload(`${previous}-01`))).error);
    const otherAccount=await other.from('financial_accounts').insert({name:'Outra conta',kind:'bank'}).select('id').single();assert.equal(otherAccount.error,null);
    const p=payload(`${next}-01`,'occurrence','120',splitAgain);
    assert.ok((await db.rpc('revise_recurring_occurrence',{...p,replacement:{...p.replacement,account_id:otherAccount.data!.id}})).error);
    assert.ok((await db.rpc('revise_recurring_occurrence',{...p,scope:null})).error);
    assert.ok((await db.from('recurring_transactions').update({series_id:splitAgain}).eq('id',rid)).error);
  });
  await check('annual and short-month anchors survive future series splits',async()=>{
    const futureYear=Number(month.slice(0,4))+1, annualDate=invoiceDate(`${futureYear}-02`,29);
    const r=await db.from('recurring_transactions').insert({account_id:account,description:'Anual',amount:'20',type:'expense',frequency:'annual',next_date:annualDate,anchor_day:29,anchor_month:2}).select('id').single();assert.equal(r.error,null);
    const revised=await db.rpc('revise_recurring_occurrence',payload(annualDate,'future','25',r.data!.id));assert.equal(revised.error,null,revised.error?.message);
    const record=await db.from('recurring_transactions').select('anchor_day,anchor_month,frequency').eq('id',revised.data).single();assert.deepEqual(record.data,{anchor_day:29,anchor_month:2,frequency:'annual'});
  });
  await check('legacy occurrences moved to another month can be corrected individually without rewriting earlier months',async()=>{
    const r=await db.from('recurring_transactions').insert({account_id:account,description:'Transferida de mês',amount:'10',type:'expense',frequency:'monthly',next_date:`${next}-01`}).select('id').single();assert.equal(r.error,null);
    assert.equal((await admin.from('transactions').insert({user_id:users[0],account_id:account,description:'Transferida de mês',amount:'-10',type:'expense',date:`${second}-15`,status:'pending',source_id:`recurrence:${r.data!.id}:${next}-01`})).error,null);
    const p=payload(`${next}-01`,'occurrence','12',r.data!.id);p.replacement.date=`${second}-15`;
    assert.equal((await db.rpc('revise_recurring_occurrence',p)).error,null);
    assert.ok((await db.rpc('revise_recurring_occurrence',{...payload(`${next}-01`,'future','12',r.data!.id)})).error);
  });
  console.log(`${passed} verificações de contas recorrentes aprovadas.`);
} finally {for(const id of users) assert.equal((await admin.auth.admin.deleteUser(id)).error,null);}
