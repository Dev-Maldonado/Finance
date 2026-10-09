import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { D } from "../src/financial/engine";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
assert.ok(url && ["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Scheduling checks require a local development database");
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const users: string[] = [];
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const futureMonth = new Date(Date.parse(today) + 65 * 86400000).toISOString().slice(0, 10);
let passed = 0;
async function user() {
  const email = `scheduling-${randomUUID()}@example.test`, password = randomUUID() + "Aa1!";
  const result = await admin.auth.admin.createUser({ email, password, email_confirm: true });assert.equal(result.error, null);users.push(result.data.user!.id);
  const db = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  assert.equal((await db.auth.signInWithPassword({ email, password })).error, null);return { db, id: result.data.user!.id };
}
async function operation(db: SupabaseClient, action: string, payload: Record<string, unknown>, request_id = randomUUID()) {
  const r = await db.rpc("execute_operation", { action, payload, request_id });assert.equal(r.error, null, r.error?.message);return r.data as { id: string };
}
async function check(name: string, fn: () => Promise<void>) { await fn();passed++;console.log("PASS", name); }
try {
  const a = await user(), b = await user(), db = a.db;
  const account = await db.from("financial_accounts").insert({ name: "Scheduling test", initial_balance: "5000" }).select("id").single();assert.equal(account.error, null);const accountId = account.data!.id;
  let rootId = "", childId = "", secondRoot = "";
  await check("Categories enforce two levels, sibling uniqueness, ownership and explicit transfer", async () => {
    const root = await db.from("categories").insert({ name: "Transportes" }).select("id").single();assert.equal(root.error, null);rootId = root.data!.id;
    const child = await db.from("categories").insert({ name: "Uber", parent_id: rootId }).select("id").single();assert.equal(child.error, null);childId = child.data!.id;
    const other = await db.from("categories").insert({ name: "Trabalho" }).select("id").single();assert.equal(other.error, null);secondRoot = other.data!.id;
    assert.ok((await db.from("categories").insert({ name: " transportes " })).error);
    assert.ok((await db.from("categories").insert({ name: "UBER", parent_id: rootId })).error);
    assert.equal((await db.from("categories").insert({ name: "Uber", parent_id: secondRoot })).error, null);
    assert.ok((await db.from("categories").insert({ name: "Terceiro nível", parent_id: childId })).error);
    assert.ok((await db.from("categories").update({ parent_id: childId }).eq("id", rootId)).error);
    assert.ok((await b.db.from("categories").insert({ name: "Outro usuário", parent_id: rootId })).error);
    await operation(db, "transaction", { account_id: accountId, category_id: childId, description: "Historical classification", type: "expense", amount: "10", date: today });
    const existingOtherChild = await db.from("categories").select("id").eq("parent_id", secondRoot).single();assert.equal(existingOtherChild.error, null);
    assert.equal((await db.rpc("archive_category", { category_id: existingOtherChild.data!.id })).error, null);
    assert.equal((await db.from("categories").update({ parent_id: secondRoot }).eq("id", childId)).error, null);
    const tx = await db.from("transactions").select("category_id").eq("description", "Historical classification").single();assert.equal(tx.data!.category_id, childId);
    assert.ok((await db.from("categories").update({ merged_into_id: secondRoot }).eq("id", childId)).error);
  });
  await check("Archiving preserves historical IDs and legacy aliases remain readable", async () => {
    const alias = await admin.from("categories").insert({ user_id: a.id, name: "UBER", parent_id: secondRoot, merged_into_id: childId }).select("id").single();assert.equal(alias.error, null);
    const historical = await admin.from("transactions").insert({ user_id: a.id, account_id: accountId, category_id: alias.data!.id, description: "Legacy alias classification", type: "expense", amount: "-3", date: today }).select("id").single();assert.equal(historical.error, null);
    assert.equal((await db.rpc("archive_category", { category_id: secondRoot })).error, null);
    const group = await db.from("categories").select("id,archived,merged_into_id").or(`id.eq.${secondRoot},parent_id.eq.${secondRoot}`);assert.equal(group.error, null);assert.ok(group.data!.every(c => c.archived));
    const tx = await db.from("transactions").select("category_id").eq("id", historical.data!.id).single();assert.equal(tx.data!.category_id, alias.data!.id);
    assert.ok((await db.from("categories").delete().eq("id", childId)).error);
    const snapshot = await db.rpc("read_financial_snapshot");assert.equal(snapshot.error, null);assert.ok(snapshot.data.categories.some((c: { id: string; merged_into_id?: string }) => c.id === alias.data!.id && c.merged_into_id === childId));
  });
  await check("Annual recurrence retains February 29 anchor through non-leap years", async () => {
    const recurrence = await db.from("recurring_transactions").insert({ account_id: accountId, description: "Annual leap", amount: "59.90", type: "expense", frequency: "annual", next_date: "2024-02-29", end_date: "2026-12-31" }).select("id").single();assert.equal(recurrence.error, null);
    const generated = await db.rpc("generate_recurring", { until_date: "2026-03-01" });assert.equal(generated.error, null);assert.equal(generated.data, 3);
    const ledger = await db.from("transactions").select("date,amount::text,status").eq("description", "Annual leap").order("date");assert.equal(ledger.error, null);
    assert.deepEqual(ledger.data!.map(t => t.date), ["2024-02-29", "2025-02-28", "2026-02-28"]);assert.ok(ledger.data!.every(t => t.status === "pending" && t.amount === "-59.90"));
    const anchors = await db.from("recurring_transactions").select("next_date,anchor_day,anchor_month,start_date").eq("id", recurrence.data!.id).single();assert.equal(anchors.error, null);assert.equal(anchors.data!.next_date, "2027-02-28");assert.equal(anchors.data!.anchor_day, 29);assert.equal(anchors.data!.anchor_month, 2);assert.equal(anchors.data!.start_date, "2024-02-29");
    assert.equal((await db.rpc("generate_recurring", { until_date: "2026-03-01" })).data, 0);
    assert.ok((await db.rpc("generate_recurring", { until_date: "2099-01-01" })).error);
  });
  await check("Recurring pause, resume, date edit and cancellation preserve confirmed history", async () => {
    const rec = await db.from("recurring_transactions").insert({ account_id: accountId, description: "Monthly subscription", amount: "59.90", type: "expense", frequency: "monthly", next_date: "2026-01-31", end_date: "2027-01-31" }).select("id").single();assert.equal(rec.error, null);const recurrenceId = rec.data!.id;
    assert.equal((await db.rpc("generate_recurring", { until_date: "2026-03-31" })).data, 3);
    const tx = await db.from("transactions").select("id").eq("description", "Monthly subscription").order("date").limit(1).single();assert.equal(tx.error, null);
    assert.equal((await db.rpc("revise_transaction", { transaction_id: tx.data!.id, replacement: { account_id: accountId, description: "Monthly subscription", type: "expense", amount: "59.90", date: "2026-01-31", status: "confirmed" }, cancel: false })).error, null);
    assert.equal((await db.rpc("revise_recurring", { recurrence_id: recurrenceId, replacement: { active: false }, cancel: false })).error, null);
    assert.equal((await db.rpc("generate_recurring", { until_date: "2026-05-31" })).data, 0);
    assert.equal((await db.rpc("revise_recurring", { recurrence_id: recurrenceId, replacement: { active: true, next_date: "2026-04-20", amount: "60", end_date: "2026-05-31" }, cancel: false })).error, null);
    assert.equal((await db.rpc("generate_recurring", { until_date: "2026-05-31" })).data, 2);
    const dates = await db.from("transactions").select("date,amount::text,status").eq("description", "Monthly subscription").order("date");assert.deepEqual(dates.data!.map(t => t.date), ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-20", "2026-05-20"]);assert.equal(dates.data![0].amount, "-59.90");assert.equal(dates.data![0].status, "confirmed");assert.equal(dates.data![4].amount, "-60.00");
    assert.equal((await db.rpc("revise_recurring", { recurrence_id: recurrenceId, replacement: {}, cancel: true })).error, null);
    assert.ok((await db.rpc("revise_recurring", { recurrence_id: recurrenceId, replacement: { active: true }, cancel: false })).error);
    const kept = await db.from("transactions").select("status").eq("id", tx.data!.id).single();assert.equal(kept.data!.status, "confirmed");
    assert.ok((await b.db.rpc("revise_recurring", { recurrence_id: recurrenceId, replacement: {}, cancel: true })).error);
    assert.ok((await db.from("recurring_transactions").delete().eq("id", recurrenceId)).error);
  });
  await check("Global automatic recurring generation is service-only and idempotent", async () => {
    const rec = await db.from("recurring_transactions").insert({ account_id: accountId, description: "Automatic weekly", amount: "5", type: "expense", frequency: "weekly", next_date: today }).select("id").single();assert.equal(rec.error, null);
    assert.ok((await db.rpc("generate_all_recurring", { until_date: today })).error);
    const generated = await admin.rpc("generate_all_recurring", { until_date: today });assert.equal(generated.error, null, generated.error?.message);assert.ok(generated.data.generated >= 1);
    const again = await admin.rpc("generate_all_recurring", { until_date: today });assert.equal(again.error, null);assert.equal(again.data.generated, 0);
    const ledger = await db.from("transactions").select("status,date").eq("description", "Automatic weekly");assert.equal(ledger.data!.length, 1);assert.equal(ledger.data![0].status, "pending");assert.equal(ledger.data![0].date, today);
  });
  await check("Resuming skips paused dates and switching to annual resets the month anchor", async () => {
    const rec = await db.from("recurring_transactions").insert({ account_id: accountId, description: "Paused annual resume", amount: "5", type: "expense", frequency: "monthly", next_date: "2026-01-31", active: false }).select("id").single();assert.equal(rec.error, null);
    assert.equal((await db.rpc("revise_recurring", { recurrence_id: rec.data!.id, replacement: { active: true, start_date: null }, cancel: false })).error, null);
    const resumed = await db.from("recurring_transactions").select("next_date,anchor_day,start_date").eq("id", rec.data!.id).single();assert.equal(resumed.error, null);assert.ok(resumed.data!.next_date >= today);assert.equal(resumed.data!.anchor_day, 31);assert.equal(resumed.data!.start_date, "2026-01-31");
    assert.equal((await db.rpc("generate_recurring", { until_date: today })).data, 0);
    const missing = await db.from("transactions").select("id").eq("description", "Paused annual resume");assert.equal(missing.data!.length, 0);
    const nextMonth = Number(resumed.data!.next_date.slice(5, 7));
    assert.equal((await db.rpc("revise_recurring", { recurrence_id: rec.data!.id, replacement: { frequency: "annual" }, cancel: false })).error, null);
    const annual = await db.from("recurring_transactions").select("anchor_month").eq("id", rec.data!.id).single();assert.equal(annual.data!.anchor_month, nextMonth);
  });
  await check("Per-installment input validates exact total and future edits preserve every other installment", async () => {
    const card = await db.from("credit_cards").insert({ name: "Scheduling card", account_id: accountId, closing_day: 15, due_day: 25, credit_limit: "2000", last_four: "9999" }).select("id").single();assert.equal(card.error, null);
    const invalid = await db.rpc("execute_operation", { action: "purchase", payload: { card_id: card.data!.id, description: "Invalid total", amount: "1499.99", installment_amount: "150", entry_method: "installment", installments: 10, date: today }, request_id: randomUUID() });assert.ok(invalid.error);
    const purchase = await operation(db, "purchase", { card_id: card.data!.id, description: "Exact installments", amount: "1500", installment_amount: "150", entry_method: "installment", installments: 10, date: today });
    const installments = await db.from("credit_card_installments").select("id,number,amount::text,invoice_id").eq("purchase_id", purchase.id).order("number");assert.equal(installments.error, null);assert.equal(installments.data!.length, 10);assert.ok(installments.data!.every(i => i.amount === "150.00"));
    const i = installments.data![9], id = randomUUID(), replacement = { amount: "150.01", notes: "Cent adjustment" };
    assert.equal((await db.rpc("revise_card_installment", { installment_id: i.id, replacement, request_id: id })).error, null);
    assert.equal((await db.rpc("revise_card_installment", { installment_id: i.id, replacement, request_id: id })).data, i.id);
    assert.ok((await db.rpc("revise_card_installment", { installment_id: i.id, replacement: { amount: "151" }, request_id: id })).error);
    const after = await db.from("credit_card_installments").select("id,number,amount::text").eq("purchase_id", purchase.id).order("number");assert.ok(after.data!.slice(0, 9).every((item, index) => item.id === installments.data![index].id && item.amount === "150.00"));assert.equal(after.data![9].amount, "150.01");
    const total = await db.from("credit_card_purchases").select("amount::text").eq("id", purchase.id).single();assert.equal(total.data!.amount, "1500.01");
    assert.ok((await db.rpc("revise_card_installment", { installment_id: i.id, replacement: { amount: "700" }, request_id: randomUUID() })).error);
    assert.ok((await b.db.rpc("revise_card_installment", { installment_id: i.id, replacement, request_id: randomUUID() })).error);
    await operation(db, "pay_invoice", { invoice_id: i.invoice_id, account_id: accountId, amount: "1", date: today });
    assert.ok((await db.rpc("revise_card_installment", { installment_id: i.id, replacement: { amount: "149" }, request_id: randomUUID() })).error);
    const audit = await db.from("financial_integrity_revisions").select("id").eq("entity", "credit_card_installments").eq("entity_id", i.id);assert.equal(audit.data!.length, 1);
    const fractional = await operation(db, "purchase", { card_id: card.data!.id, description: "Cent remainder", amount: "100", installments: 3, date: futureMonth });
    const cents = await db.from("credit_card_installments").select("amount::text").eq("purchase_id", fractional.id).order("number");assert.deepEqual(cents.data!.map(c => c.amount), ["33.33", "33.33", "33.34"]);
  });
  await check("Received net income preserves announced amount, cash link, reversal and payload idempotency", async () => {
    const asset = await db.from("investment_assets").insert({ ticker: `NET${randomUUID().slice(0, 5).toUpperCase()}`, name: "Net income fixture", asset_class: "stock", currency: "BRL" }).select("id").single();assert.equal(asset.error, null);
    const income = await db.from("investment_income").insert({ asset_id: asset.data!.id, description: "Announced gross", type: "jcp", amount: "100", date: today }).select("id").single();assert.equal(income.error, null);
    const before = await db.from("account_balances").select("balance").eq("id", accountId).single();assert.equal(before.error, null);
    const id = randomUUID(), payload = { income_id: income.data!.id, account_id: accountId, received_amount: "85", date: today };
    const confirm = await operation(db, "confirm_income", payload, id);assert.equal((await operation(db, "confirm_income", payload, id)).id, confirm.id);
    const received = await db.from("investment_income").select("amount::text,announced_amount::text,transaction_id,status").eq("id", income.data!.id).single();assert.equal(received.data!.amount, "85.00");assert.equal(received.data!.announced_amount, "100.00");assert.equal(received.data!.transaction_id, confirm.id);
    const balance = await db.from("account_balances").select("balance").eq("id", accountId).single();assert.equal(D(balance.data!.balance).minus(before.data!.balance).toFixed(2), "85.00");
    assert.ok((await db.rpc("execute_operation", { action: "confirm_income", payload: { ...payload, received_amount: "86" }, request_id: id })).error);
    assert.equal((await db.rpc("revise_income", { income_id: income.data!.id, replacement: {}, cancel: true })).error, null);
    const reversed = await db.from("account_balances").select("balance").eq("id", accountId).single();assert.equal(String(reversed.data!.balance), String(before.data!.balance));
    const preserved = await db.from("investment_income").select("status,announced_amount::text").eq("id", income.data!.id).single();assert.equal(preserved.data!.status, "cancelled");assert.equal(preserved.data!.announced_amount, "100.00");
  });
  console.log(`Scheduling checks: ${passed} passed`);
} finally {
  for (const id of users) {
    const result = await admin.auth.admin.deleteUser(id);if (result.error) console.error("Local scheduling cleanup failed:", result.error.message);
  }
}
