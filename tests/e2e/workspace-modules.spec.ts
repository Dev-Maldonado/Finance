import {test,expect,type Page} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {moduleTabs} from '../../src/lib/workspace-navigation';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
if(!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('Module checks require isolated local data');
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date()),month=today.slice(0,7),date=month+'-01';
const headers={Origin:'http://localhost:3000'};
async function send(page:Page,path:string,data:Record<string,unknown>){const response=await page.request.post(path,{headers,data:{...data,request_id:randomUUID()}});expect(response.ok(),await response.text()).toBe(true);return response.json();}
async function fixture(page:Page){
 const email=`module-ui-${randomUUID()}@example.test`,password=randomUUID()+'Aa1!';const user=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(user.error).toBeNull();const id=user.data.user!.id;
 try{
  const bank=await admin.from('financial_accounts').insert({user_id:id,name:'Conta de uso diário',kind:'bank',initial_balance:'3000'}).select('id').single();expect(bank.error).toBeNull();
  const cats=await admin.from('categories').insert({user_id:id,name:'Casa'}).select('id').single();expect(cats.error).toBeNull();
  const child=await admin.from('categories').insert({user_id:id,name:'Internet',parent_id:cats.data!.id}).select('id').single();expect(child.error).toBeNull();
  const card=await admin.from('credit_cards').insert({user_id:id,name:'Cartão da família',account_id:bank.data!.id,last_four:'1234',credit_limit:'5000',closing_day:5,due_day:10}).select('id').single();expect(card.error).toBeNull();
  await page.route('**/api/economic-indicators*',r=>r.fulfill({status:503,json:{error:'Isolated unavailable source'}}));
  await page.goto('/');await page.getByLabel('E-mail').fill(email);await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar na minha conta'}).click();await expect(page.getByRole('article',{name:'Saldo disponível',exact:true})).toBeVisible();
  for(const [type,amount,description,status] of [['income','1000','Salário do mês','confirmed'],['expense','59.90','Internet planejada','pending']] as const)await send(page,'/api/operations',{action:'transaction',payload:{account_id:bank.data!.id,category_id:child.data!.id,type,amount,date,description,status}});
  for(const [description,amount,installments] of [['Computador parcelado','300.01',3],['Compra à vista','25',1]] as const)await send(page,'/api/operations',{action:'purchase',payload:{card_id:card.data!.id,description,amount,installments,date,category_id:child.data!.id}});
  const jar=await send(page,'/api/manual-savings/create',{name:'Reserva da família',initial_balance:'200',target:'1000',date:today,indexer:'none',percentage:'100',product:'custom'});
  await send(page,'/api/manual-savings/balance',{goal_id:jar.id,balance:'210',date:today});
  await send(page,'/api/manual-investments/create',{name:'Fundo manual',manual_kind:'fund',quantity:'2',amount:'200',date:today});
  await page.reload();await expect(page.getByRole('article',{name:'Saldo disponível',exact:true})).toContainText('4.000,00');
  return {id,bank:bank.data!.id,card:card.data!.id,jar:jar.id};
 }catch(e){await admin.auth.admin.deleteUser(id);throw e;}
}
async function records(id:string){const tables=['transactions','recurring_transactions','credit_cards','credit_card_purchases','credit_card_installments','credit_card_invoices','savings_goals','savings_lots','savings_movements','manual_savings_updates','investment_assets','manual_investment_purchases','manual_investment_updates'];const result:Record<string,unknown>={};for(const table of tables){const query=await admin.from(table).select('*').eq('user_id',id).order('id');expect(query.error,table).toBeNull();result[table]=query.data;}return result;}

