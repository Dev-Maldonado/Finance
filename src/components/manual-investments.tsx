"use client";
import { useMobileChart } from "./mobile-chart";
import { useState, useRef, useEffect } from 'react';
import { Plus, Pencil, Trash2, ArrowUpRight, ArrowDownRight, Coins, Layers, X } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { D } from '@/financial/engine';
import { manualPortfolio } from '@/lib/manual-investments';
import { str, type Row, type Snapshot } from '@/lib/summary';
import { Dialog, post } from './dialog';
import type { FormDef } from './forms';
const brl = (v: string) => new Intl.NumberFormat('pt-BR',{ style:'currency',currency:'BRL' }).format(Number(v));
const quantity = (v: string) => D(v).toFixed(8).replace(/\.?0+$/,'').replace('.',',');
const percent = (v: string | null) => v === null ? '—' : `${D(v).gt(0)?'+':''}${v.replace('.',',')}%`;
const date = (v: string) => v.split('-').reverse().join('/');
const kindOptions: [string,string][] = [['fund','Fundo de investimento'],['crypto','Criptomoeda']];
const buyFields: FormDef['fields'] = [{key:'quantity',label:'Quantidade adquirida',type:'decimal'},{key:'amount',label:'Valor total investido (R$)',type:'decimal'},{key:'date',label:'Data da compra',type:'date'}];
const assetFields: FormDef['fields'] = [{key:'name',label:'Nome do investimento'},{key:'manual_kind',label:'Tipo',options:kindOptions}];
export function ManualInvestments({ snapshot, today, onSaved }: { snapshot: Snapshot; today:string;onSaved:()=>void }) {
  const model = manualPortfolio(snapshot,today);
  const [modal,setModal] = useState<{form:FormDef;initial?:Row}|null>(null);
  const [remove,setRemove] = useState<{row:Row;kind:'purchase'|'price';name:string}|null>(null);
  const openBuy = (asset:Row,row?:Row) => setModal({ form:{title:'Adicionar compra',editTitle:'Editar compra',endpoint:`/api/manual-investments/purchase?asset_id=${asset.id}`,fields:buyFields},initial:row });
  const openPrice = (asset:Row,row?:Row) => setModal({ form:{title:'Atualizar valor da unidade',editTitle:'Corrigir atualização mensal',endpoint:`/api/manual-investments/price?asset_id=${asset.id}`,fields:[{key:'price',label:'Valor atual por unidade ou cota (R$)',type:'decimal',help:'Uma atualização por mês. Informar novamente no mesmo mês corrige o registro anterior; zero indica perda total.'},{key:'date',label:'Data da atualização',type:'date'}]},initial:row });
  const openAsset = (asset:Row) => setModal({form:{title:'Editar investimento',editTitle:'Editar investimento',endpoint:'/api/manual-investments/asset',fields:assetFields},initial:asset});
  const partial = model.pending > 0;
  const displayCurrent = model.priced ? brl(model.current) : model.positions.some(p=>D(p.pos.quantity).gt(0)) ? 'Aguardando atualização' : brl('0');
  const mobileChart = useMobileChart();
  return <div className="manual-investments">
    <div className="manual-investments-intro"><div><h2>Seus investimentos, sem complicação.</h2><p>Registre as compras e informe o preço da unidade uma vez por mês.</p></div><button className="primary" onClick={()=>setModal({form:{title:'Novo investimento',endpoint:'/api/manual-investments/create',fields:[...assetFields,...buyFields]}})}><Plus size={17}/>Novo investimento</button></div>
    <div className="manual-investment-stats">
      <Metric label="Total investido" value={brl(model.invested)} tone="investment" detail="Capital aplicado na posição atual"/>
      <Metric label="Patrimônio atual" value={displayCurrent} tone="wealth" detail={partial?`${model.pending} investimento(s) aguardando atualização`:'Quantidade × último preço informado'}/>
      <Metric label="Lucro / prejuízo" value={model.priced?brl(model.profit):'—'} tone={model.priced?(D(model.profit).lt(0)?'expense':'income'):'neutral'} detail={partial?'Somente investimentos com preço informado':'Patrimônio menos capital aplicado'}/>
      <Metric label="Rentabilidade acumulada" value={percent(model.percent)} tone={model.priced?(D(model.profit).lt(0)?'expense':'income'):'neutral'} detail={partial?'Base: capital dos investimentos atualizados':'Lucro / prejuízo sobre o total investido'}/>
    </div>
    <p className="planning-note">Controle manual em reais. As compras registradas aqui não movimentam o saldo das contas. Aportes são capital investido; não são lucro.</p>
    {!model.positions.length && <div className="panel filtered-empty"><Coins size={30}/><h3>Seu primeiro investimento começa aqui.</h3><p>Cadastre um fundo ou uma criptomoeda com a quantidade e o valor total da compra.</p></div>}
    {(['fund','crypto'] as const).map(kind=>{
      const group=model.positions.filter(p=>p.kind===kind);
      if(!group.length)return null;
      return <section className="manual-investment-group" key={kind} aria-label={kind==='fund'?'Fundos de investimento':'Criptomoedas'}>
        <h2>{kind==='fund'?<Layers size={19}/>:<Coins size={19}/>} {kind==='fund'?'Fundos de investimento':'Criptomoedas'}</h2>
        <div className="manual-investment-grid">{group.map(p=>{
          const currency = str(p.asset,'currency') || 'BRL', supported = currency==='BRL';
          const format = (v:string)=>supported?brl(v):`${quantity(v)} ${currency}`;
          return <article className="panel manual-investment-card" key={str(p.asset,'id')} aria-label={`Investimento ${p.asset.name}`}>
            <div className="panel-head"><div><h3>{p.asset.name}</h3><p>{kindOptions.find(([id])=>id===p.kind)?.[1]||'Investimento'}</p></div><button className="icon-button" aria-label={`Editar investimento ${p.asset.name}`} onClick={()=>openAsset(p.asset)}><Pencil size={16}/></button></div>
            <dl className="manual-investment-values"><Item label="Quantidade" text={quantity(p.pos.quantity)}/><Item label="Preço médio" text={format(p.pos.average)}/><Item label="Total investido" text={format(p.pos.cost)}/><Item label="Valor atual por unidade" text={p.latest?format(str(p.latest,'price')):'Aguardando atualização'}/><Item label="Patrimônio atual" text={p.current===null?'Aguardando atualização':format(p.current)}/><Item label="Lucro / prejuízo" text={p.profit===null?'—':format(p.profit)} color={p.profit===null?'manual-muted':D(p.profit).lt(0)?'negative':'positive'}/></dl>
            <div className="manual-investment-return"><strong className={p.percent===null?'manual-muted':D(p.percent).lt(0)?'negative':'positive'}>{p.percent!==null&&(D(p.percent).lt(0)?<ArrowDownRight size={16}/>:<ArrowUpRight size={16}/>)}{percent(p.percent)}</strong><span>{p.latest?`Preço informado em ${date(str(p.latest,'date'))}`:'Aguardando atualização'}</span></div>
            {p.updates.length>1&&<p className="planning-note">Variação por unidade desde a atualização anterior: {percent(p.variation)}. Novas compras não entram nesse percentual.</p>}
            {!supported&&<p className="notice">Registro anterior em {currency} preservado. Não entra nos totais em reais.</p>}
            {supported&&<div className="manual-investment-actions"><button onClick={()=>openBuy(p.asset)}><Plus size={15}/>Adicionar compra</button><button onClick={()=>openPrice(p.asset)}>Atualizar valor</button></div>}
            <details className="manual-investment-history"><summary>Histórico de compras · {p.purchases.length}</summary><div>{p.purchases.slice().sort((a,b)=>str(b,'date').localeCompare(str(a,'date'))).map(buy=><div className="manual-history-row" key={str(buy,'id')}><div><strong>{date(str(buy,'date'))}</strong><span>{quantity(str(buy,'quantity'))} unidades · {format(str(buy,'amount'))}</span></div>{supported&&<div className="actions"><button aria-label={`Editar compra de ${p.asset.name} em ${date(str(buy,'date'))}`} onClick={()=>openBuy(p.asset,buy)}><Pencil size={14}/></button><button aria-label={`Excluir compra de ${p.asset.name} em ${date(str(buy,'date'))}`} onClick={()=>setRemove({row:buy,kind:'purchase',name:str(p.asset,'name')})}><Trash2 size={14}/></button></div>}</div>)}{!p.purchases.length&&<p className="planning-note">Nenhuma compra ativa.</p>}</div></details>
            {!!p.updates.length&&<details className="manual-investment-history"><summary>Atualizações mensais · {p.updates.length}</summary><div>{p.updates.slice().reverse().map(update=><div className="manual-history-row" key={str(update,'id')}><div><strong>{str(update,'date').slice(0,7).split('-').reverse().join('/')}</strong><span>{format(str(update,'price'))} por unidade · {date(str(update,'date'))}</span></div>{supported&&<div className="actions"><button aria-label={`Corrigir atualização de ${p.asset.name} em ${str(update,'date').slice(0,7)}`} onClick={()=>openPrice(p.asset,update)}><Pencil size={14}/></button><button aria-label={`Excluir atualização de ${p.asset.name} em ${str(update,'date').slice(0,7)}`} onClick={()=>setRemove({row:update,kind:'price',name:str(p.asset,'name')})}><Trash2 size={14}/></button></div>}</div>)}</div></details>}
          </article>;
        })}</div>
      </section>;
    })}
    {!!model.history.length&&<section className="panel" aria-label="Histórico mensal dos investimentos"><div className="panel-head"><div><h2>Evolução mensal</h2><p>Compare o patrimônio com o capital aplicado. A diferença é o lucro ou prejuízo, sem tratar aportes como ganhos.</p></div></div><div className="manual-chart" aria-label="Gráfico mensal de patrimônio e total investido"><ResponsiveContainer width="100%" height="100%"><LineChart data={model.history.map(h=>({month:h.month,invested:Number(h.invested),current:h.current===null?null:Number(h.current)}))}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="month" tickFormatter={m=>m.split('-').reverse().join('/')}/><YAxis width={65} tickFormatter={n=>new Intl.NumberFormat('pt-BR',{notation:'compact'}).format(n)}/><Tooltip trigger={mobileChart ? "click" : "hover"} formatter={(v)=>brl(String(v))} labelFormatter={m=>String(m).split('-').reverse().join('/')}/><Line type="monotone" dataKey="invested" name="Total investido" stroke="#a49bba" strokeWidth={2}/><Line type="monotone" dataKey="current" name="Patrimônio" stroke="#5b35d5" strokeWidth={3} connectNulls={false}/></LineChart></ResponsiveContainer></div><div className="manual-chart-legend"><span><i style={{background:'#a49bba'}}/>Total investido</span><span><i style={{background:'#5b35d5'}}/>Patrimônio</span></div><div className="manual-months">{model.history.map(h=><div key={h.month}><strong>{h.month.split('-').reverse().join('/')}</strong><span>Aplicado: {brl(h.invested)}</span><span>Patrimônio: {h.current===null?'Aguardando atualização':brl(h.current)}</span><span className={h.profit!==null&&D(h.profit).lt(0)?'negative':'positive'}>Lucro/prejuízo: {h.profit===null?'—':brl(h.profit)}</span></div>)}</div></section>}
    {modal&&<Dialog form={modal.form} initial={modal.initial} snapshot={snapshot} onClose={()=>setModal(null)} onSaved={onSaved}/>}
    {remove&&<RemoveManual {...remove} onClose={()=>setRemove(null)} onSaved={onSaved}/>}
  </div>;
}
function Item({label,text,color=''}:{label:string;text:string;color?:string}){return <div><dt>{label}</dt><dd className={color}>{text}</dd></div>;}
function Metric({label,value,tone,detail}:{label:string;value:string;tone:string;detail:string}){return <article className={`stat financial-surface tone-${tone}`} aria-label={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;}
function RemoveManual({row,kind,name,onClose,onSaved}:{row:Row;kind:'purchase'|'price';name:string;onClose:()=>void;onSaved:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),key=useRef(crypto.randomUUID());const[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const d=ref.current!;d.showModal();return()=>d.close();},[]);
 return <dialog ref={ref} className="dialog" aria-label={kind==='purchase'?'Excluir compra':'Excluir atualização'} onCancel={e=>{if(busy)e.preventDefault();else onClose();}}><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await post(`/api/manual-investments/${kind}-delete`,{id:row.id,request_id:key.current});onSaved();onClose();}catch(error){setError(error instanceof Error?error.message:'Falha ao excluir');}finally{setBusy(false);}}}><div className="dialog-head"><h2>{kind==='purchase'?'Excluir compra':'Excluir atualização'}</h2><button type="button" className="icon-button" aria-label="Fechar" disabled={busy} onClick={onClose}><X/></button></div><p>{name} · {date(str(row,'date'))}</p><p className="notice">{kind==='purchase'?'A compra sai dos cálculos do investimento. O registro anterior permanece no histórico de correções.':'O valor informado neste mês será removido. O histórico da correção será preservado.'} O saldo das contas não será alterado.</p>{error&&<p role="alert" className="error">{error}</p>}<div className="dialog-actions"><button type="button" disabled={busy} onClick={onClose}>Cancelar</button><button className="primary" disabled={busy}>{busy?'Excluindo…':'Excluir'}</button></div></form></dialog>;
}
