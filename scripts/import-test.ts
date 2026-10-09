import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { D } from "../src/financial/engine";
import { importRequestId, prepareImportRows, scopedSource } from "../src/lib/import";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
assert.ok(url && ["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Import tests require an isolated local development database");
assert.ok(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY, "Local Supabase variables are required");
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const users: string[] = [];
const date = "2026-10-01";
let passed = 0;

type ImportItem = { account_id: string; source_id: string; request_id: string; description: string; date: string; amount: string; classification: string; counter_account_id?: string; transaction_id?: string; invoice_id?: string; goal_id?: string };
async function makeUser() {
  const email = `import-${randomUUID()}@example.test`, password = randomUUID() + "Aa1!";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(error, null); assert.ok(data.user); users.push(data.user.id);
  const db = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  assert.equal((await db.auth.signInWithPassword({ email, password })).error, null);
  return { db, id: data.user.id };
}
async function account(db: SupabaseClient, name: string, balance = "1000.00") {
  const result = await db.from("financial_accounts").insert({ name, initial_balance: balance, kind: "bank" }).select("id").single();
  assert.equal(result.error, null); return result.data!.id as string;
}
async function balance(db: SupabaseClient, id: string) {
  const result = await db.from("account_balances").select("balance").eq("id", id).single();
  assert.equal(result.error, null); return D(result.data!.balance).toFixed(2);
}
function item(account_id: string, source: string, amount: string, classification: string, fields: Partial<ImportItem> = {}): ImportItem {
  const source_id = scopedSource(account_id, source);
  return { account_id, source_id, request_id: importRequestId(`local-import|${source_id}`), description: `Import fixture ${source}`, date, amount, classification, ...fields };
}
async function importRows(db: SupabaseClient, items: ImportItem[]) {
  const result = await db.rpc("import_classified_transactions", { items });
  if (result.error) throw new Error(result.error.message);
  return result.data as { imported: number; duplicates: number; matched: number };
}
async function operation(db: SupabaseClient, action: string, payload: Record<string, unknown>) {
  const result = await db.rpc("execute_operation", { action, payload, request_id: randomUUID() });
  if (result.error) throw new Error(result.error.message);
  return result.data as { id: string };
}
async function check(label: string, fn: () => Promise<void>) {
  await fn(); console.log("PASS", label); passed++;
}

try {
  const a = await makeUser(), b = await makeUser();
  const checking = await account(a.db, "Import source"), destination = await account(a.db, "Import destination", "0.00"), foreign = await account(b.db, "Other user");

  await check("Identical legitimate cash rows preserve both cents and remain idempotent on reimport", async () => {
    const csv = "description,date,amount\nCafé,2026-10-01,-15.20\nCafé,2026-10-01,-15.20";
    const imported = prepareImportRows(csv, "csv").map(row => item(checking, row.source_id, row.signed_amount, "expense", { description: row.description }));
    const before = await balance(a.db, checking);
    assert.deepEqual(await importRows(a.db, imported), { imported: 2, duplicates: 0, matched: 0 });
    assert.equal(await balance(a.db, checking), D(before).minus("30.40").toFixed(2));
    assert.deepEqual(await importRows(a.db, imported), { imported: 0, duplicates: 2, matched: 0 });
    const ledger = await a.db.from("transactions").select("id,amount::text").eq("description", "Café");
    assert.equal(ledger.error, null); assert.equal(ledger.data!.length, 2);
    assert.ok(ledger.data!.every(row => row.amount === "-15.20"));
  });

  await check("Transfers import once without generating an expense or changing combined wealth", async () => {
    const before = D(await balance(a.db, checking)).plus(await balance(a.db, destination));
    const transfer = item(checking, "bank-transfer", "-75.01", "transfer", { counter_account_id: destination });
    assert.deepEqual(await importRows(a.db, [transfer]), { imported: 1, duplicates: 0, matched: 0 });
    assert.equal(D(await balance(a.db, checking)).plus(await balance(a.db, destination)).toFixed(2), before.toFixed(2));
    const linked = await a.db.from("import_links").select("transaction_id").eq("source_id", transfer.source_id).single();
    assert.equal(linked.error, null);
    const ledger = await a.db.from("transactions").select("type,group_id").eq("id", linked.data!.transaction_id).single();
    assert.equal(ledger.error, null); assert.equal(ledger.data!.type, "transfer"); assert.ok(ledger.data!.group_id);
    assert.equal((await importRows(a.db, [transfer])).duplicates, 1);
  });

  await check("Matching a bank row preserves its existing financial operation without an extra cash effect", async () => {
    const transfer = await operation(a.db, "transfer", { from_account: checking, to_account: destination, amount: "20.02", date });
    const cash = await a.db.from("transactions").select("id,group_id,source_id").eq("group_id", transfer.id).eq("account_id", checking).single();
    assert.equal(cash.error, null);
    const before = await balance(a.db, checking);
    const match = item(checking, "bank-match", "-20.02", "match", { transaction_id: cash.data!.id });
    assert.deepEqual(await importRows(a.db, [match]), { imported: 0, duplicates: 0, matched: 1 });
    assert.equal(await balance(a.db, checking), before);
    const unchanged = await a.db.from("transactions").select("group_id,source_id").eq("id", cash.data!.id).single();
    assert.deepEqual(unchanged.data, { group_id: transfer.id, source_id: cash.data!.source_id });
    const double = await a.db.rpc("import_classified_transactions", { items: [item(checking, "bank-double-a", "-20.02", "match", { transaction_id: cash.data!.id }), item(checking, "bank-double-b", "-20.02", "match", { transaction_id: cash.data!.id })] });
    assert.ok(double.error);
    const absent = await a.db.from("import_links").select("id").in("source_id", [scopedSource(checking, "bank-double-a"), scopedSource(checking, "bank-double-b")]);
    assert.equal(absent.error, null); assert.deepEqual(absent.data, []);
  });

  await check("A failed import rolls back previous rows, operation receipts and links in the same batch", async () => {
    const before = await balance(a.db, checking);
    const valid = item(checking, "atomic-valid", "10.01", "income"), invalid = item(checking, "atomic-invalid", "-20.00", "transfer", { counter_account_id: foreign });
    const result = await a.db.rpc("import_classified_transactions", { items: [valid, invalid] });
    assert.ok(result.error); assert.equal(await balance(a.db, checking), before);
    for (const table of ["transactions", "import_links"]) {
      const records = await a.db.from(table).select("id").eq("source_id", valid.source_id);
      assert.equal(records.error, null); assert.deepEqual(records.data, []);
    }
    const receipt = await a.db.from("operation_requests").select("request_id").eq("request_id", valid.request_id);
    assert.equal(receipt.error, null); assert.deepEqual(receipt.data, []);
  });

  await check("Concurrent imports report one new effect and one duplicate without racing the balance", async () => {
    const before = await balance(a.db, checking), row = item(checking, "concurrent", "12.34", "income");
    const results = await Promise.all([importRows(a.db, [row]), importRows(a.db, [row])]);
    assert.equal(results.reduce((total, result) => total + result.imported, 0), 1);
    assert.equal(results.reduce((total, result) => total + result.duplicates, 0), 1);
    assert.equal(await balance(a.db, checking), D(before).plus("12.34").toFixed(2));
  });

  await check("Invoice payment and savings movements retain their linked ledgers and avoid expense duplication", async () => {
    const card = await a.db.from("credit_cards").insert({ name: "Import card", account_id: checking, credit_limit: "1000", closing_day: 20, due_day: 25, last_four: "1234" }).select("id").single();
    assert.equal(card.error, null);
    await operation(a.db, "purchase", { card_id: card.data!.id, description: "Import purchase", amount: "100", installments: 2, date: "2026-09-01" });
    const invoice = await a.db.from("credit_card_invoices").select("id").eq("card_id", card.data!.id).order("due_date").limit(1).single();
    assert.equal(invoice.error, null);
    assert.equal((await importRows(a.db, [item(checking, "bank-invoice", "-50.00", "invoice_payment", { invoice_id: invoice.data!.id })])).imported, 1);
    const payments = await a.db.from("credit_card_payments").select("amount::text").eq("invoice_id", invoice.data!.id);
    assert.equal(payments.error, null); assert.deepEqual(payments.data!.map(row => row.amount), ["50.00"]);
    const goal = await operation(a.db, "create_goal", { name: "Import savings", target: "1000", indexer: "cdi", percentage: "100", product: "rdb" });
    const before = await balance(a.db, checking);
    assert.equal((await importRows(a.db, [item(checking, "bank-deposit", "-100.01", "savings_deposit", { goal_id: goal.id })])).imported, 1);
    assert.equal((await importRows(a.db, [item(checking, "bank-withdraw", "25.01", "savings_withdraw", { goal_id: goal.id })])).imported, 1);
    assert.equal(await balance(a.db, checking), D(before).minus(75).toFixed(2));
    const lots = await a.db.from("savings_lots").select("remaining::text").eq("goal_id", goal.id);
    assert.equal(lots.error, null); assert.deepEqual(lots.data!.map(row => row.remaining), ["75.00"]);
    const links = await a.db.from("import_links").select("transaction_id").in("source_id", [scopedSource(checking, "bank-invoice"), scopedSource(checking, "bank-deposit"), scopedSource(checking, "bank-withdraw")]);
    assert.equal(links.error, null); assert.equal(links.data!.length, 3);
    const effects = await a.db.from("transactions").select("type").in("id", links.data!.map(row => row.transaction_id));
    assert.equal(effects.error, null); assert.equal(effects.data!.length, 3); assert.ok(effects.data!.every(row => row.type !== "expense"));
  });

  await check("Tenant boundaries, invalid dates/classification and registry writes are rejected", async () => {
    const before = await balance(a.db, checking);
    const foreignAccess = await b.db.rpc("import_classified_transactions", { items: [item(checking, "cross-user", "1.00", "income")] });
    assert.ok(foreignAccess.error);
    const unseen = await b.db.from("import_links").select("id"); assert.equal(unseen.error, null); assert.deepEqual(unseen.data, []);
    const bypass = await a.db.from("import_links").insert({ user_id: a.id, account_id: checking, source_id: scopedSource(checking, "bypass"), classification: "income" });
    assert.ok(bypass.error);
    for (const row of [item(checking, "wrong-sign", "-1.00", "income"), item(checking, "bad-date", "1.00", "income", { date: "2026-02-30" }), item(checking, "future", "1.00", "income", { date: "2999-01-01" }), item(checking, "fractions", "1.001", "income")]) {
      assert.ok((await a.db.rpc("import_classified_transactions", { items: [row] })).error);
    }
    assert.equal(await balance(a.db, checking), before);
  });

  console.log(`Import checks: ${passed} passed`);
} finally {
  for (const id of users) {
    const result = await admin.auth.admin.deleteUser(id);
    if (result.error) throw new Error(`Local import test cleanup failed: ${result.error.message}`);
  }
}
