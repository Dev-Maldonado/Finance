'use client';
import { X,SlidersHorizontal } from 'lucide-react';
export type ActiveFilter={key:string;label:string;value:string;remove?:()=>void};
export function ActiveFilters({items,onClear,label='Filtros ativos',context}:{items:ActiveFilter[];onClear:()=>void;label?:string;context?:string}) {
 return <div className="active-filter-summary" role="group" aria-label={label}><span className="filter-summary-label"><SlidersHorizontal size={14}/>{context||'Sua seleção'}</span><div className="active-filter-chips">{items.map(item=>item.remove?<button key={item.key} onClick={item.remove} aria-label={`Remover filtro ${item.label}`}><span><small>{item.label}</small>{item.value}</span><X size={12}/></button>:<span className="filter-context-chip" key={item.key}><small>{item.label}</small>{item.value}</span>)}</div>{items.some(i=>i.remove)&&<button className="clear-view-filters" onClick={onClear}>Limpar seleção</button>}</div>;
}
