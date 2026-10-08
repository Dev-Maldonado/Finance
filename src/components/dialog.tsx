"use client";
import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { FormDef } from "./forms";
import { Snapshot, rows, str, Row } from "@/lib/summary";
import { cardInvoices } from "@/lib/card-invoices";
import { D } from "@/financial/engine";
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
  const key = useRef(crypto.randomUUID());
  useEffect(() => {
    const d = dialog.current!;
    d.showModal();
    return () => d.close();
  }, []);
  function options(source?: string): [string, string][] {
    if (!source) return [];
    if (source === "invoices") {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
      return cardInvoices(snapshot, today).filter(invoice => D(invoice.pending).gt(0)).map(invoice => [
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
    };
    return rows(snapshot, table[source])
      .filter((r) =>
        source === "accounts"
          ? r.kind !== "savings" && !r.archived
          : source === "income"
            ? r.status === "announced"
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
    for (const f of form.fields) {
      const v = fd.get(f.key);
      data[f.key] =
        f.type === "checkbox"
          ? v === "on"
          : f.type === "decimal"
            ? String(v ?? "").replace(",", ".")
            : (v ?? "");
      if (!f.required && data[f.key] === "" && f.required === false)
        delete data[f.key];
    }
    try {
      if (form.endpoint === "/api/transactions" || form.endpoint === "/api/purchases")
        await post(form.endpoint, {
          [form.endpoint === "/api/transactions" ? "transaction_id" : "purchase_id"]: initial?.id,
          replacement: data,
        });
      else if (form.endpoint) await post(form.endpoint, data);
      else if (form.action)
        await post("/api/operations", {
          action: form.action,
          payload: data,
          request_id: key.current,
        });
      else await post(`/api/data/${form.resource}`, { data, id: initial?.id });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog ref={dialog} className="dialog" onCancel={onClose}>
      <form onSubmit={submit}>
        <div className="dialog-head">
          <div>
            <span className="eyebrow">ORGANIZE SUAS FINANÇAS</span>
            <h2>{initial ? form.editTitle || "Editar cadastro" : form.title}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X />
          </button>
        </div>
        <div className="form-grid">
          {form.fields.map((f) => (
            <label
              key={f.key}
              className={f.type === "checkbox" ? "checkbox" : ""}
            >
              {f.label}
              {f.source || f.options ? (
                <select
                  aria-label={f.label}
                  name={f.key}
                  required={f.required !== false}
                  defaultValue={str(initial ?? {}, f.key) || f.default || ""}
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
                  aria-label={f.label}
                  name={f.key}
                  type={f.type === "decimal" ? "text" : (f.type ?? "text")}
                  inputMode={f.type === "decimal" ? "decimal" : undefined}
                  required={f.required !== false && f.type !== "checkbox"}
                  defaultValue={
                    f.type === "checkbox"
                      ? undefined
                      : str(initial ?? {}, f.key) ||
                        f.default ||
                        (f.type === "date"
                          ? new Date().toLocaleDateString("en-CA")
                          : undefined)
                  }
                  defaultChecked={
                    f.type === "checkbox"
                      ? Boolean(initial?.[f.key])
                      : undefined
                  }
                  min={f.type === "number" ? 1 : undefined}
                  max={
                    f.key === "installments"
                      ? 120
                      : f.type === "number"
                        ? 28
                        : undefined
                  }
                />
              )}
            </label>
          ))}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-footer">
          <button type="button" onClick={onClose}>
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
