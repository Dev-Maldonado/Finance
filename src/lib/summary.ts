import { manualPosition } from './manual-investments';
import { periodMetrics } from "./dashboard";
import { cardInvoices } from "./card-invoices";
import { hasUnallocatedYieldWithdrawal, unallocatedYieldWithdrawalNotice } from '@/financial/savings-estimate';
import {
  D,
  money,
  accrued,
  estimateTax,
  daysBetween,
  Lot,
  Movement,
  Rate,
  TaxRule,
} from "@/financial/engine";
export type Row = Record<string, string | boolean | null>;
export type Snapshot = {
  user: { id: string; email: string };
  [key: string]: Row[] | { id: string; email: string };
};
export const rows = (s: Snapshot, key: string, includeExcluded = false) => {
  const records = (s[key] as Row[]) ?? [];
  return ["credit_card_purchases", "investment_operations"].includes(key) && !includeExcluded
    ? records.filter(r => r.status !== "cancelled") : records;
};
export const str = (r: Row, k: string) => String(r[k] ?? "");
export function financialSummary(
  s: Snapshot,
  start: string,
  end: string,
  asOf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date()),
) {
  const tx = rows(s, "transactions").filter(
    (t) =>
      str(t, "date") >= start &&
      str(t, "date") <= end &&
      str(t, "date") <= asOf &&
      t.status === "confirmed",
  );
  const sum = (items: Row[], key: string) =>
    items.reduce((a, r) => a.plus(str(r, key) || "0"), D(0));
  const purchases = rows(s, "credit_card_purchases").filter(
    (t) => str(t, "date") >= start && str(t, "date") <= end && str(t, "date") <= asOf,
  );
  const income = sum(
    tx.filter((t) => t.type === "income"),
    "amount",
  );
  const cashExpense = sum(
    tx.filter((t) => t.type === "expense"),
    "amount",
  ).abs();
  const monthly = periodMetrics(s, start, end, false, asOf);
  const cardExpense = D(monthly.cardExpense);
  const yields = sum(
    tx.filter((t) => t.type === "yield"),
    "amount",
  );
  const accounts = rows(s, "account_balances");
  const cash = sum(
    accounts.filter((a) => a.kind !== "savings"),
    "balance",
  );
  const savings = sum(
    accounts.filter((a) => a.kind === "savings"),
    "balance",
  );
  const positions = rows(s, "investment_assets").map(asset => {
    const manual = manualPosition(s, asset, asOf);
    const quote = manual.latest ? { ...manual.latest, source: 'manual', currency: asset.currency } : undefined;
    return { asset, pos: manual.pos, quote, value: manual.supported ? manual.current ?? manual.pos.cost : '0.00', unrealized: manual.supported ? manual.profit ?? '0.00' : '0.00', supported: manual.supported };
  });
  const investments = positions.reduce((a, p) => a.plus(p.value), D(0));
  const cardLiability = cardInvoices(s, asOf).reduce((a, invoice) => a.plus(invoice.balance), D(0));
  const liability = cardLiability.plus(
    sum(rows(s, "financial_liabilities"), "amount"),
  );
  const goals = rows(s, "savings_goals").map((goal) => {
    const rates = rows(s, "benchmark_rates")
      .filter((r) => r.series === "12" && r.validated !== false)
      .sort((a, b) =>
        str(a, "date").localeCompare(str(b, "date")),
      ) as unknown as Rate[];
    const lots = rows(s, "savings_lots").filter(
      (l) => l.goal_id === goal.id && str(l, "start_date") <= asOf,
    ) as unknown as Lot[];
    const movements = rows(s, "savings_movements").filter(
      (m) => m.goal_id === goal.id,
    ) as unknown as Movement[];
    const results = lots.map((l) => {
      const lotRates =
        l.indexer === "selic"
          ? (rows(s, "benchmark_rates")
              .filter((r) => r.series === "11" && r.validated !== false)
              .sort((a, b) =>
                str(a, "date").localeCompare(str(b, "date")),
              ) as unknown as Rate[])
          : rates;
      const result = accrued(l, lotRates, movements, asOf);
      return {
        ...result,
        tax: estimateTax(
          result.gross,
          daysBetween(l.start_date, asOf),
          l.product,
          l.tax_exempt,
          rows(s, "tax_rules").map((r) => ({
            product: str(r, "product"),
            valid_from: str(r, "valid_from"),
            valid_to: r.valid_to ? str(r, "valid_to") : null,
            min_days: Number(r.min_days),
            max_days: r.max_days === null ? null : Number(r.max_days),
            ir_rate: str(r, "ir_rate"),
            iof_applicable: Boolean(r.iof_applicable),
          })) as TaxRule[],
          asOf,
        ),
      };
    });
    const principal = results.reduce((a, r) => a.plus(r.principal), D(0));
    const gross = results.reduce((a, r) => a.plus(r.gross), D(0));
    const confirmedTotal = sum(
      rows(s, "savings_movements").filter(
        (m) => m.goal_id === goal.id && m.type === "confirmed_yield" && str(m, "date") <= asOf,
      ),
      "amount",
    );
    const confirmedRemoved = sum(rows(s, "savings_movements").filter(m => m.goal_id === goal.id && ['withdrawn_yield', 'yield_reversal'].includes(str(m, 'type')) && str(m, 'date') <= asOf), 'amount');
    const confirmed = confirmedTotal.minus(confirmedRemoved);
    const estimateComplete = !hasUnallocatedYieldWithdrawal(movements, asOf);
    return {
      goal,
      estimateComplete,
      estimateLimitation: estimateComplete ? null : unallocatedYieldWithdrawalNotice,
      principal: money(principal),
      gross: money(gross),
      estimated: money(principal.plus(gross)),
      confirmed: money(confirmed),
      confirmedTotal: money(confirmedTotal),
      registeredBalance: str(accounts.find(a => a.id === goal.account_id) ?? {}, "balance") || "0.00",
      asOf: results
        .map((r) => r.asOf)
        .filter(Boolean)
        .sort()
        .at(-1),
      taxSupported: results.every((r) => r.tax.supported),
      net: results.every((r) => r.tax.net !== null)
        ? money(results.reduce((a, r) => a.plus(r.tax.net!), D(0)))
        : null,
      supported: results.every((r) => r.supported),
    };
  });
  return {
    income: money(income),
    cashExpense: money(cashExpense),
    cardExpense: money(cardExpense),
    purchaseTotal: money(sum(purchases, "amount")),
    installments: monthly.installments,
    expense: money(cashExpense.plus(cardExpense)),
    yields: money(yields),
    cash: money(cash),
    savings: money(savings),
    investments: money(investments),
    liability: money(liability),
    cardLiability: money(cardLiability),
    assets: money(cash.plus(savings).plus(investments)),
    netWorth: money(cash.plus(savings).plus(investments).minus(liability)),
    positions,
    goals,
    tx,
    purchases,
  };
}
