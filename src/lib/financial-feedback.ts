import { D } from '@/financial/engine';
import type { FormDef } from '@/components/forms';
import { manualPosition } from './manual-investments';
import { manualSavingsPosition } from './manual-savings';
import { rows, str, type Row, type Snapshot } from './summary';
import { isSettled } from './transaction-state';

export type FinancialFeedbackKind = 'income' | 'expense' | 'transfer' | 'goal' | 'growth' | 'success';
export type FinancialFeedback = {
  kind: FinancialFeedbackKind;
  title: string;
  description: string;
  from?: string;
  to?: string;
};

const saved = (description = 'Suas informações foram salvas.'): FinancialFeedback => ({
  kind: 'success', title: 'Tudo certo', description,
});
const transfer = (from: string, to: string): FinancialFeedback => ({
  kind: 'transfer', title: 'Transferência registrada', description: 'Movimentação entre seus próprios recursos.', from, to,
});
const goalReached = (): FinancialFeedback => ({
  kind: 'goal', title: 'Meta da caixinha alcançada!', description: 'O saldo confirmado atingiu o objetivo que você definiu.',
});

/** Presentation only: call after the server accepts the operation. Never changes a record. */
export function financialFeedbackForSave(
  form: FormDef,
  data: Record<string, unknown>,
  initial: Row | undefined,
  snapshot: Snapshot,
  today: string,
  recurringExpense = false,
): FinancialFeedback {
  // A visual confirmation must never turn a successfully saved operation into a form error.
  try {
    const value = (key: string) => String(data[key] ?? '');
    const endpoint = (form.endpoint ?? '').split('?')[0];
    const date = value('date');
    const effective = !!date && date <= today;
    const edited = !!initial?.id;
    if (recurringExpense || form.resource === 'recurring_transactions') return saved('Recorrência salva. Cada ocorrência mantém seu próprio vencimento.');

    if (form.action === 'transaction' || endpoint === '/api/transactions') {
      const next = Object.fromEntries(Object.entries(data).map(([key, val]) => [key, val === null ? null : String(val)])) as Row;
      if (!isSettled(next, today)) return saved('Lançamento registrado. O saldo muda quando o movimento for efetivado.');
      if (edited && isSettled(initial!, today)) return saved('Lançamento corrigido. Os totais serão atualizados.');
      if (['income', 'yield', 'adjustment'].includes(value('type'))) return {
        kind: 'income', title: value('type') === 'adjustment' ? 'Saldo ajustado' : 'Recebimento registrado',
        description: value('type') === 'adjustment' ? 'Ajuste positivo confirmado na conta.' : 'Entrada confirmada na conta selecionada.',
      };
      if (value('type') === 'expense') return { kind: 'expense', title: 'Despesa registrada', description: 'Saída confirmada na conta selecionada.' };
      return saved();
    }
    if (edited) return saved('Correção salva. Seu histórico permanece preservado.');
    if (form.action === 'purchase') return effective
      ? { kind: 'expense', title: 'Compra registrada', description: 'Parcelas na fatura, sem débito imediato na conta.' }
      : saved('Compra registrada para a data informada.');
    if (form.action === 'transfer') return effective ? transfer('Conta de origem', 'Conta de destino') : saved('Transferência registrada para a data informada.');
    if (['pay_invoice', 'pay_obligation'].includes(form.action ?? '')) return effective
      ? { kind: 'expense', title: 'Pagamento registrado', description: 'Saída confirmada, sem repetir a despesa nos totais.' }
      : saved('Pagamento registrado para a data informada.');

    if (endpoint.startsWith('/api/manual-savings/')) {
      const goal = rows(snapshot, 'savings_goals').find(item => item.id === value('goal_id'));
      if (endpoint.endsWith('/create')) return effective && value('account_id') && D(value('initial_balance') || '0').gt(0)
        ? { ...transfer('Conta de origem', 'Nova caixinha'), title: 'Caixinha criada' }
        : saved('Caixinha criada. O valor inicial já depositado foi registrado.');
      if (!effective || !goal) return saved();
      const current = manualSavingsPosition(snapshot, goal, today);
      const target = D(str(goal, 'target') || '0');
      const crossesGoal = (balance: string) => target.gt(0) && D(current.balance).lt(target) && D(balance).gte(target);
      if (endpoint.endsWith('/deposit')) {
        if (crossesGoal(D(current.balance).plus(value('amount')).toString())) return goalReached();
        return { ...transfer('Conta de origem', 'Caixinha'), title: 'Depósito registrado', description: 'Aporte transferido. Depósitos não são rendimento.' };
      }
      if (endpoint.endsWith('/withdraw')) return { ...transfer('Caixinha', 'Conta de destino'), title: 'Retirada registrada', description: 'Movimentação registrada com os impostos informados.' };
      if (endpoint.endsWith('/balance')) {
        const sameMonth = current.updates.some(item => str(item, 'date').slice(0, 7) === date.slice(0, 7));
        if (sameMonth || (current.latest && str(current.latest, 'date') > date)) return saved('Saldo mensal corrigido. O histórico foi preservado.');
        const atDate = manualSavingsPosition(snapshot, goal, date);
        const increase = D(value('balance')).minus(atDate.balance);
        if (crossesGoal(D(current.balance).plus(increase).toString())) return goalReached();
        if (increase.gt(0)) return { kind: 'growth', title: 'Saldo da caixinha atualizado', description: 'Crescimento confirmado pelo valor que você informou.' };
        return saved('Saldo informado. O resultado considera os depósitos e retiradas.');
      }
    }
    if (endpoint === '/api/manual-investments/price') {
      const assetId = new URL(form.endpoint!, 'https://finora.invalid').searchParams.get('asset_id');
      const asset = rows(snapshot, 'investment_assets').find(item => item.id === assetId);
      if (!effective || !asset) return saved();
      const position = manualPosition(snapshot, asset, today);
      const sameMonth = position.updates.some(item => str(item, 'date').slice(0, 7) === date.slice(0, 7));
      if (!sameMonth && position.supported && position.latest && D(position.pos.quantity).gt(0) && str(position.latest, 'date') < date && D(value('price')).gt(str(position.latest, 'price'))) return {
        kind: 'growth', title: 'Investimento valorizado', description: 'O preço informado aumentou em relação à última atualização.',
      };
      return saved('Valor por unidade atualizado. Aportes ficam separados do resultado.');
    }
    if (endpoint.startsWith('/api/manual-investments/')) return saved('Investimento salvo. O capital aplicado permanece separado do rendimento.');
    return saved();
  } catch {
    return saved();
  }
}
