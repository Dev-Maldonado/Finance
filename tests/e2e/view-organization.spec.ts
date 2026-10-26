import {test,expect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {dateShift} from '../../src/lib/dashboard';
import {shiftInvoiceMonth} from '../../src/lib/card-invoices';
if(!['localhost','127.0.0.1'].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname))throw Error('Local disposable users only');
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
test('screen organization preserves filters across navigation/reload, uses URL month and keeps all content accessible',async({page})=>{
 test.setTimeout(120000);
 const users:string[]=[],password=randomUUID()+'Aa1!';
 try{
  const email=`view-${randomUUID()}@example.test`,u=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(u.error).toBeNull();const uid=u.data.user!.id;users.push(uid);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date()),month=today.slice(0,7),next=shiftInvoiceMonth(month,1);
  const account=await admin.from('financial_accounts').insert({user_id:uid,name:'Conta preferida com nome completo para testar o encaixe',kind:'bank',initial_balance:'1000'}).select('id').single();expect(account.error).toBeNull();
  const card=await admin.from('credit_cards').insert({user_id:uid,account_id:account.data!.id,name:'Cartão da família com identificação completa',credit_limit:'10000',closing_day:5,due_day:10}).select('id').single();expect(card.error).toBeNull();
  const tx=await admin.from('transactions').insert([{description:'Conta atrasada para organizar',date:dateShift(today,-2),amount:'-25'},{description:'Conta da semana para organizar',date:dateShift(today,2),amount:'-15'}].map(t=>({...t,user_id:uid,account_id:account.data!.id,status:'pending',type:'expense'})));expect(tx.error).toBeNull();
  await page.route('**/api/economic-indicators*',r=>r.fulfill({status:503,json:{error:'Unavailable test source'}}));
  const login=async(email:string)=>{await page.getByLabel('E-mail').fill(email);await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar na minha conta'}).click();};
  await page.goto('/transacoes');await login(email);await expect(page.getByRole('row').filter({hasText:'Conta atrasada para organizar'})).toBeVisible();
  await page.getByLabel('Filtrar transações por conta').selectOption(account.data!.id);await page.getByLabel('Filtrar transações por status').selectOption('pending');
  await expect(page.getByRole('group',{name:'Seleção das transações'})).toContainText('Conta preferida com nome completo');
  await page.goto('/cartoes');await expect(page.locator('.invoice-context')).toContainText('Todos os cartões');
  expect(await page.locator('#faturas-do-mes').evaluate(el=>!!(el.compareDocumentPosition(document.querySelector('#meus-cartoes')!)&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await page.getByLabel('Filtrar faturas por cartão').selectOption(card.data!.id);await page.getByLabel('Mês das faturas').fill(next);
  await page.goto('/transacoes');await expect(page.getByLabel('Filtrar transações por conta')).toHaveValue(account.data!.id);await expect(page.getByLabel('Filtrar transações por status')).toHaveValue('pending');
  await page.reload();await expect(page.getByLabel('Filtrar transações por status')).toHaveValue('pending');await page.getByRole('button',{name:'Remover filtro Status',exact:true}).click();await expect(page.getByLabel('Filtrar transações por status')).toHaveValue('');
  await page.goto('/cartoes');await expect(page.getByLabel('Mês das faturas')).toHaveValue(next);await expect(page.getByLabel('Filtrar faturas por cartão')).toHaveValue(card.data!.id);
  await page.goto(`/cartoes?month=${month}`);await expect(page.getByLabel('Mês das faturas')).toHaveValue(month);
  await page.goto('/recorrentes');await page.getByRole('button',{name:'Atrasadas',exact:true}).click();await expect(page.getByRole('region',{name:'Gastos programados',exact:true})).toContainText('Em atraso');await expect(page.getByRole('article',{name:'Total previsto a pagar',exact:true})).toContainText('R$ 25,00');
  await page.goto('/contas');await page.goto('/recorrentes');await expect(page.getByRole('button',{name:'Atrasadas',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Próximos 7 dias',exact:true}).click();await expect(page.getByRole('article',{name:'Total previsto a pagar',exact:true})).toContainText('R$ 15,00');
  await page.getByRole('button',{name:'Nova receita',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Dados do lançamento');await expect(page.getByRole('dialog').getByRole('heading',{name:'Nova receita'})).toBeVisible();await page.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click();
  for(const width of [320,390,768,1024,1280,1920]){await page.setViewportSize({width,height:width===1024?430:844});await page.goto('/transacoes');await expect(page.getByRole('region',{name:'Histórico de transações',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
   const tabs=await page.locator('.period-tabs button').evaluateAll(elements=>elements.filter(e=>{const r=e.getBoundingClientRect();return r.left<0||r.right>innerWidth+1;}).map(e=>e.textContent));expect(tabs).toEqual([]);
   const clipped=await page.locator('.transaction-list').evaluate(root=>[...root.querySelectorAll('td,strong,button')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.left<0||r.right>innerWidth+1);}).map(e=>e.textContent));expect(clipped).toEqual([]);
   if(width===390||width===1280){await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:`test-results/organized-transactions-${width}.png`,fullPage:true});}}
  // The next account must never inherit this account's saved selectors.
  const otherEmail=`view-other-${randomUUID()}@example.test`,other=await admin.auth.admin.createUser({email:otherEmail,password,email_confirm:true});expect(other.error).toBeNull();users.push(other.data.user!.id);
  await page.setViewportSize({width:1280,height:900});await page.getByRole('button',{name:'Sair',exact:true}).click();await login(otherEmail);await expect(page.getByLabel('Filtrar transações por conta')).toHaveValue('');
 }finally{for(const uid of users)expect((await admin.auth.admin.deleteUser(uid)).error).toBeNull();}
});
