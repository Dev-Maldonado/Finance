import { expect, test } from "vitest";
import { installmentAmounts, installmentPreview, purchaseTotal } from "../src/lib/installments";
import { nextRecurrenceDate } from "../src/lib/recurrence";
import { forecastItems } from "../src/lib/financial-plan";
import { periodMetrics } from "../src/lib/dashboard";
import { operationSchemas, schemas } from "../src/lib/resources";
import type { Snapshot } from "../src/lib/summary";

test("individual-entry installments preserve the exact cents and derive the total on the server", () => {
  const purchase = operationSchemas.purchase.parse({ card_id: "10000000-0000-4000-8000-000000000001", description: "Compra", amount: "1", date: "2026-10-01", installments: 10, entry_method: "installment", installment_amount: "150.00" });
  expect(purchase.amount).toBe("1500.00");
  expect(installmentAmounts(purchase.amount, 10)).toEqual(Array(10).fill("150.00"));
  expect(purchaseTotal("59.99", 12, "installment")).toBe("719.88");
  expect(operationSchemas.purchase.safeParse({ ...purchase, installment_amount: undefined }).success).toBe(false);
});

test("total-entry installments conserve every cent without zero-value installments", () => {
  expect(installmentAmounts("100.00", 3)).toEqual(["33.33", "33.33", "33.34"]);
  expect(installmentAmounts("10.01", 4)).toEqual(["2.50", "2.50", "2.50", "2.51"]);
  expect(installmentAmounts("0.02", 3)).toEqual([]);
  expect(purchaseTotal("999999999999.99", 2, "installment")).toBeNull();
});

test("the due-date preview honors closing boundaries, consecutive months and month-end contracts", () => {
  expect(installmentPreview("300", 3, "2026-10-04", 5, 10)).toEqual([
    { number: 1, amount: "100.00", dueDate: "2026-10-10" },
    { number: 2, amount: "100.00", dueDate: "2026-11-10" },
    { number: 3, amount: "100.00", dueDate: "2026-12-10" },
  ]);
  expect(installmentPreview("100", 1, "2026-10-05", 5, 10)[0].dueDate).toBe("2026-11-10");
  expect(installmentPreview("100", 1, "2024-02-29", 31, 10)[0].dueDate).toBe("2024-04-10");
  expect(installmentPreview("100", 1, "2024-02-01", 20, 31)[0].dueDate).toBe("2024-02-29");
});

test("annual and monthly recurrences recover their contractual day after a short month", () => {
  expect(nextRecurrenceDate("2024-02-29", "annual", 29, 2)).toBe("2025-02-28");
  expect(nextRecurrenceDate("2027-02-28", "annual", 29, 2)).toBe("2028-02-29");
  expect(nextRecurrenceDate("2026-01-31", "monthly", 31)).toBe("2026-02-28");
  expect(nextRecurrenceDate("2026-02-28", "monthly", 31)).toBe("2026-03-31");
  expect(nextRecurrenceDate("2026-12-28", "weekly", 28)).toBe("2027-01-04");
  expect(schemas.recurring_transactions.safeParse({ account_id: "10000000-0000-4000-8000-000000000001", description: "Seguro", type: "expense", amount: "120", next_date: "2026-10-09", frequency: "annual", active: true, end_date: "2028-10-09" }).success).toBe(true);
});

test("future and generated recurring occurrences are separate, bounded and counted once", () => {
  const snapshot: Snapshot = { user: { id: "u", email: "" }, financial_accounts: [{ id: "a", kind: "bank" }], recurring_transactions: [
    { id: "monthly", account_id: "a", description: "Assinatura", type: "expense", amount: "59.90", next_date: "2026-10-09", frequency: "monthly", anchor_day: "9", end_date: "2026-12-09", active: true },
    { id: "annual", account_id: "a", description: "Seguro", type: "expense", amount: "200", next_date: "2026-10-10", frequency: "annual", anchor_day: "10", anchor_month: "10", active: true },
    { id: "paused", account_id: "a", description: "Pausada", type: "expense", amount: "999", next_date: "2026-10-09", frequency: "monthly", active: false },
    { id: "cancelled", account_id: "a", description: "Cancelada", type: "expense", amount: "999", next_date: "2026-10-09", frequency: "monthly", active: true, cancelled_at: "2026-10-08T10:00:00Z" },
  ], transactions: [{ id: "october", account_id: "a", date: "2026-10-09", amount: "-59.90", type: "expense", status: "pending", source_id: "recurrence:monthly:2026-10-09" }] };
  const items = forecastItems(snapshot, "2026-10-08", "2027-01-31");
  expect(items.map(item => [item.date, item.amount])).toEqual([["2026-10-09", "-59.90"], ["2026-10-10", "-200.00"], ["2026-11-09", "-59.90"], ["2026-12-09", "-59.90"]]);
  expect(periodMetrics(snapshot, "2026-10-01", "2026-10-31", false).expenses).toBe("0.00");
  snapshot.transactions = [{ id: "october", account_id: "a", date: "2026-10-09", amount: "-59.90", type: "expense", status: "confirmed", source_id: "recurrence:monthly:2026-10-09" }];
  expect(periodMetrics(snapshot, "2026-10-01", "2026-10-31", false).expenses).toBe("59.90");
  expect(periodMetrics(snapshot, "2026-11-01", "2026-11-30", false).expenses).toBe("0.00");
});
