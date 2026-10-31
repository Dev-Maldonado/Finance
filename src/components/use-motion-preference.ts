'use client';

import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
let preference: MediaQueryList | null = null;

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  if (!preference) {
    preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    preference.addEventListener('change', emit);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      preference?.removeEventListener('change', emit);
      preference = null;
    }
  };
}

/** A single live preference shared by charts; SSR renders all values immediately. */
export function useMotionAllowed() {
  return useSyncExternalStore(
    subscribe,
    () => typeof window !== 'undefined' && Boolean(window.matchMedia) && !(preference ?? window.matchMedia('(prefers-reduced-motion: reduce)')).matches,
    () => false,
  );
}

export function useChartMotion() {
  return {
    isAnimationActive: useMotionAllowed(),
    animationBegin: 0,
    animationDuration: 380,
    animationEasing: 'ease-out' as const,
  };
}
