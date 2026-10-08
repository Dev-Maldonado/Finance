import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
if (
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname,
  )
)
  throw new Error("Browser tests require a local development database");
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
test("card color and corrections of purchases, expenses and income persist", async ({ page }) => {
  const email = `correction-${randomUUID()}@example.test`, password = randomUUID() + "Aa1!";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  expect(error).toBeNull();
  const user = data.user!.id;
  try {
    const account = await admin.from("financial_accounts").insert({ user_id: user, name: "Correction bank", kind: "bank", initial_balance: "5000" }).select("id").single();
    expect(account.error).toBeNull();
    await page.goto("/");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar na minha conta" }).click();
    await expect(page.getByText("Saldo disponível", { exact: true })).toBeVisible();
    const assertBalance = async (expected: string) => {
      await expect.poll(async () => {
        const r = await page.request.get("/api/snapshot");
        const s = await r.json();
        return s.account_balances?.find((a: { id: string }) => a.id === account.data!.id)?.balance;
      }).toBe(expected);
    };
    for (const type of ["expense", "income"]) {
      await page.goto("/transacoes");
      await page.getByRole("button", { name: "Novo lançamento", exact: true }).click();
      await page.getByLabel("Descrição", { exact: true }).fill(`Wrong ${type}`);
      await page.getByLabel("Tipo", { exact: true }).selectOption(type);
      await page.getByLabel("Valor (R$)", { exact: true }).fill("75.20");
      await page.getByLabel("Conta", { exact: true }).selectOption(account.data!.id);
      await page.getByLabel("Status", { exact: true }).selectOption("confirmed");
      await page.getByRole("button", { name: "Salvar", exact: true }).click();
      const original = page.getByRole("row").filter({ has: page.getByText(`Wrong ${type}`, { exact: true }) });
      await expect(original).toBeVisible();
      await page.setViewportSize({ width: 390, height: 844 });
      const button = original.getByRole("button", { name: "Editar", exact: true });
      const bounds = await button.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
      await button.click();
      await expect(page.getByRole("heading", { name: "Editar lançamento" })).toBeVisible();
      await page.getByLabel("Descrição", { exact: true }).fill(`Correct ${type}`);
      await page.getByLabel("Valor (R$)", { exact: true }).fill("50.25");
      await page.getByRole("button", { name: "Salvar", exact: true }).click();
      const corrected = page.getByRole("row").filter({ has: page.getByText(`Correct ${type}`, { exact: true }) });
      await expect(corrected).toBeVisible();
      await assertBalance(type === "expense" ? "4949.75" : "5050.25");
      await page.reload();
      await corrected.getByRole("button", { name: "Excluir", exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Excluir", exact: true }).click();
      await expect(corrected).not.toBeVisible();
      await assertBalance("5000.00");
      await page.getByLabel("Mostrar lançamentos excluídos").check();
      await expect(corrected).toContainText("Excluído");
      await page.setViewportSize({ width: 1280, height: 900 });
    }
    await page.goto("/cartoes");
    await page.getByRole("button", { name: "Novo cartão", exact: true }).click();
    await page.getByLabel("Nome", { exact: true }).fill("Colored card");
    await page.getByLabel("Cor do cartão").fill("#14a078");
    await page.getByLabel("Quatro últimos dígitos").fill("1234");
    await page.getByLabel("Limite (R$)").fill("1000");
    await page.getByLabel("Dia de fechamento (1–28)").fill("5");
    await page.getByLabel("Dia de vencimento (1–28)").fill("10");
    await page.getByLabel("Conta", { exact: true }).selectOption(account.data!.id);
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.locator(".bank-card")).toHaveCSS("background-color", "rgb(20, 160, 120)");
    await page.reload();
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    await page.getByLabel("Cor do cartão").fill("#ffffff");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.locator(".bank-card")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(page.locator(".bank-card")).toHaveCSS("color", "rgb(23, 19, 39)");
    await page.getByRole("button", { name: "Registrar compra", exact: true }).click();
    await page.getByLabel("Cartão", { exact: true }).selectOption({ label: "Colored card" });
    await page.getByLabel("Descrição", { exact: true }).fill("Wrong purchase");
    await page.getByLabel("Valor (R$)", { exact: true }).fill("100.01");
    await page.getByLabel("Data", { exact: true }).fill("2026-10-01");
    await page.getByLabel("Número de parcelas").fill("3");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    const purchase = page.getByRole("row").filter({ has: page.getByText("Wrong purchase", { exact: true }) });
    await purchase.getByRole("button", { name: "Editar", exact: true }).click();
    await page.getByLabel("Descrição", { exact: true }).fill("Correct purchase");
    await page.getByLabel("Valor (R$)", { exact: true }).fill("90.02");
    await page.getByLabel("Data", { exact: true }).fill("2026-10-06");
    await page.getByLabel("Número de parcelas").fill("2");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    const corrected = page.getByRole("row").filter({ has: page.getByText("Correct purchase", { exact: true }) });
    await expect(corrected).toContainText("R$ 90,02");
    await expect(page.getByText("R$ 909,98", { exact: true })).toBeVisible();
    await page.reload();
    await corrected.getByRole("button", { name: "Excluir", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Excluir", exact: true }).click();
    await expect(corrected).not.toBeVisible();
    await expect(page.getByText("R$ 1.000,00", { exact: true })).toBeVisible();
    await page.getByLabel("Mostrar compras excluídas").check();
    await expect(corrected).toContainText("Excluída");
    await assertBalance("5000.00");
  } finally {
    expect((await admin.auth.admin.deleteUser(user)).error).toBeNull();
  }
});
test("login, conta, transação, persistência e layout móvel", async ({
  page,
}) => {
  const email = `e2e-${randomUUID()}@example.test`,
    password = randomUUID() + "Aa1!";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expect(error).toBeNull();
  const id = data.user!.id;
  const browserErrors: string[] = [];
  page.on("pageerror", (e) => browserErrors.push(e.message));
  try {
    await page.goto("/");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar na minha conta" }).click();
    await expect(
      page.getByRole("heading", { name: "Seu panorama financeiro" }),
    ).toBeVisible();
    await expect(page.getByText("Carregando seus dados…")).not.toBeVisible();
    await page
      .getByRole("link", { name: "Contas e Saldos", exact: true })
      .click();
    await page.getByRole("button", { name: "Nova conta", exact: true }).click();
    await page.getByLabel("Nome", { exact: true }).fill("Conta principal");
    await page.getByLabel("Saldo inicial (R$)").fill("1000");
    await page.getByLabel("Tipo", { exact: true }).selectOption("bank");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Conta principal" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Transações", exact: true }).click();
    await page
      .getByRole("button", { name: "Novo lançamento", exact: true })
      .click();
    await page.getByLabel("Descrição", { exact: true }).fill("Mercado real");
    await page.getByLabel("Tipo", { exact: true }).selectOption("expense");
    await page.getByLabel("Status", { exact: true }).selectOption("confirmed");
    await page.getByLabel("Valor (R$)").fill("75.20");
    await page
      .getByLabel("Conta", { exact: true })
      .selectOption({ label: "Conta principal" });
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByText("Mercado real", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Mercado real", { exact: true })).toBeVisible();
    await page.goto("/");
    await expect(
      page.getByText("Saldo disponível", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/dashboard-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "test-results/dashboard-mobile.png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await page
      .getByRole("link", { name: "Caixinhas CDI", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Caixinhas", exact: true }),
    ).toBeVisible();
    expect(browserErrors).toEqual([]);
  } finally {
    await admin.auth.admin.deleteUser(id);
  }
});

test("caixinha, cartão e relatório usam dados persistidos e mantêm proteções de acesso", async ({
  page,
  request,
}) => {
  const email = `flow-${randomUUID()}@example.test`,
    password = randomUUID() + "Aa1!";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expect(error).toBeNull();
  const id = data.user!.id;
  try {
    const account = await admin
      .from("financial_accounts")
      .insert({
        user_id: id,
        name: "Banco de teste",
        kind: "bank",
        initial_balance: "5000",
      })
      .select("id")
      .single();
    expect(account.error).toBeNull();
    await page.goto("/");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar na minha conta" }).click();
    await expect(
      page.getByText("Saldo disponível", { exact: true }),
    ).toBeVisible();
    expect((await request.get("/api/snapshot")).status()).toBe(401);
    const blocked = await page.request.post("/api/operations", {
      headers: { Origin: "https://different.example" },
      data: {},
    });
    expect(blocked.status()).toBe(400);
    await page.goto("/caixinhas");
    await page
      .getByRole("button", { name: "Nova caixinha", exact: true })
      .click();
    await page
      .getByLabel("Nome", { exact: true })
      .fill("Reserva de emergência");
    await page.getByLabel("Meta (R$)").fill("2000");
    await page.getByLabel("Remuneração").selectOption("cdi");
    await page.getByLabel("Produto tributário").selectOption("cdb");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Reserva de emergência", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Aportar", exact: true }).click();
    await page
      .getByLabel("Caixinha", { exact: true })
      .selectOption({ label: "Reserva de emergência" });
    await page
      .getByLabel("Conta", { exact: true })
      .selectOption({ label: "Banco de teste" });
    await page.getByLabel("Valor (R$)").fill("500");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.getByText("Registro salvo com sucesso.")).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("R$ 500,00", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText(/Data-base CDI:|Sem taxas históricas disponíveis/),
    ).toBeVisible();
    await page.goto("/cartoes");
    await page
      .getByRole("button", { name: "Novo cartão", exact: true })
      .click();
    await page.getByLabel("Nome", { exact: true }).fill("Meu cartão");
    await page.getByLabel("Quatro últimos dígitos").fill("1234");
    await page.getByLabel("Limite (R$)").fill("1000");
    await page.getByLabel("Dia de fechamento (1–28)").fill("5");
    await page.getByLabel("Dia de vencimento (1–28)").fill("10");
    await page
      .getByLabel("Conta", { exact: true })
      .selectOption({ label: "Banco de teste" });
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Meu cartão", exact: true }),
    ).toBeVisible();
    await page.goto("/relatorios");
    await expect(
      page.getByRole("heading", { name: "Relatório financeiro do período" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Registrar posição hoje" }).click();
    await expect(
      page.getByText("Posição patrimonial de hoje registrada."),
    ).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "XLSX", exact: true }).click();
    expect((await download).suggestedFilename()).toBe("finora-relatorio.xlsx");
  } finally {
    const r = await admin.auth.admin.deleteUser(id);
    expect(r.error).toBeNull();
  }
});
