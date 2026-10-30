import {test,expect,type Page} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {moduleTabs} from '../../src/lib/workspace-navigation';
test.describe.configure({mode:'parallel'});
const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
if(!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('Visual audit requires local disposable users');
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
const routes=[...new Set([...Object.values(moduleTabs).flat().map(t=>t.href),'/transacoes','/recorrentes','/contas','/categorias','/caixinhas','/investimentos','/planejamento','/relatorios'])];
async function fixture(page:Page){
 const email=`visual-${randomUUID()}@example.test`,password=randomUUID()+'Aa1!';const u=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(u.error).toBeNull();const id=u.data.user!.id;
 try{
  const a=await admin.from('financial_accounts').insert({user_id:id,name:'Conta principal para despesas e projetos da família',kind:'bank',initial_balance:'1000000'}).select('id').single();expect(a.error).toBeNull();
  const cat=await admin.from('categories').insert({user_id:id,name:'Moradia, manutenção e compromissos da família'}).select('id').single();expect(cat.error).toBeNull();
  expect((await admin.from('categories').insert({user_id:id,parent_id:cat.data!.id,name:'Internet e serviços para trabalhar em casa'})).error).toBeNull();
  expect((await admin.from('transactions').insert(Array.from({length:35},(_,i)=>({user_id:id,account_id:a.data!.id,category_id:cat.data!.id,description:i===0?'DescriçãoSemEspaços'.repeat(6):`Movimentação ${i+1} com descrição completa para conferir a legibilidade`,type:i%3?'expense':'income',amount:i%3?'-1234.56':'10000',date:today,status:i%2?'confirmed':'pending'})))).error).toBeNull();
  const card=await admin.from('credit_cards').insert({user_id:id,name:'Cartão principal da família para compras parceladas',account_id:a.data!.id,credit_limit:'500000',last_four:'1234',closing_day:5,due_day:10}).select('id').single();expect(card.error).toBeNull();
  await page.route('**/api/economic-indicators*',r=>r.fulfill({status:503,json:{error:'Isolated unavailable source'}}));
  await page.goto('/');await page.getByLabel('E-mail').fill(email);await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar na minha conta'}).click();await expect(page.getByRole('article',{name:'Saldo disponível',exact:true})).toBeVisible();
  const send=async(path:string,data:Record<string,unknown>)=>{const r=await page.request.post(path,{headers:{Origin:'http://localhost:3000'},data:{...data,request_id:randomUUID()}});expect(r.ok(),await r.text()).toBe(true);return r.json();};
  await send('/api/operations',{action:'purchase',payload:{card_id:card.data!.id,description:'Compra de equipamentos para os projetos da família',amount:'12345.67',installments:12,date:today.slice(0,7)+'-01',category_id:cat.data!.id}});
  await send('/api/manual-savings/create',{name:'Reserva para compromissos da família e imprevistos',initial_balance:'123456.78',target:'200000',date:today,indexer:'none',percentage:'100',product:'custom'});
  await send('/api/manual-investments/create',{name:'Fundo de investimento para objetivos de longo prazo',manual_kind:'fund',quantity:'125',amount:'123456.78',date:today});
  return id;
 }catch(e){await admin.auth.admin.deleteUser(id);throw e;}
}
for(const width of [320,360,390,430,768,1024,1440,1920])test(`visual quality at ${width}px keeps every module reachable and amounts legible`,async({page})=>{
 test.setTimeout(240000);await page.setViewportSize({width,height:width===768||width===1024?430:900});const id=await fixture(page),findings:unknown[]=[];
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
  for(const zoom of [1.25,2]){
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
