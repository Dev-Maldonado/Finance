# Revisão de responsividade e rolagem

Escopo visual: Dashboard, Contas e Saldos, Cartões, Transações, Categorias,
Caixinhas e evolução individual, Investimentos, Planejamento, Relatórios e
Configurações. Mesmos serviços, cálculos, autenticação, banco e filtros.

Correções:
- Formulários usam colunas com mínimo zero; campos e fieldsets respeitam a largura disponível.
- Cabeçalhos, ações e títulos longos permitem reorganização e quebra de texto.
- Nome completo dentro do cartão pode quebrar linha sem reticências.
- Navegação desktop permite rolagem em janelas baixas, preservando acesso às ações finais.
- Compromissos futuros e valores detalhados de gráficos crescem verticalmente,
  sem uma segunda rolagem vertical. Tabelas extensas e modais mantêm rolagem interna.
- Confirmações de exclusão de investimentos reutilizam o rodapé padrão dos modais.
- Em celulares pequenos, detalhes de investimentos e caixinhas usam uma coluna.
- Resumos de faturas mobile usam uma coluna para evitar separar centavos e valores.

Regressão `responsive-pages.spec.ts`: usuários locais descartáveis, conta e cartão
com nomes longos, descrição sem espaços, despesa negativa, parcelamento, orçamento,
caixinha com saldo informado e investimento manual. Mede a largura física da tela,
a geometria dos principais contêineres após rolar e espera o snapshot carregado.
Confirma o rodapé acima da navegação inferior e valores de faturas sem quebra.
Verifica dez páginas e detalhe da caixinha, larguras touch 320/390/768/1024 e mouse
1024/1280/1440/1920; 768×430 e 1024×430 cobrem paisagem e janelas baixas. Abre os principais formulários em
320/768/1280 e verifica acesso aos campos e Salvar; gráficos mantêm interação por toque.
Capturas em 390/1280 permitem revisão visual. Testes não usam o banco de produção.

A validação em navegador não substitui testes em aparelhos físicos Android/iOS.

Validação inicial: 145 testes unitários, 20 verificações integradas, TypeScript e
build aprovados. 20 cenários de navegador aprovados e mais quatro verificações após o último ajuste.
Resultados de publicação constam em STATUS.md.
