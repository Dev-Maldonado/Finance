'use client';
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { D } from '@/financial/engine';
import { aggregateCategories, canonicalCategory } from '@/lib/categories';
import { changeMetric } from '@/lib/dashboard';
import type { Row } from '@/lib/summary';
import { CategoryChart } from './chart';
const colors = ['#5b35d5', '#e45e82', '#f4ad62', '#2dab98', '#8695ba', '#b5a5df'];
const brl = (value: string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
const pct = (value: string) => `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

/** Dashboard presentation only; category aggregation and comparison reuse the financial model. */
export function DashboardCategoryAnalysis({ categories, expenses, previousExpenses }: { categories: Row[]; expenses: Row[]; previousExpenses: Row[] }) {
  const [parent, setParent] = useState('');
  const selected = canonicalCategory(categories, parent);
  const totals = aggregateCategories(categories, expenses, selected ? parent : undefined);
  const previous = new Map(aggregateCategories(categories, previousExpenses, selected ? parent : undefined).map(total => [total.id, total.value]));
  const childCandidate = totals.find(total => categories.some(category => category.parent_id === total.id));
  const select = (id: string) => { if (!selected && id !== 'uncategorized') setParent(id); };
  const total = totals.reduce((sum, item) => sum.plus(item.value), D(0)).toFixed(2);
  return <div className="analysis-category-breakdown">
    <div className="analysis-category-tabs" aria-label="Nível das categorias"><button type="button" className={!selected ? 'selected' : ''} aria-pressed={!selected} onClick={() => setParent('')}>Categorias</button><button type="button" className={selected ? 'selected' : ''} aria-pressed={!!selected} disabled={!selected && !childCandidate} title={selected ? `Subcategorias de ${selected.name}` : childCandidate ? `Detalhar ${childCandidate.name}` : 'Selecione uma categoria com subcategorias'} onClick={() => { if (childCandidate && !selected) setParent(childCandidate.id); }}>Subcategorias</button></div>
    {selected && <div className="category-breadcrumb"><button className="text-link" onClick={() => setParent('')}><ChevronLeft size={14} /> Todas as categorias</button><div><strong>{selected.name}</strong><small>Composição do total da categoria</small></div></div>}
    {totals.length ? <div className="analysis-category-content">
      <CategoryChart data={totals.map(item => ({ id: item.id, name: item.name, value: Number(item.value) }))} onSelect={selected ? undefined : select} colors={colors} compact center={{ value: brl(total), label: selected ? 'Total da categoria' : 'Total de gastos' }} />
      <table className="analysis-category-table" aria-label={selected ? `Subcategorias de ${selected.name}` : 'Gastos por categoria'}><thead><tr><th>{selected ? 'Subcategoria' : 'Categoria'}</th><th>Atual</th><th>Variação</th></tr></thead><tbody>{totals.map((item, index) => {
        const change = changeMetric(item.value, previous.get(item.id) ?? '0');
        const increased = D(change.difference).gt(0);
        const detail = <><i style={{ background: colors[index % colors.length] }} /><span>{item.name}</span></>;
        return <tr key={item.id}><td>{!selected && item.id !== 'uncategorized' ? <button type="button" className="analysis-category-name" aria-label={`Detalhar ${item.name}`} onClick={() => select(item.id)}>{detail}<ChevronRight size={12} /></button> : <span className="analysis-category-name">{detail}</span>}</td><td><b>{brl(item.value)}</b><small>{pct(item.percent)} {selected ? `de ${selected.name}` : 'dos gastos'}</small></td><td className={D(change.difference).eq(0) ? 'neutral' : increased ? 'negative' : 'positive'}><span>{change.percent === null ? 'Sem base' : `${increased ? '+' : ''}${pct(change.percent)}`}</span><small>{increased ? '+' : ''}{brl(change.difference)} vs. anterior</small></td></tr>;
      })}</tbody></table>
    </div> : <p className="dashboard-empty">Nenhum gasto nesta seleção.</p>}
  </div>;
}
