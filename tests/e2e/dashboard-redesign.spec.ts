import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
if (!['localhost','127.0.0.1'].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname)) throw Error('Redesign checks require local data');
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
test('redesign preserves twelve visible areas, eight indicators, errors, large negative money and financial records across desktop/tablet/mobile',async({page})=>{
 test.setTimeout(120000);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const email=`redesign-${randomUUID()}@example.test`, password=randomUUID()+'Aa1!';
 const result=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(result.error).toBeNull();const userId=result.data.user!.id;
 try {
  await page.route('**/api/economic-indicators',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Provider unavailable in regression test'})}));
  await page.goto('/');await page.getByLabel('E-mail').fill(email);await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar na minha conta'}).click();
  await expect(page.locator('.dashboard-section')).toHaveCount(12);
  await expect(page.locator('.dashboard-metric')).toHaveCount(8);
  await expect(page.locator('.dashboard-empty').first()).toBeVisible();
  await expect(page.getByLabel('Indicadores econômicos oficiais')).toContainText('Indisponível');
  await expect(page.locator('.confidence-sources')).toHaveAttribute('open','');
  await expect(page.locator('.forecast-details')).toHaveAttribute('open','');
  const account=await admin.from('financial_accounts').insert({user_id:userId,name:'Conta de teste de valores grandes',kind:'bank',initial_balance:'-1234567890.12'}).select('id').single();expect(account.error).toBeNull();
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
  const income=await admin.from('transactions').insert({user_id:userId,account_id:account.data!.id,description:'Receita de teste de valores grandes',type:'income',amount:'1000000000.00',date:today,status:'confirmed'});expect(income.error).toBeNull();
  await page.reload();await expect(page.getByRole('article',{name:'Saldo disponível',exact:true})).toContainText('-R$ 234.567.890,12');
  await expect(page.getByRole('article',{name:'Receitas do período',exact:true})).toContainText('R$ 1.000.000.000,00');
  const before=await (await page.request.get('/api/snapshot')).json();
  const original=await page.locator('.dashboard-metric').allTextContents();
  for(const width of [1440,1280,820,390,320]) {
   await page.setViewportSize({width,height:900});
   await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await expect.poll(()=>page.evaluate(()=>[...document.querySelectorAll<HTMLElement>('.dashboard-v2 .dashboard-amount')].filter(e=>e.getBoundingClientRect().width>0 && e.scrollWidth>e.clientWidth+2).map(e=>e.textContent))).toEqual([]);
   expect(await page.locator('.dashboard-metric').allTextContents()).toEqual(original);
   await expect(page.getByLabel('Resumo fixo dos indicadores econômicos')).toContainText('Indisponível');
   await expect(page.locator('.dashboard-hero-rate')).toContainText('Taxa de economia');
   for(const region of await page.locator('.dashboard-section').all()) await expect(region).toBeVisible();
   await expect(page.locator('.dashboard-hero-main > strong')).toHaveClass(/negative/);
   await expect(page.locator('.forecast-horizons button')).toHaveCount(3);
   await page.locator('.forecast-horizons button').nth(2).click();await expect(page.locator('.forecast-horizons button').nth(2)).toHaveAttribute('aria-pressed','true');
   await page.evaluate(()=>window.scrollTo(0,0));
   await page.screenshot({path:`test-results/redesign-large-${width}.png`,fullPage:true});
  }
  const previousDay=new Date(`${today}T12:00:00Z`);previousDay.setUTCDate(previousDay.getUTCDate()-1);const yesterday=previousDay.toISOString().slice(0,10);
  const history=await admin.from('net_worth_snapshots').insert([{user_id:userId,date:yesterday,assets:'1000000000',liabilities:'0'},{user_id:userId,date:today,assets:'2000000000',liabilities:'0'}]);expect(history.error).toBeNull();
  await page.reload();await page.getByRole('button',{name:'Personalizado',exact:true}).click();await page.getByLabel('Data inicial',{exact:true}).fill(yesterday);await page.getByLabel('Data final',{exact:true}).fill(today);
  const growth=page.locator('.dashboard-wealth-top strong');await expect(growth).toContainText('R$ 1.000.000.000,00');await expect(growth).toHaveClass(/dashboard-amount/);
  await page.getByLabel('Data inicial',{exact:true}).fill(today);await expect(growth).toHaveText('Histórico em formação');await expect(growth).not.toHaveClass(/dashboard-amount/);
  await page.getByRole('navigation',{name:'Navegar pelas áreas do dashboard'}).getByRole('link',{name:'Faturas',exact:true}).click();
  await expect(page).toHaveURL(/#dashboard-faturas$/);await expect(page.getByRole('heading',{name:'Cartões e faturas',exact:true})).toBeInViewport();
  const after=await (await page.request.get('/api/snapshot')).json();
  expect(errors).toEqual([]);
  expect(after.account_balances).toEqual(before.account_balances);expect(after.transactions).toEqual(before.transactions);expect(after.credit_card_installments).toEqual(before.credit_card_installments);
 } finally {expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull();}
});
