import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { authenticatedDb } from '@/lib/server';
import { fail, sameOrigin } from '@/lib/http';
import { syncBenchmarks, BenchmarkConfigurationError } from '@/integrations/benchmark-sync';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';
async function update() {
  try {
    const results = await syncBenchmarks();
    return NextResponse.json({ checkedAt: new Date().toISOString(), results }, { status: results.some(r => r.status === 'error') ? 503 : 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof BenchmarkConfigurationError ? error.message : 'Falha interna ao verificar os indexadores. O último histórico válido foi preservado.' }, { status: 503 });
  }
}
// Vercel Cron sends an authenticated GET. No browser session is used by this job.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!secret || Buffer.byteLength(token) !== Buffer.byteLength(secret) || !timingSafeEqual(Buffer.from(token), Buffer.from(secret))) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  return update();
}
// Refresh-on-open also works when the hosting plan has no scheduler enabled.
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await authenticatedDb();
    return await update();
  } catch (e) { return fail(e); }
}
