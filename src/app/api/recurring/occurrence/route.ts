import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticatedDb } from '@/lib/server';
import { fail, sameOrigin } from '@/lib/http';
import { amount } from '@/lib/resources';
const date = z.iso.date();

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const { db } = await authenticatedDb();
    const body = z.object({
      recurrence_id: z.uuid(), occurrence_date: date,
      scope: z.enum(['occurrence', 'future']), cancel: z.boolean(), request_id: z.uuid(),
      replacement: z.object({ description: z.string().trim().min(1).max(200), amount, date,
        account_id: z.uuid(), category_id: z.uuid().nullable().optional() }).optional(),
    }).parse(await req.json());
    if (!body.cancel && !body.replacement) throw Error('Informe os dados da despesa.');
    const { data, error } = await db.rpc('revise_recurring_occurrence', { ...body, replacement: body.cancel ? {} : body.replacement });
    if (error) throw Error(error.message);
    return NextResponse.json({ id: data });
  } catch (error) { return fail(error); }
}
