# Dashboard FINORA — inventário e redesign

Escopo: apresentação do dashboard, sem alterar serviços financeiros, fórmulas, APIs, autenticação, banco ou filtros. Referência anterior: commit 6f4595e. A versão anterior foi capturada no desktop e celular antes das mudanças. Tipografia Inter auto-hospedada, licença OFL em public/fonts/Inter-OFL.txt; outras telas preservam sua tipografia.

## Inventário de preservação

| Área | Conteúdo e comportamento preservados |
| --- | --- |
| Panorama | Patrimônio líquido, bruto, dívidas totais, rendimento informado das caixinhas, notas de origem; resultado do período, intervalo, taxa de economia, variação monetária/percentual, acesso aos relatórios. |
| Oito indicadores | Saldo disponível; receitas; gastos do mês/período; faturas do mês; faturas a pagar; rendimentos recebidos; investido em BRL; rendimento manual das caixinhas no mês/período. Mantidos ícones, detalhes, estados, comparação com anterior e ausência de base percentual. |
| Planejamento | Disponível para gastar, valor diário, entradas/saídas previstas, saldo final, déficit; reserva, essenciais, cobertura, objetivo, falta, amostra; links para categorias/caixinhas/configurações; projeções 30/60/90 dias, abertura, entradas, saídas, mínimo/data, eventos, alertas; metas e aporte mensal. Componente financeiro original, compromissos abertos inicialmente no dashboard. |
| Compromissos | Gastos gerais históricos, compras integrais identificadas, saldo comprometido de todas as faturas e parcelas dos próximos meses. |
| Análises | Três séries (entradas, gastos, rendimentos), modos 6 meses/12 meses/período, média diária, parcelas e despesas de conta; categorias e subcategorias com detalhamento/retorno e percentuais; comparativo anterior/atual/variação de receitas, gastos, parcelas, rendimentos e resultado; nota explicando competência e caixa. |
| Disponibilidade/caixa | Disponibilidade após compromissos, saldo, faturas pendentes/atrasadas, despesas pendentes; resultado de caixa, recebimentos, despesas pagas, pagamentos de faturas e suas notas. |
| Faturas | Total, pago, pendente; cartão, identidade/cor, vencimento, status, saldo, total individual e pagamento; próximas três janelas registradas com links; alerta de atraso e acesso a Cartões. |
| Caixinhas/orçamentos | Todas as caixinhas, saldo, depósitos, alvo, progresso, rendimento acumulado/mensal, data/estado manual e link individual; todos os orçamentos, utilizado, limite, restante/excedente e progresso. |
| Patrimônio/carteira | Histórico registrado, variação, registrar posição, loading/sucesso/erro, gráfico líquido/bruto e posição única; alocação contas/caixinhas/investimentos; valor da carteira, posições, moeda, fontes e datas, ausência de avaliação e link aos investimentos. |
| Movimentações/ações | Registros recentes do modelo original: descrição, tipo, conta/cartão, categoria, data, valor e direção; links para transações e atalhos de organizar, planejar e reservas. |
| Economia | Selic/IPCA oficiais, referências, origens/links, atualização, carregamento, falha independente/indisponibilidade. Mesmo componente/API. |
| Confiabilidade | Cobertura/score, verificações, pendências, referências/coleta, observações, links, fontes e limitações. Fontes e premissas abertas inicialmente no dashboard, controles mantidos. |
| Controles externos | Novo lançamento; período mensal/anterior/7/30/ano/personalizado; início/fim; atualização global e navegação desktop/mobile/PWA. Nenhuma mudança de comportamento. |

## Estrutura visual

Doze áreas sempre renderizadas, com títulos e navegação por âncoras. Patrimônio e resultado têm contextos separados; indicadores em grade; análises, disponibilidade, reservas, patrimônio e movimentações têm composição própria, em vez da grade anterior contínua. Projeções no celular usam linhas completas. Nenhum resumo financeiro foi transferido para aba ou seção inicialmente oculta.

CSS isolado em dashboard-redesign.css com escopo dashboard-v2 e cabeçalho/filtros exclusivos do dashboard. Os componentes compartilhados recebem apenas opções de expansão inicial, mantendo os padrões originais nas outras telas. A adaptação de valores por largura atua apenas na fonte exibida e preserva integralmente texto, sinal e centavos.

## Verificação

Os 12 blocos analíticos originais foram preservados integralmente e reagrupados; as oito chamadas de indicadores e a construção do modelo/chart permaneceram iguais. A comparação executável do inventário e as regressões financeiras/browser são registradas em STATUS.md. Testes usam usuários temporários no Supabase local, nunca lançamentos reais.

## Refinamento com referência visual — 11/10/2026

Panorama em três cards: patrimônio roxo, resultado líquido e taxa de economia com anel proporcional ao índice real (apenas a extensão visual fica limitada a 0–100%; o número continua integral, inclusive negativo). Indicadores em grade mais compacta, títulos numerados, superfícies discretas e comparação financeira em largura completa para evitar espaço vazio e preservar a leitura de valores/comparativos. Todos os blocos, séries, métricas e filtros do inventário acima continuam presentes.

