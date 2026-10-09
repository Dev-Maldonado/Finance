import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { installmentPreview } from "../../src/lib/installments";
import { invoiceDate, shiftInvoiceMonth } from "../../src/lib/card-invoices";
import { forecastItems } from "../../src/lib/financial-plan";
import { periodMetrics, monthEnd } from "../../src/lib/dashboard";
import { rows, type Snapshot } from "../../src/lib/summary";

if (!["localhost", "127.0.0.1"].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname)) throw new Error("Financial feature browser tests require a local database");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const month = today.slice(0, 7);

async function createUser(page: Page) {
  const email = `schedules-${randomUUID()}@example.test`, password = randomUUID() + "Aa1!";
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error).toBeNull();
  const userId = created.data.user!.id;
  const account = await admin.from("financial_accounts").insert({ user_id: userId, name: "Banco de compromissos", kind: "bank", initial_balance: "10000" }).select("id").single();
  expect(account.error).toBeNull();
  await page.goto("/");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar na minha conta" }).click();
  await expect(page.getByText("Saldo disponível", { exact: true })).toBeVisible();
  return { userId, accountId: account.data!.id as string };
}

async function snapshot(page: Page): Promise<Snapshot> {
  const response = await page.request.get("/api/snapshot");
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

test("exact per-installment entry, monthly preview and future corrections preserve other installments", async ({ page }) => {
  const { userId, accountId } = await createUser(page);
  try {
    const card = await admin.from("credit_cards").insert({ user_id: userId, name: "Cartão flexível", account_id: accountId, last_four: "4321", credit_limit: "10000", closing_day: 5, due_day: 10 }).select("id").single();
    expect(card.error).toBeNull();
    await page.goto("/cartoes");
    await page.getByRole("button", { name: "Registrar compra", exact: true }).click();
    await page.getByLabel("Cartão", { exact: true }).selectOption(card.data!.id);
    await page.getByLabel("Descrição", { exact: true }).fill("Compra individual exata");
    await page.getByRole("radio", { name: "Valor individual da parcela", exact: true }).check();
    await page.getByLabel("Valor individual da parcela (R$)", { exact: true }).fill("150,00");
    await page.getByLabel("Número de parcelas").fill("10");
    await page.getByLabel("Data", { exact: true }).fill(today);
    // The section has an accessible label and ten monthly rows, not a single total expense.
    await expect(page.locator(".installment-preview tbody tr")).toHaveCount(10);
    await expect(page.locator(".installment-preview")).toContainText("Total: R$ 1.500,00");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    let data = await snapshot(page);
    const purchase = rows(data, "credit_card_purchases").find(row => row.description === "Compra individual exata")!;
    expect(purchase.amount).toBe("1500.00");
    expect(rows(data, "credit_card_installments").filter(row => row.purchase_id === purchase.id).map(row => row.amount)).toEqual(Array(10).fill("150.00"));
    const firstDue = installmentPreview("1500", 10, today, 5, 10)[0].dueDate;
    const dueMonth = firstDue.slice(0, 7);
    expect(periodMetrics(data, `${dueMonth}-01`, monthEnd(dueMonth)).expenses).toBe("150.00");
    await page.getByLabel("Mês das faturas").fill(dueMonth);
    await page.getByText("Ver parcelas (1)", { exact: true }).click();
    const firstPart = rows(data, "credit_card_installments").find(row => row.purchase_id === purchase.id && Number(row.number) === 1)!;
    await page.getByRole("button", { name: "Editar parcela 1 de Compra individual exata", exact: true }).click();
    await page.getByLabel("Valor da parcela (R$)", { exact: true }).fill("160.01");
    await page.getByLabel("Motivo da correção").fill("Correção do contrato");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    data = await snapshot(page);
    expect(rows(data, "credit_card_purchases").find(row => row.id === purchase.id)?.amount).toBe("1510.01");
    expect(rows(data, "credit_card_installments").filter(row => row.purchase_id === purchase.id && row.id !== firstPart.id).map(row => row.amount)).toEqual(Array(9).fill("150.00"));
    expect(periodMetrics(data, `${dueMonth}-01`, monthEnd(dueMonth)).expenses).toBe("160.01");
    const nextMonth = shiftInvoiceMonth(dueMonth, 1);
    expect(periodMetrics(data, `${nextMonth}-01`, monthEnd(nextMonth)).expenses).toBe("150.00");
    expect(rows(data, "transactions")).toHaveLength(0);
    await expect(page.getByRole("article", { name: "Fatura de Cartão flexível" }).locator(".invoice-values strong").first()).toHaveText("R$ 160,01");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: "/tmp/finora-installments-mobile.png", fullPage: true });
  } finally { expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull(); }
});

