'use client';
import { useMemo, useState } from 'react';
import { manualUpdates } from '@/lib/manual-investments';
import Link from 'next/link';
import { ShieldCheck, CircleHelp, CircleAlert, CheckCheck, ChevronDown } from 'lucide-react';
import { rows, str, type Snapshot, type Row } from '@/lib/summary';
import { financialPlan } from '@/lib/financial-plan';
const date = (value: string) => value ? value.split('-').reverse().join('/') : 'Não informada';
const timestamp = (value: string) => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value)) : 'Não informada';
export function DataConfidence({ snapshot, today }: { snapshot: Snapshot; today: string }) {
  const [expanded, setExpanded] = useState(false);
  const confidence = useMemo(() => financialPlan(snapshot, today).confidence, [snapshot, today]);
  const latest = (data: Row[]) => data.filter(r => str(r, 'date') <= today).sort((a, b) => str(a, 'date').localeCompare(str(b, 'date')) || str(a, 'collected_at').localeCompare(str(b, 'collected_at'))).at(-1);
  const sources: { id: string; name: string; row?: Row }[] = [
    ...['12', '11'].map(series => ({ id: series, name: series === '12' ? 'CDI' : 'Selic', row: latest(rows(snapshot, 'benchmark_rates').filter(r => r.series === series && r.validated !== false)) })),
    ...rows(snapshot, 'investment_assets').map(asset => ({ id: str(asset, 'id'), name: str(asset, 'name'), row: latest(manualUpdates(snapshot,str(asset,'id')).map(p=>({...p,source:'manual',collected_at:p.updated_at}))) })),
  ];
  const Icon = confidence.checks.some(c => c.status === 'attention') ? CircleAlert : ShieldCheck;
  return <section className="panel data-confidence" aria-label="Confiabilidade dos números">
    <div className="panel-head"><div><h2>Confiabilidade dos seus números</h2><p>Saiba o que foi registrado, conferido e o que ainda depende de atualização.</p></div><Icon size={22} /></div>
    <div className="confidence-overview"><div><strong>{confidence.label}</strong><span>Cobertura indicada: {confidence.score}%</span></div><Link href="/configuracoes">Conferir minhas fontes</Link></div>
    <p className="planning-note">A qualidade depende dos dados cadastrados. Este indicador não confirma seu saldo bancário nem substitui uma conciliação com o extrato.</p>
    <div className="confidence-checks">{confidence.checks.map(check => {
      const StatusIcon = check.status === 'ok' ? CheckCheck : check.status === 'attention' ? CircleAlert : CircleHelp;
      return <article className={check.status} key={check.id}><StatusIcon size={17} /><div><strong>{check.label}</strong><p>{check.detail}</p>{(check.referenceDate || check.collectedAt) && <p>{check.referenceDate && `Referência: ${date(check.referenceDate)}.`} {check.collectedAt && `Coleta: ${timestamp(check.collectedAt)}.`}</p>}</div><span>{check.status === 'ok' ? 'Verificado' : check.status === 'attention' ? 'Atenção' : 'Pendente'}</span></article>;
    })}</div>
    <details className="confidence-sources"><summary>Origem e referência dos dados <ChevronDown size={15} /></summary><div className="confidence-source-grid">{(expanded ? sources : sources.slice(0, 8)).map(source => <article key={source.id}><div><strong>{source.name}</strong><span>{source.row ? str(source.row, 'source') || 'Origem não informada' : 'Sem cotação ou taxa disponível'}</span></div><dl><div><dt>Data de referência</dt><dd>{date(str(source.row ?? {}, 'date'))}</dd></div><div><dt>Coleta registrada</dt><dd>{timestamp(str(source.row ?? {}, 'collected_at'))}</dd></div><div><dt>Validação</dt><dd>{!source.row ? 'Pendente' : source.row.validated === true ? 'Validada na integração' : 'Registro manual ou legado'}</dd></div></dl></article>)}</div>{sources.length > 8 && <button type="button" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>{expanded ? 'Mostrar menos fontes' : `Mostrar todas as ${sources.length} fontes`}</button>}</details>
    {confidence.limitations.length > 0 && <details className="confidence-limitations"><summary>Premissas e pendências</summary><ul>{confidence.limitations.map(item => <li key={item}>{item}</li>)}</ul></details>}
  </section>;
}
