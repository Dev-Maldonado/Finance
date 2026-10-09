import { expect, test } from 'vitest';
import { D, estimateTax, position } from '../src/financial/engine';
import { portfolioPerformance } from '../src/financial/portfolio-performance';
import { savingsHistory } from '../src/financial/savings-history';
import { financialSummary, type Row, type Snapshot } from '../src/lib/summary';
import { budgetMetrics, periodCategoryTotals, periodMetrics, monthEnd } from '../src/lib/dashboard';
import { cardInvoices } from '../src/lib/card-invoices';

test('twelve monthly expenses reconcile across summary, budgets and categories independently of purchase month', () => {
  const snapshot: Snapshot = { user:{id:'u',email:''}, categories:[{id:'essential',name:'Essenciais'}], credit_cards:[{id:'c',closing_day:'31',due_day:'10'}], credit_card_purchases:[{id:'p',card_id:'c',date:'2025-12-01',amount:'1200',installments:'12',category_id:'essential',status:'confirmed'}], credit_card_invoices:[], credit_card_installments:[] };
  for (let month=1;month<=12;month++) {
    const key=`2026-${String(month).padStart(2,'0')}`;
    (snapshot.credit_card_invoices as Row[]).push({id:key,card_id:'c',due_date:`${key}-10`});
    (snapshot.credit_card_installments as Row[]).push({id:`part-${month}`,invoice_id:key,purchase_id:'p',amount:'100',number:String(month)});
  }
  for (let month=1;month<=12;month++) {
    const key=`2026-${String(month).padStart(2,'0')}`, start=`${key}-01`, end=monthEnd(key);
    expect(periodMetrics(snapshot,start,end,false).expenses).toBe('100.00');
    expect(financialSummary(snapshot,start,end,'2026-12-31').expense).toBe('100.00');
    expect(periodCategoryTotals(snapshot,start,end)).toEqual([{id:'essential',name:'Essenciais',value:'100.00',percent:'100.0'}]);
    expect(budgetMetrics(snapshot,{month:start,amount:'150',category_id:'essential'})).toMatchObject({spent:'100.00',remaining:'50.00'});
  }
});

test('a future invoice payment cannot increase current wealth or mark the invoice paid before cash changes', () => {
  const snapshot: Snapshot={user:{id:'u',email:''},account_balances:[{kind:'bank',balance:'1000'}],credit_cards:[{id:'c',closing_day:'5',due_day:'10'}],credit_card_purchases:[{id:'p',date:'2026-10-01',amount:'300',status:'confirmed'}],credit_card_invoices:[{id:'i',card_id:'c',due_date:'2026-10-10'}],credit_card_installments:[{id:'part',invoice_id:'i',purchase_id:'p',amount:'300'}],credit_card_payments:[{id:'pay',invoice_id:'i',amount:'100',date:'2026-10-10'}]};
  expect(cardInvoices(snapshot,'2026-10-08')[0]).toMatchObject({paid:'0.00',pending:'300.00',status:'Fechada'});
  expect(financialSummary(snapshot,'2026-10-01','2026-10-08','2026-10-08')).toMatchObject({cash:'1000.00',cardLiability:'300.00',netWorth:'700.00'});
});

test('month-end card closing is clamped in February while preserving the contractual day', () => {
  const snapshot: Snapshot={user:{id:'u',email:''},credit_cards:[{id:'c',closing_day:'31',due_day:'10'}],credit_card_invoices:[{id:'i',card_id:'c',due_date:'2024-03-10'}]};
  expect(cardInvoices(snapshot,'2024-02-29')[0].closing).toBe('2024-02-29');
});

test('each fractional purchase and sale uses the same rounded consideration posted to cash', () => {
  const first={id:'a',asset_id:'x',date:'2026-10-01',type:'buy',quantity:'1',price:'10.005',fees:'0'};
  const second={...first,id:'b'};
  expect(position([first,second])).toMatchObject({cost:'20.02',average:'10.01000000'});
  expect(position([first,second,{...first,id:'s',date:'2026-10-02',type:'sell',quantity:'2',price:'10.505'}])).toMatchObject({cost:'0.00',realized:'0.99'});
  expect(position([first,{...second,status:'cancelled'}])).toMatchObject({cost:'10.01',quantity:'1.00000000'});
});

