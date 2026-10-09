import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticatedDb } from '@/lib/server';
import { sameOrigin, fail } from '@/lib/http';
const decimal = z.string().regex(/^\d{1,12}(\.\d{1,8})?$/, 'Use até oito casas decimais');
const money = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, 'Use até duas casas decimais');
const common = { id: z.uuid().optional(), request_id: z.uuid(), asset_id: z.uuid().optional() };
const purchase = { quantity: decimal, amount: money, date: z.iso.date() };
const asset = { name: z.string().trim().min(1).max(200), manual_kind: z.enum(['fund','crypto']) };
const schemas = {
  create: z.object({ ...common, ...asset, ...purchase }),
  asset: z.object({ ...common, ...asset, id: z.uuid() }),
  purchase: z.object({ ...common, ...purchase, asset_id: z.uuid() }),
  'purchase-delete': z.object({ ...common, id: z.uuid() }),
  price: z.object({ ...common, asset_id: z.uuid(), price: decimal, date: z.iso.date() }),
  'price-delete': z.object({ ...common, id: z.uuid() }),
};
export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  try {
    sameOrigin(req);
    const { action } = await params;
    if (!Object.hasOwn(schemas, action)) throw new Error('Operação não autorizada');
    const { db } = await authenticatedDb();
    const input = await req.json();
    const assetId = new URL(req.url).searchParams.get('asset_id');
    const { request_id, ...payload } = schemas[action as keyof typeof schemas].parse({ ...input, ...(assetId ? { asset_id: assetId } : {}) });
    const { data, error } = await db.rpc('manual_investment_operation', { action, payload, request_id });
    if (error) throw new Error(error.code === '23505' ? 'Já existe um registro com esse nome ou mês. Corrija o registro existente.' : error.message);
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return fail(error); }
}
