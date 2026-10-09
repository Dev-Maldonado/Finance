import { NextResponse } from 'next/server';
import { loadEconomicIndicators } from '@/integrations/economic-indicators';
import { authenticatedDb } from '@/lib/server';
import { fail } from '@/lib/http';
export const maxDuration=30;
export async function GET() {
 try {await authenticatedDb();return NextResponse.json(await loadEconomicIndicators(),{headers:{'Cache-Control':'no-store'}});}
 catch(error){return fail(error);}
}
