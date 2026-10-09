import { accrued, D, money, type Lot, type Movement, type Rate } from '@/financial/engine';
import { rows, str, type Snapshot } from './summary';
import { dateShift } from './dashboard';
import { hasUnallocatedYieldWithdrawal } from '@/financial/savings-estimate';

export function savingsMetrics(snapshot: Snapshot, today: string, periodStart = `${today.slice(0, 7)}-01`) {
  const lots = rows(snapshot, 'savings_lots') as unknown as (Lot & { goal_id: string })[];
  const movements = rows(snapshot, 'savings_movements') as unknown as Movement[];
  const rates = rows(snapshot, 'benchmark_rates').filter(r => r.validated !== false).sort((a, b) => str(a, 'date').localeCompare(str(b, 'date')));
  const latestCDI = rates.filter(r => r.series === '12' && str(r, 'date') <= today).at(-1);
  const details = rows(snapshot, 'savings_goals').map(goal => {
    let day = D(0), month = D(0), cumulative = D(0);
    const baseDates: string[] = [];
    const unallocatedYieldWithdrawal = hasUnallocatedYieldWithdrawal(movements.filter(movement => movement.goal_id === goal.id), today);
    let complete = !unallocatedYieldWithdrawal;
    let waitingForRate = false;
    const waitingDates: string[] = [];
    for (const lot of lots.filter(l => l.goal_id === goal.id && l.start_date <= today)) {
      const lotRates = rates.filter(r => r.series === (lot.indexer === 'selic' ? '11' : '12')) as unknown as Rate[];
      const relevant = lotRates.filter(r => r.date >= lot.start_date && r.date <= today);
      const latest = relevant.at(-1)?.date;
      if (['cdi', 'selic', 'fixed'].includes(lot.indexer)) {
        const history = rows(snapshot, 'provider_sync_states').find(r => r.provider === (lot.indexer === 'selic' ? 'bcb-selic-history' : 'bcb-cdi-history'));
        const coveredFrom = str(history ?? {}, 'last_date') || lotRates[0]?.date || today;
        const lastPublished = lotRates.filter(r => r.date <= today).at(-1)?.date;
        if (coveredFrom > lot.start_date || !lastPublished) complete = false;
        if (!latest && lastPublished && lastPublished < lot.start_date) {
          waitingForRate = true;
          waitingDates.push(lot.start_date);
        }
        if (latest) baseDates.push(latest);
      }
      if (lot.indexer === 'manual') complete = false;
      const totalAt = (end: string) => {
        if (end < lot.start_date) return D(0);
        const value = accrued(lot, lotRates, movements, end);
        return D(value.gross).plus(value.withdrawnEstimatedYield);
      };
      const current = totalAt(today);
      cumulative = cumulative.plus(current);
      month = month.plus(current.minus(totalAt(dateShift(periodStart, -1))));
      if (latest) day = day.plus(totalAt(latest).minus(totalAt(dateShift(latest, -1))));
    }
    return { goalId: str(goal, 'id'), daily: money(day), monthly: money(month), cumulative: money(cumulative), asOf: baseDates.sort().at(0) ?? null, complete, unallocatedYieldWithdrawal, waitingForRate, waitingSince: waitingDates.sort()[0] ?? null };
  });
  const sum = (key: 'daily' | 'monthly') => money(details.reduce((a, d) => a.plus(d[key]), D(0)));
  return { latestCDI, details, daily: sum('daily'), monthly: sum('monthly'), unallocatedYieldWithdrawal: details.some(detail => detail.unallocatedYieldWithdrawal) };
}

/** The selected period ends at today; no unpublished or future rates are projected. */
export function savingsPeriodMetrics(snapshot: Snapshot, start: string, end: string, today: string) {
  const asOf = end < today ? end : today;
  if (start > asOf) return { value: '0.00', unallocatedYieldWithdrawal: false, partial: false };
  const metrics = savingsMetrics(snapshot, asOf, start);
  return { value: metrics.monthly, unallocatedYieldWithdrawal: metrics.unallocatedYieldWithdrawal, partial: metrics.details.some(detail => !detail.complete) };
}
