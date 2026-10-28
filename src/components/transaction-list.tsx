"use client";
import {useRef} from 'react';
import {ArrowUpRight,ArrowDownLeft,AlertTriangle} from 'lucide-react';
import {D} from '@/financial/engine';
import {rows,str,type Row,type Snapshot} from '@/lib/summary';
import {categoryLabel} from '@/lib/categories';
import {isSettled,transactionStatus} from '@/lib/transaction-state';
import {useReadableAmounts} from './use-readable-amounts';
import type {SettlementTarget} from './settlement-dialog';
const brl=(v:string)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v));
const pretty=(v:string)=>v.split('-').reverse().join('/');
export function TransactionList({list,snapshot,today,onEditPurchase,onRemovePurchase,onEditTransaction,onRemoveTransaction,onSettle}:{list:Row[];snapshot:Snapshot;today:string;onEditPurchase:(r:Row)=>void;onRemovePurchase:(r:Row)=>void;onEditTransaction:(r:Row)=>void;onRemoveTransaction:(r:Row)=>void;onSettle:(r:SettlementTarget)=>void}) {
 const root=useRef<HTMLDivElement>(null);useReadableAmounts(root);
 return (
      <div className="table-wrap transaction-list" ref={root} tabIndex={0} role="region" aria-label="Histórico de transações">
        <table>
          <thead>
            <tr>
              <th>Descrição</th>
              <th>Categoria</th>
              <th>Origem</th>
              <th>Data</th>
              <th>Status</th>
              <th className="right">Valor</th>
              <th className="transaction-actions">Ações</th>
            </tr>
          </thead>
          <tbody>
            {list.map((t) => (
              <tr key={str(t, "id")}>
                <td>
                  <span
                    className={`transaction-icon ${D(str(t, "amount")).lt(0) ? "out" : "in"}`}
                  >
                    {D(str(t, "amount")).lt(0) ? (
                      <ArrowUpRight size={17} />
                    ) : (
                      <ArrowDownLeft size={17} />
                    )}
                  </span>
                  <span>
                    <strong>{str(t, "description")}</strong>
                    <small>
                      {
                        (
                          {
                            income: "Receita",
                            expense: "Despesa",
                            transfer: "Transferência",
                            invoice_payment: "Pagamento de fatura",
                            investment: "Investimento",
                            yield: "Rendimento",
                            adjustment: "Ajuste",
                          } as Record<string, string>
                        )[str(t, "type")]
                      }
                    </small>
                    {t.projected && <small>Gasto fixo previsto · recorrência</small>}
                    {t.origin === "card" && <small className="installment-detail">Parcela {str(t, "number")} de {str(t, "installment_count")} · {brl(D(str(t, "amount")).abs().toFixed(2))}<br />Total da compra: {brl(str(t, "purchase_total"))} · Compra em {pretty(str(t, "purchase_date"))}</small>}
                    {t.type === "income" && t.status === "pending" && str(t, "date") < today && (
                      <small className="pending-receipt-warning" title="A data prevista passou. Edite o lançamento para confirmar o recebimento ou corrigir a data.">
                        <AlertTriangle size={13} aria-hidden="true" /> Recebimento em atraso
                      </small>
                    )}
                  </span>
                </td>
                <td data-label="Categoria">
                  {snapshot ? categoryLabel(rows(snapshot, "categories"), str(t, "category_id"), " / ") : "—"}
                </td>
                <td data-label="Origem">
                  {t.origin === "card" ? `Cartão · ${str(t, "card_name")}` : (snapshot &&
                    rows(snapshot, "financial_accounts").find(
                      (c) => c.id === t.account_id,
                    )?.name) ||
                    "—"}
                </td>
                <td data-label="Data"><span className="transaction-due-label">{t.origin==='card'?'Vencimento da fatura':'Vencimento / competência'}</span>{pretty(str(t, "date"))}{t.origin!=='card'&&t.settled_on&&<small>{t.type==='income'?'Recebido':'Pago'}: {pretty(str(t,'settled_on'))}</small>}</td>
                <td data-label="Status">
                  <span
                    className={`badge ${t.status === "cancelled" ? "muted" : t.origin==='card' ? t.status==='confirmed'?'green':'amber' : isSettled(t,today)?'green':'amber'}`}
                  >
                    {t.origin === "card" && t.status !== "cancelled" ? str(t, "invoice_status") : transactionStatus(t,today)}
                  </span>
                </td>
                <td data-label="Valor"
                  className={`right amount ${D(str(t, "amount")).lt(0) ? "negative" : "positive"}`}
                >
                  <strong>{brl(str(t, "amount"))}</strong>
                </td>
                <td className="transaction-actions">
                  {t.status==='cancelled' && str(t,'source_id').startsWith('recurrence:') && <button onClick={()=>onRemoveTransaction(t)}>Remover do histórico</button>}
                  {t.origin === "card" && t.status !== "cancelled" && (() => {
                    const purchase = rows(snapshot, "credit_card_purchases").find(p => p.id === t.purchase_id);
                    return purchase ? <div className="actions"><button onClick={() => onEditPurchase(purchase)}>Editar compra</button><button onClick={() => onRemovePurchase(purchase)}>Excluir compra</button></div> : null;
                  })()}
                  {["income", "expense", "yield", "adjustment"].includes(
                    str(t, "type"),
                  ) &&
                    t.origin !== "card" && !t.group_id &&
                    t.status !== "cancelled" && (
                      <div className="actions">
                        {['income','expense'].includes(str(t,'type'))&&!t.linked_income_id&&!isSettled(t,today)&&<button onClick={()=>onSettle({transaction:t.projected?undefined:t,recurrenceId:t.projected?str(t,'recurrence_id'):undefined,occurrenceDate:t.projected?str(t,'occurrence_date'):undefined,description:str(t,'description'),amount:D(str(t,'amount')).abs().toFixed(2),due:str(t,'date'),accountId:str(t,'account_id'),type:t.type==='income'?'income':'expense'})}>{t.type==='income'?'Receber':'Pagar'}</button>}
                        <button
                          onClick={() => onEditTransaction(t)}
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => onRemoveTransaction(t)}
                        >
                          Excluir
                        </button>
                      </div>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
 );
}
