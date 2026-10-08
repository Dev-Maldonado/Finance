# PROMPT MESTRE — FINORA 2.0
## Plataforma Completa de Gestão Financeira, Investimentos e Rendimentos Automáticos

### 1. MISSÃO

Você é um arquiteto de software sênior, desenvolvedor full-stack, especialista em sistemas financeiros, integração de APIs bancárias, investimentos e UX/UI para fintechs.

Sua missão é construir a **FINORA**, uma plataforma completa e funcional de gerenciamento financeiro pessoal.

Utilize a imagem do dashboard fornecida como referência obrigatória de design.

**O objetivo não é criar somente uma interface visual. É desenvolver um sistema real, com banco de dados, cálculos financeiros precisos, integrações externas, atualizações automáticas e ferramentas completas de controle financeiro.**

A aplicação deverá permitir ao usuário administrar:

- Contas bancárias e saldos.
- Entradas, saídas e transferências.
- Cartões de crédito e faturas.
- Compras parceladas.
- Categorias e subcategorias.
- Caixinhas com rendimentos vinculados ao CDI.
- Investimentos em ações, FIIs, ETFs e fundos.
- Renda fixa, CDBs e Tesouro Direto.
- Dividendos e proventos.
- Metas e orçamentos.
- Comparativos financeiros.
- Patrimônio total e evolução histórica.

**PRIORIDADE ESPECIAL DESTA VERSÃO:** criar uma camada de integrações com APIs financeiras para atualizar automaticamente taxas do CDI, cotações de ativos, valores de cotas de fundos e outros dados de mercado.

O sistema deve ser barato de manter, eficiente e independente de APIs pagas sempre que existirem fontes oficiais gratuitas adequadas.

---

# 2. STACK TECNOLÓGICA

Utilize preferencialmente:

### Frontend
- Next.js com App Router.
- React e TypeScript.
- Tailwind CSS.
- shadcn/ui.
- Lucide Icons.
- Recharts.
- TanStack Query.
- React Hook Form.
- Zod.
- Framer Motion para transições discretas.

### Backend
- Supabase.
- PostgreSQL.
- Supabase Auth.
- Row Level Security.
- Server Actions ou API Routes.
- Serviços backend independentes para cálculos financeiros.
- Jobs agendados para sincronização de dados externos.

### Biblioteca financeira
Utilize decimal.js, big.js ou solução equivalente para cálculos monetários precisos.

Nunca utilizar operações de ponto flutuante comuns para cálculos financeiros críticos.

### Arquitetura
- Código modular.
- Separação de responsabilidades.
- Componentes reutilizáveis.
- Camada exclusiva para integrações financeiras.
- Services para cálculos e regras de negócio.
- Banco de dados normalizado.
- Migrations versionadas.
- Testes automatizados.
- Segurança por usuário.

Se já existir um projeto FINORA, evolua a estrutura atual sem recriar ou apagar funcionalidades existentes.

---

# 3. DESIGN E IDENTIDADE VISUAL

Reproduza a identidade da imagem de referência.

### Direção visual

Criar uma experiência fintech premium, moderna, limpa, com navegação intuitiva.

Utilizar:

- Roxo principal: #5B35D5.
- Lilás: #F0EBFF.
- Branco: #FFFFFF.
- Fundo: #F7F8FC.
- Verde para resultados favoráveis.
- Vermelho para alertas e valores negativos.
- Cinza para informações secundárias.

Utilizar cards com cantos arredondados, sombras discretas e espaçamento confortável.

Não exagerar nas animações.

### Navegação lateral

Criar menu com:

1. Dashboard.
2. Contas e Saldos.
3. Cartões.
4. Transações.
5. Categorias.
6. Caixinhas.
7. Investimentos.
8. Planejamento.
9. Relatórios.
10. Configurações.

O menu deverá ser recolhível, mostrando apenas os ícones quando minimizado.

### Responsividade

Garantir layouts adequados a:

- Monitores grandes.
- Notebooks.
- Tablets.
- Celulares.

As tabelas e gráficos deverão adaptar-se ao espaço disponível.

Não permitir componentes cortados ou rolagem horizontal desnecessária.

---

# 4. DASHBOARD FINANCEIRO PRINCIPAL

O dashboard precisa responder imediatamente às perguntas:

**Quanto dinheiro eu tenho? Quanto entrou? Quanto saiu? Quanto gastei no cartão? Quanto tenho investido? Quanto meus investimentos estão rendendo?**

## 4.1 Cards superiores

Criar os seguintes indicadores:

**Saldo disponível**
- Soma das contas financeiras.
- Excluir limites de cartões.
- Excluir valores bloqueados ou reservados, conforme a classificação.

**Entradas**
- Salário.
- Recebimentos.
- Renda extra.
- Outras receitas efetivas.

**Saídas**
- Despesas confirmadas.
- Gastos fixos.
- Gastos variáveis.

**Gastos nos cartões**
- Total de compras do período.
- Faturas abertas.
- Faturas a vencer.
- Faturas atrasadas.

**Rendimentos**
- Juros efetivamente recebidos.
- Rendimentos de renda fixa.
- Dividendos recebidos.
- Rendimentos de FIIs.
- Outros ganhos realizados.

**Patrimônio total**
- Contas bancárias.
- Caixinhas.
- Investimentos.
- Outros ativos cadastrados.

