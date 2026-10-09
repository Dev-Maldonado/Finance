import { D, money } from '@/financial/engine';
import type { Row, Snapshot } from './summary';
const records = (s: Snapshot,key: string): Row[] => (s[key] as Row[] | undefined) ?? [];
const value = (r: Row,k: string) => String(r[k] ?? '');
export function manualSavingsPosition(s: Snapshot, goal: Row, asOf: string, cutoff?: string) {
 const movements = records(s,'savings_movements').filter(m=>m.goal_id===goal.id && m.status!=='cancelled' && value(m,'date')<=asOf && (!cutoff || value(m,'date')<asOf || !m.created_at || value(m,'created_at')<=cutoff));
 const total = (types: string[]) => movements.filter(m=>types.includes(value(m,'type'))).reduce((a,m)=>a.plus(value(m,'amount')),D(0));
 const lots=records(s,'savings_lots').filter(l=>l.goal_id===goal.id && l.status!=='cancelled' && value(l,'start_date')<=asOf);
 const deposits = records(s,'savings_movements').some(m=>m.goal_id===goal.id && m.type==='deposit' && m.status!=='cancelled' && value(m,'date')<=asOf) ? total(['deposit']) : lots.reduce((a,l)=>a.plus(value(l,'principal')||'0'),D(0));
 const withdrawals = total(['withdrawal','withdrawn_yield','manual_withdrawal']);
 const taxes = total(['tax']);
 const account = records(s,'financial_accounts').find(a=>a.id===goal.account_id);
 const updates = records(s,'manual_savings_updates').filter(u=>u.goal_id===goal.id && value(u,'date')<=asOf).sort((a,b)=>value(a,'date').localeCompare(value(b,'date')));
 const transactions = records(s,'transactions').filter(t=>t.account_id===goal.account_id && t.status==='confirmed' && value(t,'date')<=asOf && (!cutoff || value(t,'date')<asOf || !records(s,'savings_movements').some(m=>m.transaction_group===t.group_id && m.goal_id===goal.id && m.status!=='cancelled' && value(m,'created_at')>cutoff)));
 const legacyYield=total(['confirmed_yield']).minus(total(['yield_reversal','withdrawn_yield']));
 const fallback=records(s,'account_balances').find(a=>a.id===goal.account_id);
 const balance = account ? transactions.reduce((a,t)=>a.plus(value(t,'amount')),D(value(account,'initial_balance')||'0')) : fallback ? D(value(fallback,'balance')||'0') : lots.reduce((a,l)=>a.plus(value(l,'remaining')||'0'),D(0)).plus(legacyYield);
 // Only actual user-confirmed ledger amounts enter returns. Benchmarks/lots never do.
 const profit = balance.plus(withdrawals).minus(taxes).minus(deposits);
 const known = updates.length>0 || movements.some(m=>['confirmed_yield','yield_reversal'].includes(value(m,'type'))) || records(s,'savings_reconciliations').some(r=>r.goal_id===goal.id && !!r.transaction_id && value(r,'date')<=asOf);
 const percent = known && deposits.gt(0) ? profit.div(deposits).mul(100).toFixed(2) : null;
 const earnings = account ? transactions.filter(t=>t.type==='yield' || t.type==='adjustment' || t.type==='expense').reduce((a,t)=>a.plus(value(t,'amount')),D(0)) : total(['confirmed_yield']).minus(total(['yield_reversal','tax'])).plus(updates.reduce((a,u)=>a.plus(value(u,'adjustment')||'0'),D(0)));
 return { goal, legacyYield:money(legacyYield),legacyYieldTotal:money(total(['confirmed_yield'])), updates, latest: updates.at(-1), deposits:money(deposits), withdrawals:money(withdrawals), taxes:money(taxes), netCapital:money(deposits.minus(withdrawals)), balance:money(balance), profit:known?money(profit):null, percent, known, earnings:money(earnings) };
}
export function manualSavingsHistory(s: Snapshot,goal: Row,end: string) {
 const dates = [...new Set(records(s,'manual_savings_updates').filter(u=>u.goal_id===goal.id && value(u,'date')<=end).map(u=>value(u,'date')))];
 return dates.sort().map(date=>{
  const update=records(s,'manual_savings_updates').find(u=>u.goal_id===goal.id && value(u,'date')===date);
  const p=manualSavingsPosition(s,goal,date,update?value(update,'cutoff'):undefined);
  return { date, invested:p.deposits, withdrawals:p.withdrawals, balance:update?value(update,'balance'):p.balance, profit:p.profit, percent:p.percent };
 });
}
