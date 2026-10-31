---
name: finora-context
description: Contexto compacto da FINORA 2.0; carregar requisitos por módulo durante desenvolvimento, revisão e validação.
---

# FINORA 2.0

## Uso e economia de contexto

Leia este arquivo ao iniciar uma tarefa FINORA. Consulte INDEX.md e leia apenas as seções necessárias da pasta references. O prompt original permanece integral em references/prompt-original.md; o resumo não substitui seus critérios detalhados. Carregue também as seções 18 (modelo), 19 (contabilidade), 20 (segurança) e 22 (testes) quando afetadas. Instruções atuais do usuário prevalecem. Não trate exemplos como dados reais.

Use o checkout existente /workspace/Finance. Cada tarefa cloud já é isolada; não crie worktrees sem solicitação. Inspecione novamente arquivos e instruções do projeto antes de modificar. Diferencie configuração de ambiente de desenvolvimento da aplicação: onboarding preserva fonte e lockfiles; uma tarefa de implementação permite as mudanças de código solicitadas.

Mantenha docs/STATUS.md atualizado com etapa atual, trabalho concluído, evidências de validação, bloqueios e próxima ação. Não registre segredos. Retome pelo status e pelos arquivos, sem reler todo o prompt. Comunique resultados e limitações de forma concisa. Economia de tokens não autoriza omitir funcionalidades ou testes exigidos.

## Requisito atual de caixinhas e indicadores — 09/10/2026

Caixinhas passam a ser exclusivamente manuais: saldo inicial, depósitos e retiradas reais, saldo total informado mensalmente, correções auditadas e histórico. Nenhum CDI/Selic/estimativa calcula retornos. Resultado = saldo atual + retiradas brutas − impostos efetivos − depósitos; percentual sobre depósitos totais. Sem observação/valor confirmado, mostrar aguardando atualização. Não alterar saldos antigos na migração 25; preservar lotes/reconciliações e demais áreas. Ver [MANUAL-SAVINGS.md](../MANUAL-SAVINGS.md). Os requisitos antigos de CDI automático abaixo são históricos e foram substituídos.

Dashboard exibe meta Selic SGS 432 do BCB (% a.a.) e IPCA 12 meses tabela 1737/variável 2265 do IBGE/Brasil, com referência, timeout, cache e falhas independentes sem números fictícios. Indicadores são informativos, separados dos rendimentos do usuário. Preservar desktop/mobile/PWA e demais módulos.

## Requisito mobile/PWA — 09/10/2026

Criar uma experiência própria de aplicativo para celulares/tablets, mantendo integralmente os módulos, dados, backend, autenticação e cálculos. Desktop não recebe mudanças visuais. Navegação inferior e menu completo, formulários/touch charts, safe areas/teclado, Android/iOS standalone e atualização explícita. Cache somente de arquivos públicos/estáticos; nunca snapshots, páginas autenticadas ou mutações. Sem lançamentos offline. Ver [MOBILE-PWA.md](../MOBILE-PWA.md) para instalação e validação.

## Requisito atual de investimentos — 09/10/2026

O pedido atual substitui integralmente a seção 17 original e a atualização automática anterior: apenas Fundos e Criptomoedas, cadastro manual de nome/tipo/quantidade/valor total/data, compras adicionais separadas, preço médio, atualização mensal manual de unidade/cota, patrimônio/lucro/retorno e gráfico mensal simples. Nenhuma API, corretora, provento/evento/importação de investimentos na interface. Aportes não são lucro; sem preço informado não inventar retorno. As outras áreas permanecem preservadas.

O usuário respondeu explicitamente **“apagar registros existentes, limpando o código antigo”** à escolha de preservar ou arquivar a carteira anterior. A migration 24 limpa os investimentos existentes uma única vez, preservando contas, valores/statuses de transações e demais módulos. Reexecução não apaga novos registros manuais. Detalhes em [MANUAL-INVESTMENTS.md](../MANUAL-INVESTMENTS.md). Referências antigas abaixo permanecem apenas como histórico e para os módulos não substituídos.

## Objetivo e prioridades

Aplicação financeira pessoal funcional, persistente e segura: contas, transações, cartões, categorias, caixinhas manuais, investimentos, rendimentos, planejamento, relatórios e patrimônio. Prioridade: precisão financeira; fontes confiáveis e automação; CDI/caixinhas; carteira; dashboard; segurança/persistência; UX; baixo custo. Desenvolver por etapas com código validado e preservar funcionalidades anteriores.

## Stack e arquitetura

Preferir Next.js App Router, React, TypeScript, Tailwind, shadcn/ui, Lucide, Recharts, TanStack Query, React Hook Form, Zod e animações discretas com Framer Motion. Backend Supabase/PostgreSQL/Auth/RLS, Server Actions ou API Routes, migrations versionadas. Cálculos isolados com decimal.js/big.js; nunca usar ponto flutuante comum em cálculos críticos. Separar UI, serviços financeiros, provedores e jobs.

