import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { authenticatedDb } from '@/lib/server';
import { fail, sameOrigin } from '@/lib/http';
import { syncBenchmarks, BenchmarkConfigurationError } from '@/integrations/benchmark-sync';
import { within } from '@/integrations/deadline';
import { syncRecurring } from '@/integrations/recurring-sync';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';
async function update(daily = false) {
  try {
    const [benchmarks, scheduled] = await Promise.allSettled([syncBenchmarks(), daily ? syncRecurring() : Promise.resolve(null)]);
    if (benchmarks.status === 'rejected') throw benchmarks.reason;
    const results = benchmarks.value;
    const recurring = scheduled.status === 'fulfilled' ? scheduled.value : { error: 'Falha na geração de recorrências previstas; pagamentos preservados.' };
    return NextResponse.json({ checkedAt: new Date().toISOString(), results, ...(daily ? { recurring } : {}) }, { status: results.some(r => r.status === 'error') || scheduled.status === 'rejected' ? 503 : 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof BenchmarkConfigurationError ? error.message : 'Falha interna ao verificar os indexadores. O último histórico válido foi preservado.' }, { status: 503 });
  }
}
// Vercel Cron sends an authenticated GET. No browser session is used by this job.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!secret || Buffer.byteLength(token) !== Buffer.byteLength(secret) || !timingSafeEqual(Buffer.from(token), Buffer.from(secret))) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  return update(true);
}
// Refresh-on-open also works when the hosting plan has no scheduler enabled.
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await within(authenticatedDb(), AbortSignal.timeout(7000));
    return await update();
  } catch (e) { return fail(e); }
}
