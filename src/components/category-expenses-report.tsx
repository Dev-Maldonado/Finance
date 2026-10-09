"use client";
import { useState } from 'react';
import { D, money } from '@/financial/engine';
import { categoryLabel, categoryMatches } from '@/lib/categories';
import { cardInvoices } from '@/lib/card-invoices';
import { rows, str, type Row, type Snapshot } from '@/lib/summary';
import { CategoryBreakdown } from './category-breakdown';
import { CategoryPicker } from './category-picker';
import { exportData } from './exports';

const brl = (value: string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
export function CategoryExpensesReport({ snapshot, expenses, today }: { snapshot: Snapshot; expenses: Row[]; today: string }) {
  const [category, setCategory] = useState(''), [card, setCard] = useState(''), [origin, setOrigin] = useState(''), [status, setStatus] = useState('');
  const categories = rows(snapshot, 'categories');
  const invoices = new Map(cardInvoices(snapshot, today).map(invoice => [invoice.id, invoice]));
  const paymentStatus = (expense: Row) => !expense.card_id ? 'cash_confirmed' : D(invoices.get(str(expense, 'invoice_id'))?.pending ?? '0').gt(0) ? 'invoice_open' : 'invoice_paid';
  const filtered = expenses.filter(expense => categoryMatches(categories, str(expense, 'category_id'), category) && (!card || expense.card_id === card) && (!origin || (origin === 'card' ? !!expense.card_id : !expense.card_id)) && (!status || paymentStatus(expense) === status));
  const total = money(filtered.reduce((value, expense) => value.plus(D(str(expense, 'amount')).abs()), D(0)));
  const exported = filtered.map(expense => ({ date: str(expense, 'date'), description: str(expense, 'description'), category: categoryLabel(categories, str(expense, 'category_id'), ' / '), type: expense.card_id ? 'card_installment' : 'expense', amount: money(D(str(expense, 'amount')).abs().neg()), origin: str(expense, 'origin'), status: paymentStatus(expense) }));
  return <section className="panel"><div className="panel-head"><div><h2>Categorias e subcategorias no período</h2><p>Contas e parcelas por vencimento. O total da categoria soma seus gastos diretos e subcategorias uma única vez.</p></div><div className="actions"><button onClick={() => exportData(exported, 'csv', { title: 'Gastos por categoria' })}>Exportar CSV</button></div></div>
    <div className="transaction-filters"><label>Categoria<CategoryPicker categories={categories} label="Filtrar relatório por categoria" value={category} onChange={setCategory} filterMode /></label><label>Cartão<select aria-label="Filtrar relatório por cartão" value={card} onChange={event => setCard(event.target.value)}><option value="">Todos</option>{rows(snapshot, 'credit_cards').map(item => <option key={str(item, 'id')} value={str(item, 'id')}>{item.name}</option>)}</select></label><label>Tipo<select aria-label="Filtrar relatório por tipo" value={origin} onChange={event => setOrigin(event.target.value)}><option value="">Contas e cartões</option><option value="cash">Despesas nas contas</option><option value="card">Parcelas dos cartões</option></select></label><label>Status<select aria-label="Filtrar relatório por status" value={status} onChange={event => setStatus(event.target.value)}><option value="">Todos os gastos de competência</option><option value="cash_confirmed">Despesas pagas nas contas</option><option value="invoice_paid">Parcelas de faturas quitadas</option><option value="invoice_open">Parcelas de faturas em aberto</option></select></label><button onClick={() => { setCategory(''); setCard(''); setOrigin(''); setStatus(''); }}>Limpar filtros</button></div>
    <div className="list-row"><span>Gastos nesta seleção</span><strong>{brl(total)}</strong></div>
    <CategoryBreakdown key={`${category}:${card}:${origin}:${status}`} categories={categories} expenses={filtered} />
    <details className="category-children"><summary>Histórico da seleção · {filtered.length} lançamentos</summary><div className="table-wrap"><table><thead><tr><th>Descrição</th><th>Categoria / subcategoria</th><th>Origem</th><th>Data / vencimento</th><th>Status</th><th>Valor</th></tr></thead><tbody>{filtered.map(expense => <tr key={`${expense.origin}:${str(expense, 'id')}`}><td>{expense.description}<small>{expense.kind}</small></td><td>{categoryLabel(categories, str(expense, 'category_id'), ' / ')}</td><td>{expense.origin}</td><td>{str(expense, 'date').split('-').reverse().join('/')}</td><td>{paymentStatus(expense) === 'cash_confirmed' ? 'Pago na conta' : paymentStatus(expense) === 'invoice_paid' ? 'Fatura quitada' : 'Fatura em aberto'}</td><td>{brl(str(expense, 'amount'))}</td></tr>)}</tbody></table></div>{!filtered.length && <p>Nenhum gasto nesta seleção.</p>}</details>
    <p className="notice">Status do cartão corresponde à fatura. Parcelas de faturas em aberto pertencem ao mês do vencimento; despesas previstas das contas ficam separadas no planejamento.</p>
  </section>;
}
