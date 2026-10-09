---
name: finora-context
description: Contexto compacto da FINORA 2.0; carregar requisitos por módulo durante desenvolvimento, revisão e validação.
---

# FINORA 2.0

## Uso e economia de contexto

Leia este arquivo ao iniciar uma tarefa FINORA. Consulte INDEX.md e leia apenas as seções necessárias da pasta references. O prompt original permanece integral em references/prompt-original.md; o resumo não substitui seus critérios detalhados. Carregue também as seções 18 (modelo), 19 (contabilidade), 20 (segurança) e 22 (testes) quando afetadas. Instruções atuais do usuário prevalecem. Não trate exemplos como dados reais.

Use o checkout existente /workspace/Finance. Cada tarefa cloud já é isolada; não crie worktrees sem solicitação. Inspecione novamente arquivos e instruções do projeto antes de modificar. Diferencie configuração de ambiente de desenvolvimento da aplicação: onboarding preserva fonte e lockfiles; uma tarefa de implementação permite as mudanças de código solicitadas.

Mantenha docs/STATUS.md atualizado com etapa atual, trabalho concluído, evidências de validação, bloqueios e próxima ação. Não registre segredos. Retome pelo status e pelos arquivos, sem reler todo o prompt. Comunique resultados e limitações de forma concisa. Economia de tokens não autoriza omitir funcionalidades ou testes exigidos.

## Requisito atual de caixinhas e indicadores — 09/10/2026

Caixinhas passam a ser exclusivamente manuais: saldo inicial, depósitos e retiradas reais, saldo total informado mensalmente, correções auditadas e histórico. Nenhum CDI/Selic/estimativa calcula retornos. Resultado = saldo atual + retiradas brutas − impostos efetivos − depósitos; percentual sobre depósitos totais. Sem observação/valor confirmado, mostrar aguardando atualização. Não alterar saldos antigos na migração 25; preservar lotes/reconciliações e demais áreas. Ver [MANUAL-SAVINGS.md](../MANUAL-SAVINGS.md). Os requisitos antigos de CDI automático abaixo são históricos e foram substituídos.

Dashboard exibe meta Selic SGS 432 do BCB (% a.a.) e IPCA 12 meses tabela 1737/variável 2265 do IBGE/Brasil, com referência, timeout, cache e falhas independentes sem números fictícios. Indicadores são informativos, separados dos rendimentos do usuário. Preservar desktop/mobile/PWA e demais módulos.

## Requisito mobile/PWA — 09/10/2026

Criar uma experiência própria de aplicativo para celulares/tablets, mantendo integralmente os módulos, dados, backend, autenticação e cálculos. Desktop não recebe mudanças visuais. Navegação inferior e menu completo, formulários/touch charts, safe areas/teclado, Android/iOS standalone e atualização explícita. Cache somente de arquivos públicos/estáticos; nunca snapshots, páginas autenticadas ou mutações. Sem lançamentos offline. Ver [MOBILE-PWA.md](../MOBILE-PWA.md) para instalação e validação.

## Requisito atual de investimentos — 09/10/2026

O pedido atual substitui integralmente a seção 17 original e a atualização automática anterior: apenas Fundos e Criptomoedas, cadastro manual de nome/tipo/quantidade/valor total/data, compras adicionais separadas, preço médio, atualização mensal manual de unidade/cota, patrimônio/lucro/retorno e gráfico mensal simples. Nenhuma API, corretora, provento/evento/importação de investimentos na interface. Aportes não são lucro; sem preço informado não inventar retorno. As outras áreas permanecem preservadas.

O usuário respondeu explicitamente **“apagar registros existentes, limpando o código antigo”** à escolha de preservar ou arquivar a carteira anterior. A migration 24 limpa os investimentos existentes uma única vez, preservando contas, valores/statuses de transações e demais módulos. Reexecução não apaga novos registros manuais. Detalhes em [MANUAL-INVESTMENTS.md](../MANUAL-INVESTMENTS.md). Referências antigas abaixo permanecem apenas como histórico e para os módulos não substituídos.

## Objetivo e prioridades

Aplicação financeira pessoal funcional, persistente e segura: contas, transações, cartões, categorias, caixinhas manuais, investimentos, rendimentos, planejamento, relatórios e patrimônio. Prioridade: precisão financeira; fontes confiáveis e automação; CDI/caixinhas; carteira; dashboard; segurança/persistência; UX; baixo custo. Desenvolver por etapas com código validado e preservar funcionalidades anteriores.

