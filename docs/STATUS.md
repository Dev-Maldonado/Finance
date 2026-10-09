# Estado FINORA 2.0

## Entrega atual

Entrega financeira publicada e validada na `main` de `Dev-Maldonado/Finance`, com implementação iniciada em `1b8341e` e código/testes validados até `2a5c529`. Produção https://finance-two-lake.vercel.app: deploy `dpl_AuBbaZCtVNDaMvmZhm7t5MLCNcnA` READY. Supabase possui 23 migrations; seis incrementais aplicadas em uma transação, com histórico financeiro idêntico nas dez tabelas comparadas. CI completo passou em https://github.com/Dev-Maldonado/Finance/actions/runs/37874562805: 130 unitários, tipos/build, 49 verificações integradas, 16 testes de navegador, proteção/criptografia e ensaio de backup/upgrade legado. Ativação de mercado/backups e proteção de branch exige administração GitHub, bloqueada por HTTP 403 nesta integração. Consulte a seção final e OPERATIONS.md. As seções anteriores registram o histórico e as validações na época.

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
| Dashboard | Patrimônio/resultado, comparativos, gastos/categorias, faturas, disponibilidade, orçamentos, metas, carteira, seis meses e histórico registrado | Histórico patrimonial precisa de posições registradas; não é fabricado |
| Visual | Paleta e navegação especificadas, sidebar recolhível, dashboard com apresentação aprimorada, desktop/mobile | A imagem de referência não foi recebida |

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

Projeto Supabase indicado pelo usuário: `jqxuwhvkcdfxuxfktzmw`. A chave pública foi preservada somente em configuração privada. A rede passou a permitir conexão ao projeto: Auth settings respondeu 200 com a chave pública; consulta de accounts respondeu 404, sem confirmação de schema FINORA disponível. Domínio adicionado ao rascunho de rede; publicação das configurações não confirmada. Não há deploy Vercel nem migrations remotas aplicadas. Faltam acesso Vercel e credenciais administrativas Supabase; confirmar dados existentes antes de migrations.

A chave secreta fornecida foi aceita pelo PostgREST (HTTP 200); a rota financial_accounts retornou 404. Credenciais armazenadas somente em arquivo privado ignorado. PostgreSQL direto não resolveu via DNS e o túnel pelo proxy na porta 5432 retornou 403; nenhum SQL remoto foi executado. Um bootstrap SQL transacional com 16 migrations foi publicado para execução pelo SQL Editor. Validado em banco local descartável; reexecução bloqueada sem alteração dos dados. Vercel continua pendente de acesso. Recomenda-se rotacionar os segredos compartilhados no chat.

## Verificação após instalação pelo SQL Editor

O usuário informou execução do bootstrap. Verificação remota somente leitura confirmou 37 tabelas esperadas, view account_balances e cinco RPCs expostas. As 38 consultas de estrutura responderam 200 com chave de serviço; consultas sem login não retornaram linhas. Auth respondeu 200, cadastro/login por email habilitados e confirmação de email exigida. Foram encontrados 12 registros de regras tributárias e três provedores. Não foram criados usuários nem alterados registros na validação. Isolamento entre usuários autenticados, fluxo de emails e URLs de redirecionamento precisam de verificação após deploy; este check não valida esses fluxos. O usuário fará o deploy manualmente.

## Correção de configuração no deploy

A tela enviada indicava ausência de variáveis públicas no deploy. URL e chave publicável do projeto informado foram centralizadas em src/lib/supabase-config.ts como configuração padrão, compartilhada por navegador, servidor, proxy e sincronização. Sobrescritas precisam fornecer URL e chave juntas para evitar mistura entre projetos. Nenhum segredo administrativo foi adicionado ao código. Perfil privado hospedado preservado em .env.hosted, evitando que .env.production.local se sobreponha ao banco local nos builds de teste.

36 testes unitários e 18 checks integrados passaram. Build sem variáveis públicas e teste no navegador exibiram login (200), sem tela de configuração ou erros JS; API privada sem sessão respondeu 401. Build local e dois testes de navegador completos também passaram após reinicialização com o perfil local. Login real no domínio publicado e entrega de emails continuam dependentes do deploy manual e URLs do Supabase Auth.

