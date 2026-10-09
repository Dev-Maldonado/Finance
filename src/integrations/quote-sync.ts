import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { D } from '@/financial/engine';
import { requireSupabasePublicConfig } from '@/lib/supabase-config';
import { BrapiProvider, YahooQuoteProvider, fetchData, normalizeTicker, ProviderError, validatedDate } from './providers';
import { deadline, signaled, within } from './deadline';
import { serverFetch } from './benchmark-sync';

export const QUOTE_CACHE_MS = 5 * 60 * 1000;
export const quotedClasses = ['stock', 'fii', 'etf', 'bdr', 'fiagro'];
export type QuoteAsset = { ticker: string; asset_class: string; currency: string };
export type QuoteOutcome = { ticker: string; status: 'success' | 'cached' | 'error'; date?: string; message?: string };
export type QuoteStatus = { checkedAt: string; results: QuoteOutcome[]; error?: string };
export class QuoteConfigurationError extends Error {}

export async function updateQuotes(db: SupabaseClient, assets: QuoteAsset[], options: { now?: Date; market?: Pick<BrapiProvider, 'getQuote'>; timeoutMs?: number } = {}): Promise<QuoteStatus> {
  const now = options.now ?? new Date(), budget = deadline(options.timeoutMs ?? 40000);
  const query = <T>(operation: PromiseLike<T>) => within(signaled(operation, budget.signal), budget.signal);
  const token = process.env.BRAPI_API_TOKEN?.trim();
  const provider = options.market || token ? 'brapi' : 'yahoo';
  const fetcher: typeof fetchData = (url, init) => fetchData(url, { ...init, signal: budget.signal }, 2, 10000);
  const market = options.market ?? (token ? new BrapiProvider(token, fetcher) : new YahooQuoteProvider(fetcher));
  const selected = [...new Map(assets.filter(a => quotedClasses.includes(a.asset_class)).map(a => [`${a.ticker}:${a.asset_class}:${a.currency}`, a])).values()];
  const results: QuoteOutcome[] = new Array(selected.length);
  let index = 0;
  const recent = (date?: string | null) => !!date && now.getTime() >= Date.parse(date) && now.getTime() - Date.parse(date) < QUOTE_CACHE_MS;
  try {
    await Promise.all(Array.from({ length: Math.min(3, selected.length) }, async () => {
      while (index < selected.length) {
        const position = index++, asset = selected[position];
        let ticker = asset.ticker, key = '';
        try {
          ticker = normalizeTicker(ticker); key = `${provider}:${ticker}:${asset.asset_class}:quote`;
          const { data: state, error: stateError } = await query(db.from('provider_sync_states').select('last_success,last_date').eq('provider', key).maybeSingle());
          if (stateError) throw new Error('Cache indisponível');
          if (recent(state?.last_success)) { results[position] = { ticker, status: 'cached', date: state?.last_date ?? undefined }; continue; }
          const { data: log, error: logError } = await query(db.from('provider_sync_logs').select('status,message,started_at').eq('provider', key).order('started_at', { ascending: false }).limit(1).maybeSingle());
          if (logError) throw new Error('Auditoria indisponível');
          if (log?.status === 'error' && recent(log.started_at)) { results[position] = { ticker, status: 'error', message: log.message }; continue; }
          const quote = await within(market.getQuote(ticker, asset.asset_class), budget.signal);
          const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
          validatedDate(quote.date, false, today);
          if (quote.ticker !== ticker || quote.currency !== asset.currency || !['brapi', 'Yahoo Finance'].includes(quote.source) || !D(quote.price).isFinite() || !D(quote.price).gt(0)) throw new Error('Resposta de cotação incompatível com o ativo');
          const { error } = await query(db.from('asset_price_history').upsert({ ...quote, collected_at: now.toISOString() }, { onConflict: 'ticker,date,source' }));
          if (error) throw new Error('Não foi possível salvar a cotação');
          const { error: auditError } = await query(db.from('provider_sync_logs').insert({ provider: key, status: 'success', records: 1, started_at: now.toISOString() }));
          if (auditError) throw new Error('Auditoria indisponível');
          const { error: rememberError } = await query(db.from('provider_sync_states').upsert({ provider: key, last_success: now.toISOString(), last_date: quote.date }));
          if (rememberError) throw new Error('Cache indisponível');
          results[position] = { ticker, status: 'success', date: quote.date };
        } catch (error) {
          const message = provider === 'brapi' && error instanceof ProviderError && [401,403].includes(error.status ?? 0)
            ? 'Configure BRAPI_API_TOKEN no servidor e confira a cobertura do plano para este ativo.'
            : error instanceof ProviderError && error.status === 404 ? 'Ativo não encontrado na API. Confira o ticker cadastrado; dados anteriores preservados.'
            : error instanceof ProviderError && error.status === 429 ? 'Limite da API atingido. A cotação anterior foi preservada.'
            : budget.signal.aborted ? 'Prazo da atualização excedido. A cotação anterior foi preservada.'
            : 'Cotação indisponível ou inválida. Confira o ticker e a cobertura da API; dados anteriores preservados.';
          results[position] = { ticker, status: 'error', message };
          if (key && !budget.signal.aborted) await query(db.from('provider_sync_logs').insert({ provider: key, status: 'error', records: 0, message, started_at: now.toISOString() })).catch(() => {});
        }
      }
    }));
    return { checkedAt: now.toISOString(), results };
  } finally { budget.close(); }
}

const running = new Map<string, Promise<QuoteStatus>>();
export function syncQuotes(assets?: QuoteAsset[]): Promise<QuoteStatus> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new QuoteConfigurationError('Configure SUPABASE_SERVICE_ROLE_KEY no servidor para atualizar cotações.');
  const { url } = requireSupabasePublicConfig();
  const signature = assets ? JSON.stringify(assets.map(a => `${a.ticker}:${a.asset_class}:${a.currency}`).sort()) : 'all';
  const existing = running.get(signature); if (existing) return existing;
  const db = createClient(url, key, { auth: { persistSession: false }, global: { fetch: serverFetch } });
  const work = (async () => {
    if (!assets) {
      const { data, error } = await db.from('investment_assets').select('ticker,asset_class,currency').in('asset_class', quotedClasses);
      if (error) throw new Error('Cadastro de ativos indisponível'); assets = data ?? [];
    }
    return updateQuotes(db, assets);
  })().finally(() => running.delete(signature));
  running.set(signature, work); return work;
}