test('five modules preserve all original screens, figures, history and filters without modifying records',async({page})=>{
 test.setTimeout(180000);await page.setViewportSize({width:1440,height:1000});const f=await fixture(page);
 try{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const before=await records(f.id);const values=await page.locator('.dashboard-metric').allTextContents();expect(values).toHaveLength(8);
  await expect(page.locator('[data-dashboard-view=home]')).toBeVisible();await expect(page.locator('#dashboard-analises')).toHaveCount(0);
  await page.getByRole('navigation',{name:'Seções do módulo'}).getByRole('link',{name:'Dashboard completo',exact:true}).click();await expect(page.locator('.dashboard-section')).toHaveCount(12);expect(await page.locator('.dashboard-metric').allTextContents()).toEqual(values);
  const primary=page.locator('.desktop-navigation');await expect(primary.getByRole('link')).toHaveCount(6);
  for(const [module,tabs] of Object.entries(moduleTabs))for(const tab of tabs){
   await page.goto(tab.href);await expect(page.getByRole('navigation',{name:'Seções do módulo'}).getByRole('link',{name:tab.label,exact:true})).toHaveAttribute('aria-current','page');await expect(page.locator('.page-head h1')).toBeVisible();await expect(page.locator('.loading')).toHaveCount(0);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),tab.href).toBe(true);
   if(module==='patrimonio'&&tab.id==='caixinhas')await expect(page.getByRole('heading',{name:'Reserva da família',exact:true})).toBeVisible();
   if(module==='patrimonio'&&tab.id==='investimentos')await expect(page.getByRole('article',{name:'Investimento Fundo manual',exact:true})).toBeVisible();
   if(module==='cartoes'&&tab.id==='parcelas'){const parts=page.getByRole('region',{name:'Compras parceladas',exact:true});await expect(parts).toContainText('Computador parcelado');await expect(parts).not.toContainText('Compra à vista');await expect(parts.getByText('Parcela 3 de 3',{exact:false})).toBeVisible();}
   if(module==='analises'&&['economia','confiabilidade'].includes(tab.id))await expect(page.locator('.period-bar')).toHaveCount(0);
   if(module==='analises'&&tab.id==='graficos'){await expect(page.locator('#dashboard-analises')).toBeVisible();await expect(page.getByRole('button',{name:'12 meses',exact:true})).toBeVisible();}
   if(module==='configuracoes'&&tab.id==='categorias')await expect(page.getByText('Internet',{exact:true})).toBeVisible();
   if(['inicio','movimentacoes','patrimonio','analises'].includes(module)&&tabs[0].id===tab.id)await page.screenshot({path:`test-results/modules-${module}-1440.png`});
  }
  await page.goto('/cartoes/faturas');await page.getByLabel('Filtrar faturas por cartão').selectOption(f.card);await page.getByRole('button',{name:'Próximo mês',exact:true}).click();const next=await page.getByLabel('Mês das faturas').inputValue();await page.getByRole('navigation',{name:'Seções do módulo'}).getByRole('link',{name:'Compras',exact:true}).click();await expect(page.getByLabel('Filtrar compras por cartão')).toHaveValue(f.card);await expect(page.getByLabel('Mês das faturas')).toHaveValue(next);
  await page.goto('/movimentacoes');await page.getByLabel('Filtrar transações por status').selectOption('pending');await page.getByRole('navigation',{name:'Seções do módulo'}).getByRole('link',{name:'Recorrentes',exact:true}).click();await expect(page.getByRole('heading',{name:'Lançamentos recorrentes',exact:true})).toBeVisible();await page.goBack();await expect(page.getByLabel('Filtrar transações por status')).toHaveValue('pending');
  for(const path of ['/dashboard','/transacoes','/recorrentes','/contas','/categorias',`/caixinhas/${f.jar}`,'/investimentos','/planejamento','/relatorios']){await page.goto(path);await expect(page.locator('.page-head h1')).toBeVisible();await expect(page.locator('.loading')).toHaveCount(0);}
  await page.goto('/#dashboard-analises');await expect(page).toHaveURL(/\/inicio\/completo#dashboard-analises$/);await expect(page.locator('#dashboard-analises')).toBeVisible();
  expect(await records(f.id)).toEqual(before);expect(errors).toEqual([]);
 }finally{expect((await admin.auth.admin.deleteUser(f.id)).error).toBeNull();}
});

