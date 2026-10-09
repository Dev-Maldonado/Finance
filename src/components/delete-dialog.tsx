"use client";
import { useEffect, useId, useRef, useState } from "react";
import { requestJson } from "@/lib/client-request";
import { Row, str } from "@/lib/summary";

export type RemovalKind =
  | "transaction"
  | "purchase"
  | "investment"
  | "income"
  | "category"
  | "budget"
  | "financialGoal"
  | "recurring";
const labels: Record<RemovalKind, string> = {
  transaction: "lançamento",
  purchase: "compra",
  investment: "operação de investimento",
  income: "provento",
  category: "categoria",
  budget: "orçamento",
  financialGoal: "meta",
  recurring: "recorrência",
};
const resources: Partial<Record<RemovalKind, string>> = {
  category: "categories",
  budget: "budgets",
  financialGoal: "financial_goals",
};
export function DeleteDialog({
  kind,
  row,
  onClose,
  onSaved,
}: {
  kind: RemovalKind;
  row: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    titleId = useId();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  const reverse = kind === "income" && row.status === "received";
  const verb =
    kind === "recurring" ? "Encerrar" : reverse ? "Estornar" : "Excluir";
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
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            const resource = resources[kind];
            const url =
              kind === "recurring"
                ? "/api/recurring"
                : resource
                  ? `/api/data/${resource}?id=${encodeURIComponent(str(row, "id"))}`
                  : kind === "purchase"
                    ? "/api/purchases"
                    : kind === "investment"
                      ? "/api/investments"
                      : kind === "income"
                        ? "/api/income"
                        : "/api/transactions";
            await requestJson(url, {
              method: resource ? "DELETE" : "POST",
              headers: { "Content-Type": "application/json" },
              body: resource
                ? undefined
                : JSON.stringify(
                    kind === "recurring"
                      ? { recurrence_id: row.id, cancel: true }
                      : {
                          [kind === "purchase"
                            ? "purchase_id"
                            : kind === "investment"
                              ? "operation_id"
                              : kind === "income"
                                ? "income_id"
                                : "transaction_id"]: row.id,
                          cancel: true,
                          request_id: crypto.randomUUID(),
                        },
                  ),
            });
            onSaved();
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Falha ao excluir");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="dialog-head">
          <h2 id={titleId}>
            {verb} {labels[kind]}?
          </h2>
        </div>
        <p>{str(row, "description") || str(row, "name")}</p>
        <p className="notice">
          {kind === "recurring"
            ? "Nenhum novo lançamento será gerado. Ocorrências futuras pendentes serão canceladas; o histórico confirmado e as ocorrências até hoje ficam preservados."
            : kind === "category"
              ? "A categoria e suas subcategorias deixam de aparecer nos novos cadastros. Os lançamentos, classificações e totais históricos serão preservados."
            : kind === "investment"
              ? "O saldo e a posição serão recalculados. A alteração será bloqueada se tornar a posição ou eventos posteriores inconsistentes; o histórico será preservado."
              : reverse
                ? "O recebimento vinculado será estornado e o saldo recalculado, com histórico da correção."
                : resources[kind]
                  ? "O cadastro será removido. Registros financeiros vinculados serão preservados; confira suas referências após a alteração."
                  : `O registro sai dos totais${kind === "purchase" ? " e as parcelas são removidas das faturas" : " e o saldo é recalculado"}. O histórico da alteração é preservado.`}
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Voltar
          </button>
          <button className="danger-button" disabled={busy}>
            {busy ? "Processando…" : verb}
          </button>
        </div>
      </form>
    </dialog>
  );
}
