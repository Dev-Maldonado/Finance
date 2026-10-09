'use client';
import { useState } from 'react';
import { CreditCard, Search, ShoppingBag, CalendarDays } from 'lucide-react';
import { rows, str, type Row, type Snapshot } from '@/lib/summary';
import { categoryLabel } from '@/lib/categories';
import { invoiceMonthLabel } from '@/lib/card-invoices';
import { filteredPurchases, purchaseMetrics, type PurchaseFilters } from '@/lib/purchase-filters';
import { CategoryPicker } from './category-picker';
const brl = (value: string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
const pretty = (value: string) => value.split('-').reverse().join('/');
export function PurchaseHistory({ snapshot, month, today, cardId, onCardChange, onEdit, onRemove }: { snapshot: Snapshot; month: string; today: string; cardId: string; onCardChange: (id: string) => void; onEdit: (row: Row) => void; onRemove: (row: Row) => void }) {
  const [categoryId, setCategory] = useState(''), [search, setSearch] = useState('');
  const [status, setStatus] = useState<PurchaseFilters['status']>('active');
  const [period, setPeriod] = useState<PurchaseFilters['period']>('all');
  const [start, setStart] = useState(today.slice(0, 7) + '-01'), [end, setEnd] = useState(today);
  const purchases = filteredPurchases(snapshot, { cardId, categoryId, status, search, period, month, start, end });
  const metrics = purchaseMetrics(snapshot, purchases, month, today);
  return <section className="panel purchase-history" aria-label="Compras registradas">
    <div className="panel-head"><div><h2>Compras registradas</h2><p>O cartão selecionado é compartilhado com as faturas. Valores integrais das compras ficam separados das parcelas do mês.</p></div><label className="excluded-toggle"><input type="checkbox" checked={status !== 'active'} onChange={e => setStatus(e.target.checked ? 'all' : 'active')} />Mostrar compras excluídas</label></div>
    <div className="transaction-filters purchase-filters" aria-label="Filtrar compras">
      <label>Cartão<select aria-label="Filtrar compras por cartão" value={cardId} onChange={e => onCardChange(e.target.value)}><option value="">Todos os cartões</option>{rows(snapshot, 'credit_cards').map(card => <option key={str(card, 'id')} value={str(card, 'id')}>{card.name}</option>)}</select></label>
      <label>Categoria<CategoryPicker categories={rows(snapshot, 'categories')} label="Filtrar compras por categoria" value={categoryId} onChange={setCategory} filterMode allowUncategorized /></label>
      <label>Período<select aria-label="Período das compras" value={period} onChange={e => setPeriod(e.target.value as PurchaseFilters['period'])}><option value="all">Todas as datas</option><option value="invoice">Parcelas ativas na fatura selecionada</option><option value="custom">Data da compra · personalizado</option></select></label>
      <label>Status<select aria-label="Filtrar compras por status" value={status} onChange={e => setStatus(e.target.value as PurchaseFilters['status'])}><option value="active">Ativas</option><option value="cancelled">Excluídas</option><option value="all">Todos os status</option></select></label>
      <label className="purchase-search">Descrição<span><Search size={15} /><input aria-label="Buscar compras" placeholder="Buscar descrição" value={search} onChange={e => setSearch(e.target.value)} /></span></label>
      <button onClick={() => { onCardChange(''); setCategory(''); setStatus('active'); setSearch(''); setPeriod('all'); }}>Limpar filtros de compras</button>
    </div>
    {period === 'custom' && <div className="purchase-date-range"><label>Data inicial da compra<input type="date" value={start} onChange={e => { if (e.target.value) { setStart(e.target.value); if (e.target.value > end) setEnd(e.target.value); } }} /></label><label>Data final da compra<input type="date" value={end} min={start} onChange={e => { if (e.target.value && e.target.value >= start) setEnd(e.target.value); }} /></label></div>}
    <div className="purchase-summary" aria-label="Resumo das compras filtradas">
      <div><ShoppingBag size={17} /><span>Compras exibidas</span><strong>{metrics.count}</strong><small>{metrics.excluded ? `${metrics.excluded} excluídas · preservadas no histórico` : 'Somente compras ativas'}</small></div>
      <div className="financial-surface tone-expense"><CreditCard size={17} /><span>Total das compras ativas</span><strong>{brl(metrics.total)}</strong><small>Valor integral · não é o gasto mensal</small></div>
      <div className="financial-surface tone-pending"><CalendarDays size={17} /><span>Parcelas das compras filtradas</span><strong>{brl(metrics.monthly)}</strong><small>Vencimento em {invoiceMonthLabel(month)} · sem excluídas</small></div>
    </div>
    {purchases.length ? <div className="table-wrap"><table><thead><tr><th>Descrição / categoria</th><th>Cartão</th><th>Data da compra</th><th>Total</th><th>Parcelas</th><th>Status</th><th className="transaction-actions">Ações</th></tr></thead><tbody>{purchases.map(p => <tr key={str(p, 'id')}><td className="purchase-description"><strong>{p.description}</strong><small>{categoryLabel(rows(snapshot, 'categories'), str(p, 'category_id'), ' / ')}</small></td><td data-label="Cartão">{rows(snapshot, 'credit_cards').find(card => card.id === p.card_id)?.name || 'Cartão não disponível'}</td><td data-label="Data da compra">{pretty(str(p, 'date'))}</td><td data-label="Valor total">{brl(str(p, 'amount'))}</td><td data-label="Parcelas">{p.installments}×</td><td data-label="Status"><span className={`badge ${p.status === 'cancelled' ? 'muted' : ''}`}>{p.status === 'cancelled' ? 'Excluída' : 'Ativa'}</span></td><td className="transaction-actions">{p.status !== 'cancelled' && <div className="actions"><button onClick={() => onEdit(p)}>Editar</button><button onClick={() => onRemove(p)}>Excluir</button></div>}</td></tr>)}</tbody></table></div> : <div className="filtered-empty"><ShoppingBag size={24} /><h3>Nenhuma compra nesta seleção.</h3><p>Ajuste os filtros ou registre uma compra. Os outros cartões continuam preservados.</p></div>}
  </section>;
}
