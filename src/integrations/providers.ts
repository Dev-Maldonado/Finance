import { z } from "zod";
import { ProxyAgent } from "undici";
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;
const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;
export class ProviderError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}
export class ProviderValidationError extends ProviderError {}
export function normalizeTicker(value: string) {
  const ticker = value.trim().toUpperCase();
  if (!/^[A-Z0-9.-]{1,20}$/.test(ticker)) throw new ProviderValidationError("Ticker inválido");
  return ticker;
}
export function validatedDate(value: string, allowFuture = false, today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())) {
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || (!allowFuture && date > today)) {
    throw new ProviderValidationError("Data do provedor inválida ou futura");
  }
  return date;
}
function validateIdentity(requested: string, received: string) {
  if (normalizeTicker(received) !== requested) throw new ProviderValidationError("Resposta pertence a outro ativo");
}
export async function fetchData(
  url: string,
  init: RequestInit = {},
  attempts = 3,
  timeoutMs = 15000,
): Promise<Response> {
  for (let i = 0; i < attempts; i++) {
    try {
      const options: RequestInit & { dispatcher?: ProxyAgent } = {
        ...init,
        signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
        cache: "no-store",
        ...(dispatcher ? { dispatcher } : {}),
      };
      const response = await fetch(url, options);
      if (response.ok) return response;
      if (response.status !== 429 && response.status < 500)
        throw new ProviderError(
          `Provedor respondeu ${response.status}`,
          response.status,
        );
      if (i === attempts - 1)
        throw new ProviderError(
          `Provedor indisponível (${response.status})`,
          response.status,
        );
    } catch (error) {
      if (error instanceof ProviderError || init.signal?.aborted || i === attempts - 1) throw error;
    }
    await new Promise<void>((resolve, reject) => {
      if (init.signal?.aborted) { reject(init.signal.reason); return; }
      const finish = () => { init.signal?.removeEventListener('abort', abort); resolve(); };
      const timer = setTimeout(finish, Math.min(1000 * 2 ** i, 4000));
      const abort = () => { clearTimeout(timer); reject(init.signal?.reason); };
      init.signal?.addEventListener('abort', abort, { once: true });
    });
  }
  throw new ProviderError("Falha de rede");
}
export async function boundedBytes(response: Response, limit: number) {
  const advertised = Number(response.headers.get('content-length'));
  if (advertised > limit) throw new ProviderValidationError("Arquivo do provedor excede limite");
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new ProviderValidationError("Arquivo do provedor excede limite");
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
async function providerJson(response: Response) {
  const bytes = await boundedBytes(response, 5_000_000);
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new ProviderValidationError('Resposta JSON inválida'); }
}
export class CDIRateProvider {
  constructor(
    private fetcher = fetchData,
    private series = "12",
  ) {}
  async history(start: string, end: string) {
    const format = (date: string) => date.split("-").reverse().join("/");
    const url = new URL(
      "https://api.bcb.gov.br/dados/serie/bcdata.sgs." + this.series + "/dados",
    );
    url.search = new URLSearchParams({
      formato: "json",
      dataInicial: format(start),
      dataFinal: format(end),
    }).toString();
    const response = await this.fetcher(url.toString());
    const rows = z
      .array(
        z.object({
          data: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/),
          valor: z.string(),
        }),
      )
      .parse(await providerJson(response));
    return rows
      .map((r) => {
        const value = r.valor.replace(",", ".");
        if (!/^\d+(\.\d+)?$/.test(value) || Number(value) > 10)
          throw new ProviderError("Taxa CDI inválida");
        return {
          series: this.series,
          date: validatedDate(r.data.split("/").reverse().join("-"), false, end),
          value,
          source: `BCB SGS ${this.series}`,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}
export type Quote = {
  ticker: string;
  price: string;
  currency: string;
  date: string;
  source: string;
};
export interface MarketDataProvider {
  getQuote(ticker: string): Promise<Quote>;
  searchAssets(query: string): Promise<unknown[]>;
}
export type DividendEvent = {
  ticker: string;
  date_com: string;
  payment_date: string;
  rate: string;
  label: string;
  source: string;
  source_id: string;
};
export class BrapiProvider implements MarketDataProvider {
  constructor(
    private token = process.env.BRAPI_API_TOKEN,
    private fetcher = fetchData,
  ) {}
  private async request(path: string, params: Record<string, string>) {
    const url = new URL(`https://brapi.dev/api/v2/${path}`);
    url.search = new URLSearchParams(params).toString();
    const response = await this.fetcher(url.toString(), {
      headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
    });
    return providerJson(response);
  }
  async getQuote(ticker: string, assetClass = "stock"): Promise<Quote> {
    ticker = normalizeTicker(ticker);
    if (["fii", "fiagro"].includes(assetClass)) {
      const body = z
        .object({
          fiis: z.array(
            z.object({
              symbol: z.string(),
              price: z.number().positive(),
              asOfDate: z.string(),
            }),
          ),
        })
        .parse(await this.request("fii/indicators", { symbols: ticker }));
      const q = body.fiis[0];
      if (!q) throw new ProviderError("Cotação ausente");
      validateIdentity(ticker, q.symbol);
      return {
        ticker: q.symbol,
        price: String(q.price),
        currency: "BRL",
        date: validatedDate(q.asOfDate),
        source: "brapi",
      };
    }
    const body = z
      .object({
        results: z.array(
          z.object({
            symbol: z.string(),
            data: z.object({
              regularMarketPrice: z.number().positive(),
              currency: z.string(),
              regularMarketTime: z.string(),
            }),
          }),
        ),
      })
      .parse(await this.request("stocks/quote", { symbols: ticker }));
    const q = body.results[0];
    if (!q) throw new ProviderError("Cotação ausente");
    validateIdentity(ticker, q.symbol);
    if (!/^[A-Z]{3}$/.test(q.data.currency)) throw new ProviderValidationError("Moeda do provedor inválida");
    return {
      ticker: q.symbol,
      price: String(q.data.regularMarketPrice),
      currency: q.data.currency,
      date: validatedDate(q.data.regularMarketTime),
      source: "brapi",
    };
  }
  async searchAssets(query: string) {
    const body = z
      .object({ results: z.array(z.record(z.string(), z.unknown())) })
      .parse(await this.request("tickers", { search: query, limit: "20" }));
    return body.results;
  }
  async getHistoricalPrices(ticker: string, assetClass = "stock") {
    ticker = normalizeTicker(ticker);
    const isFii = ["fii", "fiagro"].includes(assetClass);
    const body = await this.request(
      isFii ? "fii/historical" : "stocks/historical",
      isFii
        ? { symbols: ticker, sortOrder: "asc" }
        : { symbols: ticker, range: "1y", interval: "1d", sortOrder: "asc" },
    );
    const item = isFii ? body.fiis?.[0] : body.results?.[0];
    if (!item || typeof item.symbol !== 'string') throw new ProviderValidationError("Histórico sem identificação do ativo");
    validateIdentity(ticker, item.symbol);
    const series = z.object({ currency: z.string().optional(), historicalDataPrice: z.unknown() }).parse(isFii ? item : item.data);
    const currency = isFii ? 'BRL' : series.currency ?? 'BRL';
    if (!/^[A-Z]{3}$/.test(currency)) throw new ProviderValidationError("Moeda do histórico inválida");
    const history = z
      .array(z.object({ date: z.number().int(), close: z.number().positive() }))
      .parse(series?.historicalDataPrice);
    return history.map((r) => ({
      ticker,
      date: validatedDate(new Date(r.date * 1000).toISOString()),
      price: String(r.close),
      currency,
      source: "brapi",
    }));
  }
  async getDividends(
    ticker: string,
    assetClass = "stock",
  ): Promise<DividendEvent[]> {
    ticker = normalizeTicker(ticker);
    const isFii = ["fii", "fiagro"].includes(assetClass);
    const body = await this.request(
      isFii ? "fii/dividends" : "stocks/dividends",
      { symbols: ticker, sortOrder: "asc" },
    );
    if (!isFii) {
      const item = body.results?.[0];
      if (!item || typeof item.symbol !== 'string') throw new ProviderValidationError("Proventos sem identificação do ativo");
      validateIdentity(ticker, item.symbol);
    }
    const list = isFii
      ? body.dividends
      : body.results?.[0]?.data?.cashDividends;
    if (isFii && Array.isArray(list)) {
      // FII layouts can identify the symbol per event instead of at the envelope.
      for (const event of list) {
        const symbol = event?.symbol ?? event?.ticker;
        if (typeof symbol === 'string') validateIdentity(ticker, symbol);
      }
    }
    const events = z
      .array(
        z.object({
          rate: z.number().positive(),
          lastDatePrior: z.string().nullable(),
          paymentDate: z.string().nullable(),
          label: z.string(),
          approvedOn: z.string().nullable().optional(),
          relatedTo: z.string().nullable().optional(),
        }),
      )
      .parse(list);
    return events
      .filter((e) => e.lastDatePrior && e.paymentDate)
      .map((e) => {
        const dateCom = validatedDate(e.lastDatePrior!, true);
        const paymentDate = validatedDate(e.paymentDate!, true);
        if (paymentDate < dateCom) throw new ProviderValidationError('Pagamento anterior à data-com do provento');
        return {
        ticker,
        date_com: dateCom,
        payment_date: paymentDate,
        rate: String(e.rate),
        label: e.label,
        source: "brapi",
        source_id: [
          ticker,
          e.lastDatePrior,
          e.paymentDate,
          e.label,
          e.approvedOn ?? "",
          e.relatedTo ?? "",
        ].join("|"),
        };
      });
  }
}
export class ManualPriceProvider {
  getQuote(
    ticker: string,
    price: string,
    date: string,
    currency = "BRL",
  ): Quote {
    if (!/^\d+(\.\d{1,8})?$/.test(price) || Number(price) <= 0)
      throw new ProviderError("Preço inválido");
    if (!/^[A-Z]{3}$/.test(currency)) throw new ProviderValidationError("Moeda inválida");
    const identifier = ticker.trim().toUpperCase();
    if (!identifier || identifier.length > 200) throw new ProviderValidationError('Identificador manual inválido');
    return { ticker: identifier, price, date: validatedDate(date), currency, source: "manual" };
  }
}
