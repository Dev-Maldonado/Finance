import { NextResponse } from 'next/server';
import { authenticatedDb } from '@/lib/server';
import { fail, sameOrigin } from '@/lib/http';
import { quotedClasses, syncQuotes, QuoteConfigurationError } from '@/integrations/quote-sync';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const { db } = await authenticatedDb();
    // RLS selects only the caller's registered assets; no client-supplied ticker list.
    const { data, error } = await db.from('investment_assets').select('ticker,asset_class,currency').in('asset_class', quotedClasses);
    if (error) throw new Error('Não foi possível consultar sua carteira');
    try {
      const status = await syncQuotes(data ?? []);
      return NextResponse.json(status, { status: status.results.some(r => r.status === 'error') ? 503 : 200, headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      return NextResponse.json({ error: error instanceof QuoteConfigurationError ? error.message : 'Não foi possível atualizar as cotações. Dados anteriores preservados.' }, { status: 503 });
    }
  } catch (error) { return fail(error); }
}
