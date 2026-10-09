import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticatedDb } from "@/lib/server";
import { sameOrigin, fail } from "@/lib/http";

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const { db } = await authenticatedDb();
    const body = z.object({ obligation_id: z.uuid(), cancel: z.literal(true) }).parse(await req.json());
    const { data, error } = await db.rpc("cancel_obligation_payment", { obligation_id: body.obligation_id });
    if (error) throw new Error(error.message);
    return NextResponse.json({ id: data });
  } catch (error) { return fail(error); }
}