Adicionar indicador separado de patrimônio líquido, descontando dívidas e obrigações financeiras.

**Importante:** não misturar valorização não realizada de ações com rendimentos efetivamente recebidos.

## 4.2 Gráfico comparativo

Criar gráfico de entradas, saídas e rendimentos.

Permitir alternar entre visualização mensal e anual.

Adicionar filtros:

- 7 dias.
- 30 dias.
- Este mês.
- Mês anterior.
- Este ano.
- Período personalizado.

Mostrar comparações percentuais e monetárias entre períodos.

## 4.3 Seções inferiores

Organizar o dashboard em blocos:

**Meus Cartões**
- Cartão principal.
- Limite.
- Fatura atual.
- Valor utilizado.
- Próximas faturas.

**Gastos por Categorias**
- Gráfico de rosca.
- Categorias.
- Subcategorias.
- Percentuais.
- Valores totais.

**Minhas Caixinhas**
- Valor guardado.
- Progresso das metas.
- Rendimentos do CDI.
- Evolução mensal.

**Meus Investimentos**
- Patrimônio investido.
- Ações.
- FIIs.
- Fundos de investimento.
- Renda fixa.
- Rentabilidade.
- Dividendos.

**Resumo Mensal**
- Economia do mês.
- Crescimento patrimonial.
- Evolução dos gastos.
- Comparativos.

**Transações Recentes**
- Descrição.
- Categoria.
- Data.
- Conta/cartão.
- Valor.
- Status.

O dashboard deve utilizar exclusivamente dados cadastrados ou obtidos de integrações autorizadas.

---

# 5. CONTAS BANCÁRIAS E SALDOS

Permitir cadastrar múltiplas contas financeiras.

Exemplos:
- Nubank.
- Itaú.
- Inter.
- Mercado Pago.
- Caixa.
- Conta personalizada.
- Carteira em dinheiro.

Cada conta possui:

- Instituição.
- Nome.
- Tipo.
- Saldo inicial.
- Saldo atual calculado.
- Cor e ícone.
- Histórico de transações.

Operações:

- Criar conta.
- Editar conta.
- Arquivar conta.
- Transferir valores.
- Registrar ajuste de saldo.
- Consultar extrato.

As transferências entre contas próprias não devem ser contabilizadas como receitas ou despesas.

---

# 6. CARTÕES DE CRÉDITO

Criar uma seção completa para cartões.

## Cadastro

Campos:

- Instituição.
- Nome.
- Bandeira.
- Quatro últimos dígitos.
- Limite total.
- Fechamento.
- Vencimento.
- Conta usada para pagamento.

Não armazenar o número completo nem CVV.

## Visualização

Cada cartão deve mostrar:

- Limite total.
- Limite disponível.
- Limite comprometido.
- Fatura atual.
- Próximas faturas.
- Percentual utilizado.
- Compras recentes.

Criar cartão visual estilizado semelhante à referência.

## Compras parceladas

Permitir compras à vista ou parceladas.

Exemplo:

R$ 2.400,00 em 12 parcelas.

Gerar automaticamente doze parcelas de R$ 200,00, respeitando o fechamento do cartão.

Cada parcela deverá aparecer em sua fatura.

Permitir visualizar todo o compromisso financeiro futuro.

## Faturas

Criar status:

- Aberta.
- Fechada.
- Pendente.
- Parcialmente paga.
- Paga.
- Atrasada.

Permitir pagar com uma conta bancária cadastrada.

Evitar contabilização duplicada de despesas quando uma fatura for paga.

Diferenciar despesas por competência e movimentações de caixa.

---

# 7. TRANSAÇÕES, CATEGORIAS E SUBCATEGORIAS

Criar CRUD completo de transações financeiras.

Campos:

- Descrição.
- Tipo.
- Valor.
- Data.
- Conta.
- Cartão.
- Categoria.
- Subcategoria.
- Recorrência.
- Status.
- Observações.

Tipos:

- Receita.
- Despesa.
- Transferência.
- Pagamento.
- Aporte.
- Resgate.
- Operação de investimento.
- Rendimento.

### Categorias

Permitir categorias editáveis e subcategorias ilimitadas.

Exemplos:

**Alimentação**
- Mercado.
- Restaurante.
- Delivery.

**Moradia**
- Aluguel.
- Energia.
- Internet.

**Transporte**
- Combustível.
- Uber.
- Manutenção.

**Lazer**
- Viagens.
- Cinema.
- Streaming.

**Saúde**
- Farmácia.
- Consultas.

Criar gráficos de gastos por categoria e subcategoria.

Ao selecionar uma categoria no gráfico, apresentar detalhamento das despesas vinculadas.

Permitir definir limites mensais e comparar gastos atuais com períodos anteriores.

### Importação

Adicionar suporte a CSV e OFX.

Implementar pré-visualização, identificação de duplicidades, classificação e confirmação antes da importação.

---

# 8. CAIXINHAS COM RENDIMENTO AUTOMÁTICO VINCULADO AO CDI

**ESTE MÓDULO É UMA PRIORIDADE FUNDAMENTAL.**

Criar um sistema de caixinhas inspirado na experiência de reservas financeiras de bancos digitais.

O usuário poderá guardar dinheiro, acompanhar objetivos e calcular rendimentos automaticamente conforme o indexador associado.

## 8.1 Cadastro de caixinhas

