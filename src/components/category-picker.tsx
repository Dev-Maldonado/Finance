"use client";
import { useState } from 'react';
import { categoryTree, canonicalCategory, rootCategory, categoryLabel } from '@/lib/categories';
import type { Row } from '@/lib/summary';

export function CategoryPicker({ categories, name = 'category_id', label = 'Categoria', value, defaultValue = '', required = false, filterMode = false, allowUncategorized = false, onChange }: { categories: Row[]; name?: string; label?: string; value?: string; defaultValue?: string; required?: boolean; filterMode?: boolean; allowUncategorized?: boolean; onChange?: (value: string) => void }) {
  const [selected, setSelected] = useState(defaultValue);
  const id = value ?? selected;
  const category = canonicalCategory(categories, id);
  const root = rootCategory(categories, id);
  const tree = categoryTree(categories, filterMode);
  const activeChildren = tree.find(node => node.category.id === root?.id)?.children ?? [];
  const children = category?.archived && category.id !== root?.id && !activeChildren.some(child => child.id === category.id) ? [...activeChildren, category] : activeChildren;
  const change = (next: string) => { setSelected(next); onChange?.(next); };
  return <span className="category-picker">
    <input type="hidden" name={name} value={category ? String(category.id) : ''} />
    <select aria-label={label} required={required} value={allowUncategorized && id === 'uncategorized' ? id : String(root?.id ?? '')} onChange={event => change(event.target.value)}>
      <option value="">{filterMode ? 'Todas as categorias' : required ? 'Selecione a categoria principal' : 'Sem categoria'}</option>
      {allowUncategorized && filterMode && <option value="uncategorized">Sem categoria</option>}
      {root?.archived && !tree.some(node => node.category.id === root.id) && <option value={String(root.id)}>{root.name} (arquivada)</option>}
      {tree.map(node => <option key={String(node.category.id)} value={String(node.category.id)}>{node.category.name}</option>)}
    </select>
    {!!children.length && <span className="category-child-picker"><span>↳ Subcategoria <small>(opcional)</small></span><select aria-label={`Subcategoria de ${String(root?.name ?? '')}`} value={category?.id === root?.id ? '' : String(category?.id ?? '')} onChange={event => change(event.target.value || String(root?.id ?? ''))}>
      <option value="">{filterMode ? 'Categoria e todas as subcategorias' : `Diretamente em ${root?.name}`}</option>
      {children.map(child => <option key={String(child.id)} value={String(child.id)}>{child.name}{child.archived ? " (arquivada)" : ""}</option>)}
    </select></span>}
    {category && category.id !== root?.id && <small className="category-selected-path">{categoryLabel(categories, String(category.id))}</small>}
  </span>;
}
