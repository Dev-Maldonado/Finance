import {test,expect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {dateShift} from '../../src/lib/dashboard';
import {shiftInvoiceMonth} from '../../src/lib/card-invoices';
if(!['localhost','127.0.0.1'].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname))throw Error('Local disposable users only');
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
test('preferences, quick entry, receiving and paying preserve original dues and synchronize cash',async({page})=>{
 test.setTimeout(120000);
 const email=`practical-${randomUUID()}@example.test`,password=randomUUID()+'Aa1!',user=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(user.error).toBeNull();const uid=user.data.user!.id;
 try{
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date()),next=shiftInvoiceMonth(today.slice(0,7),1),previous=shiftInvoiceMonth(today.slice(0,7),-1);
  const a=await admin.from('financial_accounts').insert({user_id:uid,name:'Conta preferida',kind:'bank',initial_balance:'1000'}).select('id').single();expect(a.error).toBeNull();
  const categories=await admin.from('categories').insert([{user_id:uid,name:'Receita padrão'},{user_id:uid,name:'Despesa padrão'}]).select('id,name');expect(categories.error).toBeNull();const income=categories.data!.find(c=>c.name==='Receita padrão')!.id,expense=categories.data!.find(c=>c.name==='Despesa padrão')!.id;
  expect((await admin.from('transactions').insert([{description:'Receita atrasada',type:'income',amount:'200',date:`${previous}-01`},{description:'Despesa futura',type:'expense',amount:'-50',date:`${next}-01`},{description:'Vencimento próximo',type:'expense',amount:'-15',date:dateShift(today,2)}].map(t=>({...t,user_id:uid,account_id:a.data!.id,status:'pending'})))).error).toBeNull();
  await page.route('**/api/economic-indicators*',r=>r.fulfill({status:503,json:{error:'Unavailable test source'}}));
  await page.goto('/configuracoes');await page.getByLabel('E-mail').fill(email);await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar na minha conta'}).click();
  await page.getByRole('button',{name:'Ajustar preferências e meses da reserva'}).click();let dialog=page.getByRole('dialog');await dialog.getByLabel('Conta padrão',{exact:true}).selectOption(a.data!.id);await dialog.getByLabel('Categoria padrão de despesas',{exact:true}).selectOption(expense);await dialog.getByLabel('Categoria padrão de receitas',{exact:true}).selectOption(income);await dialog.getByRole('button',{name:'Salvar',exact:true}).click();await expect(dialog).toHaveCount(0);
  await page.goto('/transacoes');await page.getByRole('button',{name:'Nova receita',exact:true}).click();dialog=page.getByRole('dialog');await expect(dialog.getByLabel('Tipo',{exact:true})).toHaveValue('income');await expect(dialog.getByLabel('Conta',{exact:true})).toHaveValue(a.data!.id);await expect(dialog.getByLabel('Categoria',{exact:true})).toHaveValue(income);await dialog.getByLabel('Tipo',{exact:true}).selectOption('expense');await expect(dialog.getByLabel('Categoria',{exact:true})).toHaveValue(expense);await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();
  // Use the period control to include the old receivable.
  await page.getByRole('button',{name:'Mês anterior',exact:true}).click();let row=page.getByRole('row').filter({hasText:'Receita atrasada'});await row.getByRole('button',{name:'Receber',exact:true}).click();dialog=page.getByRole('dialog');await expect(dialog.getByLabel('Conta do pagamento ou recebimento')).toHaveValue(a.data!.id);await dialog.getByRole('button',{name:'Confirmar recebimento'}).click();await expect(dialog).toHaveCount(0);await expect(row).toContainText('Recebido');
  const balance=async(expected:string)=>{const r=await admin.from('account_balances').select('balance').eq('id',a.data!.id).single();expect(r.error).toBeNull();expect(r.data!.balance).toBe(expected);};await balance('1200.00');
  await page.goto('/recorrentes');await page.getByLabel('Mês das contas recorrentes').fill(next);const scheduled=page.getByRole('region',{name:'Gastos programados',exact:true});await scheduled.getByLabel('Despesa futura',{exact:true}).getByRole('button',{name:'Pagar',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Confirmar pagamento'}).click();await expect(dialog).toHaveCount(0);await expect(scheduled).not.toContainText('Despesa futura');await balance('1150.00');
  const paid=await admin.from('transactions').select('date,settled_on,status').eq('user_id',uid).eq('description','Despesa futura').single();expect(paid.data).toEqual({date:`${next}-01`,settled_on:today,status:'confirmed'});
  await page.getByRole('button',{name:'Próximos 7 dias',exact:true}).click();await expect(scheduled).toContainText('Vencimento próximo');await expect(scheduled).not.toContainText('Despesa futura');
  await expect(page.getByRole('article',{name:'Saldo atual das contas',exact:true})).toContainText('R$ 1.150,00');await expect(page.getByRole('article',{name:'Saldo após contas previstas',exact:true})).toContainText('R$ 1.135,00');
  for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);}
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:'test-results/practical-finance-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:'test-results/practical-finance-mobile.png',fullPage:true});
 }finally{expect((await admin.auth.admin.deleteUser(uid)).error).toBeNull();}
});
