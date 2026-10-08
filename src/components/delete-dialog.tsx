"use client";
import { useEffect, useRef, useState } from "react";
import { post } from "./dialog";
import { Row, str } from "@/lib/summary";

export function DeleteDialog({ kind, row, onClose, onSaved }: {
  kind: "transaction" | "purchase"; row: Row; onClose: () => void; onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} className="dialog" onCancel={onClose}>
    <form onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError("");
      try {
        await post(kind === "purchase" ? "/api/purchases" : "/api/transactions", {
          [kind === "purchase" ? "purchase_id" : "transaction_id"]: row.id, cancel: true,
        });
        onSaved(); onClose();
      } catch (e) { setError(e instanceof Error ? e.message : "Falha ao excluir"); }
      finally { setBusy(false); }
    }}>
      <div className="dialog-head"><h2>Excluir {kind === "purchase" ? "compra" : "lançamento"}?</h2></div>
      <p>{str(row, "description")}</p>
      <p className="notice">O registro sai dos totais{kind === "purchase" ? " e as parcelas são removidas das faturas" : " e o saldo é recalculado"}. O histórico da alteração é preservado.</p>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="actions">
        <button type="button" onClick={onClose} disabled={busy}>Voltar</button>
        <button className="primary" disabled={busy}>{busy ? "Excluindo…" : "Excluir"}</button>
      </div>
    </form>
  </dialog>;
}
