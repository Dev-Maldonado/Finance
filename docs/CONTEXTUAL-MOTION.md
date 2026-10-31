# Refinamento visual e movimento contextual — 31/10/2026

## Escopo e preservação

Camada exclusivamente de apresentação sobre a estrutura existente. Navegação,
31 destinos, formulários, opções, cálculos Decimal, consultas, autenticação,
históricos, regras de competência/caixa, Supabase e PWA permanecem os mesmos.
Não foram adicionadas dependências, migrations nem integrações.

`premium-experience.css` refina superfícies, divisores, tipografia, foco, controles,
estados ativos, tabelas, menus e modais compartilhados. As dimensões naturais e
reservas medidas de LAYOUT-INTEGRITY.md continuam vigentes.

## Reações por contexto

| Ação confirmada pelo servidor | Apresentação |
| --- | --- |
| Receita/rendimento/ajuste positivo efetivado | Cédulas e moedas ascendentes, confirmação de entrada |
| Despesa/pagamento efetivado | Moedas saindo, confirmação de saída |
| Compra de cartão | Saída visual, texto explícito de parcela em fatura sem débito imediato na conta |
| Transferência/aporte/resgate | Percurso visual entre origem e destino; não tratado como lucro |
| Caixinha cruza a meta existente | Confetes discretos e troféu |
| Nova atualização mensal com valorização confirmada | Linha de crescimento e partículas |
| Pendente, futuro, correção ou cadastro administrativo | Check de salvamento sem celebrar recebimento/ganho |
| Erro de salvamento | Mantém mensagem original; não dispara sucesso |

`financial-feedback.ts` classifica somente a apresentação depois que o servidor
aceita a operação. Reutiliza `isSettled`, `manualSavingsPosition` e `manualPosition`
para respeitar datas efetivas, aportes, correções e avaliações manuais. Falhas de
classificação caem na confirmação neutra. Nenhum registro é criado/modificado por
essa classificação. Redução da meta ou edição de avaliação não simula ganho.

## Interações e desempenho

- Provider único, evento efêmero e uma reação por vez. Sem filas, persistência de
  valores ou pedidos adicionais às APIs. Limite de 7 partículas (12 confetes),
  remoção automática em até 3,2 segundos.
- Partículas decorativas usam transform/opacity e não interceptam cliques. Uma
  mensagem acessível anuncia a confirmação; desenhos ficam fora da árvore ARIA.
- Troca de rota, encerramento de sessão, ocultação da aba e desmontagem limpam os
  efeitos. Formulário já fechado não publica uma reação de resposta atrasada.
- `useInteractiveFinance` usa eventos delegados e rAF somente enquanto necessário:
  inclinação máxima de 2 graus e brilho em cartões sob mouse; sem sensores móveis.
- Indicadores atualizados após uma ação confirmada recebem transição curta de
  opacidade com o valor final exato. Não há contagem numérica com valores fictícios.
  Carregamento inicial, filtros e navegação não são interpretados como ganhos.
- Gráficos Recharts usam animação curta de 380ms com os mesmos dados, séries,
  tooltips e controles. Preferência de movimento compartilhada e reativa.
- Movimento reduzido: confirmação estática, sem partículas/3D/animação de gráficos;
  controles e resultados permanecem disponíveis. Impressão exclui efeitos.

## Validação

Testes unitários específicos distinguem confirmação, pendência, futuro, correção,
transferência, meta, aporte, valorização manual e dados de apresentação inválidos.
Testes browser usam usuários descartáveis em Supabase local e conferem persistência,
saldo real, falha de API, efeitos apropriados, movimento reduzido, limpeza,
interação com cartão e ausência de overflow. Capturas desktop/mobile revisadas.

A suíte de regressão existente continua cobrindo as 31 rotas, dez resoluções,
zoom 125/150/200%, paisagem, modais, teclado, filtros e cálculos. Resultados finais
verificados e publicação ficam em STATUS.md. Emulação Chromium; não representa
teste em aparelhos físicos ou Safari nativo.
