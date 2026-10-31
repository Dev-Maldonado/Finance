'use client';
import { useEffect,useId,useRef,useState } from 'react';
import { X } from 'lucide-react';
import { rows,str,type Row,type Snapshot } from '@/lib/summary';
import { post } from './dialog';
import { emitFinancialFeedback } from './financial-feedback';
export type SettlementTarget={transaction?:Row;recurrenceId?:string;occurrenceDate?:string;obligation?:Row;description:string;amount:string;due:string;accountId?:string;type:'income'|'expense'};
export function SettlementDialog({snapshot,target,today,onClose,onSaved}:{snapshot:Snapshot;target:SettlementTarget;today:string;onClose:()=>void;onSaved:()=>void}) {
 const ref=useRef<HTMLDialogElement>(null),title=useId(),requestId=useRef(crypto.randomUUID());const [busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const d=ref.current!;d.showModal();return()=>d.close();},[]);
 const receive=target.type==='income',accounts=rows(snapshot,'financial_accounts').filter(a=>['bank','cash'].includes(str(a,'kind'))&&!a.archived);
 const preferred=str(rows(snapshot,'user_settings')[0]??{},'default_account_id');const initial=accounts.some(a=>a.id===target.accountId)?target.accountId:accounts.some(a=>a.id===preferred)?preferred:'';
 return <dialog className="dialog" ref={ref} aria-labelledby={title} onCancel={e=>{if(busy)e.preventDefault();else onClose();}}><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');const f=new FormData(e.currentTarget);try{await post('/api/settlements',{transaction_id:target.transaction?.id??null,recurrence_id:target.transaction?null:target.recurrenceId??null,occurrence_date:target.occurrenceDate??null,obligation_id:target.obligation?.id??null,account_id:f.get('account_id'),settled_on:f.get('settled_on'),request_id:requestId.current});if(ref.current?.open)emitFinancialFeedback({kind:receive?'income':'expense',title:receive?'Recebimento confirmado':'Pagamento confirmado',description:'O vencimento original foi preservado e o saldo será atualizado.'});onSaved();onClose();}catch(e){setError(e instanceof Error?e.message:'Falha ao registrar.');}finally{setBusy(false);}}}>
  <div className="dialog-head"><div><span className="eyebrow">{receive?'CONFIRMAR RECEBIMENTO':'CONFIRMAR PAGAMENTO'}</span><h2 id={title}>{receive?'Receber lançamento':'Pagar conta'}</h2></div><button type="button" className="icon-button" aria-label="Fechar" onClick={onClose} disabled={busy}><X/></button></div>
  <p className="notice"><strong>{target.description}</strong><br/>{new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(target.amount))} · Vencimento: {target.due.split('-').reverse().join('/')}<br/>O vencimento original será preservado. O saldo muda na data efetiva informada.</p>
  <div className="form-grid"><label>Conta<select name="account_id" aria-label="Conta do pagamento ou recebimento" defaultValue={initial} required><option value="">Selecione</option>{accounts.map(a=><option key={str(a,'id')} value={str(a,'id')}>{a.name}</option>)}</select></label><label>{receive?'Data do recebimento':'Data do pagamento'}<input type="date" name="settled_on" aria-label={receive?'Data do recebimento':'Data do pagamento'} defaultValue={today} max={today} required/></label></div>
  {!accounts.length&&<p className="error">Cadastre uma conta ativa antes de registrar o pagamento.</p>}{error&&<p className="error" role="alert">{error}</p>}<div className="dialog-footer"><button type="button" onClick={onClose} disabled={busy}>Cancelar</button><button className="primary" disabled={busy||!accounts.length}>{busy?'Registrando…':receive?'Confirmar recebimento':'Confirmar pagamento'}</button></div>
 </form></dialog>;
}
