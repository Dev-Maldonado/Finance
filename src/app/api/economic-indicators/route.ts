import { NextResponse } from 'next/server';
import { cachedEconomicIndicators } from '@/integrations/economic-cache';
import { createClient } from '@supabase/supabase-js';
import { requireSupabasePublicConfig } from '@/lib/supabase-config';
import { authenticatedDb } from '@/lib/server';
import { fail } from '@/lib/http';
export const maxDuration=30;
export async function GET(req:Request) {
 try {const {db}=await authenticatedDb();const key=process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();const writer=key?createClient(requireSupabasePublicConfig().url,key,{auth:{persistSession:false}}):null;return NextResponse.json(await cachedEconomicIndicators(db,writer,new URL(req.url).searchParams.get('refresh')==='1'),{headers:{'Cache-Control':'no-store'}});}
 catch(error){return fail(error);}
}
