'use client';
import { useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeftRight, CheckCheck, CircleAlert } from 'lucide-react';
import { D, money } from '@/financial/engine';
import { rows, str, type Snapshot, type Row } from '@/lib/summary';
import { cardInvoices, invoiceMonthLabel } from '@/lib/card-invoices';

const brl = (value: string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
const dateLabel = (value: string) => value.split('-').reverse().join('/');
export type ReconciliationAction = 'reconcile_account' | 'reconcile_invoice';
export function ReconciliationPanel({ snapshot, today, onSave }: { snapshot: Snapshot; today: string; onSave: (action: ReconciliationAction, payload: Record<string, unknown>) => Promise<void> }) {
  const [kind, setKind] = useState<'account' | 'invoice'>('account');
  const [selected, setSelected] = useState('');
  const [date, setDate] = useState(today);
  const [official, setOfficial] = useState('');
  const [notes, setNotes] = useState('');
  const [adjust, setAdjust] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const accounts = rows(snapshot, 'financial_accounts').filter(a => a.kind !== 'savings');
  const invoices = useMemo(() => cardInvoices(snapshot, date), [snapshot, date]);
  const items = kind === 'account' ? accounts.map(a => ({ id: str(a, 'id'), label: str(a, 'name') })) : invoices.map(i => ({ id: i.id, label: `${i.cardName} · ${invoiceMonthLabel(i.month)}` }));
  const defaultSelection = kind === 'account' ? items[0]?.id : invoices.find(i => i.month === date.slice(0, 7))?.id ?? invoices.find(i => D(i.pending).gt(0))?.id ?? items[0]?.id;
  const selection = selected && items.some(item => item.id === selected) ? selected : defaultSelection ?? '';
  const account = accounts.find(a => a.id === selection);
  const registered = kind === 'account' && account ? money(rows(snapshot, 'transactions').filter(t => t.account_id === selection && t.status === 'confirmed' && str(t, 'date') <= date).reduce((sum, tx) => sum.plus(str(tx, 'amount')), D(str(account, 'initial_balance') || '0'))) : invoices.find(i => i.id === selection)?.balance ?? '0.00';
  const normalized = official.trim().replace(',', '.');
  const valid = (kind === 'account' ? /^-?\d{1,12}(\.\d{1,2})?$/ : /^\d{1,12}(\.\d{1,2})?$/).test(normalized);
  const difference = valid ? money(D(normalized).minus(registered)) : null;
  const history = [...rows(snapshot, 'account_reconciliations').map<Row>(r => ({ ...r, kind: 'account' })), ...rows(snapshot, 'invoice_reconciliations').map<Row>(r => ({ ...r, kind: 'invoice' }))].sort((a, b) => str(b, 'created_at').localeCompare(str(a, 'created_at'))).slice(0, 12);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(''); setMessage('');
    if (!selection || !valid) { setError('Selecione um registro e informe o valor com até duas casas decimais.'); return; }
    setBusy(true);
    try {
      await onSave(kind === 'account' ? 'reconcile_account' : 'reconcile_invoice', { [kind === 'account' ? 'account_id' : 'invoice_id']: selection, date, confirmed_balance: normalized, notes, ...(kind === 'account' ? { apply_adjustment: adjust && date === today } : {}) });
      setMessage(adjust && kind === 'account' && date === today ? 'Conciliação registrada e ajuste vinculado ao histórico da conta.' : 'Conciliação registrada. Confira as diferenças antes de corrigir os lançamentos.');
      setAdjust(false); setOfficial(''); setNotes('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível registrar a conciliação.'); }
    finally { setBusy(false); }
  };
  return <section className="panel reconciliation-panel" aria-label="Conciliação mensal de banco e cartão">
    <div className="panel-head"><div><h2>Confira com seu banco e cartão</h2><p>Compare o valor oficial com seus registros e acompanhe cada diferença.</p></div><ArrowLeftRight size={20} /></div>
    <div className="period-tabs reconciliation-tabs" role="group" aria-label="Tipo de conciliação">{[['account', 'Conta bancária'], ['invoice', 'Fatura do cartão']].map(([key, label]) => <button key={key} type="button" aria-pressed={kind === key} className={kind === key ? 'selected' : ''} onClick={() => { setKind(key as typeof kind); setSelected(''); setAdjust(false); setOfficial(''); setError(''); setMessage(''); }}>{label}</button>)}</div>
    {items.length ? <form className="reconciliation-form" onSubmit={submit}>
      <label>{kind === 'account' ? 'Conta para conciliar' : 'Fatura para conciliar'}<select value={selection} onChange={e => { setSelected(e.target.value); setOfficial(''); setAdjust(false); }}>{items.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label>Data da conferência<input required type="date" max={today} value={date} onChange={e => { setDate(e.target.value); setAdjust(false); }} /></label>
      <label>{kind === 'account' ? 'Saldo oficial da conta (R$)' : 'Saldo oficial da fatura a pagar (R$)'}<input required type="text" inputMode="decimal" placeholder="Ex.: 1500,00" value={official} onChange={e => setOfficial(e.target.value)} aria-describedby="reconciliation-method" /></label>
      <label>Origem e explicação da diferença<textarea maxLength={1000} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex.: extrato de outubro; falta cadastrar uma tarifa." /></label>
      <div className="reconciliation-preview"><div><span>Registrado até {dateLabel(date)}</span><strong>{brl(registered)}</strong></div><div><span>Diferença · oficial menos registrado</span><strong className={difference && !D(difference).eq(0) ? 'negative' : ''}>{difference === null ? 'Informe o valor oficial' : brl(difference)}</strong></div></div>
      <p id="reconciliation-method" className="planning-note">{kind === 'account' ? 'Saldo inicial + lançamentos confirmados até a data. Uma conciliação histórica registra a diferença para conferência.' : 'Parcelas da fatura − pagamentos realizados até a data. A conciliação registra divergências para corrigir compras ou pagamentos.'}</p>
      {kind === 'account' && date === today && difference !== null && !D(difference).eq(0) && <label className="reconciliation-consent"><input type="checkbox" checked={adjust} onChange={e => setAdjust(e.target.checked)} />Registrar um ajuste de {brl(difference)} na conta hoje, com vínculo à conciliação.</label>}
      {adjust && <p className="planning-alert"><CircleAlert size={15} />Prefira corrigir um lançamento identificado. O ajuste altera o saldo disponível e ficará no histórico.</p>}
      <button className="primary" disabled={busy} type="submit"><CheckCheck size={16} />{busy ? 'Registrando…' : 'Registrar conciliação'}</button>
    </form> : <p className="planning-empty">{kind === 'account' ? 'Cadastre uma conta para comparar com seu extrato.' : 'Cadastre compras no cartão para conferir suas faturas.'} <Link href={kind === 'account' ? '/contas' : '/cartoes'}>Abrir {kind === 'account' ? 'contas' : 'cartões'}</Link></p>}
    {error && <p role="alert" className="planning-alert">{error}</p>}{message && <p role="status" className="planning-success">{message}</p>}
    <div className="reconciliation-history"><h3>Últimas conferências</h3>{history.length ? history.map(record => {
      const invoice = invoices.find(i => i.id === record.invoice_id);
      const name = record.kind === 'account' ? str(accounts.find(a => a.id === record.account_id) ?? {}, 'name') || 'Conta' : invoice ? `${invoice.cardName} · ${invoiceMonthLabel(invoice.month)}` : 'Fatura';
      return <article key={str(record, 'id')}><div><strong>{name}</strong><small>{dateLabel(str(record, 'date'))} · oficial {brl(str(record, 'confirmed_balance'))} · registrado {brl(str(record, 'registered_balance'))}</small>{record.notes && <p>{str(record, 'notes')}</p>}</div><div><b className={D(str(record, 'difference') || '0').eq(0) ? 'positive' : 'negative'}>{D(str(record, 'difference') || '0').eq(0) ? 'Conferido' : brl(str(record, 'difference'))}</b><small>{record.transaction_id ? 'Ajuste registrado' : 'Conferência auditada'}</small></div></article>;
    }) : <p className="planning-note">Faça uma conferência a cada fechamento mensal para manter seus números confiáveis.</p>}</div>
  </section>;
}
