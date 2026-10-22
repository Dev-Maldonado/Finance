import { expect, test } from 'vitest';
import { budgetMetrics, comparisonRange, dashboardModel, periodMetrics } from '../src/lib/dashboard';
import { financialSummary, rows, type Snapshot } from '../src/lib/summary';
import { exportReportRows } from '../src/components/exports';
import { forecastItems } from '../src/lib/financial-plan';

const sample = (): Snapshot => ({
  user: { id: 'u', email: '' },
  financial_accounts: [{ id: 'cash', name: 'Conta', kind: 'bank' }],
  account_balances: [{ id: 'cash', balance: '1000', kind: 'bank' }],
  categories: [{ id: 'parent', name: 'Moradia' }, { id: 'child', name: 'Internet', parent_id: 'parent' }],
  transactions: [
    { id: 'i-pending', type: 'income', amount: '150.25', status: 'pending', date: '2026-11-01', account_id: 'cash' },
    { id: 'i-confirmed', type: 'income', amount: '249.75', status: 'confirmed', date: '2026-11-15', account_id: 'cash' },
    { id: 'e-pending', type: 'expense', amount: '-59.90', status: 'pending', date: '2026-11-10', account_id: 'cash', category_id: 'child' },
    { id: 'e-confirmed', type: 'expense', amount: '-40.10', status: 'confirmed', date: '2026-11-30', account_id: 'cash', category_id: 'parent' },
    ...['income', 'expense'].flatMap(type => [
      { id: `cancelled-${type}`, type, amount: type === 'income' ? '900' : '-900', status: 'cancelled', date: '2026-11-01' },
      { id: `previous-${type}`, type, amount: type === 'income' ? '700' : '-700', status: 'confirmed', date: '2026-10-31' },
      { id: `next-${type}`, type, amount: type === 'income' ? '800' : '-800', status: 'pending', date: '2026-12-01' },
    ]),
    { id: 'internal', type: 'transfer', amount: '5000', status: 'pending', date: '2026-11-05' },
    { id: 'yield', type: 'yield', amount: '900', status: 'confirmed', date: '2026-11-05' },
    { id: 'invoice', type: 'invoice_payment', amount: '-500', status: 'confirmed', date: '2026-11-05' },
  ],
});

test('pending and confirmed future income/expenses belong only to their registered month across every period summary', () => {
  const s = sample(), today = '2026-10-22';
  const model = dashboardModel(s, '2026-11-01', '2026-11-30', 'calendar', today);
  expect(model.current).toMatchObject({ income: '400.00', expenses: '100.00', net: '300.00', expectedIncome: '400.00', expectedExpense: '100.00', receivedIncome: '0.00', paidExpense: '0.00', yields: '0.00', invoicePayments: '0.00', cashNet: '0.00', hasExpected: true });
  expect(model.categories).toEqual([{ id: 'parent', name: 'Moradia', value: '100.00', percent: '100.0' }]);
  expect(model.history.at(-1)?.net).toBe('300.00');
  expect(model.dailyAverage).toBe('3.33');
  expect(financialSummary(s, '2026-11-01', '2026-11-30', today)).toMatchObject({ income: '400.00', expense: '100.00', cash: '1000.00', assets: '1000.00', netWorth: '1000.00' });
  expect(budgetMetrics(s, { month: '2026-11-01', category_id: 'parent', amount: '200' }, today)).toMatchObject({ spent: '100.00', remaining: '100.00' });
  expect(exportReportRows(s, '2026-11-01', '2026-11-30', true, today).map(r => r.source_id)).toEqual(['export:i-pending', 'export:e-pending', 'export:i-confirmed', 'export:e-confirmed']);
  expect(forecastItems(s, today, '2026-11-30').filter(i => i.id.startsWith('transaction:i-') || i.id.startsWith('transaction:e-'))).toHaveLength(4);
  expect(periodMetrics(s, '2026-11-10', '2026-11-15', false, today)).toMatchObject({ income: '249.75', expenses: '59.90', net: '189.85' });
  expect(periodMetrics(s, '2026-12-01', '2026-12-31', false, today)).toMatchObject({ income: '800.00', expenses: '800.00' });
});

test('confirming, editing, cancelling and reaching the date never count a transaction twice', () => {
  const s = sample(), metrics = (today = '2026-10-22') => periodMetrics(s, '2026-11-01', '2026-11-30', true, today);
  const income = rows(s, 'transactions').find(t => t.id === 'i-pending')!;
  const expense = rows(s, 'transactions').find(t => t.id === 'e-pending')!;
  income.status = expense.status = 'confirmed';
  expect(metrics()).toMatchObject({ income: '400.00', expenses: '100.00', cashNet: '0.00' });
  expect(metrics('2026-11-10')).toMatchObject({ income: '400.00', expenses: '100.00', receivedIncome: '150.25', paidExpense: '59.90' });
  income.amount = '160.25';
  expect(metrics().income).toBe('410.00');
  expense.status = 'cancelled';
  expect(metrics().expenses).toBe('40.10');
  income.date = '2026-12-01';
  expect(metrics().income).toBe('249.75');
  const pending = rows(s, 'transactions').find(t => t.id === 'i-confirmed')!;
  pending.status = 'pending';
  expect(metrics('2026-11-30').receivedIncome).toBe('0.00');
  expect(metrics('2026-11-30').income).toBe('249.75');
});

test('full current-month comparisons use full prior months even after February', () => {
  expect(comparisonRange('2026-02-01', '2026-02-28', 'month')).toEqual({ start: '2026-01-01', end: '2026-01-31' });
  expect(comparisonRange('2024-02-01', '2024-02-29', 'month')).toEqual({ start: '2024-01-01', end: '2024-01-31' });
});
