import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!,
  anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
assert.ok(
  ["localhost", "127.0.0.1"].includes(new URL(url).hostname),
  "Tests only run against a local development database",
);
assert.ok(url && anon && key, "Local Supabase variables are required");
const admin = createClient(url, key, { auth: { persistSession: false } });
const users: string[] = [];
let passed = 0;
async function check(label: string, fn: () => Promise<void>) {
  await fn();
  console.log("PASS", label);
  passed++;
}
try {
  const make = async () => {
    const email = `finora-${randomUUID()}@example.test`,
      password = randomUUID() + "Aa1!";
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`Create local test user: ${error.message}`);
    users.push(data.user.id);
    const db = createClient(url, anon, { auth: { persistSession: false } });
    const r = await db.auth.signInWithPassword({ email, password });
    assert.equal(r.error, null);
    return { db, user: data.user };
  };
  const a = await make(),
    b = await make();
  const db = a.db;
  const { data: account, error } = await db
    .from("financial_accounts")
    .insert({
      name: "Integration account",
      initial_balance: "10000",
      kind: "bank",
    })
    .select("id")
    .single();
  assert.equal(error, null);
  assert.ok(account);
  const rpc = async (
    action: string,
    payload: Record<string, unknown>,
    request_id = randomUUID(),
  ) => {
    const result = await db.rpc("execute_operation", {
      action,
      payload,
      request_id,
    });
    if (result.error) throw new Error(`${action}: ${result.error.message}`);
    return result.data;
  };
  const day = "2026-10-01";
  const uuid = randomUUID();
  await check("Receita persistente e idempotente", async () => {
    const p = {
      account_id: account.id,
      description: "Income",
      type: "income",
      amount: "100.15",
      date: day,
    };
    await rpc("transaction", p, uuid);
    await rpc("transaction", p, uuid);
    const r = await db
      .from("transactions")
      .select("id")
      .eq("description", "Income");
    assert.equal(r.data?.length, 1);
  });
  await check("RLS: outro usuário não lê nem altera conta", async () => {
    const r = await b.db
      .from("financial_accounts")
      .select("*")
      .eq("id", account.id);
    assert.deepEqual(r.data, []);
    const u = await b.db
      .from("financial_accounts")
      .update({ name: "Attack" })
      .eq("id", account.id)
      .select();
    assert.deepEqual(u.data, []);
  });
  await check("Referências entre usuários são rejeitadas", async () => {
    const r = await b.db.from("transactions").insert({
      account_id: account.id,
      description: "Attack",
      type: "expense",
      amount: "-1",
      date: day,
    });
    assert.ok(r.error);
  });
  let destination: string;
  await check(
    "Transferência preserva patrimônio e não vira renda",
    async () => {
      const r = await db
        .from("financial_accounts")
        .insert({ name: "Destination", initial_balance: "0", kind: "cash" })
        .select("id")
        .single();
      assert.equal(r.error, null);
      destination = r.data!.id;
      await rpc("transfer", {
        from_account: account.id,
        to_account: destination,
        amount: "300",
        date: day,
      });
      const v = await db.from("account_balances").select("balance");
      assert.equal(
        v.data?.reduce(
          (sum, r) => sum + Math.round(Number(r.balance) * 100),
          0,
        ),
        1010015,
      );
    },
  );
  let card: string;
  await check("Parcelas conservam centavos e fechamento", async () => {
    const r = await db
      .from("credit_cards")
      .insert({
        name: "Card",
        last_four: "1234",
        credit_limit: "1000",
        closing_day: 5,
        due_day: 10,
        account_id: account.id,
      })
      .select("id")
      .single();
    assert.equal(r.error, null);
    card = r.data!.id;
    await rpc("purchase", {
      card_id: card,
      description: "Laptop",
      amount: "100",
      date: "2026-10-05",
      installments: 3,
    });
    const v = await db.from("credit_card_installments").select("amount::text");
    assert.deepEqual(v.data?.map((r) => r.amount).sort(), [
      "33.33",
      "33.33",
      "33.34",
    ]);
    const inv = await db
      .from("credit_card_invoices")
      .select("due_date")
      .order("due_date");
    assert.equal(inv.data?.[0].due_date, "2026-11-10");
  });
  await check("Pagamento parcial não gera despesa duplicada", async () => {
    const inv = await db
      .from("credit_card_invoices")
      .select("id")
      .order("due_date")
      .limit(1)
      .single();
    await rpc("pay_invoice", {
      invoice_id: inv.data!.id,
      account_id: account.id,
      amount: "10",
      date: day,
    });
    const p = await db
      .from("transactions")
      .select("type")
      .eq("type", "expense");
    assert.equal(p.data?.length, 0);
    const over = await db.rpc("execute_operation", {
      action: "pay_invoice",
      payload: {
        invoice_id: inv.data!.id,
        account_id: account.id,
        amount: "100",
        date: day,
      },
      request_id: randomUUID(),
    });
    assert.ok(over.error);
  });
  await check("Cor do cartão persiste com isolamento de usuário", async () => {
    const change = await db.from("credit_cards").update({ color: "#14A078" }).eq("id", card).select("color").single();
    assert.equal(change.error, null); assert.equal(change.data!.color, "#14A078");
    const forbidden = await b.db.from("credit_cards").update({ color: "#FFFFFF" }).eq("id", card).select("id");
    assert.deepEqual(forbidden.data, []);
  });
  await check("Compra corrigida recalcula centavos/faturas e exclusão preserva auditoria", async () => {
    const extra = await db.from("credit_cards").insert({ name: "Correction card", last_four: "9876", credit_limit: "1000", closing_day: 5, due_day: 10, account_id: account.id }).select("id").single();
    assert.equal(extra.error, null);
    const cardId = extra.data!.id;
    const purchase = await rpc("purchase", { card_id: cardId, description: "Wrong purchase", amount: "100.01", date: "2026-10-01", installments: 3 });
    const replacement = { card_id: cardId, description: "Correct purchase", amount: "90.02", date: "2026-10-06", installments: 2 };
    const edited = await db.rpc("revise_card_purchase", { purchase_id: purchase.id, replacement, cancel: false });
    assert.equal(edited.error, null);
    const installments = await db.from("credit_card_installments").select("amount::text,invoice_id").eq("purchase_id", purchase.id);
    assert.deepEqual(installments.data!.map(x => x.amount).sort(), ["45.01", "45.01"]);
    const invoices = await db.from("credit_card_invoices").select("due_date").eq("card_id", cardId).order("due_date");
    assert.deepEqual(invoices.data!.map(x => x.due_date), ["2026-11-10", "2026-12-10"]);
    const other = await b.db.rpc("revise_card_purchase", { purchase_id: purchase.id, replacement, cancel: true });
    assert.ok(other.error);
    const invalid = await db.rpc("revise_card_purchase", { purchase_id: purchase.id, replacement: { ...replacement, amount: "2000" }, cancel: false });
    assert.ok(invalid.error);
    const still = await db.from("credit_card_purchases").select("amount::text").eq("id", purchase.id).single();
    assert.equal(still.data!.amount, "90.02");
    const remaining = await db.from("credit_card_installments").select("amount::text").eq("purchase_id", purchase.id);
    assert.deepEqual(remaining.data!.map(x => x.amount).sort(), ["45.01", "45.01"]);
    const deleted = await db.rpc("revise_card_purchase", { purchase_id: purchase.id, replacement: {}, cancel: true });
    assert.equal(deleted.error, null);
    const cancelled = await db.from("credit_card_purchases").select("status").eq("id", purchase.id).single();
    assert.equal(cancelled.data!.status, "cancelled");
    const noParts = await db.from("credit_card_installments").select("id").eq("purchase_id", purchase.id);
    assert.deepEqual(noParts.data, []);
    const noInvoices = await db.from("credit_card_invoices").select("id").eq("card_id", cardId);
    assert.deepEqual(noInvoices.data, []);
    const history = await db.from("credit_card_purchase_revisions").select("previous_installments").eq("purchase_id", purchase.id);
    assert.equal(history.data!.length, 2);
    assert.deepEqual(history.data!.map(x => x.previous_installments.length).sort(), [2, 3]);
  });
  await check("Correção não altera pagamento já conciliado", async () => {
    const purchase = await db.from("credit_card_purchases").select("id").eq("description", "Laptop").single();
    const replacement = { card_id: card, description: "Laptop revised", amount: "100", date: "2026-10-05", installments: 3 };
    const changed = await db.rpc("revise_card_purchase", { purchase_id: purchase.data!.id, replacement, cancel: false });
    assert.equal(changed.error, null);
    const bad = await db.rpc("revise_card_purchase", { purchase_id: purchase.data!.id, replacement: { ...replacement, amount: "101" }, cancel: false });
    assert.ok(bad.error);
    const badDelete = await db.rpc("revise_card_purchase", { purchase_id: purchase.data!.id, replacement: {}, cancel: true });
    assert.ok(badDelete.error);
    const payments = await db.from("credit_card_payments").select("amount::text");
    assert.deepEqual(payments.data!.map(x => x.amount), ["10.00"]);
  });
  let goal: string;
  await check("Caixinha: lote e transferência atômicos", async () => {
    const r = await rpc("create_goal", {
      name: "Reserve",
      target: "2000",
      percentage: "110",
      product: "cdb",
    });
    goal = r.id;
    await rpc("savings_deposit", {
      goal_id: goal,
      account_id: account.id,
      amount: "500",
      date: day,
    });
    const lots = await db
      .from("savings_lots")
      .select("remaining::text,percentage::text");
    assert.equal(lots.data?.[0].remaining, "500.00");
    assert.equal(lots.data?.[0].percentage, "110.0000");
  });
  await check("Resgate parcial atualiza lote e caixa", async () => {
    await rpc("savings_withdraw", {
      goal_id: goal,
      account_id: account.id,
      amount: "200",
      date: "2026-10-02",
    });
    const r = await db.from("savings_lots").select("remaining::text");
    assert.equal(r.data?.[0].remaining, "300.00");
  });
  let asset: string;
  await check(
    "Compra/venda respeitam posição e persistem operações",
    async () => {
      const r = await db
        .from("investment_assets")
        .insert({ ticker: "TEST4", name: "Test asset", asset_class: "stock" })
        .select("id")
        .single();
      assert.equal(r.error, null);
      asset = r.data!.id;
      await rpc("investment", {
        asset_id: asset,
        account_id: account.id,
        type: "buy",
        quantity: "10",
        price: "30",
        fees: "1",
        date: day,
      });
      await rpc("investment", {
        asset_id: asset,
        account_id: account.id,
        type: "sell",
        quantity: "2",
        price: "35",
        fees: "1",
        date: "2026-10-02",
      });
      const over = await db.rpc("execute_operation", {
        action: "investment",
        payload: {
          asset_id: asset,
          account_id: account.id,
          type: "sell",
          quantity: "9",
          price: "30",
          date: day,
        },
        request_id: randomUUID(),
      });
      assert.ok(over.error);
    },
  );
  await check("Provento só vira rendimento quando confirmado", async () => {
    const r = await db
      .from("investment_income")
      .insert({
        asset_id: asset,
        description: "Dividend",
        amount: "15",
        date: day,
      })
      .select("id")
      .single();
    assert.equal(r.error, null);
    await rpc("confirm_income", {
      income_id: r.data!.id,
      account_id: account.id,
      date: day,
    });
    const duplicate = await db.rpc("execute_operation", {
      action: "confirm_income",
      payload: { income_id: r.data!.id, account_id: account.id, date: day },
      request_id: randomUUID(),
    });
    assert.ok(duplicate.error);
  });
  await check(
    "Histórico de CDI e correções só podem ser escritos pelo serviço",
    async () => {
      const r = await db
        .from("benchmark_rates")
        .insert({ series: "12", date: day, value: "0.05", source: "test" });
      assert.ok(r.error);
    },
  );
  await check("API anônima não expõe dados financeiros", async () => {
    const unauth = createClient(url, anon, { auth: { persistSession: false } });
    const r = await unauth.from("transactions").select("id");
    assert.equal(r.data?.length ?? 0, 0);
  });
  await check(
    "Posição inicial e desdobramento permitem vender quantidade ajustada",
    async () => {
      const r = await db
        .from("investment_assets")
        .insert({
          ticker: "OPEN4",
          name: "Opening asset",
          asset_class: "stock",
        })
        .select("id")
        .single();
      assert.equal(r.error, null);
      const id = r.data!.id;
      const opening = await db
        .from("investment_opening_positions")
        .insert({ asset_id: id, quantity: "10", cost: "100", date: day });
      assert.equal(opening.error, null);
      const event = await db.from("investment_corporate_actions").insert({
        asset_id: id,
        type: "split",
        ratio: "2",
        date: "2026-10-02",
      });
      assert.equal(event.error, null);
      await rpc("investment", {
        asset_id: id,
        account_id: account.id,
        type: "sell",
        quantity: "15",
        price: "10",
        fees: "0",
        date: "2026-10-03",
      });
    },
  );
  await check("Hierarquia circular de categorias é rejeitada", async () => {
    const parent = await db
      .from("categories")
      .insert({ name: "Parent" })
      .select("id")
      .single();
    const child = await db
      .from("categories")
      .insert({ name: "Child", parent_id: parent.data!.id })
      .select("id")
      .single();
    const invalid = await db
      .from("categories")
      .update({ parent_id: child.data!.id })
      .eq("id", parent.data!.id);
    assert.ok(invalid.error);
  });
  await check(
    "Edição e cancelamento preservam histórico auditável",
    async () => {
      const original = await db
        .from("transactions")
        .select("id")
        .eq("description", "Income")
        .single();
      const r = await db.rpc("revise_transaction", {
        transaction_id: original.data!.id,
        replacement: {
          account_id: account.id,
          description: "Income revised",
          type: "income",
          amount: "200",
          date: day,
        },
        cancel: false,
      });
      assert.equal(r.error, null);
      const cancel = await db.rpc("revise_transaction", {
        transaction_id: original.data!.id,
        replacement: {},
        cancel: true,
      });
      assert.equal(cancel.error, null);
      const audit = await db
        .from("transaction_revisions")
        .select("id")
        .eq("transaction_id", original.data!.id);
      assert.equal(audit.data?.length, 2);
    },
  );
  await check("Recorrências geram pendências uma única vez", async () => {
    const r = await db.from("recurring_transactions").insert({
      account_id: account.id,
      description: "Recurring",
      type: "expense",
      amount: "30",
      next_date: day,
      frequency: "weekly",
    });
    assert.equal(r.error, null);
    const first = await db.rpc("generate_recurring", { until_date: day });
    assert.equal(first.data, 1);
    const repeat = await db.rpc("generate_recurring", { until_date: day });
    assert.equal(repeat.data, 0);
    const pending = await db
      .from("transactions")
      .select("status")
      .eq("description", "Recurring");
    assert.equal(pending.data?.[0].status, "pending");
  });
  await check("Preço manual é privado por usuário", async () => {
    const r = await db
      .from("manual_asset_prices")
      .insert({
        asset_id: asset,
        ticker: "TEST4",
        price: "35",
        date: day,
        currency: "BRL",
      })
      .select("id")
      .single();
    assert.equal(r.error, null);
    const other = await b.db
      .from("manual_asset_prices")
      .select("id")
      .eq("id", r.data!.id);
    assert.deepEqual(other.data, []);
  });
  console.log(`Integration checks: ${passed} passed`);
} finally {
  for (const id of users) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error("Local test user cleanup failed:", error.message);
  }
}
