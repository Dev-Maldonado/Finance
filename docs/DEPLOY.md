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

Se a conexão PostgreSQL estiver indisponível no ambiente, abra o SQL Editor do projeto e execute o conteúdo de [supabase-bootstrap.sql](supabase-bootstrap.sql). Esse arquivo contém as 16 migrations iniciais em uma transação e registra o histórico do Supabase CLI. Ele bloqueia a execução quando há relações no schema `public` ou histórico de migrations existente; não apague tabelas para contornar esse bloqueio. O bootstrap foi validado em um banco PostgreSQL descartável, incluindo o bloqueio de reexecução. Para novas migrations após a instalação, use o fluxo incremental do CLI.

Configure SMTP e confirmação de email no Supabase Auth. Após obter o domínio de produção, configure Site URL e Redirect URLs com esse domínio e a URL exata `/auth/callback`. Cadastros e recuperação de senha devem ser verificados com uma conta de teste própria.

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

O scheduler `npm run jobs` exige um processo persistente; a Vercel não o mantém em execução. A carga inicial da CVM pode exceder limites de tempo/memória de funções serverless. Execute `npm run sync` em um runner persistente configurado para o Supabase hospedado e agende esse processo diariamente. Não considere atualização automática ativa apenas por publicar o frontend. `/api/sync` aceita POST autenticado com `CRON_SECRET`, mas o runner precisa respeitar os limites do provedor de hospedagem.

Após o deploy, confira página inicial, cadastro/login/logout, email de recuperação, persistência de conta/transação, acesso sem sessão retornando 401 e isolamento entre duas contas de teste. Não execute `test:integration` ou `test:e2e` do perfil local contra produção. Verifique as datas de CDI/cotações e os logs de provedores antes de considerar a sincronização operacional.

Os recursos avançados pendentes continuam registrados em [STATUS.md](STATUS.md). Publicação não altera essa cobertura.
