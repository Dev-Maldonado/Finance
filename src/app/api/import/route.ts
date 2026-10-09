import { NextResponse } from "next/server";
import { authenticatedDb } from "@/lib/server";
import { fail, sameOrigin } from "@/lib/http";
import { prepareImportRows, scopedSource, transactionFingerprint, importRequestId, forceNewImportSource } from "@/lib/import";
import { D } from "@/financial/engine";
import { z } from "zod";
const decisionSchema = z.object({
  row_id: z.string().min(1).max(100),
  classification: z.enum(["income", "expense", "yield", "adjustment", "transfer", "invoice_payment", "savings_deposit", "savings_withdraw", "match", "skip", "keep"]),
  category_id: z.uuid().optional(), counter_account_id: z.uuid().optional(), invoice_id: z.uuid().optional(), goal_id: z.uuid().optional(), transaction_id: z.uuid().optional(),
  force_new: z.boolean().default(false),
});
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const { db, user } = await authenticatedDb();
    const body = z.object({ text: z.string().max(2_000_000), format: z.enum(["csv", "ofx"]), account_id: z.uuid(), confirm: z.boolean().default(false), target: z.enum(["transactions", "investments"]).default("transactions"), decisions: z.array(decisionSchema).max(5000).optional(), request_id: z.uuid().optional() }).parse(await req.json());
    const { data: account, error: accountError } = await db.from("financial_accounts").select("id,kind,archived").eq("id", body.account_id).eq("user_id", user.id).single();
    if (accountError || !account || account.kind === "savings" || account.archived) throw new Error("Selecione uma conta ativa de sua titularidade");
    if (body.target === "investments") throw new Error("Registre as compras no controle manual de investimentos");
    const parsed = prepareImportRows(body.text, body.format);
    if (parsed.length > 5000) throw new Error("Limite de 5000 linhas por arquivo");
    if (!parsed.length) return NextResponse.json(body.confirm ? { imported: 0, duplicates: 0, matched: 0 } : { rows: [] });
    const first = parsed.map(r => r.date).sort()[0], last = parsed.map(r => r.date).sort().at(-1)!;
    const existing: { id: string; source_id: string | null; description: string; date: string; amount: string; type: string; group_id: string | null }[] = [];
    for (let offset = 0; offset < 100000; offset += 1000) {
      const { data, error } = await db.from("transactions").select("id,source_id,description,date,amount::text,type,group_id").eq("account_id", body.account_id).eq("status", "confirmed").gte("date", first).lte("date", last).order("id").range(offset, offset + 999);
      if (error) throw new Error(error.message);
      existing.push(...data);
      if (data.length < 1000) break;
      if (offset === 99000) throw new Error("Divida o arquivo em períodos menores para revisar o histórico completo");
    }
    const ids = new Set(existing.map(r => r.source_id));
    const scopedIds = [...new Set(parsed.map(r => scopedSource(body.account_id, r.source_id)))];
    for (let offset = 0; offset < scopedIds.length; offset += 200) {
      const { data, error } = await db.from("import_links").select("source_id").eq("account_id", body.account_id).in("source_id", scopedIds.slice(offset, offset + 200));
      if (error) throw new Error(error.message);
      data.forEach(row => ids.add(row.source_id));
    }
    const seen = new Set<string>();
    const prepared = parsed.map(row => {
      const source_id = scopedSource(body.account_id, row.source_id);
      const duplicate = ids.has(source_id) || seen.has(source_id); seen.add(source_id);
      const candidates = existing.filter(t => t.date === row.date && D(t.amount).eq(row.signed_amount) && (transactionFingerprint(t.description, t.date, t.amount) === row.fingerprint || !!t.group_id || ["invoice_payment", "investment", "redemption"].includes(t.type)));
      const possible_duplicate = !duplicate && (Boolean(row.possible_duplicate) || candidates.length > 0);
      return { ...row, source_id, duplicate, possible_duplicate, requires_review: !duplicate && (row.requires_review || possible_duplicate), matching_transactions: candidates.map(t => ({ id: t.id, description: t.description, date: t.date, amount: t.amount, type: t.type })) };
    });
    if (!body.confirm) return NextResponse.json({ rows: prepared });
    const decisions = new Map((body.decisions ?? []).map(d => [d.row_id, d]));
    if (decisions.size !== (body.decisions?.length ?? 0)) throw new Error("Cada linha deve ter uma única decisão");
    if ([...decisions.keys()].some(id => !prepared.some(row => row.row_id === id))) throw new Error("A prévia mudou; gere novamente antes de confirmar");
    const matchedIds = new Set<string>();
    let skipped = 0;
    const items = prepared.flatMap(row => {
      const choice = decisions.get(row.row_id);
      const source = choice?.force_new ? forceNewImportSource(row.source_id, row.identity_kind, body.request_id) : row.source_id;
      if (row.duplicate && !choice?.force_new) return [];
      if (row.requires_review && !choice) throw new Error("Revise os possíveis duplicados e movimentos vinculados antes de confirmar");
      const classification = choice?.classification ?? row.suggested_classification;
      if (classification === "skip") { skipped++; return []; }
      if (classification === "keep") throw new Error("Classifique o movimento de caixa antes de confirmar");
      if (classification === "transfer" && !choice?.counter_account_id) throw new Error("Informe a outra conta da transferência");
      if (classification === "invoice_payment" && !choice?.invoice_id) throw new Error("Selecione a fatura que recebeu o pagamento");
      if (["savings_deposit", "savings_withdraw"].includes(classification) && !choice?.goal_id) throw new Error("Selecione a caixinha desse movimento");
      if (classification === "match") {
        if (choice?.force_new) throw new Error("Registrar um lançamento novo não pode ser combinado com conciliar um existente");
        if (!choice?.transaction_id) throw new Error("Selecione o lançamento já registrado para conciliar");
        if (matchedIds.has(choice.transaction_id)) throw new Error("Duas linhas do arquivo não podem representar o mesmo lançamento");
        matchedIds.add(choice.transaction_id);
      }
      if (["income", "yield", "savings_withdraw"].includes(classification) && D(row.signed_amount).lte(0)) throw new Error("Essa classificação exige uma entrada positiva no extrato");
      if (["expense", "invoice_payment", "savings_deposit"].includes(classification) && D(row.signed_amount).gte(0)) throw new Error("Essa classificação exige uma saída negativa no extrato");
      return [{ account_id: body.account_id, source_id: source, request_id: importRequestId(`classified|${user.id}|${source}`), description: row.description, date: row.date, amount: row.signed_amount, classification, ...choice, row_id: undefined, force_new: undefined }];
    });
    const duplicates = prepared.filter(row => row.duplicate && !decisions.get(row.row_id)?.force_new).length;
    if (!items.length) return NextResponse.json({ imported: 0, duplicates, matched: 0, skipped });
    const { data, error } = await db.rpc("import_classified_transactions", { items });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ...data, duplicates: Number(data.duplicates ?? 0) + duplicates, skipped });
  } catch (error) { return fail(error); }
}
