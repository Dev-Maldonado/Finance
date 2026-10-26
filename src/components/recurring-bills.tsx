'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, CreditCard, Plus, Repeat2, Clock3, X } from 'lucide-react';
import { D } from '@/financial/engine';
import { monthlyCommitments, type MonthlyCommitment } from '@/lib/monthly-commitments';
import { invoiceMonthLabel } from '@/lib/card-invoices';
import { categoryLabel } from '@/lib/categories';
import { rows, str, type Row, type Snapshot } from '@/lib/summary';
import { InvoiceMonthPicker } from './monthly-invoices';
import { CategoryPicker } from './category-picker';
import { post } from './dialog';
import { useReadableAmounts } from './use-readable-amounts';

const brl = (v: string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v));
const pretty = (v: string) => v.split('-').reverse().join('/');
export function RecurringBills({ snapshot, today, onSaved, onNew, onEditTransaction, onRemoveTransaction, onEditInstallment, onEditObligation }: {
  snapshot: Snapshot; today: string; onSaved: () => void;
  onNew: (kind: 'recurring' | 'transaction', month: string) => void;
  onEditTransaction: (row: Row) => void; onRemoveTransaction: (row: Row) => void;
  onEditInstallment: (row: Row) => void; onEditObligation: (row: Row) => void;
}) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [change, setChange] = useState<{ item: MonthlyCommitment; cancel: boolean } | null>(null);
  const [notice, setNotice] = useState('');
  const root = useRef<HTMLDivElement>(null);
  useReadableAmounts(root);
  const changeMonth = (value: string) => { setMonth(value); setNotice(''); };
  const model = useMemo(() => monthlyCommitments(snapshot, month, today), [snapshot, month, today]);
  return <div className="recurring-bills" ref={root}>
    <section className="panel commitments-toolbar" aria-label="Navegação mensal de contas recorrentes">
      <div><span className="eyebrow">SEUS COMPROMISSOS, MÊS A MÊS</span><h2>{invoiceMonthLabel(month)}</h2><p>Somente valores ainda a pagar. Cada compromisso aparece uma única vez.</p></div>
      <InvoiceMonthPicker month={month} today={today} onChange={changeMonth} label="Mês das contas recorrentes" previousLabel="Voltar um mês" />
      <div className="actions"><button onClick={() => onNew('recurring', month)}><Repeat2 size={16} /> Novo gasto fixo</button><button className="primary" onClick={() => onNew('transaction', month)}><Plus size={16} /> Gasto programado</button><Link href="/transacoes">Gerenciar recorrências</Link></div>
    </section>
    {notice && <p className="notice" role="status">{notice}</p>}
    <div className="commitment-totals" aria-label="Resumo de contas recorrentes">
      {([{ key: 'total', label: 'Total previsto a pagar', Icon: CalendarDays, tone: 'tone-pending' }, { key: 'cards', label: 'Parcelas de cartões', Icon: CreditCard, tone: 'tone-expense' }, { key: 'fixed', label: 'Gastos fixos', Icon: Repeat2, tone: 'tone-wealth' }, { key: 'scheduled', label: 'Gastos programados', Icon: Clock3, tone: 'tone-pending' }] as const).map(({ key, label, Icon, tone }) => <article key={key} aria-label={label} className={`financial-surface ${tone}`}><Icon size={19} /><span>{label}</span><strong>{brl(model.totals[key])}</strong></article>)}
    </div>
    <section className="panel" aria-labelledby="commitment-cards-heading"><div className="panel-head"><div><h2 id="commitment-cards-heading">Parcelas de cartões</h2><p>Vencimento da fatura, cartão e parcela vinculados à compra original.</p></div><Link href={`/cartoes?month=${month}`}>Consultar faturas</Link></div>
      {model.invoices.length ? model.invoices.map(invoice => <div className="commitment-invoice" key={invoice.id}>
        <div className="commitment-invoice-head"><div><strong>{invoice.cardName}</strong><small>Vence {pretty(invoice.due)} · {invoice.status}</small></div><div><small>Saldo a pagar da fatura</small><strong>{brl(invoice.pending)}</strong></div></div>
        {D(invoice.paid).gt(0) && <p className="commitment-note">{brl(invoice.paid)} pagos nesta fatura. Valores abaixo são os valores originais das parcelas; o resumo considera apenas o saldo restante, sem distribuir pagamentos arbitrariamente entre compras.</p>}
        {invoice.installments.map(part => <div className="commitment-row" key={part.id}><span className="commitment-icon"><CreditCard size={18} /></span><div className="commitment-copy"><strong>{part.description}</strong><small>{invoice.cardName} · Parcela {part.number} de {part.count} · {pretty(invoice.due)}</small><small>{categoryLabel(rows(snapshot, 'categories'), part.categoryId, ' / ')}</small></div><strong className="commitment-amount">{brl(part.amount)}</strong><div className="actions">{invoice.due > today && D(invoice.paid).eq(0) && !rows(snapshot, 'credit_card_payments').some(p => p.invoice_id === invoice.id) && <button onClick={() => onEditInstallment(rows(snapshot, 'credit_card_installments').find(p => p.id === part.id)!)}>Editar parcela</button>}</div></div>)}
      </div>) : <p className="empty commitment-empty">Nenhuma parcela a pagar neste mês.</p>}
    </section>
    {([{ kind: 'fixed', title: 'Gastos fixos', detail: 'Ocorrências pendentes e previstas, respeitando pausas, término e exclusões.' }, { kind: 'scheduled', title: 'Gastos programados', detail: 'Despesas cadastradas e compromissos agendados com vencimento neste mês.' }] as const).map(group => <section className="panel" key={group.kind} aria-label={group.title}><div className="panel-head"><div><h2>{group.title}</h2><p>{group.detail}</p></div><strong>{brl(model.totals[group.kind])}</strong></div>
      {model.items.filter(i => i.kind === group.kind).map(item => <div className="commitment-row" key={item.id} aria-label={item.description}><span className="commitment-icon">{group.kind === 'fixed' ? <Repeat2 size={18} /> : <Clock3 size={18} />}</span><div className="commitment-copy"><strong>{item.description}</strong><small>{pretty(item.date)} · {item.source}</small><small>{categoryLabel(rows(snapshot, 'categories'), item.categoryId, ' / ')}</small><span className={`badge ${item.date < today ? 'commitment-overdue' : ''}`}>{item.date < today ? 'Vencido · ' : ''}{item.status}</span></div><strong className="commitment-amount">{brl(item.amount)}</strong><div className="actions">
        {item.recurrenceId ? <><button onClick={() => setChange({ item, cancel: false })}>Editar</button><button onClick={() => setChange({ item, cancel: true })}>Excluir</button></> : item.transaction ? <><button onClick={() => onEditTransaction(item.transaction!)}>Editar</button><button onClick={() => onRemoveTransaction(item.transaction!)}>Excluir</button></> : item.obligation ? <button onClick={() => onEditObligation(item.obligation!)}>Editar compromisso</button> : null}
      </div></div>)}
      {!model.items.some(i => i.kind === group.kind) && <p className="empty commitment-empty">Nenhum {group.kind === 'fixed' ? 'gasto fixo' : 'gasto programado'} a pagar neste mês.</p>}
    </section>)}
    <p className="commitment-note">Valores previstos não alteram o saldo disponível. Lançamentos pagos e faturas quitadas deixam esta lista; o histórico permanece nas Transações e nos Cartões. Recorrências futuras são projeções até serem registradas, sempre substituídas pela ocorrência real sem duplicação.</p>
    {change && <OccurrenceChange snapshot={snapshot} item={change.item} cancel={change.cancel} onClose={() => setChange(null)} onSaved={() => { setNotice(change.cancel ? 'Despesa excluída no intervalo escolhido. Histórico anterior preservado.' : 'Despesa atualizada no intervalo escolhido.'); onSaved(); }} />}
  </div>;
}

