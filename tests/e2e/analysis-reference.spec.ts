import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { rowsById } from '../helpers/snapshot';
import { shiftInvoiceMonth } from '../../src/lib/card-invoices';
if (!['localhost','127.0.0.1'].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname)) throw Error('Analysis checks require local data');
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
test('reference analysis preserves values, category hierarchy, real comparisons, chart periods and touch data',async({page})=>{
 test.setTimeout(120000);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const email=`analysis-${randomUUID()}@example.test`,password=randomUUID()+'Aa1!';
 const user=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(user.error).toBeNull();const userId=user.data.user!.id;
 try {
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date()),date=`${today.slice(0,7)}-01`,previous=`${shiftInvoiceMonth(today.slice(0,7),-1)}-01`;
  const account=await admin.from('financial_accounts').insert({user_id:userId,name:'Conta análise',kind:'bank',initial_balance:'2000'}).select('id').single();expect(account.error).toBeNull();
  const roots=await admin.from('categories').insert([{user_id:userId,name:'Transportes'},{user_id:userId,name:'Alimentação'}]).select('id,name');expect(roots.error).toBeNull();const transport=roots.data!.find(r=>r.name==='Transportes')!.id,food=roots.data!.find(r=>r.name==='Alimentação')!.id;
  const child=await admin.from('categories').insert({user_id:userId,name:'Uber',parent_id:transport}).select('id').single();expect(child.error).toBeNull();
  const tx=await admin.from('transactions').insert([
   {description:'Salário atual',type:'income',amount:'1000',date},
   {description:'Rendimento atual',type:'yield',amount:'10',date},
   {description:'Uber atual',type:'expense',amount:'-250',date,category_id:child.data!.id},
   {description:'Alimentação atual',type:'expense',amount:'-100',date,category_id:food},
   {description:'Salário anterior',type:'income',amount:'900',date:previous},
   {description:'Uber anterior',type:'expense',amount:'-150',date:previous,category_id:child.data!.id},
   {description:'Alimentação anterior',type:'expense',amount:'-50',date:previous,category_id:food},
   {description:'Histórico antigo',type:'income',amount:'333',date:`${shiftInvoiceMonth(today.slice(0,7),-10)}-01`}
  ].map(row=>({...row,user_id:userId,account_id:account.data!.id,status:'confirmed'})));expect(tx.error).toBeNull();
  await page.route('**/api/economic-indicators',route=>route.fulfill({status:503,json:{error:'Unavailable test source'}}));
  await page.goto('/');await page.getByLabel('E-mail').fill(email);await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar na minha conta'}).click();
  const analysis=page.locator('#dashboard-analises'),flow=analysis.locator('.analysis-flow-panel'),category=analysis.locator('.analysis-category-panel');
  await expect(analysis.locator('.recharts-bar')).toHaveCount(3);await expect(analysis.locator('.recharts-line')).toHaveCount(1);
  await expect(analysis.locator('.dashboard-chart-foot article')).toHaveCount(3);
  await expect(category.locator('.analysis-donut-total')).toContainText('R$ 350,00');
  await expect(category.getByRole('row').filter({has:page.getByRole('button',{name:'Detalhar Transportes',exact:true})})).toContainText('+66,7%');
  await category.getByRole('button',{name:'Subcategorias',exact:true}).click();await expect(category.getByRole('table',{name:'Subcategorias de Transportes'})).toContainText('Uber');await expect(category.locator('.analysis-donut-total')).toContainText('R$ 250,00');
  await category.getByRole('button',{name:'Categorias',exact:true}).click();await expect(category.locator('.analysis-donut-total')).toContainText('R$ 350,00');
  const original=await page.locator('.dashboard-metric').allTextContents(),before=await (await page.request.get('/api/snapshot')).json();
  for(const width of [1440,1280,820,390,320]) {
   await page.setViewportSize({width,height:900});await analysis.scrollIntoViewIfNeeded();
   await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await expect.poll(()=>analysis.locator('.dashboard-amount').evaluateAll(elements=>elements.filter(e=>e.clientWidth>0&&e.scrollWidth>e.clientWidth+2).map(e=>e.textContent))).toEqual([]);
   if(width>=1100) {const left=await analysis.locator('.analysis-left-column').boundingBox(),right=await analysis.locator('.analysis-right-column').boundingBox();expect(right!.x).toBeGreaterThan(left!.x+left!.width);expect(Math.abs(right!.y-left!.y)).toBeLessThan(2);}
   await flow.getByRole('button',{name:'12 meses',exact:true}).click();await expect(flow.locator('.mobile-chart-data li')).toHaveCount(12);await expect(flow.locator('.mobile-chart-data')).toContainText('R$ 333,00');
   await flow.getByRole('button',{name:'6 meses',exact:true}).click();await expect(flow.locator('.mobile-chart-data li')).toHaveCount(6);await expect(flow.locator('.mobile-chart-data')).not.toContainText('R$ 333,00');
   await flow.getByRole('button',{name:'Período selecionado',exact:true}).click();await expect(flow.locator('.mobile-chart-data li')).toHaveCount(1);await expect(flow.locator('.mobile-chart-data')).toContainText('R$ 1.000,00');
   await flow.getByRole('button',{name:'6 meses',exact:true}).click();
   if(width>=1100) {
    const donut=category.locator('.donut'),box=await donut.boundingBox();
    await page.mouse.move(box!.x+140,box!.y+70);
    const tooltip=category.locator('.analysis-donut-tooltip');await expect(tooltip).toBeVisible();await expect(tooltip).toContainText('Transportes');await expect(tooltip).toContainText('R$ 250,00');
    const detail=await tooltip.boundingBox(),chart=await donut.locator('.recharts-wrapper').boundingBox(),total=await category.locator('.analysis-donut-total').boundingBox();
    expect(detail!.y).toBeGreaterThanOrEqual(chart!.y+chart!.height);expect(detail!.y).toBeGreaterThan(total!.y+total!.height);expect(detail!.x+detail!.width).toBeLessThanOrEqual(box!.x+box!.width+1);expect(detail!.y+detail!.height).toBeLessThanOrEqual(box!.y+box!.height+1);
   }
   expect(await page.locator('.dashboard-metric').allTextContents()).toEqual(original);
   await analysis.screenshot({path:`test-results/analysis-reference-${width}.png`});
  }
  const after=await (await page.request.get('/api/snapshot')).json();expect(rowsById(after.transactions)).toEqual(rowsById(before.transactions));expect(rowsById(after.account_balances)).toEqual(rowsById(before.account_balances));expect(errors).toEqual([]);
 } finally {expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull();}
});
