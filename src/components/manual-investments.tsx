'use client';
import {useState} from 'react';
import {Landmark,Coins,Save} from 'lucide-react';
import {investmentTotals} from '@/lib/investment-totals';
import {D,money} from '@/financial/engine';
import type {Snapshot} from '@/lib/summary';
import {post} from './dialog';
import {emitFinancialFeedback} from './financial-feedback';
const brl=(value:string)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value));
export function ManualInvestments({snapshot,today,onSaved}:{snapshot:Snapshot;today:string;onSaved:()=>void}){
 const values=investmentTotals(snapshot,today);
 const [draft,setDraft]=useState<{equities:string;crypto:string}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const preview=()=>{try{return brl(money(D((draft?.equities??values.equities).replace(',','.')).plus((draft?.crypto??values.crypto).replace(',','.'))));}catch{return 'Confira os valores';}};
 return <section className="panel" aria-label="Investimentos por categoria"><div className="panel-head"><div><h2>Investimentos por categoria</h2><p>Informe quanto possui aplicado. Os valores compõem seu patrimônio.</p></div>{!draft&&<button onClick={()=>{setDraft({equities:values.equities,crypto:values.crypto});setError('');}}>Atualizar valores</button>}</div>
 <div className="stats"><article className="stat financial-surface tone-investment"><span><Landmark size={18}/> Ações e FIIs</span><strong>{brl(values.equities)}</strong></article><article className="stat financial-surface tone-wealth"><span><Coins size={18}/> Criptomoedas</span><strong>{brl(values.crypto)}</strong></article><article className="stat financial-surface tone-investment"><span>Total investido</span><strong>{brl(values.total)}</strong></article></div>
 {values.updatedAt&&<p className="planning-note">Atualizado em {new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(values.updatedAt))}.</p>}
 {!values.consolidated&&<p className="notice">{values.total==='0.00'?'Informe seus valores para começar.':'Valores iniciais consolidados a partir da carteira anterior. Ao salvar, os totais informados substituem essa carteira nos indicadores; o histórico antigo é preservado.'}</p>}
 {draft&&<form onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');try{await post('/api/investment-totals',{equities:draft.equities.replace(',','.'),crypto:draft.crypto.replace(',','.')});setDraft(null);onSaved();emitFinancialFeedback({kind:'success',title:'Patrimônio atualizado',description:'Os valores por categoria foram salvos.'});}catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar.');}finally{setBusy(false);}}}>
 <fieldset disabled={busy} className="form-grid" style={{minWidth:0,border:0,padding:0,margin:0,gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,240px),1fr))"}}><label>Ações e FIIs (R$)<input style={{width:"100%",minWidth:0,maxWidth:"100%"}} aria-label="Ações e FIIs (R$)" inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" required value={draft.equities} onChange={e=>setDraft({...draft,equities:e.target.value})}/></label><label>Criptomoedas (R$)<input style={{width:"100%",minWidth:0,maxWidth:"100%"}} aria-label="Criptomoedas (R$)" inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" required value={draft.crypto} onChange={e=>setDraft({...draft,crypto:e.target.value})}/></label></fieldset>
 <p aria-live="polite">Total informado: <strong>{preview()}</strong></p>{error&&<p role="alert" className="error">{error}</p>}<div className="actions"><button type="button" disabled={busy} onClick={()=>setDraft(null)}>Cancelar</button><button className="primary" disabled={busy}><Save size={16}/>{busy?'Salvando…':'Salvar valores'}</button></div></form>}
 <p className="planning-note">Atualização manual de patrimônio. Alterar estes valores não movimenta contas, receitas, despesas ou Caixinhas. Não há cálculo de rentabilidade por ativo.</p></section>;
}
