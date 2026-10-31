'use client';
import {useEffect} from 'react';

/** Measures only interface geometry. Financial state and records never enter here. */
export function useViewportLayout(){
 useEffect(()=>{
  const root=document.documentElement,viewport=window.visualViewport;
  const observed=new Set<Element>();let frame=0,focusFrame=0,disposed=false,reveal=false;
  const set=(node:HTMLElement,name:string,value:number)=>{
   const text=`${Math.ceil(value)}px`;
   if(node.style.getPropertyValue(name)!==text)node.style.setProperty(name,text);
  };
  const visible=(node:Element|null):node is HTMLElement=>node instanceof HTMLElement&&node.getBoundingClientRect().width>0&&getComputedStyle(node).visibility!=='hidden';
  function revealField(){
   focusFrame=0;const field=document.activeElement;
   if(!(field instanceof HTMLElement))return;
   const dialog=field.closest<HTMLDialogElement>('dialog[open]');if(!dialog)return;
   const box=dialog.getBoundingClientRect(),item=field.getBoundingClientRect();
   const footer=dialog.querySelector<HTMLElement>('.dialog-footer');
   const pinned=footer&&getComputedStyle(footer).position==='sticky'&&!footer.contains(field);
   const top=Math.max(box.top,viewport?.offsetTop??0)+12;
   const bottom=Math.min(box.bottom,(viewport?.offsetTop??0)+(viewport?.height??innerHeight),pinned?footer.getBoundingClientRect().top:Infinity)-12;
   if(item.top<top)dialog.scrollTop+=item.top-top;
   else if(item.bottom>bottom)dialog.scrollTop+=item.height>bottom-top?item.top-top:item.bottom-bottom;
  }
  function layout(){
   frame=0;if(disposed)return;
   const height=viewport?.height??innerHeight,offset=viewport?.offsetTop??0;
   const header=document.querySelector('.mobile-app-header'),nav=document.querySelector('.mobile-bottom-nav');
   const notices=document.querySelector<HTMLElement>('.mobile-app-notices');
   const headerHeight=visible(header)?header.getBoundingClientRect().height:0;
   const navHeight=visible(nav)?nav.getBoundingClientRect().height:0;
   const minimumReading=Math.min(240,height*.45);
   const noticeHeight=visible(notices)?notices.getBoundingClientRect().height:0;
   // Tall banners move into normal flow before the page instead of covering it.
   const noticeFlow=noticeHeight>0&&headerHeight+navHeight+noticeHeight+20+minimumReading>height;
   notices?.toggleAttribute('data-layout-flow',noticeFlow);
   const pinnedNotices=noticeHeight>0&&visible(notices)&&getComputedStyle(notices).position==='fixed';
   const bottom=Math.max(navHeight,pinnedNotices?height+offset-notices.getBoundingClientRect().top:0);
   set(root,'--app-header-height',headerHeight);set(root,'--app-bottom-space',bottom);
   set(root,'--app-scroll-bottom',bottom+16);
   let dockHeight=0;
   for(const dock of document.querySelectorAll<HTMLElement>('.dashboard-economic-dock')){
    const size=dock.getBoundingClientRect().height;
    const flow=height-headerHeight-bottom-size<minimumReading||root.dataset.keyboardOpen==='true';
    dock.toggleAttribute('data-layout-flow',flow);
    if(!flow&&getComputedStyle(dock).position==='sticky')dockHeight=Math.max(dockHeight,size+12);
   }
   set(root,'--app-scroll-top',headerHeight+dockHeight+12);
   const sidebar=document.querySelector<HTMLElement>('.workspace>.sidebar');
   sidebar?.toggleAttribute('data-layout-flow',visible(sidebar)&&sidebar.getBoundingClientRect().height>height+1);
   for(const dialog of document.querySelectorAll<HTMLDialogElement>('dialog[open]')){
    const footer=dialog.querySelector<HTMLElement>('.dialog-footer');
    const actions=footer?.getBoundingClientRect().height??0;
    const flow=actions>Math.max(88,height*.25);
    dialog.toggleAttribute('data-actions-flow',flow);
    set(dialog,'--dialog-actions-height',flow?0:actions);
   }
   const nodes=new Set(document.querySelectorAll('.mobile-app-header,.mobile-bottom-nav,.mobile-app-notices,.dashboard-economic-dock,.workspace>.sidebar,dialog[open],dialog[open] .dialog-footer'));
   for(const node of observed)if(!nodes.has(node)){resize.unobserve(node);observed.delete(node);}
   for(const node of nodes)if(!observed.has(node)){observed.add(node);resize.observe(node);}
   if(reveal){reveal=false;cancelAnimationFrame(focusFrame);focusFrame=requestAnimationFrame(revealField);}
  }
  function schedule(){if(!disposed&&!frame)frame=requestAnimationFrame(layout);}
  const focus=()=>{reveal=true;schedule();};
  const resize=new ResizeObserver(schedule);
  const mutation=new MutationObserver(records=>{
   if(records.some(r=>!(r.target instanceof Element?r.target:r.target.parentElement)?.closest('.recharts-wrapper,.recharts-tooltip-wrapper')))schedule();
  });
  mutation.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
  window.addEventListener('resize',focus);window.addEventListener('orientationchange',focus);
  viewport?.addEventListener('resize',focus);viewport?.addEventListener('scroll',focus);
  document.addEventListener('focusin',focus);document.fonts.ready.then(schedule);schedule();
  return()=>{disposed=true;cancelAnimationFrame(frame);cancelAnimationFrame(focusFrame);resize.disconnect();mutation.disconnect();window.removeEventListener('resize',focus);window.removeEventListener('orientationchange',focus);viewport?.removeEventListener('resize',focus);viewport?.removeEventListener('scroll',focus);document.removeEventListener('focusin',focus);};
 },[]);
}
