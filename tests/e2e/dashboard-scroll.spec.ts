import {test,expect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
if(!['localhost','127.0.0.1'].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname))throw Error('Local disposable user only');
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
test('dashboard shows the primary figures and naturally scrolls to every section with the mouse and keyboard',async({page})=>{
 test.setTimeout(120000);const email=`dashboard-scroll-${randomUUID()}@example.test`,password=randomUUID()+'Aa1!';
 const user=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(user.error).toBeNull();const uid=user.data.user!.id;
 try{
  expect((await admin.from('financial_accounts').insert({user_id:uid,name:'Conta do teste de rolagem',kind:'bank',initial_balance:'2500'})).error).toBeNull();
  await page.route('**/api/economic-indicators*',r=>r.fulfill({status:503,json:{error:'Unavailable test provider'}}));
  await page.setViewportSize({width:1908,height:945});await page.goto('/inicio/completo');await page.getByLabel('E-mail').fill(email);await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar na minha conta'}).click();
  await expect(page.locator('.dashboard-metric')).toHaveCount(8);
  for(const size of [{width:1908,height:945},{width:1440,height:900},{width:1280,height:720},{width:1280,height:680},{width:1280,height:430}]){
   await page.setViewportSize(size);await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
   const primary=page.locator('.dashboard-hero-main > strong');
   const initialBounds=await primary.boundingBox();
   if(size.height<640){await page.getByRole('link',{name:'Panorama',exact:true}).click();await expect(primary).toBeInViewport({ratio:1});}
   await page.mouse.move(size.width-80,Math.min(size.height-100,600));await page.mouse.wheel(0,600);
   await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(100);
   await primary.scrollIntoViewIfNeeded();await expect(primary).toBeInViewport({ratio:1});
   // Real input, not scrollTo(document.body.scrollHeight), must reach the last content.
   await page.mouse.move(size.width-50,size.height/2);await page.mouse.wheel(0,100000);
   await expect(page.locator('#dashboard-confiabilidade')).toBeInViewport();
   await expect(page.locator('.content > footer')).toBeInViewport();
   await page.keyboard.press('Control+Home');
   await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
   await page.evaluate(async()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();await new Promise<void>(resolve=>{let previous=scrollY,stable=0;const frame=()=>{const now=scrollY;stable=now===previous?stable+1:0;previous=now;if(stable>=4)resolve();else requestAnimationFrame(frame);};requestAnimationFrame(frame);});});
   await page.keyboard.press('PageDown');await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(0);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(size.width);
   await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
   if(size.height>=640)expect(initialBounds!.y+initialBounds!.height,`primary amount ${size.width}x${size.height}`).toBeLessThanOrEqual(size.height);
   await page.screenshot({path:`test-results/dashboard-scroll-${size.width}-${size.height}.png`});
  }
 }finally{expect((await admin.auth.admin.deleteUser(uid)).error).toBeNull();}
});
