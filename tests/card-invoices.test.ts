import { expect, test } from "vitest";
import { cardInvoices, invoiceTotals, shiftInvoiceMonth } from "../src/lib/card-invoices";
import { rows, type Snapshot } from "../src/lib/summary";

function example(): Snapshot {
  return {
    user: { id: "user", email: "" },
    credit_cards: [
      { id: "a", name: "Card A", account_id: "cash", closing_day: "5", due_day: "10" },
      { id: "b", name: "Card B", account_id: "cash", closing_day: "28", due_day: "5" },
    ],
    credit_card_purchases: [{ id: "purchase", description: "Three installments", installments: "3", date: "2026-10-01", status: "confirmed" }],
    credit_card_invoices: [
      { id: "oct", card_id: "a", due_date: "2026-10-10" },
      { id: "nov", card_id: "a", due_date: "2026-11-10" },
      { id: "dec", card_id: "a", due_date: "2026-12-10" },
    ],
    credit_card_installments: [
      { id: "one", purchase_id: "purchase", invoice_id: "oct", number: "1", amount: "100" },
      { id: "two", purchase_id: "purchase", invoice_id: "nov", number: "2", amount: "100" },
      { id: "three", purchase_id: "purchase", invoice_id: "dec", number: "3", amount: "100.01" },
    ],
    credit_card_payments: [{ id: "payment", invoice_id: "oct", amount: "25", date: "2026-10-07" }],
  };
}

test("monthly invoice uses only its installment and associated payments", () => {
  const invoices = cardInvoices(example(), "2026-10-08");
  expect(invoices[0]).toMatchObject({ month: "2026-10", total: "100.00", paid: "25.00", pending: "75.00", status: "Parcialmente paga" });
  expect(invoices[1]).toMatchObject({ total: "100.00", paid: "0.00", pending: "100.00", status: "Prevista" });
  expect(invoices[2].total).toBe("100.01");
  expect(invoiceTotals(invoices).pending).toBe("275.01");
  expect(invoices[2].installments[0]).toMatchObject({ number: "3", count: "3", amount: "100.01" });
});

test("month aggregation includes multiple cards without moving payments to another invoice", () => {
  const snapshot = example();
  snapshot.credit_card_invoices = [...rows(snapshot, "credit_card_invoices"), { id: "b-oct", card_id: "b", due_date: "2026-10-05" }];
  snapshot.credit_card_installments = [...rows(snapshot, "credit_card_installments"), { id: "b-part", purchase_id: "purchase", invoice_id: "b-oct", number: "1", amount: "40" }];
  const totals = invoiceTotals(cardInvoices(snapshot, "2026-10-08").filter(invoice => invoice.month === "2026-10"));
  expect(totals).toEqual({ total: "140.00", paid: "25.00", pending: "115.00", credit: "0.00" });
});

test("excluded purchases do not reenter invoice previews", () => {
  const snapshot = example();
  snapshot.credit_card_purchases = [{ id: "purchase", status: "cancelled" }];
  snapshot.credit_card_payments = [];
  expect(invoiceTotals(cardInvoices(snapshot, "2026-10-08")).total).toBe("0.00");
});

test("closing and month navigation handle year rollover", () => {
  const snapshot = example();
  snapshot.credit_card_invoices = [{ id: "jan", card_id: "b", due_date: "2027-01-05" }];
  expect(cardInvoices(snapshot, "2026-12-20")[0].closing).toBe("2026-12-28");
  expect(shiftInvoiceMonth("2026-12", 1)).toBe("2027-01");
  expect(shiftInvoiceMonth("2027-01", -1)).toBe("2026-12");
});

test("partial payment stays overdue after its due date", () => {
  expect(cardInvoices(example(), "2026-10-11")[0].status).toBe("Atrasada");
});

test("credit from one invoice does not offset another card's amount to pay", () => {
  const invoices = cardInvoices(example(), "2026-10-08");
  invoices[0] = { ...invoices[0], pending: "0.00", credit: "30.00" };
  expect(invoiceTotals(invoices.slice(0, 2))).toMatchObject({ pending: "100.00", credit: "30.00" });
  expect(invoiceTotals([])).toEqual({ total: "0.00", paid: "0.00", pending: "0.00", credit: "0.00" });
});
