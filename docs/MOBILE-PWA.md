# FINORA no celular

A interface mobile tem navegação inferior (Início, Transações, Cartões, Caixinhas e Mais), menu com todos os módulos, formulários em painéis, filtros por toque e detalhes dos gráficos. Utiliza a mesma autenticação, banco, componentes e cálculos do desktop. Nenhuma migration é necessária.

## Instalação

Abra https://finance-two-lake.vercel.app/ em uma conexão HTTPS.

- **Android / Chrome:** Mais → Instalar aplicativo. Se o navegador não apresentar a solicitação, use seu menu → Instalar aplicativo / Adicionar à tela inicial.
- **iPhone / iPad:** abra no Safari → Compartilhar → Adicionar à Tela de Início → Adicionar. O menu do FINORA também apresenta essas instruções.

A instalação mantém a mesma conta e oferece modo standalone, ícone e abertura próprios. O sistema não solicita permissões de notificações, câmera ou localização.

## Atualização e conexão

A aplicação verifica o Service Worker ao voltar para a janela e periodicamente. Uma nova versão apresenta o aviso **Nova versão disponível** na interface mobile. **Atualizar** exige confirmação; conclua e feche formulários antes. A ativação é solicitada pelo usuário, evitando recarregamento no meio de um lançamento.

O aplicativo precisa de internet para consultar e salvar dados. O cache contém somente ícones, uma página pública offline e arquivos estáticos imutáveis de JavaScript/CSS. Páginas autenticadas, respostas financeiras, autenticação e solicitações de alteração não são armazenadas pelo Service Worker. Não existe fila offline de lançamentos. Sem conexão, uma nova navegação apresenta uma tela neutra para tentar novamente, sem inventar saldos ou revelar o histórico.

## Implementação e verificação

- `mobile.css` contém regras exclusivas para janelas de até 1023 px e dispositivos com ponteiro de toque. A navegação e os estilos desktop permanecem preservados. Tablets de toque também usam a navegação do aplicativo, inclusive na orientação horizontal.
- Áreas seguras usam `env(safe-area-inset-*)`; inputs não impedem zoom, têm fonte de 16 px e a posição dos formulários acompanha `VisualViewport`. A barra inferior é ocultada quando detectado o teclado virtual e a animação do formulário é suspensa para manter sua posição acima do teclado.
- Manifest: `/manifest.webmanifest`, com metadados padrão e Apple para modo standalone. Worker: `/sw.js`, sem cache HTTP e com versão vinculada ao commit da implantação. Ícones e telas de abertura para dimensões comuns do iOS ficam em `public/icons`.
- Os gráficos mantêm suas séries e classificações. No mobile, os gráficos temporais respondem ao toque e oferecem valores exatos em listas ou no histórico mensal existente; a seleção por categoria e subcategoria permanece disponível.
- Os seis cenários específicos de mobile/PWA passaram em Chromium e WebKit, incluindo toque, instruções de instalação, atualização e teclado simulado. Testes locais usam contas descartáveis e banco local. A instalação pelo sistema operacional e o teclado físico de aparelhos reais exigem conferência no dispositivo; emulação de navegador não substitui essa verificação.
