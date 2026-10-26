import type { Row } from './summary';
export const cashDate = (row: Row) => String(row.settled_on || row.date || '');
export const isSettled = (row: Row, today: string) => row.status === 'confirmed' && cashDate(row) <= today;
export function transactionStatus(row: Row, today: string) {
  if (row.status === 'cancelled') return 'Excluído';
  if (row.status === 'pending') return row.type === 'income' ? 'A receber · Pendente' : row.type === 'expense' ? 'A pagar · Pendente' : 'Pendente';
  if (!isSettled(row, today)) return 'Agendado · Confirmado';
  return row.type === 'income' ? 'Recebido · Confirmado' : row.type === 'expense' ? 'Pago · Confirmado' : 'Confirmado';
}
