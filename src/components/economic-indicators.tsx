'use client';
import { useQuery } from '@tanstack/react-query';
import { Landmark, ChartNoAxesCombined, RefreshCw } from 'lucide-react';
import type { EconomicIndicators, EconomicIndicator } from '@/integrations/economic-indicators';
export function EconomicIndicatorsCards() {
 const query=useQuery<EconomicIndicators>({queryKey:['economic-indicators'],staleTime:3600000,refetchInterval:3600000,retry:1,queryFn:async()=>{const response=await fetch('/api/economic-indicators');if(!response.ok)throw Error('Indicadores indisponíveis');return response.json();}});
 return <section className="economic-indicators" aria-label="Indicadores econômicos oficiais">
  <Indicator label="Taxa Selic" suffix="% ao ano" icon={Landmark} data={query.data?.selic} busy={query.isFetching} failed={query.isError}/>
  <Indicator label="IPCA · acumulado em 12 meses" suffix="%" icon={ChartNoAxesCombined} data={query.data?.ipca} busy={query.isFetching} failed={query.isError}/>
  <button className="icon-button economic-refresh" aria-label="Atualizar indicadores econômicos" disabled={query.isFetching} onClick={()=>void query.refetch()}><RefreshCw size={16} className={query.isFetching?'spinning':''}/></button>
 </section>;
}
function Indicator({label,suffix,icon:Icon,data,busy,failed}:{label:string;suffix:string;icon:typeof Landmark;data?:EconomicIndicator;busy:boolean;failed:boolean}) {
 const reference=data?.reference?.split('-').reverse().join('/');
 return <article className="economic-indicator"><div><Icon size={18}/><span>{label}</span></div><strong>{failed?'Indisponível':data?.value!==null&&data?.value!==undefined?<>{Number(data.value).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%{suffix.includes('ao ano')&&<span>ao ano</span>}</>:busy?'Consultando…':'Indisponível'}</strong><small>{failed?'Falha na consulta. Tente atualizar.':reference?`Referência: ${reference}`:data?.error||'Aguardando a fonte oficial'}</small><a href={data?.url||(label==='Taxa Selic'?'https://www.bcb.gov.br/controleinflacao/taxaselic':'https://www.ibge.gov.br/explica/inflacao.php')} target="_blank" rel="noreferrer">{label==='Taxa Selic'?'Banco Central · meta Selic':'IBGE · IPCA nacional'}</a></article>;
}
