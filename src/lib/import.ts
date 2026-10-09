import { XMLParser } from "fast-xml-parser";
import { createHash } from "node:crypto";
import { D, money } from "@/financial/engine";
export function parseCsv(
  text: string,
  delimiter = ",",
): Record<string, string>[] {
  text = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (!quoted && field.length > 0) {
        field += '"';
      } else if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === delimiter && !quoted) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw new Error("CSV com aspas não fechadas");
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const header = rows.shift()?.map((h) => h.replace(/^\uFEFF/, "").trim());
  if (!header) throw new Error("CSV vazio");
  return rows.map((r) => {
    if (r.length !== header.length)
      throw new Error("Número de colunas inválido");
    return Object.fromEntries(header.map((h, i) => [h, r[i].trim()]));
  });
}
export type ImportRow = {
  description: string;
  date: string;
  amount: string;
  type: "income" | "expense" | "yield" | "adjustment";
  source_id: string;
  duplicate?: boolean;
};
export type ImportClassification = "income" | "expense" | "yield" | "adjustment" | "transfer" | "invoice_payment" | "savings_deposit" | "savings_withdraw" | "match" | "skip";
export type PreparedImportRow = ImportRow & {
  row_id: string;
  signed_amount: string;
  fingerprint: string;
  identity_kind: "source" | "fingerprint";
  suggested_classification: ImportClassification;
  requires_review: boolean;
  possible_duplicate?: boolean;
  can_force_new?: boolean;
};
export function realDate(input: string): string {
  const text = String(input ?? "").trim();
  const parts = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  const value = parts ? `${parts[3]}-${parts[2]}-${parts[1]}` : text;
  const parsed = new Date(`${value}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || Number(value.slice(0, 4)) < 1900)
    throw new Error("Data inválida; use AAAA-MM-DD ou DD/MM/AAAA");
  return value;
}
export function decimalInput(input: string, places = 2): string {
  let value = String(input ?? "").trim().replace(/^R\$\s*/, "").replace(/[\s\u00a0]/g, "");
  if (/^'[-+]?\d/.test(value)) value = value.slice(1); // Compatibility with older FINORA CSV exports.
  if (/^\(.*\)$/.test(value)) value = `-${value.slice(1, -1)}`;
  if (value.includes(",")) {
    if (!/^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+),\d+$/.test(value)) throw new Error("Valor numérico inválido");
    value = value.replaceAll(".", "").replace(",", ".");
  }
  if (!new RegExp(`^[+-]?\\d{1,12}(?:\\.\\d{1,${places}})?$`).test(value)) throw new Error(`Valor inválido; use até ${places} casas decimais`);
  return D(value).toFixed(Math.min(places, Math.max(0, value.split(".")[1]?.length ?? 0)));
}
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const normalizedDescription = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
export function transactionFingerprint(description: string, date: string, signedAmount: string) {
  return hash(JSON.stringify([normalizedDescription(description), date, money(signedAmount)]));
}
export function scopedSource(accountId: string, source: string) {
  const scoped = source.startsWith(`${accountId}:`) ? source : `${accountId}:${source}`;
  if (!source || scoped.length > 500) throw new Error("Identificador de origem excede o limite de 500 caracteres");
  return scoped;
}
/** Semantic full-file identity: formatting and row ordering do not create new effects. */
export function canonicalImportFileHash(records: Record<string, string>[]) {
  const canonicalRows = records.map(record => JSON.stringify(Object.entries(record).sort(([a],[b]) => a.localeCompare(b)).map(([key,value]) => [key,String(value).normalize('NFKC').trim()]))).sort();
  return hash(JSON.stringify(canonicalRows));
}
export function forceNewImportSource(source: string, identityKind: string, confirmationId?: string) {
  if (identityKind !== 'fingerprint') throw new Error('Identificadores fornecidos pelo banco não podem ser importados novamente');
  if (!confirmationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(confirmationId))
    throw new Error('Gere novamente a prévia para confirmar um novo lançamento idêntico');
  const forced = `${source}:forced:${confirmationId}`;
  if (forced.length > 500) throw new Error('Identificador de importação excede o limite de 500 caracteres');
  return forced;
}
export function importRequestId(value: string) {
  const data = hash(value).slice(0, 32).split(""); data[12] = "8"; data[16] = "8";
  const s = data.join(""); return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
export function parseTransactions(
  text: string,
  format: "csv" | "ofx",
): ImportRow[] {
  return prepareImportRows(text, format).map(({ description, date, amount, type, source_id }) => ({ description, date, amount, type, source_id }));
}
export function prepareImportRows(text: string, format: "csv" | "ofx"): PreparedImportRow[] {
  const occurrences = new Map<string, number>();
  let records: Record<string, string>[];
  if (format === "csv") {
    records = parseCsv(text, text.split("\n")[0].includes(";") ? ";" : ",").map(row => {
      const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""), value]));
      return { ...normalized, description: normalized.description || normalized.descricao || "Importação", date: normalized.date || normalized.data, amount: normalized.amount || normalized.valor, source_id: normalized.source_id || normalized.fitid || "", origin_type: normalized.type || normalized.tipo || "" };
    });
  } else {
  const cleaned = text
    .slice(text.indexOf("<OFX>"))
    .replace(
      /<([A-Z0-9_]+)>([^<\r\n]+)(?![^<]*<\/\1>)/g,
      (m, tag, val) => `${m}</${tag}>`,
    );
  const parser = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false,
  });
  const data = parser.parse(cleaned);
  const list =
    data.OFX?.BANKMSGSRSV1?.STMTTRNRS?.STMTRS?.BANKTRANLIST?.STMTTRN ??
    data.OFX?.CREDITCARDMSGSRSV1?.CCSTMTTRNRS?.CCSTMTRS?.BANKTRANLIST?.STMTTRN;
  if (!list) throw new Error("OFX sem transações reconhecidas");
  records = (Array.isArray(list) ? list : [list]).map((r) => {
    const d = String(r.DTPOSTED).slice(0, 8);
    if (!/^\d{8}$/.test(d) || !r.FITID)
      throw new Error("Transação OFX inválida");
    return {
      description: r.MEMO || r.NAME || "Importação OFX",
      date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
      amount: String(r.TRNAMT),
      source_id: String(r.FITID),
      origin_type: String(r.TRNTYPE ?? ""),
    };
  });
  }
  const normalized = records.map((r, index) => {
    let value: string, date: string;
    try { value = decimalInput(r.amount); date = realDate(r.date); }
    catch (error) { throw new Error(`Linha ${index + 2}: ${error instanceof Error ? error.message : "Dados inválidos"}`); }
    if (D(value).isZero()) throw new Error(`Valor zero na linha ${index + 2}`);
    const description = r.description.trim().slice(0, 200) || "Importação";
    const fingerprint = transactionFingerprint(description, date, value);
    const sourceKind = (r.origin_type || "").toLowerCase();
    const aliases = new Set(['description','descricao','date','data','amount','valor','source_id','fitid','origin_type','type','tipo']);
    const extra = Object.fromEntries(Object.entries(r).filter(([key]) => !aliases.has(key)));
    return { description, date, value, fingerprint, sourceKind, source: r.source_id,
      canonical: { ...extra, description: normalizedDescription(description), date, amount: money(value), source_id: r.source_id, type: sourceKind } };
  });
  const fileHash = canonicalImportFileHash(normalized.map(row => row.canonical));
  return normalized.map((r, index) => {
    const { description, date, value, fingerprint, sourceKind } = r;
    const occurrence = (occurrences.get(fingerprint) ?? 0) + 1; occurrences.set(fingerprint, occurrence);
    const source_id = r.source || `finora-v3:${fileHash}:${fingerprint}:${occurrence}`;
    const type = sourceKind === "yield" ? "yield" : sourceKind === "adjustment" ? "adjustment" : D(value).lt(0) ? "expense" : "income";
    let suggested_classification: ImportClassification = type;
    if (["xfer", "transfer"].includes(sourceKind)) suggested_classification = "transfer";
    else if (["payment", "invoice_payment"].includes(sourceKind)) suggested_classification = "invoice_payment";
    else if (["investment", "redemption", "savings_deposit", "savings_withdraw"].includes(sourceKind)) suggested_classification = "match";
    else if (sourceKind === "card_installment") suggested_classification = "skip";
    return { description, date, amount: D(value).abs().toFixed(2), type, source_id,
      signed_amount: money(value), fingerprint, identity_kind: r.source ? "source" : "fingerprint", can_force_new: !r.source,
      row_id: hash(`${source_id}|${index}`).slice(0, 24), suggested_classification,
      requires_review: !["income", "expense", "yield", "adjustment"].includes(suggested_classification),
      possible_duplicate: !r.source && occurrence > 1,
    };
  });
}