test('mobile navigation, global create actions, keyboard and every module remain accessible at narrow widths',async({page,context})=>{
 test.setTimeout(180000);await page.setViewportSize({width:390,height:844});const f=await fixture(page);
 try{
  const nav=page.getByRole('navigation',{name:'Navegação rápida'});await expect(nav.getByRole('link')).toHaveCount(5);for(const label of ['Início','Movimentações','Cartões','Patrimônio','Análises'])await expect(nav.getByRole('link',{name:label,exact:true})).toBeVisible();
  for(const width of [320,390,768,1024]){
   await page.setViewportSize({width,height:900});
   for(const path of ['/','/movimentacoes','/movimentacoes/recorrentes','/movimentacoes/programadas','/cartoes/parcelas','/patrimonio','/patrimonio/caixinhas','/patrimonio/investimentos','/analises','/analises/relatorios','/configuracoes/categorias']){
    await page.goto(path);await expect(page.locator('.page-head h1')).toBeVisible();await expect(page.locator('.loading')).toHaveCount(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth),`${path} at ${width}`).toBe(width);
    const cuts=await page.locator('.module-tabs a,.content .panel,.content .stat,.page-head h1,.mobile-bottom-nav a').evaluateAll(es=>es.filter(e=>{const b=e.getBoundingClientRect();return b.width>0&&(b.left< -1||b.right>innerWidth+1);}).map(e=>e.textContent?.slice(0,60)));expect(cuts,`${path} at ${width}`).toEqual([]);
    await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));await expect(page.locator('.content>footer')).toBeInViewport();
    if(width===390&&['/','/movimentacoes','/cartoes/parcelas','/patrimonio','/analises'].includes(path)){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`test-results/modules-${path.replaceAll('/','-')||'home'}-390.png`,fullPage:true});await page.screenshot({path:`test-results/modules-${path.replaceAll('/','-')||'home'}-390-viewport.png`});}
   }
  }
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  for(const [action,title] of [['Receita','Nova receita'],['Despesa','Nova despesa'],['Transferência','Transferir entre contas'],['Compra no cartão','Registrar compra'],['Gasto ou receita recorrente','Novo lançamento recorrente'],['Compromisso programado','Agendar compromisso'],['Conta','Nova conta'],['Cartão','Novo cartão'],['Caixinha','Nova caixinha'],['Orçamento','Novo orçamento'],['Meta financeira','Nova meta'],['Categoria ou subcategoria','Nova categoria']]){
   await page.getByRole('button',{name:'Adicionar',exact:true}).filter({visible:true}).click();const menu=page.getByRole('dialog',{name:'O que deseja adicionar?',exact:true});await expect(menu).toBeVisible();await menu.getByRole('button',{name:action,exact:false}).filter({has:page.getByText(action,{exact:true})}).click();const form=page.getByRole('dialog');await expect(form.getByRole('heading',{name:title,exact:true})).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(1);await form.getByRole('button',{name:'Cancelar',exact:true}).click();
  }
  await page.getByRole('button',{name:'Adicionar',exact:true}).filter({visible:true}).click();await page.getByRole('dialog').getByRole('link',{name:'Investimento',exact:false}).click();await expect(page.getByRole('dialog').getByRole('heading',{name:'Novo investimento',exact:true})).toBeVisible();await page.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click();await page.reload();await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'Adicionar',exact:true}).filter({visible:true}).click();await page.getByRole('dialog').getByRole('link',{name:'Investimento',exact:false}).click();await expect(page.getByRole('dialog').getByRole('heading',{name:'Novo investimento',exact:true})).toBeVisible();await page.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click();
  await page.goto('/movimentacoes');await page.getByRole('button',{name:'Nova despesa',exact:true}).click();const form=page.getByRole('dialog');await form.getByLabel('Descrição',{exact:true}).fill('Rascunho preservado');await form.getByLabel('Valor (R$)',{exact:true}).fill('123.45');const popupPromise=context.waitForEvent('page');await form.getByRole('link',{name:'Gerenciar categorias',exact:false}).click();const popup=await popupPromise;await expect(popup).toHaveURL(/\/configuracoes\/categorias$/);await popup.getByRole('button',{name:'Nova categoria',exact:true}).click();await popup.getByRole('dialog').getByLabel('Nome',{exact:true}).fill('Criada durante o cadastro');await popup.getByRole('dialog').getByRole('button',{name:'Salvar',exact:true}).click();await expect(popup.getByRole('dialog')).toHaveCount(0);await popup.close();await page.bringToFront();await expect(form.getByLabel('Descrição',{exact:true})).toHaveValue('Rascunho preservado');await expect(form.getByLabel('Valor (R$)',{exact:true})).toHaveValue('123.45');await expect(form.getByLabel('Categoria',{exact:true}).getByRole('option',{name:'Criada durante o cadastro',exact:true})).toHaveCount(1);await form.getByRole('button',{name:'Cancelar',exact:true}).click();
  await page.getByRole('button',{name:'Abrir menu',exact:true}).click();await page.getByRole('dialog',{name:'Todos os recursos'}).getByRole('link',{name:'Configurações',exact:true}).click();await expect(page).toHaveURL(/\/configuracoes$/);
 }finally{expect((await admin.auth.admin.deleteUser(f.id)).error).toBeNull();}
});

