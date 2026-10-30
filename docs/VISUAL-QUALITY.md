# Refinamento visual e responsivo — 30/10/2026

Escopo exclusivo de apresentação, mantendo o inventário UX-MODULES.md, caminhos,
campos, índices, controles e regras financeiras. Nenhuma migration, API, autenticação,
integração ou cálculo financeiro é modificado.

Auditoria inicial reproduziu fontes inferiores a 14px em valores principais do
resumo de 320px. Cards monetários agora ampliam sua área antes de reduzir a fonte;
formatação e valores não mudam. A revisão também amplia a cobertura das tabelas
com muitas colunas, formulários longos, paisagem, zoom e carregamento.

- Tokens compartilhados de superfícies, bordas, foco, tipografia Inter e contraste.
- Conteúdo com altura natural e grades flexíveis; valores e nomes completos.
  Relatórios/simulador abandonam tracks min-content, e descrições longas no dashboard
  quebram dentro da grade. Identificação da conta no menu não usa reticências.
- Tabelas extensas com rolagem horizontal localizada, indicação visual, descrição
  acessível e foco de teclado; controles laterais não cobrem células em telas estreitas.
  Listas que já têm cards mobile (transações e compras) conservam essa apresentação.
- Formulários com ações no rodapé sticky, limites de viewport e margens para foco;
  prévia de parcelas sem uma segunda rolagem vertical concorrendo com o modal.
- Skeleton anunciado, sem valores fictícios, para o primeiro carregamento de dados.
- Entrada discreta por IntersectionObserver/WAAPI, sem ocultar conteúdo com opacity0.
  Um observador compartilhado, limpeza na navegação e exclusão de tooltips do trabalho
  de observação. Movimento reduzido cancela animações; impressão usa conteúdo normal.
- Ajuste monetário também nos módulos de contas, investimentos, caixinhas e relatórios,
  mantendo os observadores específicos existentes sem processar suas áreas duas vezes.

Testes usam somente usuários descartáveis no Supabase local. As oito larguras
320/360/390/430/768/1024/1440/1920, equivalências de zoom 125/200% por viewport e DPR,
paisagem baixa, teclado, modais e os 31 destinos são verificados. Resultados
finais e publicação em STATUS.md. Não representa teste em aparelhos físicos.
