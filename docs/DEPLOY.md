# Publicação: Vercel + Supabase

O frontend e as APIs usam Next.js. A Vercel detecta o framework automaticamente. O banco, Auth e RLS devem usar um projeto Supabase hospedado, separado do ambiente local. Não envie `.env.local` ou `.local-db.env` para GitHub/Vercel.

## Supabase

Use um projeto novo ou confirme que o banco existente é destinado ao FINORA. Antes de alterar um banco existente, preserve um backup e confira as migrations pendentes.

Com o Supabase CLI oficial e credenciais seguras configuradas, execute:

```bash
npx supabase link --project-ref "$SUPABASE_PROJECT_REF"
npx supabase db push --dry-run
npx supabase db push
```

As migrations em `supabase/migrations` criam tabelas, funções financeiras e políticas de acesso. Não execute os scripts `scripts/local` no banco hospedado. Não copie usuários, credenciais ou dados de teste do banco local.

Se a conexão PostgreSQL estiver indisponível, use o SQL Editor do projeto. Em um projeto vazio, execute [supabase-bootstrap.sql](supabase-bootstrap.sql), com as 17 migrations iniciais, e depois [supabase-update-financial-upgrade.sql](supabase-update-financial-upgrade.sql), com as migrations 18–23, antes de publicar esta versão. Em uma instalação com as 17 migrations, execute somente o segundo arquivo. Instalações na versão 16 precisam aplicar primeiro [supabase-update-card-corrections.sql](supabase-update-card-corrections.sql). Os scripts registram o histórico do CLI e executam em transações; o incremental 18–23 permite reexecução sem duplicar alterações. O bootstrap bloqueia relações ou histórico existentes: não apague tabelas para contornar esse bloqueio. O upgrade foi validado duas vezes em banco descartável com histórico financeiro preservado. Pelo CLI, `db push` aplica todas as migrations pendentes.

Configure SMTP e confirmação de email no Supabase Auth. Após obter o domínio de produção, configure Site URL e Redirect URLs com esse domínio e a URL exata `/auth/callback`. Cadastros e recuperação de senha devem ser verificados com uma conta de teste própria.

