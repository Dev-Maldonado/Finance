# Estado FINORA 2.0

## Entrega atual

Aplicação funcional no checkout `/workspace/Finance`; requisitos portáveis em `docs/finora-context`. Não havia arquivos ou commits no repositório antes desta implementação. Código publicado e conferido na branch `main` de `Dev-Maldonado/Finance` (commit inicial `1ec8134`). Hospedagem em Vercel e aplicação das migrations no Supabase dependem de credenciais administrativas seguras. Projeto informado: `jqxuwhvkcdfxuxfktzmw`; configuração pública de produção preservada em arquivo privado ignorado pelo Git. Veja `docs/DEPLOY.md`.

## Cobertura

| Área | Implementado | Limitações restantes |
|---|---|---|
| Fundação | Next.js, Auth, PostgreSQL, migrations, RLS, backend Zod, sessões, rotas privadas, layout responsivo | Produção exige Supabase/SMTP e configuração segura próprios |
| Caixa | Contas, extratos, transferências, CRUD de lançamentos com revisão/cancelamento auditado, categorias/subcategorias, recorrências pendentes | Recorrências são geradas sob comando e exigem confirmação; conciliação de movimentos vinculados é específica |
| Cartões | Cadastro, limite, parcelamento, fechamento, vencimento, faturas e pagamentos parciais | Estornos e renegociação de faturas não implementados |
| CDI/Selic | Histórico real, cache, revisão, capitalização por lote, backfill, origem e data-base | Produtos com carência/calendário/metodologia contratual específica precisam de estratégia própria |
| Caixinhas | CRUD de condições futuras, lotes históricos, aportes, resgate FIFO de principal, gráfico de capital/juros, rendimento e saldo oficial conciliados, três cenários e tempo até meta | Resgate automático de juros líquidos/impostos e conexão bancária não implementados |
| Mercado/CVM | Endpoints v2 de cotação/histórico/proventos, cadastro legado e RCVM175, classes/subclasses, NAV oficial, jobs e logs | Plano/token podem limitar ativos; não houve validação de toda a cobertura paga |
| Carteira | Posições iniciais, compras/vendas, custo médio, eventos corporativos e ticker, fundos por cotas, proventos anunciados/recebidos, CSV atômico | Conversão cambial e ativos internacionais negociados, marcação a mercado de Tesouro e cálculo tributário completo da carteira pendentes |
| Planejamento/relatórios | Orçamentos mensais, metas, dívidas, patrimônio líquido, posição patrimonial registrada, filtros, gráficos, comparação CDI, Dietz e exportação CSV/XLSX/PDF | Histórico anterior de patrimônio não é fabricado; amortizações ainda exigem conciliação de custo/quantidade conforme evento |
| Tributos | Regras por produto, faixa e vigência; IR/IOF/isenção estimados em caixinhas | Come-cotas, taxas específicas e mudanças legislativas precisam de configuração/validação contratual |
| Importação | CSV/OFX de caixa; CSV de operações; posições iniciais pela interface; prévia e deduplicação | Leitura direta de XLSX e importação de histórico de proventos em lote pendentes |
| Visual | Paleta e navegação especificadas, sidebar recolhível, desktop/mobile | A imagem de referência não foi recebida |

## Dados externos validados

BCB: 501 registros oficiais persistidos (CDI até 06/10/2026; Selic até 07/10/2026). CVM: 86.398 registros únicos de cadastro; 73.443 linhas do informe diário de outubro validadas e três cotas oficiais de referência persistidas. brapi: PETR4 público validado com cotação, 249 preços históricos e 121 proventos recebidos; 114 eventos únicos no cache. Usuários de teste são removidos, sem saldo fictício atribuído a usuários reais.

O bloqueio de rede inicial deixou de ocorrer nas verificações seguintes. Os três domínios estão no rascunho, mas publicação e restauração em uma nova tarefa não foram verificadas.

## Validação

- 33 testes unitários de finanças, parsing, provedores, tributação, performance e exportação passaram.
- 18 verificações integradas em PostgreSQL/Auth/PostgREST passaram, incluindo isolamento e referências entre usuários, idempotência, atomicidade de importação, cartões, lotes, revisões, recorrências e eventos.
- Dois testes de navegador passaram na compilação final, cobrindo persistência, autenticação, layout móvel, caixinhas, cartões, relatórios e exportação.
- TypeScript e build passaram; auditoria de dependências de produção: zero vulnerabilidades reportadas na última execução.
- Reinstalação por `npm ci` e startup idempotente do banco foram exercitados; volumes existentes não foram resetados.

## Operação

`npm run db:start` inicia serviços locais e aplica migrations pendentes. `npm run dev` ou build seguido de `npm start` inicia a aplicação. `npm run jobs` executa o processo diário independente do navegador. Logs da tarefa estão em `/tmp/finora-app.log`, `/tmp/finora-jobs.log` e `/tmp/finora-local-db.log`; não registrar credenciais.

## Próxima ação

Instalação e instruções de startup foram salvas no rascunho de ambiente; revisar/salvar nas configurações e publicar o ambiente para ativá-las. Publicação e restauração em nova tarefa não foram verificadas. Aplicação, banco e scheduler estão em execução, com sincronização final usando os caches reais.

Resolver os recursos pendentes por módulo, começando por conciliação de amortizações/resgates e produtos reais com seus contratos, sem inventar regras. Revisar a referência visual quando for fornecida.

## Hospedagem solicitada

Projeto Supabase indicado pelo usuário: `jqxuwhvkcdfxuxfktzmw`. A chave pública foi preservada somente em configuração privada. A conexão hospedada ainda não foi validada: o proxy retornou 403; domínio adicionado ao rascunho de rede, pendente de publicação. Não há deploy Vercel nem migrations remotas aplicadas. Faltam acesso Vercel e credenciais administrativas Supabase; confirmar dados existentes antes de migrations.
