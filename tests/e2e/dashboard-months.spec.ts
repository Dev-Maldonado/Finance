import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { shiftInvoiceMonth } from '../../src/lib/card-invoices';
if (!['localhost', '127.0.0.1'].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname)) throw Error('Month navigation checks require local data');
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
test('dashboard month navigation updates invoices, monthly results and dates without losing filters on mobile', async ({ page }) => {
  test.setTimeout(90000);
  const email = `months-${randomUUID()}@example.test`, password = randomUUID() + 'Aa1!';
  const user = await admin.auth.admin.createUser({ email, password, email_confirm: true }); expect(user.error).toBeNull(); const id = user.data.user!.id;
  try {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()), month = today.slice(0, 7), next = shiftInvoiceMonth(month, 1), last = shiftInvoiceMonth(month, 2), previous = shiftInvoiceMonth(month, -1);
    const account = await admin.from('financial_accounts').insert({ user_id: id, name: 'Conta mensal', kind: 'bank', initial_balance: '1000' }).select('id').single(); expect(account.error).toBeNull();
    const card = await admin.from('credit_cards').insert({ user_id: id, name: 'Cartão mensal', account_id: account.data!.id, credit_limit: '3000', closing_day: 5, due_day: 10, last_four: '1234' }).select('id').single(); expect(card.error).toBeNull();
    expect((await admin.from('transactions').insert([
      { date: `${month}-01`, amount: '100', status: 'confirmed', description: 'Receita deste mês' },
      { date: `${previous}-01`, amount: '40', status: 'confirmed', description: 'Receita do mês anterior' },
      { date: `${next}-01`, amount: '5000', status: 'pending', description: 'Recebimento futuro pendente' },
    ].map(t => ({ ...t, user_id: id, account_id: account.data!.id, type: 'income' })))).error).toBeNull();
    await page.route('**/api/economic-indicators*', route => route.fulfill({ status: 503, json: { error: 'Unavailable test source' } }));
    await page.goto('/'); await page.getByLabel('E-mail').fill(email); await page.getByLabel('Senha', { exact: true }).fill(password); await page.getByRole('button', { name: 'Entrar na minha conta' }).click();
    await expect(page.getByRole('article', { name: 'Saldo disponível', exact: true })).toBeVisible();
    const purchase = await page.request.post('/api/operations', { headers: { Origin: 'http://localhost:3000' }, data: { action: 'purchase', request_id: randomUUID(), payload: { card_id: card.data!.id, description: 'Compra em três meses', amount: '300.01', installments: 3, date: `${month}-01` } } }); expect(purchase.ok(), await purchase.text()).toBe(true);
    await page.reload();
    const nav = page.getByRole('group', { name: 'Navegação mensal do dashboard' }), picker = nav.getByLabel('Mês do dashboard');
    const bill = page.getByRole('article', { name: 'Faturas do mês', exact: true }), income = page.getByRole('article', { name: 'Receitas do período', exact: true });
    await expect(bill.locator('strong').first()).toHaveText('R$ 100,00');
    await nav.getByRole('button', { name: 'Próximo mês', exact: true }).click(); await expect(picker).toHaveValue(next);
    await expect(bill.locator('strong').first()).toHaveText('R$ 100,00'); await expect(income.locator('strong').first()).toHaveText('R$ 5.000,00'); await expect(income).toContainText('R$ 0,00 recebidos');
    await expect(page.locator('.dashboard-month-context')).toBeVisible();
    await nav.getByRole('button', { name: 'Próximo mês', exact: true }).click(); await expect(picker).toHaveValue(last); await expect(bill.locator('strong').first()).toHaveText('R$ 100,01');
    await nav.getByRole('button', { name: 'Voltar um mês', exact: true }).click(); await expect(picker).toHaveValue(next); await expect(bill.locator('strong').first()).toHaveText('R$ 100,00');
    await picker.fill(`${Number(month.slice(0, 4)) + 1}-01`); await expect(bill.locator('strong').first()).toHaveText('R$ 0,00');
    await picker.fill(previous); await expect(income.locator('strong').first()).toHaveText('R$ 40,00');
    await nav.getByRole('button', { name: 'Mês atual', exact: true }).click(); await expect(picker).toHaveValue(month); await expect(income.locator('strong').first()).toHaveText('R$ 100,00');
    await page.getByRole('button', { name: 'Personalizado', exact: true }).click(); await expect(page.getByLabel('Data inicial', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Este mês', exact: true }).click();
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 }); await nav.scrollIntoViewIfNeeded();
      await nav.getByRole('button', { name: 'Próximo mês', exact: true }).click(); await expect(bill.locator('strong').first()).toHaveText('R$ 100,00');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await nav.getByRole('button', { name: 'Mês atual', exact: true }).click();
      if (width === 390) { await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: 'test-results/dashboard-months-mobile.png' }); }
    }
    expect((await admin.from('credit_card_installments').select('id').eq('user_id', id)).data).toHaveLength(3);
  } finally { expect((await admin.auth.admin.deleteUser(id)).error).toBeNull(); }
});
