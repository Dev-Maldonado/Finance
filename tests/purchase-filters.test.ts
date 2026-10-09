import { expect, test } from 'vitest';
import { filteredPurchases, purchaseMetrics, type PurchaseFilters } from '../src/lib/purchase-filters';
import type { Snapshot } from '../src/lib/summary';
const sample: Snapshot = { user: { id: 'u', email: '' }, categories: [{ id: 'food', name: 'Alimentação' }, { id: 'lunch', name: 'Lanches', parent_id: 'food' }, { id: 'transport', name: 'Transporte' }], credit_cards: [{ id: 'a', name: 'Mesmo nome' }, { id: 'b', name: 'Mesmo nome' }], credit_card_purchases: [
  { id: 'one', card_id: 'a', category_id: 'lunch', description: 'Compra mensal', date: '2026-09-20', amount: '300.01', status: 'confirmed' },
  { id: 'two', card_id: 'b', category_id: 'food', description: 'Outro cartão', date: '2026-10-02', amount: '80', status: 'confirmed' },
  { id: 'three', card_id: 'a', category_id: 'transport', description: 'Outra categoria', date: '2026-10-02', amount: '30', status: 'confirmed' },
  { id: 'removed', card_id: 'a', category_id: 'lunch', description: 'Excluída', date: '2026-10-03', amount: '999', status: 'cancelled' },
  { id: 'future', card_id: 'a', description: 'Compra futura', date: '2026-11-02', amount: '150', status: 'confirmed' },
], credit_card_invoices: [{ id: 'ia', card_id: 'a', due_date: '2026-10-10' }, { id: 'ib', card_id: 'b', due_date: '2026-10-10' }], credit_card_installments: [{ id: 'part1', purchase_id: 'one', invoice_id: 'ia', amount: '100.00' }, { id: 'part2', purchase_id: 'two', invoice_id: 'ib', amount: '80' }] };
const filters: PurchaseFilters = { cardId: '', categoryId: '', status: 'active', search: '', period: 'all', month: '2026-10', start: '2026-10-01', end: '2026-10-31' };
test('card UUID, root/child, status, text and invoice month intersect without confusing identical card names', () => {
  expect(filteredPurchases(sample, { ...filters, cardId: 'a', categoryId: 'food', search: ' MENSAL ', period: 'invoice' }).map(p => p.id)).toEqual(['one']);
  expect(filteredPurchases(sample, { ...filters, cardId: 'b', categoryId: 'lunch', period: 'invoice' })).toHaveLength(0);
  expect(filteredPurchases(sample, { ...filters, cardId: 'a', categoryId: 'lunch', status: 'cancelled', period: 'custom' }).map(p => p.id)).toEqual(['removed']);
  expect(filteredPurchases(sample, { ...filters, categoryId: 'uncategorized' }).map(p => p.id)).toEqual(['future']);
  expect(filteredPurchases(sample, { ...filters, period: 'invoice', month: '2026-11' })).toHaveLength(0);
});
test('totals separate active full purchases, monthly cents and excluded history', () => {
  const purchases = filteredPurchases(sample, { ...filters, cardId: 'a', categoryId: 'food', status: 'all' });
  expect(purchaseMetrics(sample, purchases, '2026-10', '2026-10-08')).toEqual({ count: 2, excluded: 1, total: '300.01', monthly: '100.00' });
  expect(purchaseMetrics(sample, purchases, '2026-11', '2026-10-08').monthly).toBe('0.00');
});
