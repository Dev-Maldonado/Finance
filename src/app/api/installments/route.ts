import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticatedDb } from "@/lib/server";
import { fail, sameOrigin } from "@/lib/http";
import { amount } from "@/lib/resources";

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const { db } = await authenticatedDb();
    const body = z.object({ installment_id: z.uuid(), replacement: z.object({ amount, notes: z.string().max(1000).optional() }), request_id: z.uuid() }).parse(await req.json());
    const { data, error } = await db.rpc("revise_card_installment", body);
    if (error) throw new Error(error.message);
    return NextResponse.json({ id: data });
  } catch (error) {
    return fail(error);
  }
}
