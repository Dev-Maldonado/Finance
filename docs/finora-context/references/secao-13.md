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

