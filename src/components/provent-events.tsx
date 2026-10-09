"use client";
import { useState } from "react";
import { Snapshot, rows, str } from "@/lib/summary";
import {
  D,
  money,
  position,
  Operation,
  CorporateEvent,
} from "@/financial/engine";
import { post } from "./dialog";
export function ProventEvents({
  snapshot,
  onSaved,
}: {
  snapshot: Snapshot;
  onSaved: () => void;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const events = rows(snapshot, "asset_cash_events")
    .flatMap((event) =>
      rows(snapshot, "investment_assets")
        .filter((a) => a.ticker === event.ticker)
        .map((asset) => {
          const ops = [
            ...rows(snapshot, "investment_operations"),
            ...rows(snapshot, "investment_opening_positions").map((p) => ({
              ...p,
              asset_id: p.asset_id,
              date: p.date,
              type: "buy",
              price: "1",
              fees: "0",
              cost_override: p.cost,
            })),
          ].filter(
            (o) =>
              o.asset_id === asset.id &&
              str(o, "date") <= str(event, "date_com"),
          ) as unknown as Operation[];
          const corporate = rows(
            snapshot,
            "investment_corporate_actions",
          ).filter(
            (e) =>
              e.asset_id === asset.id &&
              str(e, "date") <= str(event, "date_com"),
          ) as unknown as CorporateEvent[];
          const quantity = position(ops, corporate).quantity;
          return {
            event,
            asset,
            quantity,
            total: money(D(quantity).mul(str(event, "rate"))),
            source_id: `brapi:${event.id}:${asset.id}`,
          };
        }),
    )
    .filter((e) => D(e.quantity).gt(0) && D(e.total).gt(0));
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Proventos publicados pelo provedor</h2>
          <p>
            Posição elegível na data-com. Anúncios não representam recebimentos
            confirmados.
          </p>
        </div>
      </div>
      {events.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ativo</th>
                <th>Evento</th>
                <th>Data-com</th>
                <th>Pagamento divulgado</th>
                <th>Valor elegível</th>
                <th>Fonte</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.source_id}>
                  <td>{e.asset.ticker}</td>
                  <td>{e.event.label}</td>
                  <td>{e.event.date_com}</td>
                  <td>{e.event.payment_date}</td>
                  <td>
                    {new Intl.NumberFormat("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    }).format(Number(e.total))}
                  </td>
                  <td>{e.event.source}</td>
                  <td>
                    {rows(snapshot, "investment_income").some(
                      (i) => i.source_id === e.source_id,
                    ) ? (
                      "Registrado"
                    ) : (
                      <button
                        disabled={busy !== null}
                        onClick={async () => {
                          setBusy(e.source_id);
                          try {
                            await post("/api/data/investment_income", {
                              data: {
                                asset_id: e.asset.id,
                                description: `${e.event.label} · ${e.asset.ticker}`,
                                amount: e.total,
                                date: e.event.payment_date,
                                type: str(e.event, "label")
                                  .toUpperCase()
                                  .includes("JCP")
                                  ? "jcp"
                                  : str(e.event, "label")
                                        .toUpperCase()
                                        .includes("AMORT")
                                    ? "amortization"
                                    : "dividend",
                                source_id: e.source_id,
                              },
                            });
                            setMessage(
                              "Anúncio registrado; confirme somente após receber.",
                            );
                            onSaved();
                          } catch (error) {
                            setMessage(
                              error instanceof Error
                                ? error.message
                                : "Falha ao registrar",
                            );
                          } finally {
                            setBusy(null);
                          }
                        }}
                      >
                        {busy === e.source_id
                          ? "Registrando…"
                          : "Registrar anúncio"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="notice">
          Nenhum evento publicado disponível para uma posição elegível
          cadastrada.
        </p>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
    </section>
  );
}
