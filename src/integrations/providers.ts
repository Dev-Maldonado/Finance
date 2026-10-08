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
export async function fetchData(
  url: string,
  init: RequestInit = {},
  attempts = 3,
): Promise<Response> {
  for (let i = 0; i < attempts; i++) {
    try {
      const options: RequestInit & { dispatcher?: ProxyAgent } = {
        ...init,
        signal: AbortSignal.timeout(15000),
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
      if (error instanceof ProviderError || i === attempts - 1) throw error;
    }
    await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** i, 4000)));
  }
  throw new ProviderError("Falha de rede");
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
      .parse(await response.json());
    return rows
      .map((r) => {
        const value = r.valor.replace(",", ".");
        if (!/^\d+(\.\d+)?$/.test(value) || Number(value) > 10)
          throw new ProviderError("Taxa CDI inválida");
        return {
          series: this.series,
          date: r.data.split("/").reverse().join("-"),
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
    return response.json();
  }
  async getQuote(ticker: string, assetClass = "stock"): Promise<Quote> {
    if (!/^[A-Z0-9.-]{1,20}$/.test(ticker))
      throw new ProviderError("Ticker inválido");
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
      return {
        ticker: q.symbol,
        price: String(q.price),
        currency: "BRL",
        date: q.asOfDate.slice(0, 10),
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
    return {
      ticker: q.symbol,
      price: String(q.data.regularMarketPrice),
      currency: q.data.currency,
      date: q.data.regularMarketTime.slice(0, 10),
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
    const isFii = ["fii", "fiagro"].includes(assetClass);
    const body = await this.request(
      isFii ? "fii/historical" : "stocks/historical",
      isFii
        ? { symbols: ticker, sortOrder: "asc" }
        : { symbols: ticker, range: "1y", interval: "1d", sortOrder: "asc" },
    );
    const series = isFii ? body.fiis?.[0] : body.results?.[0]?.data;
    const history = z
      .array(z.object({ date: z.number().int(), close: z.number().positive() }))
      .parse(series?.historicalDataPrice);
    return history.map((r) => ({
      ticker,
      date: new Date(r.date * 1000).toISOString().slice(0, 10),
      price: String(r.close),
      currency: "BRL",
      source: "brapi",
    }));
  }
  async getDividends(
    ticker: string,
    assetClass = "stock",
  ): Promise<DividendEvent[]> {
    const isFii = ["fii", "fiagro"].includes(assetClass);
    const body = await this.request(
      isFii ? "fii/dividends" : "stocks/dividends",
      { symbols: ticker, sortOrder: "asc" },
    );
    const list = isFii
      ? body.dividends
      : body.results?.[0]?.data?.cashDividends;
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
      .map((e) => ({
        ticker,
        date_com: e.lastDatePrior!.slice(0, 10),
        payment_date: e.paymentDate!.slice(0, 10),
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
      }));
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
    return { ticker, price, date, currency, source: "manual" };
  }
}