test('existing settlement and create operations refresh the new home and movement screens with the same financial totals',async({page})=>{
 test.setTimeout(90000);const f=await fixture(page);
 try{
  const agenda=page.getByRole('region',{name:'Contas previstas do período',exact:true});await expect(agenda).toContainText('Internet planejada');await agenda.getByRole('button',{name:'Pagar',exact:true}).click();const settlement=page.getByRole('dialog');await expect(settlement.getByRole('heading')).toHaveText('Pagar conta');await settlement.getByRole('button',{name:'Confirmar pagamento',exact:true}).click();await expect(settlement).toHaveCount(0);await expect(page.getByRole('article',{name:'Saldo disponível',exact:true})).toContainText('3.940,10');await expect(agenda).not.toContainText('Internet planejada');await expect(page.getByRole('article',{name:'Gastos do mês',exact:true})).toContainText('184,90');
  await page.getByRole('button',{name:'Adicionar',exact:true}).filter({visible:true}).click();await page.getByRole('dialog',{name:'O que deseja adicionar?',exact:true}).getByRole('button',{name:'Receita Recebida ou prevista',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Descrição',{exact:true}).fill('Receita pelo menu global');await dialog.getByLabel('Conta',{exact:true}).selectOption(f.bank);await dialog.getByLabel('Valor (R$)',{exact:true}).fill('100');await dialog.getByLabel('Status',{exact:true}).selectOption('confirmed');await dialog.getByRole('button',{name:'Salvar',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.getByRole('article',{name:'Saldo disponível',exact:true})).toContainText('4.040,10');await expect(page.getByRole('article',{name:'Receitas do período',exact:true})).toContainText('1.100,00');
  await page.getByRole('navigation',{name:'Navegação principal'}).getByRole('link',{name:'Movimentações',exact:true}).click();await expect(page.getByRole('region',{name:'Histórico de transações',exact:true})).toContainText('Receita pelo menu global');const snap=await(await page.request.get('/api/snapshot')).json();expect(snap.transactions.filter((t:{description:string})=>t.description==='Receita pelo menu global')).toHaveLength(1);expect(snap.transactions.filter((t:{description:string})=>t.description==='Internet planejada')).toHaveLength(1);
  await page.getByRole('button',{name:'Adicionar',exact:true}).filter({visible:true}).click();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);const analytics=page.getByRole('navigation',{name:'Navegação principal'}).getByRole('link',{name:'Análises',exact:true});await analytics.focus();await page.keyboard.press('Enter');await expect(page).toHaveURL(/\/analises$/);await expect(page.locator('#dashboard-analises')).toBeVisible();
 }finally{expect((await admin.auth.admin.deleteUser(f.id)).error).toBeNull();}
});

test('new summary keeps large negative amounts readable and pages scroll naturally on small phones and notebooks',async({page})=>{
 test.setTimeout(90000);const f=await fixture(page);
 try{
  expect((await admin.from('financial_accounts').update({initial_balance:'-123456789012345.67'}).eq('id',f.bank)).error).toBeNull();
  await page.reload();await expect(page.locator('.dashboard-hero-main>strong')).toHaveClass(/negative/);
  for(const [width,height] of [[320,740],[390,844],[768,900],[1280,720],[1440,900]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));await expect(page.locator('.dashboard-metric')).toHaveCount(8);
   await expect.poll(()=>page.locator('.dashboard-amount').evaluateAll(es=>es.filter(e=>{if(!e.clientWidth)return false;const r=document.createRange();r.selectNodeContents(e);return r.getBoundingClientRect().width>e.clientWidth+2;}).map(e=>e.textContent))).toEqual([]);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);await page.mouse.wheel(0,100000);await expect(page.locator('.content>footer')).toBeInViewport();
  }
 }finally{expect((await admin.auth.admin.deleteUser(f.id)).error).toBeNull();}
});

test('changing the authenticated account clears private drafts and cached financial data across tabs',async({page,context})=>{
 test.setTimeout(60000);const f=await fixture(page),email=`module-other-${randomUUID()}@example.test`,password=randomUUID()+'Aa1!';const other=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(other.error).toBeNull();const otherId=other.data.user!.id;
 try{
  expect((await admin.from('financial_accounts').insert({user_id:otherId,name:'Conta exclusiva B',kind:'bank',initial_balance:'777'})).error).toBeNull();
  await page.getByRole('button',{name:'Nova despesa',exact:true}).click();await page.getByRole('dialog').getByLabel('Descrição',{exact:true}).fill('Rascunho privado A');
  const second=await context.newPage();await second.goto('http://localhost:3000/configuracoes');await second.getByRole('button',{name:'Sair',exact:true}).filter({visible:true}).click();await expect(page.getByLabel('E-mail')).toBeVisible();
  await second.getByLabel('E-mail').fill(email);await second.getByLabel('Senha',{exact:true}).fill(password);await second.getByRole('button',{name:'Entrar na minha conta'}).click();await expect(page.getByRole('article',{name:'Saldo disponível',exact:true})).toContainText('777,00');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByText('Rascunho privado A',{exact:true})).toHaveCount(0);await expect(page.getByText('Salário do mês',{exact:true})).toHaveCount(0);await second.close();
 }finally{await admin.auth.admin.deleteUser(otherId);expect((await admin.auth.admin.deleteUser(f.id)).error).toBeNull();}
});
