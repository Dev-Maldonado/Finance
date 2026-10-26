import { D, money } from '@/financial/engine';
import { cardInvoices } from './card-invoices';
import { monthEnd } from './dashboard';
import { recurringOccurrences } from './recurrence';
import { rows, str, type Row, type Snapshot } from './summary';
import { isSettled } from './transaction-state';

export type MonthlyCommitment = {
  id: string; kind: 'fixed' | 'scheduled'; description: string; amount: string;
  date: string; source: string; categoryId: string; status: string;
  recurrenceId?: string; occurrenceDate?: string; transaction?: Row; obligation?: Row;
};
export function monthlyCommitments(s: Snapshot, month: string, today: string, range?:{start:string;end:string;project?:boolean}) {
  const start = range?.start ?? `${month}-01`, end = range?.end ?? monthEnd(month), tx = rows(s, 'transactions');
  const account = (id: string) => str(rows(s, 'financial_accounts').find(a => a.id === id) ?? {}, 'name');
  const savings = new Set(rows(s, 'financial_accounts').filter(a => a.kind === 'savings').map(a => a.id));
  const items: MonthlyCommitment[] = tx.filter(t => t.type === 'expense' && !savings.has(t.account_id) && str(t, 'date') >= start && str(t, 'date') <= end && ['pending','confirmed'].includes(str(t,'status')) && !isSettled(t,today)).map(t => {
    const recurrence = /^recurrence:([0-9a-f-]{36}):(\d{4}-\d{2}-\d{2})$/.exec(str(t, 'source_id'));
    return { id: str(t, 'id'), kind: recurrence ? 'fixed' : 'scheduled', description: str(t, 'description'),
      amount: money(D(str(t, 'amount')).abs()), date: str(t, 'date'), source: account(str(t, 'account_id')),
      categoryId: str(t, 'category_id'), status: t.status === 'pending' ? 'Pendente' : 'Agendado · confirmado',
      recurrenceId: recurrence?.[1], occurrenceDate: recurrence?.[2], transaction: t };
  });
  for (const { recurrence: r, date, sourceId } of recurringOccurrences(range?.project===false?[]:rows(s, 'recurring_transactions').filter(r => r.type === 'expense' && !savings.has(r.account_id)), tx, start, end)) {
    items.push({ id: sourceId, kind: 'fixed', description: str(r, 'description'), amount: money(str(r, 'amount')), date,
      source: account(str(r, 'account_id')), categoryId: str(r, 'category_id'), status: 'Previsto · recorrência', recurrenceId: str(r, 'id'), occurrenceDate: date });
  }
  for (const o of rows(s, 'financial_obligations').filter(o => o.status === 'pending' && str(o, 'due_date') >= start && str(o, 'due_date') <= end)) {
    if (tx.some(t => t.id === o.transaction_id && t.status !== 'cancelled')) continue;
    items.push({ id: str(o, 'id'), kind: 'scheduled', description: str(o, 'name'), amount: money(str(o, 'amount')), date: str(o, 'due_date'), source: 'Compromisso agendado', categoryId: str(o, 'category_id'), status: 'Pendente', obligation: o });
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description) || a.id.localeCompare(b.id));
  const invoices = cardInvoices(s, today).filter(i => i.due>=start && i.due<=end && D(i.pending).gt(0));
  const total = (kind: MonthlyCommitment['kind']) => money(items.filter(i => i.kind === kind).reduce((a, i) => a.plus(i.amount), D(0)));
  const cards = money(invoices.reduce((a, i) => a.plus(i.pending), D(0))), fixed = total('fixed'), scheduled = total('scheduled');
  return { items, invoices, totals: { cards, fixed, scheduled, total: money(D(cards).plus(fixed).plus(scheduled)) } };
}
