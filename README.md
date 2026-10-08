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
- Caixinhas, metas, aportes por lote, resgates FIFO de principal, condições históricas preservadas, CDI/Selic diário, prefixado na convenção de 252 datas elegíveis e produto sem rendimento. Gráfico de capital versus juros estimados, tributação por produto/vigência, conciliação explícita e simulador hipotético.
- Ativos de diferentes classes, posições iniciais sem movimentação fictícia de caixa, compras/vendas, custo médio com taxas, eventos corporativos, preços manuais identificados, cotas de fundos, proventos anunciados e confirmação de recebimento. Amortização é classificada como devolução de capital no caixa.
- Orçamentos, metas, dívidas manuais, patrimônio líquido, filtros temporais, gráficos, central de rendimentos, comparação CDI e performance pessoal por Dietz modificado.
- Importação CSV/OFX de transações e CSV de operações de investimento com prévia, confirmação atômica e deduplicação; exportação CSV, XLSX e PDF. XLSX usa células de texto para evitar execução de fórmulas vindas de descrições.

## Regras financeiras

Valores monetários entram como strings, são armazenados em `numeric` e retornam como texto; cálculos críticos usam `decimal.js`. `number` é usado somente para visualização. Transferências e aportes não são renda/despesa. Pagamentos não repetem a despesa da compra. Caixinhas estimadas não aumentam o saldo confirmado.

O rendimento SGS 12 usa a unidade diária publicada. O cálculo aplica fatores nas datas disponíveis, respeitando cada lote e seus resgates. Não preenche taxas ausentes. Selic usa SGS 11. Prefixado utiliza 252 datas elegíveis com referência no calendário publicado; contratos com outra convenção exigem estratégia específica. O resgate existente movimenta principal; ganhos recebidos precisam de conciliação própria. Não há conexão bancária/Open Finance implementada.

A tributação configurável está em `tax_rules`; regras não cobertas deixam o líquido indisponível. As regras iniciais de renda fixa precisam ser confirmadas para o produto e a vigência antes de uso em produção. Fundos com come-cotas e produtos com carência/metodologia específica exigem implementação contratual adicional, sem estimativas inventadas.

Sem preço disponível, a posição em BRL aparece pelo custo de aquisição com indicação explícita. Ativos em outras moedas podem ser cadastrados, mas operações e conversão cambial/consolidação desses valores ainda não foram implementadas; novas operações são bloqueadas para evitar tratar moeda estrangeira como BRL. Não trate o total BRL como patrimônio completo quando houver esses ativos. A performance é omitida se faltarem preços necessários.

## Fontes e automação

```bash
npm run sync # uma execução; termina com erro se algum provedor falhar
npm run jobs # processo diário independente do navegador
```

Alternativa para infraestrutura com cron: `POST /api/sync` com `Authorization: Bearer <CRON_SECRET>`. Proteção por comparação constante e chave de serviço exclusivamente no backend. Registros/sucessos/erros persistem no banco; execuções bem-sucedidas no mesmo dia usam o cache. CDI faz atualização incremental com janela de revisão; CVM processa cadastro e informes compactados; brapi consulta cotações de ativos cadastrados, conforme permissão/plano. Correções do CDI possuem trilha de revisão. A busca histórica é dividida em janelas anuais e contempla a data do aporte mais antigo. O cadastro CVM atual e o anterior são identificados separadamente.

Domínios necessários: `api.bcb.gov.br`, `dados.cvm.gov.br`, `brapi.dev`. Foram salvos no rascunho de rede; a publicação da configuração ainda depende do usuário. Após o bloqueio inicial, as fontes passaram a responder e a validação real confirmou:

- BCB: 501 registros oficiais de CDI/Selic persistidos; CDI disponível até 06/10/2026 e Selic até 07/10/2026.
- CVM: 86.398 registros únicos de fundos/classes/subclasses importados; informe diário de outubro validado com 73.443 linhas, incluindo cotas zero/negativas publicadas. Três cotas oficiais de referência foram persistidas para verificar a cadeia de importação; atualizações normais de cotas são limitadas aos fundos cadastrados pelo usuário.
- brapi v2: cotação, 249 preços históricos e 121 eventos de proventos retornados para PETR4 sem token; 249 preços e 114 eventos únicos foram persistidos no cache. Não foram criadas posições ou recebimentos fictícios para o usuário.

Proventos publicados são apresentados com a quantidade elegível na data-com e só geram recebimento confirmado após conciliação. Não confundir dados de mercado do cache com patrimônio do usuário.

O catálogo/OpenAPI atual da brapi foi consultado e os adaptadores usam endpoints v2. PETR4, MGLU3, VALE3 e ITUB4 têm acesso público conforme documentação; outros ativos e funções dependem de cobertura/plano. `BRAPI_API_TOKEN` deve ser configurado de forma segura quando necessário. A cobertura de todos os FIIs/ETFs não foi validada sem esse acesso. O cadastro CVM combina o formato legado e o registro de classes/subclasses RCVM 175; `share_class` representa o ID da subclasse oficial, não a classificação comercial do fundo.

## Contexto e pendências

Consulte [estado e cobertura](docs/STATUS.md) e [skill compacta](docs/finora-context/SKILL.md). Os requisitos originais completos estão no índice da skill. A referência visual mencionada no prompt não foi anexada; o layout segue a paleta e a navegação descritas.

Esta implementação oferece os principais fluxos locais, mas ainda não satisfaz todos os detalhes do prompt mestre. O estado de cobertura registra as partes pendentes, sem afirmar integrações ou métodos financeiros não validados.

O script de instalação e as instruções de inicialização também foram salvos no rascunho do ambiente. Revise e salve nas configurações, depois publique o ambiente. Isso não publica os arquivos no GitHub nem comprova restauração em uma nova tarefa.

Para hospedagem em Vercel com Supabase, consulte [DEPLOY.md](docs/DEPLOY.md).

Cartões permitem cor personalizada no cadastro/edição. Compras registradas têm Editar/Excluir; parcelas, faturas e limite são recalculados. Receitas/despesas independentes têm exclusão confirmada e opção de mostrar registros excluídos. Para atualizar um Supabase existente, aplique [a migration incremental](docs/supabase-update-card-corrections.sql) antes do deploy; faturas com pagamentos exigem conciliação antes de mudanças financeiras nas compras.

Na página Cartões, selecione o mês de vencimento para consultar a fatura mensal. O total, os pagamentos e o saldo a pagar aparecem separados do comprometimento de todas as faturas. Há filtro por cartão, detalhamento das parcelas, prévia dos próximos seis meses e registro de pagamento com saldo preenchido. Meses futuros consideram somente compras registradas; a consulta mensal não exige uma migration adicional.
