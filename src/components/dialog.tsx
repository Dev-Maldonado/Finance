"use client";
import { useState, useEffect, useRef, useId } from "react";
import { X } from "lucide-react";
import { FormDef } from "./forms";
import { installmentPreview, purchaseTotal, type PurchaseEntryMethod } from "@/lib/installments";
import { Snapshot, rows, str, Row } from "@/lib/summary";
import { cardInvoices } from "@/lib/card-invoices";
import { D } from "@/financial/engine";
import { CategoryPicker } from './category-picker';
import { categoryTree } from '@/lib/categories';
export async function post(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Falha ao salvar");
  return result;
}
export function Dialog({
  form,
  snapshot,
  initial,
  onClose,
  onSaved,
}: {
  form: FormDef;
  snapshot: Snapshot;
  initial?: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const formElement = useRef<HTMLFormElement>(null);
  const key = useRef(crypto.randomUUID());
  const titleId = useId();
  const [entryMethod, setEntryMethod] = useState<PurchaseEntryMethod>("total");
  const [entryValue, setEntryValue] = useState(str(initial ?? {}, "amount"));
  const entryValues = useRef<Partial<Record<PurchaseEntryMethod, string>>>({ total: str(initial ?? {}, "amount") });
  const [parcelCount, setParcelCount] = useState(Number(initial?.installments ?? 1));
  const [purchaseDate, setPurchaseDate] = useState(str(initial ?? {}, "date") || new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()));
  const [purchaseCard, setPurchaseCard] = useState(str(initial ?? {}, "card_id"));
  const [recurringExpense, setRecurringExpense] = useState(false);
  const [transactionType, setTransactionType] = useState(str(initial ?? {}, "type") || "expense");
  const purchaseTotalValue = form.purchaseCalculator ? purchaseTotal(entryValue.replace(",", "."), parcelCount, entryMethod) : null;
  const selectedCard = rows(snapshot, "credit_cards").find(card => card.id === purchaseCard);
  const preview = purchaseTotalValue && selectedCard ? installmentPreview(purchaseTotalValue, parcelCount, purchaseDate, Number(selectedCard.closing_day), Number(selectedCard.due_day)) : [];
  const canCreateRecurring = form.action === "transaction" && !initial?.id && transactionType === "expense";
  const activeFields = form.fields.filter(field => !(recurringExpense && canCreateRecurring && ["status", "notes"].includes(field.key)));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  useEffect(() => {
    const d = dialog.current!;
    d.showModal();
    return () => d.close();
  }, []);
  function options(source?: string): [string, string][] {
    if (!source) return [];
    if (source === 'category_roots') return categoryTree(rows(snapshot, 'categories')).filter(node => node.category.id !== initial?.id).map(node => [str(node.category, 'id'), str(node.category, 'name')]);
    if (source === "invoices") {
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
      }).format(new Date());
      return cardInvoices(snapshot, today)
        .filter((invoice) => D(invoice.pending).gt(0))
        .map((invoice) => [
          invoice.id,
          `${invoice.cardName} — ${invoice.due.split("-").reverse().join("/")} — ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(invoice.pending))} a pagar`,
        ]);
    }
    const table: Record<string, string> = {
      accounts: "financial_accounts",
      all_accounts: "financial_accounts",
      categories: "categories",
      cards: "credit_cards",
      goals: "savings_goals",
      assets: "investment_assets",
      invoices: "credit_card_invoices",
      income: "investment_income",
      liabilities: "financial_liabilities",
      obligations: "financial_obligations",
    };
    return rows(snapshot, table[source])
      .filter((r) =>
        source === "accounts"
          ? r.kind !== "savings" && !r.archived
          : source === "income"
            ? r.status === "announced"
            : source === "obligations"
              ? r.status === "pending"
              : source === "all_accounts"
                ? !r.archived
                : true,
      )
      .map((r) => [
        str(r, "id"),
        source === "invoices"
          ? `${rows(snapshot, "credit_cards").find((c) => c.id === r.card_id)?.name} — ${str(r, "due_date")}`
          : str(r, "name") || str(r, "description") || str(r, "ticker"),
      ]);
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(event.currentTarget);
    const data: Record<string, unknown> = {};
    for (const f of activeFields) {
      const v = fd.get(f.key);
      data[f.key] =
        f.type === "checkbox"
          ? v === "on"
          : f.type === "decimal"
            ? String(v ?? "").replace(",", ".")
            : (v ?? "");
      // Empty optional values are explicit so an edit can clear the stored field.
      if (f.required === false && data[f.key] === "" && f.type === "decimal")
        data[f.key] = null;
      if (f.required === false && f.type === "number" && data[f.key] === "")
        delete data[f.key];
    }
    try {
      if (form.resource === 'categories') {
        const normalized = String(data.name ?? '').trim().toLocaleLowerCase('pt-BR');
        const parentId = String(data.parent_id ?? '');
        if (rows(snapshot, 'categories').some(category => category.id !== initial?.id && !category.merged_into_id && !category.archived && str(category, 'parent_id') === parentId && str(category, 'name').trim().toLocaleLowerCase('pt-BR') === normalized)) throw new Error('Já existe uma categoria com esse nome neste agrupamento.');
        if (parentId && rows(snapshot, 'categories').some(category => category.parent_id === initial?.id && !category.merged_into_id && !category.archived)) throw new Error('Mova as subcategorias antes de transformar esta categoria principal em subcategoria.');
      }
      if (form.purchaseCalculator) {
        if (!purchaseTotalValue || !preview.length) throw new Error("Confira o valor, a quantidade de parcelas, a data e o cartão.");
        data.amount = purchaseTotalValue;
        data.entry_method = entryMethod;
        if (entryMethod === "installment") data.installment_amount = entryValue.replace(",", ".");
      }
      if (recurringExpense && canCreateRecurring) {
        const recurring = { description: data.description, type: "expense", amount: data.amount, account_id: data.account_id, category_id: data.category_id, next_date: data.date, frequency: fd.get("frequency"), end_date: fd.get("end_date") || null, active: true };
        await post("/api/data/recurring_transactions", { data: recurring });
      } else if (form.resource === "recurring_transactions" && initial?.id) {
        await post("/api/recurring", { recurrence_id: initial.id, replacement: data });
      } else if (form.endpoint === "/api/installments") {
        await post(form.endpoint, { installment_id: initial?.id, replacement: data, request_id: key.current });
      } else if (
        [
          "/api/transactions",
          "/api/purchases",
          "/api/investments",
          "/api/income",
        ].includes(form.endpoint ?? "")
      )
        await post(form.endpoint!, {
          [form.endpoint === "/api/transactions"
            ? "transaction_id"
            : form.endpoint === "/api/purchases"
              ? "purchase_id"
              : form.endpoint === "/api/income"
                ? "income_id"
                : "operation_id"]: initial?.id,
          replacement: data,
          request_id: key.current,
        });
      else if (form.endpoint) await post(form.endpoint, data);
      else if (form.action)
        await post("/api/operations", {
          action: form.action,
          payload: data,
          request_id: key.current,
        });
      else {
        await post(`/api/data/${form.resource}`, { data, id: initial?.id });

      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
    >
      <form ref={formElement} onSubmit={submit}>
        <div className="dialog-head">
          <div>
            <span className="eyebrow">ORGANIZE SUAS FINANÇAS</span>
            <h2 id={titleId}>
              {form.resource === 'categories' && initial?.parent_id ? initial?.id ? 'Editar subcategoria' : 'Nova subcategoria' : initial?.id ? form.editTitle || "Editar cadastro" : form.title}
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Fechar"
            disabled={busy}
          >
            <X />
          </button>
        </div>
        {form.purchaseCalculator && <fieldset className="purchase-method">
          <legend>Como deseja informar a compra?</legend>
          <label><input type="radio" name="entry_method" value="total" checked={entryMethod === "total"} onChange={() => { entryValues.current[entryMethod] = entryValue; setEntryValue(entryValues.current.total ?? purchaseTotalValue ?? ""); setEntryMethod("total"); }} /> Valor total da compra</label>
          <label><input type="radio" name="entry_method" value="installment" checked={entryMethod === "installment"} onChange={() => { entryValues.current[entryMethod] = entryValue; setEntryValue(entryValues.current.installment ?? (purchaseTotalValue ? D(purchaseTotalValue).div(parcelCount).toDecimalPlaces(2, 1).toFixed(2) : "")); setEntryMethod("installment"); }} /> Valor individual da parcela</label>
          <small>Ao informar o valor individual, todas as parcelas terão exatamente esse valor.</small>
        </fieldset>}
        {canCreateRecurring && <label className="checkbox recurring-toggle"><input type="checkbox" checked={recurringExpense} onChange={event => setRecurringExpense(event.target.checked)} /> Gasto Recorrente</label>}
        <div className="form-grid">
          {activeFields.map((f) => (
            <label
              key={f.key}
              className={f.type === "checkbox" ? "checkbox" : ""}
            >
              {form.purchaseCalculator && f.key === "amount" ? (entryMethod === "total" ? "Valor total da compra (R$)" : "Valor individual da parcela (R$)") : recurringExpense && f.key === "date" ? "Data de início" : f.label}
              {f.source === 'categories' ? <CategoryPicker categories={rows(snapshot, 'categories')} name={f.key} label={f.label} defaultValue={str(initial ?? {}, f.key) || f.default || ''} required={f.required !== false} /> : f.source || f.options ? (
                <select
                  aria-label={f.label}
                  name={f.key}
                  required={f.required !== false}
                  defaultValue={str(initial ?? {}, f.key) || f.default || (f.key === "type" ? "expense" : "")}
                  onChange={
                    form.purchaseCalculator && f.key === "card_id" ? event => setPurchaseCard(event.target.value) : f.key === "type" && form.action === "transaction" ? event => { setTransactionType(event.target.value); if (event.target.value !== "expense") setRecurringExpense(false); } : f.source === "income"
                      ? (event) => {
                          const income = rows(
                            snapshot,
                            "investment_income",
                          ).find((r) => r.id === event.target.value);
                          const amountInput =
                            formElement.current?.querySelector<HTMLInputElement>(
                              'input[name="received_amount"]',
                            );
                          if (amountInput)
                            amountInput.value = income
                              ? str(income, "amount")
                              : "";
                        }
                      : undefined
                  }
                >
                  <option value="">
                    {f.required === false ? "Nenhuma" : "Selecione"}
                  </option>
                  {(f.options ?? options(f.source)).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  aria-label={form.purchaseCalculator && f.key === "amount" ? (entryMethod === "total" ? "Valor total da compra (R$)" : "Valor individual da parcela (R$)") : recurringExpense && f.key === "date" ? "Data de início" : f.label}
                  name={f.key}
                  type={f.type === "decimal" ? "text" : (f.type ?? "text")}
                  inputMode={f.type === "decimal" ? "decimal" : undefined}
                  required={f.required !== false && f.type !== "checkbox"}
                  value={form.purchaseCalculator && f.key === "amount" ? entryValue : undefined}
                  onChange={form.purchaseCalculator ? event => { if (f.key === "amount") { setEntryValue(event.target.value); entryValues.current[entryMethod] = event.target.value; delete entryValues.current[entryMethod === "total" ? "installment" : "total"]; } else if (f.key === "installments") { setParcelCount(Number(event.target.value)); delete entryValues.current[entryMethod === "total" ? "installment" : "total"]; } else if (f.key === "date") setPurchaseDate(event.target.value); } : undefined}
                  defaultValue={
                    form.purchaseCalculator && f.key === "amount" ? undefined : f.type === "checkbox"
                      ? undefined
                      : str(initial ?? {}, f.key) ||
                        f.default ||
                        (f.type === "date" && f.required !== false && !initial
                          ? today
                          : undefined)
                  }
                  defaultChecked={
                    f.type === "checkbox"
                      ? initial?.[f.key] === undefined
                        ? f.default === "true"
                        : Boolean(initial?.[f.key])
                      : undefined
                  }
                  min={f.min ?? (f.type === "number" ? 1 : undefined)}
                  max={f.max ?? (f.key === "installments" ? 120 : undefined)}
                />
              )}
              {f.help && <small className="field-help">{f.help}</small>}
            </label>
          ))}
          {recurringExpense && canCreateRecurring && <>
            <label>Frequência<select name="frequency" aria-label="Frequência" defaultValue="monthly"><option value="weekly">Semanal</option><option value="monthly">Mensal</option><option value="annual">Anual</option></select></label>
            <label>Data de término (opcional)<input type="date" name="end_date" aria-label="Data de término (opcional)" /><small className="field-help">Em branco: por tempo indeterminado. Cada ocorrência fica pendente até sua confirmação.</small></label>
          </>}
        </div>
        {form.purchaseCalculator && <section className="installment-preview" aria-live="polite" aria-label="Prévia das parcelas">
          <h3>Prévia das parcelas e vencimentos</h3>
          {preview.length ? <><p><strong>Total: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(purchaseTotalValue))}</strong> · {parcelCount} parcelas</p><div className="table-wrap"><table><thead><tr><th>Parcela</th><th>Vencimento</th><th>Valor</th></tr></thead><tbody>{preview.map(part => <tr key={part.number}><td>{part.number}/{parcelCount}</td><td>{part.dueDate.split("-").reverse().join("/")}</td><td>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(part.amount))}</td></tr>)}</tbody></table></div><small>Somente a parcela do mês entra nos gastos mensais. Diferenças de centavos ficam na última parcela.</small></> : <p>Informe o cartão, a data, o valor e o número de parcelas para visualizar os vencimentos.</p>}
        </section>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-footer">
          <button type="button" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