No projeto informado, abra [Authentication → URL Configuration](https://supabase.com/dashboard/project/jqxuwhvkcdfxuxfktzmw/auth/url-configuration) e configure:

- **Site URL:** `https://finance-two-lake.vercel.app`
- **Redirect URLs:** `https://finance-two-lake.vercel.app/auth/callback`

O app envia o callback do domínio atual no cadastro, reenvio de confirmação e recuperação. Supabase recusa callbacks fora da lista e pode usar Site URL como alternativa; manter localhost como Site URL de produção direciona os emails para o computador do usuário. A chave de serviço do app não concede permissão para editar essa configuração administrativa. Se houver templates personalizados de email, use o link de confirmação gerado pelo Supabase (`{{ .ConfirmationURL }}`), sem um endereço localhost fixo.

Depois de corrigir as URLs e publicar o app atualizado, solicite um novo email em “Reenviar confirmação” ou “Esqueci minha senha”. Links com `otp_expired` já expiraram ou foram usados e não são recuperados pela alteração das URLs. Abra o novo link no navegador em que o solicitou (fluxo PKCE). Recuperação válida leva a Configurações, onde o formulário “Nova senha” permite salvar a senha.

## Vercel

Importe `Dev-Maldonado/Finance`, selecione a branch `main`, diretório raiz do repositório, framework Next.js, Node.js 24 e build `npm run build`.

O projeto público `jqxuwhvkcdfxuxfktzmw` já está definido como padrão no código, usando somente sua URL e chave publicável. Assim, um deploy sem variáveis públicas abre o login conectado a esse projeto. Para apontar a outro projeto, configure URL e chave pública juntas antes do build; configurações parciais são recusadas.

Configure estas variáveis usando os valores do projeto hospedado:

| Variável | Uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL HTTPS, opcional para substituir o projeto padrão |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública anon/publicável, junto com a URL de substituição |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave secreta de serviço, somente backend |
| `CRON_SECRET` | Segredo aleatório para autenticar sincronização |
| `BRAPI_API_TOKEN` | Opcional, conforme cobertura/plano |

Nunca use as credenciais locais geradas por `db:start`. A chave de serviço não pode ter prefixo `NEXT_PUBLIC_`. Mudanças nas variáveis públicas exigem novo build. Configure ambientes de preview com banco separado quando forem usados para testes.

## Sincronização e verificação

### CDI automático na Vercel

O `vercel.json` agenda `/api/benchmarks` diariamente às 12:00 UTC (09:00 em Brasília), inclusive no plano com um cron diário. Configure `SUPABASE_SERVICE_ROLE_KEY` e `CRON_SECRET` em **Production** nas variáveis seguras da Vercel e faça novo deploy da `main`. O cron usa `Authorization: Bearer` com o segredo; solicitações sem autorização retornam 401. Nunca coloque esses valores em variáveis públicas. Confira a execução em Vercel → Cron Jobs e a data de verificação em Caixinhas. O agendamento só passa a existir após o deploy. Em 08/10/2026, as duas variáveis foram configuradas no projeto finance e o endpoint autorizado do deploy atualizado respondeu 200; a API da Vercel confirmou o cron habilitado. Esse teste manual não comprova uma execução futura do agendador.

O backend atualiza CDI (SGS 12) e Selic (SGS 11) independentemente da carga CVM. Ao abrir o app com aplicações elegíveis, também verifica taxas, usando cache de quatro horas, com verificação periódica enquanto o app está aberto e opção “Atualizar CDI”. O cron funciona sem navegador aberto. Falhas preservam taxas anteriores e exibem a referência utilizada, sem repetir uma taxa antiga como se fosse nova. Respostas lentas têm timeout e retry limitado. Aportes antigos fazem backfill em janelas de até um ano por execução; aplicações com cobertura parcial ficam identificadas até completar o histórico. Atualizações de valores publicados mantêm a auditoria já existente no banco.

Os lotes capitalizam taxas diárias efetivamente publicadas, aplicando seu percentual contratado e respeitando datas/resgates. Os ganhos diário, mensal e acumulado são **estimados**; não criam receitas, não aumentam o saldo confirmado da conta e não significam conexão com Nubank. A conciliação do saldo e dos rendimentos continua explícita. Os dias sem taxa publicada, incluindo finais de semana e feriados, não recebem uma taxa inventada. Nenhuma migration nova é necessária para dashboard/CDI automático.

Um aporte posterior à última taxa armazenada mostra **Aguardando primeira taxa publicada**, com rendimento zero até existir uma taxa elegível; isso não indica histórico incompleto quando a cobertura já alcança a data do aporte. A interface separa **Verificação no servidor** (horário da requisição, inclusive com cache) de **Taxas consultadas no BCB** (última sincronização persistida). Uma resposta em cache pode reutilizar a mesma referência por quatro horas. A indicação de chave ausente aparece somente para configuração ausente; outras falhas não devem ser interpretadas automaticamente como falta de credencial.

Para um runner com o perfil local configurado, `npm run sync:benchmarks` executa somente os indexadores. No ambiente hospedado, use um perfil privado correspondente ao projeto de produção. Não envie perfis ao GitHub.

### Mercado e fundos

O scheduler `npm run jobs` exige um processo persistente; a Vercel não o mantém em execução. A carga inicial da CVM pode exceder limites de tempo/memória de funções serverless. Execute `npm run sync` em um runner persistente configurado para o Supabase hospedado e agende esse processo diariamente. O cron de CDI não atualiza CVM/brapi. `/api/sync` aceita POST autenticado com `CRON_SECRET`, mas o runner precisa respeitar os limites do provedor de hospedagem.

Após o deploy, confira página inicial, cadastro/login/logout, email de recuperação, persistência de conta/transação, acesso sem sessão retornando 401 e isolamento entre duas contas de teste. Não execute `test:integration` ou `test:e2e` do perfil local contra produção. Verifique as datas de CDI/cotações e os logs de provedores antes de considerar a sincronização operacional.

Os recursos avançados pendentes continuam registrados em [STATUS.md](STATUS.md). Publicação não altera essa cobertura.

## Atualização: cores e correções de lançamentos

Para um projeto que já recebeu o bootstrap anterior, execute somente [supabase-update-card-corrections.sql](supabase-update-card-corrections.sql) no SQL Editor antes do novo deploy. Ele adiciona cor persistente aos cartões, exclusão de compras com histórico e a função de correção de parcelas. Foi validado em banco descartável, inclusive reexecução sem duplicar a migration. Não execute novamente o bootstrap no banco existente.

Compras em faturas sem pagamento permitem alterar cartão, valor, data, parcelas e categoria, recalculando vencimentos e limite. Em faturas que já têm pagamento, descrição/categoria podem ser corrigidas; mudanças financeiras e exclusão são bloqueadas até conciliação do pagamento. Receitas e despesas independentes da conta permitem edição e exclusão, com saldo recalculado. Exclusão mantém histórico e remove o lançamento dos totais; movimentos vinculados a transferências, caixinhas e investimentos precisam da correção correspondente na origem.


## Operação desta versão

O cron diário também gera as despesas recorrentes previstas até o dia atual. Abrir o aplicativo gera as pendências do próprio usuário; previsões futuras são calculadas separadamente e não reduzem o caixa confirmado. Esta atualização requer as migrations 18–23 antes do deploy.

Consulte [OPERATIONS.md](OPERATIONS.md) para CI, sincronização de mercado/CVM, backups criptografados e ensaio de recuperação. Os workflows de mercado e backup exigem secrets e variáveis de ativação; arquivos publicados não significam agendamento ativado.
