import { XMLParser } from "fast-xml-parser";
import { createHash } from "node:crypto";
export function parseCsv(
  text: string,
  delimiter = ",",
): Record<string, string>[] {
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
  type: "income" | "expense";
  source_id: string;
  duplicate?: boolean;
};
export function parseTransactions(
  text: string,
  format: "csv" | "ofx",
): ImportRow[] {
  if (format === "csv")
    return parseCsv(text, text.split("\n")[0].includes(";") ? ";" : ",").map(
      (r, index) => {
        const value = r.amount?.replace(",", ".");
        if (!/^-?\d+(\.\d{1,2})?$/.test(value ?? "") || Number(value) === 0)
          throw new Error(`Valor inválido na linha ${index + 2}`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date))
          throw new Error("Data deve ser AAAA-MM-DD");
        return {
          description: r.description || "Importação",
          date: r.date,
          amount: value.replace("-", ""),
          type: value.startsWith("-") ? "expense" : "income",
          source_id:
            r.source_id ||
            createHash("sha256").update(JSON.stringify(r)).digest("hex"),
        };
      },
    );
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
  return (Array.isArray(list) ? list : [list]).map((r) => {
    const value = String(r.TRNAMT),
      d = String(r.DTPOSTED).slice(0, 8);
    if (!/^-?\d+(\.\d{1,2})?$/.test(value) || !/^\d{8}$/.test(d) || !r.FITID)
      throw new Error("Transação OFX inválida");
    return {
      description: r.MEMO || r.NAME || "Importação OFX",
      date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
      amount: value.replace("-", ""),
      type: value.startsWith("-") ? "expense" : "income",
      source_id: String(r.FITID),
    };
  });
}
