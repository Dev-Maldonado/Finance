# Enquadramento, rolagem e área visível — 30/10/2026

Esta revisão complementa VISUAL-QUALITY.md e mantém o inventário de UX-MODULES.md.
Não modifica registros, cálculos, filtros, serviços financeiros, autenticação,
APIs ou migrations. Abrange todos os 31 destinos principais/antigos, formulários,
menus, tabelas, gráficos e PWA, usando os componentes financeiros existentes.

## Causas reproduzidas

- Em 568x320, cabeçalho + faixa econômica sticky + navegação inferior deixavam
  apenas 48,75px para o conteúdo. Medir somente largura/scrollHeight não detectava
  essa sobreposição. A faixa agora segue o fluxo normal quando a área útil é pequena.
- Avisos simultâneos do PWA exigem reserva proporcional à altura real, em vez de
  170px fixos. Se não há área de leitura suficiente, os avisos permanecem visíveis
  antes da página e acompanham sua rolagem natural.
- Modal acompanhava resize, mas não scroll/offsetTop da visualViewport. Ao deslocar
  a área visível com teclado aberto, parte do diálogo ficava fora dela. Os dois
  limites da viewport visual agora definem seu posicionamento, incluindo menus.
- As margens de âncoras e scroll-padding acumulavam offsets fixos diferentes.
  O documento passa a reservar o cabeçalho/faixa efetivamente medidos, uma vez.

## Organização técnica

`use-viewport-layout.ts` mede somente superfícies da interface por ResizeObserver,
com eventos agrupados em requestAnimationFrame. Define reservas superior/inferior,
acompanha abertura de diálogos, mede seus rodapés e revela controles focados dentro
do próprio diálogo. Barras/rodapés que ocupariam a leitura passam ao fluxo normal;
nenhum conteúdo é removido. Sidebar acompanha o documento quando excede a janela.
Observadores são limpos e mutações de gráficos/tooltips não iniciam novas medições.

`html`, `body` e workspace crescem com o conteúdo, com min-height em dvh e sem
mascarar overflow horizontal no html. Tabelas mantêm scroll localizado e todos os
campos/colunas/ações. Mecanismo de instalação, cache público e atualização do PWA
permanece o mesmo; apenas o posicionamento de mensagens/diálogos é adaptado.

## Validação

Matriz: 320x568, 375x667, 390x844, 430x932, 768x1024, 1024x768, 1366x768,
1440x900, 1920x1080 e 2560x1440. Zoom equivalente por viewport/DPR em 125/150/200%,
paisagem, avisos simultâneos, teclado com viewport deslocada, foco real em controles
e âncoras com títulos fora das superfícies fixas.
Testes verificam bordas/textos, ancestrais que recortam texto, rolagem até o rodapé,
valores grandes, 13 formulários de criação em telefone, paisagem e desktop, além das
regressões financeiras existentes. Resultados efetivamente executados em STATUS.md.
Somente usuários descartáveis no Supabase local; nenhuma escrita financeira real.
Emulação Chromium não equivale a teste em aparelhos físicos ou Safari nativo.
