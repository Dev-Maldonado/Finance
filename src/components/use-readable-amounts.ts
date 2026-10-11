'use client';
import { useEffect, type RefObject } from 'react';

/** Fits displayed currency to its allocated width, without changing its text or value. */
export function useReadableAmounts(ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let frame = 0;
    let disposed = false;
    const fit = () => {
      frame = 0;
      if (disposed) return;
      const amounts = [...root.querySelectorAll<HTMLElement>('strong, b, dd')].filter(el => /^[-+−]?\s*R\$\s*[\d.,]+$/.test(el.textContent?.trim() ?? ''));
      for (const el of amounts) {
        el.classList.add('dashboard-amount');
        const text = el.textContent?.trim() ?? '';
        el.classList.toggle('currency-negative', /^[-−]/.test(text) && /[1-9]/.test(text));
        el.classList.toggle('long-currency', (el.textContent?.trim().length ?? 0) > 17);
        el.style.removeProperty('font-size');
      }
      // Read only after all presentation classes are applied, so wide-value layouts settle together.
      for (const el of amounts) {
        const style = getComputedStyle(el);
        const range = document.createRange();
        range.selectNodeContents(el);
        const measured = range.getBoundingClientRect().width;
        const available = Math.min(el.getBoundingClientRect().width, el.parentElement?.clientWidth ?? Infinity);
        if (available > 0 && measured > available) el.style.fontSize = `${Math.floor(parseFloat(style.fontSize) * (available - 4) / measured * 10) / 10}px`;
      }
    };
    const schedule = () => { if (!disposed && !frame) frame = requestAnimationFrame(fit); };
    const resize = new ResizeObserver(schedule);
    resize.observe(root);
    const mutation = new MutationObserver(records => {
      // Chart tooltips change on every pointer move; they do not resize dashboard amounts.
      if (records.some(record => {
        const element = record.target instanceof Element ? record.target : record.target.parentElement;
        return !element?.closest('.recharts-wrapper, .recharts-tooltip-wrapper');
      })) schedule();
    });
    mutation.observe(root, { subtree: true, childList: true, characterData: true });
    window.addEventListener('resize', schedule);
    void document.fonts.ready.then(schedule);
    schedule();
    return () => { disposed = true; cancelAnimationFrame(frame); resize.disconnect(); mutation.disconnect(); window.removeEventListener('resize', schedule); };
  }, [ref]);
}
