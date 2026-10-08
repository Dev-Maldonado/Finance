import { NextResponse } from "next/server";
import { authenticatedDb } from "@/lib/server";
import { sameOrigin, fail } from "@/lib/http";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const { db } = await authenticatedDb();
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
