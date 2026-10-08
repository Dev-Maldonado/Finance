import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticatedDb } from "@/lib/server";
import { sameOrigin, fail } from "@/lib/http";
import { operationSchemas } from "@/lib/resources";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const { db } = await authenticatedDb();
    const body = await req.json();
    const { data, error } = await db.rpc("revise_transaction", {
      transaction_id: z.uuid().parse(body.transaction_id),
      replacement: body.cancel
        ? {}
        : operationSchemas.transaction.parse(body.replacement),
      cancel: body.cancel === true,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ id: data });
  } catch (e) {
    return fail(e);
  }
}
