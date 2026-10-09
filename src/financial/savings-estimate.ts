import type { Movement } from './engine';

export const unallocatedYieldWithdrawalNotice = 'Há resgate de rendimento sem detalhamento por lote. A estimativa de capitalização está parcial; use o saldo registrado e os valores oficiais até conciliar essa retirada.';

/** Goal-level cash is real; its effect on each contract cannot be inferred. */
export function hasUnallocatedYieldWithdrawal(movements: Movement[], asOf: string) {
  return movements.some(movement => movement.type === 'withdrawn_yield' && !movement.lot_id && movement.date <= asOf && movement.status !== 'cancelled');
}