Permitir criar caixinhas com:

- Nome.
- Descrição.
- Ícone.
- Cor.
- Meta financeira.
- Data desejada.
- Saldo inicial.
- Instituição financeira.
- Conta associada.
- Data de início da aplicação.
- Modelo de remuneração.

Exemplos:

- Reserva de emergência.
- Viagem.
- Carro.
- Casa.
- Notebook.
- Objetivo personalizado.

## 8.2 Configuração de rendimento

Adicionar campo:

**Como esta caixinha rende?**

Opções:

1. Sem rendimento.
2. 100% do CDI.
3. 110% do CDI.
4. 120% do CDI.
5. Percentual personalizado do CDI.
6. Taxa prefixada anual.
7. Selic, quando aplicável ao produto.
8. Rendimento informado manualmente.
9. Saldo sincronizado por integração financeira autorizada, quando disponível.

O sistema deve permitir trocar o indexador, preservando as condições históricas de remuneração das aplicações existentes.

**Exemplo:**

Caixinha: Reserva de emergência.

Valor aplicado: R$ 5.000,00.

Remuneração contratual: 100% do CDI.

Data do aporte: 01/10/2026.

O sistema consulta a série histórica do CDI e calcula o rendimento acumulado a partir dos dias elegíveis.

Não utilizar uma taxa mensal fixa inventada.

## 8.3 Integração oficial com CDI

Implementar integração com a API pública do Banco Central.

**Fonte principal:**
Banco Central — SGS, série 12, taxa de juros CDI diária.

Endpoint de referência:

`https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=01/10/2026&dataFinal=07/10/2026`

As datas são apenas um exemplo de consulta.

Os parâmetros devem ser gerados dinamicamente pelo backend.

**Obrigatório:**

- Consultar dados reais.
- Identificar o formato da taxa diária.
- Armazenar histórico por data.
- Registrar fonte.
- Registrar horário da sincronização.
- Evitar consultas duplicadas.
- Atualizar diariamente quando existirem novos dados.
- Respeitar limites da API.
- Nunca substituir taxas ausentes por valores inventados.

Implementar cache persistente no banco de dados.

Criar um serviço específico:

`CDIRateProvider`

Responsabilidades:

- Obter última taxa disponível.
- Buscar série histórica.
- Validar valores.
- Sincronizar taxas.
- Informar indisponibilidade.
- Fornecer histórico ao mecanismo de rendimento.

A API deve ser acessada pelo backend.

Se a API estiver temporariamente indisponível, utilizar apenas o último histórico válido já armazenado, identificando a data até a qual o cálculo foi realizado.

Não extrapolar automaticamente taxas passadas como se fossem taxas oficialmente publicadas.

## 8.4 Motor de cálculo do CDI

Criar um mecanismo financeiro separado da interface.

O cálculo deve considerar:

- Data de cada aporte.
- Valor aplicado.
- Dias elegíveis para remuneração.
- Taxas CDI efetivamente publicadas.
- Percentual contratado.
- Capitalização composta.
- Resgates.
- Mudanças contratuais.
- Regras de tributação aplicáveis.
- Eventuais carências e condições do produto.

Utilizar a taxa diária da série SGS 12 na unidade divulgada pela fonte.

Para uma aplicação simples remunerada em percentual do CDI, a metodologia diária poderá seguir:

`taxa_diaria = (CDI_diario_percentual / 100) * (percentual_CDI / 100)`

`saldo_final = saldo_inicial * produto(1 + taxa_diaria)`

Aplicar os fatores apenas nas datas elegíveis.

Não confundir uma taxa CDI anualizada com a série já expressa ao dia.

Para produtos com metodologias contratuais diferentes, criar estratégias de cálculo específicas em vez de aplicar indiscriminadamente a fórmula acima.

### Exigências

- Calcular cada aporte separadamente.
- Registrar lotes de aplicação.
- Aplicar rendimentos somente nos períodos elegíveis.
- Considerar resgates parciais.
- Manter histórico reproduzível.
- Arredondar corretamente.
- Não modificar lançamentos históricos em silêncio.
- Permitir conciliação com valores oficiais do banco.

## 8.5 Tributos

Criar motor tributário configurável.

Considerar, quando aplicável:

- IR regressivo.
- IOF em resgates sujeitos à cobrança.
- Produtos isentos.
- Regras específicas de cada investimento.
- Alterações legislativas por vigência.

Não assumir que toda caixinha é um CDB.

A tributação deverá depender do produto efetivamente vinculado à caixinha.

A interface precisa distinguir:

**Rendimento bruto:** remuneração calculada antes de tributos.

**Impostos estimados:** valor estimado conforme regras aplicáveis.

**Rendimento líquido estimado:** resultado após tributos estimados.

**Rendimento confirmado:** valor efetivamente conciliado ou registrado com a instituição.

Não mostrar rendimento líquido estimado como saldo disponível confirmado.

## 8.6 Dashboard das caixinhas

Criar cards com:

- Nome.
- Saldo aplicado.
- Saldo atualizado estimado.
- Meta.
- Progresso.
- Percentual do CDI.
- Rendimento bruto.
- Rendimento líquido estimado.
- Ganhos confirmados.
- Data da última atualização.

Exemplo visual:

**Reserva de emergência**

R$ 12.500,00 de R$ 20.000,00

62,5% da meta.

