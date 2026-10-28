import {test,expect,type Page} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {shiftInvoiceMonth} from '../../src/lib/card-invoices';
import {monthEnd} from '../../src/lib/dashboard';
if(!['localhost','127.0.0.1'].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname))throw Error('Local disposable users only');
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date()),month=today.slice(0,7),next=shiftInvoiceMonth(month,1);
async function fixture(){const email=`recurring-correction-${randomUUID()}@example.test`,password=randomUUID()+'Aa1!';const u=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(u.error).toBeNull();const uid=u.data.user!.id;const a=await admin.from('financial_accounts').insert({user_id:uid,name:'Conta de teste',kind:'bank',initial_balance:'1000'}).select('id').single();expect(a.error).toBeNull();return {uid,email,password,account:a.data!.id};}
async function login(page:Page,f:Awaited<ReturnType<typeof fixture>>){await page.route('**/api/economic-indicators*',r=>r.fulfill({status:503,json:{error:'Unavailable test source'}}));await page.goto('/');await page.getByLabel('E-mail').fill(f.email);await page.getByLabel('Senha',{exact:true}).fill(f.password);await page.getByRole('button',{name:'Entrar na minha conta'}).click();await expect(page.locator('.dashboard-metric')).toHaveCount(8);}
async function period(page:Page,m:string){await page.getByRole('button',{name:'Personalizado',exact:true}).click();await page.getByLabel('Data inicial',{exact:true}).fill(`${m}-01`);await page.getByLabel('Data final',{exact:true}).fill(monthEnd(m));}

