'use client';
import { RefreshCw, ShieldCheck, Radio } from 'lucide-react';
import { rows, str, type Snapshot } from '@/lib/summary';
import { savingsMetrics } from '@/lib/savings-metrics';
const brl = (v: string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v));
const date = (v: string) => v ? v.split('-').reverse().join('/') : 'sem histórico';
export type BenchmarkStatus = { checkedAt?: string; error?: string; results?: { series: string; status: string; lastDate?: string | null }[] };
export function CDIStatus({ snapshot, today, status, updating, onRefresh }: { snapshot: Snapshot; today: string; status?: BenchmarkStatus; updating?: boolean; onRefresh: () => void }) {
  const metrics = savingsMetrics(snapshot, today);
  const latest = metrics.latestCDI;
  const state = rows(snapshot, 'provider_sync_states').find(s => s.provider === 'bcb-cdi');
  const checkedAt = status?.checkedAt;
  const lastSync = str(state ?? {}, 'last_success');
  const timestamp = (value: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value));
  const failed = status?.error || status?.results?.some(r => r.series === '12' && r.status === 'error');
  return <section className="cdi-status" aria-label="Atualização automática do CDI">
    <div className="cdi-status-title"><span className="cdi-mark"><Radio size={19} /></span><div><strong>Seu dinheiro rende a cada dia útil</strong><p>CDI oficial do Banco Central · cálculo automático por aplicação</p></div><button aria-label="Atualizar CDI" disabled={updating} onClick={onRefresh}><RefreshCw size={15} className={updating ? 'spinning' : ''} />{updating ? 'Atualizando' : 'Atualizar CDI'}</button></div>
    <div className="cdi-metrics">
      <div><span>CDI diário publicado</span><strong>{latest ? `${Number(latest.value).toLocaleString('pt-BR', { maximumFractionDigits: 6 })}%` : 'Indisponível'}</strong><small>Referência: {date(str(latest ?? {}, 'date'))}</small></div>
      <div><span>Ganho no último dia disponível</span><strong>{brl(metrics.daily)}</strong><small>Bruto estimado · percentual de cada lote</small></div>
      <div><span>Rendimento neste mês</span><strong>{brl(metrics.monthly)}</strong><small>Bruto estimado · inclui ganhos de lotes resgatados</small></div>
    </div>
    <p className={failed ? 'cdi-warning' : 'cdi-footnote'}><ShieldCheck size={13} />{failed ? (status?.error || 'BCB indisponível. Cálculo preservado até a última taxa armazenada.') : checkedAt ? `Verificação no servidor: ${timestamp(checkedAt)}.` : lastSync ? `Última sincronização registrada: ${timestamp(lastSync)}.` : 'Aguarde a primeira verificação no servidor.'} Sem extrapolar taxas nos dias sem publicação. Valores estimados, sem conexão com saldo bancário.</p>
    {!failed && checkedAt && <p className="cdi-footnote">{lastSync ? `Taxas consultadas no BCB em ${timestamp(lastSync)}. ` : ''}{status?.results?.find(r => r.series === '12')?.status === 'cached' ? 'Histórico válido reutilizado; próxima consulta respeita o cache de quatro horas.' : 'Consulta ao BCB concluída; valores oficiais preservados.'}</p>}
    {metrics.details.some(d => d.waitingForRate) && <p className="cdi-footnote" role="status">Aguardando primeira taxa publicada para os aportes desde {date(metrics.details.filter(d => d.waitingForRate).map(d => d.waitingSince!).sort()[0])}. A taxa anterior ao aporte não é aplicada; o rendimento começa quando houver taxa oficial elegível.</p>}
    {metrics.details.some(d => !d.complete) && <p className="cdi-warning">Há aplicações com histórico parcial ou metodologia manual. A atualização busca taxas antigas em etapas; confira a data-base de cada caixinha.</p>}
  </section>;
}
