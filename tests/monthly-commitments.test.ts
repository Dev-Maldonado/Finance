import { expect, test } from 'vitest';
import { monthlyCommitments } from '../src/lib/monthly-commitments';
import { recurringOccurrences } from '../src/lib/recurrence';
import { forecastItems } from '../src/lib/financial-plan';
import type { Snapshot, Row } from '../src/lib/summary';
const id = '10000000-0000-4000-8000-000000000001';
const sample = (): Snapshot => ({ user: { id: 'u', email: '' },
  financial_accounts: [{ id: 'a', name: 'Conta', kind: 'bank' }],
  recurring_transactions: [{ id, account_id: 'a', description: 'Internet', amount: '100', type: 'expense', next_date: '2026-10-10', frequency: 'monthly', active: true }],
  transactions: [{ id: 'fixed', type: 'expense', amount: '-120', date: '2026-11-10', status: 'pending', source_id: `recurrence:${id}:2026-11-10`, account_id: 'a' }, { id: 'scheduled', type: 'expense', amount: '-80.01', date: '2026-11-15', status: 'confirmed', account_id: 'a' }, { id: 'paid', type: 'expense', amount: '-30', date: '2026-10-01', status: 'confirmed', account_id: 'a' }, { id: 'cancelled', type: 'expense', amount: '-999', date: '2026-11-20', status: 'cancelled', account_id: 'a' }],
  credit_cards: [{ id: 'card', name: 'Nubank', closing_day: '5', due_day: '10' }],
  credit_card_purchases: [{ id: 'p', card_id: 'card', date: '2026-09-01', amount: '300', installments: '3' }],
  credit_card_invoices: [{ id: 'inv', card_id: 'card', due_date: '2026-11-10' }],
  credit_card_installments: [{ id: 'part', purchase_id: 'p', invoice_id: 'inv', amount: '100', number: '2' }],
});
test('monthly commitments consolidate existing transactions, projections and invoices once by their own month', () => {
  const s = sample(), result = monthlyCommitments(s, '2026-11', '2026-10-26');
  expect(result.totals).toEqual({ cards: '100.00', fixed: '120.00', scheduled: '80.01', total: '300.01' });
  expect(result.items.map(i => i.id)).toEqual(['fixed', 'scheduled']);
  expect(result.items[0]).toMatchObject({ recurrenceId: id, occurrenceDate: '2026-11-10', status: 'Pendente' });
  expect(monthlyCommitments(s, '2026-12', '2026-10-26').totals).toEqual({ cards: '0.00', fixed: '100.00', scheduled: '0.00', total: '100.00' });
  expect(monthlyCommitments(s, '2026-11', '2026-12-01').totals.scheduled).toBe('0.00');
});
test('cancellations and paid occurrences suppress projections while paused/ended series stop at their boundaries', () => {
  const s = sample(); (s.transactions as Row[])[0].status = 'cancelled';
  expect(monthlyCommitments(s, '2026-11', '2026-10-26').totals.fixed).toBe('0.00');
  (s.transactions as Row[])[0].status = 'confirmed';
  expect(monthlyCommitments(s, '2026-11', '2026-12-01').totals.fixed).toBe('0.00');
  (s.recurring_transactions as Row[])[0].active = false;
  expect(monthlyCommitments(s, '2026-12', '2026-10-26').totals.fixed).toBe('0.00');
  (s.recurring_transactions as Row[])[0].active = true; (s.recurring_transactions as Row[])[0].end_date = '2026-11-30';
  expect(monthlyCommitments(s, '2026-12', '2026-10-26').totals.fixed).toBe('0.00');
});
test('partial invoices use only their unpaid balance without assigning payment to arbitrary installments', () => {
  const s = sample(); s.credit_card_payments = [{ id: 'pay', invoice_id: 'inv', amount: '40', date: '2026-10-20' }];
  const result = monthlyCommitments(s, '2026-11', '2026-10-26');
  expect(result.totals.cards).toBe('60.00'); expect(result.invoices[0].installments[0].amount).toBe('100');
  (s.credit_card_payments as Row[])[0].amount = '100'; expect(monthlyCommitments(s, '2026-11', '2026-10-26').invoices).toHaveLength(0);
});
test('linked obligations are counted once and recurrence projections agree with cash planning', () => {
  const s = sample(); s.financial_obligations = [{ id: 'linked', status: 'pending', amount: '80.01', transaction_id: 'scheduled', due_date: '2026-11-15' }, { id: 'other', name: 'Seguro', status: 'pending', amount: '20', due_date: '2026-11-20' }];
  expect(monthlyCommitments(s, '2026-11', '2026-10-26').totals.scheduled).toBe('100.01');
  const december = monthlyCommitments(s, '2026-12', '2026-10-26').items.filter(i => i.kind === 'fixed');
  const projected = forecastItems(s, '2026-10-26', '2026-12-31').filter(i => i.source === 'recurring' && i.date.startsWith('2026-12'));
  expect(december.map(i => [i.date, i.amount])).toEqual(projected.map(i => [i.date, i.amount.slice(1)]));
});
test('recurrence projection jumps to distant months while preserving short-month, leap-year and weekly anchors', () => {
  const r: Row = { id, active: true, next_date: '2026-01-31', frequency: 'monthly', anchor_day: '31' };
  expect(recurringOccurrences([r], [], '2030-02-01', '2030-03-31').map(i => i.date)).toEqual(['2030-02-28', '2030-03-31']);
  expect(recurringOccurrences([{ ...r, frequency: 'annual', next_date: '2024-02-29', anchor_day: '29', anchor_month: '2' }], [], '2028-01-01', '2028-12-31').map(i => i.date)).toEqual(['2028-02-29']);
  expect(recurringOccurrences([{ ...r, frequency: 'weekly', next_date: '2026-10-01' }], [], '2026-11-01', '2026-11-30').map(i => i.date)).toEqual(['2026-11-05', '2026-11-12', '2026-11-19', '2026-11-26']);
});
