# Uso prático — sugestões implementadas em 26/10/2026

## Pagar e receber sem editar o lançamento

Em Transações, as receitas e despesas ainda não efetivadas têm **Receber** ou **Pagar**. Em Contas Recorrentes, gastos fixos, programados e compromissos oferecem **Pagar**. Escolha a conta e a data efetiva; a atualização invalida o snapshot e recalcula os indicadores. Previsões recorrentes ainda sem lançamento são materializadas com o mesmo identificador de ocorrência do gerador, sem um ledger paralelo.

A baixa registra o valor integral. Faturas continuam usando seu fluxo de pagamento existente, que permite pagamentos parciais e mantém os vínculos das parcelas. Transferências e movimentos internos exigem suas operações próprias. Lançamentos já pagos/recebidos ou cancelados não oferecem outra baixa.

## Competência e caixa em datas diferentes

- **Data** no formulário é o vencimento/competência: define o mês dos indicadores de receitas/despesas, categorias, orçamentos e comparativos.
- **Data efetiva do pagamento/recebimento**, opcional para receitas/despesas confirmadas, define quando o saldo é movimentado. A baixa direta a preenche sem modificar o vencimento.
- Pendente nunca altera o saldo, inclusive após vencer. Compõe previsão e indicadores do período.
- Sem data efetiva, o comportamento anterior é mantido: confirmado só altera o caixa a partir da data do lançamento. Confirmado futuro é **Agendado**, não pago antecipadamente.
- Registros antigos não recebem datas presumidas na migração. Uma correção explícita pode alterar as datas posteriormente; cancelamento mantém histórico e retira o efeito financeiro.
- Fluxo de caixa operacional, saldo de conta, conciliação e previsões respeitam a data efetiva. Um pagamento antecipado não continua na previsão; um recebimento atrasado pertence ao caixa do mês recebido e à receita do mês original.
- Importação reconhece possíveis correspondências pelo vencimento ou pela data efetiva, sempre exigindo revisão para conciliar; nunca duplica automaticamente uma baixa já registrada.

Exclusões e alterações de séries continuam protegendo pagamentos anteriores. Baixas são transacionais, isoladas por usuário, idempotentes e protegidas contra repetição concorrente. A data efetiva não pode ser futura nem se aplicar a transferências, caixinhas ou ajustes internos.

## Foco nas próximas ações

Contas Recorrentes mantém a navegação mensal e acrescenta **Atrasadas** e **Próximos 7 dias**. O intervalo de sete dias inclui hoje até a data indicada, inclusive quando atravessa o mês. Atrasadas consulta ocorrências registradas; não fabrica projeções retroativas de recorrências pausadas ou alteradas.

**Saldo atual das contas** mostra caixa efetivo. **Saldo após contas previstas** desconta saídas previstas e pendências anteriores, sem antecipar entradas. A data final é explícita: fim do mês atual ou selecionado, limitado à projeção de 90 dias do planejamento. O resumo mensal continua separado por cartões, gastos fixos e programados.

## Menos campos repetidos

Em **Configurações → Preferências financeiras**, selecione uma conta padrão e categorias padrão de receita/despesa. Os novos formulários aplicam as preferências válidas, mantendo edição livre. Ao alternar o tipo no cadastro, a categoria padrão acompanha a escolha até que o usuário a selecione manualmente. Registros existentes preservam suas classificações.

Atalhos **Nova receita**, **Nova despesa** e **Transferência** ficam no dashboard, Transações, Contas e Contas Recorrentes. Ações aguardam o carregamento inicial dos dados para não abrir cadastros sem as preferências. Todos os menus e ações anteriores permanecem disponíveis.

## Indicadores oficiais

- Selic: meta vigente, SGS 432 do Banco Central, em % a.a.
- IPCA nacional acumulado em 12 meses: tabela 1737, variável 2265 do IBGE. SIDRA é a rota principal; o serviço de agregados do IBGE é alternativa. SGS 13522 do Banco Central é a última alternativa oficial, com fonte corretamente identificada.
- Dólar USD/BRL: **PTAX de venda diária** do Banco Central, R$ por US$ 1, quatro casas decimais. Não representa câmbio em tempo real, turismo, spread ou IOF.

Os três aparecem juntos na faixa discreta do dashboard e na seção completa com referência, fonte e atualização manual. Consulta automática a cada hora enquanto a tela está aberta e cache persistente no servidor; cada fonte falha independentemente. Em uma indisponibilidade, o último dado oficial validado permanece identificado como tal, com sua referência. Sem dado válido, mostrar indisponível. Nenhum índice calcula rendimento pessoal.

O cache contém exclusivamente índices públicos, nunca dados financeiros privados. Somente o servidor com credencial de serviço grava; usuários autenticados podem consultar. Falha no cache não impede usar uma resposta oficial válida.

## Preservação e validação

Migration 27 acrescenta campos anuláveis, preferências e RPC de baixa, sem preencher ou reescrever datas/valores antigos. Teste de upgrade aplica a migração duas vezes sobre o esquema anterior e compara histórico, preferências, saldos e permissões. Testes de integração usam apenas usuários descartáveis no Supabase local. Evidências finais e publicação em STATUS.md.
