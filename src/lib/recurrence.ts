import { invoiceDate, shiftInvoiceMonth } from "./card-invoices";

export type RecurrenceFrequency = "weekly" | "monthly" | "annual";

/** Annual schedules keep the contractual month/day through leap-year clamping. */
export function nextRecurrenceDate(date: string, frequency: RecurrenceFrequency, anchorDay: number, anchorMonth = Number(date.slice(5, 7))) {
  if (frequency === "weekly") {
    const next = new Date(`${date}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 7);
    return next.toISOString().slice(0, 10);
  }
  return invoiceDate(frequency === "annual" ? `${Number(date.slice(0, 4)) + 1}-${String(anchorMonth).padStart(2, "0")}` : shiftInvoiceMonth(date.slice(0, 7), 1), anchorDay);
}
