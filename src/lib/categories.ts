import { D, money } from '@/financial/engine';
import type { Row } from './summary';

const text = (row: Row | undefined, key: string) => String(row?.[key] ?? '');
export type CategoryNode = { category: Row; children: Row[] };
export type CategoryTotal = { id: string; name: string; value: string; percent: string };

/** Historical IDs stay intact when duplicate categories are consolidated. */
export function canonicalCategory(categories: Row[], id: string): Row | undefined {
  const seen = new Set<string>();
  let category = categories.find(row => row.id === id);
  while (category && text(category, 'merged_into_id') && !seen.has(text(category, 'id'))) {
    seen.add(text(category, 'id'));
    const next = categories.find(row => row.id === category?.merged_into_id);
    if (!next) break;
    category = next;
  }
  return category;
}
export function rootCategory(categories: Row[], id: string): Row | undefined {
  const seen = new Set<string>();
  let category = canonicalCategory(categories, id);
  while (category && text(category, 'parent_id') && !seen.has(text(category, 'id'))) {
    seen.add(text(category, 'id'));
    const parent = canonicalCategory(categories, text(category, 'parent_id'));
    if (!parent) break;
    category = parent;
  }
  return category;
}
export function categoryTree(categories: Row[], includeArchived = false): CategoryNode[] {
  const active = categories.filter(category => !category.merged_into_id && (includeArchived || !category.archived));
  const roots = active.filter(category => !category.parent_id || !canonicalCategory(categories, text(category, 'parent_id')));
  const sort = (a: Row, b: Row) => text(a, 'name').localeCompare(text(b, 'name'), 'pt-BR');
  return roots.sort(sort).map(category => ({ category, children: active.filter(child => child.id !== category.id && rootCategory(categories, text(child, 'id'))?.id === category.id).sort(sort) }));
}
export function categoryLabel(categories: Row[], id: string, separator = ' → '): string {
  const category = canonicalCategory(categories, id);
  if (!category) return 'Sem categoria';
  const root = rootCategory(categories, text(category, 'id'));
  return root && root.id !== category.id ? `${text(root, 'name')}${separator}${text(category, 'name')}` : text(category, 'name');
}
export function categorySpendingKind(categories: Row[], id: string): 'essential' | 'optional' | 'unclassified' {
  const seen = new Set<string>();
  let category = categories.find(row => row.id === id);
  while (category && !seen.has(text(category, 'id'))) {
    seen.add(text(category, 'id'));
    const kind = text(category, 'spending_kind');
    // Preserve explicit decisions on historical alias rows before inheriting.
    if (kind === 'essential' || kind === 'optional') return kind;
    category = category.merged_into_id ? canonicalCategory(categories, text(category, 'merged_into_id')) : categories.find(row => row.id === category?.parent_id);
  }
  return 'unclassified';
}
/** Selecting a root includes direct expenses and children; selecting a child stays precise. */
export function categoryMatches(categories: Row[], id: string, filter: string): boolean {
  if (!filter) return true;
  if (filter === 'uncategorized') return !id || !canonicalCategory(categories, id);
  const selected = canonicalCategory(categories, filter);
  const category = canonicalCategory(categories, id);
  if (!selected || !category) return false;
  return selected.id === category.id || (!selected.parent_id && rootCategory(categories, id)?.id === selected.id);
}
export function categoryOptions(categories: Row[], includeArchived = false): [string, string][] {
  return categoryTree(categories, includeArchived).flatMap(({ category, children }) => [
    [text(category, 'id'), `${text(category, 'name')}${category.archived ? ' (arquivada)' : ''}`] as [string, string],
    ...children.map(child => [text(child, 'id'), `↳ ${categoryLabel(categories, text(child, 'id'))}${child.archived ? ' (arquivada)' : ''}`] as [string, string]),
  ]);
}
/** Each expense contributes once. Root totals include their direct entries and children. */
export function aggregateCategories(categories: Row[], expenses: Row[], parentId?: string): CategoryTotal[] {
  const totals = new Map<string, { name: string; total: ReturnType<typeof D> }>();
  let denominator = D(0);
  const selected = parentId ? canonicalCategory(categories, parentId) : undefined;
  for (const expense of expenses) {
    const categoryId = text(expense, 'category_id');
    const category = canonicalCategory(categories, categoryId);
    const root = rootCategory(categories, categoryId);
    if (selected && !categoryMatches(categories, categoryId, text(selected, 'id'))) continue;
    const amount = D(text(expense, 'amount') || '0').abs();
    denominator = denominator.plus(amount);
    const id = selected ? (category?.id === selected.id ? `${selected.id}:direct` : text(category, 'id') || 'uncategorized') : text(root, 'id') || 'uncategorized';
    const name = selected ? (category?.id === selected.id ? `Direto em ${text(selected, 'name')}` : text(category, 'name') || 'Sem categoria') : text(root, 'name') || 'Sem categoria';
    const entry = totals.get(id) ?? { name, total: D(0) };
    entry.total = entry.total.plus(amount);
    totals.set(id, entry);
  }
  return [...totals].map(([id, entry]) => ({ id, name: entry.name, value: money(entry.total), percent: denominator.gt(0) ? entry.total.div(denominator).mul(100).toFixed(1) : '0.0' })).sort((a, b) => D(b.value).comparedTo(a.value));
}