## Emails de confirmação e recuperação

Domínio de produção informado: https://finance-two-lake.vercel.app. O link enviado apontava para localhost e continha otp_expired. Cadastro passou a enviar emailRedirectTo do domínio atual; recuperação e reenvio usam o mesmo callback. Interface oferece reenvio de confirmação e explica links expirados; callback preserva o tipo de erro sem mostrar descrições arbitrárias. Configuração administrativa Site URL/Redirect URLs do Supabase ainda precisa ser salva pelo usuário; valores exatos e link do painel em docs/DEPLOY.md. Chave de serviço não permite editar essas opções. Links já expirados exigem nova solicitação após configuração e redeploy.

39 testes unitários, TypeScript/build e 18 checks locais de integração passaram. Três testes de navegador passaram, incluindo callbacks dos três tipos de email, mensagem de expiração e redirecionamento relativo que preserva o domínio público. Nenhum email real ou dado de produção foi usado nos testes de redirecionamento.

## Cores e correções de transações/cartões

Cartões agora possuem cor editável/persistente e texto com contraste adaptado. Receitas/despesas independentes mostram Editar/Excluir com confirmação, recalculam saldo e podem exibir excluídos sem reinseri-los nos totais. Ações permanecem visíveis na tabela móvel. Compras do cartão têm edição de descrição, cartão, valor, data, parcelas e categoria; correção atômica recalcula parcelas/vencimentos/limite, e exclusão remove parcelas dos totais preservando compra e revisões. Metadados podem ser corrigidos em compras com fatura paga; mudanças financeiras/exclusão são bloqueadas até conciliação do pagamento.

Migration 202610080017 aplicada somente no banco local. Supabase hospedado exige executar docs/supabase-update-card-corrections.sql no SQL Editor antes do deploy; bootstrap não deve ser reaplicado ao banco existente. Wrapper incremental testado em banco descartável com o bootstrap anterior e reexecução idempotente.

41 testes unitários, TypeScript/build e 21 checks locais de integração passaram, incluindo centavos, parcelas, RLS, rollback de limite e proteção de pagamentos existentes. Quatro testes de navegador passaram, incluindo edição/exclusão de receita e despesa no celular, persistência de cores claras/escuras, correção/exclusão de compra e conferência de saldos após recarregar. Não houve alterações no banco de produção.

## Faturas mensais e próximas faturas

A página Cartões passou a usar um seletor próprio por mês de vencimento, separado dos filtros de movimentações. Cada cartão destaca a fatura selecionada, o valor pago e o saldo a pagar, mantendo limite disponível e total comprometido em campos distintos. Uma central permite filtrar cartões, conferir parcelas/compras de cada fatura, navegar por meses anteriores/futuros, visualizar os seis meses seguintes e iniciar pagamento do saldo com a fatura/conta preenchidas. O dashboard destaca a fatura do mês corrente. Valores derivam de parcelas e pagamentos já persistidos, com Decimal; crédito de uma fatura não reduz o valor a pagar de outro cartão. Fechamento exibido é derivado dos dias cadastrados do cartão, sem mudar vencimentos históricos. Nenhuma migration nova ou alteração em produção foi executada nesta etapa.

47 testes unitários, TypeScript/build, 21 checks locais de integração e cinco testes de navegador passaram na versão final. Cobrem dois cartões, compra parcelada em três meses, centavos, pagamento parcial/completo, filtro, meses sem fatura, persistência após recarregar e layout móvel.

## Dashboard completo e CDI diário automático

Dashboard redesenhado com painel patrimonial e resultado líquido destacados, oito indicadores, comparação monetária/percentual com janela anterior equivalente, evolução de seis meses ou período selecionado, categorias incluindo gastos sem categoria, faturas de todos os cartões e três meses seguintes, pagamentos preenchidos, caixa operacional, disponibilidade após compromissos atuais, orçamentos, metas, carteira, movimentações e histórico patrimonial registrado. Filtros se aplicam aos fluxos; patrimônio/saldo são atuais e faturas usam mês de vencimento da data final. O resultado inclui somente receitas/rendimentos confirmados menos despesas/compras integrais; pagar fatura, transferir e investir não duplica gasto. Percentual sem base anterior fica identificado. Navegação de próximas faturas abre o mês escolhido em Cartões.

