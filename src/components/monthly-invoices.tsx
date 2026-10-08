"use client";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cardInvoices, invoiceMonthLabel, invoiceTotals, shiftInvoiceMonth, type CardInvoice } from "@/lib/card-invoices";
import { rows, str, type Snapshot } from "@/lib/summary";
import { D } from "@/financial/engine";

const brl = (value: string) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
const dateLabel = (value: string) => value ? value.split("-").reverse().join("/") : "—";

export function InvoiceMonthPicker({ month, today, onChange }: { month: string; today: string; onChange: (month: string) => void }) {
  return <div className="invoice-month-picker">
    <button aria-label="Mês anterior" onClick={() => onChange(shiftInvoiceMonth(month, -1))}><ChevronLeft size={18} /></button>
    <input aria-label="Mês das faturas" type="month" value={month} onChange={event => {
      if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) onChange(event.target.value);
    }} />
    <button aria-label="Próximo mês" onClick={() => onChange(shiftInvoiceMonth(month, 1))}><ChevronRight size={18} /></button>
    <button onClick={() => onChange(today.slice(0, 7))}>Mês atual</button>
  </div>;
}

export function MonthlyInvoices({ snapshot, month, today, onMonthChange, onPay }: {
  snapshot: Snapshot; month: string; today: string;
  onMonthChange: (month: string) => void; onPay: (invoice: CardInvoice) => void;
}) {
  const [cardId, setCardId] = useState("");
  const invoices = useMemo(() => cardInvoices(snapshot, today), [snapshot, today]);
  const matching = invoices.filter(invoice => !cardId || invoice.cardId === cardId);
  const selected = matching.filter(invoice => invoice.month === month);
  const totals = invoiceTotals(selected);
  return <div className="monthly-invoices">
    <label className="invoice-card-filter">Cartão
      <select aria-label="Filtrar faturas por cartão" value={cardId} onChange={event => setCardId(event.target.value)}>
        <option value="">Todos os cartões</option>
        {rows(snapshot, "credit_cards").map(card => <option key={str(card, "id")} value={str(card, "id")}>{str(card, "name")}</option>)}
      </select>
    </label>
    <div className="invoice-totals" aria-label="Resumo mensal das faturas">
      <div><span>Total das faturas do mês</span><strong>{brl(totals.total)}</strong></div>
      <div><span>Pago nas faturas do mês</span><strong>{brl(totals.paid)}</strong></div>
      <div><span>A pagar no mês</span><strong>{brl(totals.pending)}</strong></div>
    </div>
    {D(totals.credit).gt(0) && <p className="notice">Crédito em faturas: {brl(totals.credit)}. Não descontado de outros cartões.</p>}
    {!selected.length && <p className="notice">Nenhuma fatura registrada com vencimento neste mês.</p>}
    {selected.map(invoice => <article key={invoice.id} className="monthly-invoice" aria-label={`Fatura de ${invoice.cardName}`}>
      <div className="monthly-invoice-heading">
        <div><h3>{invoice.cardName}</h3><p>Vencimento {dateLabel(invoice.due)} · fechamento {dateLabel(invoice.closing)}</p></div>
        <span className={`badge ${invoice.status === "Paga" ? "green" : ""}`}>{invoice.status}</span>
      </div>
      <div className="invoice-totals invoice-values">
        <div><span>Total desta fatura</span><strong>{brl(invoice.total)}</strong></div>
        <div><span>Pago nesta fatura</span><strong>{brl(invoice.paid)}</strong></div>
        <div><span>Falta pagar</span><strong>{brl(invoice.pending)}</strong></div>
      </div>
      {D(invoice.credit).gt(0) && <p>Crédito: {brl(invoice.credit)}</p>}
      <div className="monthly-invoice-actions">
        <details>
          <summary>Ver parcelas ({invoice.installments.length})</summary>
          <div className="table-wrap"><table>
            <thead><tr><th>Compra</th><th>Data da compra</th><th>Parcela</th><th>Valor nesta fatura</th></tr></thead>
            <tbody>{invoice.installments.map(part => <tr key={part.id}>
              <td>{part.description}</td><td>{dateLabel(part.purchaseDate)}</td>
              <td>{part.number}/{part.count || "—"}</td><td>{brl(part.amount)}</td>
            </tr>)}</tbody>
          </table></div>
        </details>
        {D(invoice.pending).gt(0) && <button onClick={() => onPay(invoice)}>Registrar pagamento</button>}
      </div>
    </article>)}
    <h3 className="upcoming-invoices-title">Próximas faturas</h3>
    <p className="upcoming-invoices-note">Por mês de vencimento, considerando apenas compras registradas. Selecione um mês para ver as parcelas.</p>
    <div className="upcoming-invoices-grid">
      {Array.from({ length: 6 }, (_, offset) => {
        const upcoming = shiftInvoiceMonth(month, offset + 1);
        const items = matching.filter(invoice => invoice.month === upcoming);
        const preview = invoiceTotals(items);
        return <button key={upcoming} onClick={() => onMonthChange(upcoming)}>
          <span>{invoiceMonthLabel(upcoming)}</span><strong>{brl(preview.pending)}</strong>
          <small>{items.length ? `A pagar · total da fatura: ${brl(preview.total)}` : "Sem lançamentos"}</small>
        </button>;
      })}
    </div>
  </div>;
}
