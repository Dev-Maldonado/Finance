import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticatedDb } from "@/lib/server";
import { sameOrigin, fail } from "@/lib/http";
import { operationSchemas } from "@/lib/resources";

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const { db } = await authenticatedDb();
    const body = z.object({ operation_id: z.uuid(), replacement: z.unknown().optional(), cancel: z.boolean().default(false) }).parse(await req.json());
    const replacement = body.cancel ? {} : operationSchemas.investment.parse(body.replacement);
    const { data, error } = await db.rpc("revise_investment", { operation_id: body.operation_id, replacement, cancel: body.cancel });
    if (error) throw new Error(error.message);
    return NextResponse.json({ id: data });
  } catch (error) { return fail(error); }
}