const portfolio = (): Snapshot => ({user:{id:'u',email:''}, investment_assets:[{id:'a',ticker:'ABC',currency:'BRL',asset_class:'stock'}],investment_opening_positions:[{id:'opening',asset_id:'a',date:'2026-09-30',quantity:'10',cost:'1000'}],asset_price_history:[{id:'q0',ticker:'ABC',date:'2026-09-30',price:'100',currency:'BRL'},{id:'q1',ticker:'ABC',date:'2026-10-01',price:'100.05',currency:'BRL'},{id:'q2',ticker:'ABC',date:'2026-10-02',price:'100.100025',currency:'BRL'}],benchmark_rates:[{series:'12',date:'2026-10-01',value:'0.05',validated:true},{series:'12',date:'2026-10-02',value:'0.05',validated:true}]});
test('portfolio and CDI both include the first selected day against its prior close', () => {
  expect(portfolioPerformance(portfolio(),'2026-10-01','2026-10-02')).toMatchObject({personal:'0.100025',cdi:'0.100025',relative:'100.00',complete:true});
  expect(portfolioPerformance(portfolio(),'2026-10-01','2026-10-01')).toMatchObject({personal:'0.050000',cdi:'0.050000',relative:'100.00'});
});
test('invalid benchmark rates suppress incomplete relative performance instead of becoming a reference', () => {
  const snapshot=portfolio();
  snapshot.benchmark_rates=[{series:'12',date:'2026-10-01',value:'0.05',validated:true},{series:'12',date:'2026-10-02',value:'1',validated:false}];
  expect(portfolioPerformance(snapshot,'2026-10-01','2026-10-02')).toMatchObject({cdi:null,relative:null,benchmarkComplete:false});
});
test('a start-date distribution is included and a cancelled purchase does not create holdings or contributions', () => {
  const snapshot=portfolio();
  snapshot.investment_income=[{id:'income',asset_id:'a',date:'2026-10-01',amount:'10',status:'received'}];
  snapshot.investment_operations=[{id:'cancelled',asset_id:'a',type:'buy',date:'2026-10-01',quantity:'100',price:'100',fees:'0',status:'cancelled'}];
  expect(portfolioPerformance(snapshot,'2026-10-01','2026-10-01').personal).toBe('1.050000');
});

test('a savings chart preserves each historical indexer after future contract changes', () => {
  const lots=[{id:'old',principal:'1000',remaining:'1000',start_date:'2026-10-01',percentage:'100',indexer:'cdi',product:'rdb',tax_exempt:false},{id:'new',principal:'1000',remaining:'1000',start_date:'2026-10-02',percentage:'100',indexer:'selic',product:'rdb',tax_exempt:false}];
  const rates=[{series:'12',date:'2026-10-01',value:'0.05'},{series:'12',date:'2026-10-02',value:'0.05'},{series:'11',date:'2026-10-01',value:'0.1'},{series:'11',date:'2026-10-02',value:'0.1'},{series:'12',date:'2026-10-03',value:'5',validated:false}];
  expect(savingsHistory(lots,rates,[],'2026-10-03').at(-1)).toEqual({date:'2026-10-02',principal:'2000.00',yield:'2.00'});
});

test('IOF and IR boundaries conserve every cent of gross gains', () => {
  const expected:Record<number,{iof:string;ir:string;net:string}>={0:{iof:'100.00',ir:'0.00',net:'0.00'},1:{iof:'96.00',ir:'0.90',net:'3.10'},29:{iof:'3.00',ir:'21.83',net:'75.17'},30:{iof:'0.00',ir:'22.50',net:'77.50'},180:{iof:'0.00',ir:'22.50',net:'77.50'},181:{iof:'0.00',ir:'20.00',net:'80.00'},360:{iof:'0.00',ir:'20.00',net:'80.00'},361:{iof:'0.00',ir:'17.50',net:'82.50'},720:{iof:'0.00',ir:'17.50',net:'82.50'},721:{iof:'0.00',ir:'15.00',net:'85.00'}};
  for (const [days,value] of Object.entries(expected)) {
    const result=estimateTax('100',Number(days),'rdb',false);
    expect(result).toMatchObject(value);
    expect(D(result.iof!).plus(result.ir!).plus(result.net!).toFixed(2)).toBe('100.00');
  }
});

test('confirmed savings gains respect reversals, gross withdrawals and date boundaries without taxing them twice', () => {
  const snapshot: Snapshot={user:{id:'u',email:''},savings_goals:[{id:'g'}],savings_movements:[{goal_id:'g',type:'confirmed_yield',amount:'100',date:'2026-10-01'},{goal_id:'g',type:'withdrawn_yield',amount:'40',date:'2026-10-02'},{goal_id:'g',type:'tax',amount:'10',date:'2026-10-02'},{goal_id:'g',type:'yield_reversal',amount:'5',date:'2026-10-03'},{goal_id:'g',type:'confirmed_yield',amount:'1000',date:'2026-11-01'}]};
  expect(financialSummary(snapshot,'2026-10-01','2026-10-08','2026-10-08').goals[0]).toMatchObject({confirmed:'55.00',confirmedTotal:'100.00'});
});