## Regras invariáveis

- Transferências próprias, aportes em caixinhas e compras de ativos movem patrimônio; não viram receita/despesa automaticamente. Não duplicar patrimônio.
- Pagamento de fatura não repete despesa da compra. Separar competência e caixa; parcelas seguem fechamento e vencimento.
- Separar saldo disponível, patrimônio bruto/líquido, rendimentos recebidos, estimativas, lucro realizado, valorização não realizada e projeções.
- CDI SGS 12 é taxa diária percentual: fator simples elegível = 1 + (taxa/100) × (percentual contratado/100). Capitalização composta por lote; respeitar aportes, resgates, datas, contratos e produto. Não anualizar novamente nem inventar taxas ausentes.
- Tributos por produto e vigência; IR/IOF/isenções/come-cotas quando aplicáveis. Estimativa líquida não é saldo confirmado. Histórico reproduzível e conciliação explícita.
- Fundos: posição = cotas efetivas × cota disponível; respeitar classe/subclasse e cotização. Não deduzir taxas já refletidas na cota.
- Rentabilidade considera fluxos, custos e eventos; comparação CDI usa mesmo intervalo/convenção. Distinguir desempenho da cota e do investidor.
- Proventos anunciados não são recebimentos. Confirmação/conciliação e idempotência obrigatórias.
- Dashboard usa dados do usuário ou integrações autorizadas. Dados externos exibem origem, referência, coleta, validação e defasagem; falhas nunca geram valores fictícios.

## Integrações e segurança

BCB oficial para CDI/Selic. Investimentos usam somente valores manuais; integrações de mercado/CVM foram retiradas. Endpoints do prompt precisam ser verificados antes do uso. Provedores independentes: CDIRateProvider, MarketDataProvider, BCB/Brapi/CVM/manual. Cache persistente, sincronização idempotente, correções versionadas, timeout e retry limitado com backoff. Jobs backend independentes do navegador. Alternativa manual quando necessário; declarar pendências sem afirmar integração funcionando.

CDI não concede acesso a saldos bancários. Open Finance exige consentimento, escopo e revogação. Tokens somente no servidor; RLS e validação backend isolam usuários. Não armazenar credenciais bancárias informais, PAN completo ou CVV. Variáveis previstas: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET; nunca registrar valores secretos.

## UX e abrangência

Referência visual obrigatória quando fornecida. Roxo #5B35D5, lilás #F0EBFF, branco, fundo #F7F8FC, verde/vermelho para estados e cinza secundário; cards arredondados e sombras discretas. Sidebar recolhível: Dashboard, Contas e Saldos, Cartões, Transações, Categorias, Caixinhas, Investimentos, Planejamento, Relatórios, Configurações. Responsivo sem cortes ou rolagem horizontal desnecessária.

Dashboard: saldo, entradas, saídas, cartões, rendimentos, patrimônio bruto/líquido; filtros temporais; gráficos e resumos. CRUD completo com recorrência/status, categorias/subcategorias, extratos, faturas/parcelas, caixinhas/metas/lotes, carteira/proventos/eventos, orçamentos e simuladores. Classes incluem ações, FIIs, ETFs, BDRs, FIAGROs, fundos, renda fixa, Tesouro, internacionais e personalizados. Importar CSV/OFX/planilhas com prévia, conciliação e deduplicação; exportar CSV/Excel/PDF. Detalhes e campos estão nas referências.

## Execução e validação

Sequência original: 1 fundação; 2 finanças pessoais; 3 cartões; 4 CDI; 5 caixinhas; 6 provedores de mercado; 7 investimentos; 8 dashboard/relatórios; 9 refinamento. Cada etapa entrega código funcional validado. Rodar testes financeiros, CDI com casos independentes, investimentos/eventos, falhas/cache/correções e isolamento/RLS. Verificar persistência, interface desktop/mobile, fontes/datas e comportamento real. Não afirmar testes ou integrações não executados.

## Histórico integrado de transações — 11/10/2026

Transações reúne o ledger de contas e as parcelas de cartões em um modelo somente de apresentação (`transaction-history.ts`). Ordenação decrescente por data; parcelas usam o vencimento da fatura, UUID próprio com prefixo e vínculo à compra original. Filtros por conta/cartão, categoria/subcategoria, período, tipo, status e busca são combinados; o status da parcela segue o pagamento da fatura, sem presumir pagamento individual numa fatura parcial. Edição/exclusão no histórico de cartão abre a compra original. Compras Registradas mantém uma linha por compra, com total complementar, parcela(s) do mês da fatura selecionado e expansão de todos os valores/vencimentos reais. Nenhum novo lançamento bancário nem alteração de cálculos ou migration foi introduzido.

