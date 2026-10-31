'use client';
import {useEffect,type RefObject} from 'react';
import { useInteractiveFinance } from './use-interactive-finance';
/** Presentation only. Content is visible even without animation/observer support. */
export function useContentExperience(ref:RefObject<HTMLElement|null>,enabled:boolean){
 useInteractiveFinance(ref,enabled);
 useEffect(()=>{
  const element=ref.current;if(!element||!enabled)return;
  const root:HTMLElement=element;
  const motion=matchMedia('(prefers-reduced-motion: reduce)'),seen=new WeakSet<Element>();
  const pending=new Set<Element>();
  const animations=new Set<Animation>();let frame=0,disposed=false;
  const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{
   for(const entry of entries){if(!entry.isIntersecting)continue;observer?.unobserve(entry.target);pending.delete(entry.target);if(motion.matches||!entry.target.animate)continue;
    const a=entry.target.animate([{transform:'translateY(6px)'},{transform:'translateY(0)'}],{duration:170,easing:'ease-out'});animations.add(a);a.onfinish=()=>animations.delete(a);
   }
  },{threshold:0,rootMargin:'0px 0px 30px'});
  const tables=new Map<HTMLElement,{tab:string|null;role:string|null;label:string|null;description:string|null}>();
  const resize=new ResizeObserver(()=>schedule());
  function scan(){frame=0;if(disposed)return;
   root.querySelectorAll<HTMLElement>('.table-wrap').forEach(el=>{
    if(!tables.has(el)){tables.set(el,{tab:el.getAttribute('tabindex'),role:el.getAttribute('role'),label:el.getAttribute('aria-label'),description:el.getAttribute('aria-description')});resize.observe(el);}
    const overflow=el.scrollWidth>el.clientWidth+2;el.toggleAttribute('data-table-overflow',overflow);
    const original=tables.get(el)!;
    if(overflow){el.tabIndex=0;el.setAttribute('role',original.role??'region');el.setAttribute('aria-label',original.label??`Tabela · ${el.closest('section')?.querySelector('h2,h3')?.textContent??'Dados financeiros'}`);el.setAttribute('aria-description','Role horizontalmente ou use as setas para consultar todas as colunas.');}
    else for(const [name,value] of [['tabindex',original.tab],['role',original.role],['aria-label',original.label],['aria-description',original.description]] as const){if(value===null)el.removeAttribute(name);else el.setAttribute(name,value);}
   });
   for(const el of tables.keys())if(!root.contains(el)){resize.unobserve(el);tables.delete(el);}
   for(const el of pending)if(!root.contains(el)){observer?.unobserve(el);pending.delete(el);}
   root.querySelectorAll('.panel,.dashboard-section-heading,.stat').forEach(el=>{if(seen.has(el))return;seen.add(el);if(!motion.matches&&observer){pending.add(el);observer.observe(el);}});
  }
  function schedule(){if(!disposed&&!frame)frame=requestAnimationFrame(scan);}
  const mutation=new MutationObserver(records=>{if(records.some(r=>!(r.target instanceof Element?r.target:r.target.parentElement)?.closest('.recharts-wrapper,.recharts-tooltip-wrapper')))schedule();});
  const cancel=()=>{for(const a of animations)a.cancel();animations.clear();};
  const preference=()=>{if(motion.matches){observer?.disconnect();cancel();}};
  mutation.observe(root,{childList:true,subtree:true});resize.observe(root);motion.addEventListener('change',preference);window.addEventListener('beforeprint',cancel);document.fonts.ready.then(schedule);schedule();
  return()=>{disposed=true;cancelAnimationFrame(frame);mutation.disconnect();resize.disconnect();observer?.disconnect();cancel();motion.removeEventListener('change',preference);window.removeEventListener('beforeprint',cancel);};
 },[ref,enabled]);
}
export function ContentSkeleton(){
 return <section className="content-skeleton loading" role="status" aria-label="Carregando seus dados" aria-busy="true"><span className="sr-only">Carregando seus dados…</span><div className="skeleton-summary" aria-hidden="true"><i/><i/><i/></div><div className="skeleton-grid" aria-hidden="true">{Array.from({length:6},(_,i)=><div key={i}><i/><b/><i/></div>)}</div><div className="skeleton-detail" aria-hidden="true"><i/><i/><i/><i/></div></section>;
}
