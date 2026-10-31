'use client';

import { useEffect, type RefObject } from 'react';

const amountSelector = '.stat>strong,.dashboard-metric>strong,.card-monthly-invoice>strong,.card-values strong,.overview-net-value,.overview-wealth-value,.dashboard-amount';
const moneyOrPercent = /^[-+−]?\s*(?:R\$\s*[\d.,]+|[\d.,]+\s*%)$/;

/** Presentation only. It never replaces, interpolates or reads back a financial value. */
export function useInteractiveFinance(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const root = ref.current;
    if (!root || !enabled) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const precise = matchMedia('(hover: hover) and (pointer: fine)');
    const amounts = new WeakMap<HTMLElement, string>();
    const animations = new Map<HTMLElement, Animation>();
    let card: HTMLElement | null = null;
    let x = 0, y = 0, frame = 0, scanFrame = 0;
    let changesUntil = 0, disposed = false;

    const finish = (element: HTMLElement, animation: Animation) => {
      if (animations.get(element) !== animation) return;
      animations.delete(element);
      element.removeAttribute('data-value-updating');
    };
    const cancelAnimations = () => {
      for (const [element, animation] of animations) {
        animation.cancel();
        element.removeAttribute('data-value-updating');
      }
      animations.clear();
    };
    const scan = () => {
      scanFrame = 0;
      if (disposed) return;
      for (const element of root.querySelectorAll<HTMLElement>(amountSelector)) {
        if (element.closest('.recharts-wrapper,.recharts-tooltip-wrapper')) continue;
        const value = element.textContent?.trim() ?? '';
        const previous = amounts.get(element);
        amounts.set(element, value);
        // New nodes, navigation, filters and background refreshes do not simulate a gain.
        if (previous === undefined || previous === value || !moneyOrPercent.test(value) || reduced.matches || document.hidden || performance.now() > changesUntil || !element.animate) continue;
        const rect = element.getBoundingClientRect();
        if (!rect.width || rect.bottom < 0 || rect.top > innerHeight) continue;
        animations.get(element)?.cancel();
        element.setAttribute('data-value-updating', '');
        const animation = element.animate(
          [{ opacity: .55 }, { opacity: 1 }],
          { duration: 380, easing: 'ease-out' },
        );
        animations.set(element, animation);
        animation.onfinish = () => finish(element, animation);
        animation.oncancel = () => finish(element, animation);
      }
      for (const [element, animation] of animations) if (!root.contains(element)) {
        animation.cancel();
        animations.delete(element);
      }
    };
    const schedule = () => { if (!disposed && !scanFrame) scanFrame = requestAnimationFrame(scan); };
    const resetCard = () => {
      cancelAnimationFrame(frame); frame = 0;
      if (!card) return;
      card.removeAttribute('data-card-active');
      for (const property of ['--card-rotate-x', '--card-rotate-y', '--card-light-x', '--card-light-y']) card.style.removeProperty(property);
      card = null;
    };
    const paintCard = () => {
      frame = 0;
      if (!card || reduced.matches || !precise.matches || !root.contains(card)) { resetCard(); return; }
      // offset dimensions do not include the previous transform, avoiding feedback wobble.
      const rect = card.getBoundingClientRect();
      const horizontal = Math.max(-1, Math.min(1, (x - rect.left) / rect.width * 2 - 1));
      const vertical = Math.max(-1, Math.min(1, (y - rect.top) / rect.height * 2 - 1));
      card.style.setProperty('--card-rotate-x', `${(-vertical * 2).toFixed(2)}deg`);
      card.style.setProperty('--card-rotate-y', `${(horizontal * 2).toFixed(2)}deg`);
      card.style.setProperty('--card-light-x', `${((horizontal + 1) * 50).toFixed(1)}%`);
      card.style.setProperty('--card-light-y', `${((vertical + 1) * 50).toFixed(1)}%`);
      card.setAttribute('data-card-active', '');
    };
    const move = (event: PointerEvent) => {
      if (reduced.matches || !precise.matches || event.pointerType !== 'mouse') return;
      const next = event.target instanceof Element ? event.target.closest<HTMLElement>('.bank-card') : null;
      if (!next || !root.contains(next)) { resetCard(); return; }
      if (card !== next) { resetCard(); card = next; }
      x = event.clientX; y = event.clientY;
      if (!frame) frame = requestAnimationFrame(paintCard);
    };
    const out = (event: PointerEvent) => {
      if (card && (!(event.relatedTarget instanceof Node) || !card.contains(event.relatedTarget))) resetCard();
    };
    const onPreference = () => { resetCard(); if (reduced.matches) { changesUntil = 0; cancelAnimations(); } };
    const onVisibility = () => { if (document.hidden) { resetCard(); changesUntil = 0; cancelAnimations(); } };
    const onSaved = () => { if (!reduced.matches && !document.hidden) changesUntil = performance.now() + 4000; };
    const resetContext = () => { changesUntil = 0; cancelAnimations(); resetCard(); };
    const onInteraction = (event: Event) => {
      const element = event.target instanceof Element ? event.target : null;
      if (element?.closest('a,.period-tabs,.invoice-month-picker,.module-tabs,.filters,.month-navigation')) resetContext();
    };
    const observer = new MutationObserver(records => {
      if (records.some(record => !(record.target instanceof Element ? record.target : record.target.parentElement)?.closest('.recharts-wrapper,.recharts-tooltip-wrapper'))) schedule();
    });
    observer.observe(root, { subtree: true, childList: true, characterData: true });
    root.addEventListener('pointermove', move, { passive: true });
    root.addEventListener('pointerout', out, { passive: true });
    root.addEventListener('click', onInteraction, true);
    root.addEventListener('change', onInteraction, true);
    window.addEventListener('blur', resetCard);
    window.addEventListener('popstate', resetContext);
    window.addEventListener('finora:financial-feedback', onSaved);
    document.addEventListener('visibilitychange', onVisibility);
    reduced.addEventListener('change', onPreference);
    precise.addEventListener('change', onPreference);
    scan();
    return () => {
      disposed = true;
      resetCard(); cancelAnimations(); cancelAnimationFrame(scanFrame); observer.disconnect();
      root.removeEventListener('pointermove', move); root.removeEventListener('pointerout', out);
      root.removeEventListener('click', onInteraction, true); root.removeEventListener('change', onInteraction, true);
      window.removeEventListener('blur', resetCard); window.removeEventListener('popstate', resetContext);
      window.removeEventListener('finora:financial-feedback', onSaved); document.removeEventListener('visibilitychange', onVisibility);
      reduced.removeEventListener('change', onPreference); precise.removeEventListener('change', onPreference);
    };
  }, [ref, enabled]);
}