Indexador: 100% do CDI.

Rendimento acumulado: calculado automaticamente.

Data-base: última taxa disponível.

## 8.7 Página individual

Ao abrir uma caixinha, mostrar:

- Gráfico de evolução patrimonial.
- Aportes.
- Resgates.
- Rendimento diário.
- Rendimento mensal.
- Rendimento acumulado.
- Comparação com CDI.
- Saldo estimado.
- Meta financeira.
- Projeções futuras.

Adicionar gráfico que separe:

**Dinheiro depositado vs. rendimentos acumulados.**

O usuário precisa compreender quanto guardou e quanto foi resultado da remuneração.

## 8.8 Simulador de crescimento

Criar simulador permitindo informar:

- Valor inicial.
- Aporte mensal.
- Percentual do CDI.
- Prazo.
- Meta financeira.

Mostrar:

- Capital aportado.
- Rendimentos projetados.
- Saldo projetado.
- Tempo até alcançar a meta.

Para o futuro, utilizar cenários hipotéticos devidamente identificados.

Permitir comparação:

- CDI constante no nível de referência.
- Cenário de CDI menor.
- Cenário de CDI maior.

Deixar claro que as projeções não representam rentabilidade garantida.

## 8.9 Vinculação com instituição financeira

Preparar integração futura com Open Finance ou APIs de instituições, mediante autorização do usuário e disponibilidade técnica.

Quando houver conexão autorizada:

- Obter informações permitidas sobre produtos financeiros.
- Sincronizar posições e saldos quando a API fornecer esses dados.
- Conciliar rendimentos.
- Atualizar lançamentos sem duplicar movimentações.
- Mostrar a instituição vinculada.
- Permitir desconectar a integração.

**IMPORTANTE:** integrar a taxa CDI não significa ter acesso automático ao saldo real da caixinha mantida no banco.

Se não houver uma integração bancária válida, o sistema deverá apresentar o rendimento como cálculo estimado, baseado nas informações cadastradas.

Não afirmar que uma caixinha está sincronizada com o Nubank ou outro banco apenas porque utiliza uma taxa de mercado.

---

# 9. MÓDULO DE INVESTIMENTOS COM APIS DE MERCADO

Criar uma área completa para gerenciar investimentos.

O usuário deverá cadastrar operações e acompanhar a valorização de sua carteira com dados atualizados de fontes confiáveis.

Classes:

- Ações.
- FIIs.
- ETFs.
- BDRs.
- Fundos de investimento tradicionais.
- FIAGROs.
- Renda fixa.
- CDB.
- LCI/LCA.
- Tesouro Direto.
- Ativos internacionais.
- Investimentos personalizados.

## 9.1 Integração com brapi.dev

Utilizar a API brapi.dev como um dos provedores para dados de mercado brasileiro.

Documentação:

`https://brapi.dev/docs`

Base da API:

`https://brapi.dev/api`

Endpoints documentados de referência:

**Ações**
- `/api/v2/stocks/quote`
- `/api/v2/stocks/historical`
- `/api/v2/stocks/dividends`

**Fundos imobiliários**
- `/api/v2/fii/indicators`
- `/api/v2/fii/historical`
- `/api/v2/fii/dividends`

**Outros fundos listados**
- `/api/v2/funds/list`
- `/api/v2/funds/indicators`
- `/api/v2/funds/nav/history`

**Indicadores macroeconômicos**
- `/api/v2/macro`
- `/api/v2/macro/latest`

Antes de implementar, verificar a documentação vigente, permissões, disponibilidade por ativo, plano necessário e condições de uso.

Não presumir que todos os endpoints ou tickers estejam disponíveis gratuitamente.

Priorizar fontes oficiais gratuitas quando possível.

## 9.2 Arquitetura de provedores

Criar interface comum:

`MarketDataProvider`

Métodos esperados:

- searchAssets()
- getQuote()
- getHistoricalPrices()
- getDividends()
- getFundNAV()
- getAssetDetails()
- getLastUpdate()

Implementar adaptadores independentes.

Exemplos:

- BrapiProvider.
- CVMProvider.
- BCBProvider.
- ManualPriceProvider.

Utilizar fallback controlado quando a integração principal não estiver disponível.

Não misturar dados de fontes diferentes sem identificar a origem.

---

# 10. AÇÕES — ACOMPANHAMENTO AUTOMÁTICO

Permitir cadastrar operações de ações.

Campos:

- Ticker.
- Empresa.
- Corretora.
- Data.
- Quantidade.
- Preço.
- Taxas.
- Tipo de operação.

Exemplos de tickers:

- PETR4.
- VALE3.
- ITUB4.
- WEGE3.

Ao pesquisar um ticker, consultar o provedor disponível para obter informações do ativo.

Quando permitido pela API, preencher:

- Nome.
- Ticker.
- Cotação.
- Moeda.
- Variação.
- Data do preço.
- Dados complementares.

## Cálculos automáticos

Após registrar compras e vendas:

- Quantidade atual.
- Preço médio.
- Custo de aquisição.
- Valor de mercado.
- Lucro ou prejuízo realizado.
- Valorização ou desvalorização não realizada.
- Rentabilidade percentual.

Exemplo:

O usuário comprou 10 ações.

Preço médio: R$ 30,00.

Cotação consultada: R$ 35,00.

O sistema calcula automaticamente o valor atualizado da posição e a valorização não realizada.

