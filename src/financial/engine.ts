import Decimal from "decimal.js";
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export const D = (v: Decimal.Value) => new Decimal(v);
export const money = (v: Decimal.Value) => D(v).toFixed(2);
export type Rate = { date: string; value: string; series?: string; validated?: boolean };
export type Lot = {
  id: string;
  principal: string;
  remaining: string;
  start_date: string;
  percentage: string;
  indexer: string;
  annual_rate?: string;
  product: string;
  tax_exempt: boolean;
};
export type Movement = {
  lot_id?: string;
  goal_id?: string;
  status?: string;
  date: string;
  type: string;
  amount: string;
};
export function accrued(
  lot: Lot,
  rates: Rate[],
  movements: Movement[],
  end: string,
) {
  let capital = D(lot.principal),
    balance = capital,
    withdrawn = D(0);
  const changes = movements
    .filter(
      (m) => m.lot_id === lot.id && m.type === "withdrawal" && m.date <= end,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const days = [
    ...new Set([
      ...rates
        .filter((r) => r.validated !== false && r.date >= lot.start_date && r.date <= end)
        .map((r) => r.date),
      ...changes.map((m) => m.date),
    ]),
  ].sort();
  for (const day of days) {
    for (const m of changes.filter((m) => m.date === day)) {
      const fraction = D(m.amount).div(capital);
      if (fraction.gt(1)) throw new Error("Resgate excede principal");
      withdrawn = withdrawn.plus(balance.minus(capital).mul(fraction));
      balance = balance.mul(D(1).minus(fraction));
      capital = capital.minus(m.amount);
    }
    const rate = rates.find((r) => r.date === day && r.validated !== false);
    if (rate && (lot.indexer === "cdi" || lot.indexer === "selic"))
      balance = balance.mul(
        D(1).plus(D(rate.value).div(100).mul(D(lot.percentage).div(100))),
      );
    if (rate && lot.indexer === "fixed")
      balance = balance.mul(
        D(1)
          .plus(D(lot.annual_rate ?? "0").div(100))
          .pow(D(1).div(252)),
      );
  }
  return {
    principal: money(capital),
    balance: money(balance),
    gross: money(balance.minus(capital)),
    withdrawnEstimatedYield: money(withdrawn),
    asOf:
      rates.filter((r) => r.validated !== false && r.date <= end && r.date >= lot.start_date).sort((a, b) => a.date.localeCompare(b.date)).at(-1)
        ?.date ?? null,
    supported: ["cdi", "none", "selic", "fixed"].includes(lot.indexer),
  };
}
const iof = [
  96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50, 46, 43, 40, 36,
  33, 30, 26, 23, 20, 16, 13, 10, 6, 3,
];
export type TaxRule = {
  product: string;
  valid_from: string;
  valid_to?: string | null;
  min_days: number;
  max_days?: number | null;
  ir_rate: string;
  iof_applicable: boolean;
};
export function estimateTax(
  gross: string,
  days: number,
  product: string,
  exempt: boolean,
  rules?: TaxRule[],
  asOf?: string,
) {
  if (exempt)
    return { ir: "0.00", iof: "0.00", net: money(gross), supported: true };
  if (!["cdb", "rdb", "treasury"].includes(product))
    return { ir: null, iof: null, net: null, supported: false };
  const rule = rules?.find(
    (r) =>
      r.product === product &&
      r.valid_from <= (asOf ?? "9999-12-31") &&
      (!r.valid_to || r.valid_to >= (asOf ?? "9999-12-31")) &&
      days >= r.min_days &&
      (r.max_days == null || days <= r.max_days),
  );
  if (rules && !rule)
    return { ir: null, iof: null, net: null, supported: false };
  const gains = Decimal.max(0, D(gross));
  const taxIof = gains.mul(
    (rule?.iof_applicable ?? true) && days >= 0 && days < 30
      ? D(days === 0 ? 100 : iof[days - 1]).div(100)
      : 0,
  );
  const ir = gains
    .minus(taxIof)
    .mul(
      rule?.ir_rate ??
        (days <= 180
          ? "0.225"
          : days <= 360
            ? "0.20"
            : days <= 720
              ? "0.175"
              : "0.15"),
    );
  return {
    ir: money(ir),
    iof: money(taxIof),
    // The separately payable rounded taxes must reconcile with rounded net gains.
    net: money(D(money(gains)).minus(money(taxIof)).minus(money(ir))),
    supported: true,
  };
}
export type Operation = {
  cost_override?: string;
  id: string;
  asset_id: string;
  type: string;
  quantity: string;
  price: string;
  fees: string;
  date: string;
  status?: string;
};
export type CorporateEvent = {
  asset_id: string;
  type: string;
  ratio: string;
  date: string;
};
export function position(
  operations: Operation[],
  events: CorporateEvent[] = [],
) {
  let quantity = D(0),
    cost = D(0),
    realized = D(0);
  const timeline = [
    ...operations.filter((o) => o.status !== "cancelled").map((o) => ({
      date: o.date,
      op: o,
      event: null as CorporateEvent | null,
    })),
    ...events.map((e) => ({
      date: e.date,
      op: null as Operation | null,
      event: e,
    })),
  ].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.event ? 0 : a.op?.type === "buy" ? 1 : 2) -
        (b.event ? 0 : b.op?.type === "buy" ? 1 : 2) ||
      (a.op?.id ?? "").localeCompare(b.op?.id ?? ""),
  );
  for (const item of timeline) {
    if (item.event) {
      if (item.event.type !== "ticker_change")
        quantity = quantity.mul(item.event.ratio);
      continue;
    }
    const o = item.op!;
    const q = D(o.quantity),
      p = D(o.price),
      fee = D(o.fees);
    if (o.type === "buy") {
      cost = cost.plus(o.cost_override ?? money(q.mul(p))).plus(fee);
      quantity = quantity.plus(q);
    } else {
      if (q.gt(quantity)) throw new Error("Venda excede posição");
      const removed = cost.div(quantity).mul(q);
      realized = realized.plus(D(money(q.mul(p))).minus(fee).minus(removed));
      cost = cost.minus(removed);
      quantity = quantity.minus(q);
    }
  }
  return {
    quantity: quantity.toFixed(8),
    cost: money(cost),
    average: quantity.gt(0) ? cost.div(quantity).toFixed(8) : "0",
    realized: money(realized),
  };
}
export function simulate(
  initial: string,
  monthly: string,
  annualPercent: string,
  months: number,
) {
  if (months < 1 || months > 1200) throw new Error("Prazo inválido");
  const rate = D(1).plus(D(annualPercent).div(100)).pow(D(1).div(12)).minus(1);
  let balance = D(initial),
    capital = D(initial);
  return Array.from({ length: months }, (_, i) => {
    balance = balance.mul(D(1).plus(rate)).plus(monthly);
    capital = capital.plus(monthly);
    return {
      month: i + 1,
      capital: money(capital),
      balance: money(balance),
      yield: money(balance.minus(capital)),
    };
  });
}
export function splitInstallments(amount: string, count: number) {
  if (!Number.isInteger(count) || count < 1 || count > 120)
    throw new Error("Parcelas inválidas");
  const cents = D(amount).mul(100);
  if (!cents.isInteger() || cents.lt(count))
    throw new Error("Valor insuficiente");
  const base = cents.div(count).floor();
  return Array.from({ length: count }, (_, i) =>
    money((i === count - 1 ? cents.minus(base.mul(count - 1)) : base).div(100)),
  );
}
export function daysBetween(a: string, b: string) {
  return Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86400000));
}
