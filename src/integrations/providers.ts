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
export function validatedDate(value: string, allowFuture = false, today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())) {
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || (!allowFuture && date > today)) {
    throw new ProviderValidationError("Data do provedor inválida ou futura");
  }
  return date;
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
