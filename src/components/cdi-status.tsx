'use client';
import { D } from '@/financial/engine';
import { RefreshCw, ShieldCheck, Radio, CircleAlert } from 'lucide-react';
import { rows, str, type Snapshot } from '@/lib/summary';
import { savingsMetrics } from '@/lib/savings-metrics';
import { unallocatedYieldWithdrawalNotice } from '@/financial/savings-estimate';
const brl = (v: string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v));
const date = (v: string) => v ? v.split('-').reverse().join('/') : 'sem histórico';
export type BenchmarkStatus = { checkedAt?: string; error?: string; results?: { series: string; status: string; lastDate?: string | null; message?: string }[] };
const timestamp = (value: string) => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value)) : 'não registrada';
export function benchmarkHealth(snapshot: Snapshot, series: string, today: string, status?: BenchmarkStatus) {
  const provider = series === '12' ? 'bcb-cdi' : 'bcb-selic';
  const state = rows(snapshot, 'provider_sync_states').find(s => s.provider === provider);
  const latest = rows(snapshot, 'benchmark_rates').filter(r => r.series === series && r.validated !== false && str(r, 'date') <= today).sort((a, b) => str(a, 'date').localeCompare(str(b, 'date'))).at(-1);
  const log = rows(snapshot, 'provider_sync_logs').filter(l => l.provider === provider).sort((a, b) => Date.parse(str(b, 'started_at')) - Date.parse(str(a, 'started_at'))).at(0);
  const manual = status?.results?.find(r => r.series === series);
  const manualNewer = !!status?.checkedAt && (!log || Date.parse(status.checkedAt) >= Date.parse(str(log, 'started_at')));
  const logFailed = log?.status === 'error' && (!str(state ?? {}, 'last_success') || Date.parse(str(log, 'started_at')) > Date.parse(str(state ?? {}, 'last_success')));
  // A failed browser/server request does not establish that either BCB series failed.
  const failed = Boolean(manualNewer && manual?.status === 'success' ? false : (manual?.status === 'error' && manualNewer) || logFailed);
  const stale = !!latest && Date.parse(today) - Date.parse(str(latest, 'date')) > 5 * 86400000;
  return { latest, lastSync: str(state ?? {}, 'last_success'), lastAttempt: manualNewer ? status?.checkedAt : str(log ?? {}, 'started_at'), failed, stale, cached: manualNewer && manual?.status === 'cached', message: manual?.message || (manual?.status === 'error' ? 'Falha na consulta; histórico válido preservado.' : '') };
}
export function CDIStatus({ snapshot, today, status, updating, onRefresh }: { snapshot: Snapshot; today: string; status?: BenchmarkStatus; updating?: boolean; onRefresh: () => void }) {
  const metrics = savingsMetrics(snapshot, today);
  const latest = metrics.latestCDI;
  const automatic = rows(snapshot, "savings_lots").some(lot => ["cdi", "selic", "fixed"].includes(str(lot, "indexer")) && D(str(lot, "remaining")).gt(0));
  const health = ['12', '11'].map(series => ({ series, name: series === '12' ? 'CDI' : 'Selic', ...benchmarkHealth(snapshot, series, today, status) }));
  const cdi = health[0];
  const checkedAt = cdi.lastAttempt || status?.checkedAt;
  const lastSync = cdi.lastSync;
  const failed = cdi.failed || !!status?.error;
  return <section className="cdi-status" aria-label="Atualização automática do CDI">
    <div className="cdi-status-title"><span className="cdi-mark"><Radio size={19} /></span><div><strong>{automatic ? "Seu dinheiro rende a cada dia útil" : "Taxas oficiais para acompanhar suas caixinhas"}</strong><p>{automatic ? "CDI oficial do Banco Central · cálculo automático por aplicação" : "Taxas disponíveis · cada aplicação segue suas condições"}</p></div><button aria-label="Atualizar CDI" disabled={updating} onClick={onRefresh}><RefreshCw size={15} className={updating ? 'spinning' : ''} />{updating ? 'Atualizando' : 'Atualizar CDI'}</button></div>
    <div className="cdi-metrics">
      <div><span>CDI diário publicado</span><strong>{latest ? `${Number(latest.value).toLocaleString('pt-BR', { maximumFractionDigits: 6 })}%` : 'Indisponível'}</strong><small>Referência: {date(str(latest ?? {}, 'date'))}</small></div>
      <div><span>Ganho no último dia disponível</span><strong>{metrics.unallocatedYieldWithdrawal ? 'Conciliação pendente' : brl(metrics.daily)}</strong><small>Bruto estimado · percentual de cada lote</small></div>
      <div><span>Rendimento neste mês</span><strong>{metrics.unallocatedYieldWithdrawal ? 'Conciliação pendente' : brl(metrics.monthly)}</strong><small>Bruto estimado · inclui ganhos de lotes resgatados</small></div>
    </div>
    <div className="benchmark-health" aria-label="Saúde dos indexadores">{health.map(item => <article key={item.series} className={item.failed || item.stale ? 'needs-attention' : ''} aria-label={`Saúde do ${item.name}`}><div><strong>{item.name} · Banco Central</strong><span>{item.failed ? 'Consulta com falha' : !item.latest ? 'Sem taxa válida' : item.stale ? 'Referência defasada' : item.cached ? 'Cache válido' : 'Histórico disponível'}</span></div><dl><div><dt>Última taxa oficial</dt><dd>{item.latest ? `${date(str(item.latest, 'date'))} · ${Number(item.latest.value).toLocaleString('pt-BR', { maximumFractionDigits: 6 })}% ao dia` : 'Ainda não disponível'}</dd></div><div><dt>Último sucesso no BCB</dt><dd>{timestamp(item.lastSync)}</dd></div><div><dt>Última verificação</dt><dd>{timestamp(item.lastAttempt ?? '')}</dd></div></dl>{item.failed && <p><CircleAlert size={13} />{item.message || 'Falha na última consulta; as taxas armazenadas continuam disponíveis.'}</p>}{item.stale && <p>Referência há mais de cinco dias corridos; confira a atualização antes de avaliar o rendimento.</p>}</article>)}</div>
    <p className={failed ? 'cdi-warning' : 'cdi-footnote'}><ShieldCheck size={13} />{failed ? (status?.error || 'BCB indisponível para o CDI. Cálculo preservado até a última taxa armazenada.') : checkedAt ? `Verificação no servidor: ${timestamp(checkedAt)}.` : lastSync ? `Última sincronização registrada: ${timestamp(lastSync)}.` : 'Aguarde a primeira verificação no servidor.'} Sem extrapolar taxas nos dias sem publicação. Valores estimados, sem conexão com saldo bancário.</p>
    {!failed && checkedAt && <p className="cdi-footnote">{lastSync ? `Taxas consultadas no BCB em ${timestamp(lastSync)}. ` : ''}{cdi.cached ? 'Histórico válido reutilizado; próxima consulta respeita o cache de quatro horas.' : 'Última consulta registrada no BCB; valores oficiais preservados.'}</p>}
    {metrics.details.some(d => d.waitingForRate) && <p className="cdi-footnote" role="status">Aguardando primeira taxa publicada para os aportes desde {date(metrics.details.filter(d => d.waitingForRate).map(d => d.waitingSince!).sort()[0])}. A taxa anterior ao aporte não é aplicada; o rendimento começa quando houver taxa oficial elegível.</p>}
    {metrics.details.some(d => !d.complete) && <p className="cdi-warning">Há aplicações com histórico parcial ou metodologia manual. A atualização busca taxas antigas em etapas; confira a data-base de cada caixinha.</p>}
    {metrics.unallocatedYieldWithdrawal && <p className="cdi-warning" role="status">{unallocatedYieldWithdrawalNotice}</p>}
  </section>;
}
