import { afterEach, expect, test, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BrapiProvider, ManualPriceProvider, ProviderError, ProviderValidationError, boundedBytes, fetchData } from '../src/integrations/providers';
import { updateMarket } from '../src/integrations/sync';
import { syncCVM } from '../src/integrations/cvm-sync';
import { supabasePublicConfig } from '../src/lib/supabase-config';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); });
type Row = Record<string, unknown>;
function fakeDB(assets: Row[] = [], failingTable?: string) {
  const tables: Record<string, Row[]> = { investment_assets: assets, provider_sync_states: [], provider_sync_logs: [], asset_price_history: [], asset_cash_events: [], fund_nav_history: [] };
  const db = { from(table: string) {
    let filters: ((r: Row) => boolean)[] = [];
    const query = {
      select() { return query; }, eq(k: string, v: unknown) { filters.push(r => r[k] === v); return query; },
      async maybeSingle() { return { data: tables[table].filter(r => filters.every(f => f(r)))[0] ?? null, error: null }; },
      async insert(row: Row) { if (table === failingTable) return { error: new Error('database unavailable') }; tables[table].push(row); return { error: null }; },
      async upsert(input: Row | Row[]) {
        if (table === failingTable) return { error: new Error('database unavailable') };
        for (const row of Array.isArray(input) ? input : [input]) {
          const old = tables[table].find(r => table === 'provider_sync_states' ? r.provider === row.provider : r.ticker === row.ticker && r.date === row.date && r.source === row.source);
          if (old) Object.assign(old, row); else tables[table].push(row);
        }
        return { error: null };
      },
      then(resolve: (value: unknown) => void) { return Promise.resolve({ data: tables[table].filter(r => filters.every(f => f(r))), error: null }).then(resolve); },
    };
    return query;
  } } as unknown as SupabaseClient;
  return { db, tables };
}
const now = new Date('2026-10-08T12:00:00Z');
const base = { now, benchmarks: async () => [{ series: '12', status: 'cached' as const, records: 0 }], registry: async () => 0 };
const asset = (ticker: string) => ({ ticker, asset_class: 'stock', currency: 'BRL' });
const market = (quote: (ticker: string) => Promise<unknown>) => ({ getQuote: quote, getHistoricalPrices: async () => [], getDividends: async () => [] }) as unknown as BrapiProvider;
const quote = (ticker: string) => ({ ticker, price: '10.25', currency: 'BRL', date: '2026-10-07', source: 'brapi' });

test('an unavailable ticker does not block the next asset and each operation preserves its own cache', async () => {
  const { db, tables } = fakeDB([asset('BAD3'), asset('petr4')]);
  const getQuote = vi.fn(async (ticker: string) => { if (ticker === 'BAD3') throw new ProviderError('Cotação ausente'); return quote(ticker); });
  const results = await updateMarket(db, { ...base, market: market(getQuote) });
  expect(getQuote.mock.calls.map(c => c[0])).toEqual(['BAD3', 'PETR4']);
  expect(tables.asset_price_history).toMatchObject([{ ticker: 'PETR4', collected_at: now.toISOString() }]);
  expect(results.find(r => r.provider === 'brapi')).toMatchObject({ status: 'partial', failed: ['BAD3/quote'] });
  expect(tables.provider_sync_states.some(r => r.provider === 'brapi:BAD3:stock:quote')).toBe(false);
  expect(tables.provider_sync_states.some(r => r.provider === 'brapi:PETR4:stock:quote')).toBe(true);
});

test('a new asset registered after the daily job is updated without refetching previously completed assets', async () => {
  const { db, tables } = fakeDB([asset('PETR4')]);
  const getQuote = vi.fn(async (ticker: string) => quote(ticker));
  await updateMarket(db, { ...base, market: market(getQuote) });
  tables.investment_assets.push(asset('VALE3'));
  await updateMarket(db, { ...base, market: market(getQuote) });
  expect(getQuote.mock.calls.map(c => c[0])).toEqual(['PETR4', 'VALE3']);
});

test('CVM current-month 404 still processes the previous month, and a newly registered fund bypasses the existing month cache', async () => {
  const { db, tables } = fakeDB([{ ticker: 'FUND', asset_class: 'fund', cnpj: '12345678000100', share_class: '' }]);
  const cvm = vi.fn(async (_db: SupabaseClient, month: string) => { if (month === '202610') throw new ProviderError('Provedor respondeu 404', 404); return 2; });
  const result = await updateMarket(db, { ...base, cvm });
  expect(cvm.mock.calls.map(c => c[1])).toEqual(['202610', '202609']);
  expect(result.find(r => r.provider === 'cvm')).toMatchObject({ status: 'partial', records: 2 });
  expect(tables.provider_sync_logs.some(r => r.status === 'pending')).toBe(true);
  tables.investment_assets.push({ ticker: 'OTHER FUND', asset_class: 'fund', cnpj: '22345678000100', share_class: '' });
  await updateMarket(db, { ...base, cvm });
  expect(cvm.mock.calls.filter(c => c[1] === '202609')).toHaveLength(2);
});

test('mismatched currency is quarantined without persisting the invalid quote or caching its success', async () => {
  const { db, tables } = fakeDB([asset('PETR4')]);
  const result = await updateMarket(db, { ...base, market: market(async ticker => ({ ...quote(ticker), currency: 'USD' })) });
  expect(result.find(r => r.provider === 'brapi')?.status).toBe('partial');
  expect(tables.asset_price_history).toHaveLength(0);
  expect(tables.provider_sync_logs.some(r => r.status === 'quarantined')).toBe(true);
  expect(tables.provider_sync_states.some(r => r.provider === 'brapi:PETR4:stock:quote')).toBe(false);
});

