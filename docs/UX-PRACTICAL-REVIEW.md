# Uso prático — revisão de 26/10/2026

## Comportamento conferido

- Recorrências geram lançamentos pendentes. Programados criados em Contas Recorrentes também começam pendentes.
- Pendente não altera o saldo disponível, mesmo após o vencimento. Compõe previsão e indicadores do período.
- Confirmado com data até hoje altera o saldo. Confirmado com data futura passa a compor o saldo nessa data; não antecipa caixa.
- Hoje existe uma única data no lançamento de conta, usada tanto na competência quanto no caixa. Para informar um pagamento feito em outro dia, é necessário corrigir essa data; não existe um campo independente de pagamento.

## Ajustes entregues nesta revisão

Menu desktop agrupado por dinheiro, organização e patrimônio, com Configurações separada. Espaçamentos compactos para notebooks, perfil e privacidade discretos, 11 módulos preservados. Layout em grade, sem rolagem interna da barra lateral; em janelas muito baixas o menu acompanha a rolagem natural da página. Botão de recolher/expandir renomeado para evitar conflito com a utility `collapse` do Tailwind, que o tornava invisível. Mobile/PWA mantém sua navegação própria.

O início de Contas Recorrentes agora esclarece que pendentes não descontam o saldo. Novo teste de navegador confere o saldo persistido antes/depois de registrar e confirmar gastos fixos/programados. Comparações de preservação de snapshots foram ordenadas por ID, mantendo todos os campos, para evitar a falha do CI causada somente por ordem variável do SQL.

## Sugestões prioritárias — ainda não implementadas

1. **Dar baixa diretamente na lista.** Ações “Pagar” e “Receber”, escolhendo conta e data, evitariam abrir a edição completa para trocar o status. Para uma previsão recorrente ainda sem lançamento, preservar seu identificador ao registrá-la.
2. **Separar vencimento e pagamento.** Manter competência e vencimento originais e registrar o dia em que o dinheiro realmente entrou/saiu. Facilitaria antecipações e atrasos sem deslocar indevidamente os indicadores mensais. Exige evolução explícita do modelo e validação de parcelas/caixa, não apenas trocar rótulos.
3. **Foco no que precisa de ação.** Filtros “Atrasadas”, “Próximos 7 dias” e “Este mês” em Contas Recorrentes, reaproveitando os alertas do planejamento e sem criar compromissos duplicados.
4. **Saldo atual e após compromissos próximos.** Levar os indicadores já existentes de saldo/planejamento para perto das contas a pagar, com rótulos distintos, para reduzir a confusão entre dinheiro disponível e projeção.
5. **Preencher menos campos.** Preferências por usuário para conta/categoria mais usadas e atalhos claros de Receita, Despesa e Transferência; sempre permitindo corrigir a escolha.

Também convém usar rótulos de status por tipo (“A pagar”, “Pago”, “A receber”, “Recebido”) e “Agendado” para confirmados futuros, respeitando a regra de data em vez de chamar todo confirmado de pagamento já efetivado.
