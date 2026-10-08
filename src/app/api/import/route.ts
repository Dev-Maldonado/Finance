import { investmentImport } from "@/lib/investment-import";
import { NextResponse } from "next/server";
import { authenticatedDb } from "@/lib/server";
import { fail, sameOrigin } from "@/lib/http";
import { parseTransactions } from "@/lib/import";
import { z } from "zod";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const { db } = await authenticatedDb();
    const body = z
      .object({
        text: z.string().max(2_000_000),
        format: z.enum(["csv", "ofx"]),
        account_id: z.uuid(),
        confirm: z.boolean().default(false),
        target: z.enum(["transactions", "investments"]).default("transactions"),
      })
      .parse(await req.json());
    if (body.target === "investments") {
      if (body.format !== "csv")
        throw new Error("Operações de investimento exigem CSV");
      return NextResponse.json(
        await investmentImport(db, body.text, body.account_id, body.confirm),
      );
    }
    const { data: existing, error } = await db
      .from("transactions")
      .select("source_id")
      .eq("account_id", body.account_id);
    if (error) throw error;
    const ids = new Set(existing?.map((r) => r.source_id));
    const seen = new Set<string>();
    const rows = parseTransactions(body.text, body.format).map((r) => {
      const source_id = `${body.account_id}:${r.source_id}`;
      const duplicate = ids.has(source_id) || seen.has(source_id);
      seen.add(source_id);
      return { ...r, source_id, duplicate };
    });
    if (rows.length > 5000)
      throw new Error("Limite de 5000 linhas por arquivo");
    if (!body.confirm) return NextResponse.json({ rows });
    const values = rows
      .filter((r) => !r.duplicate)
      .map((r) => ({
        account_id: body.account_id,
        description: r.description,
        date: r.date,
        type: r.type,
        amount: r.type === "expense" ? `-${r.amount}` : r.amount,
        source_id: r.source_id,
      }));
    if (values.length) {
      const { error: e } = await db.from("transactions").insert(values);
      if (e) throw new Error(e.message);
    }
    return NextResponse.json({
      imported: values.length,
      duplicates: rows.length - values.length,
    });
  } catch (e) {
    return fail(e);
  }
}
