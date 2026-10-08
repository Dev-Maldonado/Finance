import { NextResponse } from "next/server";
import { authenticatedDb } from "@/lib/server";
import { fail } from "@/lib/http";
import { z } from "zod";
import { BrapiProvider } from "@/integrations/providers";
export async function GET(req: Request) {
  try {
    const { db } = await authenticatedDb();
    const params = new URL(req.url).searchParams;
    const query = z
      .string()
      .min(2)
      .max(60)
      .regex(/^[\p{L}\p{N} .\/-]+$/u)
      .parse(params.get("query"));
    if (params.get("kind") === "market")
      return NextResponse.json({
        results: await new BrapiProvider().searchAssets(query),
        source: "brapi",
      });
    const safe = query.replace(/[%_,]/g, "").replace(/\./g, "");
    const { data, error } = await db
      .from("fund_registry")
      .select("*")
      .or(`name.ilike.*${safe}*,cnpj.ilike.*${safe}*`)
      .limit(20);
    if (error) throw new Error(error.message);
    return NextResponse.json({ results: data, source: "CVM cadastro" });
  } catch (e) {
    return fail(e);
  }
}
