import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ZodError } from 'zod';
import { BrapiProvider, normalizeTicker, ProviderError, ProviderValidationError, validatedDate } from './providers';
import { syncCVM, syncFundRegistry } from './cvm-sync';
import { updateBenchmarks } from './benchmark-sync';
import { requireSupabasePublicConfig } from '../lib/supabase-config';
import { fundId } from '../lib/fund-id';

export type SyncOutcome = { provider: string; status: 'success' | 'cached' | 'partial' | 'error' | 'skipped'; records: number; message?: string; failed?: string[] };
export class MarketConfigurationError extends Error {}
type MarketDependencies = { now?: Date; market?: BrapiProvider; benchmarks?: typeof updateBenchmarks; registry?: typeof syncFundRegistry; cvm?: typeof syncCVM };
const supported = new Set(['stock', 'fii', 'etf', 'bdr', 'fiagro']);
const publicError = (error: unknown) => error instanceof ProviderError ? error.message : error instanceof ZodError ? 'Resposta do provedor fora do formato esperado' : 'Falha de provedor ou persistência; dados anteriores preservados';
const quarantine = (error: unknown) => error instanceof ProviderValidationError || error instanceof ZodError;
async function log(db: SupabaseClient, provider: string, status: string, records: number, message = '') {
  const { error } = await db.from('provider_sync_logs').insert({ provider, status, records, message });
  if (error) throw new Error('Auditoria indisponível');
}
async function state(db: SupabaseClient, provider: string) {
  const { data, error } = await db.from('provider_sync_states').select('last_success,last_date').eq('provider', provider).maybeSingle();
  if (error) throw new Error('Cache indisponível');
  return data;
}
async function remember(db: SupabaseClient, provider: string, now: Date, lastDate: string | null) {
  const { error } = await db.from('provider_sync_states').upsert({ provider, last_success: now.toISOString(), last_date: lastDate });
  if (error) throw new Error('Não foi possível salvar estado');
}
const todayAt = (now: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
const freshToday = (last: { last_success?: string | null } | null, today: string) => !!last?.last_success && todayAt(new Date(last.last_success)) === today;

// Independently cached operations prevent one unsupported asset/month from blocking the others.
export async function updateMarket(db: SupabaseClient, deps: MarketDependencies = {}): Promise<SyncOutcome[]> {
  const now = deps.now ?? new Date();
  const today = todayAt(now);
  const market = deps.market ?? new BrapiProvider();
  const outcomes: SyncOutcome[] = [];
  try {
    const results = await (deps.benchmarks ?? updateBenchmarks)(db, now);
    outcomes.push({ provider: 'bcb', status: results.some(r => r.status === 'error') ? (results.some(r => r.status !== 'error') ? 'partial' : 'error') : results.every(r => r.status === 'cached') ? 'cached' : 'success', records: results.reduce((n, r) => n + r.records, 0) });
  } catch { outcomes.push({ provider: 'bcb', status: 'error', records: 0, message: 'Não foi possível atualizar indexadores' }); }
  for (const provider of ['brapi', 'cvm']) {
    let records = 0;
    const failures: string[] = [];
    let completed = 0;
    let requested = 0;
    try {
      const { data: assets, error } = await db.from('investment_assets').select('ticker,asset_class,currency,cnpj,share_class');
      if (error) throw new Error('Cadastro de ativos indisponível');
      if (provider === 'brapi') {
        const tickers = new Map<string, { ticker: string; asset_class: string; currency: string }>();
        for (const asset of assets ?? []) {
          if (!supported.has(asset.asset_class)) continue;
          try { const ticker = normalizeTicker(asset.ticker); tickers.set(`${ticker}:${asset.asset_class}`, { ...asset, ticker }); }
          catch (error) { failures.push('ticker inválido'); await log(db, provider, 'quarantined', 0, publicError(error)); }
        }
        for (const asset of tickers.values()) {
          const key = `brapi:${asset.ticker}:${asset.asset_class}`;
          for (const operation of ['quote', 'history', 'dividends'] as const) {
            const cacheKey = `${key}:${operation}`;
            try {
              if (freshToday(await state(db, cacheKey), today)) { completed++; continue; }
              requested++;
              let count = 0;
              let lastDate: string | null = null;
              if (operation === 'quote') {
                const quote = await market.getQuote(asset.ticker, asset.asset_class);
                if (quote.ticker !== asset.ticker) throw new ProviderValidationError('Cotação pertence a outro ativo');
                validatedDate(quote.date, false, today);
                if (quote.currency !== asset.currency) throw new ProviderValidationError('Moeda da cotação difere do cadastro do ativo');
                const { error } = await db.from('asset_price_history').upsert({ ...quote, collected_at: now.toISOString() }, { onConflict: 'ticker,date,source' });
                if (error) throw new Error('Não foi possível persistir cotação');
                count = 1; lastDate = quote.date;
              } else if (operation === 'history') {
                const history = await market.getHistoricalPrices(asset.ticker, asset.asset_class);
                if (history.some(q => q.ticker !== asset.ticker)) throw new ProviderValidationError('Histórico pertence a outro ativo');
                for (const item of history) validatedDate(item.date, false, today);
                if (history.some(q => q.currency !== asset.currency)) throw new ProviderValidationError('Moeda do histórico difere do cadastro do ativo');
                for (let i = 0; i < history.length; i += 500) {
                  const batch = history.slice(i, i + 500).map(q => ({ ...q, collected_at: now.toISOString() }));
                  const { error } = await db.from('asset_price_history').upsert(batch, { onConflict: 'ticker,date,source' });
                  if (error) throw new Error('Não foi possível persistir histórico');
                  count += batch.length;
                }
                lastDate = history.map(q => q.date).sort().at(-1) ?? null;
              } else {
                const dividends = [...new Map((await market.getDividends(asset.ticker, asset.asset_class)).map(e => [e.source_id, e])).values()];
                if (dividends.some(e => e.ticker !== asset.ticker || !e.source_id)) throw new ProviderValidationError('Proventos sem identidade válida');
                for (const item of dividends) {
                  validatedDate(item.date_com, true); validatedDate(item.payment_date, true);
                  if (item.payment_date < item.date_com) throw new ProviderValidationError('Pagamento anterior à data-com do provento');
                }
                if (dividends.length) {
                  const { error } = await db.from('asset_cash_events').upsert(dividends.map(e => ({ ...e, collected_at: now.toISOString() })), { onConflict: 'source_id' });
                  if (error) throw new Error('Não foi possível persistir proventos');
                }
                count = dividends.length; lastDate = dividends.map(e => e.date_com).sort().at(-1) ?? null;
              }
              await log(db, cacheKey, 'success', count); await remember(db, cacheKey, now, lastDate);
              records += count; completed++;
            } catch (error) { failures.push(`${asset.ticker}/${operation}`); await log(db, cacheKey, quarantine(error) ? 'quarantined' : 'error', 0, publicError(error)); }
          }
        }
      } else {
        const funds = [...new Set((assets ?? []).filter(a => a.asset_class === 'fund').map(a => fundId(a.cnpj ?? '', a.share_class ?? '')))].sort();
        const registryKey = 'cvm:registry';
        try {
          const registryState = await state(db, registryKey);
          if (registryState?.last_success && now.getTime() - Date.parse(registryState.last_success) < 7 * 86400000) completed++;
          else {
            requested++;
            const count = await (deps.registry ?? syncFundRegistry)(db);
            await log(db, registryKey, 'success', count); await remember(db, registryKey, now, today);
            records += count; completed++;
          }
        } catch (error) { failures.push('cadastro'); await log(db, registryKey, quarantine(error) ? 'quarantined' : 'error', 0, publicError(error)); }
        if (funds.length) {
          const previous = new Date(`${today.slice(0, 7)}-01T00:00:00Z`); previous.setUTCMonth(previous.getUTCMonth() - 1);
          const months = [today.slice(0, 7).replace('-', ''), previous.toISOString().slice(0, 7).replace('-', '')];
          const signature = createHash('sha256').update(funds.join('|')).digest('hex').slice(0, 16);
          for (const month of months) {
            const key = `cvm:${month}:${signature}`;
            try {
              if (freshToday(await state(db, key), today)) { completed++; continue; }
              requested++;
              const count = await (deps.cvm ?? syncCVM)(db, month, undefined, now.toISOString());
              await log(db, key, 'success', count); await remember(db, key, now, `${month.slice(0, 4)}-${month.slice(4)}-01`);
              records += count; completed++;
            } catch (error) {
              if (error instanceof ProviderError && error.status === 404) { failures.push(`${month}: aguardando publicação`); await log(db, key, 'pending', 0, 'Arquivo CVM ainda não publicado; outros meses continuam sendo processados'); }
              else { failures.push(month); await log(db, key, quarantine(error) ? 'quarantined' : 'error', 0, publicError(error)); }
            }
          }
        }
      }
      const status: SyncOutcome['status'] = failures.length ? completed ? 'partial' : 'error' : !completed ? 'skipped' : !requested ? 'cached' : 'success';
      await log(db, provider, status, records, failures.length ? 'Há operações pendentes; as demais foram processadas' : '');
      // A cache check is not a new provider consultation.
      if (status === 'success') await remember(db, provider, now, today);
      outcomes.push({ provider, status, records, ...(failures.length ? { failed: failures, message: 'Consulte os logs por ativo/mês; dados anteriores preservados' } : {}) });
    } catch {
      await log(db, provider, 'error', records, 'Falha de persistência/auditoria; execução não considerada concluída').catch(() => {});
      outcomes.push({ provider, status: 'error', records, message: 'Não foi possível concluir o provedor; dados anteriores preservados' });
    }
  }
  return outcomes;
}
export async function syncMarket() {
  let url: string;
  try { url = requireSupabasePublicConfig().url; }
  catch { throw new MarketConfigurationError('Configure a URL e a chave pública do projeto correto no runner'); }
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new MarketConfigurationError('Configure SUPABASE_SERVICE_ROLE_KEY nas variáveis privadas do runner');
  const db = createClient(url, key, { auth: { persistSession: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(20000) }) } });
  return updateMarket(db);
}