function OccurrenceChange({ snapshot, item, cancel, onClose, onSaved }: { snapshot: Snapshot; item: MonthlyCommitment; cancel: boolean; onClose: () => void; onSaved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), title = useId(), requestId = useRef(crypto.randomUUID());
  const [scope, setScope] = useState<'occurrence' | 'future'>('occurrence'), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const r = rows(snapshot, 'recurring_transactions').find(r => r.id === item.recurrenceId) ?? {};
  const [category, setCategory] = useState(item.categoryId);
  const [due, setDue] = useState(item.date);
  const movedMonth = item.date.slice(0, 7) !== item.occurrenceDate?.slice(0, 7);
  useEffect(() => { const element = dialog.current!; element.showModal(); return () => element.close(); }, []);
  return <dialog className="dialog commitment-dialog" ref={dialog} aria-labelledby={title} onCancel={e => { if (busy) e.preventDefault(); else onClose(); }}><form onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError(''); const data = new FormData(e.currentTarget);
    try {
      await post('/api/recurring/occurrence', { recurrence_id: item.recurrenceId, occurrence_date: item.occurrenceDate, scope, cancel, request_id: requestId.current,
        replacement: cancel ? undefined : { description: String(data.get('description')), amount: String(data.get('amount')).replace(',', '.'), account_id: String(data.get('account')), category_id: category || null, date: scope === 'future' ? item.occurrenceDate : String(data.get('date')) } });
      onSaved(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível atualizar a despesa.'); } finally { setBusy(false); }
  }}><div className="dialog-head"><div><span className="eyebrow">CONTAS RECORRENTES</span><h2 id={title}>{cancel ? 'Excluir despesa recorrente' : 'Editar despesa recorrente'}</h2></div><button type="button" className="icon-button" aria-label="Fechar" onClick={onClose} disabled={busy}><X /></button></div>
    <p className="commitment-note">{item.description} · {pretty(item.date)} · {brl(item.amount)}</p>
    <fieldset className="commitment-scopes" disabled={busy}><legend>Aplicar alteração em</legend>{([{ value: 'occurrence', label: 'Somente este mês', help: 'Apenas esta ocorrência. As outras datas permanecem iguais.' }, { value: 'future', label: 'Este mês e os próximos', help: movedMonth ? 'Esta ocorrência foi transferida de mês. Ajuste-a isoladamente para preservar os outros meses.' : 'A partir desta ocorrência, incluindo alterações futuras da mesma série. Pagamentos e meses anteriores são preservados.' }] as const).map(o => <label key={o.value} className={scope === o.value ? 'selected' : ''}><input type="radio" name="scope" value={o.value} disabled={o.value === 'future' && movedMonth} checked={scope === o.value} onChange={() => setScope(o.value)} /><span><strong>{o.label}</strong><small>{o.help}</small></span></label>)}</fieldset>
    {!cancel && <div className="form-grid"><label>Descrição<input name="description" aria-label="Descrição" defaultValue={item.description} required maxLength={200} /></label><label>Valor (R$)<input name="amount" aria-label="Valor (R$)" inputMode="decimal" defaultValue={item.amount} required pattern="[0-9]+([.,][0-9]{1,2})?" /></label><label>Vencimento<input type="date" name="date" aria-label="Vencimento" value={scope === 'future' ? item.date : due} onChange={e => setDue(e.target.value)} required readOnly={scope === 'future'} /><small>{scope === 'future' ? 'Mantém a frequência e os vencimentos da série. Selecione somente este mês para corrigir uma data.' : 'Escolha uma data dentro do mês desta ocorrência.'}</small></label><label>Conta<select name="account" aria-label="Conta" defaultValue={str(item.transaction ?? r, 'account_id')} required>{rows(snapshot, 'financial_accounts').filter(a => a.kind !== 'savings' && !a.archived).map(a => <option key={str(a, 'id')} value={str(a, 'id')}>{a.name}</option>)}</select></label><label>Categoria<CategoryPicker categories={rows(snapshot, 'categories')} value={category} onChange={setCategory} /></label></div>}
    {cancel && <p className="notice">A exclusão cancela a ocorrência, sem apagar seu histórico. Meses anteriores e pagamentos efetivos são preservados.</p>}
    {error && <p className="error" role="alert">{error}</p>}<div className="dialog-footer"><button type="button" onClick={onClose} disabled={busy}>Cancelar</button><button className="primary" disabled={busy}>{busy ? 'Salvando…' : cancel ? 'Excluir' : 'Salvar'}</button></div>
  </form></dialog>;
}
