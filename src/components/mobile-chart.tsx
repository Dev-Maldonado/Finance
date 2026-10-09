"use client";
import { useEffect, useState } from "react";
export function useMobileChart() {
  const [mobile,setMobile] = useState(false);
  useEffect(() => {
    const query=matchMedia("(max-width:1023px), (hover:none) and (pointer:coarse)");
    const update=()=>setMobile(query.matches);update();query.addEventListener("change",update);
    return ()=>query.removeEventListener("change",update);
  },[]);
  return mobile;
}
export function MobileChartData({ points }: { points: { label: string; values: { label: string; value: number | null }[] }[] }) {
  return <details className="mobile-chart-data"><summary>Ver valores do gráfico</summary><p>Toque no gráfico para consultar um ponto ou confira os valores abaixo.</p><ul>{points.map((point,i)=><li key={`${point.label}-${i}`}><strong>{point.label}</strong>{point.values.map(value=><span key={value.label}>{value.label}<b>{value.value===null?'Sem estimativa disponível':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value.value)}</b></span>)}</li>)}</ul></details>;
}
