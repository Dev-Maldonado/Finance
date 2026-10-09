import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { syncMarket, MarketConfigurationError } from "@/integrations/sync";
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (
    !secret ||
    Buffer.byteLength(token) !== Buffer.byteLength(secret) ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(secret))
  )
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const results = await syncMarket();
    const failed = results.some(r => r.status === 'error' || r.status === 'partial');
    return NextResponse.json(results, { status: failed ? 503 : 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof MarketConfigurationError ? error.message : 'Falha interna na sincronização de mercado. Dados anteriores preservados.' },
      { status: 503 },
    );
  }
}