Caixinhas exibem rendimento no último dia disponível, no mês atual e acumulado por lote; resgates não apagam os ganhos estimados do mês. Lotes futuros e taxas invalidadas ficam fora dos cálculos atuais. CDI/Selic têm sincronização independente de CVM, cache persistente de quatro horas, timeout/retry, origem/coleta/validação e cobertura histórica em etapas. Endpoint GET protegido por CRON_SECRET e POST autenticado de mesma origem. Cron Vercel diário 12:00 UTC e verificação ao abrir aplicações elegíveis, com atualização de interface após persistência das taxas. Ganhos calculados não criam transações nem alteram saldo confirmado. O cálculo é inspirado em reservas remuneradas e não afirma conexão bancária.

Consulta real BCB confirmou CDI de 07/10/2026 (0,050788% ao dia). Atualização no Supabase hospedado persistiu 251 registros oficiais CDI e 251 Selic até essa data, com estados/origem de sincronização; nenhuma posição, movimentação, usuário ou migration foi alterada. A primeira tentativa hospedada exigiu adequar o uso do proxy do ambiente; a sincronização subsequente concluiu com sucesso. Agendamento na Vercel depende do deploy manual e de SUPABASE_SERVICE_ROLE_KEY/CRON_SECRET em Production; não foi ativado externamente. Instruções em DEPLOY.md.

Validação final: 58 testes unitários, TypeScript/build, 21 checks locais de integração e seis testes de navegador passaram. Casos incluem receita/despesa, compra parcelada vs. fatura, pagamentos parciais, caixa, comparativo sem base, orçamentos, reprocessamento CDI com cache, falha de provedor, taxas fora do período, backfill, contratos distintos, resgate e ausência de taxas. Navegador verificou gráficos, registro patrimonial, endpoint sem sessão/sem segredo retornando 401, atualização autenticada dos indexadores, saldo sem alteração e ausência de rendimentos fictícios, filtros e navegação móvel sem rolagem horizontal. Reexecução hospedada retornou cache para ambas as séries sem duplicação. Capturas desktop/mobile revisadas, com cabeçalho CDI ajustado para celular. Próxima ação: publicar commit na main e usuário executar deploy/configuração Vercel conforme DEPLOY.md.

## Separação de gastos/saldo mensais e visão geral

Correção solicitada pelo usuário: o dashboard passou de compras integrais na data da compra para despesas da conta + parcelas por vencimento no cálculo de gastos/saldo, categorias, comparativos, gráficos e orçamentos. Nos presets Este mês/Mês anterior, entram todas as parcelas do mês, mesmo com vencimento posterior ao dia atual; receitas/despesas confirmadas seguem as datas do filtro. Nas janelas de 7/30 dias, ano ou personalizadas, entram apenas parcelas com vencimento nas datas selecionadas. Cada ponto mensal do gráfico usa somente parcelas daquele mês. Compras de meses anteriores continuam contribuindo com suas parcelas atuais; pagamento da fatura não repete a despesa e compras excluídas ficam fora.

Saldo do mês é receitas + rendimentos recebidos − despesas e parcelas do mês; não incorpora saldo trazido de outros meses ou patrimônio. Painel geral mostra patrimônio bruto/líquido atual e dívidas de todos os meses. Bloco separado reúne gastos gerais do histórico (despesas + compras integrais até hoje), saldo comprometido de todas as faturas e parcelas futuras, sem misturar histórico com dívida a pagar. Posições e CDI não foram alterados; não exige nova migration ou escrita em produção.

Validação final: 60 testes unitários, TypeScript/build, 21 checks de integração locais e seis testes de navegador passaram. Casos cobrem rateio de centavos por mês, compras anteriores, parcelas futuras fora do resultado atual, categorias/orçamentos por parcela, exclusões e pagamentos. Navegador confirmou gastos mensais de R$ 150,00 vs. histórico R$ 350,01, saldo mensal R$ 860,00, compromisso futuro separado, patrimônio geral preservado ao trocar filtros, próximo mês com somente R$ 100,00 da parcela e interface móvel sem rolagem horizontal. Captura desktop revisada. Próxima ação: novo deploy manual da main; nenhuma atualização SQL necessária.

