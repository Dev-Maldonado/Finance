import {describe,expect,it} from 'vitest';
import {financialFeedbackForSave as feedback} from '../src/lib/financial-feedback';
import {forms} from '../src/components/forms';
import type {Snapshot,Row} from '../src/lib/summary';
const today='2026-10-31';
const base:Snapshot={user:{id:'u',email:'u@example.test'}};
const transaction={type:'income',status:'confirmed',date:today,amount:'150'};
const savings:Snapshot={...base,savings_goals:[{id:'g',account_id:'s',target:'1000'}],financial_accounts:[{id:'s',initial_balance:'800'}]};
const investments:Snapshot={...base,investment_assets:[{id:'a',currency:'BRL',manual_kind:'fund'}],manual_investment_purchases:[{id:'p',asset_id:'a',quantity:'10',amount:'1000',date:'2026-08-01'}],manual_investment_updates:[{id:'v',asset_id:'a',price:'110',date:'2026-09-30'}]};
const priceForm={title:'Preço',endpoint:'/api/manual-investments/price?asset_id=a',fields:[]};
describe('feedback follows confirmed user actions without changing financial records',()=>{
 it.each(['income','expense','yield','adjustment'])('classifies settled %s only after save',type=>{
  expect(feedback(forms.transaction,{...transaction,type},undefined,base,today).kind).toBe(type==='expense'?'expense':'income');
 });
 it.each([{status:'pending'},{date:'2026-11-01'},{status:'cancelled'}])('does not simulate money received for %j',change=>{
  expect(feedback(forms.transaction,{...transaction,...change},undefined,base,today).kind).toBe('success');
 });
 it('uses settlement date while preserving original future competence',()=>{
  expect(feedback(forms.transaction,{...transaction,date:'2026-11-15',settled_on:today},undefined,base,today).kind).toBe('income');
 });
 it('distinguishes correcting a settled record from receiving a pending record',()=>{
  expect(feedback(forms.transaction,transaction,{...transaction,id:'t'},base,today).kind).toBe('success');
  expect(feedback(forms.transaction,transaction,{...transaction,id:'t',status:'pending'},base,today).kind).toBe('income');
 });
 it('recurrences and scheduled transfers never imply current cash movement',()=>{
  expect(feedback(forms.transaction,transaction,undefined,base,today,true).kind).toBe('success');
  expect(feedback(forms.transfer,{date:'2026-11-01'},undefined,base,today).kind).toBe('success');
  expect(feedback(forms.transfer,{date:today},undefined,base,today).kind).toBe('transfer');
 });
 it('card purchases explain the invoice without suggesting bank debit',()=>{
  expect(feedback(forms.purchase,{date:today},undefined,base,today)).toMatchObject({kind:'expense',description:expect.stringContaining('sem débito imediato')});
 });
 it('deposits and withdrawals move resources; only a newly crossed goal celebrates',()=>{
  expect(feedback(forms.deposit,{goal_id:'g',amount:'100',date:today},undefined,savings,today).kind).toBe('transfer');
  expect(feedback(forms.withdrawal,{goal_id:'g',amount:'100',date:today},undefined,savings,today).kind).toBe('transfer');
  expect(feedback(forms.deposit,{goal_id:'g',amount:'200',date:today},undefined,savings,today).kind).toBe('goal');
  const reached={...savings,financial_accounts:[{id:'s',initial_balance:'1000'}]};
  expect(feedback(forms.deposit,{goal_id:'g',amount:'200',date:today},undefined,reached,today).kind).toBe('transfer');
 });
 it('monthly savings valuations distinguish growth, loss and a same-month correction',()=>{
  expect(feedback(forms.savingsBalance,{goal_id:'g',balance:'850',date:today},undefined,savings,today).kind).toBe('growth');
  expect(feedback(forms.savingsBalance,{goal_id:'g',balance:'750',date:today},undefined,savings,today).kind).toBe('success');
  const updated={...savings,manual_savings_updates:[{id:'u1',goal_id:'g',balance:'810',date:'2026-10-01'}]};
  expect(feedback(forms.savingsBalance,{goal_id:'g',balance:'850',date:today},undefined,updated,today).kind).toBe('success');
 });
 it('investment growth needs an actual higher new monthly price and units',()=>{
  expect(feedback(priceForm,{date:today,price:'120'},undefined,investments,today).kind).toBe('growth');
  expect(feedback(priceForm,{date:today,price:'100'},undefined,investments,today).kind).toBe('success');
  expect(feedback(priceForm,{date:today,price:'120'},{id:'v'},investments,today).kind).toBe('success');
  expect(feedback(priceForm,{date:today,price:'120'},undefined,{...investments,manual_investment_purchases:[]},today).kind).toBe('success');
  expect(feedback({...priceForm,endpoint:'/api/manual-investments/purchase?asset_id=a'},{date:today,amount:'200'},undefined,investments,today).kind).toBe('success');
 });
 it('classification is read-only and malformed presentation data cannot fail a saved operation',()=>{
  const before=JSON.stringify(savings);
  expect(feedback(forms.deposit,{goal_id:'g',amount:'not-a-number',date:today},undefined,savings,today).kind).toBe('success');
  expect(JSON.stringify(savings)).toBe(before);
 });
});
