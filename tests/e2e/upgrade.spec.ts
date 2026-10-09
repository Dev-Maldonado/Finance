import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
if (
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname,
  )
)
  throw new Error("Upgrade browser tests require a local development database");
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
}).format(new Date());
const month = today.slice(0, 7),
  date = `${month}-01`;
async function login(page: Page, email: string, password: string) {
  await page.goto("/");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar na minha conta" }).click();
  await expect(
    page.getByText("Saldo disponível", { exact: true }),
  ).toBeVisible();
}
async function resource(
  page: Page,
  resourceName: string,
  data: Record<string, unknown>,
) {
  const response = await page.request.post(`/api/data/${resourceName}`, {
    headers: { Origin: "http://localhost:3000" },
    data: { data },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()).id as string;
}
async function op(
  page: Page,
  action: string,
  payload: Record<string, unknown>,
) {
  const response = await page.request.post("/api/operations", {
    headers: { Origin: "http://localhost:3000" },
    data: { action, payload, request_id: randomUUID() },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return await response.json();
}
async function snapshot(page: Page) {
  const response = await page.request.get("/api/snapshot");
  expect(response.ok()).toBe(true);
  return await response.json();
}
async function temporaryUser() {
  const email = `upgrade-${randomUUID()}@example.test`,
    password = randomUUID() + "Aa1!";
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expect(created.error).toBeNull();
  return { email, password, id: created.data.user!.id };
}

test("monthly spending agrees across pages, fields clear, goals and recurrence management are accessible", async ({
  page,
}) => {
  const user = await temporaryUser();
  try {
    await login(page, user.email, user.password);
    const account = await resource(page, "financial_accounts", {
      name: "Banco revisão",
      institution: "Instituição antiga",
      kind: "bank",
      initial_balance: "5000",
    });
    const category = await resource(page, "categories", {
      name: "Essenciais revisão",
      budget: "500",
      spending_kind: "essential",
    });
    const card = await resource(page, "credit_cards", {
      name: "Cartão dia 31",
      account_id: account,
      credit_limit: "5000",
      closing_day: 5,
      due_day: 31,
      last_four: "1234",
    });
    await op(page, "purchase", {
      card_id: card,
      description: "Compra doze parcelas",
      amount: "1200",
      installments: 12,
      date,
      category_id: category,
    });
    await resource(page, "budgets", {
      name: "Orçamento consistente",
      amount: "500",
      month: date,
      category_id: category,
    });
    await page.reload();
    await expect(
      page.getByLabel("Gastos do mês", { exact: true }),
    ).toContainText("R$ 100,00");
    await page.goto("/planejamento");
    const budget = page
      .locator(".panel")
      .filter({
        has: page.getByRole("heading", {
          name: "Orçamento consistente",
          exact: true,
        }),
      });
    await expect(budget).toContainText("R$ 100,00");
    await expect(budget).not.toContainText("Limite ultrapassado");
    await page.goto("/categorias");
    const categoryPanel = page
      .locator(".panel")
      .filter({
        has: page.getByRole("heading", {
          name: "Essenciais revisão",
          exact: true,
        }),
      });
    await expect(categoryPanel).toContainText("R$ 100,00");
    await categoryPanel
      .getByRole("button", { name: "Detalhar despesas" })
      .click();
    await expect(categoryPanel).toContainText("Compra doze parcelas");
    await expect(categoryPanel).toContainText("Parcela 1/12");
    await categoryPanel
      .getByRole("button", { name: "Editar", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Editar categoria", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Limite mensal (R$)").fill("");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(categoryPanel).not.toContainText("Limite mensal");
    expect(
      (await snapshot(page)).categories.find(
        (c: { id: string }) => c.id === category,
      ).budget,
    ).toBeNull();
    await page.goto("/contas");
    const accountPanel = page
      .locator(".panel")
      .filter({
        has: page.getByRole("heading", { name: "Banco revisão", exact: true }),
      });
    await accountPanel
      .getByRole("button", { name: "Editar Banco revisão", exact: true })
      .click();
    await page.getByLabel("Instituição", { exact: true }).fill("");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(
      (await snapshot(page)).financial_accounts.find(
        (a: { id: string }) => a.id === account,
      ).institution,
    ).toBe("");
    await page.goto("/relatorios");
    const report = page
      .locator(".panel")
      .filter({
        has: page.getByRole("heading", {
          name: "Relatório financeiro do período",
          exact: true,
        }),
      });
    await expect(report.locator(".report-grid")).toContainText("R$ 100,00");
    await expect(report.locator(".report-grid")).not.toContainText(
      "R$ 1.200,00",
    );
    await page.goto("/transacoes");
    await page
      .getByRole("button", { name: "Recorrência", exact: true })
      .click();
    await page
      .getByLabel("Descrição", { exact: true })
      .fill("Assinatura revisão");
    await page.getByLabel("Tipo", { exact: true }).selectOption("expense");
    await page.getByLabel("Valor (R$)", { exact: true }).fill("25");
    await page.getByLabel("Conta", { exact: true }).selectOption(account);
    await page
      .getByLabel("Frequência", { exact: true })
      .selectOption("monthly");
    await page.getByLabel("Dia preferido do mês").fill("31");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    const recurring = page
      .locator(".recurrence-row")
      .filter({ hasText: "Assinatura revisão" });
    await recurring
      .getByRole("button", { name: "Pausar", exact: true })
      .click();
    await expect(recurring).toContainText("Pausada");
    await recurring
      .getByRole("button", { name: "Retomar", exact: true })
      .click();
    await expect(recurring).toContainText("Ativa");
    await recurring
      .getByRole("button", { name: "Encerrar", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Encerrar", exact: true })
      .click();
    await expect(recurring).toContainText("Encerrada");
    await expect(
      recurring.getByRole("button", { name: "Retomar" }),
    ).toHaveCount(0);
    await page.goto("/planejamento");
    await page.getByRole("button", { name: "Nova meta", exact: true }).click();
    await page.getByLabel("Nome", { exact: true }).fill("Meta para ajustar");
    await page.getByLabel("Tipo", { exact: true }).selectOption("savings");
    await page.getByLabel("Meta (R$)", { exact: true }).fill("1000");
    await expect(page.getByLabel("Data desejada")).toHaveValue("");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    const goalPanel = page
      .locator(".panel")
      .filter({
        has: page.getByRole("heading", {
          name: "Meta para ajustar",
          exact: true,
        }),
      });
    await goalPanel
      .getByRole("button", { name: "Editar", exact: true })
      .click();
    await page.getByLabel("Meta (R$)", { exact: true }).fill("1200");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(goalPanel).toContainText("R$ 1.200,00");
    await goalPanel
      .getByRole("button", { name: "Excluir", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Excluir", exact: true })
      .click();
    await expect(goalPanel).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
    await expect(page.locator(".sidebar")).toHaveClass(/visible/);
    await page.keyboard.press("Escape");
    await expect(page.locator(".sidebar")).not.toHaveClass(/visible/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    expect((await admin.auth.admin.deleteUser(user.id)).error).toBeNull();
  }
});

test("manual investments never move existing cash and old entry endpoints are retired", async ({ page }) => {
  const user = await temporaryUser();
  try {
    await login(page, user.email, user.password);
    const account = await resource(page, "financial_accounts", { name: "Conta investimentos", kind: "bank", initial_balance: "5000" });
    const headers={Origin:'http://localhost:3000'};
    const created=await page.request.post('/api/manual-investments/create',{headers,data:{name:'Fundo manual',manual_kind:'fund',quantity:'10',amount:'1000',date,request_id:randomUUID()}});
    expect(created.ok(),await created.text()).toBe(true);const investment=await created.json();
    const added=await page.request.post('/api/manual-investments/purchase',{headers,data:{asset_id:investment.asset_id,quantity:'5',amount:'600',date,request_id:randomUUID()}});expect(added.ok()).toBe(true);
    const priced=await page.request.post('/api/manual-investments/price',{headers,data:{asset_id:investment.asset_id,price:'130',date,request_id:randomUUID()}});expect(priced.ok()).toBe(true);
    const old=await page.request.post('/api/operations',{headers,data:{action:'investment',payload:{},request_id:randomUUID()}});expect(old.ok()).toBe(false);
    const importOld=await page.request.post('/api/import',{headers,data:{text:'ticker,type,quantity,price,date',format:'csv',target:'investments',account_id:account}});expect(importOld.ok()).toBe(false);
    const after=await snapshot(page);expect(after.account_balances.find((a:{id:string})=>a.id===account).balance).toBe('5000.00');expect(after.transactions).toHaveLength(0);expect(after.manual_investment_purchases).toHaveLength(2);
    await page.goto('/investimentos');await expect(page.getByRole('article',{name:'Patrimônio atual',exact:true})).toContainText('R$ 1.950,00');
  } finally { expect((await admin.auth.admin.deleteUser(user.id)).error).toBeNull(); }
});

test("cash import classifies own transfers without inflating spending and avoids reimport duplicates", async ({
  page,
}) => {
  const user = await temporaryUser();
  try {
    await login(page, user.email, user.password);
    const account = await resource(page, "financial_accounts", {
      name: "Conta origem",
      kind: "bank",
      initial_balance: "5000",
    });
    const other = await resource(page, "financial_accounts", {
      name: "Conta destino",
      kind: "bank",
      initial_balance: "0",
    });
    await page.goto("/transacoes");
    const imports = page
      .locator(".panel")
      .filter({
        has: page.getByRole("heading", {
          name: "Importar transações",
          exact: true,
        }),
      });
    await imports.getByLabel("Conta do arquivo", { exact: true }).selectOption(account);
    await imports
      .getByLabel("Arquivo CSV ou OFX", { exact: true })
      .setInputFiles({
        name: "cash.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
          `description,date,amount,source_id\nTransferencia propria,${date},-500,upgrade-transfer\nMercado importado,${date},-100,upgrade-expense`,
        ),
      });
    await imports
      .getByRole("button", { name: "Pré-visualizar", exact: true })
      .click();
    await imports
      .getByLabel("Classificação de Transferencia propria", { exact: true })
      .selectOption("transfer");
    await imports
      .getByLabel("Outra conta de Transferencia propria", { exact: true })
      .selectOption(other);
    await imports
      .getByRole("button", { name: "Confirmar importação", exact: true })
      .click();
    await expect(imports).toContainText("2 registros importados");
    let s = await snapshot(page);
    expect(
      s.account_balances.find((a: { id: string }) => a.id === account).balance,
    ).toBe("4400.00");
    expect(
      s.account_balances.find((a: { id: string }) => a.id === other).balance,
    ).toBe("500.00");
    await imports
      .getByRole("button", { name: "Pré-visualizar", exact: true })
      .click();
    await expect(imports).toContainText("2 duplicados identificados");
    await imports
      .getByRole("button", { name: "Confirmar importação", exact: true })
      .click();
    await expect(imports).toContainText("0 registros importados");
    s = await snapshot(page);
    expect(
      s.account_balances.find((a: { id: string }) => a.id === account).balance,
    ).toBe("4400.00");
    await page.goto("/");
    await expect(
      page.getByLabel("Gastos do mês", { exact: true }),
    ).toContainText("R$ 100,00");
  } finally {
    expect((await admin.auth.admin.deleteUser(user.id)).error).toBeNull();
  }
});

test('cash imports review overlapping files and require explicit consent for a separate identical transaction', async ({ page }) => {
  const user = await temporaryUser();
  try {
    await login(page, user.email, user.password);
    const account = await resource(page, 'financial_accounts', {name:'Conta de revisão',kind:'bank',initial_balance:'100'});
    const csv = (batch:string) => `description,date,amount,batch\nCafé repetido,${date},-15.20,${batch}`;
    const preview = async (text:string) => {
      const r=await page.request.post('/api/import',{headers:{Origin:'http://localhost:3000'},data:{text,format:'csv',account_id:account}});
      expect(r.ok(),await r.text()).toBe(true);return (await r.json()).rows;
    };
    const confirm = async (text:string,row_id:string,force_new=false,request_id=randomUUID()) => {
      const body={text,format:'csv',account_id:account,confirm:true,request_id,decisions:[{row_id,classification:'expense',force_new}]};
      const r=await page.request.post('/api/import',{headers:{Origin:'http://localhost:3000'},data:body});
      expect(r.ok(),await r.text()).toBe(true);return {result:await r.json(),body};
    };
    const first=await preview(csv('A'));
    expect((await confirm(csv('A'),first[0].row_id)).result.imported).toBe(1);
    const other=await preview(csv('B'));
    expect(other[0]).toMatchObject({duplicate:false,possible_duplicate:true,requires_review:true});
    expect((await confirm(csv('B'),other[0].row_id)).result.imported).toBe(1);
    const duplicate=await preview(csv('A'));
    expect(duplicate[0]).toMatchObject({duplicate:true,can_force_new:true});
    expect((await confirm(csv('A'),duplicate[0].row_id)).result.imported).toBe(0);
    const explicit=await confirm(csv('A'),duplicate[0].row_id,true);
    expect(explicit.result.imported).toBe(1);
    const retry=await page.request.post('/api/import',{headers:{Origin:'http://localhost:3000'},data:explicit.body});
    expect(retry.ok(),await retry.text()).toBe(true);expect((await retry.json()).imported).toBe(0);
    expect((await snapshot(page)).account_balances.find((a:{id:string})=>a.id===account).balance).toBe('54.40');
    await page.goto('/transacoes');
    const imports=page.locator('.panel').filter({has:page.getByRole('heading',{name:'Importar transações',exact:true})});
    await imports.getByLabel('Conta do arquivo',{exact:true}).selectOption(account);
    await imports.getByLabel('Arquivo CSV ou OFX',{exact:true}).setInputFiles({name:'repeated.csv',mimeType:'text/csv',buffer:Buffer.from(csv('A'))});
    await imports.getByRole('button',{name:'Pré-visualizar',exact:true}).click();
    const force=imports.getByLabel('Confirmo outro lançamento de Café repetido',{exact:true});
    await expect(force).not.toBeChecked();
    await expect(imports.getByLabel('Classificação de Café repetido',{exact:true})).toBeDisabled();
    await force.check();
    await expect(imports.getByLabel('Classificação de Café repetido',{exact:true})).toBeEnabled();
  } finally { expect((await admin.auth.admin.deleteUser(user.id)).error).toBeNull(); }
});