## Verificação da atualização automática no deploy — 08/10/2026

Verificação somente leitura no Supabase hospedado: estados CDI/Selic registram última execução bem-sucedida em 08/10/2026 13:14 UTC, correspondente à sincronização feita neste ambiente durante a implementação. Taxas armazenadas chegam a 07/10/2026. Consulta direta ao BCB SGS 12 para 07–08/10 confirmou somente a publicação de 07/10, de 0,050788% ao dia. As aplicações verificadas começam em 08/10; não há taxa publicada elegível após seus aportes, portanto rendimentos estimados zero são coerentes nesse momento.

Captura do usuário mostra erro do backend solicitando SUPABASE_SERVICE_ROLE_KEY; a atualização automática desse deploy está bloqueada por configuração. Credencial Supabase disponível permitiu a consulta, mas não fornece acesso administrativo à Vercel. VERCEL_TOKEN não está configurado neste ambiente. Tentativas de acessar o domínio publicado foram bloqueadas pelo proxy de rede (CONNECT 403), portanto não foi possível inspecionar diretamente o endpoint ou logs do cron da Vercel. A verificação não executou sincronização, não criou transações e não alterou rendimentos ou posições.

Ação necessária: configurar SUPABASE_SERVICE_ROLE_KEY e CRON_SECRET como variáveis privadas Production na Vercel, fazer redeploy e conferir a verificação em Caixinhas e as execuções em Cron Jobs. Nenhuma mudança no código de cálculo ou migration é necessária para essa configuração.

## Correção de diagnóstico e acesso à Vercel — 08/10/2026

Nova captura sem erro de configuração: não tratar a indicação antiga de chave ausente como prova do estado atual. Nova leitura do Supabase confirmou dois lotes CDI iniciados em 08/10 e taxa mais recente de 07/10, com cobertura desde 08/10/2025. Rendimentos zero são coerentes até a primeira publicação elegível. A interface agora identifica a espera pela primeira taxa sem o falso aviso de histórico parcial, distingue horário da verificação no servidor da última consulta BCB/cache e informa falhas de configuração separadamente das falhas internas.

62 testes unitários, TypeScript/build, 21 checks integrados locais e sete testes de navegador passaram. Um caso determinístico no navegador usa taxas simuladas exclusivamente na resposta interceptada do teste local: aporte novo aguarda, não recebe a taxa anterior e passa a render quando chega uma publicação elegível, sem criar rendimento confirmado. Capturas desktop/mobile revisadas; layout móvel sem rolagem horizontal. Nenhuma migration necessária ou posição financeira de produção alterada.

O token Vercel foi recebido e armazenado em arquivo privado ignorado. O bloqueio inicial CONNECT 403 foi resolvido depois de salvar api.vercel.com e finance-two-lake.vercel.app no rascunho de rede. A API confirmou o projeto finance ligado à main deste repositório, cron diário ativo às 12:00 UTC e nenhuma variável cadastrada (incluindo contagem de variáveis ocultas zero). SUPABASE_SERVICE_ROLE_KEY e CRON_SECRET foram configuradas como encrypted somente em Production. Próxima ação: publicar o commit, acompanhar o deploy da main e testar a chamada autorizada em produção; configuração salva sem redeploy ainda não valida a execução.

Código publicado na main em 1ec3aad; deploy dpl_BW8hyZ3gQtCmHDhemCFitex395ts ficou READY e recebeu o domínio finance-two-lake.vercel.app. Verificação real em 08/10/2026 14:58:19 UTC: GET do cron autorizado respondeu 200 com checkedAt atual e cache válido de CDI/Selic até 07/10; GET sem segredo e POST sem sessão retornaram 401; página inicial respondeu 200. Configuração e endpoint foram validados, mas o disparo futuro diário do agendador ainda não foi observado. O cache de quatro horas explica a reutilização do histórico; não foi alterado para fabricar uma sincronização nova. Atualização automática do cálculo após uma publicação elegível foi validada nos testes locais. Próxima ação operacional: conferir a próxima execução em Vercel → Cron Jobs e a próxima referência oficial, mantendo ganhos estimados separados do caixa confirmado.

## Atualização financeira ampla — em validação final

