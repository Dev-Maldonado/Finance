import { NextResponse } from "next/server";
import { authenticatedDb } from "@/lib/server";
import { fail, sameOrigin } from "@/lib/http";
import { z } from "zod";
import { ManualPriceProvider } from "@/integrations/providers";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const { db } = await authenticatedDb();
    const body = z
      .object({ asset_id: z.uuid(), price: z.string(), date: z.iso.date() })
      .parse(await req.json());
    const { data: asset, error } = await db
      .from("investment_assets")
      .select("ticker,currency")
      .eq("id", body.asset_id)
      .single();
    if (error) throw new Error(error.message);
    const quote = new ManualPriceProvider().getQuote(
      asset.ticker,
      body.price,
      body.date,
      asset.currency,
    );
    const { error: e } = await db
      .from("manual_asset_prices")
      .upsert(
        { ...quote, asset_id: body.asset_id, collected_at: new Date().toISOString() },
        { onConflict: "asset_id,date" },
      );
    if (e) throw new Error(e.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
