import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticatedDb } from "@/lib/server";
import { sameOrigin, fail } from "@/lib/http";
import { schemas } from "@/lib/resources";

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const { db } = await authenticatedDb();
    const body = z.object({ income_id: z.uuid(), replacement: z.unknown().optional(), cancel: z.boolean().default(false) }).parse(await req.json());
    const replacement = body.cancel ? {} : schemas.investment_income.extend({ account_id: z.uuid().optional() }).parse(body.replacement);
    const { data, error } = await db.rpc("revise_income", { income_id: body.income_id, replacement, cancel: body.cancel });
    if (error) throw new Error(error.message);
    return NextResponse.json({ id: data });
  } catch (error) { return fail(error); }
}
