import { z } from 'zod';
const date=z.iso.date(),month=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),id=z.union([z.uuid(),z.literal('')]);
export const pageViewSchema=z.object({
 period:z.enum(['month','previous','7','30','year','calendar','custom']).optional(),start:date.optional(),end:date.optional(),
 account:z.union([id,z.string().regex(/^card:[0-9a-f-]{36}$/)]).optional(),category:z.union([id,z.literal('uncategorized')]).optional(),
 type:z.enum(['','income','expense','yield','invoice_payment','transfer','investment','adjustment']).optional(),
 status:z.enum(['','confirmed','pending','cancelled']).optional(),excluded:z.boolean().optional(),search:z.string().max(200).optional(),
 card:id.optional(),invoiceMonth:month.optional(),chartMode:z.enum(['monthly','annual']).optional(),
}).refine(v=>!v.start||!v.end||v.start<=v.end,'Período inválido');
export function presetRange(period:string,today:string){
 const d=new Date(`${today}T12:00:00Z`);
 if(period==='month')return {start:`${today.slice(0,7)}-01`,end:new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).toISOString().slice(0,10)};
 if(period==='previous'){const end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),0)).toISOString().slice(0,10);return {start:`${end.slice(0,7)}-01`,end};}
 if(period==='year')return {start:`${today.slice(0,4)}-01-01`,end:today};
 if(period==='7'||period==='30'){d.setUTCDate(d.getUTCDate()-(Number(period)-1));return {start:d.toISOString().slice(0,10),end:today};}
 return null;
}
export const purchaseViewSchema=z.object({categoryId:id,search:z.string().max(200),status:z.enum(['active','cancelled','all']),period:z.enum(['all','invoice','custom']),start:date,end:date}).refine(v=>v.start<=v.end);
export const recurringViewSchema=z.object({month,filter:z.enum(['month','overdue','week'])});
export const categoryViewSchema=z.object({filter:z.union([id,z.literal('uncategorized')])});