Implementados parcelamento por total ou valor individual com prévia, edição auditada de parcelas futuras, recorrências semanais/mensais/anuais com início/fim opcional e geração automática de pendências, categorias em dois níveis com seleção hierárquica, gráficos detalháveis, filtros e arquivamento sem perda de histórico. Os indicadores mensais compartilham as regras de competência; previsões ficam separadas do caixa confirmado.

Incluídos planejamento 30/60/90 dias, disponibilidade até o fim do mês, reserva por despesas essenciais, aportes para metas, conciliação explícita de contas/cartões, diagnóstico da qualidade dos dados, correção/estorno de investimentos e proventos líquidos, resgates de rendimento confirmado, importação revisável e exportação tipada. Cotações invalidadas, janelas incompletas de indexadores e resgates sem alocação por lote não são apresentados como cálculos completos. Integridade exige operações transacionais e rejeita referências entre usuários, não finitos e alteração genérica do saldo das caixinhas.

Migrations 18–23 aplicadas somente no banco local. Script docs/supabase-update-financial-upgrade.sql validado duas vezes em banco descartável sobre baseline 17 com IDs, histórico, saldos e centavos preservados. Validações atuais: 130 testes unitários, TypeScript/build, 21 checks de integração, 13 de integridade, 7 de importação e 8 de agendamentos passaram. Ensaio real de backup criptografado/restauração e 15 testes de proteção passaram; Os 16 casos de navegador passaram entre a rodada geral e a repetição do caso corrigido; a rodada completa final está em execução. A verificação revelou e corrigiu o bloqueio mútuo entre investimentos no mesmo dia (migration22) e a omissão de operações excluídas no histórico (migration23). Foram adicionadas verificações de dependências e caixa/histórico preservados.

Credenciais administrativas Supabase foram aceitas; baseline 17 confirmado em produção. Snapshot lógico privado criptografado de 53 tabelas financeiras/Auth preparado antes da atualização; não substitui um backup PostgreSQL completo nem restauração de configurações externas. Site URL/redirect de Auth corrigidos para https://finance-two-lake.vercel.app/auth/callback. A infraestrutura de rede substitui a autenticação do GitHub pela integração do ambiente: consulta com credencial deliberadamente inválida também recebe identidade autenticada; administração de Actions/secrets/environments retorna 403. Não solicitar novos tokens como solução para esse bloqueio. Workflows de CI, mercado e backups estão preparados, mas sincronização/backup dependem da configuração externa descrita em OPERATIONS.md. Implementação registrada em commits locais desde 1b8341e, com correções incrementais posteriores; publicação e SQL18–23 hospedado ainda pendentes.

Próxima ação: finalizar correções e testes de navegador, publicar commits, aplicar migrations incrementais hospedadas antes do deploy e verificar produção; registrar resultados finais e limitações comprovadas. Nenhum segredo deve ser registrado no Git.


## Entrega verificada — 09/10/2026 UTC (08/10 em Brasília)

Código e workflows publicados na main até `29792c4`. Supabase atualizado pelas migrations 18–23: guards financeiros, importação, hierarquia, recorrências/parcelas e correções de histórico de investimento. Nenhum registro financeiro antigo foi perdido; IDs, valores, saldos, datas e classificações comparados em dez tabelas ficaram idênticos. Grants verificados: snapshot exige autenticação, geração global de recorrências exige serviço; constraints numéricas validadas. Auth Site URL e callback usam o domínio publicado. Snapshot lógico financeiro/Auth de 53 tabelas foi criptografado e teve seus bytes recuperados antes do upgrade; não equivale a um backup PostgreSQL completo ou ensaio de recuperação hospedada.

Validação final: 130 unitários, TypeScript/build, 21 verificações integradas, 13 de integridade, 7 de importação, 8 de agendamentos e 15 de proteção/criptografia passaram. Os 16 cenários de navegador passaram entre a última rodada (15/16) e a repetição do planejamento: a falha era espera de renderização antes da resposta inicial do snapshot; o teste agora aguarda a resposta real 200 antes de conferir os indicadores. A rodada anterior revelou dois erros de investimento corrigidos em migrations adicionais: bloqueio mútuo em operações do mesmo dia e omissão do histórico excluído. Upgrade desde baseline 17 executado duas vezes em banco descartável preservou histórico; backup PostgreSQL 17 com schema final, criptografia, recuperação/restauro, centavos, Auth e RLS passou.

