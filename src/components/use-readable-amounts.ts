'use client';
import { useEffect, type RefObject } from 'react';

/** Fits displayed currency to its allocated width, without changing its text or value. */
export function useReadableAmounts(ref: RefObject<HTMLDivElement | null>, excludeWithin?:string, enabled=true) {
  useEffect(() => {
    const root = ref.current;
    if (!root||!enabled) return;
    let frame = 0;
    let disposed = false;
    let resetLayout=true,lastWidth=0;
    const fit = () => {
      frame = 0;
      if (disposed) return;
      const width=root.getBoundingClientRect().width;
      if(width>lastWidth+1)resetLayout=true;lastWidth=width;
      if(resetLayout){root.querySelectorAll('[data-amount-expanded]').forEach(el=>{if(!excludeWithin||!el.closest(excludeWithin))el.removeAttribute('data-amount-expanded');});resetLayout=false;}
      const amounts = [...root.querySelectorAll<HTMLElement>('strong, b, dd')].filter(el => {
        if(excludeWithin&&el.closest(excludeWithin))return false;
        if (/^[-+−]?\s*R\$\s*[\d.,]+$/.test(el.textContent?.trim() ?? '')) return true;
        // React can reuse an amount node for a loading or insufficient-history label.
        if (el.classList.contains('dashboard-amount')) {
          el.classList.remove('dashboard-amount', 'long-currency', 'currency-negative');
          el.style.removeProperty('font-size');
        }
        return false;
      });
      for (const el of amounts) {
        el.classList.add('dashboard-amount');
        const text = el.textContent?.trim() ?? '';
        el.classList.toggle('currency-negative', /^[-−]/.test(text) && /[1-9]/.test(text));
        el.classList.toggle('long-currency', (el.textContent?.trim().length ?? 0) > 17);
        el.style.removeProperty('font-size');
      }
      let expanded=false;
      // Read only after all presentation classes are applied, so wide-value layouts settle together.
      for (const el of amounts) {
        const style = getComputedStyle(el);
        const range = document.createRange();
        range.selectNodeContents(el);
        const measured = range.getBoundingClientRect().width;
        const available = Math.min(el.getBoundingClientRect().width, el.parentElement?.clientWidth ?? Infinity);
        if(available>0&&measured>available){
          const fitted=Math.floor(parseFloat(style.fontSize)*(available-4)/measured*10)/10;
          const card=el.closest('.dashboard-metric,.stat,.manual-investment-values>div,.forecast-totals>div,.invoice-totals>div,.report-grid>div');
          if(fitted<16&&card&&!card.hasAttribute('data-amount-expanded')){card.setAttribute('data-amount-expanded','');expanded=true;}
          else el.style.fontSize=`${fitted}px`;
        }
      }
      if(expanded)schedule();
    };
    const schedule = () => { if (!disposed && !frame) frame = requestAnimationFrame(fit); };
    const resize = new ResizeObserver(schedule);
    resize.observe(root);
    const mutation = new MutationObserver(records => {
      // Chart tooltips change on every pointer move; they do not resize dashboard amounts.
      if (records.some(record => {
        const element = record.target instanceof Element ? record.target : record.target.parentElement;
        return !element?.closest('.recharts-wrapper, .recharts-tooltip-wrapper')&&!(excludeWithin&&element?.closest(excludeWithin));
      })){resetLayout=true;schedule();}
    });
    mutation.observe(root, { subtree: true, childList: true, characterData: true });
    window.addEventListener('resize', schedule);
    void document.fonts.ready.then(schedule);
    schedule();
    return () => { disposed = true; cancelAnimationFrame(frame); resize.disconnect(); mutation.disconnect(); window.removeEventListener('resize', schedule); };
  }, [ref,excludeWithin,enabled]);
}
