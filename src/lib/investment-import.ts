import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCsv } from "./import";
import { operationSchemas } from "./resources";
function requestId(value: string) {
  const h = createHash("sha256")
    .update(value)
    .digest("hex")
    .slice(0, 32)
    .split("");
  h[12] = "8";
  h[16] = "8";
  const s = h.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
export async function investmentImport(
  db: SupabaseClient,
  text: string,
  account_id: string,
  confirm: boolean,
) {
  const { data: assets, error } = await db
    .from("investment_assets")
    .select("id,ticker,currency");
  if (error) throw new Error(error.message);
  const input = parseCsv(text, text.split("\n")[0].includes(";") ? ";" : ",");
  if (input.length > 1000)
    throw new Error("Máximo de 1000 operações por arquivo");
  const seen = new Set<string>();
  const rows = input.map((r, index) => {
    const asset = assets?.find((a) => a.ticker === r.ticker);
    if (!asset)
      throw new Error(`Cadastre o ativo da linha ${index + 2}: ${r.ticker}`);
    const payload = operationSchemas.investment.parse({
      asset_id: asset.id,
      account_id,
      type: r.type,
      quantity: r.quantity?.replace(",", "."),
      price: r.price?.replace(",", "."),
      fees: (r.fees || "0").replace(",", "."),
      date: r.date,
      broker: r.broker || "",
    });
    if (asset.currency !== "BRL")
      throw new Error("Importação cambial ainda não suportada");
    const identity =
      r.source_id ||
      [
        r.ticker,
        payload.type,
        payload.quantity,
        payload.price,
        payload.fees,
        payload.date,
        payload.broker,
      ].join("|");
    const request_id = requestId(account_id + "|investment-import|" + identity);
    const duplicate = seen.has(request_id);
    seen.add(request_id);
    return {
      ticker: r.ticker,
      description: `${r.type} ${r.quantity} ${r.ticker}`,
      date: payload.date,
      amount: payload.price,
      quantity: payload.quantity,
      request_id,
      payload,
      duplicate,
    };
  });
  const { data: existing, error: e } = await db
    .from("operation_requests")
    .select("request_id");
  if (e) throw new Error(e.message);
  const ids = new Set(existing?.map((r) => r.request_id));
  for (const row of rows) row.duplicate ||= ids.has(row.request_id);
  if (!confirm) return { rows };
  const items = rows
    .filter((r) => !r.duplicate)
    .map((r) => ({ request_id: r.request_id, payload: r.payload }));
  const { data, error: err } = await db.rpc("import_investment_operations", {
    items,
  });
  if (err) throw new Error(err.message);
  return { imported: data, duplicates: rows.length - items.length };
}
