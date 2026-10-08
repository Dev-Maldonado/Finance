import { fundId } from "@/lib/fund-id";
import { D, position, Operation, CorporateEvent } from "./engine";
import { benchmarkReturn, modifiedDietz } from "./performance";
import { Snapshot, Row, rows, str } from "@/lib/summary";
export function portfolioPerformance(s: Snapshot, start: string, end: string) {
  let opening = D(0),
    closing = D(0),
    complete = true;
  const flows: { date: string; amount: string }[] = [];
  for (const asset of rows(s, "investment_assets")) {
    if (asset.currency !== "BRL") {
      complete = false;
      continue;
    }
    const ops = [
        ...rows(s, "investment_operations"),
        ...rows(s, "investment_opening_positions").map((p) => ({
          ...p,
          asset_id: p.asset_id,
          date: p.date,
          type: "buy",
          price: "1",
          fees: "0",
          cost_override: p.cost,
        })),
      ].filter((o) => o.asset_id === asset.id) as unknown as Operation[],
      events = rows(s, "investment_corporate_actions").filter(
        (e) => e.asset_id === asset.id,
      ) as unknown as CorporateEvent[];
    const prices = [
      ...rows(s, "asset_price_history").filter(
        (p) => p.ticker === asset.ticker,
      ),
      ...rows(s, "manual_asset_prices").filter((p) => p.asset_id === asset.id),
      ...rows(s, "fund_nav_history")
        .filter(
          (p) =>
            str(p, "fund_id") ===
            fundId(str(asset, "cnpj"), str(asset, "share_class")),
        )
        .map((p) => ({ ...p, price: p.nav })),
    ];
    for (const [date, isOpening] of [
      [start, true],
      [end, false],
    ] as const) {
      const holdings = position(
        ops.filter((o) => o.date <= date),
        events.filter((e) => e.date <= date),
      );
      if (D(holdings.quantity).isZero()) continue;
      const quote = prices
        .filter((q) => str(q, "date") <= date)
        .sort((a, b) => str(b, "date").localeCompare(str(a, "date")))[0];
      if (!quote) {
        complete = false;
        continue;
      }
      const value = D(holdings.quantity).mul(str(quote, "price"));
      if (isOpening) opening = opening.plus(value);
      else closing = closing.plus(value);
    }
    for (const o of ops.filter((o) => o.date > start && o.date <= end))
      flows.push({
        date: o.date,
        amount: (o.type === "buy"
          ? D(o.cost_override ?? D(o.quantity).mul(o.price)).plus(o.fees)
          : D(o.quantity).mul(o.price).minus(o.fees).neg()
        ).toFixed(8),
      });
  }
  const distributions = rows(s, "investment_income")
    .filter(
      (i) =>
        i.status === "received" &&
        str(i, "date") > start &&
        str(i, "date") <= end,
    )
    .reduce((a, i) => a.plus(str(i, "amount")), D(0));
  const cdi = benchmarkReturn(
    rows(s, "benchmark_rates")
      .filter((r) => r.series === "12")
      .map((r) => ({ date: str(r, "date"), value: str(r, "value") })),
    start,
    end,
  );
  const personal = complete
    ? modifiedDietz(
        opening.toString(),
        closing.plus(distributions).toString(),
        start,
        end,
        flows,
      )
    : null;
  return {
    personal,
    cdi,
    complete,
    relative:
      personal !== null && cdi !== null && !D(cdi).isZero()
        ? D(personal).div(cdi).mul(100).toFixed(2)
        : null,
  };
}
