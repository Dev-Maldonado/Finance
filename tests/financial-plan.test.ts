import { expect, test } from 'vitest';
import { financialPlan, forecastItems } from '../src/lib/financial-plan';
import { dashboardModel } from '../src/lib/dashboard';
import { type Row, type Snapshot } from '../src/lib/summary';

const base=():Snapshot=>({user:{id:'u',email:''},financial_accounts:[{id:'cash',kind:'bank',name:'Conta'}],account_balances:[{id:'cash',kind:'bank',balance:'1000'}],transactions:[{id:'phone',account_id:'cash',description:'Telefone',type:'expense',amount:'-100',date:'2026-10-20',status:'pending'}],recurring_transactions:[{id:'salary',account_id:'cash',description:'Salário previsto',type:'income',amount:'2000',next_date:'2026-10-15',frequency:'monthly',active:true},{id:'rent',account_id:'cash',description:'Conta prevista',type:'expense',amount:'200',next_date:'2026-10-31',anchor_day:'31',frequency:'monthly',active:true}],financial_obligations:[{id:'loan-payment',name:'Pagamento empréstimo',amount:'300',due_date:'2026-10-22',status:'pending'}],credit_cards:[{id:'c',name:'Cartão',closing_day:'5',due_day:'10'}],credit_card_purchases:[{id:'p',card_id:'c',date:'2026-09-01',amount:'300',installments:'3'}],credit_card_invoices:['2026-10','2026-11','2026-12'].map(month=>({id:month,card_id:'c',due_date:`${month}-10`})),credit_card_installments:['2026-10','2026-11','2026-12'].map(month=>({id:`part:${month}`,invoice_id:month,purchase_id:'p',amount:'100'}))});

test('cash forecast 30/60/90 uses only registered receipts and outflows, preserving projected status',()=>{
  const plan=financialPlan(base(),'2026-10-08');
  expect(plan.forecast.map(f=>({days:f.days,income:f.income,expenses:f.expenses,balance:f.balance}))).toEqual([{days:30,income:'2000.00',expenses:'700.00',balance:'2300.00'},{days:60,income:'4000.00',expenses:'1000.00',balance:'4000.00'},{days:90,income:'6000.00',expenses:'1300.00',balance:'5700.00'}]);
  expect(plan.forecast[0].items.every(i=>i.status==='projected')).toBe(true);
  expect(plan.spendable).toMatchObject({balance:'2300.00',available:'300.00',perDay:'12.50',income:'2000.00',expenses:'700.00',daysRemaining:24});
  expect(dashboardModel(base(),'2026-10-01','2026-10-08','month','2026-10-08')).toMatchObject({afterCommitments:'300.00',pendingObligations:'300.00',recurringExpenses:'200.00',totalCommitments:'700.00'});
});

test('a recurring expense already generated and an obligation linked to a transaction are deducted once',()=>{
  const snapshot=base();
  (snapshot.transactions as Row[]).push({id:'generated',account_id:'cash',description:'Conta prevista',type:'expense',amount:'-200',date:'2026-10-31',status:'pending',source_id:'recurrence:rent:2026-10-31'},{id:'loan-transaction',account_id:'cash',description:'Empréstimo',type:'expense',amount:'-300',date:'2026-10-22',status:'pending'});
  snapshot.financial_obligations=[{id:'loan-payment',name:'Pagamento empréstimo',amount:'300',due_date:'2026-10-22',status:'pending',transaction_id:'loan-transaction'}];
  expect(financialPlan(snapshot,'2026-10-08').forecast[0].expenses).toBe('700.00');
  expect(forecastItems(snapshot,'2026-10-08','2026-11-07').filter(i=>i.id==='recurrence:rent:2026-10-31')).toHaveLength(0);
});

test('minimum cash detects shortfalls before registered future salary arrives',()=>{
  const snapshot:Snapshot={user:{id:'u',email:''},account_balances:[{kind:'bank',balance:'50'}],financial_obligations:[{id:'bill',name:'Conta',amount:'100',due_date:'2026-10-10',status:'pending'}],recurring_transactions:[{id:'salary',description:'Salário',type:'income',amount:'1000',frequency:'monthly',next_date:'2026-10-15',active:true}]};
  const plan=financialPlan(snapshot,'2026-10-08');
  expect(plan.forecast[0]).toMatchObject({minimumBalance:'-50.00',minimumDate:'2026-10-10',balance:'950.00'});
  expect(plan.spendable).toMatchObject({available:'0.00',deficit:'50.00',perDay:'0.00'});
  expect(plan.alerts.find(a=>a.id==='cash-shortfall')).toMatchObject({severity:'danger',date:'2026-10-10'});
});

test('end-of-month recurrences keep their anchor through short months without drift',()=>{
  const snapshot:Snapshot={user:{id:'u',email:''},recurring_transactions:[{id:'r',description:'Conta',type:'expense',amount:'100',frequency:'monthly',next_date:'2024-01-31',anchor_day:'31',active:true}]};
  expect(forecastItems(snapshot,'2024-01-01','2024-03-31').map(i=>i.date)).toEqual(['2024-01-31','2024-02-29','2024-03-31']);
});

