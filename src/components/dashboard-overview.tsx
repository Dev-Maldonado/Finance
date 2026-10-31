'use client';
import { useChartMotion } from './use-motion-preference';
import { ResponsiveContainer, ComposedChart, Bar, Line, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Wallet } from 'lucide-react';
import { useMobileChart, MobileChartData } from './mobile-chart';
const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
export function DashboardWalletArt() {
  return <div className="dashboard-wallet-art" aria-hidden="true"><span className="wallet-halo"/><span className="wallet-card wallet-card-back"/><span className="wallet-card wallet-card-middle"/><span className="wallet-cover"><Wallet size={60} strokeWidth={1.3}/><i/></span></div>;
}
export function OverviewResultChart({ data }: { data: { month: string; income: string; expenses: string; net: string }[] }) {
  const touch = useMobileChart();
  const chartMotion = useChartMotion();
  const points = data.map(p => ({ name: new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' }).format(new Date(`${p.month}-01T12:00:00Z`)), income: Number(p.income), expenses: Number(p.expenses), net: Number(p.net) }));
  return <div className="overview-result-chart"><div className="overview-chart-legend"><span><i/>Receitas</span><span><i/>Despesas</span><span><i/>Resultado</span></div><div className="overview-result-plot" aria-label="Resumo dos resultados dos últimos seis meses"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={points} margin={{ top: 12, right: 12, bottom: 0, left: 4 }}><CartesianGrid vertical={false} stroke="#edf0f7"/><XAxis dataKey="name" tick={{fontSize:9,fill:'#73788a'}} axisLine={false} tickLine={false}/><YAxis hide domain={['auto','auto']}/><Tooltip isAnimationActive={false} trigger={touch?'click':'hover'} formatter={v=>brl(Number(v))} contentStyle={{borderRadius:12,border:'1px solid #e7e2f2',fontSize:11}}/><Bar {...chartMotion} dataKey="income" name="Receitas" fill="#13a582" radius={[3,3,0,0]}/><Bar {...chartMotion} dataKey="expenses" name="Despesas" fill="#eb647e" radius={[3,3,0,0]}/><Line type="monotone" dataKey="net" name="Resultado" stroke="#6335df" strokeWidth={2} dot={{r:2}} {...chartMotion}/></ComposedChart></ResponsiveContainer></div><small className="overview-chart-caption">Últimos seis meses · até o período selecionado</small><MobileChartData points={points.map(p=>({label:p.name,values:[{label:'Receitas',value:p.income},{label:'Despesas',value:p.expenses},{label:'Resultado',value:p.net}]}))}/></div>;
}
export function OverviewComposition({ income, expenses, net }: { income: string; expenses: string; net: string }) {
  // Presentation only: all three amounts come from the existing period model.
  const values = [{ name:'Receitas', value:Number(income), color:'#13a582' }, { name:'Despesas', value:Number(expenses), color:'#eb647e' }, { name:'Resultado', value:Number(net), color:Number(net)<0?'#eb647e':'#6335df' }];
  const maximum = Math.max(...values.map(p=>Math.abs(p.value)), 1);
  return <article className="overview-composition" aria-label="Receitas versus despesas do período"><h3>Receitas vs. despesas</h3>{values.map(p=><div key={p.name}><span><i style={{background:p.color}}/>{p.name}</span><span className="overview-composition-track" aria-hidden="true"><i style={{width:`${Math.abs(p.value)/maximum*100}%`,background:p.color}}/></span><b className={p.value<0?'negative':''}>{brl(p.value)}</b></div>)}<small>Resultado inclui rendimentos recebidos.</small></article>;
}