O exemplo deve ser apenas uma referência de lógica, não uma cotação real.

## Gráficos

Criar:

- Histórico de preços.
- Evolução da posição.
- Histórico de aportes.
- Rentabilidade.
- Comparação com benchmark.

Não calcular rentabilidade de uma carteira apenas comparando saldo atual com saldo anterior, ignorando aportes e retiradas.

## Dividendos e JCP

Consultar eventos disponíveis na API.

Mostrar:

- Dividendos declarados.
- Dividendos previstos.
- Dividendos recebidos.
- Data-com.
- Data de pagamento.
- Valor por ação.
- Total correspondente à posição elegível.

Os eventos declarados não devem virar receitas recebidas automaticamente.

Permitir confirmar recebimento e conciliar com conta bancária.

Evitar lançamentos duplicados.

Considerar desdobramentos, grupamentos, bonificações e mudanças de ticker.

---

# 11. FIIs — FUNDOS IMOBILIÁRIOS

Criar uma área especializada em FIIs.

Permitir cadastrar:

- Ticker.
- Quantidade.
- Preço médio.
- Data de compra.
- Corretora.
- Taxas.

Consultar APIs para obter, quando disponíveis:

- Cotação.
- Histórico de preços.
- Valor patrimonial por cota.
- P/VP.
- Dividend Yield.
- Rendimentos históricos.
- Indicadores do fundo.

## Dashboard dos FIIs

Mostrar:

- Total investido.
- Valor de mercado.
- Quantidade de cotas.
- Preço médio.
- Rendimentos recebidos.
- Rendimento mensal.
- Evolução dos proventos.

Adicionar gráfico com os dividendos recebidos nos últimos doze meses.

Separar rendimentos de amortizações de capital.

Permitir registrar manualmente proventos quando não estiverem disponíveis na API.

**Não tratar um dividendo divulgado como recebido sem confirmação ou conciliação.**

---

# 12. FUNDOS DE INVESTIMENTO TRADICIONAIS — INTEGRAÇÃO COM CVM

Criar suporte a fundos de investimento não necessariamente negociados em bolsa.

Exemplos de classes:

- Fundos de renda fixa.
- Fundos DI.
- Fundos multimercado.
- Fundos de ações.
- Fundos cambiais.
- Outros fundos regulamentados.

## 12.1 Fonte oficial

Utilizar os Dados Abertos da CVM.

Cadastro:

`https://dados.cvm.gov.br/dataset/fi-cad`

Informes diários:

`https://dados.cvm.gov.br/dataset/fi-doc-inf_diario`

Implementar processo de importação e atualização dos arquivos publicados pela CVM.

Considerar arquivos CSV compactados e layouts definidos pelos respectivos dicionários de dados.

Identificar corretamente fundo, classe e subclasse conforme a estrutura de dados vigente.

## 12.2 Busca de fundos

Permitir pesquisar por:

- Nome.
- CNPJ.
- Administrador, quando disponível.
- Classe.
- Subclasse.

Após selecionar um fundo, permitir registrar investimento.

Campos:

- Fundo.
- Classe/subclasse.
- Data da aplicação.
- Valor aplicado.
- Valor da cota de conversão.
- Quantidade de cotas.
- Corretora ou distribuidora.

## 12.3 Atualização do valor das cotas

Utilizar os informes oficiais disponíveis.

Obter:

- Data de competência.
- Valor da cota.
- Patrimônio líquido, quando relevante.
- Outros dados publicados.

Calcular a posição:

`valor_atual = quantidade_de_cotas * valor_da_cota_disponivel`

Os aportes, resgates e eventos que alterem a quantidade de cotas devem ser registrados corretamente.

Não calcular fundos tradicionais apenas multiplicando o capital por uma taxa CDI.

A valorização deve ser baseada na quantidade efetiva de cotas e no respectivo valor de referência, quando disponível.

## 12.4 Exibição

Mostrar:

- Nome do fundo.
- CNPJ/classe/subclasse.
- Valor investido.
- Quantidade de cotas.
- Valor atualizado.
- Variação.
- Rentabilidade.
- Data da última cota.
- Fonte da informação.

Os dados dos informes podem apresentar defasagem.

A interface deverá mostrar essa defasagem claramente.

## 12.5 Comparação com CDI

Permitir comparar fundos com o CDI.

Exibir:

- Rentabilidade do fundo no período.
- CDI acumulado no mesmo período.
- Diferença percentual.
- Percentual de desempenho em relação ao CDI.

Aplicar o mesmo intervalo e convenção temporal para ambos.

Para rentabilidade pessoal, considerar movimentações e fluxos de caixa do usuário.

Distinguir rentabilidade da cota do fundo de rentabilidade efetiva da posição do investidor.

## 12.6 Tributos e taxas

Preparar suporte a:

- Taxa de administração.
- Taxa de performance.
- Regras de cotização.
- Prazos de resgate.
- IR aplicável.
- Come-cotas, quando aplicável.
- IOF, quando aplicável.

Evitar deduzir novamente taxas já refletidas no valor da cota.

Não pressupor que todos os fundos têm a mesma tributação.

---

# 13. RENDA FIXA E TESOURO DIRETO

Criar suporte a:

- CDB.
- RDB.
- LCI.
- LCA.
- Tesouro Selic.
- Tesouro Prefixado.
- Tesouro IPCA+.
- Produtos personalizados.

