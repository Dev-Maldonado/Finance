import { nextRecurrenceDate, type RecurrenceFrequency } from "./recurrence";
import { D, daysBetween, money } from '@/financial/engine';
import { cardInvoices, shiftInvoiceMonth } from './card-invoices';
import { dateShift, monthEnd, periodMetrics } from './dashboard';
import { financialSummary, rows, str, type Row, type Snapshot } from './summary';
import { savingsMetrics } from './savings-metrics';
import { categorySpendingKind } from './categories';
import { unallocatedYieldWithdrawalNotice } from '@/financial/savings-estimate';

export type ForecastItem = { id: string; date: string; description: string; amount: string; kind: 'income' | 'expense' | 'invoice' | 'obligation'; source: string; status: 'projected' };
export type ConfidenceCheck = { id: string; label: string; status: 'ok' | 'attention' | 'unknown'; detail: string; referenceDate?: string; collectedAt?: string };
export type PlanAlert = { id: string; severity: 'info' | 'warning' | 'danger'; title: string; description: string; href: string; date?: string; amount?: string };
export type FinancialPlan = ReturnType<typeof financialPlan>;

const sumAmounts = (items: ForecastItem[], income: boolean) => items.filter(i => D(i.amount).gt(0) === income).reduce((a, i) => a.plus(D(i.amount).abs()), D(0));
const businessDaysBetween = (start: string, end: string) => {
  let count = 0;
  for (let date = dateShift(start, 1); date <= end && count <= 6; date = dateShift(date, 1)) {
    const day = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
};
const categoryKind = (snapshot: Snapshot, categoryId: string) => {
  return categorySpendingKind(rows(snapshot, 'categories'), categoryId);
};

/** Cash forecasts use registered future/pending flows, never estimated market returns. */
export function forecastItems(snapshot: Snapshot, today: string, endDate: string): ForecastItem[] {
  const items: ForecastItem[] = [];
  const tx = rows(snapshot, 'transactions');
  const savingsAccountIds = new Set([...rows(snapshot, 'financial_accounts').filter(a => a.kind === 'savings').map(a => str(a,'id')), ...rows(snapshot, 'savings_goals').map(g => str(g,'account_id'))].filter(Boolean));
  const item = (id: string, date: string, description: string, amount: string, kind: ForecastItem['kind'], source: string) => items.push({ id, date, description, amount: money(amount), kind, source, status: 'projected' });
  for (const t of tx) {
    const date = str(t, 'date');
    if (t.status === 'cancelled' || savingsAccountIds.has(str(t,'account_id')) || date > endDate) continue;
    if (t.status === 'confirmed' && date <= today) continue; // Already in available cash.
    if (date < today && D(str(t, 'amount')).gt(0)) continue; // Overdue income is not promised.
    if (!['pending', 'confirmed'].includes(str(t, 'status'))) continue;
    item(`transaction:${t.id}`, date < today ? today : date, str(t, 'description'), str(t, 'amount'), D(str(t, 'amount')).gt(0) ? 'income' : 'expense', 'transaction');
  }
  // A generated recurring occurrence replaces its projection, including cancellations.
  const represented = new Set(tx.map(t => str(t, 'source_id')).filter(Boolean));
  for (const recurring of rows(snapshot, 'recurring_transactions').filter(r => r.active !== false && !r.cancelled_at && !savingsAccountIds.has(str(r,'account_id')))) {
    let date = str(recurring, 'next_date');
    if (!date || !['weekly', 'monthly', 'annual'].includes(str(recurring, 'frequency'))) continue;
    const anchor = Number(recurring.anchor_day || date.slice(8));
    for (let index = 0; date <= endDate && (!recurring.end_date || date <= str(recurring, 'end_date')) && index < 500; index++) {
      const key = `recurrence:${recurring.id}:${date}`;
      if (date >= today && !represented.has(key)) {
        const amount = D(str(recurring, 'amount')).mul(recurring.type === 'expense' ? -1 : 1);
        item(key, date, str(recurring, 'description'), amount.toString(), recurring.type === 'expense' ? 'expense' : 'income', 'recurring');
      }
      date = nextRecurrenceDate(date, str(recurring, 'frequency') as RecurrenceFrequency, anchor, Number(recurring.anchor_month || date.slice(5, 7)));
    }
  }
  for (const invoice of cardInvoices(snapshot, today)) {
    if (invoice.due > endDate || D(invoice.pending).lte(0)) continue;
    const scheduled = rows(snapshot, 'credit_card_payments').filter(p => p.invoice_id === invoice.id && str(p, 'date') > today && str(p, 'date') <= endDate && items.some(i => i.id === `transaction:${p.transaction_id}`)).reduce((a, p) => a.plus(str(p, 'amount')), D(0));
    const remaining = D(invoice.pending).minus(scheduled);
    if (remaining.gt(0)) item(`invoice:${invoice.id}`, invoice.due < today ? today : invoice.due, `Fatura: ${invoice.cardName}`, remaining.neg().toString(), 'invoice', 'card');
  }
  for (const obligation of rows(snapshot, 'financial_obligations')) {
    if (obligation.status !== 'pending' || str(obligation, 'due_date') > endDate) continue;
    const linked = tx.find(t => t.id === obligation.transaction_id && t.status !== 'cancelled');
    if (linked && (items.some(i => i.id === `transaction:${linked.id}`) || (linked.status === 'confirmed' && str(linked, 'date') <= today))) continue;
    const date = str(obligation, 'due_date');
    item(`obligation:${obligation.id}`, date < today ? today : date, str(obligation, 'name'), D(str(obligation, 'amount')).neg().toString(), 'obligation', 'obligation');
  }
  return items.sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

function project(opening: string, items: ForecastItem[], today: string, endDate: string) {
  let running = D(opening), minimum = running, minimumDate = today;
  const dayAmounts = new Map<string, ReturnType<typeof D>>();
  for (const item of items) dayAmounts.set(item.date, (dayAmounts.get(item.date) ?? D(0)).plus(item.amount));
  for (const [date, amount] of [...dayAmounts].sort(([a],[b]) => a.localeCompare(b))) {
    running = running.plus(amount);
    if (running.lt(minimum)) { minimum = running; minimumDate = date; }
  }
  return { endDate, opening: money(opening), income: money(sumAmounts(items, true)), expenses: money(sumAmounts(items, false)), balance: money(running), minimumBalance: money(minimum), minimumDate, items };
}

export function financialPlan(snapshot: Snapshot, today: string) {
  const summary = financialSummary(snapshot, today, today, today);
  const allItems = forecastItems(snapshot, today, dateShift(today, 90));
  const forecast = ([30, 60, 90] as const).map(days => {
    const endDate = dateShift(today, days);
    return { days, ...project(summary.cash, allItems.filter(i => i.date <= endDate), today, endDate) };
  });
  const lastDay = monthEnd(today.slice(0, 7));
  const monthlyItems = allItems.filter(i => i.date <= lastDay);
  const monthProjection = project(summary.cash, monthlyItems, today, lastDay);
  const available = D(summary.cash).minus(monthProjection.expenses);
  const daysRemaining = daysBetween(today, lastDay) + 1;
  const spendable = { ...monthProjection, monthEnd: lastDay, daysRemaining, available: money(available.gt(0) ? available : 0), deficit: money(available.lt(0) ? available.neg() : 0), perDay: money((available.gt(0) ? available : D(0)).div(daysRemaining)) };

  const priorMonths = Array.from({length:3}, (_, index) => shiftInvoiceMonth(today.slice(0,7), index - 3));
  const recordedMonths = priorMonths.filter(month => rows(snapshot, 'transactions').some(t => t.status === 'confirmed' && str(t,'date').startsWith(month)) || rows(snapshot, 'credit_card_purchases').some(p => str(p,'date').startsWith(month)) || periodMetrics(snapshot, `${month}-01`, monthEnd(month), false).installments.length > 0);
  const essentialCategories = rows(snapshot, 'categories').filter(c => categoryKind(snapshot, str(c,'id')) === 'essential').map(c => str(c,'id'));
  let essentialTotal = D(0), missingCategories = 0;
  for (const month of recordedMonths) {
    const metrics = periodMetrics(snapshot, `${month}-01`, monthEnd(month), false);
    for (const expense of [...metrics.tx.filter(t => t.type === 'expense'), ...metrics.installments]) {
      const kind = categoryKind(snapshot, str(expense,'category_id'));
      if (kind === 'essential') essentialTotal = essentialTotal.plus(D(str(expense,'amount')).abs());
      else if (kind === 'unclassified') missingCategories++;
    }
  }
  const monthlyEssential = essentialCategories.length && recordedMonths.length && essentialTotal.gt(0) ? essentialTotal.div(recordedMonths.length) : null;
  const reserveGoals = summary.goals.filter(g => g.goal.is_emergency_reserve === true);
  const reserve = reserveGoals.length ? reserveGoals.reduce((a,g) => a.plus(g.registeredBalance),D(0)) : null;
  const configuredMonths = Number(rows(snapshot,'user_settings')[0]?.emergency_months_target || 6);
  const targetMonths = Number.isInteger(configuredMonths) && configuredMonths >= 1 && configuredMonths <= 24 ? configuredMonths : 6;
  const target = monthlyEssential?.mul(targetMonths) ?? null;
  const gap = target !== null && reserve !== null ? target.minus(reserve) : null;
  const essentials = { monthly: monthlyEssential === null ? null : money(monthlyEssential), reserve: reserve === null ? null : money(reserve), months: monthlyEssential !== null && reserve !== null ? reserve.div(monthlyEssential).toFixed(1) : null, targetMonths, target: target === null ? null : money(target), gap: gap === null ? null : money(gap.gt(0) ? gap : 0), sampleMonths: recordedMonths.length, missingCategories, categoryIds: essentialCategories };

  const goalItems: { row: Row; current: string; kind: string }[] = [
    ...summary.goals.map(g => ({ row:g.goal, current:g.registeredBalance, kind:'savings' })),
    ...rows(snapshot,'financial_goals').map(row => ({ row, current:row.kind === 'investment' ? summary.investments : row.kind === 'net_worth' ? summary.netWorth : summary.savings, kind:str(row,'kind') })),
  ];
  const goals = goalItems.map(({row,current,kind}) => {
    const target = str(row,'target');
    const deficit = D(target).minus(current);
    const remaining = deficit.gt(0) ? deficit : D(0);
    const deadline = str(row,'target_date') || null;
    const monthsRemaining = deadline && deadline >= today ? (Number(deadline.slice(0,4))-Number(today.slice(0,4))) * 12 + Number(deadline.slice(5,7))-Number(today.slice(5,7)) + 1 : null;
    return { id:str(row,'id'), name:str(row,'name'), target, current:money(current), remaining:money(remaining), monthlyContribution:remaining.eq(0) ? '0.00' : monthsRemaining ? remaining.mul(100).div(monthsRemaining).ceil().div(100).toFixed(2) : null, monthsRemaining, deadline, targetDate:deadline, kind, deadlineState:remaining.eq(0) ? 'completed' as const : !deadline ? 'unset' as const : deadline < today ? 'overdue' as const : 'upcoming' as const };
  });

  const checks: ConfidenceCheck[] = [];
  const currentSpending = periodMetrics(snapshot, `${shiftInvoiceMonth(today.slice(0,7),-3)}-01`, today, false);
  const expenses = [...currentSpending.tx.filter(t => t.type === 'expense'), ...currentSpending.installments];
  const unclassified = expenses.filter(t => categoryKind(snapshot,str(t,'category_id')) === 'unclassified').length;
  checks.push({id:'categories',label:'Classificação dos gastos',status:expenses.length === 0 ? 'unknown' : unclassified ? 'attention' : 'ok', detail:expenses.length === 0 ? 'Sem despesas históricas suficientes.' : unclassified ? `${unclassified} gastos sem classificação essencial/opcional.` : 'Despesas classificadas explicitamente.'});
  checks.push({id:'history',label:'Histórico para planejamento',status:recordedMonths.length === 3 ? 'ok' : recordedMonths.length ? 'attention' : 'unknown',detail:`${recordedMonths.length} de 3 meses anteriores contêm registros. Meses sem histórico não são tratados como gastos zero.`});
  const accounts = rows(snapshot,'financial_accounts').filter(a => a.kind !== 'savings' && a.archived !== true);
  const reconciled = accounts.filter(a => {
    const latest = rows(snapshot,'account_reconciliations').filter(r => r.account_id === a.id && str(r,'date') <= today).sort((a,b) => str(b,'date').localeCompare(str(a,'date')) || str(b,'created_at').localeCompare(str(a,'created_at')))[0];
    if (!latest || daysBetween(str(latest,'date'),today) > 30) return false;
    const adjustment = rows(snapshot,'transactions').find(t => t.id === latest.transaction_id && t.status === 'confirmed' && str(t,'date') <= today);
    return D(str(latest,'difference') || '0').eq(0) || !!adjustment;
  });
  checks.push({id:'cash',label:'Conciliação das contas',status:!accounts.length ? 'unknown' : reconciled.length === accounts.length ? 'ok' : 'attention',detail:`${reconciled.length} de ${accounts.length} contas têm última conferência recente sem divergência pendente. Conferências com diferença não ajustada precisam de revisão.`});
  const currentInvoices = cardInvoices(snapshot,today).filter(i => i.month <= today.slice(0,7) && D(i.total).gt(0));
  if (currentInvoices.length) {
    const matched = currentInvoices.filter(i => {
      const latest = rows(snapshot,'invoice_reconciliations').filter(r => r.invoice_id === i.id && str(r,'date') <= today).sort((a,b) => str(b,'date').localeCompare(str(a,'date')) || str(b,'created_at').localeCompare(str(a,'created_at')))[0];
      return latest && daysBetween(str(latest,'date'),today) <= 30 && D(str(latest,'difference') || '0').eq(0);
    });
    checks.push({id:'invoices',label:'Conciliação das faturas',status:matched.length === currentInvoices.length ? 'ok' : 'attention',detail:`${matched.length} de ${currentInvoices.length} faturas atuais/anteriores têm conferência recente sem diferença. Conferir valores não cria um pagamento.`});
  }
  const savings = savingsMetrics(snapshot,today);
  const automaticLots = rows(snapshot,'savings_lots').some(l => ['cdi','selic','fixed'].includes(str(l,'indexer')) && str(l,'start_date') <= today);
  if (automaticLots) {
    const requiredSeries = new Set(rows(snapshot,'savings_lots')
      .filter(l => ['cdi','selic','fixed'].includes(str(l,'indexer')) && str(l,'start_date') <= today)
      .map(l => l.indexer === 'selic' ? '11' : '12'));
    const references = [...requiredSeries].map(series => rows(snapshot,'benchmark_rates')
      .filter(rate => rate.series === series && rate.validated !== false && str(rate,'date') <= today)
      .sort((a,b) => str(b,'date').localeCompare(str(a,'date')))[0]);
    const oldestReference = references.filter((rate): rate is Row => !!rate)
      .sort((a,b) => str(a,'date').localeCompare(str(b,'date')))[0];
    const sourcesCurrent = references.every(rate => !!rate && businessDaysBetween(str(rate,'date'),today) <= 3);
    checks.push({id:'cdi',label:'Histórico dos indexadores',status:savings.details.every(d => d.complete) && sourcesCurrent ? 'ok' : 'attention',detail:savings.unallocatedYieldWithdrawal ? unallocatedYieldWithdrawalNotice : savings.details.some(d => d.waitingForRate) ? 'Há aporte aguardando sua primeira taxa elegível; isso não é rendimento confirmado.' : savings.details.some(d => !d.complete) ? 'Histórico parcial ou contrato sem cálculo automático.' : 'Cada contrato usa seu próprio indexador publicado; fins de semana não geram expectativa de taxa. Referências antigas pedem conferência, sem extrapolação.',referenceDate:oldestReference ? str(oldestReference,'date') : undefined,collectedAt:oldestReference ? str(oldestReference,'collected_at') : undefined});
  }
  const holdings = summary.positions.filter(p => D(p.pos.quantity).gt(0));
  if (holdings.length) checks.push({id:'portfolio',label:'Avaliação da carteira',status:holdings.every(p => p.supported && p.quote && daysBetween(str(p.quote,'date'),today) <= 7) ? 'ok' : 'attention',detail:holdings.some(p => !p.supported) ? 'Posições estrangeiras não são convertidas para BRL.' : holdings.some(p => !p.quote) ? 'Parte da carteira está avaliada pelo custo, sem cotação.' : 'Confira as datas das cotações; valorização não é recebimento.'});
  const providerLogs = [...rows(snapshot,'provider_sync_logs')].sort((a,b) => str(b,'started_at').localeCompare(str(a,'started_at')));
  const latestByProvider = providerLogs.filter((log,index) => !providerLogs.slice(0,index).some(previous => previous.provider === log.provider));
  const lastFailure = latestByProvider.find(l => l.status === 'error');
  if (lastFailure && daysBetween(str(lastFailure,'started_at').slice(0,10),today) <= 1) checks.push({id:'providers',label:'Integrações',status:'attention',detail:'Existe falha recente registrada. Últimos valores válidos foram preservados.',referenceDate:str(lastFailure,'started_at').slice(0,10)});
  const score = Math.round(checks.reduce((a,c) => a+(c.status === 'ok' ? 1 : c.status === 'attention' ? 0.5 : 0),0) / Math.max(checks.length,1) * 100);
  const limitations = ['Previsões usam somente compromissos e recebimentos registrados; não incluem rentabilidade futura nem despesas não cadastradas.', 'O indicador de confiabilidade mede cobertura dos registros e datas; não certifica saldos bancários.', 'Aportes sugeridos são calculados por meta e não representam investimentos contratados.'];
  if (rows(snapshot,'financial_liabilities').some(l => D(str(l,'amount')).gt(0) && !rows(snapshot,'financial_obligations').some(o => o.liability_id === l.id && o.status === 'pending'))) limitations.push('Há saldo devedor sem agenda de pagamento. Cadastre as obrigações para incluí-las na previsão.');
  const confidence = {score,label:score >= 80 ? 'Boa cobertura' : score >= 50 ? 'Cobertura parcial' : 'Dados incompletos',checks,limitations};

  const alerts: PlanAlert[] = [];
  for (const horizon of forecast) if (D(horizon.minimumBalance).lt(0) && !alerts.some(a => a.id === 'cash-shortfall')) alerts.push({id:'cash-shortfall',severity:'danger',title:'Saldo previsto insuficiente',description:`Os compromissos registrados podem deixar o caixa negativo em ${horizon.minimumDate.split('-').reverse().join('/')}.`,date:horizon.minimumDate,amount:horizon.minimumBalance,href:'/planejamento'});
  const overdue = cardInvoices(snapshot,today).filter(i => i.due < today && D(i.pending).gt(0));
  if (overdue.length) alerts.push({id:'overdue-invoices',severity:'danger',title:'Faturas vencidas',description:`${overdue.length} faturas têm saldo pendente. Confira pagamentos e vencimentos.`,amount:money(overdue.reduce((a,i) => a.plus(i.pending),D(0))),href:'/cartoes'});
  const soon = cardInvoices(snapshot,today).filter(i => i.due >= today && i.due <= dateShift(today,7) && D(i.pending).gt(0));
  if (soon.length) alerts.push({id:'upcoming-invoices',severity:'warning',title:'Faturas vencendo nos próximos 7 dias',description:`${soon.length} faturas precisam de pagamento; os valores já estão incluídos na previsão de caixa.`,date:soon[0].due,amount:money(soon.reduce((a,i) => a.plus(i.pending),D(0))),href:'/cartoes'});
  if (gap?.gt(0)) alerts.push({id:'reserve-gap',severity:'info',title:'Reserva abaixo da sua meta',description:`A reserva cobre ${essentials.months} meses de despesas essenciais; a meta configurada é ${targetMonths}.`,amount:essentials.gap ?? undefined,href:'/caixinhas'});
  for (const goal of goals.filter(g => g.deadlineState === 'overdue')) alerts.push({id:`goal:${goal.id}`,severity:'warning',title:`Prazo da meta ${goal.name} vencido`,description:'Revise o prazo ou o valor do aporte; nenhuma rentabilidade futura foi presumida.',date:goal.deadline ?? undefined,amount:goal.remaining,href:'/planejamento'});
  if (limitations.length > 3) alerts.push({id:'unscheduled-debt',severity:'warning',title:'Dívidas sem agenda de pagamentos',description:'O saldo devedor afeta o patrimônio, mas seus pagamentos só entram no caixa previsto quando cadastrados como obrigações.',href:'/planejamento'});
  if (unclassified) alerts.push({id:'classify-expenses',severity:'info',title:'Classifique os gastos essenciais',description:'A classificação permite medir sua reserva de emergência e separar necessidades de escolhas.',href:'/categorias'});
  return { forecast, spendable, essentials, goals, alerts, confidence };
}
