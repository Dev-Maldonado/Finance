import Decimal from "decimal.js";
import { D, money } from "@/financial/engine";
import { invoiceDate, shiftInvoiceMonth } from "./card-invoices";

export type PurchaseEntryMethod = "total" | "installment";

/** The remainder stays in the final installment, matching the persisted ledger. */
export function installmentAmounts(total: string, count: number): string[] {
  if (!Number.isInteger(count) || count < 1 || count > 120 || !/^\d{1,12}(\.\d{1,2})?$/.test(total) || D(total).lte(0)) return [];
  const base = D(total).div(count).toDecimalPlaces(2, Decimal.ROUND_DOWN);
  if (base.lte(0)) return [];
  return Array.from({ length: count }, (_, index) => money(index === count - 1 ? D(total).minus(base.mul(count - 1)) : base));
}

export function purchaseTotal(value: string, count: number, method: PurchaseEntryMethod) {
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(value) || D(value).lte(0) || !Number.isInteger(count) || count < 1 || count > 120) return null;
  const total = method === "installment" ? D(value).mul(count) : D(value);
  return total.lt("1000000000000") ? money(total) : null;
}

export function installmentPreview(total: string, count: number, purchaseDate: string, closingDay: number, dueDay: number) {
  const amounts = installmentAmounts(total, count);
  if (!amounts.length || !/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate) || ![closingDay, dueDay].every(day => Number.isInteger(day) && day >= 1 && day <= 31)) return [];
  const actualDate = new Date(`${purchaseDate}T12:00:00Z`);
  if (Number.isNaN(actualDate.getTime()) || actualDate.toISOString().slice(0, 10) !== purchaseDate) return [];
  let month = purchaseDate.slice(0, 7);
  if (purchaseDate >= invoiceDate(month, closingDay)) month = shiftInvoiceMonth(month, 1);
  if (dueDay <= closingDay) month = shiftInvoiceMonth(month, 1);
  return amounts.map((amount, index) => ({ number: index + 1, amount, dueDate: invoiceDate(shiftInvoiceMonth(month, index), dueDay) }));
}