Produção: página inicial 200; snapshot sem sessão 401; cron sem segredo 401. GET autorizado do cron respondeu 200 em 2026-10-09T02:17:29Z com CDI disponível até 07/10, Selic até 08/10 e geração global de recorrências funcionando (zero usuários pendentes/zero lançamentos gerados naquele instante). Cálculos continuam usando somente publicações elegíveis; nenhum rendimento fictício ou receita estimada foi criado. Agendamento 12 UTC permanece ativo; a chamada manual não comprova o próximo disparo.

CI remoto: https://github.com/Dev-Maldonado/Finance/actions/runs/37873777324 iniciou automaticamente no push; instalação, unitários e criptografia já passaram, restante ainda em execução no momento deste registro. Workflows de mercado/CVM e backup estão publicados, mas gated e inativos até configurar environments/secrets/variáveis conforme OPERATIONS.md. Administração dessa configuração e proteção de branch retorna 403 pela integração do ambiente, mesmo com credencial inválida substituída pela autenticação da plataforma; novos tokens fornecidos pelo usuário não resolvem isso. Não registrar segredos.

Limitações preservadas: sem conexão bancária/Open Finance; resgates de juros sem alocação por lote deixam a estimativa incompleta identificada; contratos/tributos específicos, câmbio e recuperação completa de produção precisam de validação própria. Recomendar rotação dos segredos realmente compartilhados no chat. Próxima ação operacional: acompanhar o CI, habilitar mercado/backups no painel com acesso administrativo, proteger main e realizar ensaio de recuperação em projeto hospedado separado.


### Portabilidade do CI

O primeiro job remoto falhou no startup local porque o runner ubuntu-24.04 não possui ripgrep. As três checagens de resposta PostgreSQL agora usam `grep -Fxq 1`, disponível no runner, mantendo as mesmas verificações de roles, schema Auth e migrations. Logs foram recuperados pela URL assinada sem propagar o header de autenticação ao storage. Banco local reiniciado sem reset ou alteração financeira; nova execução remota acompanhará o commit desta correção.


CI remoto 37874119316 passou por instalação, unitários, criptografia, startup, backup/restauro, upgrade legado, tipos/build e 49 verificações integradas. Navegador 15/16: o teste de limpar a instituição da conta consultava o snapshot antes de o POST de salvar concluir. Ele agora aguarda o fechamento real do diálogo antes de conferir a persistência; a asserção do valor vazio foi mantida. Nova rodada remota acompanha essa correção de sincronização do teste.


## Fechamento da validação remota

CI 37874562805 concluiu com **success** para o commit `2a5c529`, executando todas as etapas: instalação limpa, 130 unitários, 15 verificações de proteção/criptografia, startup PostgreSQL/Auth, backup/restauração, upgrade desde baseline 17, TypeScript/build, 21 verificações de integração, 13 de integridade, 7 de importação, 8 de agendamentos e 16 cenários de navegador. Falhas anteriores de portabilidade e sincronização dos testes foram diagnosticadas e corrigidas, sem remover asserções. Deploy de produção correspondente: dpl_AuBbaZCtVNDaMvmZhm7t5MLCNcnA READY.

Este último commit atualiza apenas a documentação dos resultados; `[skip ci]` evita repetir os testes já aprovados para uma anotação operacional. Não altera aplicação, migrations ou testes. Workflows de mercado/CVM e backups continuam publicados e inativos até a configuração administrativa descrita em OPERATIONS.md. Cron Vercel de CDI/Selic e recorrências foi verificado com autorização; histórico financeiro preservado. Checkout limpo, sem credenciais versionadas.


## Ajuste visual do detalhamento de categorias

Subcategorias do gráfico agora aparecem como linhas estáticas legíveis, sem a opacidade e o cursor de botões desabilitados. Nomes, valores e percentuais têm colunas/linhas próprias; título e retorno ganharam espaçamento. O foco preto retangular nas fatias foi removido de forma restrita ao gráfico de categorias; teclado mantém indicação roxa visível e os botões continuam acessíveis. Tooltip com cantos arredondados acompanha os cards. Cálculos e banco não foram alterados.

