# FINORA 2.0

Aplicação financeira em Next.js/React/TypeScript com PostgreSQL, Supabase Auth, RLS, cálculos decimais, dashboard responsivo e provedores financeiros separados. Começa vazia: nenhum saldo, rendimento ou cotação de demonstração aparece como informação real.

## Desenvolvimento local

Requisitos: Node.js 24, npm, Docker com Compose, Python 3 e curl. No cloud, use `/workspace/Finance`, sem criar outro checkout.

```bash
npm ci --cache /workspace/.npm-cache
npm run db:start
npm run dev
```

`db:start` prepara PostgreSQL 17, Supabase Auth/GoTrue, PostgREST, gateway Kong e Mailpit. Aplica migrations pendentes em transações, sem resetar o banco. Gera credenciais **locais** aleatórias em `.local-db.env` e `.env.local`, com permissões restritas, apenas se os arquivos não existirem. Nunca versionar esses arquivos. O perfil local confirma cadastro sem e-mail e entrega recuperação ao Mailpit; não reproduza essa configuração em produção.

O banco local usa volume Docker `finora-local_finora-data`. Recarregar ou reiniciar a aplicação preserva os registros. Não confie em volumes locais como backup ou garantia de restauração em outra máquina. Para produção, configure um projeto Supabase persistente, backups e SMTP apropriado.

O projeto Supabase hospedado informado pelo usuário já está configurado como padrão público no código; um deploy sem variáveis públicas abre o login. Para substituir esse projeto, informe URL e chave pública juntas. A chave de serviço e o segredo do agendador continuam exclusivamente nas variáveis seguras do servidor. Aplique `supabase/migrations` em ordem no projeto. Não execute `db:start` para inicializar dados em uma instância hospedada. Autorize o domínio exato desse projeto nas configurações de rede do ambiente.

Mantenha credenciais de outro banco em um arquivo privado que não seja carregado automaticamente pelo Next.js, como `.env.hosted`, e carregue-o somente ao executar comandos desse perfil. `.env.production.local` tem prioridade sobre `.env.local` no build de produção e pode redirecionar testes locais para um banco hospedado.

```bash
npm run test
npm run typecheck
npm run build
npm start
# Somente no banco local de desenvolvimento:
npm run test:integration
npm run test:e2e
```

O teste de navegador usa `/usr/bin/chromium`; em outra máquina, configure `CHROMIUM_PATH`. As capturas e resultados ficam em `test-results/`, ignorado pelo Git.

## Funcionalidades implementadas

- Cadastro/login/logout/recuperação e troca de senha; APIs privadas, validação Zod, controle de origem e RLS com referências compostas por usuário.
- Contas, arquivamento, saldo calculado, transações confirmadas/pendentes, edição/cancelamento auditados, transferências, recorrências pendentes e categorias hierárquicas sem ciclos.
- Cartões, limites, compras parceladas com conservação de centavos, faturas, compromissos futuros, pagamentos parciais e prevenção de despesa duplicada.
- Caixinhas manuais: saldo inicial, depósitos, retiradas, saldo atualizado mensalmente, rendimento em reais/percentual e histórico auditado. Sem rendimentos automáticos ou estimativas. IR/IOF efetivos preservados.
- Investimentos manuais: Fundos e Criptomoedas, compras adicionais, quantidade/capital/preço médio, correção e exclusão de compras, valor por unidade informado mensalmente, lucro/prejuízo e histórico mensal sem confundir aportes com ganhos. Nenhuma API de cotação.
- Orçamentos, metas, dívidas manuais, patrimônio líquido, filtros temporais, gráficos, central de rendimentos, comparação CDI e performance pessoal por Dietz modificado.
- Importação CSV/OFX de transações com prévia, confirmação atômica e deduplicação; exportação CSV, XLSX e PDF. XLSX preserva valores e datas em células tipadas; descrições permanecem texto, com proteção contra execução de fórmulas.

## Regras financeiras

Valores monetários entram como strings, são armazenados em `numeric` e retornam como texto; cálculos críticos usam `decimal.js`. `number` é usado somente para visualização. Transferências e aportes não são renda/despesa. Pagamentos não repetem a despesa da compra. Caixinhas estimadas não aumentam o saldo confirmado.

As caixinhas calculam o rendimento exclusivamente a partir dos saldos informados, depósitos e retiradas. Os registros existentes são preservados. Veja [caixinhas manuais e indicadores oficiais](docs/MANUAL-SAVINGS.md). Não há conexão bancária/Open Finance implementada.

A tributação configurável está em `tax_rules`; regras não cobertas deixam o líquido indisponível. As regras iniciais de renda fixa precisam ser confirmadas para o produto e a vigência antes de uso em produção. Fundos com come-cotas e produtos com carência/metodologia específica exigem implementação contratual adicional, sem estimativas inventadas.

