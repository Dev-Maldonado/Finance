import { D, money } from "@/financial/engine";
import { rows, str, type Snapshot } from "./summary";

export function shiftInvoiceMonth(month: string, offset: number) {
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

export function invoiceMonthLabel(month: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${month}-01T12:00:00Z`));
}

export function cardInvoices(snapshot: Snapshot, today: string) {
  const cards = new Map(rows(snapshot, "credit_cards").map(card => [card.id, card]));
  const purchases = new Map(rows(snapshot, "credit_card_purchases", true).map(purchase => [purchase.id, purchase]));
  return rows(snapshot, "credit_card_invoices").map(invoice => {
    const card = cards.get(invoice.card_id);
    const due = str(invoice, "due_date");
    const month = due.slice(0, 7);
    const closingMonth = Number(card?.due_day) <= Number(card?.closing_day)
      ? shiftInvoiceMonth(month, -1) : month;
    const closing = `${closingMonth}-${String(card?.closing_day || "1").padStart(2, "0")}`;
    const installments = rows(snapshot, "credit_card_installments")
      .filter(part => part.invoice_id === invoice.id && purchases.get(part.purchase_id)?.status !== "cancelled")
      .map(part => {
        const purchase = purchases.get(part.purchase_id);
        return {
          id: str(part, "id"), amount: str(part, "amount"),
          description: str(purchase || {}, "description") || "Compra registrada",
          number: str(part, "number"), count: str(purchase || {}, "installments"),
          purchaseDate: str(purchase || {}, "date"),
        };
      });
    const total = installments.reduce((sum, part) => sum.plus(part.amount), D(0));
    const paid = rows(snapshot, "credit_card_payments")
      .filter(payment => payment.invoice_id === invoice.id)
      .reduce((sum, payment) => sum.plus(str(payment, "amount")), D(0));
    const balance = total.minus(paid);
    const status = balance.lt(0) ? "Crédito"
      : balance.eq(0) && total.gt(0) ? "Paga"
      : total.eq(0) && paid.eq(0) ? "Sem lançamentos"
      : due < today ? "Atrasada"
      : paid.gt(0) ? "Parcialmente paga"
      : today >= closing ? "Fechada"
      : month > today.slice(0, 7) ? "Prevista" : "Em aberto";
    return {
      id: str(invoice, "id"), cardId: str(invoice, "card_id"),
      cardName: str(card || {}, "name") || "Cartão", accountId: str(card || {}, "account_id"),
      month, due, closing, total: money(total), paid: money(paid), balance: money(balance),
      pending: money(balance.gt(0) ? balance : 0), credit: money(balance.lt(0) ? balance.neg() : 0), status, installments,
    };
  }).sort((a, b) => a.due.localeCompare(b.due) || a.cardName.localeCompare(b.cardName));
}

export type CardInvoice = ReturnType<typeof cardInvoices>[number];

export function invoiceTotals(invoices: CardInvoice[]) {
  const sum = (key: "total" | "paid" | "pending" | "credit") =>
    money(invoices.reduce((total, invoice) => total.plus(invoice[key]), D(0)));
  return { total: sum("total"), paid: sum("paid"), pending: sum("pending"), credit: sum("credit") };
}
