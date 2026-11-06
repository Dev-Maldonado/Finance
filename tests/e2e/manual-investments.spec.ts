import {test,expect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {layoutAdmin as admin} from './support/layout-fixture';
test('category holdings save, persist, isolate users and update wealth without affecting cash or savings',async({page})=>{
 test.setTimeout(60000);const email=`totals-${randomUUID()}@example.test`,password=randomUUID()+'Aa1!';const created=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(created.error).toBeNull();const id=created.data.user!.id;
 try{
 await page.goto('/investimentos');await page.getByLabel('E-mail').fill(email);await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar na minha conta'}).click();await expect(page.getByRole('heading',{name:'Investimentos por categoria'})).toBeVisible();await expect(page.getByRole('button',{name:'Novo investimento',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Atualizar valores'}).click();await page.getByLabel('Ações e FIIs (R$)').fill('531,49');await page.getByLabel('Criptomoedas (R$)').fill('145,79');await expect(page.getByText('Total informado:')).toContainText('677,28');await page.getByRole('button',{name:'Salvar valores'}).click();await expect(page.getByRole('button',{name:'Atualizar valores'})).toBeVisible();await page.reload();await expect(page.getByLabel('Investimentos por categoria')).toContainText('677,28');
 const snapshot=await (await page.request.get('/api/snapshot')).json();expect(snapshot.transactions).toHaveLength(0);expect(snapshot.savings_goals).toHaveLength(0);expect(Number(snapshot.investment_totals[0].equities)).toBe(531.49);
 const bad=await page.request.post('/api/investment-totals',{headers:{Origin:'http://localhost:3000'},data:{equities:'-1',crypto:'0'}});expect(bad.ok()).toBe(false);
 await page.getByRole('button',{name:'Atualizar valores'}).click();await page.getByLabel('Criptomoedas (R$)').fill('0');await page.getByRole('button',{name:'Salvar valores'}).click();await expect(page.getByLabel('Investimentos por categoria')).toContainText('531,49');
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:844});await page.getByRole('button',{name:'Atualizar valores'}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.getByRole('button',{name:'Cancelar',exact:true}).click();}
 await page.goto('/');await expect(page.getByRole('article',{name:'Investido em BRL',exact:true})).toContainText('531,49');
 const isolated=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false}});const auth=await isolated.auth.signInWithPassword({email,password});expect(auth.error).toBeNull();const forbidden=await isolated.from('investment_totals').upsert({user_id:randomUUID(),equities:1,crypto:1});expect(forbidden.error).not.toBeNull();const other=await isolated.from('investment_totals').select('*').neq('user_id',id);expect(other.data).toEqual([]);

 }finally{await admin.auth.admin.deleteUser(id);}
});
