# Caixinhas manuais e indicadores econômicos

As caixinhas usam somente saldos informados pelo usuário. CDI/Selic, calendários e taxas históricas não calculam seu rendimento.

## Uso

1. Crie uma caixinha com nome, meta e valor inicial já depositado. A conta de origem é opcional: selecioná-la registra uma transferência; deixá-la vazia registra um saldo que já existe fora do sistema, sem descontar novamente da conta bancária.
2. Use **Depositar** e **Retirar** para transferências entre a conta e a caixinha. Informe IR/IOF somente se efetivamente retidos no resgate; a conta recebe a retirada bruta menos esses impostos.
3. Use **Informar rendimento** para cadastrar o **saldo total atualizado**, nunca apenas o lucro. Há uma observação por mês. Informar novamente no mesmo mês registra um novo saldo para esse mês; **Corrigir saldo** altera a observação existente, preservando a versão anterior na auditoria.
4. Abra o histórico mensal e a evolução da caixinha. Movimentações posteriores, inclusive no mesmo dia, não reescrevem o saldo observado. Correções de meses antigos recalculam os ajustes internos e preservam os saldos absolutos informados nos meses seguintes.

## Cálculo

- Total investido: soma de todos os depósitos confirmados, incluindo o saldo inicial.
- Saldo atual: saldo registrado mais depósitos/retiradas posteriores à última observação. Sem projeção ou rendimento automático.
- Rendimento acumulado: saldo atual + retiradas brutas − impostos informados nos resgates − total depositado.
- Rentabilidade acumulada: rendimento acumulado ÷ total depositado × 100. É um retorno simples sobre os depósitos históricos; não é anualizado nem ponderado pelo tempo.
- Sem saldo informado ou rendimento anteriormente confirmado: **Aguardando atualização**. O principal continua visível no patrimônio, sem inventar rendimento.

Exemplo sem impostos: depósito de R$ 1.000 e saldo informado de R$ 1.100 resultam em R$ 100 e 10%. Um depósito adicional de R$ 500 deixa saldo de R$ 1.600 e rendimento de R$ 100 (6,67%). Retirar R$ 300 deixa R$ 1.300, preservando os mesmos R$ 100 de rendimento. A retirada não vira receita e o depósito não vira lucro.

A atualização manual ajusta apenas o patrimônio da caixinha; não cria uma entrada na conta bancária. IR/IOF efetivos reduzem o resultado uma única vez. Valores negativos de rendimento e perda total são suportados; o saldo da caixinha não pode ficar negativo. Movimentações com data anterior ao último saldo informado exigem revisar os registros dependentes. Estornos não podem apagar movimentações já incluídas em uma observação mensal.

## Histórico existente e migração

A migration `202610090025_manual_savings.sql` é incremental. Preserva todos os saldos, aportes, resgates, lotes, reconciliações e investimentos existentes. Não transforma estimativas antigas em saldo confirmado. O novo histórico mensal começa na primeira atualização manual. Rendimentos anteriormente confirmados permanecem nos cálculos e na auditoria.

Para um Supabase na versão 24, [supabase-update-manual-savings.sql](supabase-update-manual-savings.sql) aplica a atualização em uma transação, confere as impressões digitais das tabelas financeiras e registra a versão 25. A reaplicação não duplica estruturas nem registros.

## Selic e IPCA

O dashboard consulta automaticamente os provedores em paralelo, ao abrir e a cada hora em uso, com cache de uma hora no servidor e atualização manual disponível:

- Banco Central: SGS 432, **meta Selic vigente**, percentual ao ano; consulta limitada aos últimos 30 dias até a data atual em São Paulo.
- IBGE: API de agregados, tabela 1737, variável 2265, Brasil (N1/1), **IPCA acumulado em 12 meses**; último mês publicado anterior ao mês corrente.

Cada card identifica a fonte e a referência. As fontes são independentes: falha de uma não esconde o dado válido da outra. Respostas inválidas, datas futuras, timeout ou indisponibilidade mostram **Indisponível**. Não há valores fictícios. Nenhum desses indicadores altera a rentabilidade das caixinhas ou dos investimentos, e não é necessário token de provedor.

## Validação

`npm test`, `npm run typecheck`, `npm run build`, `npm run test:savings`, `bash scripts/savings-migration-test.sh` e os cenários `tests/e2e/manual-savings.spec.ts`. Os testes usam somente Supabase local, com usuários temporários removidos. Não gravar dados financeiros de teste em produção.