test('failed audit persistence is reported as error and never creates a successful asset cache', async () => {
  const { db, tables } = fakeDB([asset('PETR4')], 'provider_sync_logs');
  const result = await updateMarket(db, { ...base, market: market(async ticker => quote(ticker)) });
  expect(result.find(r => r.provider === 'brapi')?.status).toBe('error');
  expect(tables.provider_sync_states.some(r => String(r.provider).startsWith('brapi:'))).toBe(false);
});

test('brapi rejects responses for another ticker and future dates before publishing them', async () => {
  const fetcher = (symbol: string, date: string) => async () => new Response(JSON.stringify({ results: [{ symbol, data: { regularMarketPrice: 10, currency: 'BRL', regularMarketTime: date } }] }));
  await expect(new BrapiProvider(undefined, fetcher('WRONG3', '2026-10-01')).getQuote('petr4')).rejects.toBeInstanceOf(ProviderValidationError);
  await expect(new BrapiProvider(undefined, fetcher('PETR4', '2099-01-01')).getQuote('PETR4')).rejects.toBeInstanceOf(ProviderValidationError);
  await expect(new BrapiProvider(undefined, fetcher('PETR4', '2026-02-30')).getQuote('PETR4')).rejects.toBeInstanceOf(ProviderValidationError);
});

test('brapi historical identity is checked and valid prices retain their currency', async () => {
  const fetcher = (symbol: string) => async () => new Response(JSON.stringify({ results: [{ symbol, data: { currency: 'BRL', historicalDataPrice: [{ date: Date.parse('2026-10-01') / 1000, close: 12.34 }] } }] }));
  await expect(new BrapiProvider(undefined, fetcher('WRONG3')).getHistoricalPrices('PETR4')).rejects.toBeInstanceOf(ProviderValidationError);
  expect(await new BrapiProvider(undefined, fetcher('PETR4')).getHistoricalPrices('PETR4')).toEqual([{ ticker: 'PETR4', date: '2026-10-01', price: '12.34', currency: 'BRL', source: 'brapi' }]);
});
test('manual prices remain available for custom identifiers and reject future reference dates', () => {
  expect(new ManualPriceProvider().getQuote('CDB Reserva', '12.34', '2026-10-01').ticker).toBe('CDB RESERVA');
  expect(() => new ManualPriceProvider().getQuote('CDB Reserva', '12.34', '2099-10-01')).toThrow('Data do provedor inválida');
});

test('compressed feeds are size-limited while reading, rather than after allocating the whole payload', async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(4)); controller.enqueue(new Uint8Array(4)); }, cancel() { cancelled = true; } });
  await expect(boundedBytes(new Response(stream), 5)).rejects.toThrow('excede limite');
  expect(cancelled).toBe(true);
});

test('CVM does not download archives when no funds are registered', async () => {
  const { db } = fakeDB();
  const fetcher = vi.fn(async () => new Response());
  expect(await syncCVM(db, '202610', fetcher)).toBe(0);
  expect(fetcher).not.toHaveBeenCalled();
});

test('a global abort stops retry backoff and prevents additional network attempts', async () => {
  vi.useFakeTimers();
  const abort = new AbortController();
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 429 }));
  const result = expect(fetchData('https://example.test', { signal: abort.signal }, 3)).rejects.toThrow('deadline');
  await Promise.resolve();
  abort.abort(new Error('deadline'));
  await vi.runAllTimersAsync();
  await result;
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test('preview deployments reject absent configuration and the production project, but accept a separate project', () => {
  vi.stubEnv('NEXT_PUBLIC_FINORA_DEPLOYMENT_ENV', 'preview');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', ''); vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
  expect(supabasePublicConfig()).toBeNull();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://jqxuwhvkcdfxuxfktzmw.supabase.co/'); vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public-key');
  expect(supabasePublicConfig()).toBeNull();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://JQXUWHVKCDFXUXFKTZMW.supabase.co/');
  expect(supabasePublicConfig()).toBeNull();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://dedicated-preview.supabase.co');
  expect(supabasePublicConfig()?.url).toBe('https://dedicated-preview.supabase.co');
});
test('the sync endpoint rejects unauthenticated jobs and returns 503 when an authorized run has partial failures', async () => {
  vi.stubEnv('CRON_SECRET', 'local-test-cron');
  const sync = await import('../src/integrations/sync');
  const run = vi.spyOn(sync, 'syncMarket').mockResolvedValue([{ provider: 'brapi', status: 'partial', records: 1, failed: ['BAD3/quote'] }]);
  const { POST } = await import('../src/app/api/sync/route');
  expect((await POST(new Request('http://localhost/api/sync', { method: 'POST' }))).status).toBe(401);
  expect(run).not.toHaveBeenCalled();
  const response = await POST(new Request('http://localhost/api/sync', { method: 'POST', headers: { Authorization: 'Bearer local-test-cron' } }));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual([{ provider: 'brapi', status: 'partial', records: 1, failed: ['BAD3/quote'] }]);
  run.mockRejectedValueOnce(new Error('private internal detail'));
  const failure = await POST(new Request('http://localhost/api/sync', { method: 'POST', headers: { Authorization: 'Bearer local-test-cron' } }));
  expect(failure.status).toBe(503);
  expect((await failure.json()).error).toBe('Falha interna na sincronização de mercado. Dados anteriores preservados.');
});
