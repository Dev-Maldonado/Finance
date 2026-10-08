import { expect, test } from 'vitest';
import { comparisonRange, dashboardModel, periodMetrics, changeMetric } from '../src/lib/dashboard';
import type { Snapshot } from '../src/lib/summary';
const sample = (): Snapshot => ({
  user: { id: 'u', email: '' },
  categories: [{ id: 'food', name: 'Alimentação' }],
  financial_accounts: [{ id: 'cash', name: 'Conta', kind: 'bank' }],
  account_balances: [{ id: 'cash', kind: 'bank', balance: '2000' }, { id: 'reserve', kind: 'savings', balance: '500' }],
  transactions: [
    { id: 'salary', date: '2026-10-05', type: 'income', amount: '1000', status: 'confirmed' },
    { id: 'market', date: '2026-10-06', type: 'expense', amount: '-50', status: 'confirmed', category_id: 'food' },
    { id: 'interest', date: '2026-10-07', type: 'yield', amount: '10', status: 'confirmed' },
    { id: 'payment', date: '2026-10-07', type: 'invoice_payment', amount: '-25', status: 'confirmed' },
    { id: 'own', date: '2026-10-07', type: 'transfer', amount: '-500', status: 'confirmed' },
    { id: 'deposit', date: '2026-10-07', type: 'transfer', amount: '500', status: 'confirmed' },
    { id: 'asset', date: '2026-10-07', type: 'investment', amount: '-200', status: 'confirmed' },
    { id: 'pending', date: '2026-10-09', type: 'expense', amount: '-30', status: 'pending' },
    { id: 'excluded', date: '2026-10-05', type: 'expense', amount: '-999', status: 'cancelled' },
    { id: 'previous', date: '2026-09-05', type: 'income', amount: '500', status: 'confirmed' },
    { id: 'late-previous', date: '2026-09-20', type: 'income', amount: '5000', status: 'confirmed' },
  ],
  credit_cards: [{ id: 'card', name: 'Cartão', account_id: 'cash', closing_day: '5', due_day: '10' }],
  credit_card_purchases: [{ id: 'purchase', date: '2026-10-01', amount: '300.01', installments: '3', status: 'confirmed' }, { id: 'excluded-card', date: '2026-10-01', amount: '1000', status: 'cancelled' }],
  credit_card_invoices: [{ id: 'invoice', card_id: 'card', due_date: '2026-10-10' }, { id: 'future', card_id: 'card', due_date: '2026-11-10' }, { id: 'last', card_id: 'card', due_date: '2026-12-10' }],
  credit_card_installments: [{ id: 'part', purchase_id: 'purchase', invoice_id: 'invoice', amount: '100', number: '1' }, { id: 'part2', purchase_id: 'purchase', invoice_id: 'future', amount: '100', number: '2' }, { id: 'part3', purchase_id: 'purchase', invoice_id: 'last', amount: '100.01', number: '3' }],
  credit_card_payments: [{ id: 'paid', invoice_id: 'invoice', date: '2026-10-07', amount: '25' }],
  budgets: [{ id: 'all', name: 'Limite geral', month: '2026-10-01', amount: '300', category_id: null }],
});
test('result and operational cash use different rules without counting transfers, investments or invoice payments twice', () => {
  expect(periodMetrics(sample(), '2026-10-01', '2026-10-08')).toMatchObject({ income: '1000.00', yields: '10.00', cashExpense: '50.00', cardExpense: '100.00', purchaseTotal: '300.01', expenses: '150.00', net: '860.00', cashNet: '935.00', invoicePayments: '25.00' });
});
test('dashboard distinguishes full purchases, monthly installments, outstanding bills and liquidity', () => {
  const model = dashboardModel(sample(), '2026-10-01', '2026-10-08', 'month', '2026-10-08');
  expect(model.invoiceTotals).toMatchObject({ total: '100.00', paid: '25.00', pending: '75.00' });
  expect(model.afterCommitments).toBe('1895.00');
  expect(model.upcoming[0]).toMatchObject({ month: '2026-11', pending: '100.00' });
  expect(model.previous.income).toBe('500.00');
  expect(model.overall).toMatchObject({ expenses: '350.01', purchaseTotal: '300.01', committed: '275.01', future: '200.01' });
  expect(model.current.net).toBe('860.00');
  expect(model.categories).toEqual([{ id: 'uncategorized', name: 'Sem categoria', value: '100.00', percent: '66.7' }, { id: 'food', name: 'Alimentação', value: '50.00', percent: '33.3' }]);
  expect(model.budgets[0]).toMatchObject({ spent: '150.00', remaining: '150.00' });
});
test('comparison matches elapsed month/year, complete previous month and exact custom duration at year and leap boundaries', () => {
  expect(comparisonRange('2026-01-01', '2026-01-08', 'month')).toEqual({ start: '2025-12-01', end: '2025-12-08' });
  expect(comparisonRange('2024-03-01', '2024-03-31', 'month')).toEqual({ start: '2024-02-01', end: '2024-02-29' });
  expect(comparisonRange('2026-02-01', '2026-02-28', 'previous')).toEqual({ start: '2026-01-01', end: '2026-01-31' });
  expect(comparisonRange('2024-01-01', '2024-02-29', 'year')).toEqual({ start: '2023-01-01', end: '2023-02-28' });
  expect(comparisonRange('2026-10-02', '2026-10-08', '7')).toEqual({ start: '2026-09-25', end: '2026-10-01' });
});
test('no percentage is invented when the previous result has no base', () => {
  expect(changeMetric('300', '0')).toEqual({ difference: '300.00', percent: null });
  expect(changeMetric('100', '-100')).toEqual({ difference: '200.00', percent: '200.0' });
  const empty = dashboardModel({ user: { id: 'u', email: '' } }, '2026-10-01', '2026-10-08', 'month', '2026-10-08');
  expect(empty.current.net).toBe('0.00');
  expect(empty.current.savingRate).toBeNull();
  expect(empty.invoiceTotals.pending).toBe('0.00');
});

