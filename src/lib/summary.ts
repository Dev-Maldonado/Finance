import { manualSavingsPosition } from './manual-savings';
import { manualPosition } from './manual-investments';
import { periodMetrics } from "./dashboard";
import { cardInvoices } from "./card-invoices";
import { D, money } from "@/financial/engine";
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
  const goals = rows(s, "savings_goals").map(goal => {
    const manual = manualSavingsPosition(s,goal,asOf);
    return { goal, manual, principal:manual.netCapital, gross:manual.profit ?? '0.00',
      estimated:manual.balance, registeredBalance:manual.balance, confirmed:manual.legacyYield,
      confirmedTotal:manual.legacyYieldTotal, asOf:manual.latest ? str(manual.latest,'date') : null,
      estimateComplete:true, estimateLimitation:null, taxSupported:false, net:null, supported:true };
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
