import { NextResponse } from "next/server";
import { authenticatedDb } from "@/lib/server";
import { fail, sameOrigin } from "@/lib/http";
import { loadSnapshot } from "@/lib/snapshot-server";
import { financialSummary } from "@/lib/summary";
export async function GET() {
  try {
    const { db, user } = await authenticatedDb();
    return NextResponse.json(await loadSnapshot(db, user), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const { db, user } = await authenticatedDb();
    const snapshot = await loadSnapshot(db, user);
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date());
    const summary = financialSummary(snapshot, today, today);
    const { error } = await db.from("net_worth_snapshots").upsert(
      {
        user_id: user.id,
        date: today,
        assets: summary.assets,
        liabilities: summary.liability,
        source: "registered_snapshot",
      },
      { onConflict: "user_id,date" },
    );
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, position: { date: today, assets: summary.assets, liabilities: summary.liability } });
  } catch (e) {
    return fail(e);
  }
}
