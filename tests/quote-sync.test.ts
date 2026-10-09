import { expect, test, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { updateQuotes, QUOTE_CACHE_MS } from '../src/integrations/quote-sync';
import { BrapiProvider, YahooQuoteProvider, ProviderError } from '../src/integrations/providers';
type Row = Record<string, unknown>;
const now = new Date('2026-10-09T15:00:00Z');
const asset = (ticker = 'PETR4') => ({ ticker, asset_class: 'stock', currency: 'BRL' });
const quote = (ticker: string) => ({ ticker, price: '15.25', currency: 'BRL', date: '2026-10-09', source: 'brapi' });
function store() {
  const tables: Record<string, Row[]> = { provider_sync_states: [], provider_sync_logs: [], asset_price_history: [] };
  const db = { from(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    const query = {
      select() { return query; }, eq(key: string, value: unknown) { filters.push(r => r[key] === value); return query; },
      order() { return query; }, limit() { return query; },
      async maybeSingle() { return { data: tables[table].filter(r => filters.every(f => f(r))).at(-1) ?? null, error: null }; },
      async insert(row: Row) { tables[table].push(row); return { error: null }; },
      async upsert(row: Row) {
        const existing = tables[table].find(r => table === 'provider_sync_states' ? r.provider === row.provider : r.ticker === row.ticker && r.date === row.date && r.source === row.source);
        if (existing) Object.assign(existing, row); else tables[table].push(row);
        return { error: null };
      },
    }; return query;
  } } as unknown as SupabaseClient;
  return { db, tables };
}
test('quotes refresh intraday after five minutes and replace same-day prices without duplicate positions', async () => {
  const { db, tables } = store(); const getQuote = vi.fn(async (ticker: string) => quote(ticker));
  await updateQuotes(db, [asset(), asset(), { ...asset(), asset_class: 'custom' }], { now, market: { getQuote } });
  await updateQuotes(db, [asset()], { now: new Date(+now + 60000), market: { getQuote } });
  expect(getQuote).toHaveBeenCalledTimes(1);
  getQuote.mockResolvedValueOnce({ ...quote('PETR4'), price: '16.78' });
  const result = await updateQuotes(db, [asset()], { now: new Date(+now + QUOTE_CACHE_MS), market: { getQuote } });
  expect(result.results[0].status).toBe('success'); expect(getQuote).toHaveBeenCalledTimes(2);
  expect(tables.asset_price_history).toHaveLength(1); expect(tables.asset_price_history[0].price).toBe('16.78');
});
test('token failures are explicit, briefly cached and do not block other assets or erase old prices', async () => {
  const { db, tables } = store(); tables.asset_price_history.push({ ...quote('BAD3'), date: '2026-10-08' });
  const getQuote = vi.fn(async (ticker: string) => { if (ticker === 'BAD3') throw new ProviderError('unauthorized', 401); return quote(ticker); });
  const first = await updateQuotes(db, [asset('BAD3'), asset()], { now, market: { getQuote } });
  expect(first.results[0].message).toContain('BRAPI_API_TOKEN'); expect(first.results[1].status).toBe('success');
  await updateQuotes(db, [asset('BAD3')], { now: new Date(+now + 60000), market: { getQuote } });
  expect(getQuote).toHaveBeenCalledTimes(2); expect(tables.asset_price_history).toHaveLength(2);
  expect(tables.provider_sync_states).toHaveLength(1);
});
test('wrong identity, currency, future dates and non-finite prices are never persisted', async () => {
  for (const invalid of [{ ticker: 'VALE3' }, { currency: 'USD' }, { date: '2099-01-01' }, { price: 'NaN' }, { price: '-2' }]) {
    const { db, tables } = store();
    const result = await updateQuotes(db, [asset()], { now, market: { getQuote: async () => ({ ...quote('PETR4'), ...invalid }) } });
    expect(result.results[0].status).toBe('error'); expect(tables.asset_price_history).toHaveLength(0); expect(tables.provider_sync_states).toHaveLength(0);
  }
});
test('hung providers are bounded by a global deadline', async () => {
  const { db, tables } = store(); const started = Date.now();
  const result = await updateQuotes(db, [asset()], { now, timeoutMs: 20, market: { getQuote: () => new Promise(() => {}) } });
  expect(Date.now() - started).toBeLessThan(1000); expect(result.results[0].status).toBe('error'); expect(tables.asset_price_history).toHaveLength(0);
});
test('FII pricing uses the market quote endpoint and its trading date, not monthly indicators', async () => {
  const fetcher = vi.fn(async (_url: string) => new Response(JSON.stringify({ results: [{ symbol: 'MXRF11', regularMarketPrice: 9.87, currency: 'BRL', regularMarketTime: '2026-10-08T21:00:00Z' }] })));
  const result = await new BrapiProvider('private-test-token', fetcher).getQuote('MXRF11', 'fii');
  expect(fetcher.mock.calls[0][0]).toBe('https://brapi.dev/api/quote/MXRF11');
  expect(result).toMatchObject({ price: '9.87', date: '2026-10-08', source: 'brapi' });
});


test('public B3 quotes need no token and validate symbol, currency and publication date', async () => {
  const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ chart: { result: [{ meta: { symbol: 'ROXO34.SA', currency: 'BRL', regularMarketPrice: 12.94, regularMarketTime: Date.parse('2026-10-08T20:00:00Z') / 1000 } }], error: null } })));
  expect(await new YahooQuoteProvider(fetcher).getQuote('ROXO34', 'bdr')).toMatchObject({ ticker: 'ROXO34', price: '12.94', date: '2026-10-08', source: 'Yahoo Finance' });
  expect(fetcher.mock.calls[0][0]).toContain('/ROXO34.SA?'); expect(fetcher.mock.calls[0][1]?.headers).not.toHaveProperty('Authorization');
  await expect(new YahooQuoteProvider(fetcher).getQuote('PETR4')).rejects.toThrow('outro ativo');
});
