import { invoiceDate, shiftInvoiceMonth } from "./card-invoices";
import { rows, str, type Row, type Snapshot } from './summary';
import { D, money } from '@/financial/engine';

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

/** A saved occurrence (including a cancellation/payment) replaces its projection. */
export function recurringOccurrences(recurrences: Row[], transactions: Row[], start: string, end: string) {
  const represented = new Set(transactions.map(t => String(t.source_id ?? '')).filter(Boolean));
  return recurrences.flatMap(recurring => {
    if (recurring.active === false || recurring.cancelled_at || recurring.deleted_at || !['weekly', 'monthly', 'annual'].includes(String(recurring.frequency))) return [];
    const frequency = recurring.frequency as RecurrenceFrequency;
    const next = String(recurring.next_date ?? '');
    if (!next || next > end) return [];
    const anchor = Number(recurring.anchor_day || next.slice(8)), anchorMonth = Number(recurring.anchor_month || next.slice(5, 7));
    let date = next;
    if (date < start) {
      if (frequency === 'weekly') date = new Date(Date.parse(`${next}T12:00:00Z`) + Math.ceil((Date.parse(start) - Date.parse(next)) / (7 * 86400000)) * 7 * 86400000).toISOString().slice(0, 10);
      else date = invoiceDate(frequency === 'annual' ? `${start.slice(0, 4)}-${String(anchorMonth).padStart(2, '0')}` : start.slice(0, 7), anchor);
      if (date < start) date = nextRecurrenceDate(date, frequency, anchor, anchorMonth);
    }
    const result: { recurrence: Row; date: string; sourceId: string }[] = [];
    let steps = 0;
    while (date <= end && (!recurring.end_date || date <= String(recurring.end_date))) {
      if (++steps > 500) throw Error('Selecione um intervalo menor para consultar as recorrências.');
      const sourceId = `recurrence:${recurring.id}:${date}`;
      if (!represented.has(sourceId)) result.push({ recurrence: recurring, date, sourceId });
      date = nextRecurrenceDate(date, frequency, anchor, anchorMonth);
    }
    return result;
  });
}

/** Same occurrence keys as the generator. Saved/cancelled/deleted rows suppress projections.
 * Projections are pending presentation rows; they never enter the bank ledger or cash. */
export function projectedRecurringExpenses(snapshot: Snapshot, start: string, end: string): Row[] {
  const tx = rows(snapshot, 'transactions');
  const accounts = new Set(rows(snapshot, 'financial_accounts').filter(a => ['bank', 'cash'].includes(str(a, 'kind')) && !a.archived).map(a => a.id));
  return recurringOccurrences(rows(snapshot, 'recurring_transactions').filter(r => r.type === 'expense' && accounts.has(r.account_id)), tx, start, end)
    .map(({recurrence: r, date, sourceId}) => ({
      id: sourceId, source_id: sourceId, recurrence_id: r.id, occurrence_date: date,
      account_id: r.account_id, category_id: r.category_id, description: r.description,
      type: 'expense', amount: money(D(str(r, 'amount')).abs().neg()), date,
      status: 'pending', projected: true,
    }));
}
