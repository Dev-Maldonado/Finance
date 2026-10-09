"use client";
import { RefreshCw, CircleAlert } from 'lucide-react';
import type { QuoteStatus as Status } from '@/integrations/quote-sync';
export function QuoteStatus({ data, busy, refresh }: { data?: Status; busy: boolean; refresh: () => void }) {
  const failed = data?.results?.filter(result => result.status === 'error') ?? [];
  return <section className="panel quote-status" aria-label="Atualização das cotações">
    <div className="panel-head"><div><h2>Cotações automáticas</h2><p>Yahoo Finance sem token ou brapi configurada · verificação a cada 5 minutos enquanto o sistema está aberto, além do agendamento diário.</p></div><button onClick={refresh} disabled={busy}><RefreshCw size={15} className={busy ? 'spin' : ''} />{busy ? 'Verificando cotações…' : 'Verificar cotações'}</button></div>
    {data?.checkedAt && <p className="planning-note">Última verificação: {new Date(data.checkedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Preços e datas de referência aparecem na carteira; a API pode ter atraso e não publica preços novos com o mercado fechado.</p>}
    {(data?.error || failed.length > 0) && <div className="quote-warning" role="status"><CircleAlert size={16} aria-hidden="true" /><div>{data?.error || 'Algumas cotações não puderam ser atualizadas. Os preços anteriores foram preservados.'}{failed.map(result => <p key={result.ticker}><strong>{result.ticker}:</strong> {result.message}</p>)}</div></div>}
  </section>;
}
