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
  | "recurring"
  | "recurringRemoval"
  | "recurringTransaction";
const labels: Record<RemovalKind, string> = {
  transaction: "lançamento",
  purchase: "compra",
  investment: "operação de investimento",
  income: "provento",
  category: "categoria",
  budget: "orçamento",
  financialGoal: "meta",
  recurring: "recorrência",
  recurringRemoval: "recorrência",
  recurringTransaction: "lançamento recorrente",
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
  const [includeHistory,setIncludeHistory]=useState(false);
  const requestId=useRef(crypto.randomUUID());
  const recurringRemoval=kind==="recurringRemoval"||kind==="recurringTransaction";
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
              recurringRemoval ? "/api/recurring/removal" : kind === "recurring"
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
                    recurringRemoval ? {recurrence_id:kind==='recurringRemoval'?row.id:null,transaction_id:kind==='recurringTransaction'?row.id:null,include_history:includeHistory,request_id:requestId.current} : kind === "recurring"
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
          {kind === "recurringRemoval" ? (includeHistory ? "O cadastro e todas as suas ocorrências registradas serão excluídos da visualização e dos cálculos, inclusive as já pagas ou recebidas. O saldo das contas será recalculado. Outras recorrências não serão alteradas." : "O cadastro será retirado da lista e não gerará novas ocorrências. Os lançamentos já registrados, valores pagos e recebidos permanecerão nas transações.") : kind === "recurringTransaction" ? "Somente esta ocorrência será removida do histórico e dos totais, recalculando o saldo quando necessário. As demais ocorrências permanecem. O registro da correção é preservado e este lançamento não será gerado novamente." : kind === "recurring"
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
        {kind==='recurringRemoval' && <label>Histórico das ocorrências<select aria-label="Histórico das ocorrências" value={includeHistory?'all':'keep'} onChange={e=>setIncludeHistory(e.target.value==='all')} disabled={busy}><option value="keep">Somente o cadastro</option><option value="all">Cadastro e lançamentos</option></select></label>}
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