## Dashboard visual — 11/10/2026

Dashboard organizado em 12 áreas abertas, com navegação por âncoras, composição própria e Inter auto-hospedada. Inventário completo e preservação em [DASHBOARD-REDESIGN.md](../DASHBOARD-REDESIGN.md). Estilos isolados em `dashboard-redesign.css`; `use-readable-amounts.ts` adapta somente a fonte/grade, sem modificar valores. Fontes/premissas e compromissos abertos inicialmente apenas no dashboard. Oito indicadores, 12 blocos originais, cálculos, gráficos, filtros, ações e demais módulos permanecem preservados. Não substituir informações reais por exemplos nem ocultar resumos no redesign.

Refinamento posterior usa a referência enviada: panorama com patrimônio roxo/resultado/taxa separados, densidade compacta e faixa econômica sticky. A faixa e os cards completos usam uma única instância de consulta via portal visual; índices, datas, fontes, erros e atualização preservados. Não adicionar gráficos decorativos com dados fictícios.

Análises seguem a composição específica da referência: barras agrupadas/linha e três indicadores à esquerda; rosca com total central/tabela de categorias e comparativo abaixo à direita. Opções 6/12 meses e período selecionado; 12 meses reutiliza `periodMetrics`. Linha repete a série real de receitas apenas visualmente, sem duplicar o tooltip. Categorias/subcategorias e percentuais preservados, variações calculadas das despesas/parcelas anteriores com funções existentes. Demais telas mantêm os componentes compartilhados anteriores.

## Competência de transações futuras — 22/10/2026

Receitas e despesas pendentes ou confirmadas entram nos indicadores, categorias, orçamentos, comparativos e relatórios exclusivamente na data registrada, inclusive em meses futuros. Este mês abrange o mês inteiro; períodos personalizados preservam seus limites. Totais do período incluem previstos, identificados nos cards/resultado/taxa; fluxo operacional usa somente confirmados com data até hoje. Saldo disponível, patrimônio, rendimentos recebidos e histórico efetivo para reserva não antecipam pendências nem valores futuros. Parcelas continuam por vencimento; transferências/aportes/pagamento de fatura não duplicam receitas ou gastos.

## Contas Recorrentes — 26/10/2026

Seção `/recorrentes` centraliza parcelas ainda a pagar, gastos fixos e programados por mês. Consulta utiliza os registros existentes, sem ledger paralelo; a projeção de recorrências é compartilhada com o planejamento. Escopos por ocorrência e a partir dela preservam pagamentos e meses anteriores. Migration 26 adiciona `recurring_transactions.series_id` para trechos da mesma série e RPC autenticada/idempotente; ocorrências isoladas reutilizam o source_id do gerador, inclusive cancelamentos. Resumo de cartão usa saldo pendente da fatura, sem atribuir pagamento parcial a parcelas arbitrárias. Ver [RECURRING-BILLS.md](../RECURRING-BILLS.md).

## Navegação desktop e uso prático — 26/10/2026

Menu desktop agrupado, com grade compartilhada pela página e sem scroll interno; em janelas baixas acompanha a rolagem natural. `sidebar-collapse` evita a utility `collapse` do Tailwind que escondia o botão. Todos os módulos, recolher/expandir e navegação mobile preservados. Pendente não desconta do saldo; confirmado conta somente com data até hoje. Sugestões implementadas mediante solicitação posterior e regras atuais em [UX-PRACTICAL-REVIEW.md](../UX-PRACTICAL-REVIEW.md). Comparações de preservação em testes usam IDs estáveis para ignorar somente a ordem SQL, mantendo todos os registros e campos.

## Baixa prática e indicadores oficiais — 26/10/2026

Migration 27 adiciona `transactions.settled_on` anulável sem backfill e preferências de conta/categorias. Competência continua por `date`; saldo, caixa efetivo, conciliação e previsões usam `coalesce(settled_on,date)`. Baixas integrais via RPC autenticada/idempotente preservam vencimento e identificador da ocorrência recorrente. Listas oferecem Pagar/Receber; Contas Recorrentes tem Atrasadas, Próximos 7 dias e saldo atual/após compromissos. Preferências e atalhos de receita/despesa/transferência reduzem preenchimento sem alterar registros existentes.

Selic/IPCA/Dólar juntos na faixa econômica e nos cards completos. IPCA usa SIDRA oficial como primeira rota, agregados IBGE e SGS13522 como alternativas; dólar PTAX venda diária oficial com referência, sem alegar tempo real. Cache servidor persistente somente de índices públicos, leitura autenticada/escrita service_role, atualização horária e botão manual. Falhas independentes: manter último oficial válido explicitamente identificado, ou indisponível sem inventar valores. Nenhum índice modifica rendimentos pessoais. Ver UX-PRACTICAL-REVIEW.md.

