'use client';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { ArrowRight, Banknote, Check, Coins, Landmark, Sparkles, TrendingUp, Trophy } from 'lucide-react';
import type { FinancialFeedback } from '@/lib/financial-feedback';

export const FINANCIAL_FEEDBACK_EVENT = 'finora:financial-feedback';
const CLEAR_FEEDBACK_EVENT = 'finora:clear-feedback';
const kinds = new Set(['income', 'expense', 'transfer', 'goal', 'growth', 'success']);

/** Ephemeral UI event; contains no balances, account IDs, records or persistent state. */
export function emitFinancialFeedback(feedback: FinancialFeedback) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(FINANCIAL_FEEDBACK_EVENT, { detail: feedback }));
}
export function clearFinancialFeedback() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CLEAR_FEEDBACK_EVENT));
}

export function FinancialFeedbackProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [feedback, setFeedback] = useState<(FinancialFeedback & { key: number }) | null>(null);
  const [reduced, setReduced] = useState(true);
  const sequence = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const reset = () => { clearTimeout(timer.current); setFeedback(null); };
    const updateMotion = () => setReduced(preference.matches);
    updateMotion();
    const receive = (event: Event) => {
      const value = (event as CustomEvent<FinancialFeedback>).detail;
      if (!value || !kinds.has(value.kind) || typeof value.title !== 'string' || typeof value.description !== 'string' || document.hidden) return;
      clearTimeout(timer.current);
      setFeedback({ ...value, key: ++sequence.current });
      timer.current = setTimeout(reset, preference.matches ? 2600 : 3200);
    };
    const visibility = () => { if (document.hidden) reset(); };
    window.addEventListener(FINANCIAL_FEEDBACK_EVENT, receive);
    window.addEventListener(CLEAR_FEEDBACK_EVENT, reset);
    window.addEventListener('popstate', reset);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', reset);
    preference.addEventListener('change', updateMotion);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener(FINANCIAL_FEEDBACK_EVENT, receive);
      window.removeEventListener(CLEAR_FEEDBACK_EVENT, reset);
      window.removeEventListener('popstate', reset);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', reset);
      preference.removeEventListener('change', updateMotion);
    };
  }, []);
  useEffect(() => { clearTimeout(timer.current); setFeedback(null); }, [pathname]);
  return <>{children}<div className="financial-feedback-live sr-only" aria-live="polite" aria-atomic="true">{feedback && <span key={feedback.key}>{feedback.title}. {feedback.description}</span>}</div>
    {feedback && <div key={feedback.key} className={`financial-feedback financial-feedback-${feedback.kind}`} data-financial-effect={feedback.kind} data-reduced-motion={reduced} aria-hidden="true">
      {!reduced && <div className="financial-effect-stage">
        {['income', 'expense', 'goal', 'growth'].includes(feedback.kind) && Array.from({ length: feedback.kind === 'goal' ? 12 : 7 }, (_, index) => <span className={`financial-particle particle-${index % 3}`} key={index} style={{ '--particle-i': index, '--particle-x': `${(index % 4 - 1.5) * 46}px`, '--particle-turn': `${(index % 3 - 1) * 25}deg` } as CSSProperties}>
          {feedback.kind === 'goal' ? <i /> : feedback.kind === 'growth' ? <Sparkles size={index % 2 ? 12 : 18} /> : index % 2 ? <Coins size={18} /> : <Banknote size={26} />}
        </span>)}
        {feedback.kind === 'growth' && <svg className="financial-growth-line" viewBox="0 0 180 80"><path d="M12 64 46 51 76 57 111 29 142 36 168 12" /></svg>}
      </div>}
      <div className="financial-confirmation">
        <span className="financial-confirmation-icon">{feedback.kind === 'goal' ? <Trophy /> : feedback.kind === 'growth' ? <TrendingUp /> : <Check />}</span>
        <div><strong>{feedback.title}</strong><span>{feedback.description}</span>
          {feedback.kind === 'transfer' && <div className="financial-transfer-route"><span><Landmark size={13}/>{feedback.from || 'Origem'}</span><i><ArrowRight size={15}/><Coins size={14} /></i><span><Landmark size={13}/>{feedback.to || 'Destino'}</span></div>}
        </div>
      </div>
    </div>}
  </>;
}
