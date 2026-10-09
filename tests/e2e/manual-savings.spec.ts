import {test,expect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
if(!['localhost','127.0.0.1'].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname))throw Error('Local browser tests only');
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
test('manual jar flows, corrections and monthly history update dashboard immediately on desktop and mobile',async({page})=>{
 test.setTimeout(90000);
 const email=`savings-ui-${randomUUID()}@example.test`,password=randomUUID()+'Aa1!';const created=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(created.error).toBeNull();const user=created.data.user!.id;
 try {
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
  const account=await admin.from('financial_accounts').insert({user_id:user,name:'Conta depósitos',kind:'bank',initial_balance:'5000'}).select('id').single();expect(account.error).toBeNull();
  await page.goto('/');await page.getByLabel('E-mail').fill(email);await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar na minha conta'}).click();await expect(page.getByText('Saldo disponível',{exact:true})).toBeVisible();
  await page.goto('/caixinhas');await page.getByRole('button',{name:'Nova caixinha',exact:true}).first().click();
  let dialog=page.getByRole('dialog');await dialog.getByLabel('Nome',{exact:true}).fill('Reserva manual');await dialog.getByLabel('Valor inicial já depositado (R$)').fill('1000');await dialog.getByLabel('Meta (R$)').fill('2000');await dialog.getByRole('button',{name:'Salvar',exact:true}).click();await expect(dialog).not.toBeVisible();
  const jar=page.getByRole('article',{name:'Caixinha Reserva manual'});await expect(jar).toContainText('R$ 1.000,00');await expect(jar).toContainText('Aguardando atualização');
  await jar.getByRole('button',{name:'Informar rendimento',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByLabel('Saldo total atualizado da caixinha (R$)').fill('1100');await dialog.getByRole('button',{name:'Salvar',exact:true}).click();await expect(dialog).not.toBeVisible();await expect(jar).toContainText('+10,00%');
  await jar.getByRole('button',{name:'Depositar',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByLabel('Conta',{exact:true}).selectOption(account.data!.id);await dialog.getByLabel('Valor (R$)').fill('500');await dialog.getByRole('button',{name:'Salvar',exact:true}).click();await expect(dialog).not.toBeVisible();await expect(jar).toContainText('R$ 1.600,00');await expect(jar).toContainText('+6,67%');
  await jar.getByRole('button',{name:'Retirar',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByLabel('Conta de destino').selectOption(account.data!.id);await dialog.getByLabel('Valor total da retirada (R$)').fill('300');await dialog.getByRole('button',{name:'Salvar',exact:true}).click();await expect(dialog).not.toBeVisible();await expect(jar).toContainText('R$ 1.300,00');
  await jar.getByRole('link',{name:'Ver evolução mensal'}).click();await expect(page.getByLabel('Evolução mensal da caixinha')).toBeVisible();await expect(page.getByText('Rendimento acumulado: R$ 100,00')).toBeVisible();
  await page.getByRole('button',{name:`Corrigir saldo de Reserva manual em ${today.split('-').reverse().join('/')}`}).click();dialog=page.getByRole('dialog');await dialog.getByLabel('Saldo total atualizado da caixinha (R$)').fill('1050');await dialog.getByRole('button',{name:'Salvar',exact:true}).click();await expect(dialog).not.toBeVisible();await expect(page.getByRole('article',{name:'Caixinha Reserva manual'})).toContainText('R$ 1.250,00');
  for(const width of [320,390,768]) {await page.setViewportSize({width,height:844});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  await page.screenshot({path:'test-results/manual-savings-mobile.png',fullPage:true});
  await page.goto('/');await expect(page.getByRole('article',{name:'Rendimento das caixinhas no mês',exact:true})).toContainText('R$ 50,00');await expect(page.locator('.dashboard-goal')).toContainText('R$ 1.250,00');
  const stored=await admin.from('manual_savings_updates').select('balance').eq('user_id',user);expect(stored.data).toEqual([{balance:1050}]);
  expect((await admin.from('account_balances').select('balance').eq('id',account.data!.id).single()).data!.balance).toBe('4800.00');
 }finally{expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();}
});
test('official economic indicators handle one unavailable provider and mobile displays compact cards',async({page})=>{
 const email=`macro-ui-${randomUUID()}@example.test`,password=randomUUID()+'Aa1!';const created=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(created.error).toBeNull();
 try {
  let available=false;
  await page.route('**/api/economic-indicators',route=>route.fulfill({json:{checkedAt:'2026-10-09T12:00:00Z',selic:{value:available?'13.75':null,reference:available?'2026-10-09':null,source:'Banco Central',url:'https://www.bcb.gov.br',error:'Fonte oficial indisponível'},ipca:{value:'4.58',reference:'2026-09',source:'IBGE',url:'https://www.ibge.gov.br',error:null}}}));
  await page.setViewportSize({width:320,height:760});await page.goto('/');await page.getByLabel('E-mail').fill(email);await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar na minha conta'}).click();
  const cards=page.getByLabel('Indicadores econômicos oficiais');await expect(cards).toContainText('Indisponível');await expect(cards).toContainText('4,58%');await expect(cards).toContainText('09/2026');await expect(cards).toContainText('IBGE');
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/economic-indicators-mobile.png',fullPage:true});
  available=true;
  await cards.getByRole('button',{name:'Atualizar indicadores econômicos'}).click();await expect(cards.getByRole('button',{name:'Atualizar indicadores econômicos'})).toBeEnabled();
  await expect(cards).toContainText('13,75%ao ano');
  for(const width of [320,390,768,1440]) {await page.setViewportSize({width,height:844});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await cards.locator('strong').evaluateAll(elements=>elements.every(e=>e.scrollWidth<=e.clientWidth))).toBe(true);}
  await cards.screenshot({path:'test-results/economic-indicators-available.png'});
 }finally{expect((await admin.auth.admin.deleteUser(created.data.user!.id)).error).toBeNull();}
});
