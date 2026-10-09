import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { D } from "../src/financial/engine";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
assert.ok(url && ["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Integrity tests require a local development database");
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const users: string[] = [];
const marketFixtures: { table: string; id: string; key: string }[] = [];
let passed = 0;
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
async function makeUser() {
  const email = `integrity-${randomUUID()}@example.test`, password = randomUUID() + "Aa1!";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(error, null);users.push(data.user!.id);
  const db = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  assert.equal((await db.auth.signInWithPassword({ email, password })).error, null);
  return { db, user: data.user! };
}
async function rpc(db: SupabaseClient, action: string, payload: Record<string, unknown>, request_id = randomUUID()) {
  const r = await db.rpc("execute_operation", { action, payload, request_id });
  if (r.error) throw new Error(`${action}: ${r.error.message}`);
  return r.data as { id: string; ok: boolean };
}
async function balance(db: SupabaseClient, id: string) {
  const r = await db.from("account_balances").select("balance").eq("id", id).single();assert.equal(r.error, null);
  return String(r.data!.balance);
}
async function check(label: string, fn: () => Promise<void>) { await fn();console.log("PASS", label);passed++; }
try {
  const a = await makeUser(), b = await makeUser();const db = a.db;
  const account = await db.from("financial_accounts").insert({ name: "Integrity checking", initial_balance: "10000.00" }).select("id").single();assert.equal(account.error, null);
  const accountId = account.data!.id;
  const asset = await db.from("investment_assets").insert({ ticker: `INT${randomUUID().slice(0, 6).toUpperCase()}`, name: "Integrity asset", asset_class: "stock", currency: "BRL" }).select("id,ticker").single();assert.equal(asset.error, null);
  const assetId = asset.data!.id;

  await check("Derived DML/core RPC rejected; guarded operations isolate tenants", async () => {
    const forbidden = await db.from("transactions").insert({ account_id: accountId, description: "Bypass", type: "income", amount: "1", date: today });assert.ok(forbidden.error);
    const core = await db.rpc("execute_operation_core", { action: "transaction", payload: { account_id: accountId, description: "Bypass", type: "income", amount: "1", date: today }, request_id: randomUUID() });assert.ok(core.error);
    const cross = await b.db.rpc("execute_operation", { action: "transaction", payload: { account_id: accountId, description: "Other tenant", type: "income", amount: "1", date: today }, request_id: randomUUID() });assert.ok(cross.error);
    const hidden = await b.db.rpc("read_financial_snapshot");assert.equal(hidden.error, null);assert.equal(hidden.data.financial_accounts.length, 0);
  });
  await check("Financial idempotency rejects reuse with a changed payload", async () => {
    const id = randomUUID(), p = { account_id: accountId, description: "Idempotent", type: "income", amount: "1", date: today };
    const first = await rpc(db, "transaction", p, id), second = await rpc(db, "transaction", p, id);assert.equal(first.id, second.id);
    const changed = await db.rpc("execute_operation", { action: "transaction", payload: { ...p, amount: "2" }, request_id: id });assert.ok(changed.error);
    const rows = await db.from("transactions").select("id").eq("description", "Idempotent");assert.equal(rows.data!.length, 1);
  });
  await check("Non-finite financial values are rejected at RPC and table boundaries", async () => {
    const before = await balance(db, accountId);
    const fee = await db.rpc("execute_operation", { action: "investment", payload: { asset_id: assetId, account_id: accountId, type: "buy", quantity: "1", price: "10", fees: "NaN", date: today }, request_id: randomUUID() });assert.ok(fee.error);
    assert.equal(await balance(db, accountId), before);
    const initial = await db.from("financial_accounts").insert({ name: "Non-finite opening", kind: "bank", initial_balance: "NaN" });assert.ok(initial.error);
    const manual = await db.from("manual_asset_prices").insert({ asset_id: assetId, ticker: asset.data!.ticker, price: "NaN", date: today });assert.ok(manual.error);
    const announced = await db.from("investment_income").insert({ asset_id: assetId, description: "Non-finite announcement", amount: "NaN", date: today });assert.ok(announced.error);
  });
  await check("Income correction/rollback preserves cash link and prevents reconfirmation", async () => {
    const before = await balance(db, accountId);
    const income = await db.from("investment_income").insert({ asset_id: assetId, description: "Dividend", amount: "50", date: today }).select("id").single();assert.equal(income.error, null);
    const incomeId = income.data!.id;const confirmation = await rpc(db, "confirm_income", { income_id: incomeId, account_id: accountId, date: today });
    const linked = await db.from("investment_income").select("status,transaction_id").eq("id", incomeId).single();assert.equal(linked.data!.transaction_id, confirmation.id);
    const cash = await db.from("transactions").select("linked_income_id,group_id").eq("id", confirmation.id).single();assert.equal(cash.data!.linked_income_id, incomeId);assert.equal(cash.data!.group_id, incomeId);
    const reset = await db.from("investment_income").update({ status: "announced" }).eq("id", incomeId);assert.ok(reset.error);
    const edit = await db.rpc("revise_income", { income_id: incomeId, replacement: { asset_id: assetId, description: "Correct dividend", amount: "60", date: today, type: "dividend" }, cancel: false });assert.equal(edit.error, null);
    assert.equal(await balance(db, accountId), D(before).plus(60).toFixed(2));
    const double = await db.rpc("execute_operation", { action: "confirm_income", payload: { income_id: incomeId, account_id: accountId, date: today }, request_id: randomUUID() });assert.ok(double.error);
    const rollback = await db.rpc("revise_transaction", { transaction_id: confirmation.id, replacement: {}, cancel: true });assert.equal(rollback.error, null);
    assert.equal(await balance(db, accountId), before);
    const cancelled = await db.from("investment_income").select("status").eq("id", incomeId).single();assert.equal(cancelled.data!.status, "cancelled");
    const foreign = await b.db.rpc("revise_income", { income_id: incomeId, replacement: {}, cancel: true });assert.ok(foreign.error);
  });
  await check("Investment corrections recalculate cash; dependencies block unsafe changes", async () => {
    const before = await balance(db, accountId);
    const buy = await rpc(db, "investment", { asset_id: assetId, account_id: accountId, type: "buy", quantity: "10", price: "10", fees: "1", date: "2026-09-01" });
    const edit = await db.rpc("revise_investment", { operation_id: buy.id, replacement: { asset_id: assetId, account_id: accountId, type: "buy", quantity: "20", price: "5", fees: "2", date: "2026-09-01" }, cancel: false });assert.equal(edit.error, null);assert.equal(await balance(db, accountId), D(before).minus(102).toFixed(2));
    const sell = await rpc(db, "investment", { asset_id: assetId, account_id: accountId, type: "sell", quantity: "5", price: "6", fees: "1", date: "2026-09-01" });
    const dependency = await db.rpc("revise_investment", { operation_id: buy.id, replacement: {}, cancel: true });assert.ok(dependency.error);
    assert.equal((await db.rpc("revise_investment", { operation_id: sell.id, replacement: {}, cancel: true })).error, null);
    assert.equal((await db.rpc("revise_investment", { operation_id: buy.id, replacement: {}, cancel: true })).error, null);assert.equal(await balance(db, accountId), before);
  });
  await check("Day 31 invoices clamp each month; future payment does not free debt", async () => {
    const card = await db.from("credit_cards").insert({ name: "Month ends", account_id: accountId, closing_day: 15, due_day: 31, credit_limit: "1000", last_four: "1234" }).select("id").single();assert.equal(card.error, null);
    await rpc(db, "purchase", { card_id: card.data!.id, description: "Month-end purchase", amount: "90", date: "2026-01-01", installments: 3 });
    const invoices = await db.from("credit_card_invoices").select("id,due_date").eq("card_id", card.data!.id).order("due_date");assert.deepEqual(invoices.data!.map(i => i.due_date), ["2026-01-31", "2026-02-28", "2026-03-31"]);
    const tomorrow = new Date(Date.parse(today) + 86400000).toISOString().slice(0, 10), before = await balance(db, accountId);
    const future = await db.rpc("execute_operation", { action: "pay_invoice", payload: { invoice_id: invoices.data![0].id, account_id: accountId, amount: "30", date: tomorrow }, request_id: randomUUID() });assert.ok(future.error);assert.equal(await balance(db, accountId), before);
    const bypass = await db.from("credit_card_installments").delete().eq("invoice_id", invoices.data![0].id);assert.ok(bypass.error);
  });
  let goalId = "", goalAccount = "";
  await check("Savings official reconciliation is explicit; estimates cannot be withdrawn", async () => {
    const goal = await rpc(db, "create_goal", { name: "Integrity savings", target: "1000", indexer: "cdi", percentage: "100", product: "rdb", is_emergency_reserve: true });goalId = goal.id;
    const record = await db.from("savings_goals").select("account_id,is_emergency_reserve").eq("id", goalId).single();goalAccount = record.data!.account_id;assert.equal(record.data!.is_emergency_reserve, true);
    await rpc(db, "savings_deposit", { goal_id: goalId, account_id: accountId, amount: "100", date: today });
    const savingsBefore = await balance(db, goalAccount), checkingBefore = await balance(db, accountId);
    for (const operation of [
      { action: "transaction", payload: { account_id: goalAccount, description: "Unlinked savings yield", type: "yield", amount: "50", date: today } },
      { action: "transfer", payload: { from_account: goalAccount, to_account: accountId, amount: "100", date: today } },
      { action: "investment", payload: { asset_id: assetId, account_id: goalAccount, type: "buy", quantity: "1", price: "10", fees: "0", date: today } },
    ]) {
      const attempt = await db.rpc("execute_operation", { ...operation, request_id: randomUUID() });assert.ok(attempt.error, `Generic ${operation.action} must not bypass savings accounting`);
    }
    assert.equal(await balance(db, goalAccount), savingsBefore);assert.equal(await balance(db, accountId), checkingBefore);
    const untouched = await db.from("savings_lots").select("remaining::text").eq("goal_id", goalId);assert.equal(untouched.data![0].remaining, "100.00");
    const noEstimate = await db.rpc("execute_operation", { action: "savings_withdraw", payload: { goal_id: goalId, account_id: accountId, amount: "0", yield_amount: "10", date: today }, request_id: randomUUID() });assert.ok(noEstimate.error);
    await rpc(db, "reconcile_savings", { goal_id: goalId, date: today, confirmed_balance: "110", notes: "Local test official statement", apply_adjustment: false });assert.equal(await balance(db, goalAccount), "100.00");
    await rpc(db, "reconcile_savings", { goal_id: goalId, date: today, confirmed_balance: "110", notes: "Explicit official adjustment", apply_adjustment: true });assert.equal(await balance(db, goalAccount), "110.00");
    const belowPrincipal = await db.rpc("execute_operation", { action: "reconcile_savings", payload: { goal_id: goalId, date: today, confirmed_balance: "90", apply_adjustment: true }, request_id: randomUUID() });assert.ok(belowPrincipal.error);
  });
  await check("Savings withdrawal transfers principal/net confirmed yield and rolls back taxes atomically", async () => {
    const before = await balance(db, accountId);
    const withdrawal = await rpc(db, "savings_withdraw", { goal_id: goalId, account_id: accountId, amount: "20", yield_amount: "5", ir_amount: "1", iof_amount: "0", date: today });
    assert.equal(await balance(db, accountId), D(before).plus(24).toFixed(2));assert.equal(await balance(db, goalAccount), "85.00");
    const lots = await db.from("savings_lots").select("remaining::text").eq("goal_id", goalId);assert.equal(lots.data![0].remaining, "80.00");
    const rollback = await db.rpc("cancel_savings_operation", { operation_group: withdrawal.id });assert.equal(rollback.error, null);
    assert.equal(await balance(db, accountId), before);assert.equal(await balance(db, goalAccount), "110.00");
    const principal = await db.from("savings_lots").select("remaining::text").eq("goal_id", goalId);assert.equal(principal.data![0].remaining, "100.00");
  });
  await check("Bank/invoice reconciliation stores difference before optional adjustment", async () => {
    const before = await balance(db, accountId), official = D(before).plus(1).toFixed(2);
    await rpc(db, "reconcile_account", { account_id: accountId, date: today, confirmed_balance: official, apply_adjustment: false });assert.equal(await balance(db, accountId), before);
    const id = randomUUID(), p = { account_id: accountId, date: today, confirmed_balance: official, apply_adjustment: true };
    await rpc(db, "reconcile_account", p, id);await rpc(db, "reconcile_account", p, id);assert.equal(await balance(db, accountId), official);
    const invoice = await db.from("credit_card_invoices").select("id").limit(1).single();
    await rpc(db, "reconcile_invoice", { invoice_id: invoice.data!.id, date: today, confirmed_balance: "31", notes: "Divergence recorded" });
    const record = await db.from("invoice_reconciliations").select("registered_balance::text,difference::text").eq("invoice_id", invoice.data!.id).single();assert.equal(record.data!.registered_balance, "30.00");assert.equal(record.data!.difference, "1.00");
  });
  await check("Obligation payment amortizes only explicit principal and reverses both ledgers", async () => {
    const debt = await db.from("financial_liabilities").insert({ name: "Loan", amount: "1000" }).select("id").single();assert.equal(debt.error, null);
    const obligation = await db.from("financial_obligations").insert({ name: "Loan installment", amount: "100", due_date: today, liability_id: debt.data!.id }).select("id").single();assert.equal(obligation.error, null);
    const before = await balance(db, accountId);
    await rpc(db, "pay_obligation", { obligation_id: obligation.data!.id, account_id: accountId, date: today, principal_reduction: "60" });assert.equal(await balance(db, accountId), D(before).minus(100).toFixed(2));
    const liability = await db.from("financial_liabilities").select("amount::text").eq("id", debt.data!.id).single();assert.equal(liability.data!.amount, "940.00");
    const reset = await db.from("financial_obligations").update({ status: "pending" }).eq("id", obligation.data!.id).select("id");assert.equal(reset.data?.length ?? 0, 0);
    assert.equal((await db.rpc("cancel_obligation_payment", { obligation_id: obligation.data!.id })).error, null);assert.equal(await balance(db, accountId), before);
    const restored = await db.from("financial_liabilities").select("amount::text").eq("id", debt.data!.id).single();assert.equal(restored.data!.amount, "1000.00");
  });
  await check("Recurring schedule retains month-end anchor and updates an edited day", async () => {
    const r = await db.from("recurring_transactions").insert({ account_id: accountId, description: "Month-end recurring", type: "expense", amount: "10", next_date: "2026-01-31", frequency: "monthly" }).select("id").single();assert.equal(r.error, null);
    assert.equal((await db.rpc("generate_recurring", { until_date: "2026-03-31" })).error, null);
    const dates = await db.from("transactions").select("date").eq("description", "Month-end recurring").order("date");assert.deepEqual(dates.data!.map(t => t.date), ["2026-01-31", "2026-02-28", "2026-03-31"]);
    assert.equal((await db.from("recurring_transactions").update({ next_date: "2026-04-20" }).eq("id", r.data!.id)).error, null);
    assert.equal((await db.rpc("generate_recurring", { until_date: "2026-05-31" })).error, null);
    const changed = await db.from("recurring_transactions").select("next_date,anchor_day").eq("id", r.data!.id).single();assert.equal(changed.data!.next_date, "2026-06-20");assert.equal(changed.data!.anchor_day, 20);
    assert.equal((await db.from("recurring_transactions").update({ active: false, end_date: today }).eq("id", r.data!.id)).error, null);
    assert.equal((await db.rpc("revise_recurring", { recurrence_id: r.data!.id, replacement: {}, cancel: true })).error, null);
    const ended = await db.from("recurring_transactions").update({ active: true }).eq("id", r.data!.id);assert.ok(ended.error);
  });
  await check("Atomic snapshot preserves exact decimals and filters cancelled financial records", async () => {
    const precise = await db.from("financial_accounts").insert({ name: "Exact numeric serialization", initial_balance: "123456789012345678.91" }).select("id").single();assert.equal(precise.error, null);
    const snapshot = await db.rpc("read_financial_snapshot");assert.equal(snapshot.error, null);
    const account = snapshot.data.financial_accounts.find((r: { id: string }) => r.id === precise.data!.id);assert.equal(account.initial_balance, "123456789012345678.91");assert.equal(typeof account.initial_balance, "string");
    assert.match(snapshot.data.snapshot_metadata[0].benchmark_start, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(snapshot.data.recurring_transactions.length > 0, "The atomic snapshot must include registered schedules");
    assert.ok(snapshot.data.investment_operations.every((r: { status: string }) => r.status === "confirmed"));assert.ok(snapshot.data.savings_movements.every((r: { status: string }) => r.status === "confirmed"));
    const other = await b.db.from("financial_integrity_revisions").select("id");assert.deepEqual(other.data, []);
  });
  await check("Market audits ignore collection-only updates and record actual corrections", async () => {
    const cases = [
      { table: "asset_price_history", value: "price", before: "10", after: "11", row: { ticker: `LOCAL${randomUUID().slice(0, 8)}`, date: "2000-01-01", source: "local-integrity-fixture", currency: "BRL" } },
      { table: "fund_nav_history", value: "nav", before: "1", after: "1.1", row: { fund_id: `LOCAL:${randomUUID()}`, date: "2000-01-01", source: "local-integrity-fixture" } },
      { table: "asset_cash_events", value: "rate", before: "1", after: "1.1", row: { ticker: `LOCAL${randomUUID().slice(0, 8)}`, date_com: "2000-01-01", payment_date: "2000-01-02", label: "Local fixture", source: "local-integrity-fixture", source_id: `local:${randomUUID()}` } },
    ];
    for (const c of cases) {
      const inserted = await admin.from(c.table).insert({ ...c.row, [c.value]: c.before }).select("id").single();assert.equal(inserted.error, null);
      const id = inserted.data!.id;
      const key = c.table === "asset_price_history" ? `${c.row.ticker}/${c.row.date}/${c.row.source}` : c.table === "fund_nav_history" ? `${c.row.fund_id}/${c.row.date}` : c.row.source_id!;
      marketFixtures.push({ table: c.table, id, key });
      assert.equal((await admin.from(c.table).update({ collected_at: "2000-01-03T00:00:00Z" }).eq("id", id)).error, null);
      const same = await db.from("market_data_revisions").select("id").eq("table_name", c.table).eq("record_key", key);assert.equal(same.error, null);assert.equal(same.data!.length, 0);
      assert.equal((await admin.from(c.table).update({ [c.value]: c.after, collected_at: "2000-01-04T00:00:00Z" }).eq("id", id)).error, null);
      const changed = await db.from("market_data_revisions").select("id").eq("table_name", c.table).eq("record_key", key);assert.equal(changed.error, null);assert.equal(changed.data!.length, 1);
    }
  });
  console.log(`Integrity checks: ${passed} passed`);
} finally {
  for (const fixture of marketFixtures) {
    await admin.from("market_data_revisions").delete().eq("table_name", fixture.table).eq("record_key", fixture.key);
    await admin.from(fixture.table).delete().eq("id", fixture.id);
  }
  for (const id of users) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error("Local integrity cleanup failed:", error.message);
  }
}
