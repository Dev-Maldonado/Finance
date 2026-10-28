# Contas Recorrentes

Rota `/recorrentes`, disponível na navegação desktop e em Mais no aplicativo/PWA. Reúne compromissos por mês, sem criar um segundo controle financeiro.

- Parcelas: compra e cartão originais, número da parcela, vencimento e consulta da fatura. Resumo soma o saldo não pago das faturas; em pagamentos parciais, os valores originais das parcelas permanecem identificados, sem presumir qual compra foi paga. A correção de parcelas futuras reutiliza a operação existente e suas restrições.
- Gastos fixos: transações recorrentes pendentes/agendadas e projeções da agenda ativa. Uma ocorrência registrada, paga ou cancelada substitui sua projeção pelo identificador `recurrence:<id>:<data original>`.
- Gastos programados: despesas pendentes ou confirmadas com data futura e compromissos agendados. Compromissos vinculados a transações ativas não são contados novamente. Registros pagos/cancelados e movimentações das caixinhas ficam fora da lista a pagar.
- Resumo: total a pagar, parcelas, fixos e programados; datas permanecem no mês de cada vencimento, inclusive ao consultar meses anteriores. A visão não antecipa saldo disponível nem muda status de pagamento.
- Somente este mês: altera ou cancela apenas a ocorrência selecionada. Uma previsão editada torna-se um lançamento pendente explícito, com o mesmo identificador usado pelo gerador. A data pode ser corrigida dentro do mês.
- Este mês e os próximos: substitui o trecho da série a partir da ocorrência escolhida. `series_id` liga os trechos à mesma série original, permitindo aplicar alterações também a trechos futuros já editados. Mantém frequência e vencimentos contratuais; preserva pagamentos efetivos, exclusões específicas, meses anteriores e auditoria. Novos valores se aplicam aos lançamentos ainda não efetivados e às próximas previsões.
- Ocorrências antigas cujo vencimento foi transferido para outro mês continuam editáveis individualmente no mês exibido. Nesses casos, o escopo de série é bloqueado para não aplicar alterações a partir de uma data original anterior ao mês selecionado.
- As operações usam autenticação, propriedade das referências, trava transacional por usuário e chave de idempotência. Não existem exclusões físicas nem testes contra dados reais.

## Implantação

Aplicar `supabase/migrations/202610260026_monthly_commitments.sql` antes de publicar a interface. A migração acrescenta um vínculo nullable entre trechos da série e uma RPC autenticada; não reescreve valores/statuses de registros existentes. O snapshot já serializa os campos das recorrências e não precisa de outro endpoint. Backups existentes incluem o novo campo.

Validação local: `npm test`, `npm run typecheck`, `npm run build`, `npm run test:integration`, `npm run test:scheduling`, `npm run test:commitments`, scripts de upgrade e `npm run test:e2e`. O novo teste de banco também integra o CI. Os testes criam e removem usuários descartáveis no Supabase local.

## Correção de gastos fixos e exclusão — 28/10/2026

Os indicadores por competência e a lista de transações usam as mesmas próximas
ocorrências de despesas recorrentes. Elas são identificadas como previstas, por
vencimento, sem inserir movimentos bancários futuros. A ocorrência registrada
(inclusive paga, alterada de data, cancelada ou removida) substitui a previsão
pela mesma chave `recurrence:<id>:<data original>`. Gastos, resultado líquido,
categorias, gráficos, comparativos, orçamentos e relatórios compartilham
`periodMetrics`; caixa efetivo e patrimônio continuam usando somente movimentos
confirmados. Geração automática mantém o limite de hoje.

Em Transações, cadastros ativos, pausados e encerrados oferecem Excluir. A escolha
padrão remove somente o cadastro selecionado e para a geração, preservando todos
os lançamentos já registrados. A opção explícita de excluir cadastro e histórico
retira também suas ocorrências dos cálculos, inclusive pagas/recebidas, com aviso
de recálculo do saldo. Não altera outros cadastros/trechos da série. Ocorrências
individuais podem ser excluídas; as já canceladas oferecem Remover do histórico.
Previsões usam o editor de ocorrência existente, com escopos por mês/futuro.

Migration `202610280029_recurring_removal.sql` acrescenta `deleted_at` anulável,
sem alterar registros antigos. A remoção é lógica e auditada; preserva chaves de
ocorrência para impedir reaparecimento após geração/edição de agenda. RPC com
propriedade, trava transacional e idempotência. Nenhum teste ou exclusão usa
dados reais de produção.

Verificações novas: `npm run test:recurring-removal`,
`bash scripts/recurring-removal-migration-test.sh`, testes unitários de
recorrências por competência e `tests/e2e/recurring-corrections.spec.ts`.
