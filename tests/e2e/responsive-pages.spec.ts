import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

if (!['localhost', '127.0.0.1'].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname)) throw Error('Overflow checks require local data');
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

for (const mobile of [true, false]) test(`all pages fit and reach the end (${mobile ? 'touch' : 'desktop'})`, async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  const page = await context.newPage(), email = `overflow-${randomUUID()}@example.test`, password = randomUUID() + 'Aa1!';
  const user = await admin.auth.admin.createUser({ email, password, email_confirm: true }); expect(user.error).toBeNull();
  const id = user.data.user!.id;
  try {
    const account = await admin.from('financial_accounts').insert({ user_id: id, name: 'Conta principal para os compromissos e gastos da família', kind: 'bank', initial_balance: '1000' }).select('id').single(); expect(account.error).toBeNull();
    const category = await admin.from('categories').insert({ user_id: id, name: 'Alimentação e compras da família em supermercados e restaurantes' }).select('id').single(); expect(category.error).toBeNull();
    expect((await admin.from('categories').insert({ user_id: id, parent_id: category.data!.id, name: 'Supermercados e restaurantes do cotidiano' })).error).toBeNull();
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
    const send = async (url: string, payload: Record<string, unknown>) => {
      const response = await page.request.post(url, { headers: { Origin: 'http://localhost:3000' }, data: { ...payload, request_id: randomUUID() } });
      expect(response.ok(), await response.text()).toBe(true); return response.json();
    };
    const jar = await send('/api/manual-savings/create', { name: 'Reserva para compromissos e projetos da família', initial_balance: '1000', target: '2000', date: today, indexer: 'none', percentage: '100', product: 'custom' });
    await send('/api/manual-savings/balance', { goal_id: jar.id, balance: '1050', date: today });
    await send('/api/manual-investments/create', { name: 'Fundo para os projetos e compromissos da família', manual_kind: 'fund', quantity: '15', amount: '1600', date: today });
    expect((await admin.from('budgets').insert({ user_id: id, name: 'Orçamento dos compromissos da família', category_id: category.data!.id, amount: '1000', month: date })).error).toBeNull();
    for (const width of (mobile ? [320, 390, 768, 1024] : [1024, 1280, 1440, 1920])) {
      await page.setViewportSize({ width, height: [768, 1024].includes(width) ? 430 : 900 });
      for (const path of ['/', '/contas', '/cartoes', '/transacoes', '/recorrentes', '/categorias', '/caixinhas', '/investimentos', '/planejamento', '/relatorios', '/configuracoes', `/caixinhas/${jar.id}`]) {
        const snapshotReady = page.waitForResponse(r => new URL(r.url()).pathname === '/api/snapshot' && r.ok());
        await page.goto(path); await snapshotReady; await expect(page.locator('.page-head h1')).toBeVisible();
        const loaded = path === '/cartoes' ? 'Compra parcelada da família' : path === '/categorias' ? 'Alimentação e compras da família em supermercados e restaurantes' : 'DescriçãoSemEspaços'.repeat(5);
        if (['/', '/cartoes', '/transacoes', '/categorias'].includes(path)) await expect(page.getByText(loaded, { exact: true }).first()).toBeVisible();
        if (path === '/recorrentes') await expect(page.getByRole('article', { name: 'Total previsto a pagar', exact: true })).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(100);
        const spills = await page.locator('.content').evaluate(root => [...root.querySelectorAll('.panel, .stat, .page-head, .filters, .cards-grid')].filter(el => { const b = el.getBoundingClientRect(); return b.width > 0 && (b.left < -1 || b.right > document.documentElement.clientWidth + 1); }).map(el => el.className));
        if (path === '/cartoes' && mobile) {
          const brokenAmounts = await page.locator('.invoice-totals strong').evaluateAll(elements => elements.filter(el => { const range = document.createRange(); range.selectNodeContents(el); return range.getClientRects().length > 1 || range.getBoundingClientRect().width > el.clientWidth + 1; }).map(el => el.textContent));
          expect(brokenAmounts, `invoice amounts at ${width}px`).toEqual([]);
        }
        const footer = page.locator('.content > footer'); await expect(footer).toBeInViewport();
        if (mobile) { const footerBox = await footer.boundingBox(), navBox = await page.locator('.mobile-bottom-nav').boundingBox(); expect(footerBox!.y + footerBox!.height, `footer above navigation at ${width}px`).toBeLessThanOrEqual(navBox!.y + 1); }
        expect(spills, `${path} at ${width}px: components outside viewport`).toEqual([]);
        await expect.poll(async () => page.evaluate(() => ({ width: document.documentElement.scrollWidth, body: document.body.scrollWidth })), { message: `${path} at ${width}px` }).toEqual({ width, body: width });
        if (width === (mobile ? 390 : 1280)) { await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(100); await page.screenshot({ path: `test-results/responsive-${mobile ? 'touch' : 'desktop'}-${path.replaceAll('/', '-') || 'dashboard'}.png`, fullPage: true }); }
        if ((mobile ? [320, 768].includes(width) : width === 1280) && ['/', '/contas', '/cartoes', '/transacoes', '/recorrentes', '/categorias', '/caixinhas', '/planejamento'].includes(path)) {
          await page.locator(path === '/recorrentes' ? '.commitments-toolbar .actions button' : '.page-head .actions button').first().click();
          const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
          const bounds = await dialog.boundingBox(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
          const save = dialog.getByRole('button', { name: 'Salvar', exact: true }); await save.scrollIntoViewIfNeeded(); await expect(save).toBeInViewport();
          expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
          const fields = dialog.locator('input:not([type=hidden]), select, textarea');
          for (const field of await fields.all()) { await field.scrollIntoViewIfNeeded(); await expect(field).toBeInViewport(); }
          await dialog.getByRole('button', { name: 'Fechar', exact: true }).click(); await expect(dialog).not.toBeVisible();
        }
        if (path === '/' && mobile) {
          for (const heading of ['#dashboard-panorama', '#dashboard-analises', '#dashboard-faturas', '#dashboard-patrimonio']) {
            const section = page.locator(heading); await section.scrollIntoViewIfNeeded();
            expect(await page.evaluate(() => document.documentElement.scrollWidth), `${heading} at ${width}px`).toBe(width);
          }
          const flow = page.locator('.analysis-flow-panel .chart'); await flow.tap({ position: { x: 110, y: 100 } });
          await expect(page.locator('.analysis-flow-panel .recharts-tooltip-wrapper').filter({ visible: true })).toBeVisible();
          expect(await page.evaluate(() => document.documentElement.scrollWidth), `tooltip at ${width}px`).toBe(width);
          if (width === 320 || width === 390) await page.screenshot({ path: `test-results/responsive-analysis-${width}.png` });
        }
      }
    }
  } finally { expect((await admin.auth.admin.deleteUser(id)).error).toBeNull(); await context.close(); }
});
