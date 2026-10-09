import { expect, test } from 'vitest';
import { financialSummary, type Snapshot } from '../src/lib/summary';
import { portfolioPerformance } from '../src/financial/portfolio-performance';
import { savingsMetrics } from '../src/lib/savings-metrics';
import { financialPlan } from '../src/lib/financial-plan';
import { savingsHistory } from '../src/financial/savings-history';
import type { Lot, Movement, Rate } from '../src/financial/engine';
import { hasUnallocatedYieldWithdrawal } from '../src/financial/savings-estimate';

test('external market values cannot replace the manually entered value in wealth totals', () => {
  const snapshot: Snapshot = {
    user: { id: 'u', email: '' },
    investment_assets: [{ id: 'a', ticker: 'ABC', currency: 'BRL', asset_class: 'stock' }],
    manual_investment_purchases: [{ id: 'opening', asset_id: 'a', date: '2026-10-01', quantity: '10', amount: '1000' }],
    manual_investment_updates: [
      { asset_id: 'a', date: '2026-10-01', price: '100', currency: 'BRL', validated: true },
    ],
    asset_price_history: [
      { ticker: 'ABC', date: '2026-10-02', price: '100000', currency: 'BRL', validated: false },
    ],
  };
  expect(financialSummary(snapshot, '2026-10-01', '2026-10-08', '2026-10-08').investments).toBe('1000.00');
});

test('CDI comparisons refuse a truncated snapshot that starts after the selected interval', () => {
  const snapshot: Snapshot = {
    user: { id: 'u', email: '' },
    investment_assets: [{ id: 'a', ticker: 'ABC', currency: 'BRL', asset_class: 'stock' }],
    manual_investment_purchases: [{ id: 'opening', asset_id: 'a', date: '2024-01-01', quantity: '10', amount: '1000' }],
    manual_investment_updates: [
      { asset_id: 'a', date: '2024-12-31', price: '100', currency: 'BRL' },
      { asset_id: 'a', date: '2026-10-08', price: '110', currency: 'BRL' },
    ],
    benchmark_rates: [{ series: '12', date: '2026-10-07', value: '0.05', validated: true }],
    provider_sync_states: [{ provider: 'bcb-cdi-history', last_date: '2024-01-01' }],
    snapshot_metadata: [{ benchmark_start: '2025-10-08' }],
  };
  expect(portfolioPerformance(snapshot, '2025-01-01', '2026-10-08')).toMatchObject({ cdi: null, benchmarkComplete: false, relative: null });
});

test('legacy indexer contracts do not generate returns after switching to manual control', () => {
  const snapshot: Snapshot = {
    user: { id: 'u', email: '' },
    savings_goals: [{ id: 'g', name: 'Selic', target: '2000' }],
    savings_lots: [{ id: 'lot', goal_id: 'g', principal: '1000', remaining: '1000', start_date: '2026-10-01', indexer: 'selic', percentage: '100', product: 'rdb', tax_exempt: false }],
    benchmark_rates: [{ series: '11', date: '2026-10-07', value: '0.05', validated: true }],
    provider_sync_states: [{ provider: 'bcb-selic-history', last_date: '2026-10-01' }],
  };
  expect(savingsMetrics(snapshot, '2026-10-08').details[0]).toMatchObject({ complete: false, daily: '0.00', asOf: null });
  expect(financialPlan(snapshot, '2026-10-08').confidence.checks.find(check => check.id === 'savings')).toMatchObject({ status: 'attention' });
});

test('legacy confirmed withdrawals preserve cash without needing compound estimates', () => {
  const snapshot: Snapshot = {
    user: { id: 'u', email: '' },
    savings_goals: [{ id: 'g', name: 'Reserva', account_id: 's', target: '2000' }],
    account_balances: [{ id: 's', kind: 'savings', balance: '1003' }],
    savings_lots: [{ id: 'lot', goal_id: 'g', principal: '1000', remaining: '1000', start_date: '2026-10-01', indexer: 'cdi', percentage: '100', product: 'rdb', tax_exempt: false }],
    savings_movements: [
      { goal_id: 'g', type: 'confirmed_yield', amount: '5', date: '2026-10-01' },
      { goal_id: 'g', type: 'withdrawn_yield', amount: '2', date: '2026-10-02' },
    ],
    benchmark_rates: ['2026-10-01','2026-10-02','2026-10-07'].map(date => ({ series: '12', date, value: '0.05', validated: true })),
    provider_sync_states: [{ provider: 'bcb-cdi-history', last_date: '2026-10-01' }],
  };
  const summary = financialSummary(snapshot, '2026-10-01', '2026-10-08', '2026-10-08');
  expect(summary.goals[0]).toMatchObject({ estimateComplete: true, confirmed: '3.00', registeredBalance: '1003.00' });
  expect(summary.assets).toBe('1003.00');
  expect(savingsMetrics(snapshot, '2026-10-08').details[0]).toMatchObject({ complete: true, unallocatedYieldWithdrawal: false });
  expect(financialPlan(snapshot, '2026-10-08').confidence.checks.find(check => check.id === 'savings')).toMatchObject({ status: 'attention' });
  expect(summary.goals[0].manual.profit).toBe('5.00');
  const history = savingsHistory(snapshot.savings_lots as unknown as Lot[], snapshot.benchmark_rates as unknown as Rate[], snapshot.savings_movements as unknown as Movement[], '2026-10-08');
  expect(history[0].estimateComplete).toBeUndefined();
  expect(history.filter(point => point.date >= '2026-10-02').every(point => point.estimateComplete === false)).toBe(true);
});

test('cancelled or future interest withdrawals do not invalidate the current estimate', () => {
  expect(hasUnallocatedYieldWithdrawal([
    { type: 'withdrawn_yield', amount: '10', date: '2026-10-01', status: 'cancelled' },
    { type: 'withdrawn_yield', amount: '10', date: '2026-10-10' },
  ], '2026-10-08')).toBe(false);
});
