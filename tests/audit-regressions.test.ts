import { expect, test } from 'vitest';
import { dashboardModel, budgetMetrics } from '../src/lib/dashboard';
import { financialSummary, type Snapshot } from '../src/lib/summary';
import { forecastItems } from '../src/lib/financial-plan';
import { exportReportRows } from '../src/components/exports';
import { savingsPeriodMetrics } from '../src/lib/savings-metrics';
import { savingsHistory } from '../src/financial/savings-history';
import type { Lot } from '../src/financial/engine';
test('future confirmed entries stay in forecast, not receipts, monthly cash spending, budgets or exports', () => {
  const today = '2026-10-08';
  const snapshot: Snapshot = { user: { id: 'u', email: '' }, account_balances: [{ id: 'bank', kind: 'bank', balance: '1090' }], transactions: [
    { id: 'received', description: 'Recebida', date: '2026-10-05', amount: '100', type: 'income', status: 'confirmed' },
    { id: 'spent', description: 'Paga', date: '2026-10-06', amount: '-10', type: 'expense', status: 'confirmed' },
    { id: 'future-income', description: 'Entrada futura', date: '2026-10-20', amount: '1000', type: 'income', status: 'confirmed' },
    { id: 'future-expense', description: 'Saída futura', date: '2026-10-20', amount: '-400', type: 'expense', status: 'confirmed' },
  ], credit_cards: [{ id: 'card', closing_day: '5', due_day: '10' }], credit_card_purchases: [
    { id: 'old', date: '2026-09-20', card_id: 'card', amount: '300', status: 'confirmed' },
    { id: 'future', date: '2026-10-12', card_id: 'card', amount: '90', status: 'confirmed' },
  ], credit_card_invoices: [{ id: 'invoice', card_id: 'card', due_date: '2026-10-10' }], credit_card_installments: [{ id: 'valid', purchase_id: 'old', invoice_id: 'invoice', amount: '100' }, { id: 'not-yet', purchase_id: 'future', invoice_id: 'invoice', amount: '90' }] };
  const model = dashboardModel(snapshot, '2026-10-01', '2026-10-31', 'custom', today);
  const summary = financialSummary(snapshot, '2026-10-01', '2026-10-31', today);
  expect(model.current).toMatchObject({ income: '100.00', cashExpense: '10.00', cardExpense: '100.00', expenses: '110.00', net: '-10.00' });
  expect(summary).toMatchObject({ income: '100.00', cashExpense: '10.00', cardExpense: '100.00', expense: '110.00' });
  expect(budgetMetrics(snapshot, { month: '2026-10-01', amount: '500' }, today).spent).toBe('110.00');
  expect(exportReportRows(snapshot, '2026-10-01', '2026-10-31', true, today).map(row => row.source_id)).toEqual(['export:received', 'export:spent', 'installment:valid']);
  expect(forecastItems(snapshot, today, '2026-10-31').filter(item => item.source === 'transaction').map(item => item.id)).toEqual(['transaction:future-expense', 'transaction:future-income']);
});
test('a recorded savings lot starts its chart even without published rates, without inventing a return', () => {
  const lot = { id: 'lot', goal_id: 'goal', principal: '1000', remaining: '1000', percentage: '100', indexer: 'cdi', annual_rate: '0', start_date: '2026-10-08', yield_start_date: '2026-10-09', product: 'rdb', tax_exempt: false } as Lot;
  expect(savingsHistory([lot], [], [], '2026-10-08')).toEqual([{ date: '2026-10-08', principal: '1000.00', yield: '0.00' }]);
  expect(savingsHistory([lot], [], [], '2026-10-07')).toEqual([]);
});

test('savings yield follows the selected historical/custom period and never projects a future publication', () => {
  const snapshot: Snapshot = { user: { id: 'u', email: '' }, savings_goals: [{ id: 'g' }], savings_lots: [{ id: 'l', goal_id: 'g', principal: '1000', remaining: '1000', indexer: 'cdi', percentage: '100', start_date: '2026-09-01', yield_start_date: '2026-09-02', product: 'rdb', tax_exempt: false }], benchmark_rates: [{ series: '12', date: '2026-09-02', value: '0.1', validated: true }, { series: '12', date: '2026-10-02', value: '0.1', validated: true }, { series: '12', date: '2026-10-20', value: '0.5', validated: true }], provider_sync_states: [{ provider: 'bcb-cdi-history', last_date: '2026-09-01' }] };
  expect(savingsPeriodMetrics(snapshot, '2026-09-01', '2026-09-30', '2026-10-08').value).toBe('1.00');
  expect(savingsPeriodMetrics(snapshot, '2026-10-01', '2026-10-31', '2026-10-08').value).toBe('1.00');
  expect(savingsPeriodMetrics(snapshot, '2026-10-03', '2026-10-08', '2026-10-08').value).toBe('0.00');
  expect(savingsPeriodMetrics(snapshot, '2026-11-01', '2026-11-30', '2026-10-08').value).toBe('0.00');
});
