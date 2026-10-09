import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCsv, decimalInput, realDate, importRequestId, canonicalImportFileHash, forceNewImportSource } from "./import";
import { operationSchemas } from "./resources";
import { D, money } from "@/financial/engine";
type Decision = { row_id: string; classification: string; force_new?: boolean };
export async function investmentImport(db: SupabaseClient, text: string, account_id: string, confirm: boolean, decisions?: Decision[], confirmationId?: string) {
  const assets: { id: string; ticker: string; currency: string }[] = [];
  for (let offset = 0; offset < 100000; offset += 1000) {
    const { data, error } = await db.from("investment_assets").select("id,ticker,currency").order("id").range(offset, offset + 999);
    if (error) throw new Error(error.message);
    assets.push(...data);
    if (data.length < 1000) break;
    if (offset === 99000) throw new Error("Volume de ativos excede o limite de importação");
  }
  const input = parseCsv(text, text.split("\n")[0].includes(";") ? ";" : ",");
  if (input.length > 1000) throw new Error("Máximo de 1000 operações por arquivo");
  const occurrences = new Map<string, number>(), seen = new Set<string>();
  const fileHash = canonicalImportFileHash(input.map(r => ({ ...r, ticker: (r.ticker || "").toUpperCase(), type: (r.type || "").toLowerCase(), quantity: D(decimalInput(r.quantity, 8)).toString(), price: D(decimalInput(r.price, 8)).toString(), fees: money(decimalInput(r.fees || "0")), date: realDate(r.date), broker: r.broker || "" })));
  const rows = input.map((r, index) => {
    const ticker = (r.ticker ?? "").trim().toUpperCase();
    const asset = assets.find(a => a.ticker.toUpperCase() === ticker);
    if (!asset) throw new Error(`Cadastre o ativo da linha ${index + 2}: ${ticker}`);
    const payload = operationSchemas.investment.parse({ asset_id: asset.id, account_id, type: r.type?.toLowerCase(), quantity: decimalInput(r.quantity, 8), price: decimalInput(r.price, 8), fees: decimalInput(r.fees || "0"), date: realDate(r.date), broker: r.broker || "" });
    if (asset.currency !== "BRL") throw new Error("Importação cambial ainda não suportada");
    const identity = [ticker, payload.type, D(payload.quantity).toString(), D(payload.price).toString(), money(payload.fees), payload.date, payload.broker].join("|");
    const occurrence = (occurrences.get(identity) ?? 0) + 1; occurrences.set(identity, occurrence);
    const origin = r.source_id || `finora-v3:${fileHash}:${identity}:${occurrence}`;
    const request_id = importRequestId(account_id + "|investment-import|" + origin);
    const legacy_request_id = importRequestId(account_id + "|investment-import|" + (r.source_id || identity));
    const previous_request_id = importRequestId(account_id + "|investment-import|" + `finora-v2:${identity}:${occurrence}`);
    const duplicate = seen.has(request_id); seen.add(request_id);
    const total = D(payload.quantity).mul(payload.price).toDecimalPlaces(2);
    const net = payload.type === "buy" ? total.plus(payload.fees).neg() : total.minus(payload.fees);
    if (net.eq(0)) throw new Error(`Valor líquido zero na linha ${index + 2}`);
    return { ticker, type: payload.type, description: `${payload.type === "buy" ? "Compra" : "Venda"} ${payload.quantity} ${ticker}`, date: payload.date, amount: money(net), signed_amount: money(net), total: money(total), quantity: payload.quantity, price: payload.price, fees: payload.fees, request_id, row_id: `${request_id}:${index}`, legacy_request_id, previous_request_id, identity_kind: r.source_id ? "source" : "fingerprint", can_force_new: !r.source_id, payload, duplicate, possible_duplicate: !r.source_id && occurrence > 1, requires_review: !r.source_id && occurrence > 1 };
  });
  const ids = new Set<string>();
  const candidates = [...new Set(rows.flatMap(r => [r.request_id, r.legacy_request_id, r.previous_request_id]))];
  for (let offset = 0; offset < candidates.length; offset += 200) {
    const { data, error } = await db.from("operation_requests").select("request_id").in("request_id", candidates.slice(offset, offset + 200));
    if (error) throw new Error(error.message);
    data.forEach(r => ids.add(r.request_id));
  }
  const operations: {asset_id:string; type:string; quantity:string; price:string; fees:string; date:string; broker:string}[] = [];
  if (rows.length) {
    const first = rows.map(r => r.date).sort()[0], last = rows.map(r => r.date).sort().at(-1)!;
    for (let offset = 0; offset < 100000; offset += 1000) {
      const {data, error} = await db.from("investment_operations").select("asset_id,type,quantity::text,price::text,fees::text,date,broker").eq("account_id", account_id).eq("status", "confirmed").gte("date", first).lte("date", last).order("id").range(offset, offset+999);
      if(error) throw new Error(error.message);
      operations.push(...data);
      if(data.length<1000) break;
      if(offset===99000) throw new Error("Divida o arquivo para revisar as operações existentes");
    }
  }
  for (const row of rows) {
    row.duplicate ||= ids.has(row.request_id);
    const legacy = !row.duplicate && (ids.has(row.legacy_request_id) || ids.has(row.previous_request_id));
    row.possible_duplicate ||= legacy || operations.some(o => o.asset_id===row.payload.asset_id && o.type===row.type && o.date===row.date && D(o.quantity).eq(row.quantity) && D(o.price).eq(row.price) && D(o.fees).eq(row.fees) && (o.broker || "")===row.payload.broker); row.requires_review = !row.duplicate && row.possible_duplicate;
  }
  if (!confirm) return { rows: rows.map(({ legacy_request_id: _legacy, previous_request_id: _previous, ...row }) => row) };
  const choices = new Map((decisions ?? []).map(d => [d.row_id, d]));
  if (choices.size !== (decisions?.length ?? 0) || [...choices.keys()].some(id => !rows.some(r => r.row_id === id))) throw new Error("Gere novamente a prévia antes de confirmar");
  let skipped = 0;
  const items = rows.flatMap(row => {
    const decision = choices.get(row.row_id);
    if (row.duplicate && !decision?.force_new) return [];
    const choice = decision?.classification;
    const request_id = decision?.force_new ? importRequestId(forceNewImportSource(row.request_id, row.identity_kind, confirmationId)) : row.request_id;
    if (row.requires_review && !choice) throw new Error("Revise as ordens iguais ou já existentes antes de confirmar");
    if (choice === "skip") { skipped++; return []; }
    if (choice && choice !== "keep") throw new Error("Escolha importar ou ignorar cada operação de investimento");
    return [{ request_id, payload: row.payload }];
  });
  if (!items.length) return { imported: 0, duplicates: rows.filter(r => r.duplicate && !choices.get(r.row_id)?.force_new).length, skipped };
  const { data, error } = await db.rpc("import_investment_operations", { items });
  if (error) throw new Error(error.message);
  const imported = typeof data === "number" ? data : Number(data?.imported ?? 0);
  return { imported, duplicates: rows.filter(r => r.duplicate && !choices.get(r.row_id)?.force_new).length + items.length - imported, skipped };
}
