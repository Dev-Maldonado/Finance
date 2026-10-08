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