## Organização e responsividade — 26/10/2026

Usuário autorizou reorganização visual de todas as áreas mantendo índices, gráficos, filtros, menus e funcionalidades, com nenhum conteúdo cortado. Ver [EXPERIENCE-REVIEW.md](../EXPERIENCE-REVIEW.md) para inventário. Faturas precedem cartões; listas compartilhadas adaptam tabela/cards, vencimentos agrupam urgência e formulários separam confirmação. Memória de visualização em sessionStorage por usuário/tela, validada, sem snapshots/tokens; relativos seguem hoje, URL explícita prevalece. Aguardar restauração antes de liberar filtros. Presets mobile em grade com todas as opções visíveis; altura natural, valores completos, tabelas com scroll interno e safe areas preservadas. Nenhuma mudança nas regras financeiras ou banco.

## Gastos fixos e remoção de recorrências — 28/10/2026

`periodMetrics` e Transações incluem despesas fixas previstas no intervalo, por
`projectedRecurringExpenses`, sem gravar futuros ou antecipar caixa. Chaves de
ocorrência já registradas, canceladas ou removidas suprimem a projeção; manter os
tombstones do snapshot na deduplicação. UI oculta `deleted_at`, sem apagar a
auditoria. Migration29/RPC `remove_recurring_records` remove cadastro ou ocorrência
com idempotência; somente a opção explícita de histórico remove os lançamentos
vinculados e recalcula inclusive valores já efetivados. Ver RECURRING-BILLS.md.

## Organização funcional em cinco módulos — 30/10/2026

Pedido atual permite informações progressivas, preservando todos os recursos.
Navegação principal: Início, Movimentações, Cartões, Patrimônio, Análises;
Configurações é secundária. Mapeamento completo em [UX-MODULES.md](../UX-MODULES.md).
`workspace-navigation.ts` resolve somente apresentação, mantendo URLs antigas.
Início conserva os oito indicadores e acesso explícito a `/inicio/completo`, com
os 12 grupos integrais anteriores; gráficos aprofundados em Análises, histórico
patrimonial e caixinhas/investimentos em Patrimônio. Mesmos componentes, cálculos,
serviços e backend; nenhuma migration. Botão global Adicionar reutiliza cadastros.
Preservar mês/cartão/filtros entre subdivisões do mesmo contexto. Categorias em
Configurações também acessíveis durante o cadastro em nova aba, sem perder rascunho.

Rascunhos: reconfirmação da mesma sessão revalida o snapshot mantendo dados;
sair/trocar usuário limpa cache e diálogos privados. `use-snapshot-sync.ts`
avisa alterações entre abas por usuário, sem registros/tokens; a aba receptora
reconsulta a API. Categorias criadas em outra aba ficam disponíveis no cadastro
sem apagar os campos digitados. Formulários revalidam opções ao receber foco.

## Refinamento visual e responsividade — 30/10/2026

Preservar todos os destinos/recursos de UX-MODULES.md. Ajustes atuais em
[VISUAL-QUALITY.md](../VISUAL-QUALITY.md), CSS compartilhado visual-quality.css.
Altura natural, grades minmax(0,1fr), descrições longas com quebra, valores
monetários ampliam o card antes de reduzir fonte; não mudar textos ou cálculos.
Tabelas extensas têm scroll localizado, indicação visual e foco por teclado.
Modais respeitam viewport/safe areas e mantêm ações alcançáveis; nenhuma segunda
rolagem vertical na prévia de parcelas. Skeleton não apresenta valores fictícios.
Animações de entrada nunca ocultam conteúdo e respeitam movimento reduzido.
Auditoria deve aguardar dados efetivos, fontes e fim do skeleton antes de medir;
verificar também ranges de texto, além das bordas dos elementos. Testes locais,
usuários descartáveis; resultados e publicação em STATUS.md.

## Integridade estrutural de layout — 30/10/2026

Ver [LAYOUT-INTEGRITY.md](../LAYOUT-INTEGRITY.md). Reservas de scroll e espaço
inferior passam a ser medidas, incluindo cabeçalho, índices e avisos PWA. Em pouca
altura, índices/avisos retornam ao fluxo normal; nunca escondê-los. Posicionamento
de modais considera altura e deslocamento de visualViewport (resize e scroll),
com campos focados fora da área do rodapé sticky. Não repor offsets fixos ou
`overflow-x:clip` no html para mascarar falhas. Validar ancestrais que recortam texto,
interceptação real por barras, 10 resoluções e zoom 125/150/200%, além do fim da página.
