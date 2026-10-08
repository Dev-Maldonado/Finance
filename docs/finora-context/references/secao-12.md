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

