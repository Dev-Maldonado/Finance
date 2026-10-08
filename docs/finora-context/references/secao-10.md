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

