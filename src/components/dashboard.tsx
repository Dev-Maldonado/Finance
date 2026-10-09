'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, ArrowRight, Wallet, CreditCard, TrendingUp, PiggyBank, ChartNoAxesCombined, Target, CalendarDays, ShieldCheck, ChevronRight } from 'lucide-react';
import { financialTone, type FinancialTone } from '@/lib/financial-tone';
import { D, money } from '@/financial/engine';
import { financialSummary, rows, str, type Snapshot } from '@/lib/summary';
import { dashboardModel, changeMetric } from '@/lib/dashboard';
import { invoiceMonthLabel, invoiceTotals, type CardInvoice } from '@/lib/card-invoices';
import { savingsMetrics, savingsPeriodMetrics } from '@/lib/savings-metrics';
import { cardColors } from '@/lib/card-color';
import { FlowChart, palette } from './chart';
import { CategoryBreakdown } from './category-breakdown';
import { WealthChart } from './wealth-chart';
import { WealthRegistrationFeedback, type WealthFeedback } from './wealth-registration-feedback';
import { forms, fieldOptionLabel } from './forms';
import { CDIStatus, type BenchmarkStatus } from './cdi-status';
import { FinancialPlanning } from './financial-planning';
import { DataConfidence } from './data-confidence';
const brl = (value: string | number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
const pretty = (value: string) => value.split('-').reverse().join('/');
const pct = (value: string) => `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
function Block({ title, subtitle, link, children, wide = false }: { title: string; subtitle: string; link?: string; children: React.ReactNode; wide?: boolean }) {
  return <section className={`panel dashboard-block ${wide ? 'dashboard-wide' : ''}`}><div className="panel-head"><div><h2>{title}</h2><p>{subtitle}</p></div>{link && <Link href={link} aria-label={`Abrir ${title}`} className="dashboard-block-link"><ArrowUpRight size={18} /></Link>}</div>{children}</section>;
}
function Delta({ current, previous, lowerBetter = false }: { current: string; previous: string; lowerBetter?: boolean }) {
  const change = changeMetric(current, previous);
  const positive = D(change.difference).gt(0);
  const improved = lowerBetter ? D(change.difference).lt(0) : positive;
  return <div className={`dashboard-delta ${D(change.difference).eq(0) ? 'neutral' : improved ? 'positive' : 'negative'}`}><span>{change.percent === null ? 'Sem base percentual' : `${positive ? '+' : ''}${pct(change.percent)}`}</span><small>{D(change.difference).gt(0) ? '+' : ''}{brl(change.difference)} vs. anterior</small></div>;
}
function Metric({ label, value, display, detail, icon: Icon, current, previous, lowerBetter = false, tone = 'wealth' }: { label: string; value: string; display?: string; detail: string; icon: typeof Wallet; current?: string; previous?: string; lowerBetter?: boolean; tone?: FinancialTone }) {
  return <article className={`dashboard-metric financial-surface ${financialTone(value, tone)}`} aria-label={label}><div className="dashboard-metric-head"><span>{label}</span><Icon size={18} /></div><strong>{display ?? brl(value)}</strong><p>{detail}</p>{current !== undefined && previous !== undefined && <Delta current={current} previous={previous} lowerBetter={lowerBetter} />}</article>;
}
export function Dashboard({ snapshot, summary, start, end, period, today, onPay, onSaveWealth, wealthSaving, wealthFeedback, benchmarkStatus, updatingCDI, onRefreshCDI }: {
  snapshot: Snapshot; summary: ReturnType<typeof financialSummary>; start: string; end: string; period: string; today: string;
  onPay: (invoice: CardInvoice) => void; onSaveWealth: () => void;
  wealthSaving: boolean; wealthFeedback: WealthFeedback | null;
  benchmarkStatus?: BenchmarkStatus; updatingCDI: boolean; onRefreshCDI: () => void;
}) {
  const [flowMode, setFlowMode] = useState<'six-months' | 'period'>('six-months');
  const model = useMemo(() => dashboardModel(snapshot, start, end, period, today), [snapshot, start, end, period, today]);
  const savings = useMemo(() => savingsMetrics(snapshot, today), [snapshot, today]);
  const periodSavings = useMemo(() => savingsPeriodMetrics(snapshot, start, end, today), [snapshot, start, end, today]);
  const incompleteSavingsEstimate = summary.goals.some(goal => goal.estimateComplete === false);
  const { current, previous } = model;
  const monthly = ['month', 'previous'].includes(period);
  const spendingLabel = monthly ? 'Gastos do mês' : 'Gastos do período';
  const balanceLabel = monthly ? 'Saldo do mês' : 'Saldo do período';
  const chart = (flowMode === 'six-months' ? model.history.map(m => ({ name: new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' }).format(new Date(`${m.month}-01T12:00:00Z`)), income: Number(m.income), expense: Number(m.expenses), yield: Number(m.yields) })) : (() => {
    const length = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
    const byMonth = length > 62;
    const buckets = new Map<string, { name: string; income: ReturnType<typeof D>; expense: ReturnType<typeof D>; yield: ReturnType<typeof D> }>();
    for (const item of [...current.tx, ...current.installments.map(p => ({ ...p, type: 'card' }))]) {
      if (!['income', 'expense', 'yield', 'card'].includes(str(item, 'type'))) continue;
      const key = str(item, 'date').slice(0, byMonth ? 7 : 10);
      const row = buckets.get(key) ?? { name: byMonth ? key.split('-').reverse().join('/') : key.slice(5).split('-').reverse().join('/'), income: D(0), expense: D(0), yield: D(0) };
      const metric = item.type === 'income' ? 'income' : item.type === 'yield' ? 'yield' : 'expense';
      row[metric] = row[metric].plus(D(str(item, 'amount')).abs());
      buckets.set(key, row);
    }
    return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, r]) => ({ name: r.name, income: r.income.toNumber(), expense: r.expense.toNumber(), yield: r.yield.toNumber() }));
  })());
  const dueTotals = invoiceTotals(model.due);
  const wealth = rows(snapshot, 'net_worth_snapshots').filter(r => str(r, 'date') >= start && str(r, 'date') <= end).sort((a, b) => str(a, 'date').localeCompare(str(b, 'date')));
  const growth = wealth.length >= 2 ? money(D(str(wealth.at(-1)!, 'assets')).minus(str(wealth.at(-1)!, 'liabilities')).minus(D(str(wealth[0], 'assets')).minus(str(wealth[0], 'liabilities')))) : null;
  const allocation = [
    { name: 'Contas disponíveis', value: summary.cash, color: palette[0] },
    { name: 'Caixinhas registradas', value: summary.savings, color: '#41b69b' },
    { name: 'Investimentos em BRL', value: summary.investments, color: '#e7b869' },
  ];
  return <div className="premium-dashboard">
    <section className="dashboard-hero" aria-label="Panorama patrimonial">
      <div className="dashboard-hero-main"><span className="dashboard-overline"><ShieldCheck size={14} /> PATRIMÔNIO GERAL · HOJE</span><p>Uma visão completa do seu dinheiro.</p><span className="dashboard-hero-label">Patrimônio líquido geral</span><strong>{brl(summary.netWorth)}</strong><div className="dashboard-hero-breakdown"><div><span>Patrimônio bruto geral</span><b>{brl(summary.assets)}</b></div><div><span>Dívidas totais · todos os meses</span><b>{brl(summary.liability)}</b></div><div><span>Rendimento estimado das caixinhas</span><b>{incompleteSavingsEstimate ? 'Conciliação por lote pendente' : `+ ${brl(summary.goals.reduce((a, g) => a.plus(g.gross), D(0)).toFixed(2))}`}</b></div></div><small>Contas e posições atuais. Estimativas de rendimento exibidas à parte.</small></div>
      <div className="dashboard-hero-result" aria-label="Resultado líquido do período"><span><CalendarDays size={15} /> {pretty(start)} — {pretty(end)}</span><p>{balanceLabel} · resultado líquido</p><strong className={D(current.net).lt(0) ? 'result-negative' : ''}>{brl(current.net)}</strong><small>Receitas + rendimentos recebidos − despesas e parcelas do período</small><div className="dashboard-saving-rate"><span>Taxa de economia</span><b>{current.savingRate === null ? 'Sem receitas' : pct(current.savingRate)}</b></div><Delta current={current.net} previous={previous.net} /><Link href="/relatorios">Explorar meus resultados <ArrowRight size={15} /></Link></div>
    </section>
    <div className="dashboard-period-note"><span><span className="live-dot" /> Dados reais dos seus registros</span><span>Comparativo: {pretty(model.previousRange.start)} a {pretty(model.previousRange.end)} · receitas/despesas na mesma janela; parcelas no mês de vencimento</span></div>
    <div className="dashboard-metrics-grid">
      <Metric label="Saldo disponível" value={summary.cash} detail="Saldo geral das contas hoje · sem caixinhas e limites" icon={Wallet} tone="balance" />
      <Metric label="Receitas do período" value={current.income} detail="Somente receitas confirmadas" icon={ArrowDownLeft} current={current.income} previous={previous.income} tone="income" />
      <Metric label={spendingLabel} value={current.expenses} detail={monthly ? "Despesas da conta + parcelas que vencem neste mês" : "Despesas da conta + parcelas com vencimento no período"} icon={ArrowUpRight} current={current.expenses} previous={previous.expenses} lowerBetter tone="expense" />
      <Metric label="Faturas do mês" value={model.invoiceTotals.total} detail={`Vencimento em ${invoiceMonthLabel(model.month)}`} icon={CreditCard} tone="pending" />
      <Metric label="Faturas a pagar no mês" value={model.invoiceTotals.pending} detail={`${brl(model.invoiceTotals.paid)} já pagos nessas faturas`} icon={CalendarDays} tone={model.monthlyInvoices.some(i => i.status === "Atrasada") ? "danger" : D(model.invoiceTotals.pending).eq(0) ? "paid" : "pending"} />
      <Metric label="Rendimentos recebidos" value={current.yields} detail="Valores confirmados · sem valorização de ativos" icon={TrendingUp} current={current.yields} previous={previous.yields} tone="income" />
      <Metric label="Investido em BRL" value={summary.investments} detail="Posições atuais · cotação ou custo identificado" icon={ChartNoAxesCombined} tone="investment" />
      <Metric label={monthly ? "Rendimento das caixinhas no mês" : "Rendimento das caixinhas no período"} value={periodSavings.value} display={periodSavings.unallocatedYieldWithdrawal ? 'Conciliação pendente' : undefined} detail={periodSavings.unallocatedYieldWithdrawal ? 'Resgate de juros exige detalhamento por lote para retomar a estimativa.' : periodSavings.partial ? 'Bruto estimado parcial · confira o histórico dos lotes' : 'Bruto estimado no período · sem projetar dias futuros'} icon={PiggyBank} tone="income" />
    </div>
    <FinancialPlanning snapshot={snapshot} today={today} variant="compact" />
    <section className="dashboard-overall" aria-label="Gastos gerais e compromissos totais">
      <div className="dashboard-overall-title"><h2>Visão geral · todos os meses</h2><p>Histórico de gastos e dívida total, separados do saldo mensal.</p></div>
      <div><span>Gastos gerais registrados</span><strong>{brl(model.overall.expenses)}</strong><small>Despesas + compras integrais até hoje · histórico</small></div>
      <div><span>Comprometido no cartão · total</span><strong>{brl(model.overall.committed)}</strong><small>Saldo a pagar de todas as faturas</small></div>
      <div><span>Parcelas dos próximos meses</span><strong>{brl(model.overall.future)}</strong><small>Compromissos após {invoiceMonthLabel(model.month)}</small></div>
    </section>
    <div className="dashboard-premium-grid">
      <Block title="Entradas, gastos e rendimentos" subtitle="Receitas/despesas até a data final · parcelas no mês do vencimento" wide>
        <div className="dashboard-chart-controls"><div className="chart-legend"><span><i className="income-dot" />Receitas</span><span><i className="pink-dot" />Gastos</span><span><i className="green-dot" />Rendimentos recebidos</span></div><div className="period-tabs"><button className={flowMode === 'six-months' ? 'selected' : ''} onClick={() => setFlowMode('six-months')}>6 meses</button><button className={flowMode === 'period' ? 'selected' : ''} onClick={() => setFlowMode('period')}>Período selecionado</button></div></div>
        {chart.some(r => r.income || r.expense || r.yield) ? <FlowChart data={chart} /> : <p className="dashboard-empty">Cadastre receitas e despesas para acompanhar sua evolução.</p>}
        <div className="dashboard-chart-foot"><span>Média diária de gastos <strong>{brl(model.dailyAverage)}</strong></span><span>Parcelas do cartão <strong>{brl(current.cardExpense)}</strong></span><span>Despesas nas contas <strong>{brl(current.cashExpense)}</strong></span></div>
      </Block>
      <Block title="Onde você mais gasta" subtitle="Despesas e parcelas do período, inclusive sem categoria" link="/categorias">
        <CategoryBreakdown categories={rows(snapshot, 'categories')} expenses={[...current.tx.filter(t => t.type === 'expense'), ...current.installments]} />
      </Block>
      <Block title="Comparativo do período" subtitle={`${pretty(start)} a ${pretty(end)} vs. ${pretty(model.previousRange.start)} a ${pretty(model.previousRange.end)}`} wide>
        <div className="dashboard-comparison" role="table" aria-label="Comparativo financeiro"><div role="row" className="comparison-header"><span>Indicador</span><span>Anterior</span><span>Atual</span><span>Variação</span></div>{[
          ['Receitas', current.income, previous.income, false], ['Gastos', current.expenses, previous.expenses, true], ['Parcelas do cartão', current.cardExpense, previous.cardExpense, true], ['Rendimentos recebidos', current.yields, previous.yields, false], [balanceLabel, current.net, previous.net, false],
        ].map(([label, value, old, lower]) => <div role="row" key={String(label)}><strong>{String(label)}</strong><span>{brl(String(old))}</span><b>{brl(String(value))}</b><Delta current={String(value)} previous={String(old)} lowerBetter={Boolean(lower)} /></div>)}</div>
        <p className="dashboard-note">Gastos mensais consideram apenas as parcelas que vencem no mês, mesmo que a compra tenha ocorrido antes. O pagamento da fatura não duplica o gasto. Saldo mensal é o resultado das receitas e despesas; não inclui patrimônio ou saldo trazido de outros meses.</p>
      </Block>
      <Block title="Quanto fica livre?" subtitle="Saldo atual após compromissos registrados até o fim deste mês">
        <div className="dashboard-liquidity"><span>Disponível após compromissos</span><strong className={D(model.afterCommitments).lt(0) ? 'negative' : ''}>{brl(model.afterCommitments)}</strong></div>
        <div className="dashboard-key-values"><div><span>Saldo das contas</span><b>{brl(summary.cash)}</b></div><div><span>Faturas pendentes e atrasadas</span><b>− {brl(dueTotals.pending)}</b></div><div><span>Despesas pendentes</span><b>− {brl(model.pendingExpenses)}</b></div></div>
        <p className="dashboard-note">Estimativa de disponibilidade; não inclui receitas futuras, despesas não cadastradas ou parcelas de outros meses.</p>
      </Block>
      <Block title={`Faturas de ${invoiceMonthLabel(model.month)}`} subtitle="Todos os cartões · total, pago e saldo restante" link="/cartoes" wide>
        <div className="dashboard-bill-summary"><div><span>Total do mês</span><b>{brl(model.invoiceTotals.total)}</b></div><div><span>Pago nessas faturas</span><b>{brl(model.invoiceTotals.paid)}</b></div><div><span>A pagar</span><b>{brl(model.invoiceTotals.pending)}</b></div></div>
        <div className="dashboard-invoice-list">{model.monthlyInvoices.length ? model.monthlyInvoices.map(i => { const card = rows(snapshot, 'credit_cards').find(c => c.id === i.cardId); return <article key={i.id} aria-label={`Resumo da fatura de ${i.cardName}`}><span className="dashboard-card-symbol" style={{ background: cardColors(str(card ?? {}, 'color')).background, color: cardColors(str(card ?? {}, 'color')).color }}><CreditCard size={20} /></span><div><strong>{i.cardName}</strong><small>Vence {pretty(i.due)} · {i.status}</small></div><div><b>{brl(i.pending)}</b><small>Total: {brl(i.total)}</small></div>{D(i.pending).gt(0) && <button onClick={() => onPay(i)}>Pagar</button>}</article>; }) : <p className="dashboard-empty">Nenhuma fatura cadastrada para este mês.</p>}</div>
        <div className="dashboard-next-bills">{model.upcoming.slice(0, 3).map(i => <Link href={`/cartoes?month=${i.month}`} key={i.month}><span>{invoiceMonthLabel(i.month)}</span><b>{brl(i.pending)}</b><small>A pagar · parcelas registradas</small><ChevronRight size={15} /></Link>)}</div>
        {model.due.some(i => i.due < today) && <p className="dashboard-alert">Há faturas vencidas: {brl(invoiceTotals(model.due.filter(i => i.due < today)).pending)} a pagar. Confira em Cartões.</p>}
      </Block>
      <Block title="Fluxo de caixa operacional" subtitle="Recebimentos e pagamentos efetivos no período">
        <div className="dashboard-liquidity"><span>Resultado em caixa</span><strong>{brl(current.cashNet)}</strong></div><div className="dashboard-key-values"><div><span>Receitas + rendimentos recebidos</span><b>{brl(current.receipts)}</b></div><div><span>Despesas pagas nas contas</span><b>− {brl(current.cashExpense)}</b></div><div><span>Pagamentos de fatura</span><b>− {brl(current.invoicePayments)}</b></div></div><p className="dashboard-note">Transferências próprias, aportes, resgates e operações de investimento ficam fora deste resultado.</p>
      </Block>
      <Block title="Minhas caixinhas" subtitle="Capital guardado, metas e rendimentos automáticos" link="/caixinhas" wide>
        <div className="dashboard-goals-grid">{summary.goals.length ? summary.goals.map(g => { const metric = savings.details.find(d => d.goalId === g.goal.id); const progress = D(g.principal).div(str(g.goal, 'target')).mul(100); const pending = g.estimateComplete === false; return <Link key={str(g.goal, 'id')} href={`/caixinhas/${g.goal.id}`} className="dashboard-goal"><div><span className="dashboard-goal-icon"><PiggyBank size={19} /></span><strong>{str(g.goal, 'name')}</strong><ChevronRight size={15} /></div><b>{brl(pending ? g.registeredBalance : g.estimated)}</b><span>{pending ? 'Saldo registrado' : 'Saldo estimado'} · {brl(g.principal)} de capital</span><div className="progress"><span style={{ width: `${Math.max(0, Math.min(100, progress.toNumber()))}%` }} /></div><small>{pct(progress.toFixed(1))} da meta de {brl(str(g.goal, 'target'))}</small><div className="dashboard-goal-yield"><span>Bruto acumulado <b>{pending ? 'Pendente' : `+ ${brl(g.gross)}`}</b></span><span>No mês atual <b>{pending ? 'Pendente' : `+ ${brl(metric?.monthly ?? '0')}`}</b></span></div>{pending && <small>{g.estimateLimitation}</small>}<small>{g.goal.indexer === 'cdi' ? `${Number(g.goal.percentage)}% do CDI · condições por lote` : fieldOptionLabel(forms.goal, 'indexer', str(g.goal, 'indexer'))} · data-base {g.asOf ? pretty(g.asOf) : 'indisponível'}</small></Link>; }) : <p className="dashboard-empty">Crie uma caixinha e faça seu primeiro aporte para acompanhar o rendimento.</p>}</div>
      </Block>
      <Block title="Orçamentos do mês" subtitle={`Gastos vs. limites de ${invoiceMonthLabel(model.month)}`} link="/planejamento">
        {model.budgets.length ? model.budgets.map(b => <div className="dashboard-budget" key={b.id}><div><strong>{b.name}</strong><span className={D(b.percent).gt(100) ? 'negative' : ''}>{pct(b.percent)}</span></div><div className="progress"><span className={D(b.percent).gt(100) ? 'over-budget' : ''} style={{ width: `${Math.min(100, Number(b.percent))}%` }} /></div><small>{brl(b.spent)} de {brl(b.limit)} · {D(b.remaining).lt(0) ? `${brl(D(b.remaining).abs().toFixed(2))} acima do limite` : `${brl(b.remaining)} restantes`}</small></div>) : <p className="dashboard-empty">Defina limites no Planejamento para acompanhar seus orçamentos aqui.</p>}
      </Block>
      <Block title="Evolução do patrimônio" subtitle="Histórico registrado, sem reconstruções fictícias" wide>
        <div className="dashboard-wealth-top"><div><span>Variação entre registros do período</span><strong>{growth === null ? 'Histórico em formação' : brl(growth)}</strong></div><button onClick={onSaveWealth} disabled={wealthSaving} aria-busy={wealthSaving}>{wealthSaving ? 'Registrando posição…' : 'Registrar posição de hoje'}</button></div>
        <WealthRegistrationFeedback feedback={wealthFeedback} />
        <WealthChart data={wealth.map(r => ({ date: str(r, 'date'), assets: Number(r.assets), net: D(str(r, 'assets')).minus(str(r, 'liabilities')).toNumber() }))} />
        <div className="dashboard-allocation">{allocation.map(a => <div key={a.name}><i style={{ background: a.color }} /><span>{a.name}</span><b>{brl(a.value)}</b></div>)}</div>
      </Block>
      <Block title="Minha carteira" subtitle="Posições em BRL e fontes de avaliação" link="/investimentos">
        <div className="dashboard-liquidity"><span>Valor atual da carteira</span><strong>{brl(summary.investments)}</strong></div>{summary.positions.length ? summary.positions.filter(p => D(p.pos.quantity).gt(0)).slice(0, 5).map(p => <div className="dashboard-position" key={str(p.asset, 'id')}><span className="asset-icon">{str(p.asset, 'ticker').slice(0, 2)}</span><div><strong>{str(p.asset, 'ticker')}</strong><small>{p.quote ? `${str(p.quote, 'source')} · ${pretty(str(p.quote, 'date'))}` : 'Sem cotação · custo de aquisição'}</small></div><b>{p.supported ? brl(p.value) : 'Moeda estrangeira'}</b></div>) : <p className="dashboard-empty">Sua carteira aparecerá após cadastrar os ativos e as posições.</p>}
      </Block>
      <Block title="Últimas movimentações" subtitle="Receitas, despesas, compras e movimentações confirmadas no período" link="/transacoes" wide>
        {model.recent.length ? model.recent.map(t => <div className="dashboard-recent" key={t.id}><span className={`dashboard-recent-icon ${D(t.amount).lt(0) ? 'out' : ''}`}>{t.kind === 'card' ? <CreditCard size={17} /> : D(t.amount).lt(0) ? <ArrowUpRight size={17} /> : <ArrowDownLeft size={17} />}</span><div><strong>{t.description}</strong><small>{t.account} · {pretty(t.date)} · {({ income: 'Receita', expense: 'Despesa', yield: 'Rendimento', card: 'Compra no cartão', transfer: 'Transferência', invoice_payment: 'Pagamento de fatura', investment: 'Investimento', adjustment: 'Ajuste' } as Record<string, string>)[t.kind]}</small><small>{t.category}</small></div><b className={D(t.amount).lt(0) ? 'negative' : 'positive'}>{brl(t.amount)}</b></div>) : <p className="dashboard-empty">Não há movimentações confirmadas neste período.</p>}
      </Block>
      <Block title="Próximos passos" subtitle="Ações para manter seu panorama completo">
        {[['/transacoes', 'Organizar lançamentos', 'Corrigir e categorizar receitas e despesas', Wallet], ['/planejamento', 'Planejar o próximo mês', 'Metas, orçamentos e obrigações', Target], ['/caixinhas', 'Cuidar das reservas', 'Aportes, rendimento e conciliação', PiggyBank]].map(([href, title, detail, Icon]) => { const I = Icon as typeof Wallet; return <Link className="dashboard-shortcut" href={String(href)} key={String(href)}><I size={18} /><div><strong>{String(title)}</strong><small>{String(detail)}</small></div><ChevronRight size={15} /></Link>; })}
      </Block>
    </div>
    <DataConfidence snapshot={snapshot} today={today} />
    <CDIStatus snapshot={snapshot} today={today} status={benchmarkStatus} updating={updatingCDI} onRefresh={onRefreshCDI} />
  </div>;
}
