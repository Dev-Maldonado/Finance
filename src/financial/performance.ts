import { D, money } from "./engine";
export function benchmarkReturn(
  rates: { date: string; value: string }[],
  start: string,
  end: string,
) {
  const selected = rates.filter((r) => r.date >= start && r.date <= end);
  return selected.length
    ? selected
        .reduce((factor, r) => factor.mul(D(1).plus(D(r.value).div(100))), D(1))
        .minus(1)
        .mul(100)
        .toFixed(6)
    : null;
}
// Modified Dietz makes cash-flow effects explicit. Positive flows are contributions, negative flows withdrawals.
export function modifiedDietz(
  startValue: string,
  endValue: string,
  start: string,
  end: string,
  flows: { date: string; amount: string }[],
) {
  const duration = Date.parse(end) - Date.parse(start);
  if (duration <= 0) return null;
  const items = flows.filter((f) => f.date >= start && f.date <= end);
  let numerator = D(endValue).minus(startValue),
    denominator = D(startValue);
  for (const f of items) {
    const amount = D(f.amount);
    numerator = numerator.minus(amount);
    denominator = denominator.plus(
      amount.mul(D(Date.parse(end) - Date.parse(f.date)).div(duration)),
    );
  }
  return denominator.isZero()
    ? null
    : numerator.div(denominator).mul(100).toFixed(6);
}
