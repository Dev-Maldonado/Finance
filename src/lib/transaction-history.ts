import { projectedRecurringExpenses } from './recurrence';
import { D } from '@/financial/engine';
import { categoryMatches } from './categories';
import { cardInvoices } from './card-invoices';
import { rows, str, type Row, type Snapshot } from './summary';

/** Presentation only: installments never become bank ledger entries. */
export function transactionHistory(snapshot: Snapshot, today: string, start = today, end = today): Row[] {
  const purchases = new Map(rows(snapshot, 'credit_card_purchases', true).map(p => [p.id, p]));
  const invoices = new Map(cardInvoices(snapshot, today).map(i => [i.id, i]));
  const parts = rows(snapshot, 'credit_card_installments').flatMap(part => {
    const purchase = purchases.get(part.purchase_id);
    const invoice = invoices.get(str(part, 'invoice_id'));
    if (!purchase || !invoice || str(purchase, 'date') > today) return [];
    return [{ ...part, id: `installment:${part.id}`, purchase_id: purchase.id,
      origin: 'card', card_id: purchase.card_id, card_name: invoice.cardName,
      description: purchase.description, category_id: purchase.category_id,
      date: invoice.due, purchase_date: purchase.date, type: 'expense',
      amount: D(str(part, 'amount')).abs().neg().toFixed(2),
      purchase_total: purchase.amount, installment_count: purchase.installments,
      status: purchase.status === 'cancelled' ? 'cancelled' : invoice.pending === '0.00' && D(invoice.total).gt(0) ? 'confirmed' : 'pending',
      invoice_status: invoice.status,
    } as Row];
  });
  return [...[...rows(snapshot, 'transactions').filter(t => !t.deleted_at), ...projectedRecurringExpenses(snapshot, start, end)].map(t => ({ ...t, origin: 'account' })), ...parts]
    .sort((a, b) => str(b, 'date').localeCompare(str(a, 'date')) || str(a, 'id').localeCompare(str(b, 'id')));
}
export function filterTransactionHistory(snapshot: Snapshot, list: Row[], filters: { start: string; end: string; search: string; account: string; category: string; type: string; status: string; excluded: boolean }) {
  return list.filter(r => !r.deleted_at && str(r, 'date') >= filters.start && str(r, 'date') <= filters.end &&
    (r.status !== 'cancelled' || filters.excluded || filters.status === 'cancelled') &&
    `${str(r, 'description')} ${str(r, 'card_name')}`.toLocaleLowerCase('pt-BR').includes(filters.search.trim().toLocaleLowerCase('pt-BR')) &&
    (!filters.account || (filters.account.startsWith('card:') ? r.card_id === filters.account.slice(5) : r.origin !== 'card' && r.account_id === filters.account)) &&
    categoryMatches(rows(snapshot, 'categories'), str(r, 'category_id'), filters.category) &&
    (!filters.type || r.type === filters.type) && (!filters.status || r.status === filters.status));
}
