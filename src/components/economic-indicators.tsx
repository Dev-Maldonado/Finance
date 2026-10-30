'use client';
import { useQuery } from '@tanstack/react-query';
import { useEffect,useRef,useState,type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Landmark,ChartNoAxesCombined,RefreshCw,DollarSign } from 'lucide-react';
import type { EconomicIndicators,EconomicIndicator } from '@/integrations/economic-indicators';
const definitions=[{key:'selic',label:'Taxa Selic',short:'Selic',Icon:Landmark},{key:'ipca',label:'IPCA · acumulado em 12 meses',short:'IPCA · 12 meses',Icon:ChartNoAxesCombined},{key:'usd',label:'Dólar · USD/BRL',short:'Dólar · PTAX',Icon:DollarSign}] as const;
function value(data:EconomicIndicator|undefined,key:string,busy:boolean) {
 if(data?.value===null||data?.value===undefined)return busy?'Consultando…':'Indisponível';
 if(key==='usd')return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:4,maximumFractionDigits:4}).format(Number(data.value));
 return Number(data.value).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+(key==='selic'?'% a.a.':'%');
}
function reference(date:string|null|undefined){return date?date.split('-').reverse().join('/'):'Aguardando fonte oficial';}
export function EconomicIndicatorsCards({dockTarget,compactOnly=false,sourcesHref="#dashboard-economia"}:{dockTarget?:RefObject<HTMLDivElement|null>;compactOnly?:boolean;sourcesHref?:string}={}) {
 const [dock,setDock]=useState<HTMLDivElement|null>(null),force=useRef(false);
 useEffect(()=>{setDock(dockTarget?.current??null);},[dockTarget]);
 useEffect(()=>{if(!dock)return;const root=dock.closest<HTMLElement>('.premium-dashboard');const size=()=>root?.style.setProperty('--economic-dock-height',`${dock.getBoundingClientRect().height}px`);const observer=new ResizeObserver(size);observer.observe(dock);size();return()=>observer.disconnect();},[dock]);
 const query=useQuery<EconomicIndicators>({queryKey:['economic-indicators'],staleTime:3600000,refetchInterval:3600000,retry:1,queryFn:async()=>{const manual=force.current;force.current=false;const response=await fetch(`/api/economic-indicators${manual?'?refresh=1':''}`);if(!response.ok)throw Error('Indicadores indisponíveis');return response.json();}});
 const refresh=()=>{force.current=true;void query.refetch();};
 return <>{!compactOnly&&<section className="economic-indicators" aria-label="Indicadores econômicos oficiais">
  {definitions.map(({key,label,Icon})=>{const data=query.data?.[key],old=data?.stale||(query.isError&&data?.value!==null&&data?.value!==undefined);return <article className="economic-indicator" key={key} aria-label={label}>
   <div><Icon size={18}/><span>{label}</span></div><strong>{value(data,key,query.isFetching)}</strong>
   <small>{data?.reference?`Referência: ${reference(data.reference)}`:data?.error||'Aguardando a fonte oficial'}</small>
   {old&&<small className="economic-stale">Último dado válido · {data?.error||'Consulta temporariamente indisponível'}</small>}
   {key==='usd'&&<small>R$ por US$ 1 · PTAX de venda diária</small>}
   <a href={data?.url||(key==='ipca'?'https://www.ibge.gov.br/explica/inflacao.php':'https://www.bcb.gov.br')} target="_blank" rel="noreferrer">{data?.source??(key==='ipca'?'IBGE':'Banco Central')}{key==='selic'?' · meta Selic':key==='ipca'?' · IPCA nacional':' · PTAX venda'}</a>
  </article>;})}
  <button className="icon-button economic-refresh" aria-label="Atualizar indicadores econômicos" disabled={query.isFetching} onClick={refresh}><RefreshCw size={16} className={query.isFetching?'spinning':''}/></button>
 </section>}{dock&&createPortal(<aside className="dashboard-economic-ticker" aria-label="Resumo fixo dos indicadores econômicos">
  <span className="economic-ticker-title"><Landmark size={14}/>Cenário econômico</span>
  {definitions.map(({key,short})=>{const data=query.data?.[key],old=data?.stale||(query.isError&&data?.value!==null&&data?.value!==undefined);return <div className="economic-ticker-rate" key={key}><span>{short}</span><strong>{value(data,key,query.isFetching)}</strong><small>{old?'Último válido · ':''}{reference(data?.reference)}</small></div>;})}
  <a href={sourcesHref} aria-label="Consultar fontes e detalhes dos indicadores econômicos">Fontes e datas</a><button className="icon-button" aria-label="Atualizar taxas na faixa econômica" disabled={query.isFetching} onClick={refresh}><RefreshCw size={14} className={query.isFetching?'spinning':''}/></button>
 </aside>,dock)}</>;
}
