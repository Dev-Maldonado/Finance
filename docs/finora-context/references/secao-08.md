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

