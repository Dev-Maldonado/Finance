import { ProxyAgent } from 'undici';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CDIRateProvider, fetchData } from './providers';
import { requireSupabasePublicConfig } from '../lib/supabase-config';

const proxyURL = process.env.HTTPS_PROXY || process.env.https_proxy;
const dispatcher = proxyURL ? new ProxyAgent(proxyURL) : undefined;
const serverFetch: typeof fetch = (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const options: RequestInit & { dispatcher?: ProxyAgent } = { ...init, signal: init?.signal ?? AbortSignal.timeout(10000), ...(dispatcher && !local ? { dispatcher } : {}) };
  return fetch(input, options);
};

const CACHE_MS = 4 * 60 * 60 * 1000;
const shift = (date: string, days: number) => new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);
export type BenchmarkOutcome = { series: string; status: 'success' | 'cached' | 'error'; records: number; lastDate?: string | null; message?: string };

// Isolated from the slower CVM/market jobs so serverless daily updates stay bounded.
export async function updateBenchmarks(db: SupabaseClient, now = new Date(), providerFactory = (series: string) => new CDIRateProvider((url, init) => fetchData(url, init, 2, 20000), series)) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
  return Promise.all(['12', '11'].map(async (series): Promise<BenchmarkOutcome> => {
    const provider = series === '12' ? 'bcb-cdi' : 'bcb-selic';
    try {
      const [{ data: state, error: stateError }, { data: earliest, error: rateError }, { data: oldestLot, error: lotError }, { data: coverage, error: coverageError }, { data: latest, error: latestError }] = await Promise.all([
        db.from('provider_sync_states').select('last_success,last_date').eq('provider', provider).maybeSingle(),
        db.from('benchmark_rates').select('date').eq('series', series).order('date').limit(1).maybeSingle(),
        db.from('savings_lots').select('start_date').in('indexer', series === '12' ? ['cdi', 'fixed'] : ['selic']).order('start_date').limit(1).maybeSingle(),
        db.from('provider_sync_states').select('last_date').eq('provider', `${provider}-history`).maybeSingle(),
        db.from('benchmark_rates').select('date').eq('series', series).order('date', { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (stateError || rateError || lotError || coverageError || latestError) throw new Error('Falha ao consultar histórico dos indexadores');
      const fresh = state?.last_success && now.getTime() - Date.parse(state.last_success) < CACHE_MS;
      const coverageStart = coverage?.last_date ?? earliest?.date;
      const needBackfill = coverageStart && oldestLot && oldestLot.start_date < coverageStart;
      if (fresh && !needBackfill) return { series, status: 'cached', records: 0, lastDate: state.last_date };
      const windows: { start: string; end: string }[] = [];
      const latestDate = state?.last_date ?? latest?.date;
      if (!fresh) windows.push({ start: latestDate ? shift(latestDate, -7) : shift(today, -365), end: today });
      if (needBackfill) {
        const end = shift(coverageStart!, -1);
        windows.push({ start: oldestLot.start_date > shift(end, -365) ? oldestLot.start_date : shift(end, -365), end });
      }
      const batches = await Promise.all(windows.map(w => providerFactory(series).history(w.start, w.end)));
      const rates = [...new Map(batches.flat().map(r => [r.date, r])).values()].sort((a, b) => a.date.localeCompare(b.date));
      for (const r of rates) {
        if (r.date > today || !windows.some(w => r.date >= w.start && r.date <= w.end)) throw new Error('Taxa fora do período solicitado');
      }
      if (rates.length) {
        const { error } = await db.from('benchmark_rates').upsert(rates.map(r => ({ ...r, collected_at: now.toISOString(), validated: true })), { onConflict: 'series,date' });
        if (error) throw new Error('Falha ao salvar taxas oficiais');
      }
      const lastDate = [latestDate, rates.at(-1)?.date].filter(Boolean).sort().at(-1) ?? null;
      const { error } = await db.from('provider_sync_states').upsert({ provider, last_success: now.toISOString(), last_date: lastDate });
      if (error) throw new Error('Falha ao salvar atualização do indexador');
      const firstRequested = [coverageStart, ...windows.map(w => w.start)].filter(Boolean).sort()[0];
      if (firstRequested) {
        const { error: coverageSaveError } = await db.from('provider_sync_states').upsert({ provider: `${provider}-history`, last_success: now.toISOString(), last_date: firstRequested });
        if (coverageSaveError) throw new Error('Falha ao registrar cobertura do histórico');
      }
      await db.from('provider_sync_logs').insert({ provider, status: 'success', records: rates.length });
      return { series, status: 'success', records: rates.length, lastDate };
    } catch {
      const message = 'Não foi possível atualizar o BCB; o último histórico válido foi preservado.';
      await db.from('provider_sync_logs').insert({ provider, status: 'error', message });
      return { series, status: 'error', records: 0, message };
    }
  }));
}
let pending: Promise<BenchmarkOutcome[]> | undefined;
export function syncBenchmarks() {
  if (pending) return pending;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Atualização automática exige a configuração de serviço no servidor.');
  const db = createClient(requireSupabasePublicConfig().url, key, { auth: { persistSession: false }, global: { fetch: serverFetch } });
  pending = updateBenchmarks(db).finally(() => { pending = undefined; });
  return pending;
}
