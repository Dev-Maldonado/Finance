import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
if (!['localhost','127.0.0.1'].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname)) throw Error('Navigation tests require local data');
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});

test('desktop menu exposes every module without its own scroll, fits notebook heights and preserves collapse and navigation',async({page})=>{
  test.setTimeout(90000);
  const email=`navigation-${randomUUID()}@example.test`,password=randomUUID()+'Aa1!';
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(created.error).toBeNull();const uid=created.data.user!.id;
  try{
    await page.route('**/api/economic-indicators',r=>r.fulfill({status:503,json:{error:'Unavailable test source'}}));
    await page.goto('/recorrentes');await page.getByLabel('E-mail').fill(email);await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar na minha conta'}).click();
    await expect(page.getByRole('article',{name:'Total previsto a pagar',exact:true})).toBeVisible();
    const sidebar=page.getByRole('complementary',{name:'Menu principal'}),nav=sidebar.getByRole('navigation',{name:'Navegação principal'});
    await expect(nav.getByRole('link')).toHaveCount(11);
    for(const label of ['Seu dinheiro','Organização','Patrimônio'])await expect(nav.getByRole('group',{name:label,exact:true})).toBeVisible();
    for(const [width,height] of [[1366,768],[1280,720],[1440,900],[1920,1080],[1024,768],[1280,680]]){
      await page.setViewportSize({width,height});await page.evaluate(()=>window.scrollTo(0,0));
      for(const link of await nav.getByRole('link').all())await expect(link).toBeInViewport();
      await expect(sidebar.getByRole('button',{name:'Sair',exact:true})).toBeInViewport();
      await expect(sidebar.getByRole('button',{name:'Recolher menu',exact:true})).toBeInViewport();
      expect(await sidebar.evaluate(el=>el.scrollHeight<=el.clientHeight+1)).toBe(true);
      const box=await sidebar.boundingBox();expect(box!.y+box!.height,`${width}x${height}`).toBeLessThanOrEqual(height+1);
      const main=await page.locator('.main').boundingBox();expect(Math.abs(main!.x-(box!.x+box!.width))).toBeLessThanOrEqual(1);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
      await sidebar.getByRole('button',{name:'Recolher menu',exact:true}).click();
      await expect.poll(async()=>Math.round((await sidebar.boundingBox())!.width)).toBe(80);
      await expect(nav.getByRole('link',{name:'Contas Recorrentes',exact:true})).toBeInViewport();
      await expect(nav.getByRole('link')).toHaveCount(11);
      await expect(sidebar.getByRole('button',{name:'Sair',exact:true})).toBeInViewport();
      await sidebar.getByRole('button',{name:'Expandir menu',exact:true}).click();
      await expect.poll(async()=>Math.round((await sidebar.boundingBox())!.width)).toBe(230);
    }
    await page.setViewportSize({width:1366,height:768});await page.screenshot({path:'test-results/desktop-menu-notebook.png'});
    await nav.getByRole('link',{name:'Transações',exact:true}).click();await expect(page).toHaveURL(/\/transacoes$/);await expect(page.locator('.page-head h1')).toHaveText('Transações');await expect(nav.getByRole('link',{name:'Transações',exact:true})).toHaveAttribute('aria-current','page');
    await nav.getByRole('link',{name:'Contas Recorrentes',exact:true}).click();await expect(page.getByRole('article',{name:'Total previsto a pagar',exact:true})).toBeVisible();
    await page.setViewportSize({width:1280,height:430});await page.evaluate(()=>window.scrollTo(0,0));
    await nav.getByRole('link',{name:'Configurações',exact:true}).scrollIntoViewIfNeeded();await expect(nav.getByRole('link',{name:'Configurações',exact:true})).toBeInViewport();
    await sidebar.getByRole('button',{name:'Sair',exact:true}).scrollIntoViewIfNeeded();await expect(sidebar.getByRole('button',{name:'Sair',exact:true})).toBeInViewport();
    expect(await sidebar.evaluate(el=>el.scrollTop)).toBe(0);expect(await page.evaluate(()=>window.scrollY)).toBeGreaterThan(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(1280);
  }finally{expect((await admin.auth.admin.deleteUser(uid)).error).toBeNull();}
});
