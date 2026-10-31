import {expect,type Page} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {moduleTabs} from '../../../src/lib/workspace-navigation';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
if(!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('Visual audit requires local disposable users');
export const layoutAdmin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
export const layoutRoutes=[...new Set([...Object.values(moduleTabs).flat().map(t=>t.href),'/transacoes','/recorrentes','/contas','/categorias','/caixinhas','/investimentos','/planejamento','/relatorios'])];
export async function layoutFixture(page:Page){
 const email=`visual-${randomUUID()}@example.test`,password=randomUUID()+'Aa1!';const u=await layoutAdmin.auth.admin.createUser({email,password,email_confirm:true});expect(u.error).toBeNull();const id=u.data.user!.id;
 try{
  const a=await layoutAdmin.from('financial_accounts').insert({user_id:id,name:'Conta principal para despesas e projetos da família',kind:'bank',initial_balance:'1000000'}).select('id').single();expect(a.error).toBeNull();
  const cat=await layoutAdmin.from('categories').insert({user_id:id,name:'Moradia, manutenção e compromissos da família'}).select('id').single();expect(cat.error).toBeNull();
  expect((await layoutAdmin.from('categories').insert({user_id:id,parent_id:cat.data!.id,name:'Internet e serviços para trabalhar em casa'})).error).toBeNull();
  expect((await layoutAdmin.from('transactions').insert(Array.from({length:35},(_,i)=>({user_id:id,account_id:a.data!.id,category_id:cat.data!.id,description:i===0?'DescriçãoSemEspaços'.repeat(6):`Movimentação ${i+1} com descrição completa para conferir a legibilidade`,type:i%3?'expense':'income',amount:i%3?'-1234.56':'10000',date:today,status:i%2?'confirmed':'pending'})))).error).toBeNull();
  const card=await layoutAdmin.from('credit_cards').insert({user_id:id,name:'Cartão principal da família para compras parceladas',account_id:a.data!.id,credit_limit:'500000',last_four:'1234',closing_day:5,due_day:10}).select('id').single();expect(card.error).toBeNull();
  await page.route('**/api/economic-indicators*',r=>r.fulfill({status:503,json:{error:'Isolated unavailable source'}}));
  await page.goto('/');await page.getByLabel('E-mail').fill(email);await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar na minha conta'}).click();await expect(page.getByRole('article',{name:'Saldo disponível',exact:true})).toBeVisible();
  const send=async(path:string,data:Record<string,unknown>)=>{const r=await page.request.post(path,{headers:{Origin:'http://localhost:3000'},data:{...data,request_id:randomUUID()}});expect(r.ok(),await r.text()).toBe(true);return r.json();};
  await send('/api/operations',{action:'purchase',payload:{card_id:card.data!.id,description:'Compra de equipamentos para os projetos da família',amount:'12345.67',installments:12,date:today.slice(0,7)+'-01',category_id:cat.data!.id}});
  await send('/api/manual-savings/create',{name:'Reserva para compromissos da família e imprevistos',initial_balance:'123456.78',target:'200000',date:today,indexer:'none',percentage:'100',product:'custom'});
  await send('/api/manual-investments/create',{name:'Fundo de investimento para objetivos de longo prazo',manual_kind:'fund',quantity:'125',amount:'123456.78',date:today});
  return id;
 }catch(e){await layoutAdmin.auth.admin.deleteUser(id);throw e;}
}
