import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { monthEnd } from '../../src/lib/dashboard';
import { shiftInvoiceMonth } from '../../src/lib/card-invoices';

if (!['localhost', '127.0.0.1'].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname)) throw Error('Future transaction checks require local data');
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

test('future pending and confirmed entries update their monthly indicators immediately, without altering actual cash', async ({ page }) => {
  test.setTimeout(120000);
  const email = `future-${randomUUID()}@example.test`, password = randomUUID() + 'Aa1!';
  const user = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  expect(user.error).toBeNull(); const id = user.data.user!.id;
  try {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()), month = today.slice(0, 7), next = shiftInvoiceMonth(month, 1);
    const account = await admin.from('financial_accounts').insert({ user_id: id, name: 'Conta de teste', kind: 'bank', initial_balance: '1000' }).select('id').single(); expect(account.error).toBeNull();
    await page.route('**/api/economic-indicators*', route => route.fulfill({ status: 503, json: { error: 'Unavailable test source' } }));
    await page.goto('/'); await page.getByLabel('E-mail').fill(email); await page.getByLabel('Senha', { exact: true }).fill(password); await page.getByRole('button', { name: 'Entrar na minha conta' }).click();
    const income = page.getByRole('article', { name: 'Receitas do período', exact: true }), expense = page.getByRole('article', { name: 'Gastos do mês', exact: true }), cash = page.getByRole('article', { name: 'Saldo disponível', exact: true });
    await expect(cash).toContainText('R$ 1.000,00');
    const add = async (description: string, type: string, amount: string, status: string, date: string) => {
      await page.getByRole('button', { name: 'Novo lançamento', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Descrição', { exact: true }).fill(description);
      await dialog.getByLabel('Tipo', { exact: true }).selectOption(type);
      await dialog.getByLabel('Valor (R$)', { exact: true }).fill(amount);
      await dialog.getByLabel('Conta', { exact: true }).selectOption(account.data!.id);
      await dialog.getByLabel('Data', { exact: true }).fill(date);
      await dialog.getByLabel('Status', { exact: true }).selectOption(status);
      await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
      await expect(dialog).toHaveCount(0);
    };
    await add('Entrada prevista neste mês', 'income', '50', 'pending', monthEnd(month));
    await add('Saída prevista neste mês', 'expense', '20', 'pending', monthEnd(month));
    await expect(income.locator('strong').first()).toHaveText('R$ 50,00');
    await expect(expense.locator('strong').first()).toHaveText('R$ 20,00');
    const nav = page.getByRole('group', { name: 'Navegação mensal do dashboard' });
    await nav.getByRole('button', { name: 'Próximo mês', exact: true }).click();
    await expect(income.locator('strong').first()).toHaveText('R$ 0,00');
    await add('Entrada futura pendente', 'income', '150.25', 'pending', `${next}-01`);
    await expect(income.locator('strong').first()).toHaveText('R$ 150,25');
    await add('Entrada futura finalizada', 'income', '249.75', 'confirmed', `${next}-15`);
    await add('Saída futura pendente', 'expense', '59.90', 'pending', `${next}-10`);
    await add('Saída futura finalizada', 'expense', '40.10', 'confirmed', monthEnd(next));
    await expect(income.locator('strong').first()).toHaveText('R$ 400,00');
    await expect(expense.locator('strong').first()).toHaveText('R$ 100,00');
    await expect(income).toContainText('R$ 0,00 recebidos');
    await expect(page.getByLabel('Resultado líquido do período')).toContainText('R$ 300,00');
    await expect(page.getByLabel('Resultado líquido do período')).toContainText('previsto');
    const operational = page.locator('.dashboard-block').filter({ has: page.getByRole('heading', { name: 'Fluxo de caixa operacional', exact: true }) });
    await expect(operational.locator('.dashboard-liquidity strong')).toHaveText('R$ 0,00');
    await expect(cash.locator('strong').first()).toHaveText('R$ 1.000,00');

    const snapshot = await (await page.request.get('/api/snapshot')).json();
    const entry = snapshot.transactions.find((t: { description: string }) => t.description === 'Entrada futura pendente');
    const revised = await page.request.post('/api/transactions', { headers: { Origin: 'http://localhost:3000' }, data: { transaction_id: entry.id, replacement: { account_id: account.data!.id, description: entry.description, type: 'income', amount: '160.25', status: 'confirmed', date: entry.date } } });
    expect(revised.ok(), await revised.text()).toBe(true);
    await page.getByRole('button', { name: 'Atualizar dados', exact: true }).click();
    await expect(income.locator('strong').first()).toHaveText('R$ 410,00');
    const saved = await (await page.request.get('/api/snapshot')).json();
    const cancel = saved.transactions.find((t: { description: string; status: string }) => t.description === 'Saída futura pendente' && t.status === 'pending');
    expect((await page.request.post('/api/transactions', { headers: { Origin: 'http://localhost:3000' }, data: { transaction_id: cancel.id, cancel: true } })).ok()).toBe(true);
    await page.getByRole('button', { name: 'Atualizar dados', exact: true }).click();
    await expect(expense.locator('strong').first()).toHaveText('R$ 40,10');
    await expect(cash.locator('strong').first()).toHaveText('R$ 1.000,00');
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(income.locator('strong').first()).toHaveText('R$ 410,00');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      if (width === 390) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: 'test-results/future-transactions-mobile.png' });
      }
    }
    await nav.getByRole('button', { name: 'Mês atual', exact: true }).click();
    await expect(income.locator('strong').first()).toHaveText('R$ 50,00');
    await expect(expense.locator('strong').first()).toHaveText('R$ 20,00');
    const balance = await admin.from('account_balances').select('balance').eq('id', account.data!.id).single();
    expect(balance.data!.balance).toBe('1000.00');
  } finally { expect((await admin.auth.admin.deleteUser(id)).error).toBeNull(); }
});
