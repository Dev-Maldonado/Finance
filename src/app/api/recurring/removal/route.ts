import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticatedDb } from '@/lib/server';
import { sameOrigin, fail } from '@/lib/http';
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const body = z.object({recurrence_id:z.uuid().nullable().default(null),transaction_id:z.uuid().nullable().default(null),include_history:z.boolean().default(false),request_id:z.uuid()}).strict().refine(v=>Boolean(v.recurrence_id)!==Boolean(v.transaction_id), 'Selecione somente uma recorrência ou ocorrência').parse(await req.json());
    const {db}=await authenticatedDb();
    const {data,error}=await db.rpc('remove_recurring_records',body);
    if(error)throw Error(error.message);
    return NextResponse.json({id:data});
  }catch(e){return fail(e);}
}
