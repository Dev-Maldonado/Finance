'use client';
import Link from 'next/link';
import {CalendarDays,Repeat2,ArrowRight} from 'lucide-react';
import {monthlyCommitments} from '@/lib/monthly-commitments';
import {rows,str,type Snapshot} from '@/lib/summary';
import type {SettlementTarget} from './settlement-dialog';
/** Reuses the same occurrence identities and settlement actions as Contas a pagar. */
export function HomeAgenda({snapshot,start,end,today,onSettle}:{snapshot:Snapshot;start:string;end:string;today:string;onSettle:(target:SettlementTarget)=>void}){
 const model=monthlyCommitments(snapshot,start.slice(0,7),today,{start,end});
 const brl=(v:string)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v));
 return <section className="panel home-agenda" aria-label="Contas previstas do período"><div className="panel-head"><div><h2>Próximas contas e vencimentos</h2><p>Gastos fixos e programados ainda a pagar no período. Faturas estão no resumo de cartões.</p></div><Link href="/movimentacoes/compromissos">Ver todas <ArrowRight size={15}/></Link></div>{model.items.length?model.items.slice(0,5).map(item=><div className="home-agenda-row" key={item.id}><span className="home-agenda-icon">{item.kind==='fixed'?<Repeat2 size={17}/>:<CalendarDays size={17}/>}</span><div><strong>{item.description}</strong><small>{item.date.split('-').reverse().join('/')} · {item.source}</small><span className={`badge ${item.date<today?'amber':''}`}>{item.date<today?'Em atraso':item.status}</span></div><b>{brl(item.amount)}</b><button onClick={()=>onSettle({transaction:item.transaction,recurrenceId:item.recurrenceId,occurrenceDate:item.occurrenceDate,obligation:item.obligation,description:item.description,amount:item.amount,due:item.date,accountId:str(item.transaction??rows(snapshot,'recurring_transactions').find(r=>r.id===item.recurrenceId)??{},'account_id'),type:'expense'})}>Pagar</button></div>):<p className="dashboard-empty">Nenhum gasto fixo ou programado a pagar neste período.</p>}{model.items.length>5&&<p className="dashboard-note">Mostrando os 5 primeiros de {model.items.length} compromissos do período. Consulte todos em Movimentações → Contas a pagar.</p>}</section>;
}
