"use client";
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { aggregateCategories, canonicalCategory } from '@/lib/categories';
import type { Row } from '@/lib/summary';
import { CategoryChart, palette } from './chart';

const brl = (value: string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
export function CategoryBreakdown({ categories, expenses }: { categories: Row[]; expenses: Row[] }) {
  const [parent, setParent] = useState('');
  const selected = canonicalCategory(categories, parent);
  const totals = aggregateCategories(categories, expenses, selected ? parent : undefined);
  const select = (id: string) => { if (!selected && id !== 'uncategorized') setParent(id); };
  return <div className="category-breakdown">
    {selected && <div className="category-breadcrumb"><button className="text-link" onClick={() => setParent('')}><ChevronLeft size={14} /> Todas as categorias</button><div><strong>{selected.name}</strong><small>Composição do total da categoria</small></div></div>}
    {totals.length ? <><CategoryChart data={totals.map(total => ({ id: total.id, name: total.name, value: Number(total.value) }))} onSelect={selected ? undefined : select} /><div className="dashboard-category-list">{totals.map((total, index) => {
      const detail = <><span className="category-chart-name"><i style={{ background: palette[index % palette.length] }} />{total.name}</span><span className="category-chart-value"><b>{brl(total.value)}</b><small>{Number(total.percent).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% {selected ? `de ${String(selected.name)}` : 'dos gastos'}</small></span></>;
      return !selected && total.id !== 'uncategorized'
        ? <button type="button" className="category-chart-item" key={total.id} onClick={() => select(total.id)} aria-label={`Detalhar ${total.name}`}>{detail}<ChevronRight size={14} /></button>
        : <div className="category-chart-item" key={total.id}>{detail}</div>;
    })}</div></> : <p className="dashboard-empty">Nenhum gasto nesta seleção.</p>}
  </div>;
}