## Stack e arquitetura

Preferir Next.js App Router, React, TypeScript, Tailwind, shadcn/ui, Lucide, Recharts, TanStack Query, React Hook Form, Zod e animações discretas com Framer Motion. Backend Supabase/PostgreSQL/Auth/RLS, Server Actions ou API Routes, migrations versionadas. Cálculos isolados com decimal.js/big.js; nunca usar ponto flutuante comum em cálculos críticos. Separar UI, serviços financeiros, provedores e jobs.

## Regras invariáveis

- Transferências próprias, aportes em caixinhas e compras de ativos movem patrimônio; não viram receita/despesa automaticamente. Não duplicar patrimônio.
- Pagamento de fatura não repete despesa da compra. Separar competência e caixa; parcelas seguem fechamento e vencimento.
- Separar saldo disponível, patrimônio bruto/líquido, rendimentos recebidos, estimativas, lucro realizado, valorização não realizada e projeções.
- CDI SGS 12 é taxa diária percentual: fator simples elegível = 1 + (taxa/100) × (percentual contratado/100). Capitalização composta por lote; respeitar aportes, resgates, datas, contratos e produto. Não anualizar novamente nem inventar taxas ausentes.
- Tributos por produto e vigência; IR/IOF/isenções/come-cotas quando aplicáveis. Estimativa líquida não é saldo confirmado. Histórico reproduzível e conciliação explícita.
- Fundos: posição = cotas efetivas × cota disponível; respeitar classe/subclasse e cotização. Não deduzir taxas já refletidas na cota.
- Rentabilidade considera fluxos, custos e eventos; comparação CDI usa mesmo intervalo/convenção. Distinguir desempenho da cota e do investidor.
- Proventos anunciados não são recebimentos. Confirmação/conciliação e idempotência obrigatórias.
- Dashboard usa dados do usuário ou integrações autorizadas. Dados externos exibem origem, referência, coleta, validação e defasagem; falhas nunca geram valores fictícios.

## Integrações e segurança

BCB oficial para CDI/Selic. Investimentos usam somente valores manuais; integrações de mercado/CVM foram retiradas. Endpoints do prompt precisam ser verificados antes do uso. Provedores independentes: CDIRateProvider, MarketDataProvider, BCB/Brapi/CVM/manual. Cache persistente, sincronização idempotente, correções versionadas, timeout e retry limitado com backoff. Jobs backend independentes do navegador. Alternativa manual quando necessário; declarar pendências sem afirmar integração funcionando.

CDI não concede acesso a saldos bancários. Open Finance exige consentimento, escopo e revogação. Tokens somente no servidor; RLS e validação backend isolam usuários. Não armazenar credenciais bancárias informais, PAN completo ou CVV. Variáveis previstas: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET; nunca registrar valores secretos.

## UX e abrangência

Referência visual obrigatória quando fornecida. Roxo #5B35D5, lilás #F0EBFF, branco, fundo #F7F8FC, verde/vermelho para estados e cinza secundário; cards arredondados e sombras discretas. Sidebar recolhível: Dashboard, Contas e Saldos, Cartões, Transações, Categorias, Caixinhas, Investimentos, Planejamento, Relatórios, Configurações. Responsivo sem cortes ou rolagem horizontal desnecessária.

Dashboard: saldo, entradas, saídas, cartões, rendimentos, patrimônio bruto/líquido; filtros temporais; gráficos e resumos. CRUD completo com recorrência/status, categorias/subcategorias, extratos, faturas/parcelas, caixinhas/metas/lotes, carteira/proventos/eventos, orçamentos e simuladores. Classes incluem ações, FIIs, ETFs, BDRs, FIAGROs, fundos, renda fixa, Tesouro, internacionais e personalizados. Importar CSV/OFX/planilhas com prévia, conciliação e deduplicação; exportar CSV/Excel/PDF. Detalhes e campos estão nas referências.

## Execução e validação

Sequência original: 1 fundação; 2 finanças pessoais; 3 cartões; 4 CDI; 5 caixinhas; 6 provedores de mercado; 7 investimentos; 8 dashboard/relatórios; 9 refinamento. Cada etapa entrega código funcional validado. Rodar testes financeiros, CDI com casos independentes, investimentos/eventos, falhas/cache/correções e isolamento/RLS. Verificar persistência, interface desktop/mobile, fontes/datas e comportamento real. Não afirmar testes ou integrações não executados.
