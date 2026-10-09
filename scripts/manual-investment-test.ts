import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
if(!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('Manual checks require isolated local data');
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
const users:string[]=[];let checks=0;
const pass=(message:string)=>{checks++;console.log(`PASS ${message}`);};
async function client(){const email=`manual-${randomUUID()}@example.test`,password=randomUUID()+'Aa1!';const result=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(result.error,null);users.push(result.data.user!.id);const db=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false}});assert.equal((await db.auth.signInWithPassword({email,password})).error,null);return db;}
try{
 const db=await client(),other=await client();
 const op=(action:string,payload:Record<string,unknown>,request_id=randomUUID())=>db.rpc('manual_investment_operation',{action,payload,request_id});
 const nonce=randomUUID(),payload={name:'Fundo XPTO',manual_kind:'fund',quantity:'10',amount:'1000',date:today};
 const created=await op('create',payload,nonce);assert.equal(created.error,null);const {asset_id,id}=created.data;
 assert.deepEqual((await op('create',payload,nonce)).data,created.data);
 assert.ok((await op('create',{...payload,amount:'999'},nonce)).error);pass('idempotency avoids duplicate purchases and rejects reused keys with changed data');
 assert.ok((await op('create',{...payload,name:'  fundo   xpto  '})).error);pass('case and repeated spaces cannot duplicate an existing investment');
 const added=await op('purchase',{asset_id,quantity:'5',amount:'600',date:today});assert.equal(added.error,null);
 const snap=await db.rpc('read_financial_snapshot');assert.equal(snap.error,null);assert.equal(snap.data.manual_investment_purchases.length,2);assert.deepEqual(snap.data.manual_investment_purchases.map((r:{amount:string})=>r.amount).sort(),['1000.00','600.00']);pass('multiple purchases preserve exact total paid separately from unit prices');
 const first=await op('price',{asset_id,price:'130',date:today});assert.equal(first.error,null);
 const corrected=await op('price',{asset_id,price:'140',date:today});assert.equal(corrected.error,null);assert.equal(first.data.id,corrected.data.id);
 const history=await db.from('manual_investment_updates').select('*').eq('asset_id',asset_id);assert.equal(history.data?.length,1);assert.equal(history.data![0].price,140);
 const revisions=await db.from('financial_integrity_revisions').select('entity,previous').eq('entity_id',first.data.id);assert.ok(revisions.data?.length);pass('same-month correction updates the existing month and preserves its previous version');
 assert.ok((await other.rpc('manual_investment_operation',{action:'purchase',payload:{asset_id,quantity:'1',amount:'10',date:today},request_id:randomUUID()})).error);
 assert.deepEqual((await other.from('manual_investment_purchases').select('*')).data,[]);
 assert.ok((await db.from('manual_investment_purchases').insert({asset_id,quantity:'1',amount:'10',date:today})).error);pass('cross-user RPC and direct DML are blocked by ownership and database permissions');
 for(const bad of [{quantity:'NaN'},{amount:'-1'},{quantity:'0'},{date:'2099-01-01'}])assert.ok((await op('purchase',{asset_id,quantity:'1',amount:'1',date:today,...bad})).error);
 assert.ok((await op('price',{asset_id,price:'Infinity',date:today})).error);assert.ok((await op('price',{asset_id,price:'1',date:'2099-01-01'})).error);pass('raw RPC validates finite quantities, exact money and nonfuture dates');
 assert.equal((await op('purchase-delete',{id:added.data.id})).error,null);
 const after=await db.rpc('read_financial_snapshot');assert.equal(after.data.manual_investment_purchases.filter((r:{status:string})=>r.status==='confirmed').length,1);assert.equal(after.data.transactions.length,0);assert.equal(after.data.financial_accounts.length,0);pass('cancelling a manual purchase preserves audit records and never changes cash accounts');
 assert.equal((await op('price',{asset_id,price:'0',date:today})).error,null);assert.equal((await op('price-delete',{id:first.data.id})).error,null);assert.equal((await db.from('manual_investment_updates').select('*')).data?.length,0);pass('total loss can be entered and an erroneous month can be removed without fabricated returns');
 console.log(`Manual investment checks: ${checks} passed`);
}finally{for(const id of users){const result=await admin.auth.admin.deleteUser(id);assert.equal(result.error,null);}}
