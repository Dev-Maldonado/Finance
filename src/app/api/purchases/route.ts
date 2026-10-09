import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticatedDb } from "@/lib/server";
import { sameOrigin, fail } from "@/lib/http";
import { operationSchemas } from "@/lib/resources";

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const { db } = await authenticatedDb();
    const body = z.object({ purchase_id: z.uuid(), replacement: z.unknown().optional(), cancel: z.boolean().default(false) }).parse(await req.json());
    const cancel = body.cancel === true;
    const { data, error } = await db.rpc("revise_card_purchase", {
      purchase_id: z.uuid().parse(body.purchase_id),
      replacement: cancel ? {} : operationSchemas.purchase.parse(body.replacement),
      cancel,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ id: data });
  } catch (e) {
    return fail(e);
  }
}
