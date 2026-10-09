# Controle manual de investimentos

A área foi substituída por um controle de Fundos e Criptomoedas. Cadastre nome, tipo, quantidade adquirida, valor total pago e data. Para uma compra adicional, use **Adicionar compra** no investimento existente. Nomes iguais, ignorando caixa/espaços, não criam outro ativo.

Quantidade = soma das compras ativas; capital = soma dos valores totais pagos; preço médio = capital / quantidade. O preço médio é calculado com Decimal, sem reconstruir o valor pago a partir de um preço unitário arredondado. Compras admitem até oito casas decimais; valores totais até duas.

Use **Atualizar valor** para informar o preço atual da unidade/cota e a data, uma vez por mês. Informar novamente no mesmo mês corrige o registro existente; meses anteriores continuam separados e editáveis. Preço zero é permitido para perda total. Compras têm edição/exclusão próprias; correções guardam auditoria e compras excluídas deixam os cálculos sem destruir o registro anterior.

Patrimônio = quantidade × último preço manual; lucro/prejuízo = patrimônio − capital; retorno = lucro/prejuízo / capital. Variação entre atualizações compara os preços por unidade, sem incluir novos aportes. O gráfico mostra patrimônio e capital por mês; a diferença é ganho/perda. Não trata crescimento causado por compras como rentabilidade.

Sem atualização aparece **Aguardando atualização**, sem lucro/retorno fabricados. Nos totais parcialmente atualizados, lucro e percentual consideram somente posições com preço informado e indicam a cobertura parcial. O patrimônio geral usa o custo enquanto faltar avaliação; o saldo disponível continua independente. As compras manuais não geram movimentações automáticas em contas, pois o cadastro solicitado não inclui conta de origem.

## Limpeza solicitada e migração

O usuário pediu apagar os investimentos existentes em vez de preservar/arquivar a carteira anterior. A migration `202610090024_manual_investments.sql` limpa ativos, posições, operações, preços, eventos e proventos antigos. Preserva contas, transações (IDs, valores, datas e statuses), cartões, categorias, caixinhas e demais módulos. Quando houver recebimento antigo associado a provento, apenas a referência ao provento excluído é desvinculada; o recebimento e o saldo permanecem.

Para uma instalação já na migration 23, o script [supabase-update-manual-investments.sql](supabase-update-manual-investments.sql) realiza o upgrade em transação e registra a versão. Reexecutar esse script não limpa investimentos novos. Não reaplique o SQL bruto da migration nem o bootstrap em produção. As migrations históricas e estruturas referenciadas pelos procedimentos antigos ficam versionadas para reproduzir a instalação; APIs, formulários, provedores e jobs antigos de investimentos foram removidos ou bloqueados.

O modelo atual usa `investment_assets`, `manual_investment_purchases` e `manual_investment_updates`, com IDs únicos, vínculo composto por usuário e mês único por ativo. Escritas passam pela RPC transacional/idempotente `manual_investment_operation`; a API exige sessão e mesma origem. RLS limita leitura a registros próprios e bloqueia escrita direta nas tabelas do ledger manual. Nenhum token de cotação é necessário.

## Validação

`npm test`, `npm run typecheck`, `npm run build`, `npm run test:manual`, `scripts/manual-migration-test.sh` e Playwright verificam cálculos independentes, exemplo Fundo XPTO, compras fracionadas de Bitcoin, correções/exclusões, meses, duplicidade, isolamento e desktop/tablet/mobile. Os testes integrados são restritos ao banco local, com usuários temporários removidos ao final. O teste de migração usa um banco descartável e comprova que caixa/transações não são alterados e novas compras sobrevivem à reexecução.
