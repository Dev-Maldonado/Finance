import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

if (!['localhost', '127.0.0.1'].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname)) throw Error('Overflow checks require local data');
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

test('populated mobile pages fit the physical viewport before and after chart touches', async ({ browser }) => {
  test.setTimeout(120000);
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const page = await context.newPage(), email = `overflow-${randomUUID()}@example.test`, password = randomUUID() + 'Aa1!';
  const user = await admin.auth.admin.createUser({ email, password, email_confirm: true }); expect(user.error).toBeNull();
  const id = user.data.user!.id;
  try {
    const account = await admin.from('financial_accounts').insert({ user_id: id, name: 'Conta principal para os compromissos e gastos da família', kind: 'bank', initial_balance: '1000' }).select('id').single(); expect(account.error).toBeNull();
    const category = await admin.from('categories').insert({ user_id: id, name: 'Alimentação e compras da família em supermercados e restaurantes' }).select('id').single(); expect(category.error).toBeNull();
    const card = await admin.from('credit_cards').insert({ user_id: id, name: 'Cartão de crédito principal da família para compras parceladas', account_id: account.data!.id, credit_limit: '1000000', closing_day: 5, due_day: 10, last_four: '1234' }).select('id').single(); expect(card.error).toBeNull();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()), date = `${today.slice(0, 7)}-01`;
    expect((await admin.from('transactions').insert([
      { type: 'income', amount: '1000', description: 'Recebimento do período', status: 'confirmed' },
      { type: 'expense', amount: '-250000.23', description: 'DescriçãoSemEspaços'.repeat(5), status: 'confirmed' },
      { type: 'expense', amount: '-29.08', description: 'Despesa prevista para o período', status: 'pending' },
    ].map(t => ({ ...t, date, user_id: id, account_id: account.data!.id, category_id: category.data!.id })))).error).toBeNull();
    await page.route('**/api/economic-indicators', route => route.fulfill({ status: 503, json: { error: 'Unavailable test source' } }));
    await page.goto('/'); await page.getByLabel('E-mail').fill(email); await page.getByLabel('Senha', { exact: true }).fill(password); await page.getByRole('button', { name: 'Entrar na minha conta' }).click();
    await expect(page.getByRole('article', { name: 'Saldo disponível', exact: true })).toBeVisible();
    const purchase = await page.request.post('/api/operations', { headers: { Origin: 'http://localhost:3000' }, data: { action: 'purchase', request_id: randomUUID(), payload: { card_id: card.data!.id, category_id: category.data!.id, description: 'Compra parcelada da família', amount: '1500.01', installments: 10, date } } }); expect(purchase.ok(), await purchase.text()).toBe(true);
    for (const width of [320, 360, 375, 390, 412, 430, 768]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ['/', '/cartoes', '/transacoes', '/categorias']) {
        await page.goto(path); await expect(page.locator('.page-head h1')).toBeVisible();
        const loaded = path === '/cartoes' ? 'Compra parcelada da família' : path === '/categorias' ? 'Alimentação e compras da família em supermercados e restaurantes' : 'DescriçãoSemEspaços'.repeat(5);
        await expect(page.getByText(loaded, { exact: true }).first()).toBeVisible();
        await expect.poll(async () => page.evaluate(() => ({ width: document.documentElement.scrollWidth, body: document.body.scrollWidth })), { message: `${path} at ${width}px` }).toEqual({ width, body: width });
        if (path === '/') {
          for (const heading of ['#dashboard-panorama', '#dashboard-analises', '#dashboard-faturas', '#dashboard-patrimonio']) {
            const section = page.locator(heading); await section.scrollIntoViewIfNeeded();
            expect(await page.evaluate(() => document.documentElement.scrollWidth), `${heading} at ${width}px`).toBe(width);
          }
          const flow = page.locator('.analysis-flow-panel .chart'); await flow.tap({ position: { x: 110, y: 100 } });
          await expect(page.locator('.analysis-flow-panel .recharts-tooltip-wrapper').filter({ visible: true })).toBeVisible();
          expect(await page.evaluate(() => document.documentElement.scrollWidth), `tooltip at ${width}px`).toBe(width);
          if (width === 320 || width === 390) await page.locator('#dashboard-analises').screenshot({ path: `test-results/mobile-overflow-analysis-${width}.png` });
        }
      }
    }
  } finally { expect((await admin.auth.admin.deleteUser(id)).error).toBeNull(); await context.close(); }
});
