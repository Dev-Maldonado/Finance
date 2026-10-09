import { D, money } from '@/financial/engine';
import { categoryMatches } from './categories';
import { rows, str, type Snapshot, type Row } from './summary';

export type PurchaseFilters = { cardId: string; categoryId: string; status: 'active' | 'cancelled' | 'all'; search: string; period: 'all' | 'invoice' | 'custom'; month: string; start: string; end: string };
export function filteredPurchases(snapshot: Snapshot, filters: PurchaseFilters): Row[] {
  const invoiceIds = new Set(rows(snapshot, 'credit_card_invoices').filter(invoice => str(invoice, 'due_date').startsWith(filters.month)).map(invoice => invoice.id));
  const invoicePurchases = new Set(rows(snapshot, 'credit_card_installments').filter(part => invoiceIds.has(part.invoice_id)).map(part => part.purchase_id));
  return rows(snapshot, 'credit_card_purchases', true).filter(purchase =>
    (!filters.cardId || purchase.card_id === filters.cardId) &&
    categoryMatches(rows(snapshot, 'categories'), str(purchase, 'category_id'), filters.categoryId) &&
    (filters.status === 'all' || (filters.status === 'cancelled' ? purchase.status === 'cancelled' : purchase.status !== 'cancelled')) &&
    str(purchase, 'description').toLocaleLowerCase('pt-BR').includes(filters.search.trim().toLocaleLowerCase('pt-BR')) &&
    (filters.period === 'all' || (filters.period === 'invoice' ? invoicePurchases.has(purchase.id) : str(purchase, 'date') >= filters.start && str(purchase, 'date') <= filters.end))
  ).sort((a, b) => str(b, 'date').localeCompare(str(a, 'date')) || str(a, 'id').localeCompare(str(b, 'id')));
}
export function purchaseMetrics(snapshot: Snapshot, purchases: Row[], month: string, asOf = "9999-12-31") {
  const active = purchases.filter(p => p.status !== 'cancelled');
  const ids = new Set(active.filter(p => str(p, "date") <= asOf).map(p => p.id));
  const invoices = new Set(rows(snapshot, 'credit_card_invoices').filter(i => str(i, 'due_date').startsWith(month)).map(i => i.id));
  return { count: purchases.length, excluded: purchases.length - active.length,
    total: money(active.reduce((total, p) => total.plus(str(p, 'amount')), D(0))),
    monthly: money(rows(snapshot, 'credit_card_installments').filter(p => ids.has(p.purchase_id) && invoices.has(p.invoice_id)).reduce((total, p) => total.plus(str(p, 'amount')), D(0))) };
}
