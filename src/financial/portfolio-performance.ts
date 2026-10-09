import { D, money, position } from "./engine";
import { benchmarkReturn, modifiedDietz } from "./performance";
import { Snapshot, Row, rows, str } from "@/lib/summary";
import { manualOperations, manualUpdates } from '@/lib/manual-investments';
export function portfolioPerformance(s: Snapshot, start: string, end: string) {
  // Opening is the close before the first selected date; selected-date flows
  // and benchmark factors therefore use the same inclusive financial window.
  const openingDate = new Date(Date.parse(`${start}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
  let opening = D(0),
    closing = D(0),
    complete = true;
  const flows: { date: string; amount: string }[] = [];
  for (const asset of rows(s, "investment_assets")) {
    if (asset.currency !== "BRL") {
      complete = false;
      continue;
    }
    const ops = manualOperations(s,asset);
    const prices = manualUpdates(s,str(asset,'id')).map(p=>({...p,currency:'BRL',source:'manual'}));
    for (const [date, isOpening] of [
      [openingDate, true],
      [end, false],
    ] as const) {
      const holdings = position(
        ops.filter((o) => o.date <= date),
        [],
      );
      if (D(holdings.quantity).isZero()) continue;
      const quote = prices
        .filter((q) => str(q, "date") <= date)
        .sort((a, b) => str(b, "date").localeCompare(str(a, "date")) || str(b, "collected_at").localeCompare(str(a, "collected_at")))[0];
      if (!quote) {
        complete = false;
        continue;
      }
      const value = D(holdings.quantity).mul(str(quote, "price"));
      if (isOpening) opening = opening.plus(value);
      else closing = closing.plus(value);
    }
    for (const o of ops.filter((o) => o.date >= start && o.date <= end))
      flows.push({
        date: o.date,
        amount: (o.type === "buy"
          ? D(o.cost_override ?? money(D(o.quantity).mul(o.price))).plus(o.fees)
          : D(money(D(o.quantity).mul(o.price))).minus(o.fees).neg()
        ).toFixed(8),
      });
  }
  const benchmarkRows = rows(s, "benchmark_rates");
  const coverageStart = str(rows(s, "provider_sync_states").find(r => r.provider === 'bcb-cdi-history') ?? {}, 'last_date');
  // Global provider coverage may precede the rates actually loaded for this
  // user. A partial snapshot cannot stand in for the full comparison period.
  const snapshotStart = str(rows(s, "snapshot_metadata")[0] ?? {}, 'benchmark_start');
  const benchmarkComplete = !benchmarkRows.some(r => r.series === '12' && r.validated === false && str(r, 'date') >= start && str(r, 'date') <= end)
    && (!coverageStart || coverageStart <= start)
    && (!snapshotStart || snapshotStart <= start);
  const cdi = benchmarkComplete ? benchmarkReturn(
    benchmarkRows
      .filter((r) => r.series === "12" && r.validated !== false)
      .map((r) => ({ date: str(r, "date"), value: str(r, "value") })),
    start,
    end,
  ) : null;
  const personal = complete
    ? modifiedDietz(
        opening.toString(),
        closing.toString(),
        openingDate,
        end,
        flows,
      )
    : null;
  return {
    personal,
    cdi,
    complete,
    benchmarkComplete: benchmarkComplete && cdi !== null,
    relative:
      personal !== null && cdi !== null && !D(cdi).isZero()
        ? D(personal).div(cdi).mul(100).toFixed(2)
        : null,
  };
}
