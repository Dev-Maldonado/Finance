import { describe, it, expect } from 'vitest';
import { aggregateCategories, canonicalCategory, categoryLabel, categoryMatches, categoryOptions, categoryTree, categorySpendingKind, rootCategory } from '../src/lib/categories';
import { periodCategoryTotals, periodMetrics, budgetMetrics, dashboardModel } from '../src/lib/dashboard';
import { exportReportRows } from '../src/components/exports';
import { financialPlan } from '../src/lib/financial-plan';
import type { Snapshot, Row } from '../src/lib/summary';

const categories: Row[] = [
  { id: 'transport', name: 'Transportes', parent_id: null, spending_kind: 'essential' },
  { id: 'uber', name: 'Uber', parent_id: 'transport', spending_kind: 'unclassified' },
  { id: 'bus', name: 'Ônibus', parent_id: 'transport' },
  { id: 'food', name: 'Alimentação' },
  { id: 'legacy-uber', name: 'UBER', parent_id: 'transport', merged_into_id: 'uber' },
  { id: 'archive', name: 'Categoria antiga', archived: true },
];
const expenses: Row[] = [
  { id: 'direct', category_id: 'transport', amount: '-50' },
  { id: 'uber-payment', category_id: 'uber', amount: '-250' },
  { id: 'bus-payment', category_id: 'bus', amount: '-100' },
  { id: 'legacy-payment', category_id: 'legacy-uber', amount: '-50' },
  { id: 'food-payment', category_id: 'food', amount: '-200' },
  { id: 'without-category', category_id: null, amount: '-20' },
];
describe('two-level category hierarchy', () => {
  it('shows each child inside its root and keeps legacy aliases out of selection', () => {
    const tree = categoryTree(categories);
    expect(tree).toHaveLength(2);
    expect(tree.find(node => node.category.id === 'transport')?.children.map(child => child.id)).toEqual(['bus', 'uber']);
    expect(categoryOptions(categories)).toEqual([['food', 'Alimentação'], ['transport', 'Transportes'], ['bus', '↳ Transportes → Ônibus'], ['uber', '↳ Transportes → Uber']]);
    expect(categoryOptions(categories, true).some(([id]) => id === 'archive')).toBe(true);
  });
  it('filters roots with all children and filters each child precisely including aliases', () => {
    expect(expenses.filter(expense => categoryMatches(categories, String(expense.category_id ?? ''), 'transport')).map(expense => expense.id)).toEqual(['direct', 'uber-payment', 'bus-payment', 'legacy-payment']);
    expect(expenses.filter(expense => categoryMatches(categories, String(expense.category_id ?? ''), 'uber')).map(expense => expense.id)).toEqual(['uber-payment', 'legacy-payment']);
    expect(categoryMatches(categories, '', 'uncategorized')).toBe(true);
    expect(canonicalCategory(categories, 'legacy-uber')?.id).toBe('uber');
    expect(rootCategory(categories, 'legacy-uber')?.id).toBe('transport');
    expect(categoryLabel(categories, 'legacy-uber', ' / ')).toBe('Transportes / Uber');
    expect(categorySpendingKind(categories, 'legacy-uber')).toBe('essential');
    expect(categorySpendingKind(categories.map(category => category.id === 'legacy-uber' ? { ...category, spending_kind: 'optional' } : category), 'legacy-uber')).toBe('optional');
  });
  it('counts root and children once and drills down with direct root expenses separate', () => {
    expect(aggregateCategories(categories, expenses)).toEqual([
      { id: 'transport', name: 'Transportes', value: '450.00', percent: '67.2' },
      { id: 'food', name: 'Alimentação', value: '200.00', percent: '29.9' },
      { id: 'uncategorized', name: 'Sem categoria', value: '20.00', percent: '3.0' },
    ]);
    expect(aggregateCategories(categories, expenses, 'transport')).toEqual([
      { id: 'uber', name: 'Uber', value: '300.00', percent: '66.7' },
      { id: 'bus', name: 'Ônibus', value: '100.00', percent: '22.2' },
      { id: 'transport:direct', name: 'Direto em Transportes', value: '50.00', percent: '11.1' },
    ]);
  });
  it('reparenting changes organization by ID without altering ledger amounts or IDs', () => {
    const moved = categories.map(category => category.id === 'uber' ? { ...category, parent_id: 'food' } : category);
    expect(categoryLabel(moved, 'legacy-uber')).toBe('Alimentação → Uber');
    expect(aggregateCategories(moved, expenses).find(total => total.id === 'food')?.value).toBe('500.00');
    expect(aggregateCategories(moved, expenses).reduce((sum, total) => sum + Number(total.value), 0)).toBe(670);
    expect(expenses.find(expense => expense.id === 'legacy-payment')).toMatchObject({ category_id: 'legacy-uber', amount: '-50' });
  });
  it('retains archived category historical totals and handles broken/circular legacy links safely', () => {
    const legacy: Row[] = [...categories, { id: 'nested', name: 'Táxi', parent_id: 'uber' }, { id: 'orphan', name: 'Órfã', parent_id: 'missing' }, { id: 'cycle-a', name: 'A', parent_id: 'cycle-b' }, { id: 'cycle-b', name: 'B', parent_id: 'cycle-a' }];
    expect(categoryLabel(legacy, 'nested')).toBe('Transportes → Táxi');
    expect(categoryTree(legacy).find(node => node.category.id === 'transport')?.children.some(child => child.id === 'nested')).toBe(true);
    expect(rootCategory(legacy, 'cycle-a')).toBeDefined();
    expect(categoryLabel(legacy, 'orphan')).toBe('Órfã');
    expect(aggregateCategories(legacy, [{ category_id: 'archive', amount: '-12.35' }])).toEqual([{ id: 'archive', name: 'Categoria antiga', value: '12.35', percent: '100.0' }]);
  });
});

