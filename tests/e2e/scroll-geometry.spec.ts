import {test,expect} from '@playwright/test';
import {layoutFixture as fixture,layoutAdmin as admin} from './support/layout-fixture';

test('short landscapes leave room to read and simultaneous notices never cover the footer',async({page})=>{
 test.setTimeout(60000);await page.setViewportSize({width:568,height:320});
 await page.addInitScript(()=>Object.defineProperty(navigator.serviceWorker,'register',{value:async()=>({waiting:{postMessage:()=>{}},update:async()=>{},addEventListener:()=>{}})}));
 const id=await fixture(page);
 try{
  await page.goto('/inicio/completo');await expect(page.locator('.content-skeleton,.loading')).toHaveCount(0);await expect(page.getByRole('button',{name:'Adicionar',exact:true}).filter({visible:true})).toBeEnabled();
  await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});dispatchEvent(new Event('offline'));});
  await expect(page.locator('.mobile-connection')).toBeVisible();await expect(page.locator('.mobile-update')).toBeVisible();
  const dock=page.locator('.dashboard-economic-dock');await dock.scrollIntoViewIfNeeded();
  const space=await page.evaluate(()=>{const h=document.querySelector('.mobile-app-header')!.getBoundingClientRect(),n=document.querySelector('.mobile-bottom-nav')!.getBoundingClientRect(),d=document.querySelector('.dashboard-economic-dock')!;return{available:n.top-h.bottom-(getComputedStyle(d).position==='sticky'?d.getBoundingClientRect().height:0),position:getComputedStyle(d).position};});
  expect(space.available).toBeGreaterThanOrEqual(140);
  await page.locator('.content>footer').scrollIntoViewIfNeeded();
  const covered=await page.locator('.content>footer').evaluate(el=>{const r=el.getBoundingClientRect();return [...document.querySelectorAll('.mobile-app-notices,.mobile-bottom-nav,.mobile-app-header,.dashboard-economic-dock')].filter(node=>{const s=getComputedStyle(node),b=node.getBoundingClientRect();return ['fixed','sticky'].includes(s.position)&&b.width&&b.height&&b.top<r.bottom&&b.bottom>r.top;}).map(el=>el.className);});
  expect(covered).toEqual([]);
  await page.screenshot({path:'test-results/geometry-landscape.png'});
 }finally{expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();}
});

test('a panned visual viewport keeps the whole dialog and its focused field accessible',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.addInitScript(()=>{const v=Object.assign(new EventTarget(),{height:844,width:390,offsetTop:0});Object.defineProperty(window,'visualViewport',{get:()=>v});(window as any).geometryViewport=v;});
 const id=await fixture(page);
 try{
  await page.goto('/movimentacoes');await page.getByRole('button',{name:'Novo lançamento',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Descrição',{exact:true}).focus();
  await page.evaluate(()=>{const v=(window as any).geometryViewport;v.height=300;v.offsetTop=80;v.dispatchEvent(new Event('resize'));});
  await expect.poll(()=>dialog.evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=79&&r.bottom<=381;})).toBe(true);
  await page.evaluate(()=>{const v=(window as any).geometryViewport;v.offsetTop=170;v.dispatchEvent(new Event('scroll'));});
  await expect.poll(()=>dialog.evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=169&&r.bottom<=471;})).toBe(true);
  for(const field of await dialog.locator('input:not([type=hidden]),select,textarea').all()){
   await field.focus();await expect.poll(()=>field.evaluate(e=>{const r=e.getBoundingClientRect(),v=(window as any).geometryViewport,hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return r.top>=v.offsetTop&&r.bottom<=v.offsetTop+v.height&&!!hit&&(e===hit||e.contains(hit));})).toBe(true);
  }
  await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();
 }finally{expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();}
});

for(const [width,height] of [[320,568],[667,375],[1366,768]])test(`all create forms expose their controls without overlays at ${width}x${height}`,async({page})=>{
 test.setTimeout(180000);await page.setViewportSize({width,height});const id=await fixture(page);
 const check=async()=>{
  const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
  const box=await dialog.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(width+1);
  expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
  for(const control of await dialog.locator('input:not([type=hidden]),select,textarea,button[type=submit]').all()){
   if(!await control.isVisible()||!await control.isEnabled())continue;
   await control.focus();await expect.poll(()=>control.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return r.top>=0&&r.bottom<=innerHeight&&!!hit&&(e===hit||e.contains(hit)||!!e.closest('label')?.contains(hit));})).toBe(true);
  }
  await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();await expect(dialog).toHaveCount(0);
 };
 try{
  for(const action of ['Receita','Despesa','Transferência','Compra no cartão','Gasto ou receita recorrente','Compromisso programado','Conta','Cartão','Caixinha','Orçamento','Meta financeira','Categoria ou subcategoria']){
   await page.getByRole('button',{name:'Adicionar',exact:true}).filter({visible:true}).click();const menu=page.getByRole('dialog',{name:'O que deseja adicionar?',exact:true});
   const button=menu.getByRole('button').filter({has:page.getByText(action,{exact:true})});await button.scrollIntoViewIfNeeded();await button.click();await check();
  }
  await page.goto('/patrimonio/investimentos');await page.getByRole('button',{name:'Novo investimento',exact:true}).click();await check();
 }finally{expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();}
});

test('stacked PWA notices reserve their actual height on a portrait phone',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.addInitScript(()=>Object.defineProperty(navigator.serviceWorker,'register',{value:async()=>({waiting:{postMessage:()=>{}},update:async()=>{},addEventListener:()=>{}})}));const id=await fixture(page);
 try{
  await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});dispatchEvent(new Event('offline'));});await expect(page.locator('.mobile-connection')).toBeVisible();await expect(page.locator('.mobile-update')).toBeVisible();
  await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
  await expect.poll(()=>page.evaluate(()=>{const f=document.querySelector('.content>footer')!.getBoundingClientRect(),n=document.querySelector('.mobile-app-notices')!.getBoundingClientRect();return f.bottom<=n.top-12;})).toBe(true);
  await page.screenshot({path:'test-results/geometry-notices-portrait.png'});
 }finally{expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();}
});

test('dashboard anchors place section headings below the measured fixed surfaces',async({page})=>{
 test.setTimeout(60000);const id=await fixture(page);
 try{
  for(const [width,height] of [[568,320],[1366,768]]){
   await page.setViewportSize({width,height});await page.goto('/inicio/completo');await expect(page.locator('.loading')).toHaveCount(0);await expect(page.locator('.dashboard-section-nav')).toBeVisible();
   for(const link of await page.locator('.dashboard-section-nav a').all()){
    const hash=await link.getAttribute('href');await link.click();
    await expect.poll(()=>page.locator(`${hash} .dashboard-section-heading`).evaluate(el=>{
     const r=el.getBoundingClientRect(),header=document.querySelector('.mobile-app-header')!,dock=document.querySelector('.dashboard-economic-dock')!,nav=document.querySelector('.mobile-bottom-nav')!;
     const top=Math.max(header.getBoundingClientRect().bottom,getComputedStyle(dock).position==='sticky'?dock.getBoundingClientRect().bottom:0);
     const bottom=nav.getBoundingClientRect().height?nav.getBoundingClientRect().top:innerHeight;
     return r.top>=top-1&&r.bottom<=bottom+1;
    })).toBe(true);
   }
  }
 }finally{expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();}
});
