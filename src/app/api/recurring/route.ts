import { NextResponse } from "next/server";
import { authenticatedDb } from "@/lib/server";
import { sameOrigin, fail } from "@/lib/http";
import { z } from "zod";
import { schemas } from "@/lib/resources";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const { db } = await authenticatedDb();
    const body = z.object({ recurrence_id: z.uuid().optional(), replacement: z.unknown().optional(), cancel: z.boolean().default(false) }).parse(await req.json());
    if (body.recurrence_id) {
      const { data, error } = await db.rpc("revise_recurring", { recurrence_id: body.recurrence_id, replacement: body.cancel ? {} : schemas.recurring_transactions.parse(body.replacement), cancel: body.cancel });
      if (error) throw new Error(error.message);
      return NextResponse.json({ id: data });
    }
    if (body.cancel || body.replacement) throw new Error("Informe a recorrência a atualizar");
    const { data, error } = await db.rpc("generate_recurring", {
      until_date: new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
      }).format(new Date()),
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ generated: data });
  } catch (e) {
    return fail(e);
  }
}
