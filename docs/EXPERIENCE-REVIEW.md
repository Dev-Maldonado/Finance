# Organização visual e encaixe — 26/10/2026

## Inventário preservado

| Área | Conteúdo mantido | Adaptação |
|---|---|---|
| Dashboard | 12 áreas abertas, 8 indicadores, todos os gráficos, comparativos, planejamento, faturas, metas, carteira, caixinhas, índices oficiais e confiabilidade | Identificação explícita do contexto de cada grupo: posição atual, período selecionado ou compromissos futuros. Período e modo do gráfico lembrados. |
| Transações | Descrição, tipo, categoria/subcategoria, origem, vencimento, data efetiva, status, valor, parcelas e compra original, CSV, busca, filtros, edição/exclusão e baixa | Componente compartilhado com ordem visual consistente. Tabela em telas amplas; cards em celulares e notebooks estreitos. Valores completos ajustados ao espaço disponível. |
| Cartões | Cartões/cores/limites, todas as faturas, parcelas, pagamentos, próximos meses e compras registradas | Faturas e itens aparecem antes dos cartões. Atalhos por âncoras mantêm todas as áreas abertas. Mês, cartão e demais filtros são preservados; mês explícito na URL tem prioridade. |
| Contas Recorrentes | 4 totais por tipo, 2 indicadores de saldo, parcelas, gastos fixos/programados, navegação mensal, filtros, edição por escopo, exclusão e pagamento | Intervalo em evidência, atalhos por tipo e agrupamentos por urgência dentro de cada seção. Projeção rápida usa o horizonte indicado, esclarecendo pendências anteriores. |
| Categorias | Hierarquia, gráficos, filtros, gerenciamento e histórico | Filtro lembrado e caminho selecionado sempre legível, inclusive para categoria principal. |
| Caixinhas/investimentos | Cadastros, atualizações manuais, históricos, gráficos, aportes, retiradas e cálculos | Componentes existentes preservados; ajustes de encaixe, estados vazios e espaçamento compartilhados. |
| Relatórios, contas e configuração | Todos os indicadores, operações, filtros, importação/exportação e preferências | Período por tela e estilos compartilhados, sem mudanças nos serviços financeiros. |
| Formulários | Todos os campos, validações, métodos de parcelamento, prévias e operações | Renderização de campo reutilizada; dados e confirmação do lançamento separados em grupos. Atalhos têm títulos específicos. Modais crescem até o limite disponível e permitem rolagem interna. |

Não foram removidos menus, indicadores, séries, links ou ações. A organização não usa novos acordeões/abas para esconder blocos do dashboard. Detalhamentos que já existiam continuam com seus controles originais. Não há migrations, APIs novas nem alterações em registros financeiros nesta entrega.

## Memória de filtros

Preferências de visualização ficam em sessionStorage, separadas por usuário autenticado e área. A seleção permanece ao navegar/recarregar nesta aba e é descartada quando a sessão de armazenamento do navegador termina. Somente seleção de período, IDs dos filtros, busca e modos de visualização; nenhum snapshot financeiro, saldo ou token é armazenado.

Dados salvos são validados. Presets relativos (este mês, anterior, últimos dias, ano) são recalculados com a data atual; calendário e intervalo personalizado preservam limites explícitos. URL com mês de fatura prevalece sobre preferência anterior. Outro usuário começa com os padrões próprios, sem herdar seleções. Armazenamento bloqueado/corrompido não impede uso do sistema. Controles aguardam a restauração inicial para que uma escolha rápida não seja sobrescrita.

## Proteção contra cortes

- Filtros de período ocupam várias linhas no celular; nenhuma opção depende de rolagem escondida.
- Grade/flex com largura intrínseca mínima zero, quebra de nomes longos e valores monetários completos.
- Tabelas extensas mantêm rolagem interna; a página não ganha rolagem horizontal.
- Cards e estados vazios usam altura natural. Nenhuma área é cortada para forçar encaixe em uma tela.
- Modais respeitam viewport, teclado, safe areas e rolagem até os campos e botões finais.
- Navegação inferior e cabeçalhos preservam seus espaços reservados. Movimento reduzido continua suportado.

## Validação

Resultados finais, commit e publicação em STATUS.md. Testes usam apenas usuários descartáveis no Supabase local. A suíte de organização cobre memória por tela, recarga, prioridade da URL, remoção de filtros, contas vencidas/próximas, ordem de faturas, layouts 320–1920px e isolamento entre usuários. A varredura de todas as páginas verifica final da página, menus, modais, gráficos/toque e textos/valores/botões fora da área disponível, inclusive com nomes longos e valores grandes/negativos. Testes financeiros existentes verificam a preservação dos cálculos e registros.
