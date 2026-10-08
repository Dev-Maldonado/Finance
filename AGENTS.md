# FINORA

Use `docs/finora-context/SKILL.md` como entrada compacta dos requisitos. Leia apenas os módulos afetados no índice; o prompt integral foi preservado. Consulte `docs/STATUS.md` para retomar trabalho e atualize-o com resultados verificados, pendências e próxima ação, sem segredos.

Use este checkout existente. Tarefas cloud já são isoladas; não crie worktrees sem pedido explícito. Preserve configurações sensíveis e outros projetos. Cálculos financeiros usam Decimal; conversões para number servem somente a gráficos e formatação. Não invente dados de mercado, não misture estimativas com caixa confirmado e mantenha isolamento por usuário.

Validação: `npm run test`, `npm run typecheck`, `npm run build`; com banco local, `npm run test:integration` e aplicação iniciada para `npm run test:e2e`. Testes de integração/browser criam usuários temporários e os removem. Não use esses testes contra dados de produção.
