import { D } from '@/financial/engine';
export type FinancialTone = 'balance' | 'income' | 'expense' | 'investment' | 'wealth' | 'pending' | 'danger' | 'paid' | 'neutral';
/** A negative balance/result always receives the attention treatment, regardless of its usual context. */
export function financialTone(value: string | number, tone: FinancialTone) {
  return `tone-${D(value).lt(0) ? 'danger' : tone}`;
}