it('dashboard, budgets, exports and emergency reserve use the same monthly category hierarchy', () => {
  const snapshot: Snapshot = { user: { id: 'u', email: '' }, categories,
    transactions: [ { id: 'cash', type: 'expense', status: 'confirmed', amount: '-50', category_id: 'legacy-uber', date: '2026-10-01' }, { id: 'next-month', type: 'expense', status: 'confirmed', amount: '-300', category_id: 'uber', date: '2026-11-01' }, { id: 'pending', type: 'expense', status: 'pending', amount: '-500', category_id: 'bus', date: '2026-10-01' } ],
    credit_cards: [{ id: 'card', name: 'Cartão', closing_day: '5', due_day: '10' }],
    credit_card_purchases: [{ id: 'purchase', card_id: 'card', description: 'Parcelada', amount: '300', installments: '3', date: '2026-09-01', category_id: 'uber' }],
    credit_card_invoices: [{ id: 'oct', card_id: 'card', due_date: '2026-10-10' }, { id: 'nov', card_id: 'card', due_date: '2026-11-10' }],
    credit_card_installments: [{ id: 'oct-part', purchase_id: 'purchase', invoice_id: 'oct', amount: '100', number: '1' }, { id: 'nov-part', purchase_id: 'purchase', invoice_id: 'nov', amount: '100', number: '2' }],
  };
  expect(periodMetrics(snapshot, '2026-10-01', '2026-10-31').expenses).toBe('150.00');
  expect(periodCategoryTotals(snapshot, '2026-10-01', '2026-10-31')).toEqual([{ id: 'transport', name: 'Transportes', value: '150.00', percent: '100.0' }]);
  expect(budgetMetrics(snapshot, { month: '2026-10-01', amount: '200', category_id: 'transport' }).spent).toBe('150.00');
  expect(budgetMetrics(snapshot, { month: '2026-10-01', amount: '200', category_id: 'uber' }).spent).toBe('150.00');
  expect(budgetMetrics(snapshot, { month: '2026-10-01', amount: '200', category_id: 'bus' }).spent).toBe('0.00');
  expect(dashboardModel(snapshot, '2026-10-01', '2026-10-31', 'month', '2026-10-08').categories[0].value).toBe('150.00');
  expect(exportReportRows(snapshot, '2026-10-01', '2026-10-31').map(row => row.category)).toEqual(['Transportes / Uber', 'Transportes / Uber']);
  // September has the original purchase but no installment due; October has 150.
  expect(financialPlan(snapshot, '2026-11-08').essentials).toMatchObject({ monthly: '75.00', sampleMonths: 2 });
});
