import {test,expect} from '@playwright/test';
import {layoutFixture as fixture,layoutAdmin as admin,layoutRoutes as routes} from './support/layout-fixture';
test.describe.configure({mode:'parallel'});
for(const [width,height] of [[320,568],[375,667],[390,844],[430,932],[768,1024],[1024,768],[1366,768],[1440,900],[1920,1080],[2560,1440]])test(`visual quality at ${width}x${height} keeps every module reachable and amounts legible`,async({page})=>{
 test.setTimeout(240000);await page.setViewportSize({width,height});const id=await fixture(page),findings:unknown[]=[];
 try{
  for(const path of routes){
   await page.goto(path);await expect(page.locator('.page-head h1')).toBeVisible();await expect(page.locator('.content-skeleton')).toHaveCount(0);await expect(page.locator('.loading')).toHaveCount(0);await expect(page.getByRole('button',{name:'Adicionar',exact:true}).filter({visible:true})).toBeEnabled();await page.evaluate(async()=>{await document.fonts.ready;for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
   const problems=await page.locator('.content').evaluate(root=>{
    const issues:string[]=[];
    if(document.documentElement.scrollWidth>innerWidth+1)issues.push('page overflow');
    for(const e of root.querySelectorAll<HTMLElement>('h1,h2,h3,button,.panel,.stat,.module-tabs a')){const b=e.getBoundingClientRect();if(!b.width||e.closest('.table-wrap,.recharts-wrapper'))continue;if(b.left< -1||b.right>innerWidth+1)issues.push(`outside: ${e.className} ${e.textContent?.slice(0,40)}`);}
    for(const e of root.querySelectorAll<HTMLElement>('.stat>strong,.dashboard-metric>strong,.forecast-horizons strong,.manual-investment-values dd')){if(!e.clientWidth||!/^[-−+]?\s*R\$/.test(e.textContent??''))continue;const r=document.createRange();r.selectNodeContents(e);if(r.getBoundingClientRect().width>e.clientWidth+2)issues.push(`currency cut: ${e.textContent}`);if(parseFloat(getComputedStyle(e).fontSize)<14)issues.push(`currency too small: ${e.textContent}`);}
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()){
     const node=walker.currentNode;if(!node.textContent?.trim()||node.parentElement?.closest('.table-wrap,.recharts-wrapper,.sr-only,script,style'))continue;
     const range=document.createRange();range.selectNodeContents(node);const b=range.getBoundingClientRect();
     if(b.width&&(b.right>innerWidth+1||b.left< -1))issues.push(`text outside: ${node.textContent?.slice(0,50)}`);
    }
    const text=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    while(text.nextNode()){
     const node=text.currentNode;if(!node.textContent?.trim()||node.parentElement?.closest('.recharts-wrapper,.sr-only,script,style'))continue;
     const range=document.createRange();range.selectNodeContents(node);const b=range.getBoundingClientRect();if(!b.width)continue;
     for(let p=node.parentElement;p&&p!==root;p=p.parentElement){const style=getComputedStyle(p),r=p.getBoundingClientRect();
      if(['hidden','clip'].includes(style.overflowY)&&(b.top<r.top-2||b.bottom>r.bottom+2)||['hidden','clip'].includes(style.overflowX)&&(b.left<r.left-2||b.right>r.right+2)){issues.push(`ancestor clips text: ${node.textContent?.slice(0,40)}`);break;}
     }
    }
    return issues;
   });if(problems.length)findings.push({path,problems});
   await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));await expect(page.locator('.content>footer')).toBeInViewport();
   if([390,1440].includes(width)&&['/','/movimentacoes','/cartoes/compras','/patrimonio/caixinhas','/analises'].includes(path)){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`test-results/quality-${width}-${path.replaceAll('/','-')||'home'}.png`});if(path==='/analises')await page.locator('#dashboard-analises').screenshot({path:`test-results/quality-charts-${width}.png`});}
  }
  expect(findings).toEqual([]);
 }finally{expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();}
});

test('zoom, landscape and long dialogs preserve controls, table columns and scroll access',async({page,context})=>{
 test.setTimeout(90000);await page.setViewportSize({width:1280,height:720});const id=await fixture(page);
 try{
  const cdp=await context.newCDPSession(page);
  for(const zoom of [1.25,1.5,2]){
   await cdp.send('Emulation.setDeviceMetricsOverride',{width:Math.round(1280/zoom),height:Math.round(720/zoom),deviceScaleFactor:zoom,mobile:false});
   await page.goto('/movimentacoes');await expect(page.getByRole('region',{name:'Histórico de transações',exact:true})).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
   await page.getByRole('button',{name:'Novo lançamento',exact:true}).click();const dialog=page.getByRole('dialog');for(const field of await dialog.locator('input:not([type=hidden]),select,textarea,button[type=submit]').all()){await field.scrollIntoViewIfNeeded();await expect(field).toBeInViewport();}await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();await cdp.send('Emulation.clearDeviceMetricsOverride');
  }
  await page.setViewportSize({width:740,height:360});await page.goto('/cartoes');await page.getByRole('button',{name:'Registrar compra',exact:true}).click();const dialog=page.getByRole('dialog');for(const field of await dialog.locator('input:not([type=hidden]),select,textarea').all()){await field.scrollIntoViewIfNeeded();await expect(field).toBeInViewport();}await dialog.getByRole('button',{name:'Salvar',exact:true}).scrollIntoViewIfNeeded();await expect(dialog.getByRole('button',{name:'Salvar',exact:true})).toBeInViewport();await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();
 }finally{expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();}
});

test('loading, reduced motion and keyboard scrolling preserve real data and complete table access',async({page})=>{
 test.setTimeout(60000);await page.setViewportSize({width:390,height:844});const id=await fixture(page);
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
 try{
  await page.route('**/api/snapshot',async route=>{if(route.request().method()==='GET'){await gate;await route.continue();}else await route.continue();});
  await page.reload();await expect(page.getByRole('status',{name:'Carregando seus dados',exact:true})).toBeVisible();await expect(page.locator('.dashboard-metric')).toHaveCount(0);await page.locator('.content-skeleton').screenshot({path:'test-results/quality-skeleton-390.png'});release();await expect(page.getByRole('article',{name:'Saldo disponível',exact:true})).toBeVisible();
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));await expect(page.locator('.content>footer')).toBeInViewport();await expect.poll(()=>page.locator('.content').evaluate(root=>root.getAnimations({subtree:true}).filter(a=>a.playState==='running').length)).toBe(0);expect(await page.locator('.panel').evaluateAll(es=>es.every(e=>getComputedStyle(e).opacity==='1'))).toBe(true);
  await page.goto('/cartoes/compras');const table=page.locator('.purchase-history .table-wrap');await expect(table).not.toHaveAttribute('data-table-overflow');await expect(table.locator('tbody tr')).toHaveCSS('display','grid');await page.setViewportSize({width:1024,height:844});await expect(table).toHaveAttribute('data-table-overflow','');await expect(table).toHaveAttribute('tabindex','0');await expect(table).toHaveAttribute('aria-description',/todas as colunas/);await table.focus();await page.keyboard.press('ArrowRight');await expect.poll(()=>table.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);await table.getByRole('button',{name:'Editar',exact:true}).focus();await expect(table.getByRole('button',{name:'Editar',exact:true})).toBeInViewport();
 }finally{release();expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();}
});
