import { ProxyAgent } from 'undici';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CDIRateProvider, fetchData } from './providers';
import { requireSupabasePublicConfig } from '../lib/supabase-config';
import { deadline, signaled, within } from './deadline';

const proxyURL = process.env.HTTPS_PROXY || process.env.https_proxy;
const dispatcher = proxyURL ? new ProxyAgent(proxyURL) : undefined;
export const serverFetch: typeof fetch = (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const options: RequestInit & { dispatcher?: ProxyAgent } = { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000), ...(dispatcher && !local ? { dispatcher } : {}) };
  return fetch(input, options);
};

const CACHE_MS = 4 * 60 * 60 * 1000;
const shift = (date: string, days: number) => new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);
export class BenchmarkConfigurationError extends Error {}
export type BenchmarkOutcome = { series: string; status: 'success' | 'cached' | 'error'; records: number; lastDate?: string | null; message?: string };

// Isolated from the slower CVM/market jobs so serverless daily updates stay bounded.
export async function updateBenchmarks(db: SupabaseClient, now = new Date(), providerFactory?: (series: string) => CDIRateProvider, limits: { timeoutMs?: number; signal?: AbortSignal } = {}) {
  // Leave time for authentication, response serialization and failure logging under maxDuration=60.
  const budget = deadline(limits.timeoutMs ?? 48000, limits.signal);
  const factory = providerFactory ?? ((series: string) => new CDIRateProvider((url, init) => fetchData(url, { ...init, signal: budget.signal }, 2, 15000), series));
  const query = <T>(request: PromiseLike<T>) => within(signaled(request, budget.signal), budget.signal);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
  try { return await Promise.all(['12', '11'].map(async (series): Promise<BenchmarkOutcome> => {
    const provider = series === '12' ? 'bcb-cdi' : 'bcb-selic';
    try {
      const [{ data: state, error: stateError }, { data: earliest, error: rateError }, { data: oldestLot, error: lotError }, { data: coverage, error: coverageError }, { data: latest, error: latestError }] = await Promise.all([
        query(db.from('provider_sync_states').select('last_success,last_date').eq('provider', provider).maybeSingle()),
        query(db.from('benchmark_rates').select('date').eq('series', series).order('date').limit(1).maybeSingle()),
        query(db.from('savings_lots').select('start_date').in('indexer', series === '12' ? ['cdi', 'fixed'] : ['selic']).order('start_date').limit(1).maybeSingle()),
        query(db.from('provider_sync_states').select('last_date').eq('provider', `${provider}-history`).maybeSingle()),
        query(db.from('benchmark_rates').select('date').eq('series', series).order('date', { ascending: false }).limit(1).maybeSingle()),
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
      const batches = await Promise.all(windows.map(w => within(factory(series).history(w.start, w.end), budget.signal)));
      // An empty weekend response does not justify claiming a year of history.
      // Preserve the previous coverage and successful cache if a long request
      // unexpectedly contains no published observations.
      for (let index = 0; index < windows.length; index++) {
        if (!batches[index].length && Date.parse(windows[index].end) - Date.parse(windows[index].start) > 7 * 86400000)
          throw new Error('Histórico oficial vazio para uma janela extensa');
      }
      const rates = [...new Map(batches.flat().map(r => [r.date, r])).values()].sort((a, b) => a.date.localeCompare(b.date));
      for (const r of rates) {
        if (r.date > today || !windows.some(w => r.date >= w.start && r.date <= w.end)) throw new Error('Taxa fora do período solicitado');
      }
      if (rates.length) {
        const { error } = await query(db.from('benchmark_rates').upsert(rates.map(r => ({ ...r, collected_at: now.toISOString(), validated: true })), { onConflict: 'series,date' }));
        if (error) throw new Error('Falha ao salvar taxas oficiais');
      }
      const lastDate = [latestDate, rates.at(-1)?.date].filter(Boolean).sort().at(-1) ?? null;
      const firstRequested = [coverageStart, ...windows.map(w => w.start)].filter(Boolean).sort()[0];
      const states = [{ provider, last_success: now.toISOString(), last_date: lastDate }, ...(firstRequested ? [{ provider: `${provider}-history`, last_success: now.toISOString(), last_date: firstRequested }] : [])];
      const { error: logError } = await query(db.from('provider_sync_logs').insert({ provider, status: 'success', records: rates.length }));
      if (logError) throw new Error('Falha ao registrar auditoria do indexador');
      const { error } = await query(db.from('provider_sync_states').upsert(states));
      if (error) throw new Error('Falha ao salvar atualização do indexador');
      return { series, status: 'success', records: rates.length, lastDate };
    } catch {
      const message = 'Não foi possível atualizar o BCB; o último histórico válido foi preservado.';
      const logBudget = deadline(2000);
      try { await within(signaled(db.from('provider_sync_logs').insert({ provider, status: 'error', message: budget.signal.aborted ? 'Prazo global da sincronização excedido; histórico preservado.' : message }), logBudget.signal), logBudget.signal); }
      catch { /* The endpoint still reports failure if the audit store is unavailable. */ }
      finally { logBudget.close(); }
      return { series, status: 'error', records: 0, message };
    }
  })); } finally { budget.close(); }
}
let pending: Promise<BenchmarkOutcome[]> | undefined;
export function syncBenchmarks() {
  if (pending) return pending;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key?.trim()) throw new BenchmarkConfigurationError('Configure SUPABASE_SERVICE_ROLE_KEY nas variáveis privadas Production da Vercel e faça redeploy.');
  let url: string;
  try { url = requireSupabasePublicConfig().url; }
  catch { throw new BenchmarkConfigurationError('Revise a URL e a chave pública do Supabase no deploy; configurações parciais são recusadas.'); }
  const db = createClient(url, key.trim(), { auth: { persistSession: false }, global: { fetch: serverFetch } });
  pending = updateBenchmarks(db).finally(() => { pending = undefined; });
  return pending;
}
