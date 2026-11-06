import {NextResponse} from 'next/server';
import {z} from 'zod';
import {authenticatedDb} from '@/lib/server';
import {sameOrigin,fail} from '@/lib/http';
const amount=z.string().regex(/^\d{1,12}(\.\d{1,2})?$/,'Informe um valor positivo ou zero, com até duas casas decimais.');
const schema=z.object({equities:amount,crypto:amount}).strict();
export async function POST(req:Request){
 try{
  sameOrigin(req);const {db,user}=await authenticatedDb();const input=schema.parse(await req.json());
  const {error}=await db.from('investment_totals').upsert({user_id:user.id,...input,updated_at:new Date().toISOString()},{onConflict:'user_id'});
  if(error)throw new Error(error.message);
  return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return fail(error);}
}
