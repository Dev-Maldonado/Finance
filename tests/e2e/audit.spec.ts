import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
if (!['localhost', '127.0.0.1'].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname)) throw new Error('Audit browser checks require local data');
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
async function user(page: Page) {
  const email = `audit-${randomUUID()}@example.test`, password = randomUUID() + 'Aa1!';
  const result = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  expect(result.error).toBeNull();
  try {
    await page.goto('/'); await page.getByLabel('E-mail').fill(email); await page.getByLabel('Senha', { exact: true }).fill(password);
    const loaded = page.waitForResponse(r => new URL(r.url()).pathname === '/api/snapshot' && r.request().method() === 'GET');
    await page.getByRole('button', { name: 'Entrar na minha conta' }).click(); expect((await loaded).ok()).toBe(true);
    await expect(page.getByText('Saldo disponível', { exact: true })).toBeVisible();
    return result.data.user!.id;
  } catch (error) { await admin.auth.admin.deleteUser(result.data.user!.id); throw error; }
}
async function resource(page: Page, table: string, data: Record<string, unknown>) {
  const r = await page.request.post(`/api/data/${table}`, { headers: { Origin: 'http://localhost:3000' }, data: { data } });
  expect(r.ok(), await r.text()).toBe(true); return (await r.json()).id as string;
}
async function op(page: Page, action: string, payload: Record<string, unknown>) {
  const r = await page.request.post('/api/operations', { headers: { Origin: 'http://localhost:3000' }, data: { action, payload, request_id: randomUUID() } });
  expect(r.ok(), await r.text()).toBe(true);
}
test('card, category/subcategory, date and status filters combine; edits/deletion update purchases and invoices without reloading', async ({ page }) => {
  test.setTimeout(90000); const id = await user(page);
  try {
    const bank = await resource(page, 'financial_accounts', { name: 'Banco de auditoria', kind: 'bank', initial_balance: '10000' });
    const food = await resource(page, 'categories', { name: 'Alimentação' });
    const lunch = await resource(page, 'categories', { name: 'Lanches', parent_id: food });
    const a = await resource(page, 'credit_cards', { name: 'Cartão A', account_id: bank, last_four: '1111', closing_day: 31, due_day: 5, credit_limit: '5000' });
    const b = await resource(page, 'credit_cards', { name: 'Cartão B', account_id: bank, last_four: '2222', closing_day: 31, due_day: 5, credit_limit: '5000' });
    const date = today.slice(0, 7) + '-01';
    await op(page, 'purchase', { card_id: a, description: 'Compra A', amount: '300.01', installments: 3, date, category_id: lunch });
    await op(page, 'purchase', { card_id: a, description: 'Compra direta A', amount: '20', installments: 1, date, category_id: food });
    await op(page, 'purchase', { card_id: b, description: 'Compra B', amount: '80', installments: 1, date, category_id: lunch });
    const snap = await (await page.request.get('/api/snapshot')).json();
    const purchase = snap.credit_card_purchases.find((p: { description: string }) => p.description === 'Compra A');
    const part = snap.credit_card_installments.find((p: { purchase_id: string }) => p.purchase_id === purchase.id);
    const month = snap.credit_card_invoices.find((i: { id: string }) => i.id === part.invoice_id).due_date.slice(0, 7);
    await page.goto('/cartoes'); await page.getByLabel('Mês das faturas').fill(month);
    const history = page.getByRole('region', { name: 'Compras registradas', exact: true });
    await page.getByLabel('Filtrar faturas por cartão').selectOption(a);
    await expect(history.getByLabel('Filtrar compras por cartão')).toHaveValue(a);
    await expect(history.locator('tbody tr')).toHaveCount(2); await expect(history).not.toContainText('Compra B');
    await history.getByLabel('Filtrar compras por categoria', { exact: true }).selectOption(food);
    await history.getByLabel('Subcategoria de Alimentação').selectOption(lunch);
    await history.getByLabel('Período das compras').selectOption('invoice');
    await expect(history.locator('tbody tr')).toHaveCount(1);
    await expect(history.getByLabel('Resumo das compras filtradas')).toContainText('R$ 300,01');
    await expect(history.getByLabel('Resumo das compras filtradas')).toContainText('R$ 100,00');
    await history.getByLabel('Buscar compras').fill('sem correspondência'); await expect(history.getByText('Nenhuma compra nesta seleção.')).toBeVisible();
    await history.getByLabel('Buscar compras').fill('Compra A');
    await history.getByLabel('Período das compras').selectOption('custom');
    await history.getByLabel('Data inicial da compra').fill(date); await history.getByLabel('Data final da compra').fill(today);
    await expect(history.locator('tbody tr')).toHaveCount(1);
    await history.getByRole('button', { name: 'Editar', exact: true }).click();
    await page.getByLabel('Valor total da compra (R$)', { exact: true }).fill('330,03');
    await page.getByRole('button', { name: 'Salvar', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(history.getByLabel('Resumo das compras filtradas')).toContainText('R$ 330,03');
    await expect(history.getByLabel('Resumo das compras filtradas')).toContainText('R$ 110,01');
    const updated = await (await page.request.get('/api/snapshot')).json();
    expect(updated.credit_card_purchases.find((p: { id: string }) => p.id === purchase.id).amount).toBe('330.03');
    expect(updated.credit_card_installments.filter((p: { purchase_id: string }) => p.purchase_id === purchase.id).map((p: { amount: string }) => p.amount)).toEqual(['110.01', '110.01', '110.01']);
    await history.getByRole('button', { name: 'Excluir', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Excluir', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0); await expect(history.locator('tbody tr')).toHaveCount(0);
    await history.getByLabel('Filtrar compras por status').selectOption('cancelled');
    await expect(history.locator('tbody tr')).toHaveCount(1); await expect(history.locator('tbody')).toContainText('Excluída');
    await expect(history.getByLabel('Resumo das compras filtradas')).toContainText('R$ 0,00');
    await history.getByRole('button', { name: 'Limpar filtros de compras' }).click();
    await expect(page.getByLabel('Filtrar faturas por cartão')).toHaveValue('');
    await expect(history.locator('tbody tr')).toHaveCount(2); await expect(history.locator('tbody')).toContainText('Compra B');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const mobilePurchase = history.getByRole('row').filter({ hasText: 'Compra B' });
    await mobilePurchase.scrollIntoViewIfNeeded();
    await expect(mobilePurchase.getByText('Cartão B', { exact: true })).toBeInViewport();
    await expect(mobilePurchase.getByText('R$ 80,00', { exact: true })).toBeInViewport();
  } finally { expect((await admin.auth.admin.deleteUser(id)).error).toBeNull(); }
});

test('failed recurrence generation preserves readable data; excluded transactions and archived subcategory edits work', async ({ page }) => {
  test.setTimeout(60000); const id = await user(page);
  try {
    const bank = await resource(page, 'financial_accounts', { name: 'Conta preservada', kind: 'bank', initial_balance: '500' });
    const parent = await resource(page, 'categories', { name: 'Moradia' });
    const child = await resource(page, 'categories', { name: 'Internet', parent_id: parent });
    await op(page, 'transaction', { account_id: bank, description: 'Internet preservada', amount: '50', type: 'expense', status: 'confirmed', date: today, category_id: child });
    await op(page, 'transaction', { account_id: bank, description: 'Despesa excluída', amount: '10', type: 'expense', status: 'confirmed', date: today });
    const snapshot = await (await page.request.get('/api/snapshot')).json();
    const removed = snapshot.transactions.find((t: { description: string }) => t.description === 'Despesa excluída');
    const cancel = await page.request.post('/api/transactions', { headers: { Origin: 'http://localhost:3000' }, data: { transaction_id: removed.id, cancel: true, request_id: randomUUID() } }); expect(cancel.ok()).toBe(true);
    await page.route('**/api/recurring', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Falha simulada no teste' }) }));
    await page.goto('/'); await expect(page.locator('.content').getByRole('alert')).toContainText('Seus registros continuam disponíveis');
    await expect(page.getByText('Saldo disponível', { exact: true })).toBeVisible();
    await expect(page.getByRole('article', { name: 'Saldo disponível', exact: true })).toContainText('R$ 450,00');
    await page.unroute('**/api/recurring');
    const archived = await page.request.delete(`/api/data/categories?id=${child}`, { headers: { Origin: 'http://localhost:3000' } }); expect(archived.ok()).toBe(true);
    await page.goto('/transacoes');
    await page.getByLabel('Filtrar transações por status').selectOption('cancelled');
    await expect(page.getByLabel('Mostrar lançamentos excluídos')).toBeChecked();
    await expect(page.locator('tbody')).toContainText('Despesa excluída');
    await page.getByLabel('Filtrar transações por status').selectOption('confirmed');
    const row = page.getByRole('row').filter({ hasText: 'Internet preservada' });
    await row.getByRole('button', { name: 'Editar', exact: true }).click();
    await expect(page.getByLabel('Subcategoria de Moradia')).toHaveValue(child);
    await expect(page.getByLabel('Subcategoria de Moradia')).toContainText('Internet (arquivada)');
    await page.getByLabel('Descrição', { exact: true }).fill('Internet corrigida');
    await page.getByRole('button', { name: 'Salvar', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
    const saved = await (await page.request.get('/api/snapshot')).json();
    expect(saved.transactions.find((t: { description: string }) => t.description === 'Internet corrigida').category_id).toBe(child);
    expect(saved.account_balances.find((a: { id: string }) => a.id === bank).balance).toBe('450.00');
  } finally { expect((await admin.auth.admin.deleteUser(id)).error).toBeNull(); }
});


test('past pending income shows a reminder; confirming receipt clears it without automatic payment', async ({ page }) => {
  const id = await user(page);
  try {
    const bank = await resource(page, 'financial_accounts', { name: 'Conta de recebimentos', initial_balance: '100' });
    const previous = new Date(today + 'T12:00:00Z'); previous.setUTCDate(previous.getUTCDate() - 1);
    const yesterday = previous.toISOString().slice(0, 10);
    for (const [description, date, status, type] of [
      ['Receita atrasada', yesterday, 'pending', 'income'],
      ['Receita de hoje', today, 'pending', 'income'],
      ['Receita recebida', yesterday, 'confirmed', 'income'],
      ['Despesa prevista', yesterday, 'pending', 'expense'],
    ]) await op(page, 'transaction', { account_id: bank, description, amount: '50', type, status, date });
    await page.goto('/transacoes'); await page.getByRole('button', { name: '7 dias', exact: true }).click();
    const row = page.getByRole('row').filter({ hasText: 'Receita atrasada' });
    await expect(row.getByText('Recebimento em atraso', { exact: true })).toBeVisible();
    await expect(page.getByText('Recebimento em atraso', { exact: true })).toHaveCount(1);
    const snapshot = await (await page.request.get('/api/snapshot')).json();
    expect(snapshot.transactions.find((t: { description: string }) => t.description === 'Receita atrasada').status).toBe('pending');
    await row.getByRole('button', { name: 'Editar', exact: true }).click();
    await page.getByRole('dialog').getByLabel('Status', { exact: true }).selectOption('confirmed');
    await page.getByRole('dialog').getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(row).toContainText('Confirmado');
    await expect(page.getByText('Recebimento em atraso', { exact: true })).toHaveCount(0);
  } finally { expect((await admin.auth.admin.deleteUser(id)).error).toBeNull(); }
});