Na área de investimentos, sem valor manual aparece “Aguardando atualização”, com retorno indisponível. O patrimônio geral conserva o custo registrado enquanto faltar uma avaliação, sem inventar lucro. Valores são em reais; compras dessa área não debitam automaticamente uma conta. Consulte [investimentos manuais](docs/MANUAL-INVESTMENTS.md).

## Fontes e automação

```bash
npm run sync # CDI/Selic e recorrências; não consulta investimentos
npm run jobs # processo diário independente do navegador
```

O cron Vercel usa `/api/benchmarks`, `CRON_SECRET` e chave de serviço privada. O histórico BCB permanece disponível para relatórios anteriores; não calcula rendimentos das caixinhas. Selic e IPCA do dashboard usam APIs oficiais e não precisam de chave de serviço nem cron. O controle de investimentos não necessita de token ou integração. As rotinas antigas de mercado/CVM foram removidas.

## Contexto e pendências

Consulte [estado e cobertura](docs/STATUS.md) e [skill compacta](docs/finora-context/SKILL.md). Os requisitos originais completos estão no índice da skill. A referência visual mencionada no prompt não foi anexada; o layout segue a paleta e a navegação descritas.

Esta implementação oferece os principais fluxos locais, mas ainda não satisfaz todos os detalhes do prompt mestre. O estado de cobertura registra as partes pendentes, sem afirmar integrações ou métodos financeiros não validados.

O script de instalação e as instruções de inicialização também foram salvos no rascunho do ambiente. Revise e salve nas configurações, depois publique o ambiente. Isso não publica os arquivos no GitHub nem comprova restauração em uma nova tarefa.

Para hospedagem em Vercel com Supabase, consulte [DEPLOY.md](docs/DEPLOY.md).

Cartões permitem cor personalizada no cadastro/edição. Compras registradas têm Editar/Excluir; parcelas, faturas e limite são recalculados. Receitas/despesas independentes têm exclusão confirmada e opção de mostrar registros excluídos. Para atualizar um Supabase existente, aplique [a migration incremental](docs/supabase-update-card-corrections.sql) antes do deploy; faturas com pagamentos exigem conciliação antes de mudanças financeiras nas compras.

Na página Cartões, selecione o mês de vencimento para consultar a fatura mensal. O total, os pagamentos e o saldo a pagar aparecem separados do comprometimento de todas as faturas. Há filtro por cartão, detalhamento das parcelas, prévia dos próximos seis meses e registro de pagamento com saldo preenchido. Meses futuros consideram somente compras registradas; a consulta mensal não exige uma migration adicional.

O dashboard reúne patrimônio atual, resultado líquido, receitas/gastos/rendimentos, faturas mensais de todos os cartões e próximos vencimentos, caixa operacional, disponibilidade após compromissos, evolução de seis meses, comparativo com a mesma janela anterior, categorias, orçamentos, metas, carteira e posições patrimoniais registradas. No dashboard, gastos e saldo mensais usam despesas da conta e somente as parcelas que vencem no mês. O valor integral das compras fica nos gastos gerais do histórico; o comprometimento total soma os saldos de todas as faturas. Saldo mensal é receitas e rendimentos recebidos menos despesas e parcelas; saldo das contas e patrimônio geral aparecem separados. Pagamentos, transferências e aportes não duplicam os gastos.

As caixinhas usam **Informar rendimento** para receber o saldo total atualizado. Depósitos e retiradas ficam separados dos ganhos; o histórico mensal permite corrigir observações anteriores. O dashboard mostra também Selic e IPCA de 12 meses com fontes oficiais e datas de referência. A atualização incremental está em [migration 25](docs/supabase-update-manual-savings.sql).


## Atualização financeira: parcelas, recorrências e categorias

Compras podem ser cadastradas pelo total ou pelo valor de cada parcela, com prévia de vencimentos, conservação de centavos e edição auditada de parcelas futuras. Recorrências semanais, mensais e anuais geram lançamentos previstos, permitem pausa/cancelamento e respeitam a competência mensal. Categorias possuem dois níveis explícitos, seleção hierárquica, gráficos detalháveis e filtros que incluem subcategorias sem duplicar valores.

O planejamento apresenta projeções de 30/60/90 dias, disponibilidade, despesas essenciais e reserva, metas e conciliação explícita. Compras e preços mensais manuais possuem correções auditadas; importações bancárias e exportações mantêm seus controles de integridade. Despesas previstas, valores pagos, saldo mensal e patrimônio geral continuam separados.

Para atualizar uma instalação existente, siga a sequência de migrations em [DEPLOY.md](docs/DEPLOY.md). CI, automação de indexadores/recorrências e backups estão documentados em [OPERATIONS.md](docs/OPERATIONS.md). Resgates de rendimento confirmado sem alocação por lote deixam a estimativa incompleta identificada; o app não afirma equivalência ao saldo bancário.