test('each month gets only its installments, including purchases made in an earlier month', () => {
  const snapshot = sample();
  const october = dashboardModel(snapshot, '2026-10-01', '2026-10-08', 'month', '2026-10-08');
  const november = dashboardModel(snapshot, '2026-11-01', '2026-11-30', 'custom', '2026-10-08');
  const december = dashboardModel(snapshot, '2026-12-01', '2026-12-31', 'custom', '2026-10-08');
  expect(october.current.cardExpense).toBe('100.00');
  expect(november.current).toMatchObject({ cardExpense: '100.00', purchaseTotal: '0.00', expenses: '100.00', net: '-100.00' });
  expect(december.current).toMatchObject({ cardExpense: '100.01', expenses: '100.01', net: '-100.01' });
  expect(october.history.at(-1)?.cardExpense).toBe('100.00');
  expect(periodMetrics(snapshot, '2026-10-01', '2026-10-08', false).cardExpense).toBe('0.00');
  expect(periodMetrics(snapshot, '2026-10-09', '2026-10-10', false).cardExpense).toBe('100.00');
});
test('payment and cancellation change commitments without duplicating monthly expenses', () => {
  const snapshot = sample();
  snapshot.credit_card_payments = [{ id: 'paid', invoice_id: 'invoice', date: '2026-10-07', amount: '100' }];
  const paid = dashboardModel(snapshot, '2026-10-01', '2026-10-08', 'month', '2026-10-08');
  expect(paid.current.expenses).toBe('150.00');
  expect(paid.invoiceTotals.pending).toBe('0.00');
  expect(paid.overall.committed).toBe('200.01');
  snapshot.credit_card_purchases = [{ id: 'purchase', date: '2026-10-01', amount: '300.01', status: 'cancelled' }];
  expect(dashboardModel(snapshot, '2026-10-01', '2026-10-08', 'month', '2026-10-08').current.expenses).toBe('50.00');
});
