import {expect,test} from 'vitest';
import {dashboardModel,periodMetrics,periodCategoryTotals} from '../src/lib/dashboard';
import {financialSummary,type Snapshot} from '../src/lib/summary';
import {transactionHistory,filterTransactionHistory} from '../src/lib/transaction-history';
import {projectedRecurringExpenses} from '../src/lib/recurrence';
const rid='11111111-1111-4111-8111-111111111111';
const sample=():Snapshot=>({user:{id:'u',email:''},financial_accounts:[{id:'cash',kind:'bank',name:'Conta'}],account_balances:[{id:'cash',kind:'bank',balance:'1000'}],categories:[{id:'home',name:'Moradia'}],transactions:[{id:'income',account_id:'cash',type:'income',amount:'2000',status:'confirmed',date:'2026-10-01'}],recurring_transactions:[{id:rid,account_id:'cash',category_id:'home',description:'Internet',type:'expense',amount:'123.45',next_date:'2026-10-30',start_date:'2026-10-30',frequency:'monthly',anchor_day:'30',active:true}],budgets:[{id:'budget',month:'2026-10-01',category_id:'home',name:'Moradia',amount:'200'}]});
test('fixed expense enters its own month, net, categories, budget and transaction view, never paid cash',()=>{
 const s=sample(),before=structuredClone(s),m=dashboardModel(s,'2026-10-01','2026-10-31','calendar','2026-10-28');
 expect(m.current).toMatchObject({income:'2000.00',expenses:'123.45',net:'1876.55',expectedExpense:'123.45',paidExpense:'0.00',cashNet:'2000.00',hasExpected:true});
 expect(m.categories[0]).toMatchObject({name:'Moradia',value:'123.45'});expect(m.budgets[0].spent).toBe('123.45');
 expect(financialSummary(s,'2026-10-01','2026-10-31','2026-10-28')).toMatchObject({expense:'123.45',cash:'1000.00'});
 expect(periodCategoryTotals(s,'2026-10-01','2026-10-31')[0].value).toBe('123.45');
 expect(transactionHistory(s,'2026-10-28','2026-10-01','2026-10-31').filter(t=>t.projected)).toHaveLength(1);
 expect(periodMetrics(s,'2026-11-01','2026-11-30',false,'2026-10-28').expenses).toBe('123.45');
 expect(periodMetrics(s,'2026-10-01','2026-10-29',false,'2026-10-28').expenses).toBe('0.00');expect(s).toEqual(before);
});
test('saved, rescheduled, settled and cancelled/deleted occurrences replace projections exactly once',()=>{
 for(const status of ['pending','confirmed','cancelled']){
  const s=sample();(s.transactions as object[]).push({id:'actual',source_id:`recurrence:${rid}:2026-10-30`,date:'2026-11-02',settled_on:status==='confirmed'?'2026-10-28':null,type:'expense',amount:'-100',status,deleted_at:status==='cancelled'?'2026-10-28T12:00:00Z':null});
  expect(projectedRecurringExpenses(s,'2026-10-01','2026-10-31')).toHaveLength(0);
  expect(periodMetrics(s,'2026-10-01','2026-10-31',false,'2026-10-28').expenses).toBe('0.00');
  expect(periodMetrics(s,'2026-11-01','2026-11-30',false,'2026-10-28').expenses).toBe(status==='cancelled'?'123.45':'223.45');
  if(status==='cancelled')expect(transactionHistory(s,'2026-10-28','2026-11-01','2026-11-30').some(t=>t.id==='actual')).toBe(false);
 }
});
test('pausing, ending or removing a recurrence stops only its unregistered projections',()=>{
 for(const patch of [{active:false},{cancelled_at:'2026-10-28T12:00:00Z'},{deleted_at:'2026-10-28T12:00:00Z'},{end_date:'2026-10-29'}]){
  const s=sample();Object.assign((s.recurring_transactions as object[])[0],patch);
  expect(periodMetrics(s,'2026-10-01','2026-10-31').expenses).toBe('0.00');
 }
 const s=sample();(s.financial_accounts as object[])[0]={id:'cash',kind:'bank',archived:true};expect(projectedRecurringExpenses(s,'2026-10-01','2026-10-31')).toHaveLength(0);
});
test('weekly cents and annual leap clamping respect each period without adding future months',()=>{
 const s=sample();Object.assign((s.recurring_transactions as object[])[0],{amount:'9.99',frequency:'weekly',next_date:'2026-10-01',start_date:'2026-10-01'});
 expect(periodMetrics(s,'2026-10-01','2026-10-31').expenses).toBe('49.95');expect(periodMetrics(s,'2026-10-08','2026-10-14',false).expenses).toBe('9.99');
 Object.assign((s.recurring_transactions as object[])[0],{frequency:'annual',next_date:'2024-02-29',start_date:'2024-02-29',anchor_day:'29',anchor_month:'2'});
 expect(projectedRecurringExpenses(s,'2025-02-01','2025-02-28').map(t=>t.date)).toEqual(['2025-02-28']);
 expect(periodMetrics(s,'2025-03-01','2025-03-31').expenses).toBe('0.00');
});
