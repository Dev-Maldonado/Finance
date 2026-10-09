import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticatedDb } from "@/lib/server";
import { sameOrigin, fail } from "@/lib/http";

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const { db } = await authenticatedDb();
    const body = z.object({ operation_group: z.uuid(), cancel: z.literal(true) }).parse(await req.json());
    const { data, error } = await db.rpc("cancel_savings_operation", { operation_group: body.operation_group });
    if (error) throw new Error(error.message);
    return NextResponse.json({ id: data });
  } catch (error) { return fail(error); }
}
