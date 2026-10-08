import { afterEach, expect, test, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BenchmarkConfigurationError, syncBenchmarks, updateBenchmarks } from '../src/integrations/benchmark-sync';
import { CDIRateProvider } from '../src/integrations/providers';
type Entry = Record<string, unknown>;
afterEach(() => vi.unstubAllEnvs());
test('missing server credential produces a configuration error before contacting providers', () => {
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '   ');
  expect(() => syncBenchmarks()).toThrow(BenchmarkConfigurationError);
  expect(() => syncBenchmarks()).toThrow('Production da Vercel');
});
function fakeDB(initial: Record<string, Entry[]> = {}) {
  const tables: Record<string, Entry[]> = { benchmark_rates: [], provider_sync_states: [], provider_sync_logs: [], savings_lots: [], ...initial };
  const db = { from(table: string) {
    let filters: ((r: Entry) => boolean)[] = [], sort = '', count = 99999, ascending = true;
    const query = {
      select() { return query; }, eq(key: string, value: unknown) { filters.push(r => r[key] === value); return query; },
      in(key: string, values: unknown[]) { filters.push(r => values.includes(r[key])); return query; },
      order(key: string, options?: { ascending: boolean }) { sort = key; ascending = options?.ascending ?? true; return query; }, limit(n: number) { count = n; return query; },
      async maybeSingle() { const data = tables[table].filter(r => filters.every(f => f(r))).sort((a, b) => String(a[sort]).localeCompare(String(b[sort])) * (ascending ? 1 : -1)).slice(0, count); return { data: data[0] ?? null, error: null }; },
      async upsert(input: Entry | Entry[]) { for (const row of Array.isArray(input) ? input : [input]) { const old = tables[table].find(r => table === 'benchmark_rates' ? r.series === row.series && r.date === row.date : r.provider === row.provider); if (old) Object.assign(old, row); else tables[table].push(row); } return { error: null }; },
      async insert(row: Entry) { tables[table].push(row); return { error: null }; },
    }; return query;
  } } as unknown as SupabaseClient;
  return { db, tables };
}
const now = new Date('2026-10-08T12:00:00Z');
const provider = (fetcher: (series: string, start: string, end: string) => Promise<{ series: string; date: string; value: string; source: string }[]>) => (series: string) => ({ history: (start: string, end: string) => fetcher(series, start, end) }) as CDIRateProvider;
test('automatic update persists official rates once, keeps provenance and caches subsequent checks', async () => {
  const { db, tables } = fakeDB();
  const calls = vi.fn(async (series: string) => [{ series, date: '2026-10-07', value: '0.05', source: `BCB SGS ${series}` }]);
  const factory = provider(calls);
  const first = await updateBenchmarks(db, now, factory);
  expect(first.every(r => r.status === 'success')).toBe(true);
  expect(tables.benchmark_rates).toHaveLength(2);
  expect(tables.benchmark_rates[0]).toMatchObject({ collected_at: now.toISOString(), validated: true });
  await updateBenchmarks(db, new Date(now.getTime() + 3600000), factory);
  expect(calls).toHaveBeenCalledTimes(2);
  expect(tables.benchmark_rates).toHaveLength(2);
  await updateBenchmarks(db, new Date(now.getTime() + 5 * 3600000), factory);
  expect(tables.benchmark_rates).toHaveLength(2);
  expect(calls).toHaveBeenCalledTimes(4);
});
test('provider failure and future data preserve stored valid rates and the last successful reference', async () => {
  const { db, tables } = fakeDB({ benchmark_rates: [{ series: '12', date: '2026-10-06', value: '0.04' }] });
  const factory = provider(async series => { if (series === '12') throw new Error('timeout'); return [{ series, date: '2026-10-09', value: '0.05', source: 'BCB' }]; });
  expect((await updateBenchmarks(db, now, factory)).every(r => r.status === 'error')).toBe(true);
  expect(tables.benchmark_rates).toEqual([{ series: '12', date: '2026-10-06', value: '0.04' }]);
  expect(tables.provider_sync_states).toHaveLength(0);
  expect(tables.provider_sync_logs).toHaveLength(2);
});
test('old deposits backfill a bounded historical window while keeping the latest reference', async () => {
  const { db, tables } = fakeDB({ benchmark_rates: [{ series: '12', date: '2025-10-08', value: '0.05' }], provider_sync_states: [{ provider: 'bcb-cdi', last_success: now.toISOString(), last_date: '2026-10-07' }, { provider: 'bcb-selic', last_success: now.toISOString(), last_date: '2026-10-07' }], savings_lots: [{ indexer: 'cdi', start_date: '2023-01-01' }] });
  const calls = vi.fn(async (series: string, start: string) => [{ series, date: start, value: '0.05', source: 'BCB' }]);
  const results = await updateBenchmarks(db, now, provider(calls));
  expect(calls).toHaveBeenCalledTimes(1);
  expect(calls.mock.calls[0][1]).toBe('2024-10-07');
  expect(results[0]).toMatchObject({ lastDate: '2026-10-07', status: 'success' });
  expect(tables.provider_sync_states.find(r => r.provider === 'bcb-cdi-history')?.last_date).toBe('2024-10-07');
});
test('weekends without publication are cached without substituting the previous rate', async () => {
  const { db, tables } = fakeDB();
  const factory = provider(async () => []);
  await updateBenchmarks(db, now, factory);
  expect(tables.benchmark_rates).toHaveLength(0);
  const results = await updateBenchmarks(db, now, factory);
  expect(results.every(r => r.status === 'cached')).toBe(true);
});
