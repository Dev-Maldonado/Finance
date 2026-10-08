import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { syncMarket } from "@/integrations/sync";
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (
    !secret ||
    Buffer.byteLength(token) !== Buffer.byteLength(secret) ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(secret))
  )
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    return NextResponse.json(await syncMarket());
  } catch {
    return NextResponse.json(
      { error: "Sincronização não configurada" },
      { status: 503 },
    );
  }
}
