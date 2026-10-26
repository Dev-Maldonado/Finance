import { expect,test } from 'vitest';
import { periodMetrics } from '../src/lib/dashboard';
import { forecastItems } from '../src/lib/financial-plan';
import { monthlyCommitments } from '../src/lib/monthly-commitments';
import { transactionStatus } from '../src/lib/transaction-state';
import type { Snapshot } from '../src/lib/summary';
const s:Snapshot={user:{id:'test',email:''},financial_accounts:[{id:'a',kind:'bank'}],transactions:[
 {id:'late',account_id:'a',type:'income',amount:'200',status:'confirmed',date:'2026-09-30',settled_on:'2026-10-02'},
 {id:'early',account_id:'a',type:'expense',amount:'-60',status:'confirmed',date:'2026-11-01',settled_on:'2026-10-02'},
 {id:'overdue',account_id:'a',type:'expense',amount:'-10',status:'pending',date:'2026-09-30'},
 {id:'week',account_id:'a',type:'expense',amount:'-15',status:'pending',date:'2026-11-01'},
 {id:'later',account_id:'a',type:'expense',amount:'-30',status:'pending',date:'2026-11-10'},
 {id:'cancelled',type:'expense',amount:'-900',status:'cancelled',date:'2026-10-02',settled_on:'2026-10-02'},
]};
test('competence, actual cash and forecasts remain separate for early and late settlement',()=>{
 const today='2026-10-26';
 expect(periodMetrics(s,'2026-09-01','2026-09-30',false,today)).toMatchObject({income:'200.00',expenses:'10.00',received:'0.00',cashNet:'0.00'});
 expect(periodMetrics(s,'2026-10-01','2026-10-31',false,today)).toMatchObject({income:'0.00',expenses:'0.00',received:'200.00',paidExpense:'60.00',cashNet:'140.00'});
 expect(periodMetrics(s,'2026-11-01','2026-11-30',false,today)).toMatchObject({expenses:'105.00',settledExpense:'60.00',expectedExpense:'45.00',paidExpense:'0.00'});
 expect(forecastItems(s,today,'2026-11-30').map(t=>t.id)).toEqual(['transaction:overdue','transaction:week','transaction:later']);
});
test('action filters cross month boundaries, respect payment dates and do not fabricate old projections',()=>{
 expect(monthlyCommitments(s,'2026-10','2026-10-26',{start:'0001-01-01',end:'2026-10-25',project:false}).totals.total).toBe('10.00');
 expect(monthlyCommitments(s,'2026-10','2026-10-26',{start:'2026-10-26',end:'2026-11-02'}).totals.total).toBe('15.00');
 expect(monthlyCommitments(s,'2026-11','2026-10-26').totals.total).toBe('45.00');
});
test('contextual statuses distinguish scheduled, unpaid, received and paid',()=>{
 expect(transactionStatus({type:'income',status:'pending'},'2026-10-26')).toContain('A receber');
 expect(transactionStatus({type:'income',status:'confirmed',date:'2026-11-01'},'2026-10-26')).toContain('Agendado');
 expect(transactionStatus({type:'expense',status:'confirmed',date:'2026-11-01',settled_on:'2026-10-02'},'2026-10-26')).toContain('Pago');
});