## Cadastro

Campos:

- Instituição.
- Nome do produto.
- Tipo.
- Indexador.
- Percentual do CDI.
- Taxa prefixada.
- Spread.
- Data de aplicação.
- Vencimento.
- Liquidez.
- Tributação aplicável.

## Integrações

Reutilizar os provedores BCB e B3 ou outros serviços documentados para indicadores oficiais e preços, quando disponíveis.

Para títulos do Tesouro, não confundir remuneração contratada com o valor de mercado antes do vencimento.

Implementar separadamente os cálculos de acumulação e marcação a mercado.

## Visualização

- Capital investido.
- Rentabilidade contratual.
- Valor atualizado calculado.
- Valor confirmado.
- Rendimento bruto.
- Impostos estimados.
- Saldo líquido estimado.
- Vencimento.

Permitir comparar diferentes produtos de renda fixa.

---

# 14. CENTRAL DE RENDIMENTOS

Criar uma página dedicada exclusivamente aos ganhos provenientes do patrimônio financeiro.

## Indicadores

**Rendimentos recebidos**
- Dividendos.
- Juros.
- Proventos.
- Outros ganhos distribuídos.

**Rendimentos acumulados estimados**
- Caixinhas.
- CDBs.
- Outros produtos remunerados.

**Valorização não realizada**
- Ações.
- FIIs.
- ETFs.
- Fundos.

**Lucros realizados**
- Vendas de ativos.
- Resgates com ganho efetivo.
- Outras operações concluídas.

## Gráficos

Criar:

- Rendimento mês a mês.
- Evolução anual.
- Ganhos por classe de ativo.
- Proventos por ativo.
- Comparação com CDI.
- Crescimento dos rendimentos passivos.

Adicionar filtro:

- Últimos 30 dias.
- Últimos 12 meses.
- Ano atual.
- Todo o histórico.
- Período personalizado.

Exemplo de comparação:

Janeiro — R$ 120,00.

Fevereiro — R$ 145,00.

Março — R$ 180,00.

Os valores do exemplo são ilustrativos. Em produção, utilizar apenas dados reais ou registros do usuário.

---

# 15. COMPARATIVOS FINANCEIROS AVANÇADOS

Criar relatórios para avaliar:

- Entradas vs. saídas.
- Gastos por cartão.
- Gastos por categoria.
- Gastos por subcategoria.
- Evolução de saldo.
- Evolução patrimonial.
- Caixinhas vs. metas.
- Investimentos vs. CDI.
- Crescimento de dividendos.
- Patrimônio investido por classe.
- Resultado financeiro por mês.

Adicionar indicadores automáticos.

Exemplos:

"Seus gastos com transporte aumentaram 12%."

"Você economizou R$ 350 a mais que no mês anterior."

"Seus rendimentos aumentaram 8,5%."

"Seu patrimônio líquido cresceu 3,2%."

Essas mensagens deverão ser calculadas a partir de dados válidos.

Não depender de IA para realizar cálculos financeiros.

Diferenciar crescimento por aportes de crescimento por rentabilidade.

---

# 16. PLANEJAMENTO E METAS

Criar recursos de orçamento financeiro.

Permitir definir:

- Orçamento mensal.
- Orçamento por categoria.
- Limite por subcategoria.
- Meta de economia.
- Meta de investimentos.
- Meta patrimonial.

Exibir progresso e alertas visuais.

Criar simulações para:

- Quanto guardar por mês.
- Quanto investir para uma meta.
- Crescimento futuro estimado.
- Evolução do patrimônio.

Sempre identificar projeções e hipóteses adotadas.

---

# 17. SISTEMA CENTRAL DE INTEGRAÇÕES FINANCEIRAS

Criar módulo backend exclusivo para comunicação com APIs externas.

Estrutura sugerida:

```text
src/
  integrations/
    bcb/
      bcb-client.ts
      cdi-provider.ts
      selic-provider.ts
    brapi/
      brapi-client.ts
      stocks-provider.ts
      fii-provider.ts
      funds-provider.ts
    cvm/
      cvm-client.ts
      fund-registry.ts
      daily-nav-importer.ts
    shared/
      provider-types.ts
      provider-errors.ts
      cache.ts

  financial/
    calculations/
      cdi-engine.ts
      savings-engine.ts
      tax-engine.ts
      portfolio-engine.ts
      performance-engine.ts
      net-worth-engine.ts
```

Adaptar os diretórios à arquitetura existente.

## 17.1 Atualização automática

Criar jobs para:

**CDI**
- Consultar diariamente os novos registros disponíveis.

**Ações e ETFs**
- Atualizar preços conforme disponibilidade da fonte, licença e limites do plano.

**FIIs**
- Atualizar preços e eventos quando publicados.

**Fundos**
- Processar novas cotas após publicação dos informes.

**Carteira**
- Recalcular posições impactadas pelas atualizações.

Usar agendador compatível com a infraestrutura disponível.

Não depender de uma aba de navegador aberta para manter as atualizações.

## 17.2 Cache

Implementar:

- Cache de taxas.
- Cache de cotações.
- Histórico de preços.
- Histórico de cotas.
- Datas de atualização.
- Controle de versões e correções.

Evitar solicitar os mesmos dados repetidamente.

## 17.3 Tratamento de falhas

