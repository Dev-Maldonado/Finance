import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticatedDb } from '@/lib/server';
import { fail, sameOrigin } from '@/lib/http';
export async function POST(req:Request) {
 try {
  sameOrigin(req);const {db}=await authenticatedDb();
  const body=z.object({transaction_id:z.uuid().nullable().default(null),recurrence_id:z.uuid().nullable().default(null),occurrence_date:z.iso.date().nullable().default(null),obligation_id:z.uuid().nullable().default(null),account_id:z.uuid(),settled_on:z.iso.date(),request_id:z.uuid()}).parse(await req.json());
  if([body.transaction_id,body.recurrence_id,body.obligation_id].filter(Boolean).length!==1)throw Error('Selecione somente um compromisso.');
  const {data,error}=await db.rpc('settle_financial_entry',body);if(error)throw Error(error.message);return NextResponse.json({id:data});
 }catch(error){return fail(error);}
}
