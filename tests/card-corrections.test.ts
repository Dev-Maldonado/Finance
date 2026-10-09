import { expect, test } from "vitest";
import { cardColors } from "../src/lib/card-color";
import { financialSummary, rows, type Snapshot } from "../src/lib/summary";

test("card colors keep readable text on light and dark backgrounds", () => {
  expect(cardColors("#FFFFFF").color).toBe("#171327");
  expect(cardColors("#000000").color).toBe("#FFFFFF");
  expect(cardColors("invalid").background).toBe("#5B35D5");
});

test("excluded purchases stay available as history and leave financial totals", () => {
  const snapshot: Snapshot = {
    user: { id: "user", email: "" },
    credit_card_purchases: [
      { id: "active", amount: "6.33", date: "2026-10-01", status: "confirmed" },
      { id: "excluded", amount: "5000", date: "2026-10-01", status: "cancelled" },
    ],
    credit_cards: [{ id: "card", closing_day: "5", due_day: "10" }],
    credit_card_invoices: [{ id: "invoice", card_id: "card", due_date: "2026-10-10" }],
    credit_card_installments: [
      { id: "part", purchase_id: "active", invoice_id: "invoice", amount: "6.33" },
      { id: "excluded-part", purchase_id: "excluded", invoice_id: "invoice", amount: "5000" },
    ],
  };
  expect(rows(snapshot, "credit_card_purchases").length).toBe(1);
  expect(rows(snapshot, "credit_card_purchases", true).length).toBe(2);
  expect(financialSummary(snapshot, "2026-10-01", "2026-10-31").expense).toBe("6.33");
});
