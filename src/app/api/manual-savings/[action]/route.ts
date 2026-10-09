import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticatedDb } from '@/lib/server';
import { sameOrigin, fail } from '@/lib/http';
import { schemas } from '@/lib/resources';
const money = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, 'Use um valor em reais com até duas casas decimais');
const common = { request_id: z.uuid(), id: z.uuid().optional() };
const flow = z.object({ ...common, goal_id: z.uuid(), account_id: z.uuid(), amount: money, date: z.iso.date() });
const inputs = {
 create: schemas.savings_goals.extend({ ...common, initial_balance: money.default('0'), account_id: z.union([z.uuid(),z.literal('')]).optional(), date: z.iso.date() }),
 deposit: flow, withdraw: flow.extend({ir_amount:money.default('0'),iof_amount:money.default('0')}),
 balance: z.object({ ...common, goal_id: z.uuid(), balance: money, date: z.iso.date() }),
 'balance-delete': z.object({ ...common, id: z.uuid() }),
};
export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
 try {
  sameOrigin(req); const { action } = await params;
  if (!Object.hasOwn(inputs,action)) throw new Error('Operação inválida');
  const { db } = await authenticatedDb();
  const { request_id, ...payload } = inputs[action as keyof typeof inputs].parse(await req.json());
  const { data,error } = await db.rpc('manual_savings_operation',{ action,payload,request_id });
  if (error) throw new Error(error.message);
  return NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});
 } catch(error) { return fail(error); }
}
