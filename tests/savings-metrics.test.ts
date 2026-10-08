import { expect, test } from 'vitest';
import { savingsMetrics } from '../src/lib/savings-metrics';
import { financialSummary, type Snapshot } from '../src/lib/summary';
const sample = (): Snapshot => ({ user: { id: 'u', email: '' },
  savings_goals: [{ id: 'g', name: 'Reserva', target: '20000' }],
  savings_lots: [{ id: 'a', goal_id: 'g', principal: '5000', remaining: '2500', start_date: '2026-10-01', percentage: '100', indexer: 'cdi', product: 'cdb', tax_exempt: false }, { id: 'b', goal_id: 'g', principal: '1000', remaining: '1000', start_date: '2026-10-05', percentage: '120', indexer: 'cdi', product: 'cdb', tax_exempt: false }, { id: 'future', goal_id: 'g', principal: '9000', remaining: '9000', start_date: '2026-11-01', percentage: '100', indexer: 'cdi', product: 'cdb', tax_exempt: false }],
  savings_movements: [{ id: 'm', lot_id: 'a', date: '2026-10-05', type: 'withdrawal', amount: '2500', goal_id: 'g' }],
  benchmark_rates: ['2026-10-01', '2026-10-02', '2026-10-05'].map(date => ({ id: date, series: '12', date, value: '0.05', validated: true })),
});
test('daily and monthly earnings respect each contract, new deposits, withdrawal and unpublished days', () => {
  const weekday = savingsMetrics(sample(), '2026-10-05');
  expect(weekday).toMatchObject({ daily: '1.85', monthly: '6.85' });
  expect(weekday.details[0]).toMatchObject({ complete: true, cumulative: '6.85', asOf: '2026-10-05' });
  expect(savingsMetrics(sample(), '2026-10-06')).toEqual(weekday);
  expect(financialSummary(sample(), '2026-10-01', '2026-10-06', '2026-10-06').goals[0]).toMatchObject({ principal: '3500.00', gross: '4.35' });
});
test('missing and invalid rates never become fabricated daily yield', () => {
  const snapshot = sample(); snapshot.benchmark_rates = [{ id: 'invalid', series: '12', date: '2026-10-05', value: '0.05', validated: false }];
  expect(savingsMetrics(snapshot, '2026-10-06')).toMatchObject({ daily: '0.00', monthly: '0.00' });
  expect(savingsMetrics(snapshot, '2026-10-06').details[0].complete).toBe(false);
  expect(financialSummary(snapshot, '2026-10-01', '2026-10-06', '2026-10-06').goals[0].gross).toBe('0.00');
});
test('historical coverage of non-publishing days is recorded independently of the first business-day rate', () => {
  const snapshot = sample(); snapshot.savings_lots = [{ id: 'a', goal_id: 'g', principal: '1000', remaining: '1000', start_date: '2026-10-03', percentage: '100', indexer: 'cdi', product: 'cdb', tax_exempt: false }];
  snapshot.benchmark_rates = [{ id: 'r', series: '12', date: '2026-10-05', value: '0.05', validated: true }];
  snapshot.savings_movements = [];
  snapshot.provider_sync_states = [{ provider: 'bcb-cdi-history', last_date: '2026-10-03' }];
  expect(savingsMetrics(snapshot, '2026-10-06').details[0]).toMatchObject({ complete: true, daily: '0.50', monthly: '0.50' });
});
