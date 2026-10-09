'use client';
import Link from 'next/link';
import { PiggyBank, ArrowRight, Pencil } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { manualSavingsPosition, manualSavingsHistory } from '@/lib/manual-savings';
import { rows,str,type Snapshot,type Row } from '@/lib/summary';
import { D } from '@/financial/engine';
import { useMobileChart, MobileChartData } from './mobile-chart';
const brl=(v:string)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v));
const pretty=(d:string)=>d.split('-').reverse().join('/');
const pct=(v:string|null)=>v===null?'Sem base percentual':`${D(v).gt(0)?'+':''}${v.replace('.',',')}%`;
export function ManualSavings({snapshot,today,start,end,detail,onOpen}:{snapshot:Snapshot;today:string;start:string;end:string;detail:string|undefined;onOpen:(key:string,initial?:Row)=>void;onSaved:()=>void}) {
 const mobile=useMobileChart();
 const goals=rows(snapshot,'savings_goals').filter(g=>!detail||g.id===detail);
 return <>
  <div className="banner"><PiggyBank size={32}/><div><h2>Um lugar para cada sonho.</h2><p>Você informa o saldo. Seus depósitos e retiradas ficam separados do rendimento.</p></div><button onClick={()=>onOpen('savingsBalance')}>Informar rendimento</button></div>
  <p className="planning-note">Controle manual: nenhuma taxa, projeção ou rendimento automático é aplicado. Rentabilidade acumulada = (saldo atual + retiradas − impostos dos resgates − depósitos) ÷ total depositado. Impostos informados nos resgates reduzem o resultado; use os valores efetivos do extrato.</p>
  <div className="manual-investment-grid">{goals.map(goal=>{
   const p=manualSavingsPosition(snapshot,goal,today),allHistory=manualSavingsHistory(snapshot,goal,today),history=allHistory.filter(h=>h.date<=end);
   const progress=D(str(goal,'target')||'0').gt(0)?Math.max(0,Math.min(100,D(p.balance).div(str(goal,'target')).mul(100).toNumber())):0;
   return <article className="panel manual-investment-card" key={str(goal,'id')} aria-label={`Caixinha ${goal.name}`}>
    <div className="panel-head"><div><h2>{goal.name}</h2><p>{str(goal,'institution')||'Reserva pessoal'} · controle manual</p></div><button className="icon-button" aria-label={`Editar caixinha ${goal.name}`} onClick={()=>onOpen('goalEdit',goal)}><Pencil size={16}/></button></div>
    <dl className="manual-investment-values"><Item label="Total investido" value={brl(p.deposits)}/><Item label="Saldo atual" value={brl(p.balance)}/><Item label="Rendimento acumulado" value={p.profit===null?'Aguardando atualização':brl(p.profit)} color={p.profit===null?'':D(p.profit).lt(0)?'negative':'positive'}/><Item label="Rentabilidade acumulada" value={p.known?pct(p.percent):'Aguardando atualização'} color={p.percent===null?'':D(p.percent).lt(0)?'negative':'positive'}/><Item label="Total retirado" value={brl(p.withdrawals)}/><Item label="Último saldo informado" value={p.latest?pretty(str(p.latest,'date')):p.known?'Histórico confirmado preservado':'Aguardando atualização'}/></dl>
    <div className="progress"><span style={{width:`${progress}%`}}/></div><p className="planning-note">{progress.toFixed(0)}% da meta de {brl(str(goal,'target'))}. O saldo considera movimentações após a última atualização.</p>
    <div className="manual-investment-actions"><button onClick={()=>onOpen('deposit',{goal_id:goal.id,date:today})}>Depositar</button><button onClick={()=>onOpen('withdrawal',{goal_id:goal.id,date:today})}>Retirar</button><button className="primary" onClick={()=>onOpen('savingsBalance',{goal_id:goal.id,date:today})}>Informar rendimento</button></div>
    <details className="manual-investment-history" open={!!detail}><summary>Histórico mensal · {p.updates.length}</summary><div>{p.updates.slice().reverse().map(update=>{
     const h=allHistory.find(h=>h.date===str(update,'date'));
     return <div className="manual-history-row" key={str(update,'id')}><div><strong>{pretty(str(update,'date'))} · {brl(str(update,'balance'))}</strong><span>Rendimento acumulado: {h?.profit===null||!h?'—':brl(h.profit)} · {pct(h?.percent??null)}</span></div><button aria-label={`Corrigir saldo de ${goal.name} em ${pretty(str(update,'date'))}`} onClick={()=>onOpen('savingsBalance',update)}><Pencil size={14}/></button></div>;
    })}{!p.updates.length&&<p className="planning-note">Informe o saldo total para começar seu histórico mensal. Os registros anteriores permanecem preservados.</p>}</div></details>
    {detail&&!!history.length&&<><div className="manual-chart" aria-label="Evolução mensal da caixinha"><ResponsiveContainer width="100%" height="100%"><LineChart data={history.map(h=>({...h,balance:Number(h.balance),profit:h.profit===null?null:Number(h.profit)}))}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="date" tickFormatter={pretty} fontSize={10}/><YAxis width={65} fontSize={10}/><Tooltip trigger={mobile?'click':'hover'} formatter={v=>brl(String(v))} labelFormatter={v=>pretty(String(v))}/><Line dataKey="balance" name="Saldo" stroke="#5b35d5" strokeWidth={3} isAnimationActive={false}/><Line dataKey="profit" name="Rendimento acumulado, sem aportes" stroke="#198667" strokeWidth={2} isAnimationActive={false}/></LineChart></ResponsiveContainer></div><div className="manual-chart-legend"><span><i style={{background:"#5b35d5"}}/>Saldo informado</span><span><i style={{background:"#198667"}}/>Rendimento, sem aportes</span></div><MobileChartData points={history.map(h=>({label:pretty(h.date),values:[{label:'Saldo',value:Number(h.balance)},{label:'Rendimento acumulado',value:h.profit===null?null:Number(h.profit)}]}))}/></>}
    <Link className="text-link" href={detail?'/caixinhas':`/caixinhas/${goal.id}`}>{detail?'Voltar para todas':'Ver evolução mensal'} <ArrowRight size={14}/></Link>
   </article>;
  })}</div>
  {!goals.length&&<div className="panel filtered-empty"><PiggyBank size={30}/><h3>Crie sua primeira caixinha</h3><p>Informe o valor já depositado e atualize o saldo mensalmente.</p><button onClick={()=>onOpen('goal')}>Nova caixinha</button></div>}
  <section className="panel"><div className="panel-head"><div><h2>Depósitos e retiradas</h2><p>Histórico financeiro preservado · período selecionado</p></div></div><div className="table-wrap"><table><thead><tr><th>Caixinha</th><th>Movimento</th><th>Data</th><th>Valor</th></tr></thead><tbody>{rows(snapshot,'savings_movements').filter(m=>(!detail||m.goal_id===detail)&&str(m,'date')>=start&&str(m,'date')<=end).sort((a,b)=>str(b,'date').localeCompare(str(a,'date'))).map(m=><tr key={str(m,'id')}><td>{rows(snapshot,'savings_goals').find(g=>g.id===m.goal_id)?.name}</td><td>{{deposit:'Depósito',withdrawal:'Retirada de principal',withdrawn_yield:'Rendimento retirado',confirmed_yield:'Rendimento confirmado anterior',yield_reversal:'Correção anterior',tax:'Imposto',manual_withdrawal:'Retirada'}[str(m,'type')]||str(m,'type')}</td><td>{pretty(str(m,'date'))}</td><td>{brl(str(m,'amount'))}</td></tr>)}</tbody></table></div></section>
 </>;
}
function Item({label,value,color=''}:{label:string;value:string;color?:string}) {return <div><dt>{label}</dt><dd className={color}>{value}</dd></div>;}
