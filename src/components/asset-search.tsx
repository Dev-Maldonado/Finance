"use client";
import { useState } from "react";
export function AssetSearch() {
  const [query, setQuery] = useState(""),
    [kind, setKind] = useState("fund"),
    [result, setResult] = useState<Record<string, string>[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Pesquisar ativos e fundos</h2>
          <p>
            Cadastro CVM sincronizado ou provedor de mercado, conforme
            disponibilidade.
          </p>
        </div>
      </div>
      <form
        className="import-controls"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage("");
          try {
            const r = await fetch(
              `/api/assets?query=${encodeURIComponent(query)}&kind=${kind}`,
            );
            const body = await r.json();
            if (!r.ok) throw new Error(body.error);
            setResult(body.results);
            if (!body.results.length)
              setMessage(
                "Nenhum resultado disponível. Você pode cadastrar o ativo manualmente.",
              );
          } catch (e) {
            setMessage(
              e instanceof Error ? e.message : "Provedor indisponível",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Nome, ticker ou CNPJ
          <input
            minLength={2}
            required
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          Fonte
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="fund">Fundos · CVM</option>
            <option value="market">Ativos listados · brapi</option>
          </select>
        </label>
        <button disabled={busy}>{busy ? "Consultando…" : "Pesquisar"}</button>
      </form>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {result.map((r, i) => (
        <div className="list-row" key={i}>
          <strong>{r.name || r.longName}</strong>
          <span>{r.cnpj || r.stock || r.symbol}</span>
          <small>{r.share_class || r.sector}</small>
        </div>
      ))}
    </section>
  );
}
