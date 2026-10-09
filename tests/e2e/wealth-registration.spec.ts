import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

if (!['localhost', '127.0.0.1'].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname)) throw new Error('Wealth registration tests require the local database');
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

test('recording wealth shows the first position, updates the same day and reports failures beside the action', async ({ page }) => {
  test.setTimeout(90000);
  const email = `wealth-${randomUUID()}@example.test`, password = randomUUID() + 'Aa1!';
  const user = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  expect(user.error).toBeNull();
  try {
    await page.goto('/');
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Entrar na minha conta' }).click();
    await expect(page.getByText('Saldo disponível', { exact: true })).toBeVisible();
    const resource = async (name: string, data: Record<string, unknown>) => {
      const response = await page.request.post(`/api/data/${name}`, { headers: { Origin: 'http://localhost:3000' }, data: { data } });
      expect(response.ok(), await response.text()).toBe(true);
      return (await response.json()).id;
    };
    const account = await resource('financial_accounts', { name: 'Conta patrimônio local', kind: 'bank', initial_balance: '1000' });
    await resource('financial_liabilities', { name: 'Dívida local', amount: '200' });
    await page.reload();
    await page.getByRole('button', { name: 'Mês anterior', exact: true }).click();
    const wealth = page.locator('.dashboard-block').filter({ has: page.getByRole('heading', { name: 'Evolução do patrimônio', exact: true }) });
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/snapshot', async route => {
      if (route.request().method() === 'POST') await pending;
      await route.continue();
    });
    await wealth.getByRole('button', { name: 'Registrar posição de hoje' }).click();
    await expect(wealth.getByRole('button', { name: 'Registrando posição…' })).toBeDisabled();
    release();
    await expect(wealth.getByRole('status')).toContainText('Posição patrimonial de hoje registrada.');
    await expect(wealth.getByRole('status')).toContainText('período foi ajustado para o mês atual');
    await expect(wealth.getByLabel('Posição patrimonial registrada')).toContainText('R$ 800,00');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    let saved = await admin.from('net_worth_snapshots').select('id,date,assets,liabilities').eq('user_id', user.data.user!.id);
    expect(saved.error).toBeNull();
    expect(saved.data).toHaveLength(1);
    expect(saved.data![0]).toMatchObject({ date: today, assets: 1000, liabilities: 200 });
    const originalId = saved.data![0].id;
    const expense = await page.request.post('/api/operations', { headers: { Origin: 'http://localhost:3000' }, data: { action: 'transaction', payload: { account_id: account, description: 'Despesa de teste', type: 'expense', amount: '50', date: today, status: 'confirmed' }, request_id: randomUUID() } });
    expect(expense.ok(), await expense.text()).toBe(true);
    await expect(wealth.getByRole('button', { name: 'Registrar posição de hoje' })).toBeEnabled();
    await wealth.getByRole('button', { name: 'Registrar posição de hoje' }).click();
    await expect(wealth.getByRole('status')).toContainText('Posição patrimonial de hoje atualizada.');
    await expect(wealth.getByLabel('Posição patrimonial registrada')).toContainText('R$ 750,00');
    saved = await admin.from('net_worth_snapshots').select('id,date,assets,liabilities').eq('user_id', user.data.user!.id);
    expect(saved.error).toBeNull();
    expect(saved.data).toHaveLength(1);
    expect(saved.data![0]).toMatchObject({ id: originalId, assets: 950, liabilities: 200 });
    await page.goto('/relatorios');
    const report = page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'Evolução patrimonial registrada', exact: true }) });
    await expect(report.getByLabel('Posição patrimonial registrada')).toContainText('R$ 750,00');
    await page.unroute('**/api/snapshot');
    await page.route('**/api/snapshot', async route => {
      if (route.request().method() === 'POST') await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Falha simulada somente no teste local' }) });
      else await route.continue();
    });
    await report.getByRole('button', { name: 'Registrar posição hoje' }).click();
    await expect(report.getByRole('alert')).toContainText('Não foi possível registrar a posição.');
    await expect(report.getByRole('alert')).toContainText('Falha simulada');
    await expect(report.getByRole('button', { name: 'Registrar posição hoje' })).toBeEnabled();
    saved = await admin.from('net_worth_snapshots').select('id,date,assets,liabilities').eq('user_id', user.data.user!.id);
    expect(saved.data).toHaveLength(1);
    expect(saved.data![0]).toMatchObject({ id: originalId, assets: 950, liabilities: 200 });
  } finally {
    expect((await admin.auth.admin.deleteUser(user.data.user!.id)).error).toBeNull();
  }
});