Selic e IPCA ganham uma faixa que permanece visível ao rolar o dashboard. Ela mostra valor, referência, indisponibilidade, atualização e acesso aos detalhes. Os cards completos com origem oficial permanecem na área de economia. A faixa é um portal de apresentação da mesma instância/consulta de EconomicIndicatorsCards: sem segunda consulta, cache ou integração independente. No celular respeita o cabeçalho/área segura; com teclado aberto volta ao fluxo normal. Não se estende às outras telas.

## Análises alinhadas à referência — 11/10/2026

A análise agora usa duas colunas: barras agrupadas e linha à esquerda, com os três indicadores complementares em cards individuais abaixo; rosca com total central e tabela de categorias à direita, seguida pelo comparativo compacto. O comparativo deixa a largura completa do refinamento anterior para acompanhar a composição da imagem. No celular e tablet os grupos são reorganizados verticalmente, sem ocultar informações.

As barras mantêm receitas, despesas e rendimentos reais. A linha acompanha a mesma série de receitas e está identificada, sem adicionar dados ilustrativos ou duplicar valores no tooltip. A opção de 12 meses reutiliza `periodMetrics`, o mesmo serviço existente para o histórico de seis meses; os filtros globais e o modo de período selecionado permanecem intactos.

A rosca conserva seleção por gráfico, detalhamento de categorias, lançamentos diretos, subcategorias, retorno, percentuais e despesas sem categoria. A tabela acrescenta variação percentual e monetária usando as despesas e parcelas reais do período anterior, por meio das funções existentes de agregação e comparação; sem base anterior não inventa percentual. O componente compartilhado de categorias usado nas demais telas não foi substituído.

Comparação de código: oito indicadores idênticos, 12 títulos/blocos presentes, nove blocos originais idênticos e três apresentações de análise adaptadas. Construção do modelo financeiro, serviços, regras, API, banco e migrations preservados. Regressão de navegador confere barras/linha, totais e detalhamento, comparação real, filtros 6/12/período, dados financeiros inalterados e ausência de overflow em 320/390/820/1280/1440px.

Tooltip da rosca usa uma área reservada abaixo do gráfico, mantendo o total central e a tabela livres. Desktop consulta por hover; dispositivos de toque consultam por clique/toque. A posição é aplicada sem animação para não atravessar o total. As regressões verificam nome/valor, ausência de interseção e contenção, incluindo consulta por toque. Outras roscas mantêm o comportamento anterior.

## Referência mobile e organização do desktop — 20/10/2026

Topo com carteira decorativa em CSS, atalhos e períodos com ícones, navegação mensal
preservada e faixa econômica em dois cards. Não há séries históricas fictícias
para Selic ou IPCA: a faixa mantém taxas oficiais, referências, fontes e atualização.
Panorama apresenta patrimônio, resultado, taxa de economia e comparação visual de
receitas/despesas/resultado. O novo gráfico resumido usa os mesmos seis meses já
calculados pelo dashboard; o gráfico analítico completo com rendimentos permanece.

A evolução patrimonial existente e o registro de posição foram movidos para o
Panorama, sem duplicar a ação ou o histórico. A composição foi agrupada com a
carteira na seção Patrimônio e investimentos. Os oito indicadores, doze seções,
filtros, gráficos analíticos, faturas, previsões, metas, orçamentos, rendimentos,
movimentações e confiabilidade seguem renderizados. Nenhum cálculo, API, schema ou
dado armazenado foi modificado. Valores grandes reorganizam a grade sem cortes;
regras de safe area e navegação mobile permanecem. Somente a ilustração decorativa
usa contenção de pintura, sem recortar conteúdo financeiro.

## Reagrupamento por decisão — 26/10/2026

Panorama aproxima três conceitos: patrimônio atual, resultado do período e
disponibilidade após compromissos. O bloco completo “Quanto fica livre?” sai da
seção de caixa e passa ao panorama, mantendo saldo, faturas, pendências e ressalvas.
Taxa de economia e composição do resultado continuam visíveis. A seção de caixa
mantém o fluxo operacional com todos os recebimentos/pagamentos efetivos.

Os oito indicadores são agrupados em disponibilidade/entradas (3), gastos/faturas
(3) e investimentos/caixinhas (2), com as mesmas expressões, valores, descrições e
comparativos. O histórico patrimonial e sua ação única voltam a ficar junto à
composição e carteira. Faturas atuais e próximas recebem títulos próprios e
colunas relacionadas; planejamento oferece acesso direto às contas recorrentes
e aos vencimentos. Nenhum resumo é escondido ou duplicado.

O topo compacto e a faixa única de Selic/IPCA/PTAX são preservados. O refinamento
em dashboard-organization.css usa o escopo do dashboard; telas menores crescem
verticalmente, sem comprimir os valores para caber em uma única tela. Análises
mantêm a composição da referência, com fluxo/resumos à esquerda e
categorias/comparativo à direita. Inventário comparado: 12 grupos, 13 blocos,
oito expressões Metric idênticas e todos os componentes de gráficos presentes.
