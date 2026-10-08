import { accrued, D, money, Lot, Movement, Rate } from "./engine";
export function savingsHistory(
  lots: Lot[],
  rates: Rate[],
  movements: Movement[],
  end: string,
) {
  const days = [
    ...new Set([
      ...rates.filter((r) => r.date <= end).map((r) => r.date),
      ...movements.filter((m) => m.date <= end).map((m) => m.date),
    ]),
  ].sort();
  return days
    .filter((d) => lots.some((l) => l.start_date <= d))
    .map((date) => {
      let principal = D(0),
        gains = D(0);
      for (const lot of lots.filter((l) => l.start_date <= date)) {
        const result = accrued(lot, rates, movements, date);
        principal = principal.plus(result.principal);
        gains = gains.plus(result.gross);
      }
      return { date, principal: money(principal), yield: money(gains) };
    });
}
