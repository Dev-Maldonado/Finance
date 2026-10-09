"use client";
import { useState } from 'react';
import { ChevronDown, Tags, Plus } from 'lucide-react';
import { D, money } from '@/financial/engine';
import { categoryTree, categoryMatches, categoryLabel } from '@/lib/categories';
import { rows, str, type Row, type Snapshot } from '@/lib/summary';
import { CategoryBreakdown } from './category-breakdown';
import { CategoryPicker } from './category-picker';

const brl = (value: string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
const pretty = (value: string) => value.split('-').reverse().join('/');
const spending = (row: Row) => row.spending_kind === 'essential' ? 'Essencial' : row.spending_kind === 'optional' ? 'Opcional' : 'Sem classificação';
export function CategoryManagement({ snapshot, expenses, onEdit, onRemove }: { snapshot: Snapshot; expenses: Row[]; onEdit: (row?: Row) => void; onRemove: (row: Row) => void }) {
  const [expanded, setExpanded] = useState('');
  const [filter, setFilter] = useState('');
  const categories = rows(snapshot, 'categories');
  const tree = categoryTree(categories);
  const total = (id: string) => money(expenses.filter(expense => categoryMatches(categories, str(expense, 'category_id'), id)).reduce((value, expense) => value.plus(D(str(expense, 'amount')).abs()), D(0)));
  const filtered = expenses.filter(expense => categoryMatches(categories, str(expense, 'category_id'), filter));
  return <>
    <section className="panel"><div className="panel-head"><div><h2>Gastos por categoria</h2><p>Totais da categoria principal incluem gastos diretos e subcategorias, uma única vez.</p></div></div><CategoryBreakdown categories={categories} expenses={expenses} /></section>
    <div className="transaction-filters"><label>Filtrar categoria ou subcategoria<CategoryPicker categories={categories} label="Filtrar categorias" value={filter} onChange={setFilter} /></label></div>
    <div className="cards-grid category-management">{tree.filter(node => !filter || categoryMatches(categories, filter, str(node.category, 'id'))).map(({ category, children }) => <section className="panel" key={str(category, 'id')}>
      <div className="panel-head"><div><h2><Tags size={17} /> {category.name}</h2><p>Categoria principal · {spending(category)}</p></div><div className="actions"><button onClick={() => onEdit(category)}>Editar</button><button onClick={() => onRemove(category)}>Excluir</button></div></div>
      <div className="list-row"><span>Gastos no período</span><strong>{brl(total(str(category, 'id')))}</strong></div>
      {category.budget && <div className="list-row"><span>Limite mensal</span><strong>{brl(str(category, 'budget'))}</strong></div>}
      <details className="category-children" open><summary><ChevronDown size={15} /> Subcategorias <span>{children.length}</span></summary><div className="category-child-list">{children.map(child => <div className="category-child-row" key={str(child, 'id')}><div><strong>{child.name}</strong><small>{categoryLabel(categories, str(child, 'id'))} · {spending(child)}</small></div><b>{brl(total(str(child, 'id')))}</b><div className="actions"><button aria-label={`Editar subcategoria ${str(child, 'name')}`} onClick={() => onEdit(child)}>Editar</button><button aria-label={`Excluir subcategoria ${str(child, 'name')}`} onClick={() => onRemove(child)}>Excluir</button></div></div>)}{!children.length && <p className="notice">Adicione subcategorias para detalhar seus gastos.</p>}<button className="text-link" onClick={() => onEdit({ parent_id: str(category, 'id') })}><Plus size={14} /> Nova subcategoria de {category.name}</button></div></details>
      <button className="text-link" aria-expanded={expanded === category.id} onClick={() => setExpanded(expanded === category.id ? '' : str(category, 'id'))}>{expanded === category.id ? 'Fechar detalhes' : 'Detalhar despesas'}</button>
      {expanded === category.id && <div className="category-details"><h3>Despesas e parcelas · {category.name}</h3>{filtered.some(expense => categoryMatches(categories, str(expense, 'category_id'), str(category, 'id'))) ? <div className="table-wrap"><table><thead><tr><th>Descrição</th><th>Categoria / subcategoria</th><th>Origem</th><th>Data / vencimento</th><th>Valor</th></tr></thead><tbody>{filtered.filter(expense => categoryMatches(categories, str(expense, 'category_id'), str(category, 'id'))).sort((a, b) => str(a, 'date').localeCompare(str(b, 'date'))).map(expense => <tr key={`${expense.origin}:${str(expense, 'id')}`}><td>{expense.description}<small>{expense.kind}</small></td><td>{categoryLabel(categories, str(expense, 'category_id'), ' / ')}</td><td>{expense.origin}</td><td>{pretty(str(expense, 'date'))}</td><td>{brl(str(expense, 'amount'))}</td></tr>)}</tbody></table></div> : <p>Nenhuma despesa nem parcela nesta categoria no período.</p>}</div>}
    </section>)}{!tree.length && <div className="empty"><p>Nenhuma categoria cadastrada.</p><button className="primary" onClick={() => onEdit()}>Nova categoria</button></div>}</div>
  </>;
}
