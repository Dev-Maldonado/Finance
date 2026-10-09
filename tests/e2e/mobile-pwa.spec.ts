import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
if(!['localhost','127.0.0.1'].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname))throw new Error('Mobile tests require local database');
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
async function fixture(page:Page) {
 const email=`pwa-${randomUUID()}@example.test`,password=randomUUID()+'Aa1!';
 const result=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(result.error).toBeNull();const id=result.data.user!.id;
 try {
  expect((await admin.from('financial_accounts').insert({user_id:id,name:'Conta mobile',kind:'bank',initial_balance:'500'})).error).toBeNull();
  await page.goto('/');await page.getByLabel('E-mail').fill(email);await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar na minha conta'}).click();await expect(page.getByText('Saldo disponível',{exact:true})).toBeVisible();return id;
 } catch(error) {await admin.auth.admin.deleteUser(id);throw error;}
}
test('mobile shell exposes every module, preserves desktop and avoids overflow',async({page})=>{
 test.setTimeout(120000);await page.setViewportSize({width:390,height:844});const id=await fixture(page);
 try {
  await expect(page.getByRole('navigation',{name:'Navegação rápida'})).toBeVisible();await expect(page.locator('.sidebar')).not.toBeVisible();
  for(const [path,label] of [['contas','Contas e Saldos'],['cartoes','Cartões'],['transacoes','Transações'],['categorias','Categorias'],['caixinhas','Caixinhas CDI'],['investimentos','Investimentos'],['planejamento','Planejamento'],['relatorios','Relatórios'],['configuracoes','Configurações'],['dashboard','Dashboard']]) {
   await page.getByRole('button',{name:'Abrir menu',exact:true}).click();const menu=page.getByRole('dialog',{name:'Todos os recursos'});await expect(menu).toBeVisible();await menu.getByRole('link',{name:label,exact:true}).click();await expect(menu).not.toBeVisible();await expect(page).toHaveURL(path === "dashboard" ? /\/$/ : new RegExp(`/${path}$`));await expect(page.locator('.page-head h1')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),path).toBe(true);
  }
  for(const width of [320,375,430,600,768,820]) { await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`width ${width}`).toBe(true);await expect(page.getByRole('navigation',{name:'Navegação rápida'})).toBeVisible(); }
  await page.getByRole("button",{name:"Abrir menu",exact:true}).click();await page.setViewportSize({width:1440,height:1000});await expect(page.getByRole("dialog",{name:"Todos os recursos"})).not.toBeVisible();await expect(page.locator('.sidebar')).toBeVisible();await expect(page.locator('.topbar')).toBeVisible();await expect(page.getByRole('navigation',{name:'Navegação rápida'})).not.toBeVisible();expect(await page.locator('.main').evaluate(node=>getComputedStyle(node).marginLeft)).toBe('230px');
 } finally {expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();}
});
test('mobile transaction form saves data, shows all fields and keeps chart values accessible',async({page})=>{
 await page.setViewportSize({width:390,height:844});const id=await fixture(page);
 try {
  await page.getByRole('button',{name:'Novo lançamento',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await page.getByLabel('Descrição',{exact:true}).fill('Despesa mobile completa');await page.getByLabel('Conta',{exact:true}).selectOption({label:'Conta mobile'});await page.getByLabel('Valor (R$)',{exact:true}).fill('37.50');await page.getByLabel('Status',{exact:true}).selectOption('confirmed');await dialog.getByRole('button',{name:'Salvar',exact:true}).click();await expect(dialog).not.toBeVisible();await page.getByRole('navigation',{name:'Navegação rápida'}).getByRole('link',{name:'Transações',exact:true}).click();await expect(page.getByText('Despesa mobile completa',{exact:true})).toBeVisible();const row=page.locator('.transaction-list tr').filter({hasText:'Despesa mobile completa'});for(const label of ['Conta','Data','Status','Valor'])await expect(row.locator(`td[data-label="${label}"]`)).toBeVisible();await expect(row).toContainText('37,50');
  await page.getByRole('navigation',{name:'Navegação rápida'}).getByRole('link',{name:'Início',exact:true}).click();await page.getByText('Ver valores do gráfico',{exact:true}).first().click();await expect(page.locator('.mobile-chart-data[open]')).toContainText('37,50');
 } finally {expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();}
});
test('PWA manifest, installation guidance and offline fallback never cache user pages',async({page,context,request})=>{
 await page.setViewportSize({width:390,height:844});const manifest=await (await request.get('/manifest.webmanifest')).json();expect(manifest.display).toBe('standalone');expect(manifest.scope).toBe('/');expect(manifest.icons).toHaveLength(3);for(const icon of manifest.icons){const response=await request.get(icon.src);expect(response.ok()).toBe(true);expect(response.headers()['content-type']).toContain('image/png');}
 const id=await fixture(page);
 try {
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.getByRole('button',{name:'Abrir menu',exact:true}).click();await page.getByRole('button',{name:'Instalar aplicativo',exact:false}).click();await expect(page.getByRole('dialog',{name:'Instalar FINORA'})).toBeVisible();await expect(page.getByRole('dialog',{name:'Instalar FINORA'})).toContainText('Adicionar à tela inicial');await page.getByRole('button',{name:'Entendi'}).click();
  const keys=await page.evaluate(async()=>{const result:string[]=[];for(const name of await caches.keys()){const cache=await caches.open(name);result.push(...(await cache.keys()).map(r=>new URL(r.url).pathname));}return result;});expect(keys.some(path=>path.startsWith('/api/')||path==='/')).toBe(false);
  await context.setOffline(true);await page.goto('/cartoes');await expect(page.getByRole('heading',{name:'Vamos reconectar?'})).toBeVisible();await expect(page.getByText('Conta mobile',{exact:true})).toHaveCount(0);await context.setOffline(false);await page.getByRole('link',{name:'Tentar novamente'}).click();await expect(page.getByText('Saldo disponível',{exact:true})).toBeVisible();
 } finally {await context.setOffline(false);expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();}
});
test('iPhone receives Safari installation steps and touch tablet keeps app navigation',async({browser})=>{
 const context=await browser.newContext({viewport:{width:1024,height:1366},hasTouch:true,isMobile:true,userAgent:'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'});const page=await context.newPage();const id=await fixture(page);
 try {
  const snapshot=await(await page.request.get('/api/snapshot')).json();
  const transaction=await page.request.post('/api/operations',{headers:{Origin:'http://localhost:3000'},data:{action:'transaction',request_id:randomUUID(),payload:{account_id:snapshot.financial_accounts[0].id,type:'expense',description:'Teste de gráfico por toque',amount:'10',date:new Date().toISOString().slice(0,10),status:'confirmed'}}});
  expect(transaction.ok(),await transaction.text()).toBe(true);await page.reload();await expect(page.getByText('Saldo disponível',{exact:true})).toBeVisible();
  await expect(page.getByRole('navigation',{name:'Navegação rápida'})).toBeVisible();await page.getByRole('button',{name:'Abrir menu',exact:true}).click();await page.getByRole('button',{name:'Instalar aplicativo',exact:false}).click();await expect(page.getByRole('dialog',{name:'Instalar FINORA'})).toContainText('Safari');await expect(page.getByRole('dialog',{name:'Instalar FINORA'})).toContainText('Compartilhar');await page.getByRole('button',{name:'Entendi'}).click();await page.locator('.chart .recharts-surface').first().tap({position:{x:150,y:100}});await expect(page.locator('.recharts-tooltip-wrapper').filter({visible:true}).first()).toContainText('Entradas');await page.setViewportSize({width:1366,height:1024});await expect(page.getByRole('navigation',{name:'Navegação rápida'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 finally {await admin.auth.admin.deleteUser(id);await context.close();}
});
test('Android install prompt is user initiated and update waits until forms are closed',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.addInitScript(()=>{
  Object.defineProperty(navigator.serviceWorker,'register',{value:async()=>({waiting:{postMessage:(message:unknown)=>{(window as any).updateMessage=message;}},update:async()=>{},addEventListener:()=>{}})});
 });
 const id=await fixture(page);
 try {
  await expect(page.getByText('Nova versão disponível',{exact:true})).toBeVisible();
  await page.evaluate(()=>{const event=new Event('beforeinstallprompt',{cancelable:true});Object.assign(event,{prompt:async()=>{(window as any).installPrompted=true;},userChoice:Promise.resolve({outcome:'accepted'})});window.dispatchEvent(event);});
  await page.getByRole('button',{name:'Abrir menu',exact:true}).click();await page.getByRole('button',{name:'Instalar aplicativo',exact:false}).click();expect(await page.evaluate(()=>(window as any).installPrompted)).toBe(true);await expect(page.getByRole('dialog',{name:'Instalar FINORA'})).not.toBeVisible();
  await page.getByRole('button',{name:'Novo lançamento',exact:true}).click();
  // Native dialogs make outside controls inert, so a pending update cannot interrupt a form.
  page.once('dialog',dialog=>{expect(dialog.message()).toContain('Conclua e feche');return dialog.accept();});
  await page.locator('.mobile-update button').evaluate(button=>(button as HTMLButtonElement).click());
  expect(await page.evaluate(()=>(window as any).updateMessage)).toBeUndefined();
  await page.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click();
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Atualizar',exact:true}).click();expect(await page.evaluate(()=>(window as any).updateMessage)).toEqual({type:'SKIP_WAITING'});
 } finally {await admin.auth.admin.deleteUser(id);}
});
test('virtual viewport keeps mobile forms above the keyboard and restores navigation',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.addInitScript(()=>{
  const viewport=Object.assign(new EventTarget(),{height:844,offsetTop:0});
  Object.defineProperty(window,'visualViewport',{get:()=>viewport});
  (window as any).testViewport=viewport;
 });
 const id=await fixture(page);
 try {
  await page.getByRole('button',{name:'Novo lançamento',exact:true}).click();await page.getByLabel('Descrição',{exact:true}).focus();
  await page.evaluate(()=>{const viewport=(window as any).testViewport;viewport.height=420;viewport.dispatchEvent(new Event('resize'));});
  await expect(page.getByRole('navigation',{name:'Navegação rápida'})).not.toBeVisible();const box=await page.getByRole('dialog').boundingBox();expect(box!.y+box!.height).toBeLessThanOrEqual(421);
  await page.evaluate(()=>{const viewport=(window as any).testViewport;viewport.height=844;viewport.dispatchEvent(new Event('resize'));});
  await page.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click();await expect(page.getByRole('navigation',{name:'Navegação rápida'})).toBeVisible();
 } finally {await admin.auth.admin.deleteUser(id);}
});