130 unitários, TypeScript e build passaram. O teste existente de hierarquia no navegador passou, incluindo categorias/relatórios/mobile. Conferência visual com usuário temporário local e fixtures equivalentes à captura: linhas com opacidade 1, contorno de clique inexistente e foco visível por teclado; celular 390 px com conteúdo 390 px, sem overflow. Capturas desktop/mobile inspecionadas. Nova publicação na main e deploy Vercel seguem o fluxo existente; CI completo executa automaticamente.

## Refinamento visual de categorias, parcelamento e registro patrimonial

Gerenciamento de categorias ganhou cabeçalhos e ações alinhados, subcategorias em linhas com identificação hierárquica, valores legíveis, divisórias e expansão sem o marcador nativo duplicado. Cards não esticam para preencher a altura do maior grupo. O seletor hierárquico tem recuo e vínculo visual; filtros distinguem todas as categorias de lançamentos sem categoria e incluem corretamente os descendentes. Compra parcelada usa duas opções visuais selecionáveis com rádio alinhado, descrição e foco por teclado; métodos, centavos e prévia mensal foram preservados.

Registrar patrimônio agora mostra carregamento, confirmação ou erro junto à ação, com data e patrimônio líquido calculados no servidor. O primeiro registro tem uma visualização própria; quando hoje está fora do filtro, o período muda para o mês atual para exibi-lo. Dashboard e relatórios compartilham o mesmo fluxo. A gravação continua fazendo upsert por usuário/data, sem alterar posições de outros dias ou migrations.

Validação local: 130 unitários, TypeScript/build e 21 verificações integradas passaram; os 17 cenários de navegador passaram. Novo cenário conferiu diretamente no banco a primeira posição, recomputação após despesa, atualização do mesmo ID no mesmo dia, ajuste do filtro e falha simulada sem perda do histórico. Capturas desktop/mobile foram inspecionadas; categorias e formulário sem overflow em 390 px. O último acabamento do seletor hierárquico também passou por build, conferência visual e nova execução do teste completo de categorias. Publicado na main no commit `0a91264`. Deploy de produção `dpl_2SNgHGVEKbTM1qx5ZcKrTCBfqjVx` READY; URL pública respondeu HTTP 200 e contém os quatro grupos de estilos novos. CI remoto 37877431082 concluído com **success** para `0a91264`: pipeline completo, incluindo 17 cenários de navegador, passou. Correções publicadas e verificadas; este fechamento altera somente a documentação, com `[skip ci]` para evitar repetir a suíte pelo registro operacional.

## Auditoria geral — 09/10/2026 (Brasília)

Correções de filtros compartilhados por cartão, interseção de filtros das compras e métricas da seleção, transações excluídas, categorias arquivadas/sem categoria, referência temporal consistente, rendimento de caixinhas por período e ponto inicial dos lotes. Falha de recorrências não bloqueia leitura; mensagens de rede/gateway e avisos têm tratamento acessível. Indicadores receberam cores financeiras semânticas; compras mobile mostram os dados essenciais, tabelas e cabeçalhos foram refinados. Não há migrations ou escrita de testes em produção.

137 unitários, TypeScript/build, 21 integrações, 13 integridades, 7 importações, 8 agendamentos e 15 testes de proteção/criptografia passaram. Dez páginas/30 combinações de viewport foram medidas sem overflow ou erro de JavaScript; 19 cenários de navegador passaram na repetição serial; 4 cenários de compras/dashboard passaram novamente após o acabamento final, incluindo cartão e valor visíveis no celular. Consulta de metadados de produção somente por leitura confirmou estados de CDI/Selic; administração de secrets Actions segue HTTP 403. Detalhes em AUDIT-2026-10-09.md. Publicado na main no commit `6d81018`. Deploy `dpl_4kyUeWeB5tHZcWDy7efDotSBm4Ln` READY, URL pública HTTP 200 com novos estilos. CI 37880530018 concluído com **success**, incluindo backup/restauração, upgrade, 49 verificações financeiras e 19 cenários de navegador. Fechamento documental com `[skip ci]` preserva o código validado; pendências administrativas externas permanecem descritas no relatório e em OPERATIONS.md.
