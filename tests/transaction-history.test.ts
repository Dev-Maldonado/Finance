import { expect, test } from 'vitest';
import { transactionHistory, filterTransactionHistory } from '../src/lib/transaction-history';
import { purchaseMetrics } from '../src/lib/purchase-filters';
import type { Row, Snapshot } from '../src/lib/summary';
const s: Snapshot = { user: { id: 'u', email: '' }, categories: [{id:'root'}, {id:'child',parent_id:'root'}], financial_accounts: [{id:'bank'}], credit_cards: [{id:'card',name:'Nubank'}], credit_card_purchases: [{id:'purchase',card_id:'card',description:'Notebook',date:'2026-08-01',amount:'300.01',installments:'3',category_id:'child'}], credit_card_invoices: [{id:'oct',card_id:'card',due_date:'2026-10-10'},{id:'nov',card_id:'card',due_date:'2026-11-10'}], credit_card_installments: [{id:'a',purchase_id:'purchase',invoice_id:'oct',number:'2',amount:'100.00'},{id:'b',purchase_id:'purchase',invoice_id:'nov',number:'3',amount:'100.01'}], transactions: [{id:'income',account_id:'bank',date:'2026-10-11',amount:'1000',description:'Salário',type:'income',status:'confirmed'},{id:'payment',account_id:'bank',date:'2026-10-09',amount:'-100',type:'invoice_payment',status:'confirmed'}] };
const filters = {start:'2026-10-01',end:'2026-10-31',search:'',account:'',category:'',type:'',status:'',excluded:false};
test('unified history sorts descending, links real installment and preserves exact cents without total purchase entries', () => {
 const list=transactionHistory(s,'2026-10-11');
 expect(list.map(r=>r.id)).toEqual(['installment:b','income','installment:a','payment']);
 const month=filterTransactionHistory(s,list,filters);
 expect(month.map(r=>r.id)).toEqual(['income','installment:a','payment']);
 expect(month.find(r=>r.origin==='card')).toMatchObject({number:'2',installment_count:'3',amount:'-100.00',purchase_total:'300.01',card_name:'Nubank',date:'2026-10-10'});
 expect(purchaseMetrics(s,s.credit_card_purchases as Row[],'2026-10').monthly).toBe('100.00');
 expect(new Set(list.map(r=>r.id)).size).toBe(list.length);
});
test('period, origin UUID, parent category, type, status and search intersect; cash account excludes card expense',()=>{
 const list=transactionHistory(s,'2026-10-11');
 expect(filterTransactionHistory(s,list,{...filters,account:'card:card',category:'root',type:'expense',status:'pending',search:' nubank '}).map(r=>r.id)).toEqual(['installment:a']);
 expect(filterTransactionHistory(s,list,{...filters,account:'bank'}).map(r=>r.id)).toEqual(['income','payment']);
 expect(filterTransactionHistory(s,list,{...filters,account:'card:other'})).toHaveLength(0);
});
test('deleted purchases hide installments by default and future-dated purchases are not realized',()=>{
 const deleted={...s,credit_card_purchases:[{...(s.credit_card_purchases as Row[])[0],status:'cancelled'}]};
 expect(filterTransactionHistory(deleted,transactionHistory(deleted,'2026-10-11'),filters)).toHaveLength(2);
 expect(filterTransactionHistory(deleted,transactionHistory(deleted,'2026-10-11'),{...filters,status:'cancelled'})).toHaveLength(1);
 expect(transactionHistory(s,'2026-07-31')).toHaveLength(2);
});