test("expense recurrence generates once, supports annual/end dates and excludes future months from actual spending", async ({ page }) => {
  const { userId, accountId } = await createUser(page);
  try {
    await page.goto("/transacoes");
    await page.getByRole("button", { name: "Novo lançamento", exact: true }).click();
    await page.getByLabel("Descrição", { exact: true }).fill("Assinatura mensal prevista");
    await page.getByLabel("Gasto Recorrente", { exact: true }).check();
    await page.getByLabel("Valor (R$)", { exact: true }).fill("59,90");
    await page.getByLabel("Conta", { exact: true }).selectOption(accountId);
    await page.getByLabel("Data de início", { exact: true }).fill(today);
    await page.getByLabel("Frequência", { exact: true }).selectOption("monthly");
    const endDate = invoiceDate(shiftInvoiceMonth(month, 2), Number(today.slice(8)));
    await page.getByLabel("Data de término (opcional)", { exact: true }).fill(endDate);
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("row").filter({ hasText: "Assinatura mensal prevista" })).toContainText("Pendente");
    let data = await snapshot(page);
    const recurrence = rows(data, "recurring_transactions").find(row => row.description === "Assinatura mensal prevista")!;
    expect(recurrence.active).toBe(true);
    expect(recurrence.end_date).toBe(endDate);
    const generated = rows(data, "transactions").filter(row => String(row.source_id).startsWith(`recurrence:${recurrence.id}:`));
    expect(generated).toHaveLength(1);
    expect(generated[0]).toMatchObject({ status: "pending", amount: "-59.90", date: today });
    expect(periodMetrics(data, `${month}-01`, today).expenses).toBe("0.00");
    expect(forecastItems(data, today, endDate).filter(item => item.description === "Assinatura mensal prevista")).toHaveLength(3);
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await page.request.post("/api/recurring", { headers: { Origin: "http://localhost:3000" }, data: {} });
      expect(response.ok(), await response.text()).toBe(true);
    }
    expect(rows(await snapshot(page), "transactions")).toHaveLength(1);
    const line = page.locator(".recurrence-row").filter({ hasText: "Assinatura mensal prevista" });
    await line.getByRole("button", { name: "Editar", exact: true }).click();
    await page.getByLabel("Frequência", { exact: true }).selectOption("annual");
    await page.getByLabel("Data de término (opcional)", { exact: true }).fill("");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(line).toContainText("Anual");
    data = await snapshot(page);
    expect(rows(data, "recurring_transactions").find(row => row.id === recurrence.id)?.end_date).toBeNull();
    await line.getByRole("button", { name: "Pausar", exact: true }).click();
    await expect(line).toContainText("Pausada");
    expect(forecastItems(await snapshot(page), today, endDate).filter(item => item.source === "recurring")).toHaveLength(0);
    await line.getByRole("button", { name: "Retomar", exact: true }).click();
    await expect(line).toContainText("Ativa");
    await line.getByRole("button", { name: "Encerrar", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Encerrar", exact: true }).click();
    await expect(line).toContainText("Encerrada");
    expect(rows(await snapshot(page), "transactions").find(row => row.id === generated[0].id)?.status).toBe("pending");
  } finally { expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull(); }
});
