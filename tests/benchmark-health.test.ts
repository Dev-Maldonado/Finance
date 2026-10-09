import { expect, test } from 'vitest';
import { benchmarkHealth } from '../src/components/cdi-status';
import type { Snapshot } from '../src/lib/summary';
const sample = (): Snapshot => ({ user: { id: 'user', email: '' }, benchmark_rates: [
  { id: 'cdi', series: '12', date: '2026-10-07', value: '0.05', validated: true },
  { id: 'selic', series: '11', date: '2026-10-07', value: '0.05', validated: true },
  { id: 'unvalidated', series: '12', date: '2026-10-08', value: '20', validated: false },
], provider_sync_states: [{ provider: 'bcb-cdi', last_success: '2026-10-08T09:00:00Z' }, { provider: 'bcb-selic', last_success: '2026-10-08T12:00:00Z' }], provider_sync_logs: [
  { id: 'cdi-error', provider: 'bcb-cdi', started_at: '2026-10-08T10:00:00Z', status: 'error' },
  { id: 'selic-success', provider: 'bcb-selic', started_at: '2026-10-08T12:00:01Z', status: 'success' },
] });
test('persistent CDI failure is visible independently from healthy Selic and preserves the last validated reference', () => {
  expect(benchmarkHealth(sample(), '12', '2026-10-08')).toMatchObject({ failed: true, stale: false, latest: { date: '2026-10-07' } });
  expect(benchmarkHealth(sample(), '11', '2026-10-08')).toMatchObject({ failed: false, stale: false });
});
test('cached checks preserve previous provider failure until an actual successful consultation', () => {
  const status = { checkedAt: '2026-10-08T13:00:00Z', results: [{ series: '12', status: 'cached' }] };
  expect(benchmarkHealth(sample(), '12', '2026-10-08', status)).toMatchObject({ failed: true, cached: true, lastAttempt: status.checkedAt });
  status.results[0].status = 'success';
  expect(benchmarkHealth(sample(), '12', '2026-10-08', status).failed).toBe(false);
});
test('a newer cron success supersedes an older browser error and defasage does not invent a reference', () => {
  const status = { checkedAt: '2026-10-08T08:00:00Z', results: [{ series: '11', status: 'error' }] };
  expect(benchmarkHealth(sample(), '11', '2026-10-08', status).failed).toBe(false);
  expect(benchmarkHealth(sample(), '11', '2026-10-14').stale).toBe(true);
  const snapshot = sample(); snapshot.benchmark_rates = [];
  expect(benchmarkHealth(snapshot, '11', '2026-10-14')).toMatchObject({ latest: undefined, stale: false });
});
test('an unavailable refresh request does not label a successful BCB provider as failed', () => {
  expect(benchmarkHealth(sample(), '11', '2026-10-08', { error: 'Não foi possível verificar no servidor.' })).toMatchObject({ failed: false, lastSync: '2026-10-08T12:00:00Z' });
});
