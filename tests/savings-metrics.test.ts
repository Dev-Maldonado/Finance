import { expect,test } from 'vitest';
import { savingsMetrics,savingsPeriodMetrics } from '../src/lib/savings-metrics';
import { manualSavingsPosition,manualSavingsHistory } from '../src/lib/manual-savings';
import { financialSummary,type Snapshot } from '../src/lib/summary';
const sample=():Snapshot=>({user:{id:'u',email:''},savings_goals:[{id:'g',account_id:'s',target:'2000'}],financial_accounts:[{id:'s',kind:'savings',initial_balance:'1000'}],account_balances:[{id:'s',kind:'savings',balance:'1300'}],savings_movements:[{goal_id:'g',type:'deposit',amount:'1000',date:'2026-09-01'},{goal_id:'g',type:'deposit',amount:'500',date:'2026-10-01',transaction_group:'d'},{goal_id:'g',type:'manual_withdrawal',amount:'300',date:'2026-10-03',transaction_group:'w'}],transactions:[{account_id:'s',status:'confirmed',date:'2026-09-30',amount:'100',type:'adjustment',source_id:'manual-savings:first'},{account_id:'s',status:'confirmed',date:'2026-10-01',amount:'500',type:'transfer',group_id:'d'},{account_id:'s',status:'confirmed',date:'2026-10-03',amount:'-300',type:'transfer',group_id:'w'}],manual_savings_updates:[{goal_id:'g',date:'2026-09-30',balance:'1100',adjustment:'100'}],benchmark_rates:[{series:'12',date:'2026-10-01',value:'99',validated:true}]});
test('deposits and withdrawals never become gains or losses, nor do benchmark rates change manual balances',()=>{
 const s=sample(),g=(s.savings_goals as never[])[0];
 expect(manualSavingsPosition(s,g,'2026-10-08')).toMatchObject({deposits:'1500.00',withdrawals:'300.00',balance:'1300.00',profit:'100.00',percent:'6.67'});
 expect(savingsMetrics(s,'2026-10-08')).toMatchObject({daily:'0.00',monthly:'0.00'});
 expect(financialSummary(s,'2026-10-01','2026-10-08','2026-10-08').goals[0].manual.profit).toBe('100.00');
});
test('a jar awaits manual observation even if official CDI history exists',()=>{
 const s=sample();s.manual_savings_updates=[];s.transactions=(s.transactions as import('../src/lib/summary').Row[]).filter(t=>t.type!=='adjustment');
 const p=manualSavingsPosition(s,(s.savings_goals as never[])[0],'2026-10-08');
 expect(p).toMatchObject({balance:'1200.00',known:false,profit:null,percent:null});
});
test('manual changes respect period boundaries and losses, without projecting future observations',()=>{
 const s=sample();(s.transactions as import('../src/lib/summary').Row[]).push({account_id:'s',status:'confirmed',date:'2026-10-05',amount:'-50',type:'adjustment'}, {account_id:'s',status:'confirmed',date:'2026-11-01',amount:'999',type:'adjustment'});
 expect(savingsPeriodMetrics(s,'2026-09-01','2026-09-30','2026-10-08').value).toBe('100.00');
 expect(savingsPeriodMetrics(s,'2026-10-01','2026-10-31','2026-10-08').value).toBe('-50.00');
 expect(savingsPeriodMetrics(s,'2026-11-01','2026-11-30','2026-10-08').value).toBe('0.00');
});
test('monthly history freezes an observation before a later same-day deposit',()=>{
 const s=sample();s.savings_movements=[{goal_id:'g',type:'deposit',amount:'1000',date:'2026-09-01'},{goal_id:'g',type:'deposit',amount:'500',date:'2026-09-30',created_at:'2026-09-30T16:00:00Z',transaction_group:'later'}];s.transactions=[{account_id:'s',status:'confirmed',date:'2026-09-30',amount:'100',type:'adjustment'},{account_id:'s',status:'confirmed',date:'2026-09-30',amount:'500',type:'transfer',group_id:'later'}];s.manual_savings_updates=[{goal_id:'g',date:'2026-09-30',balance:'1100',adjustment:'100',cutoff:'2026-09-30T12:00:00Z'}];
 expect(manualSavingsHistory(s,(s.savings_goals as never[])[0],'2026-10-08')[0]).toMatchObject({balance:'1100',invested:'1000.00',profit:'100.00',percent:'10.00'});
});

test('actual withholding tax lowers cumulative returns once, and a gross withdrawal is not earnings',()=>{
 const s=sample();s.savings_movements=[{goal_id:'g',type:'deposit',amount:'1000',date:'2026-09-01'},{goal_id:'g',type:'manual_withdrawal',amount:'100',date:'2026-10-01'},{goal_id:'g',type:'tax',amount:'10',date:'2026-10-01'}];s.transactions=[{account_id:'s',status:'confirmed',date:'2026-09-30',amount:'100',type:'adjustment'},{account_id:'s',status:'confirmed',date:'2026-10-01',amount:'-90',type:'transfer'},{account_id:'s',status:'confirmed',date:'2026-10-01',amount:'-10',type:'expense'}];
 expect(manualSavingsPosition(s,(s.savings_goals as never[])[0],'2026-10-08')).toMatchObject({balance:'1000.00',profit:'90.00',percent:'9.00'});
 expect(savingsPeriodMetrics(s,'2026-10-01','2026-10-08','2026-10-08').value).toBe('-10.00');
});

test('an empty jar observation before the first same-day deposit has no fabricated capital or percent',()=>{
 const s=sample();s.financial_accounts=[{id:'s',kind:'savings',initial_balance:'0'}];s.savings_lots=[{goal_id:'g',principal:'500',remaining:'500',start_date:'2026-09-30'}];s.savings_movements=[{goal_id:'g',type:'deposit',amount:'500',date:'2026-09-30',created_at:'2026-09-30T16:00:00Z',transaction_group:'later'}];s.transactions=[{account_id:'s',status:'confirmed',date:'2026-09-30',amount:'100',type:'adjustment'},{account_id:'s',status:'confirmed',date:'2026-09-30',amount:'500',type:'transfer',group_id:'later'}];s.manual_savings_updates=[{goal_id:'g',date:'2026-09-30',balance:'100',adjustment:'100',cutoff:'2026-09-30T12:00:00Z'}];
 expect(manualSavingsHistory(s,(s.savings_goals as never[])[0],'2026-10-08')[0]).toMatchObject({invested:'0.00',balance:'100',profit:'100.00',percent:null});
});