Suportar:

- Timeout.
- API indisponível.
- Erro 429.
- Credencial inválida.
- Limites gratuitos.
- Respostas incompletas.
- Cotação não encontrada.
- Dados desatualizados.

Utilizar retry com backoff e limites.

Nunca substituir falhas de integração por valores fictícios apresentados como reais.

## 17.4 Configuração das APIs

Criar uma área administrativa de integrações.

Exibir:

- Provedor.
- Status.
- Última sincronização.
- Último sucesso.
- Erros recentes.
- Cobertura.
- Modo automático/manual.

Guardar tokens exclusivamente no servidor.

Utilizar variáveis de ambiente:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
BRAPI_API_TOKEN=
CRON_SECRET=
```

Não expor segredos ao navegador.

## 17.5 Estratégia de custos

Priorizar:

1. Banco Central para CDI e índices compatíveis.
2. CVM para dados públicos de fundos.
3. Provedores de mercado para cotações e proventos.
4. Entrada manual como alternativa.
5. Serviços pagos apenas se realmente necessários e mediante configuração explícita.

Verificar termos de uso e licenças, especialmente redistribuição e armazenamento de dados de mercado.

Não utilizar scraping frágil como dependência principal.

---

# 18. MODELAGEM DO BANCO DE DADOS

Criar as entidades necessárias com chaves, índices e relacionamentos adequados.

### Usuários e contas

- profiles
- financial_accounts
- transactions
- transfers
- categories
- subcategories
- recurring_transactions

### Cartões

- credit_cards
- credit_card_purchases
- credit_card_installments
- credit_card_invoices
- credit_card_payments

### Caixinhas

- savings_goals
- savings_products
- savings_lots
- savings_movements
- savings_yield_calculations
- savings_reconciliations

### Investimentos

- investment_accounts
- investment_assets
- investment_operations
- investment_positions
- investment_income
- investment_corporate_actions
- fund_registry
- fund_share_classes
- fund_nav_history

### APIs e taxas

- financial_data_providers
- benchmark_rates
- asset_price_history
- provider_sync_logs
- provider_sync_states

### Planejamento

- budgets
- financial_goals
- net_worth_snapshots
- user_settings

Armazenar nas séries financeiras:

- Valor.
- Data de referência.
- Fonte.
- Data de coleta.
- Status de validação.
- Metadados relevantes.

Criar mecanismos de idempotência para importações e operações financeiras.

Evitar atualizações que provoquem duplicação de patrimônio.

Aplicar RLS para garantir isolamento entre usuários.

---

# 19. REGRAS CONTÁBEIS OBRIGATÓRIAS

**Regra 1 — Patrimônio**

Uma transferência entre contas próprias não modifica o patrimônio total.

**Regra 2 — Caixinhas**

Mover dinheiro de uma conta para uma caixinha não representa despesa.

**Regra 3 — Investimentos**

Comprar ações, FIIs ou fundos não representa perda automática de patrimônio pelo valor aplicado.

**Regra 4 — Cartões**

Pagar uma fatura não pode duplicar a despesa já registrada.

**Regra 5 — Rendimento estimado**

Rendimento calculado não é necessariamente rendimento confirmado pela instituição.

**Regra 6 — Valorização**

Valorização de ações e fundos não equivale a recebimento de dinheiro.

**Regra 7 — CDI**

Calcular com as taxas históricas corretas, respeitando datas, percentuais e condições de cada produto.

**Regra 8 — Fundos**

Utilizar valor da cota e quantidade efetiva de cotas para calcular a posição.

**Regra 9 — Dividendos**

Não transformar proventos anunciados em recebimentos confirmados sem conciliação.

**Regra 10 — Atualizações**

Se não existir preço ou taxa nova, manter o último valor válido com indicação clara de sua data.

**Regra 11 — Projeções**

Jamais misturar valores futuros simulados com patrimônio confirmado.

**Regra 12 — Rentabilidade**

Calcular a performance respeitando aportes, retiradas, taxas e eventos de cada ativo.

---

# 20. AUTENTICAÇÃO, PRIVACIDADE E SEGURANÇA

Implementar:

- Cadastro.
- Login.
- Logout.
- Recuperação de senha.
- Rotas privadas.
- Segurança de sessão.
- RLS.
- Validação no backend.
- Proteção contra acessos não autorizados.

Não permitir que um usuário acesse dados financeiros de outro.

Não armazenar credenciais bancárias fornecidas informalmente pelo usuário.

Integrações Open Finance futuras devem respeitar autorização, escopos e revogação de consentimento.

Proteger chaves de API.

---

# 21. IMPORTAÇÃO E EXPORTAÇÃO

Permitir importar:

- CSV de transações.
- OFX.
- Planilhas de operações.
- Histórico de proventos.
- Posições de investimentos.

Criar conciliação prévia.

Evitar duplicidades por identificadores de origem e regras de correspondência.

Permitir exportar relatórios em:

- CSV.
- Excel.
- PDF.

---

# 22. TESTES OBRIGATÓRIOS

Criar testes automatizados para:

### Operações financeiras
- Receita.
- Despesa.
- Transferência.
- Pagamento de fatura.
- Compra parcelada.
- Depósito em caixinha.
- Resgate.
- Compra de ação.
- Venda de ação.
- Provento.

### CDI
- Cálculo de 100% CDI.
- Cálculo de 110% CDI.
- Cálculo de 120% CDI.
- Aportes em datas diferentes.
- Resgates parciais.
- Finais de semana.
- Feriados relevantes.
- Dias sem taxa publicada.
- Alteração de percentual contratado.
- Reprocessamento sem duplicação de rendimento.
- Comparação com casos de referência calculados independentemente.

### Investimentos
- Preço médio.
- Alteração de cotação.
- Valor atualizado da posição.
- Dividendos.
- Eventos corporativos.
- Valor de cota de fundo.
- Aportes e resgates de fundos.
- Comparativo com CDI.

### Integrações
- Falha de API.
- Timeout.
- Rate limit.
- Cache.
- Dados ausentes.
- Atualização tardia.
- Reimportação de dados.
- Correções de séries históricas.

### Segurança
- Isolamento entre usuários.
- Proteção de chaves.
- Permissões RLS.
- Rotas protegidas.

---

# 23. PLANO DE EXECUÇÃO

Implemente o projeto em etapas, sem abandonar funcionalidades anteriores.

**Etapa 1 — Fundação**
- Configuração do projeto.
- Banco de dados.
- Autenticação.
- Layout.
- Navegação.

**Etapa 2 — Finanças pessoais**
- Contas.
- Saldos.
- Transações.
- Categorias.
- Subcategorias.

**Etapa 3 — Cartões**
- Cadastro.
- Parcelamentos.
- Faturas.
- Pagamentos.

**Etapa 4 — Integração CDI**
- Cliente Banco Central.
- Sincronização das taxas.
- Banco histórico.
- Motor de cálculo.
- Testes financeiros.

**Etapa 5 — Caixinhas**
- Cadastro.
- Aportes.
- Resgates.
- Associação ao CDI.
- Rendimentos.
- Gráficos.
- Simuladores.

**Etapa 6 — Integrações de mercado**
- Brapi.
- CVM.
- Cotações.
- Proventos.
- Valores de cotas.

**Etapa 7 — Investimentos**
- Ações.
- FIIs.
- Fundos.
- Renda fixa.
- Tesouro.
- Carteira consolidada.

**Etapa 8 — Dashboard e relatórios**
- Indicadores.
- Comparativos.
- Rentabilidade.
- Rendimentos.
- Patrimônio.
- Gráficos.

**Etapa 9 — Refinamento**
- Responsividade.
- Performance.
- Segurança.
- Testes.
- Revisão visual.

Executar cada etapa produzindo código funcional e validado, não somente documentação.

---

# 24. CRITÉRIOS DE ACEITAÇÃO

O sistema deverá permitir que o usuário:

1. Cadastre contas e acompanhe seus saldos.
2. Registre ganhos, despesas e transferências.
3. Controle cartões e compras parceladas.
4. Analise gastos por categorias e subcategorias.
5. Crie caixinhas financeiras.
6. Configure caixinhas remuneradas a 100%, 110%, 120% ou outro percentual do CDI.
7. Atualize os cálculos das caixinhas usando taxas oficiais disponíveis.
8. Consulte rendimentos acumulados e projeções separadamente.
9. Cadastre ações, FIIs e fundos de investimento.
10. Atualize preços e valores de cotas conforme provedores disponíveis.
11. Registre e acompanhe dividendos.
12. Compare investimentos com CDI.
13. Acompanhe o patrimônio líquido.
14. Visualize gráficos comparativos.
15. Gere relatórios financeiros.
16. Mantenha todos os dados persistidos após atualizar a página.
17. Utilize a aplicação em desktop e celular.
18. Consulte a data e a origem de cada dado financeiro externo.

Caso alguma API não esteja acessível, implementar a estrutura funcional, fornecer alternativa manual e documentar a dependência pendente.

---

# 25. INSTRUÇÃO FINAL — EXECUTE O DESENVOLVIMENTO

**COMECE A IMPLEMENTAR A FINORA AGORA.**

Não entregue apenas um plano.

Analise primeiro a estrutura existente do repositório e a imagem de referência.

Em seguida:

- Implemente os arquivos.
- Construa os componentes.
- Configure o banco.
- Crie as migrations.
- Desenvolva as APIs.
- Programe os cálculos.
- Integre os serviços externos disponíveis.
- Implemente as páginas.
- Conecte os dados ao dashboard.
- Execute os testes.
- Corrija os erros encontrados.

Não interrompa o desenvolvimento para pedir aprovação a cada etapa técnica normal.

Não sobrescreva configurações sensíveis nem altere outros projetos.

Quando uma integração externa exigir credenciais, autorização ou plano específico, implemente o adaptador e documente o que falta, sem inventar funcionamento.

**Prioridades absolutas:**

1. Cálculos financeiros precisos.
2. Atualização automática com APIs confiáveis.
3. Caixinhas remuneradas pelo CDI.
4. Carteira de investimentos com dados de mercado.
5. Dashboard claro e completo.
6. Segurança e persistência dos dados.
7. Excelente experiência visual.
8. Baixo custo operacional.

**RESULTADO ESPERADO:**

Uma aplicação financeira pessoal moderna, completa e funcional, capaz de mostrar quanto dinheiro o usuário possui, quanto gasta, quanto economiza, quanto investe e quanto seus investimentos estão rendendo — com informações confiáveis, comparativos claros e atualizações automáticas sempre que as fontes permitirem.