test('emergency coverage uses explicit essential categories and marked reserve, without assuming future earnings',()=>{
  const snapshot:Snapshot={user:{id:'u',email:''},categories:[{id:'basic',name:'Essenciais',spending_kind:'essential'},{id:'food',parent_id:'basic',name:'Alimentação',spending_kind:'unclassified'},{id:'leisure',name:'Lazer',spending_kind:'optional'}],account_balances:[{id:'reserve-account',kind:'savings',balance:'1000'}],savings_goals:[{id:'reserve',account_id:'reserve-account',name:'Reserva',is_emergency_reserve:true,target:'2000',target_date:'2026-12-31'}],transactions:['2026-07','2026-08','2026-09'].flatMap(month=>[{id:`food:${month}`,type:'expense',category_id:'food',amount:'-100',date:`${month}-10`,status:'confirmed'},{id:`fun:${month}`,type:'expense',category_id:'leisure',amount:'-50',date:`${month}-11`,status:'confirmed'}]),user_settings:[{emergency_months_target:'6'}]};
  const plan=financialPlan(snapshot,'2026-10-08');
  expect(plan.essentials).toMatchObject({monthly:'100.00',reserve:'1000.00',months:'10.0',target:'600.00',gap:'0.00',sampleMonths:3,missingCategories:0});
  expect(plan.goals[0]).toMatchObject({current:'1000.00',remaining:'1000.00',monthsRemaining:3,monthlyContribution:'333.34'});
});

test('older card purchases with essential installments establish monthly samples even without new purchases or cash transactions',()=>{
  const snapshot:Snapshot={user:{id:'u',email:''},categories:[{id:'ess',name:'Essencial',spending_kind:'essential'}],credit_cards:[{id:'c',closing_day:'5',due_day:'10'}],credit_card_purchases:[{id:'p',card_id:'c',date:'2026-06-01',amount:'300',category_id:'ess'}],credit_card_invoices:['2026-07','2026-08','2026-09'].map(month=>({id:month,card_id:'c',due_date:`${month}-10`})),credit_card_installments:['2026-07','2026-08','2026-09'].map(month=>({id:`part:${month}`,purchase_id:'p',invoice_id:month,amount:'100'}))};
  expect(financialPlan(snapshot,'2026-10-08').essentials).toMatchObject({monthly:'100.00',sampleMonths:3});
});

test('category names and unmarked savings do not silently imply essential spending or emergency reserve',()=>{
  const snapshot:Snapshot={user:{id:'u',email:''},categories:[{id:'food',name:'Alimentação'}],transactions:[{id:'t',date:'2026-09-10',type:'expense',category_id:'food',amount:'-100',status:'confirmed'}],account_balances:[{id:'s',kind:'savings',balance:'5000'}],savings_goals:[{id:'g',account_id:'s',name:'Reserva de emergência',target:'10000'}]};
  expect(financialPlan(snapshot,'2026-10-08').essentials).toMatchObject({monthly:null,reserve:null,months:null,missingCategories:1});
});

test('paid/cancelled obligations, recorded cash and estimated returns are excluded from projected receipts',()=>{
  const snapshot:Snapshot={user:{id:'u',email:''},account_balances:[{kind:'bank',balance:'1000'}],transactions:[{id:'received',description:'Receita',type:'income',date:'2026-10-08',amount:'500',status:'confirmed'},{id:'cancelled',type:'expense',date:'2026-10-10',amount:'-100',status:'cancelled'}],financial_obligations:[{id:'paid',name:'Conta',amount:'100',due_date:'2026-10-09',status:'paid'},{id:'cancelled',name:'Conta',amount:'100',due_date:'2026-10-10',status:'cancelled'}]};
  expect(financialPlan(snapshot,'2026-10-08').forecast[0]).toMatchObject({income:'0.00',expenses:'0.00',balance:'1000.00'});
});

test('a provider failure followed by success is resolved and upcoming bills receive a contextual reminder',()=>{
  const snapshot=base();
  snapshot.provider_sync_logs=[{provider:'bcb',started_at:'2026-10-08T10:00:00Z',status:'error'},{provider:'bcb',started_at:'2026-10-08T11:00:00Z',status:'success'}];
  const plan=financialPlan(snapshot,'2026-10-08');
  expect(plan.confidence.checks.some(c=>c.id==='providers')).toBe(false);
  expect(plan.alerts.find(a=>a.id==='upcoming-invoices')).toMatchObject({date:'2026-10-10',amount:'100.00',href:'/cartoes'});
});

test('unscheduled debt remains a wealth liability and produces an explicit planning limitation rather than a fictional cash payment',()=>{
  const snapshot:Snapshot={user:{id:'u',email:''},account_balances:[{kind:'bank',balance:'1000'}],financial_liabilities:[{id:'loan',amount:'8000',name:'Empréstimo',due_date:'2027-01-01'}]};
  const plan=financialPlan(snapshot,'2026-10-08');
  expect(plan.forecast[0]).toMatchObject({expenses:'0.00',balance:'1000.00'});
  expect(plan.alerts.find(a=>a.id==='unscheduled-debt')).toMatchObject({severity:'warning'});
});
