import type { SupabaseClient } from '@supabase/supabase-js';
import { loadEconomicIndicators, type EconomicIndicator, type EconomicIndicators } from './economic-indicators';
import { serverFetch } from './benchmark-sync';
type Key = 'selic' | 'ipca' | 'usd';
const keys: Key[] = ['selic', 'ipca', 'usd'];
/** Only public official indicators are cached; financial snapshots never enter this table. */
export async function cachedEconomicIndicators(db: SupabaseClient, writer: SupabaseClient | null, force = false, fetcher: typeof fetch = serverFetch, now = new Date()): Promise<EconomicIndicators> {
 const saved = new Map<string, Record<string, string>>();
 try {
  const cached = await db.from('economic_indicator_cache').select('indicator,value::text,reference,source,url,fetched_at').abortSignal(AbortSignal.timeout(2000));
  if (!cached.error) for (const row of cached.data ?? []) saved.set(row.indicator, row);
 } catch { /* A cache outage must not prevent consulting the official sources. */ }
 const valid = (key: Key, r: Record<string, string> | undefined) => {
  if (!r || !/^[-+]?\d+(?:\.\d+)?$/.test(r.value) || !Number.isFinite(Number(r.value)) || !['Banco Central', 'IBGE'].includes(r.source) || !/^https:\/\/(?:api\.bcb\.gov\.br|olinda\.bcb\.gov\.br|apisidra\.ibge\.gov\.br|servicodados\.ibge\.gov\.br)\//.test(r.url)) return false;
  const value = Number(r.value), day = now.toISOString().slice(0, 10);
  return Number.isFinite(Date.parse(r.fetched_at)) && Date.parse(r.fetched_at) <= now.getTime() &&
   (key === 'ipca' ? /^\d{4}-(0[1-9]|1[0-2])$/.test(r.reference) && r.reference < day.slice(0,7) && value >= -100 && value <= 100 : /^\d{4}-\d{2}-\d{2}$/.test(r.reference) && r.reference <= day && (key === 'usd' ? value > 0 : value >= 0) && value <= (key === 'usd' ? 1000 : 100));
 };
 const fromCache = (key: Key, stale: boolean): EconomicIndicator => {
  const r = saved.get(key)!;
  return { value: r.value, reference: r.reference, source: r.source as EconomicIndicator['source'], url: r.url, fetchedAt: r.fetched_at, stale,
   error: stale ? 'Fonte temporariamente indisponível. Exibindo o último dado oficial válido.' : null,
   note: key === 'usd' ? 'PTAX de venda · cotação diária oficial' : undefined };
 };
 if (!force && keys.every(key => valid(key, saved.get(key)) && now.getTime() - Date.parse(saved.get(key)!.fetched_at) < 3600000))
  return { selic: fromCache('selic', false), ipca: fromCache('ipca', false), usd: fromCache('usd', false), checkedAt: now.toISOString() };
 const result = await loadEconomicIndicators(fetcher, now);
 await Promise.all(keys.map(async key => {
  const indicator = result[key];
  if (indicator.value !== null) {
   indicator.fetchedAt = now.toISOString();
   try {
    if (writer) await writer.from('economic_indicator_cache').upsert({ indicator: key, value: indicator.value, reference: indicator.reference, source: indicator.source, url: indicator.url, fetched_at: indicator.fetchedAt }).abortSignal(AbortSignal.timeout(2000));
   } catch { /* A successful official observation remains usable without persistence. */ }
  } else if (valid(key, saved.get(key))) result[key] = fromCache(key, true);
 }));
 return result;
}
