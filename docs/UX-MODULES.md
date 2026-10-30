# Reorganização funcional — 30/10/2026

Escopo: apresentação e navegação. Sem migrations, alterações de APIs, cálculos,
autenticação ou registros financeiros. Não criar nem remover recursos de IA.

## Inventário auditado e destinos

| Origem | Conteúdo preservado | Novo caminho |
|---|---|---|
| Dashboard / panorama | Patrimônio bruto/líquido, dívida, rendimento informado, resultado, taxa de economia, composição receita/despesa e disponibilidade após compromissos | Início → Resumo; visão integral em Dashboard completo |
| Oito indicadores | Saldo, receitas, gastos, faturas, faturas pendentes, rendimentos recebidos, investido, rendimento manual das caixinhas, todos os comparativos | Início → Resumo e Dashboard completo |
| Planejamento do dashboard | Disponibilidade diária, reserva, projeções 30/60/90, menor saldo, alertas e metas | Movimentações → Planejamento e metas; original em Dashboard completo |
| Compromissos gerais e caixa | Histórico, cartões totais/futuros, recebimentos, despesas pagas e pagamentos de fatura | Análises → Gráficos e comparativos; original em Dashboard completo |
| Gráficos e comparativos | Fluxo 6/12 meses/intervalo, categorias/subcategorias, média diária, parcelas e despesas de contas, variação anterior | Análises → Gráficos e comparativos; original em Dashboard completo |
| Faturas do dashboard | Total/pago/restante, cartão, vencimento, pagamento e próximos meses | Início → Resumo; Cartões → Faturas |
| Caixinhas e orçamentos resumidos | Todas as caixinhas, depósitos, metas, progresso, rendimento acumulado/mensal, data, orçamentos/limites/restante | Patrimônio → Visão geral; Dashboard completo |
| Histórico patrimonial/carteira | Evolução, registrar posição, variação, composição, posições/fontes/datas | Patrimônio → Visão geral; Dashboard completo |
| Movimentações recentes e atalhos | Descrição, origem, tipo, categoria, status, datas, valor, próximos passos | Início → Resumo |
| Índices oficiais | Selic, IPCA e dólar PTAX, referências, fontes, falhas e atualização | Faixa discreta no Início; Análises → Cenário econômico |
| Confiabilidade | Cobertura, fontes, pendências, datas e links | Análises → Confiabilidade; Configurações; Dashboard completo |
| Contas / extratos | Contas, saldos, editar/arquivar, transferência, extrato e filtros | Movimentações → Contas e saldos |
| Transações | Todos os tipos/status, contas e cartão, filtros combinados, CSV, busca, editar/excluir/pagar/receber, ocorrências e histórico | Movimentações → Todas |
| Cadastro de recorrências | Frequência, início/fim, pausar/retomar/encerrar, gerar, exclusão de cadastro/histórico | Movimentações → Recorrentes |
| Contas Recorrentes | Navegação mensal, atrasadas/próximas, parcelas/fixos/programados, totais, baixa e escopo atual/futuras | Movimentações → Contas a pagar; foco programado em Programadas |
| Cartões | Cadastro/cores/limites/fechamento/vencimento e edição | Cartões → Resumo |
| Faturas | Mês/cartão, itens, totais/pagamentos/pendências, registrar pagamento, editar parcela futura | Cartões → Faturas |
| Compras | Compra total ou valor individual, centavos e prévia, filtros/ordem/cartão, editar/excluir e histórico | Cartões → Compras |
| Parcelas | Compra original, número, total, valores/vencimentos e edição da compra; faturas permitem edição de parcela futura | Cartões → Parcelas e Faturas |
| Caixinhas manuais | Criar/editar, saldo inicial, depósitos/retiradas/IR/IOF, metas, informar/corrigir rendimento, históricos/gráficos e exclusões existentes | Patrimônio → Caixinhas |
| Investimentos manuais | Fundos/cripto, compras adicionais/correção/exclusão, quantidade/custo/preço médio, preço mensal e histórico | Patrimônio → Investimentos |
| Planejamento | Agenda/baixa/edição/remoção, dívidas, orçamentos, metas e simulador | Movimentações → Planejamento e metas |
| Relatórios | Categorias, patrimônio/registro, CDI/Dietz, totais, fluxo diário/mensal, rendimentos, CSV/XLSX/PDF | Análises → Relatórios e exportação |
| Categorias analíticas | Hierarquia, expansão, filtros e exportação de despesas | Análises → Por categoria |
| Categorias administrativas | CRUD/reorganização/transferência/arquivamento, hierarquia e preservação de histórico | Configurações → Categorias e subcategorias; link durante cadastros |
| Importação | Arquivo, prévia, mapeamento/conciliação/deduplicação e confirmação | Configurações → Importar e conciliar arquivos; atalho antigo preservado |
| Preferências/segurança | Conta/categorias padrão, meses da reserva, conciliação, confiabilidade, senha e sair | Configurações → Preferências e segurança |
| PWA | Instalação Android/iOS, atualização explícita, reconexão, safe areas/teclado | Menu secundário, inalterado |

## Compatibilidade e níveis

Todos os caminhos antigos permanecem operacionais, inclusive detalhes de caixinhas
por UUID e mês de fatura via URL. Âncoras antigas para grupos avançados na raiz
encaminham ao dashboard integral, mantendo o grupo de destino. Cinco módulos na navegação principal; preferências
e administração no menu secundário. Abas são links reais, com URL, voltar/avançar
e indicação ativa. O dashboard integral continua disponível por um caminho claro;
nenhum indicador do inventário é eliminado. Formulários e operações existentes são
reutilizados. Botão global Adicionar abre ações existentes e fecha antes de abrir
qualquer formulário. Preservar filtros entre abas do mesmo contexto.

Validação e publicação: consultar STATUS.md.

## Rascunhos e múltiplas abas

Reconfirmação da mesma sessão revalida os registros sem desmontar formulários.
Sair/trocar de usuário limpa cache e diálogos privados. Atualizações em outra aba
avisam somente que há dados novos, por canal do usuário; nenhum registro ou token
é transmitido. A aba receptora reconsulta a API autenticada. Isso permite criar uma
categoria durante um cadastro, manter descrição/valor digitados e usar a categoria
nova. Os serviços de autenticação e as permissões do banco permanecem iguais.
