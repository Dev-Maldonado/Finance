import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { shiftInvoiceMonth } from '../../src/lib/card-invoices';
if (!['localhost','127.0.0.1'].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname)) throw Error('Use only local test data');
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});

test('monthly bills combine installments, fixed and scheduled expenses; scoped edits preserve history and synchronize amounts',async({page})=>{
  test.setTimeout(120000);
  const email=`bills-${randomUUID()}@example.test`, password=randomUUID()+'Aa1!';
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(created.error).toBeNull();const uid=created.data.user!.id;
  try {
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date()), month=today.slice(0,7), previous=shiftInvoiceMonth(month,-1), next=shiftInvoiceMonth(month,1), second=shiftInvoiceMonth(month,2), third=shiftInvoiceMonth(month,3);
    const account=await admin.from('financial_accounts').insert({user_id:uid,name:'Conta principal',kind:'bank',initial_balance:'1000'}).select('id').single();expect(account.error).toBeNull();
    const recurring=await admin.from('recurring_transactions').insert({user_id:uid,account_id:account.data!.id,description:'Internet da família',type:'expense',amount:'59.90',frequency:'monthly',next_date:`${previous}-01`}).select('id').single();expect(recurring.error).toBeNull();
    const card=await admin.from('credit_cards').insert({user_id:uid,account_id:account.data!.id,name:'Cartão principal',credit_limit:'5000',closing_day:5,due_day:10}).select('id').single();expect(card.error).toBeNull();
    await page.route('**/api/economic-indicators',r=>r.fulfill({status:503,json:{error:'Unavailable test source'}}));
    await page.goto('/recorrentes');await page.getByLabel('E-mail').fill(email);await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar na minha conta'}).click();
    await expect(page.getByRole('heading',{name:'Contas Recorrentes',exact:true})).toBeVisible();
    const generated=await page.request.post('/api/recurring',{headers:{Origin:'http://localhost:3000'},data:{}});expect(generated.ok(),await generated.text()).toBe(true);
    await expect(page.getByRole('article',{name:'Total previsto a pagar',exact:true})).toBeVisible();
    const historical=await admin.from('transactions').select('*').eq('user_id',uid).eq('source_id',`recurrence:${recurring.data!.id}:${previous}-01`).single();expect(historical.error).toBeNull();
    expect((await admin.from('transactions').update({status:'confirmed'}).eq('id',historical.data!.id)).error).toBeNull();
    const before=await admin.from('transactions').select('*').eq('id',historical.data!.id).single();
    const op=async(action:string,payload:Record<string,unknown>)=>{const r=await page.request.post('/api/operations',{headers:{Origin:'http://localhost:3000'},data:{action,payload,request_id:randomUUID()}});expect(r.ok(),await r.text()).toBe(true);return r.json();};
    await op('purchase',{card_id:card.data!.id,description:'Notebook parcelado',amount:'300.01',installments:3,date:`${month}-01`});
    await page.getByRole('button',{name:'Atualizar dados',exact:true}).click();
    const nav=page.getByRole('region',{name:'Navegação mensal de contas recorrentes'}), picker=page.getByLabel('Mês das contas recorrentes');
    const value=(label:string)=>page.getByRole('article',{name:label,exact:true}).locator('strong');
    const fixed=page.getByRole('region',{name:'Gastos fixos',exact:true}), scheduled=page.getByRole('region',{name:'Gastos programados',exact:true});
    await nav.getByRole('button',{name:'Próximo mês',exact:true}).click();await expect(picker).toHaveValue(next);
    await page.getByRole('button',{name:'Gasto programado',exact:true}).click();
    let dialog=page.getByRole('dialog');await expect(dialog.getByLabel('Data',{exact:true})).toHaveValue(`${next}-01`);
    await dialog.getByLabel('Descrição',{exact:true}).fill('Seguro programado');await dialog.getByLabel('Conta',{exact:true}).selectOption(account.data!.id);await dialog.getByLabel('Valor (R$)',{exact:true}).fill('40.10');await dialog.getByRole('button',{name:'Salvar',exact:true}).click();await expect(dialog).toHaveCount(0);
    await expect(value('Total previsto a pagar')).toHaveText('R$ 200,00');await expect(value('Parcelas de cartões')).toHaveText('R$ 100,00');await expect(value('Gastos fixos')).toHaveText('R$ 59,90');await expect(value('Gastos programados')).toHaveText('R$ 40,10');
    await expect(page.locator('.commitment-invoice')).toContainText('Parcela 2 de 3');await expect(page.locator('.commitment-invoice')).toContainText('Cartão principal');
    const change=async(amount:string,future=false)=>{await fixed.getByRole('button',{name:'Editar',exact:true}).click();dialog=page.getByRole('dialog');if(future){await dialog.getByLabel('Vencimento',{exact:true}).fill(`${next}-07`);}await dialog.getByRole('radio',{name:future?/Este mês e os próximos/:/Somente este mês/}).check();if(future){await expect(dialog.getByLabel('Vencimento',{exact:true})).toHaveValue(`${next}-03`);}else{await dialog.getByLabel('Vencimento',{exact:true}).fill(`${next}-03`);}await dialog.getByLabel('Valor (R$)',{exact:true}).fill(amount);await dialog.getByRole('button',{name:'Salvar',exact:true}).click();await expect(dialog).toHaveCount(0);};
    await change('65.90');await expect(value('Gastos fixos')).toHaveText('R$ 65,90');await expect(value('Total previsto a pagar')).toHaveText('R$ 206,00');
    await picker.fill(second);await expect(value('Gastos fixos')).toHaveText('R$ 59,90');
    await fixed.getByRole('button',{name:'Excluir',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Excluir',exact:true}).click();await expect(value('Gastos fixos')).toHaveText('R$ 0,00');
    await picker.fill(next);await change('70.25',true);await expect(value('Gastos fixos')).toHaveText('R$ 70,25');
    await picker.fill(second);await expect(value('Gastos fixos')).toHaveText('R$ 0,00');await picker.fill(third);await expect(value('Gastos fixos')).toHaveText('R$ 70,25');
    await fixed.getByRole('button',{name:'Excluir',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByRole('radio',{name:/Este mês e os próximos/}).check();await dialog.getByRole('button',{name:'Excluir',exact:true}).click();await expect(value('Gastos fixos')).toHaveText('R$ 0,00');
    await picker.fill(shiftInvoiceMonth(third,1));await expect(value('Gastos fixos')).toHaveText('R$ 0,00');
    await picker.fill(next);await scheduled.getByRole('button',{name:'Editar',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByLabel('Valor (R$)',{exact:true}).fill('50.10');await dialog.getByRole('button',{name:'Salvar',exact:true}).click();await expect(value('Total previsto a pagar')).toHaveText('R$ 220,35');
    await scheduled.getByRole('button',{name:'Excluir',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Excluir',exact:true}).click();await expect(value('Total previsto a pagar')).toHaveText('R$ 170,25');
    await page.getByRole('button',{name:'Editar parcela',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByLabel('Valor da parcela (R$)',{exact:true}).fill('105');await dialog.getByRole('button',{name:'Salvar',exact:true}).click();await expect(value('Parcelas de cartões')).toHaveText('R$ 105,00');
    const invoice=await admin.from('credit_card_invoices').select('id').eq('card_id',card.data!.id).eq('due_date',`${next}-10`).single();expect(invoice.error).toBeNull();await op('pay_invoice',{invoice_id:invoice.data!.id,account_id:account.data!.id,amount:'25',date:today});await page.getByRole('button',{name:'Atualizar dados',exact:true}).click();
    await expect(value('Parcelas de cartões')).toHaveText('R$ 80,00');await expect(value('Total previsto a pagar')).toHaveText('R$ 150,25');await expect(page.locator('.commitment-invoice')).toContainText('sem distribuir pagamentos arbitrariamente');await expect(page.getByRole('button',{name:'Editar parcela',exact:true})).toHaveCount(0);
    for(const width of [320,390,768,1280]) {await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);await expect(value('Total previsto a pagar')).toHaveText('R$ 150,25');if(width===390)await page.screenshot({path:'test-results/recurring-bills-mobile.png',fullPage:true});if(width===1280)await page.screenshot({path:'test-results/recurring-bills-desktop.png',fullPage:true});
      if(width===320){await fixed.getByRole('button',{name:'Editar',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByRole('radio',{name:/Este mês e os próximos/}).check();await expect(dialog.getByLabel('Vencimento',{exact:true})).toHaveAttribute('readonly','');await dialog.getByRole('button',{name:'Salvar',exact:true}).scrollIntoViewIfNeeded();await expect(dialog.getByRole('button',{name:'Salvar',exact:true})).toBeInViewport();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();}}
    await nav.getByRole('button',{name:'Mês atual',exact:true}).click();await expect(value('Gastos fixos')).toHaveText('R$ 59,90');
    expect((await admin.from('transactions').select('*').eq('id',historical.data!.id).single()).data).toEqual(before.data);
    const balance=await admin.from('account_balances').select('balance').eq('id',account.data!.id).single();expect(balance.data!.balance).toBe('915.10');
    await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Mais opções',exact:true}).click();await expect(page.getByRole('dialog',{name:'Todos os recursos'}).getByRole('link',{name:'Contas Recorrentes',exact:true})).toBeVisible();
  }finally{expect((await admin.auth.admin.deleteUser(uid)).error).toBeNull();}
});

test('fixed and scheduled pending expenses do not debit cash; only confirmed entries dated through today do',async({page})=>{
  test.setTimeout(90000);
  const email=`cash-rules-${randomUUID()}@example.test`,password=randomUUID()+'Aa1!';
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(created.error).toBeNull();const uid=created.data.user!.id;
  try{
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date()),next=shiftInvoiceMonth(today.slice(0,7),1);
    const account=await admin.from('financial_accounts').insert({user_id:uid,name:'Conta do saldo',kind:'bank',initial_balance:'1000'}).select('id').single();expect(account.error).toBeNull();
    const rec=await admin.from('recurring_transactions').insert({user_id:uid,account_id:account.data!.id,description:'Internet pendente',type:'expense',amount:'100',frequency:'monthly',next_date:today}).select('id').single();expect(rec.error).toBeNull();
    await page.goto('/recorrentes');await page.getByLabel('E-mail').fill(email);await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar na minha conta'}).click();
    const total=page.getByRole('article',{name:'Total previsto a pagar',exact:true}).locator('strong');await expect(total).toHaveText('R$ 100,00');
    const balance=async(expected:string)=>{const r=await admin.from('account_balances').select('balance').eq('id',account.data!.id).single();expect(r.error).toBeNull();expect(r.data!.balance).toBe(expected);};
    await balance('1000.00');
    await page.getByRole('button',{name:'Gasto programado',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByLabel('Status',{exact:true})).toHaveValue('pending');await dialog.getByLabel('Descrição',{exact:true}).fill('Gasto programado pendente');await dialog.getByLabel('Valor (R$)',{exact:true}).fill('50');await dialog.getByLabel('Conta',{exact:true}).selectOption(account.data!.id);await dialog.getByRole('button',{name:'Salvar',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(total).toHaveText('R$ 150,00');await balance('1000.00');
    const request=async(url:string,data:Record<string,unknown>)=>{const r=await page.request.post(url,{headers:{Origin:'http://localhost:3000'},data});expect(r.ok(),await r.text()).toBe(true);};
    await request('/api/operations',{action:'transaction',request_id:randomUUID(),payload:{account_id:account.data!.id,description:'Confirmado com data futura',type:'expense',amount:'25',date:`${next}-01`,status:'confirmed'}});await balance('1000.00');
    const data=await(await page.request.get('/api/snapshot')).json();
    for(const [description,amount,expected] of [['Gasto programado pendente','50','950.00'],['Internet pendente','100','850.00']]){
      const tx=data.transactions.find((t:{description:string})=>t.description===description);expect(tx.status).toBe('pending');
      await request('/api/transactions',{transaction_id:tx.id,replacement:{account_id:account.data!.id,description,type:'expense',amount,date:today,status:'confirmed'}});await balance(expected);
    }
    await page.getByRole('button',{name:'Atualizar dados',exact:true}).click();await expect(total).toHaveText('R$ 0,00');
    await page.getByLabel('Mês das contas recorrentes').fill(next);await expect(page.getByRole('article',{name:'Gastos programados',exact:true}).locator('strong')).toHaveText('R$ 25,00');await balance('850.00');
  }finally{expect((await admin.auth.admin.deleteUser(uid)).error).toBeNull();}
});