test('fixed expense agrees across monthly indicators and transactions; payment and removal never duplicate or resurrect it',async({page})=>{
 test.setTimeout(90000);const f=await fixture();
 try{
  const rec=await admin.from('recurring_transactions').insert({user_id:f.uid,account_id:f.account,description:'Internet prevista',type:'expense',amount:'99.90',frequency:'monthly',next_date:`${next}-05`}).select('id').single();expect(rec.error).toBeNull();
  expect((await admin.from('transactions').insert([{type:'income',amount:'500',description:'Receita prevista',date:`${next}-02`},{type:'expense',amount:'-20.10',description:'Despesa avulsa',date:`${next}-07`}].map(t=>({...t,user_id:f.uid,account_id:f.account,status:'pending'})))).error).toBeNull();
  await login(page,f);await page.getByLabel('Mês do dashboard',{exact:true}).fill(next);
  await expect(page.getByRole('article',{name:'Gastos do mês',exact:true})).toContainText('R$ 120,00');await expect(page.locator('.dashboard-result-copy > strong')).toHaveText('R$ 380,00');await expect(page.getByRole('article',{name:'Saldo disponível',exact:true})).toContainText('R$ 1.000,00');
  await page.goto('/transacoes');await expect(page.getByRole('heading',{name:'Lançamentos recorrentes',exact:true})).toBeVisible();await period(page,next);
  let line=page.getByRole('row').filter({hasText:'Internet prevista'});await expect(line).toHaveCount(1);await expect(line).toContainText('Gasto fixo previsto');await line.getByRole('button',{name:'Pagar',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirmar pagamento',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(line).toContainText('Pago');await expect(line).not.toContainText('Gasto fixo previsto');
  const saved=await admin.from('transactions').select('*').eq('user_id',f.uid).eq('source_id',`recurrence:${rec.data!.id}:${next}-05`);expect(saved.data).toHaveLength(1);
  await page.goto('/');await expect(page.getByRole('article',{name:'Gastos do mês',exact:true})).toContainText('R$ 120,00');await expect(page.locator('.dashboard-result-copy > strong')).toHaveText('R$ 380,00');await expect(page.getByRole('article',{name:'Saldo disponível',exact:true})).toContainText('R$ 900,10');
  await page.goto('/transacoes');line=page.getByRole('row').filter({hasText:'Internet prevista'});await expect(line).toHaveCount(1);await line.getByRole('button',{name:'Excluir',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Excluir',exact:true}).click();await expect(line).toHaveCount(0);await page.reload();await expect(line).toHaveCount(0);
  await page.goto('/');await expect(page.getByRole('article',{name:'Gastos do mês',exact:true})).toContainText('R$ 20,10');await expect(page.locator('.dashboard-result-copy > strong')).toHaveText('R$ 479,90');await expect(page.getByRole('article',{name:'Saldo disponível',exact:true})).toContainText('R$ 1.000,00');
  await page.goto('/transacoes');const registry=page.locator('.recurrence-row').filter({hasText:'Internet prevista'});await page.setViewportSize({width:320,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(320);await page.setViewportSize({width:1440,height:900});await registry.getByRole('button',{name:'Encerrar',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Encerrar',exact:true}).click();await expect(registry).toContainText('Encerrada');await registry.getByRole('button',{name:'Excluir',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Excluir',exact:true}).click();await expect(registry).toHaveCount(0);
 }finally{expect((await admin.auth.admin.deleteUser(f.uid)).error).toBeNull();}
});

test('ended recurrence and cancelled history can be removed, with explicit choice to remove paid and pending records',async({page})=>{
 test.setTimeout(90000);const f=await fixture();
 try{
  const rec=await admin.from('recurring_transactions').insert({user_id:f.uid,account_id:f.account,description:'Recorrência encerrada',type:'expense',amount:'40',frequency:'monthly',next_date:today,active:false,cancelled_at:new Date().toISOString()}).select('id').single();expect(rec.error).toBeNull();
  const dates=[`${month}-01`,`${month}-02`,`${month}-03`];
  expect((await admin.from('transactions').insert([{description:'Histórico pago',amount:'-40',status:'confirmed'},{description:'Histórico pendente',amount:'-10',status:'pending'},{description:'Histórico excluído',amount:'-5',status:'cancelled'}].map((t,i)=>({...t,user_id:f.uid,account_id:f.account,type:'expense',date:dates[i],source_id:`recurrence:${rec.data!.id}:${dates[i]}`})))).error).toBeNull();
  await login(page,f);await expect(page.getByRole('article',{name:'Gastos do mês',exact:true})).toContainText('R$ 50,00');await expect(page.getByRole('article',{name:'Saldo disponível',exact:true})).toContainText('R$ 960,00');
  await page.goto('/transacoes');await page.getByLabel('Mostrar lançamentos excluídos',{exact:true}).check();const cancelled=page.getByRole('row').filter({hasText:'Histórico excluído'});await cancelled.getByRole('button',{name:'Remover do histórico',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Excluir',exact:true}).click();await expect(cancelled).toHaveCount(0);
  for(const width of [320,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);}
  const registry=page.locator('.recurrence-row').filter({hasText:'Recorrência encerrada'});await registry.getByRole('button',{name:'Excluir',exact:true}).click();await page.getByLabel('Histórico das ocorrências',{exact:true}).selectOption('all');await expect(page.getByRole('dialog')).toContainText('inclusive as já pagas ou recebidas');await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/recurring-removal-dialog-mobile.png'});await page.getByRole('dialog').getByRole('button',{name:'Excluir',exact:true}).click();await expect(registry).toHaveCount(0);await expect(page.getByRole('row').filter({hasText:'Histórico pago'})).toHaveCount(0);await expect(page.getByRole('row').filter({hasText:'Histórico pendente'})).toHaveCount(0);
  await page.goto('/');await expect(page.getByRole('article',{name:'Gastos do mês',exact:true})).toContainText('R$ 0,00');await expect(page.getByRole('article',{name:'Saldo disponível',exact:true})).toContainText('R$ 1.000,00');
  const audit=await admin.from('financial_integrity_revisions').select('id').eq('user_id',f.uid);expect(audit.data!.length).toBeGreaterThanOrEqual(4);
 }finally{expect((await admin.auth.admin.deleteUser(f.uid)).error).toBeNull();}
});
