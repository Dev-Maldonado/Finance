import {test,expect,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {layoutAdmin as admin} from './support/layout-fixture';
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
async function setup(page:Page){
 const email=`motion-${randomUUID()}@example.test`,password=randomUUID()+'Aa1!';
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(created.error).toBeNull();
 const user=created.data.user!.id;
 try{
  const accounts=await admin.from('financial_accounts').insert([{user_id:user,name:'Conta principal',kind:'bank',initial_balance:'1000'},{user_id:user,name:'Segunda conta',kind:'bank',initial_balance:'0'}]).select('id,name');expect(accounts.error).toBeNull();
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.route('**/api/economic-indicators*',r=>r.fulfill({status:503,json:{error:'Local isolated test'}}));
  await page.goto('/');await page.getByLabel('E-mail').fill(email);await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar na minha conta'}).click();await expect(page.getByRole('article',{name:'Saldo disponível',exact:true})).toBeVisible();
  return {user,accounts:accounts.data!};
 }catch(error){await admin.auth.admin.deleteUser(user);throw error;}
}
async function save(page:Page,kind:string){
 await page.getByRole('dialog').getByRole('button',{name:'Salvar',exact:true}).click();
 await expect(page.getByRole('dialog')).not.toBeVisible();
 const effect=page.locator('[data-financial-effect]');await expect(effect).toHaveAttribute('data-financial-effect',kind);
 expect(await effect.evaluate(el=>getComputedStyle(el).pointerEvents)).toBe('none');
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 return effect;
}
async function newTransaction(page:Page,account:string,description:string,type='income',status='confirmed',date=today){
 await page.getByRole('button',{name:'Novo lançamento',exact:true}).click();const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Descrição',{exact:true}).fill(description);await dialog.getByLabel('Tipo',{exact:true}).selectOption(type);await dialog.getByLabel('Valor (R$)',{exact:true}).fill('100');await dialog.getByLabel('Conta',{exact:true}).selectOption(account);await dialog.getByLabel('Status',{exact:true}).selectOption(status);await dialog.getByLabel('Data',{exact:true}).fill(date);
}
test('confirmed, pending, future, transfer and failed saves get accurate feedback on mobile',async({page})=>{
 test.setTimeout(120000);await page.setViewportSize({width:390,height:844});const {user,accounts}=await setup(page);const a=accounts.find(a=>a.name==='Conta principal')!,b=accounts.find(a=>a.name==='Segunda conta')!;
 try{
  await page.goto('/transacoes');
  await newTransaction(page,a.id,'Entrada confirmada');await save(page,'income');
  await expect(page.locator('.financial-particle')).toHaveCount(7);
  await page.screenshot({path:'test-results/motion-income-mobile.png'});
  await expect.poll(async()=> (await admin.from('account_balances').select('balance').eq('id',a.id).single()).data?.balance).toBe('1100.00');
  await newTransaction(page,a.id,'Entrada pendente','income','pending');await save(page,'success');await expect(page.locator('.financial-particle')).toHaveCount(0);
  await newTransaction(page,a.id,'Entrada futura','income','confirmed','2099-12-01');await save(page,'success');
  await newTransaction(page,a.id,'Despesa confirmada','expense');await save(page,'expense');
  await page.getByRole('button',{name:'Transferir',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Origem',{exact:true}).selectOption(a.id);await dialog.getByLabel('Destino',{exact:true}).selectOption(b.id);await dialog.getByLabel('Valor (R$)',{exact:true}).fill('50');await save(page,'transfer');await expect(page.locator('.financial-transfer-route')).toBeVisible();
  await expect.poll(async()=> (await admin.from('account_balances').select('balance').eq('id',a.id).single()).data?.balance).toBe('950.00');
  await page.goto('/transacoes');await expect(page.locator('[data-financial-effect]')).toHaveCount(0);
  await page.route('**/api/operations',r=>r.fulfill({status:500,json:{error:'Falha de teste ao salvar'}}));await newTransaction(page,a.id,'Falha isolada');await dialog.getByRole('button',{name:'Salvar',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Falha de teste');await expect(page.locator('[data-financial-effect]')).toHaveCount(0);
  expect((await admin.from('transactions').select('id').eq('user_id',user).eq('description','Falha isolada')).data).toHaveLength(0);
  await page.unroute('**/api/operations');await page.emulateMedia({reducedMotion:'reduce'});await save(page,'income');
  const effect=page.locator('[data-financial-effect]');await expect(effect).toHaveAttribute('data-reduced-motion','true');await expect(effect.locator('.financial-effect-stage')).toHaveCount(0);expect(await effect.evaluate(el=>el.getAnimations({subtree:true}).length)).toBe(0);
  await expect(effect).toHaveCount(0,{timeout:5000});
 }finally{expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();}
});
test('goals, manual valuation growth and card interaction remain contextual and respect reduced motion',async({page})=>{
 test.setTimeout(120000);const {user,accounts}=await setup(page);const account=accounts.find(a=>a.name==='Conta principal')!;
 try{
  const previous=new Date(`${today}T12:00:00Z`);previous.setUTCDate(0);const prior=previous.toISOString().slice(0,10);
  const send=async(url:string,data:Record<string,unknown>)=>{const r=await page.request.post(url,{headers:{Origin:'http://localhost:3000'},data:{...data,request_id:randomUUID()}});expect(r.ok(),await r.text()).toBe(true);};
  await send('/api/manual-savings/create',{name:'Meta visual',initial_balance:'100',target:'200',date:prior});
  await send('/api/manual-investments/create',{name:'Fundo visual',manual_kind:'fund',quantity:'10',amount:'1000',date:prior});
  const asset=(await admin.from('investment_assets').select('id').eq('user_id',user).single()).data!;
  await send(`/api/manual-investments/price?asset_id=${asset.id}`,{price:'100',date:prior});
  await page.goto('/caixinhas');await page.getByRole('button',{name:'Aportar',exact:true}).click();let dialog=page.getByRole('dialog');await dialog.getByLabel('Caixinha',{exact:true}).selectOption({label:'Meta visual'});await dialog.getByLabel('Conta',{exact:true}).selectOption(account.id);await dialog.getByLabel('Valor (R$)',{exact:true}).fill('100');await save(page,'goal');await expect(page.locator('.financial-particle')).toHaveCount(12);await page.screenshot({path:'test-results/motion-goal-desktop.png'});
  await page.goto('/investimentos');await page.getByRole('button',{name:'Atualizar valor',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByLabel('Valor atual por unidade ou cota (R$)',{exact:true}).fill('120');await save(page,'growth');await expect(page.locator('.financial-growth-line')).toBeVisible();
  const values=await admin.from('manual_investment_updates').select('price').eq('user_id',user).order('date');expect(values.data?.map(v=>Number(v.price))).toEqual([100,120]);
  const card=await admin.from('credit_cards').insert({user_id:user,account_id:account.id,name:'Cartão visual',last_four:'1234',credit_limit:'1000',closing_day:5,due_day:10});expect(card.error).toBeNull();
  await page.goto('/cartoes');const bank=page.locator('.bank-card');await expect(bank).toBeVisible();await bank.hover({position:{x:30,y:30}});await expect(bank).toHaveAttribute('data-card-active','');await expect.poll(()=>bank.evaluate(el=>getComputedStyle(el).transform)).not.toBe('none');
  await page.mouse.move(0,0);await expect(bank).not.toHaveAttribute('data-card-active','');
  await page.emulateMedia({reducedMotion:'reduce'});await bank.hover({position:{x:30,y:30}});await expect(bank).not.toHaveAttribute('data-card-active','');await expect(bank).toHaveCSS('transform','none');
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:844});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  await page.screenshot({path:'test-results/motion-cards-desktop.png'});
 }finally{expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();}
});
test('updated indicators retain exact values while animation never treats a filter change as a gain',async({page})=>{
 test.setTimeout(60000);await page.setViewportSize({width:1440,height:2000});const {user,accounts}=await setup(page);const a=accounts.find(a=>a.name==='Conta principal')!;
 try{
  const balance=page.getByRole('article',{name:'Saldo disponível',exact:true}).locator(':scope > strong');await expect(balance).toContainText('1.000,00');
  await page.evaluate(()=>{
   const observed:string[]=[];(window as unknown as {motionValues:string[]}).motionValues=observed;
   new MutationObserver(records=>{for(const record of records){const el=record.target as HTMLElement;if(el.matches('[data-value-updating]')&&el.closest('[aria-label="Saldo disponível"]'))observed.push(el.textContent??'');}}).observe(document.querySelector('.content')!,{subtree:true,attributes:true,attributeFilter:['data-value-updating']});
  });
  await page.getByRole('button',{name:'Nova receita',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Descrição',{exact:true}).fill('Entrada no início');await dialog.getByLabel('Valor (R$)',{exact:true}).fill('25.37');await dialog.getByLabel('Conta',{exact:true}).selectOption(a.id);await dialog.getByLabel('Status',{exact:true}).selectOption('confirmed');await save(page,'income');await expect(balance).toContainText('1.025,37');
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {motionValues:string[]}).motionValues.length)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>(window as unknown as {motionValues:string[]}).motionValues.every(v=>v.includes('1.025,37')))).toBe(true);
  await expect(balance).not.toHaveAttribute('data-value-updating','');
  await expect(page.locator('[data-financial-effect]')).toHaveCount(0,{timeout:5000});
  await page.getByRole('button',{name:'Mês anterior',exact:true}).click();await expect(balance).toContainText('1.025,37');await expect(page.locator('[data-financial-effect]')).toHaveCount(0);
 }finally{expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();}
});
