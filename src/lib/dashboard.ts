import { D, money } from '@/financial/engine';
import { cardInvoices, invoiceTotals, shiftInvoiceMonth } from './card-invoices';
import { rows, str, type Snapshot } from './summary';
import { forecastItems } from './financial-plan';
import { aggregateCategories, categoryMatches, categoryLabel } from './categories';

export const dateShift = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
export const monthEnd = (month: string) => dateShift(`${shiftInvoiceMonth(month, 1)}-01`, -1);
export function comparisonRange(start: string, end: string, period: string) {
  if (['month', 'previous', 'year'].includes(period)) {
    const previousMonth = shiftInvoiceMonth(start.slice(0, 7), period === 'year' ? -12 : -1);
    const previousStart = `${previousMonth}-${start.slice(8)}`;
    const endMonth = shiftInvoiceMonth(end.slice(0, 7), period === 'year' ? -12 : -1);
    const previousEnd = period === 'previous' ? monthEnd(endMonth)
      : `${endMonth}-${String(Math.min(Number(end.slice(8)), Number(monthEnd(endMonth).slice(8)))).padStart(2, '0')}`;
    return { start: previousStart, end: previousEnd };
  }
  const length = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
  return { start: dateShift(start, -length), end: dateShift(start, -1) };
}
export function changeMetric(current: string, previous: string) {
  const difference = D(current).minus(previous);
  return { difference: money(difference), percent: D(previous).eq(0) ? null : difference.div(D(previous).abs()).mul(100).toFixed(1) };
}
export function installmentExpenses(s: Snapshot, start: string, end: string, fullInvoiceMonths = true, asOf = end) {
  const purchases = new Map(rows(s, 'credit_card_purchases').map(p => [p.id, p]));
  const invoices = new Map(rows(s, 'credit_card_invoices').map(i => [i.id, i]));
  const first = fullInvoiceMonths ? `${start.slice(0, 7)}-01` : start;
  const last = fullInvoiceMonths ? monthEnd(end.slice(0, 7)) : end;
  return rows(s, 'credit_card_installments').flatMap(part => {
    const purchase = purchases.get(part.purchase_id), invoice = invoices.get(part.invoice_id);
    if (!purchase || !invoice || str(purchase, "date") > asOf) return [];
    const date = str(invoice, 'due_date');
    if (date < first || date > last) return [];
    return [{ ...part, date, category_id: purchase.category_id, card_id: purchase.card_id, description: purchase.description, installments: purchase.installments }];
  });
}
export function periodMetrics(s: Snapshot, start: string, end: string, fullInvoiceMonths = true, asOf = end) {
  const tx = rows(s, 'transactions').filter(t => t.status === 'confirmed' && str(t, 'date') >= start && str(t, 'date') <= end && str(t, 'date') <= asOf);
  const purchases = rows(s, 'credit_card_purchases').filter(t => str(t, 'date') >= start && str(t, 'date') <= end && str(t, 'date') <= asOf);
  const installments = installmentExpenses(s, start, end, fullInvoiceMonths, asOf);
  const sum = (list: typeof tx) => list.reduce((a, t) => a.plus(str(t, 'amount')), D(0));
  const income = sum(tx.filter(t => t.type === 'income'));
  const yields = sum(tx.filter(t => t.type === 'yield'));
  const cashExpense = sum(tx.filter(t => t.type === 'expense')).abs();
  const cardExpense = sum(installments);
  const invoicePayments = sum(tx.filter(t => t.type === 'invoice_payment')).abs();
  const expenses = cashExpense.plus(cardExpense);
  const receipts = income.plus(yields);
  const net = receipts.minus(expenses);
  return { income: money(income), yields: money(yields), cashExpense: money(cashExpense), cardExpense: money(cardExpense), purchaseTotal: money(sum(purchases)), expenses: money(expenses), receipts: money(receipts), net: money(net), invoicePayments: money(invoicePayments), cashNet: money(receipts.minus(cashExpense).minus(invoicePayments)), savingRate: receipts.gt(0) ? net.div(receipts).mul(100).toFixed(1) : null, tx, purchases, installments };
}
export function periodCategoryTotals(s: Snapshot, start: string, end: string, fullInvoiceMonths = false, parentId?: string) {
  const metrics = periodMetrics(s, start, end, fullInvoiceMonths);
  return aggregateCategories(rows(s, 'categories'), [...metrics.tx.filter(t => t.type === 'expense'), ...metrics.installments], parentId);
}
export function budgetMetrics(s: Snapshot, budget: Record<string, string | boolean | null>, asOf = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())) {
  const month = str(budget, 'month').slice(0, 7);
  const metrics = periodMetrics(s, `${month}-01`, monthEnd(month), true, asOf);
  const spent = [...metrics.tx.filter(t => t.type === 'expense'), ...metrics.installments].filter(t => categoryMatches(rows(s, 'categories'), str(t, 'category_id'), str(budget, 'category_id'))).reduce((a, t) => a.plus(D(str(t, 'amount')).abs()), D(0));
  const limit = str(budget, 'amount');
  return { spent: money(spent), limit, remaining: money(D(limit).minus(spent)), percent: D(limit).gt(0) ? spent.div(limit).mul(100).toFixed(1) : '0.0' };
}
export function dashboardModel(s: Snapshot, start: string, end: string, period: string, today: string) {
  const fullInvoiceMonths = ['month', 'previous'].includes(period);
  const current = periodMetrics(s, start, end, fullInvoiceMonths, today);
  const previousRange = comparisonRange(start, end, period);
  const previous = periodMetrics(s, previousRange.start, previousRange.end, fullInvoiceMonths, today);
  const invoices = cardInvoices(s, today);
  const month = end.slice(0, 7);
  const monthlyInvoices = invoices.filter(i => i.month === month);
  const due = invoices.filter(i => D(i.pending).gt(0) && i.due <= monthEnd(today.slice(0, 7)));
  const categoryTotals = aggregateCategories(rows(s, 'categories'), [...current.tx.filter(t => t.type === 'expense'), ...current.installments]);
  const history = Array.from({ length: 6 }, (_, index) => {
    const key = shiftInvoiceMonth(month, index - 5);
    const rangeEnd = key === month ? end : monthEnd(key);
    return { month: key, ...periodMetrics(s, `${key}-01`, rangeEnd, true, today) };
  });
  const budgets = rows(s, 'budgets').filter(b => str(b, 'month').slice(0, 7) === month).map(b => ({ id: str(b, 'id'), name: str(b, 'name'), ...budgetMetrics(s, b, today) }));
  const pendingExpenses = rows(s, 'transactions').filter(t => t.status === 'pending' && t.type === 'expense' && str(t, 'date') <= monthEnd(today.slice(0, 7))).reduce((a, t) => a.plus(D(str(t, 'amount')).abs()), D(0));
  const cash = rows(s, 'account_balances').filter(a => a.kind !== 'savings').reduce((a, t) => a.plus(str(t, 'balance')), D(0));
  const commitments = forecastItems(s, today, monthEnd(today.slice(0,7))).filter(item => D(item.amount).lt(0));
  const totalCommitments = commitments.reduce((a,item) => a.plus(D(item.amount).abs()),D(0));
  const remainingAfterCommitments = cash.minus(totalCommitments);
  const pendingObligations = commitments.filter(item => item.kind === 'obligation').reduce((a,item) => a.plus(D(item.amount).abs()),D(0));
  const recurringExpenses = commitments.filter(item => item.source === 'recurring').reduce((a,item) => a.plus(D(item.amount).abs()),D(0));
  const upcoming = Array.from({ length: 6 }, (_, offset) => {
    const key = shiftInvoiceMonth(month, offset + 1);
    return { month: key, ...invoiceTotals(invoices.filter(i => i.month === key)) };
  });
  const overallCash = rows(s, 'transactions').filter(t => t.status === 'confirmed' && t.type === 'expense' && str(t, 'date') <= today).reduce((a, t) => a.plus(D(str(t, 'amount')).abs()), D(0));
  const overallPurchases = rows(s, 'credit_card_purchases').filter(p => str(p, 'date') <= today).reduce((a, p) => a.plus(str(p, 'amount')), D(0));
  const overall = { expenses: money(overallCash.plus(overallPurchases)), cashExpenses: money(overallCash), purchaseTotal: money(overallPurchases), committed: invoiceTotals(invoices).pending, future: invoiceTotals(invoices.filter(i => i.month > month)).pending };
  const elapsed = Math.max(1, Math.round((Date.parse(end < today ? end : today) - Date.parse(start)) / 86400000) + 1);
  const recent = [
    ...current.tx.map(t => ({ id: str(t, 'id'), description: str(t, 'description'), date: str(t, 'date'), amount: str(t, 'amount'), kind: str(t, 'type'), account: str(rows(s, 'financial_accounts').find(a => a.id === t.account_id) ?? {}, 'name'), category: categoryLabel(rows(s, 'categories'), str(t, 'category_id'), ' / ') })),
    ...current.purchases.map(t => ({ id: str(t, 'id'), description: str(t, 'description'), date: str(t, 'date'), amount: money(D(str(t, 'amount')).neg()), kind: 'card', account: str(rows(s, 'credit_cards').find(a => a.id === t.card_id) ?? {}, 'name'), category: categoryLabel(rows(s, 'categories'), str(t, 'category_id'), ' / ') })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  return { current, previous, fullInvoiceMonths, overall, previousRange, month, monthlyInvoices, invoiceTotals: invoiceTotals(monthlyInvoices), upcoming, due, pendingExpenses: money(pendingExpenses), pendingObligations: money(pendingObligations), recurringExpenses: money(recurringExpenses), totalCommitments: money(totalCommitments), commitmentDeficit: money(remainingAfterCommitments.lt(0) ? remainingAfterCommitments.neg() : 0), afterCommitments: money(remainingAfterCommitments.gt(0) ? remainingAfterCommitments : 0), categories: categoryTotals, history, budgets, dailyAverage: money(D(current.expenses).div(elapsed)), recent };
}
