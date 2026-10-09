import { accrued, D, money, Lot, Movement, Rate } from "./engine";
import { hasUnallocatedYieldWithdrawal } from './savings-estimate';
export function savingsHistory(
  lots: Lot[],
  rates: Rate[],
  movements: Movement[],
  end: string,
) {
  const validRates = rates.filter((r) => r.validated !== false);
  const days = [
    ...new Set([
      ...validRates.filter((r) => r.date <= end).map((r) => r.date),
      ...movements.filter((m) => m.date <= end).map((m) => m.date),
    ]),
  ].sort();
  return days
    .filter((d) => lots.some((l) => l.start_date <= d))
    .map((date) => {
      let principal = D(0),
        gains = D(0);
      for (const lot of lots.filter((l) => l.start_date <= date)) {
        const series = lot.indexer === "selic" ? "11" : "12";
        // Accept legacy rate arrays without series; snapshots contain both official series.
        const lotRates = validRates.filter((r) => !r.series || r.series === series);
        const result = accrued(lot, lotRates, movements, date);
        principal = principal.plus(result.principal);
        gains = gains.plus(result.gross);
      }
      return { date, principal: money(principal), yield: money(gains), ...(hasUnallocatedYieldWithdrawal(movements, date) ? { estimateComplete: false } : {}) };
    });
}
