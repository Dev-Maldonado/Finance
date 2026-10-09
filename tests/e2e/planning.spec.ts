import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { D } from '../../src/financial/engine';
if (!['localhost', '127.0.0.1'].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname)) throw new Error('Planning tests require local development database');
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const shift = (day: string, offset: number) => new Date(Date.parse(`${day}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
async function assertResponsive(page: Page) {
  await expect.poll(async () => {
    return await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  }, { timeout: 5000, message: 'The settled mobile page must fit the viewport' }).toBeLessThanOrEqual(0).catch(async error => {
    const overflow = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, elements: [...document.querySelectorAll('main *')].filter(element => element.getBoundingClientRect().right > innerWidth + 1).map(element => ({ tag: element.tagName, className: typeof element.className === 'string' ? element.className : '', text: (element.textContent ?? '').slice(0, 90), right: element.getBoundingClientRect().right, width: element.getBoundingClientRect().width })).slice(0, 22) }));
    console.error('Mobile layout diagnostic:', JSON.stringify(overflow));
    throw error;
  });
}
test('financial planning distinguishes future cash, safe spending and essential reserve; reconciliation remains audited and explicit', async ({ page }) => {
  test.setTimeout(90000);
  const email = `planning-${randomUUID()}@example.test`, password = randomUUID() + 'Aa1!';
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error).toBeNull();
  const userId = created.data.user!.id;
  try {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const account = await admin.from('financial_accounts').insert({ user_id: userId, name: 'Conta planejamento', kind: 'bank', initial_balance: '10000' }).select('id').single(); expect(account.error).toBeNull();
    const category = await admin.from('categories').insert({ user_id: userId, name: 'Essenciais da casa', spending_kind: 'essential' }).select('id').single(); expect(category.error).toBeNull();
    for (let offset = 1; offset <= 3; offset++) {
      const date = new Date(`${today.slice(0, 7)}-01T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() - offset);
      const expense = await admin.from('transactions').insert({ user_id: userId, account_id: account.data!.id, category_id: category.data!.id, description: 'Essenciais do mês', type: 'expense', amount: '-100', date: date.toISOString().slice(0, 10), status: 'confirmed' }); expect(expense.error).toBeNull();
    }
    await page.goto('/');
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    const initialSnapshot = page.waitForResponse(response => new URL(response.url()).pathname === '/api/snapshot' && response.ok());
    await page.getByRole('button', { name: 'Entrar na minha conta' }).click();
    await initialSnapshot;
    await expect(page.getByText('Saldo disponível', { exact: true })).toBeVisible();
    const op = async (action: string, payload: Record<string, unknown>) => {
      const response = await page.request.post('/api/operations', { headers: { Origin: 'http://localhost:3000' }, data: { action, payload, request_id: randomUUID() } });
      expect(response.ok(), await response.text()).toBe(true);
      return response.json();
    };
    const goal = await op('create_goal', { name: 'Reserva planejada', target: '2000', indexer: 'none', percentage: '100', product: 'custom' });
    expect((await admin.from('savings_goals').update({ is_emergency_reserve: true }).eq('id', goal.id)).error).toBeNull();
    await op('savings_deposit', { goal_id: goal.id, account_id: account.data!.id, amount: '1000', date: today });
    await op('transaction', { account_id: account.data!.id, description: 'Receita ainda prevista', type: 'income', amount: '300', date: shift(today, 2), status: 'pending' });
    await op('transaction', { account_id: account.data!.id, description: 'Conta telefone prevista', type: 'expense', amount: '100', date: shift(today, 1), status: 'pending' });
    expect((await admin.from('financial_obligations').insert({ user_id: userId, name: 'Licenciamento previsto', amount: '200', due_date: shift(today, 3), status: 'pending' })).error).toBeNull();
    expect((await admin.from('recurring_transactions').insert({ user_id: userId, account_id: account.data!.id, description: 'Academia mensal', type: 'expense', amount: '100', next_date: shift(today, 7), frequency: 'monthly', active: true })).error).toBeNull();
    await page.goto('/planejamento');
    const planning = page.getByLabel('Plano financeiro pessoal');
    const forecast = planning.getByLabel('Previsão de caixa para 30, 60 e 90 dias');
    await expect(forecast.getByRole('button', { name: /^30 dias/ })).toContainText('R$ 8.600,00');
    await expect(forecast).toContainText('Receita ainda prevista');
    await expect(forecast).toContainText('Valores previstos não foram recebidos nem pagos');
    await expect(planning.getByLabel('Disponível para gastar até o fim do mês')).toContainText('sem antecipar receitas');
    const reserve = planning.getByLabel('Reserva de emergência em meses');
    await expect(reserve).toContainText('10 meses');
    await expect(reserve).toContainText('R$ 100,00');
    await expect(reserve).toContainText('R$ 1.000,00');
    await forecast.getByRole('button', { name: /^90 dias/ }).click();
    await expect(forecast.getByRole('button', { name: /^90 dias/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(forecast.getByText('Ver os compromissos dos próximos 90 dias')).toBeVisible();
    const card = await admin.from('credit_cards').insert({ user_id: userId, account_id: account.data!.id, name: 'Cartão conciliação', last_four: '4321', credit_limit: '1000', closing_day: 5, due_day: 10 }).select('id').single(); expect(card.error).toBeNull();
    await op('purchase', { card_id: card.data!.id, description: 'Compra para conferir fatura', amount: '100', installments: 2, date: `${today.slice(0, 7)}-01` });
    const invoice = await admin.from('credit_card_invoices').select('id').eq('card_id', card.data!.id).eq('due_date', `${today.slice(0, 7)}-10`).single(); expect(invoice.error).toBeNull();
    await page.goto('/configuracoes');
    await expect(page.getByLabel('Confiabilidade dos números')).toContainText('não confirma seu saldo bancário');
    const reconciliation = page.getByLabel('Conciliação mensal de banco e cartão');
    await reconciliation.getByLabel('Conta para conciliar').selectOption(account.data!.id);
    await reconciliation.getByLabel('Saldo oficial da conta (R$)').fill('8701,00');
    await reconciliation.getByLabel('Origem e explicação da diferença').fill('Extrato fictício usado somente no teste local');
    await expect(reconciliation.locator('.reconciliation-preview')).toContainText('R$ 1,00');
    const apply = reconciliation.getByRole('checkbox');
    await expect(apply).not.toBeChecked();
    await reconciliation.getByRole('button', { name: 'Registrar conciliação' }).click();
    await expect(reconciliation.getByRole('status')).toContainText('Conciliação registrada');
    let balance = await admin.from('account_balances').select('balance').eq('id', account.data!.id).single(); expect(balance.error).toBeNull(); expect(D(balance.data!.balance).eq('8700')).toBe(true);
    await expect(reconciliation.locator('.reconciliation-history')).toContainText('Conferência auditada');
    await reconciliation.getByLabel('Saldo oficial da conta (R$)').fill('8701,00');
    await reconciliation.getByLabel('Origem e explicação da diferença').fill('Ajuste explícito de teste');
    await reconciliation.getByRole('checkbox').check();
    await reconciliation.getByRole('button', { name: 'Registrar conciliação' }).click();
    await expect(reconciliation.getByRole('status')).toContainText('ajuste vinculado');
    balance = await admin.from('account_balances').select('balance').eq('id', account.data!.id).single(); expect(D(balance.data!.balance).eq('8701')).toBe(true);
    const audit = await admin.from('account_reconciliations').select('difference,transaction_id').eq('user_id', userId); expect(audit.error).toBeNull(); expect(audit.data).toHaveLength(2); expect(audit.data!.filter(r => r.transaction_id)).toHaveLength(1);
    await reconciliation.getByRole('button', { name: 'Fatura do cartão', exact: true }).click();
    await reconciliation.getByLabel('Fatura para conciliar').selectOption(invoice.data!.id);
    await reconciliation.getByLabel('Saldo oficial da fatura a pagar (R$)').fill('53,00');
    await expect(reconciliation.locator('.reconciliation-preview')).toContainText('R$ 3,00');
    await expect(reconciliation.getByRole('checkbox')).toHaveCount(0);
    await reconciliation.getByRole('button', { name: 'Registrar conciliação' }).click();
    await expect(reconciliation.getByRole('status')).toContainText('Conciliação registrada');
    const invoiceAudit = await admin.from('invoice_reconciliations').select('registered_balance,confirmed_balance,difference').eq('user_id', userId); expect(invoiceAudit.error).toBeNull(); expect(invoiceAudit.data).toHaveLength(1); expect(D(invoiceAudit.data![0].registered_balance).eq('50')).toBe(true); expect(D(invoiceAudit.data![0].difference).eq('3')).toBe(true);
    const payments = await admin.from('credit_card_payments').select('id').eq('invoice_id', invoice.data!.id); expect(payments.data).toEqual([]);
    await page.screenshot({ path: 'test-results/planning-reconciliation-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await assertResponsive(page);
    await page.goto('/planejamento');
    await expect(page.getByLabel('Plano financeiro pessoal')).toBeVisible();
    await assertResponsive(page);
    await page.screenshot({ path: 'test-results/planning-mobile.png', fullPage: true });
  } finally { expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull(); }
});
