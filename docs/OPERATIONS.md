# Operação, validação e recuperação

Os workflows e scripts deste documento são procedimentos versionados. Criá-los não configura secrets, proteção de branch, agendadores externos ou backups do projeto hospedado. Não houve backup/restauro PostgreSQL completo de produção nem ensaio de recuperação hospedada. Um snapshot lógico privado financeiro/Auth foi criptografado e verificado antes do upgrade; suas limitações estão registradas em STATUS.md.

## Validação no GitHub

`.github/workflows/ci.yml` executa em pull requests, pushes na `main` e acionamento manual. Usa Node 24, `npm ci`, testes unitários, proteções e criptografia dos scripts de backup, ensaio de backup/restauro descartável, PostgreSQL 17/Supabase Auth locais em Docker, typecheck, build, integração, integridade financeira, importações classificadas, agendamentos e Chromium Playwright. O banco e seus usuários são descartados ao final; o workflow não recebe secrets de produção. O ambiente local é gerado por `db:start`, usando as migrations versionadas.

`npm run test:imports` verifica com usuários temporários locais a preservação de linhas bancárias idênticas, idempotência, transferências e conciliação sem duplicar caixa, rollback completo, concorrência, pagamento de fatura, aportes/resgates e isolamento entre usuários. Os testes unitários também verificam a prévia líquida de investimentos, paginação, datas e centavos, fórmulas de planilha e a reimportação de CSV exportado. Nenhum desses comandos aceita banco hospedado.

Configure o ruleset da `main` para exigir o check **Unit, types, build, integration and browser** antes do merge e impedir bypass não autorizado. O workflow não cria essa regra automaticamente. Se a Vercel publica pushes diretamente na `main`, a proteção de branch deve garantir os checks antes do push/merge; CI após o push não impede um deploy que já começou.

O teste de dashboard atualmente consulta o BCB real, exclusivamente para o banco local. Uma indisponibilidade do BCB pode falhar esse teste; verifique o diagnóstico antes de atribuir a falha ao app. Testes unitários dos provedores usam respostas controladas e continuam necessários para testar erros de rede. Não substitua taxas reais de produção por fixtures para fazer CI passar.

Em falhas de navegador, `test-results` fica disponível por três dias. Os diagnósticos podem conter a tela e sessão dos usuários temporários locais. Restrinja acesso ao repositório e aos artefatos; o workflow não publica perfis `.env`, dumps, logs de banco ou credenciais.

## Atualização diária de mercado e fundos

`.github/workflows/market-sync.yml` roda às **00:30 UTC / 21:30 em Brasília**, diariamente, e também permite execução manual. O cron da Vercel para CDI/Selic continua definido em `vercel.json`; o workflow executa `scripts/sync.ts`, incluindo os provedores selecionados por esse script, sem carregar `.env.local`. O runner não precisa permanecer ligado entre execuções.

Para habilitar a tarefa após revisão da configuração:

1. Crie o GitHub Environment **production-sync**, limitado à branch `main`.
2. Cadastre nesse environment os secrets da tabela abaixo, correspondentes ao mesmo projeto hospedado. Não os envie por issue, chat, commit ou log.
3. Configure notificações de falha das Actions para o responsável.
4. Ative a repository variable **FINORA_SYNC_ENABLED=true** e faça uma execução manual. Confira status, registros e referência de cada provedor no banco antes de confiar na rotina. Sem a variável, a tarefa é pulada e nenhum acesso de produção ocorre.

| Secret | Finalidade |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Origin HTTPS do projeto Supabase hospedado |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública correspondente ao projeto |
| `SUPABASE_SERVICE_ROLE_KEY` | Credencial privada de backend para persistir dados externos |
| `BRAPI_API_TOKEN` | Opcional; cobertura, histórico e limites dependem do plano contratado |

Secrets só entram nas etapas que precisam deles, após instalar dependências. O workflow rejeita URL de banco local, URL parcial e campos indevidos na URL. O environment pode exigir aprovação humana; nesse caso cada execução agendada ficará aguardando aprovação. Para automação sem intervenção diária, decida conscientemente a política do environment e proteja a `main` com CI.

O job não recebe `CRON_SECRET`: ele chama o script diretamente. Na Vercel, configure `CRON_SECRET` e `SUPABASE_SERVICE_ROLE_KEY` privados em Production para `/api/benchmarks`, seguido de novo deploy. A chave cron deve ser aleatória, independente da chave Supabase e enviada exclusivamente em `Authorization: Bearer`; não aparece em URL ou variável `NEXT_PUBLIC_*`. Verifique ausência de autorização retornando 401, execução autorizada, referência da taxa e o histórico real de Cron Jobs. Um acionamento manual bem-sucedido não comprova a execução futura do agendador.

A consulta de indexadores tem orçamento global de 48 segundos, além do limite de autenticação de 7 segundos na solicitação de usuário. Falhas preservam taxas previamente armazenadas; cache não representa uma nova publicação. Mercado mantém cache por ticker/operação, e CVM por mês e assinatura dos fundos solicitados: cadastrar um ativo novo não deve ser bloqueado por uma sincronização global anterior. `/api/sync` e `/api/benchmarks` devolvem HTTP 503 quando a execução contém erro, inclusive sucesso parcial; examine os resultados individuais para identificar quais fontes precisam repetir a consulta.

Previews da Vercel precisam de URL/chave pública explícitas de um projeto separado. `NEXT_PUBLIC_FINORA_DEPLOYMENT_ENV` recebe o ambiente Vercel no build para aplicar essa restrição; preview sem configuração ou apontando para o projeto padrão de produção é bloqueado. O perfil de produção atual pode continuar usando sua configuração pública padrão. Confira também as variáveis privadas de preview: não reutilize a service role de produção.

Falhas parciais de provedores devem fazer `scripts/sync.ts` encerrar com erro para gerar notificação da Action, preservando sucessos independentes e dados anteriores. O código de saída e as datas dos provedores são mais úteis que apenas contar registros. GitHub pode atrasar/pular agendas em períodos de carga e desabilitar workflows agendados em repositórios públicos inativos; confira a última execução. A concorrência do workflow impede sobreposição entre suas próprias execuções; não impede um segundo runner externo ou uma chamada da API.

### Custo e limites

GitHub Actions consome minutos e armazenamento conforme visibilidade, plano e franquia da conta; runners de repositórios privados podem gerar cobrança. `npm ci`, Chromium e Docker tornam CI mais caro que testes unitários. O job de dados tem limite de 30 minutos, pode baixar arquivos CVM grandes e consome tráfego/gravações no Supabase. Confira tamanho, duração e cotas antes de expandir a carga. Um arquivo CVM maior ou indisponível requer investigação; aumentar timeout não corrige inconsistência de dados.

BCB/CVM têm publicações e dias sem dados. brapi pode exigir plano/token para ativos e histórico. Verifique cobertura/licença e evite ampliar frequência sem necessidade. Confirme custos vigentes nos painéis dos fornecedores; este documento não assume franquia gratuita permanente. Não contrate recursos pagos automaticamente para contornar um erro.

## Backup privado

Use **PostgreSQL 17 client tools** (`pg_dump`, `pg_restore`, `psql`) e Python 3. O script suporta servidor PostgreSQL 17. Versões diferentes exigem revisão das ferramentas. Para Supabase, use conexão direta ou pooler de sessão; não use pooler de transação para `pg_dump`. Configure a URL com senha percent-encoded nas variáveis privadas do processo:

| Variável | Finalidade |
|---|---|
| `FINORA_BACKUP_DATABASE_URL` | URL PostgreSQL privada da origem; remoto exige `sslmode=verify-full` |
| `FINORA_BACKUP_PROJECT_REF` | Ref exato do Supabase de origem; banco loopback usa label `local-origem` |
| `FINORA_RESTORE_DATABASE_URL` | URL privada do destino separado |
| `FINORA_RESTORE_PROJECT_REF` | Ref diferente da origem, ou label loopback como `local-recuperacao` |
| `FINORA_RESTORE_ISOLATED` | `yes` somente após conferir que destino hospedado é separado e descartável |

Os scripts não carregam `.env.local` nem `.env.hosted`. Não coloque valores em argumentos, histórico do shell ou arquivos versionados. Para conexões remotas, libpq 17 usa o trust store do sistema e verifica certificado/hostname. Host/user precisam corresponder ao ref informado; o usuário do pooler é `postgres.<ref>`. Os processos PostgreSQL recebem credenciais por variáveis privadas, sem URL/senha na linha de comando. Não execute o terminal com `set -x`.

Com as variáveis configuradas, crie um diretório privado **fora do checkout** em armazenamento persistente e execute:

```bash
python3 scripts/backups/backup.py --output-dir /caminho/privado/finora-backups
```

O diretório precisa de permissão 0700. O script gera arquivo `.dump` custom e manifesto `.json`, ambos privados (0600), com checksum SHA-256, versão, identidade da origem e fingerprint do schema. O dump contém schema e dados de **public e auth**, incluindo usuários, identidades, tokens/sessões e informações financeiras. Os dados de `public.finora_migrations` e `auth.schema_migrations` ficam excluídos: o destino será provisionado com as mesmas migrations antes do restauro. O schema é comparado antes/depois do dump; pause alterações de schema durante a operação.

Esse procedimento não copia roles globais, outros schemas, arquivos Storage, Edge Functions, secrets/configuração de Auth/Vercel, SMTP ou o painel administrativo Supabase. Preserve essas configurações separadamente em gestor seguro e utilize também os backups/PITR oferecidos pelo fornecedor, conforme plano. Faça inventário de dependências antes de considerar o backup uma recuperação completa do serviço.

Esse comando manual gera arquivos sem criptografia: criptografe os dois antes de transferir para armazenamento privado durável. Não envie dumps sem criptografia para artefatos do GitHub nem diretórios servidos pelo app. `/tmp` serve para testes descartáveis, não para retenção. Para a rotina automática com criptografia, use o procedimento abaixo. Não apague cópias antigas antes de confirmar a nova.

### Backup agendado e criptografado

`.github/workflows/backup.yml` está preparado para execução diária às **02:15 UTC / 23:15 em Brasília**, com retenção de 7 dias para os arquivos diários e 28 dias para a execução semanal de domingo UTC. O workflow exige a variável de repositório **FINORA_BACKUP_ENABLED=true**, branch `main` e o GitHub Environment **production-backup**. Ele permanece inativo enquanto essas configurações e os secrets não estiverem disponíveis. O runner usa clientes PostgreSQL 17 em Docker e não carrega nenhum perfil `.env`.

Cadastre os secrets a seguir nesse environment, referentes ao mesmo projeto de origem:

| Secret | Finalidade |
|---|---|
| `FINORA_BACKUP_PROJECT_REF` | Ref exato do projeto Supabase |
| `FINORA_BACKUP_PGHOST` | Host direto ou pooler de sessão indicado pelo painel Supabase |
| `FINORA_BACKUP_PGPORT` | Porta; `5432` é o padrão e a porta permitida para pooler de sessão |
| `FINORA_BACKUP_PGDATABASE` | Banco, normalmente `postgres` |
| `FINORA_BACKUP_PGUSER` | `postgres` direto ou `postgres.<ref>` no pooler |
| `FINORA_BACKUP_PGPASSWORD` | Senha do banco sem codificação URL |
| `FINORA_BACKUP_PASSWORD` | Senha aleatória independente com pelo menos 32 bytes; guardar também em gestor seguro fora do GitHub |

Não misture os campos `FINORA_BACKUP_PG*` com `FINORA_BACKUP_DATABASE_URL`. O script verifica o vínculo entre host/usuário/ref e usa TLS `verify-full` para conexões hospedadas. Se a rede do runner não alcançar o endpoint direto IPv6, use o pooler de **sessão**, nunca o pooler de transação.

`scheduled.py` cria dump e manifesto em diretório temporário privado, agrupa os dois e aplica GnuPG com AES-256, proteção de integridade e derivação iterada SHA-512. A senha entra somente por pipe privado, sem argumento de processo. Antes do upload, o script decifra uma cópia descartável e compara bytes/checksum; remove todos os arquivos temporários sem criptografia ao final, inclusive em falha. O diretório de saída contém somente `.tar.gpg` e checksum do arquivo criptografado. Nenhuma linha financeira, chave, URL com senha ou manifesto sem criptografia entra no log ou artefato.

O artefato GitHub contém somente esse conteúdo criptografado. Baixe uma cópia adicional para armazenamento privado durável e preserve a senha de recuperação fora da conta GitHub: retenção de Actions não é uma cópia independente da plataforma. A perda da senha torna o arquivo irrecuperável. Ao trocar a senha, preserve as anteriores até expirarem os backups correspondentes. Configure notificações de falha e ensaie a recuperação mensalmente; a verificação criptográfica do upload ainda não comprova recuperação de Auth no Supabase hospedado.

Para executar a mesma rotina com variáveis privadas já configuradas:

```bash
python3 scripts/backups/scheduled.py --output-dir /caminho/privado/finora-criptografado
```

Para recuperar um artefato em uma máquina privada, confira o checksum, decifre com GnuPG em um diretório 0700 e extraia somente os arquivos do bundle. `gpg` solicitará a senha sem colocá-la no comando:

```bash
sha256sum --check finora-encrypted-DATA-ID.tar.gpg.sha256
gpg --output /caminho/privado/recuperacao.tar --decrypt finora-encrypted-DATA-ID.tar.gpg
tar --extract --file /caminho/privado/recuperacao.tar --directory /caminho/privado/restauro
```

Depois execute `restore.py --check-only` e o ensaio de restauração descritos abaixo, apontando para o manifesto decifrado e um banco separado. Remova as cópias decifradas após verificar a recuperação.

## Ensaio de restauração

Prepare um banco **separado, vazio e descartável**, com a mesma versão Auth e as mesmas migrations/schema do arquivo. O modo automático restaura **dados**, preservando o schema, owners, grants e RLS existentes do destino. Ele recusa fingerprint diferente, qualquer dado público/Auth preexistente (exceto metadados de migrations), mesmo ref da origem, mesma identidade da conexão, ausência de confirmação, arquivos públicos e checksum inválido. Não remove nem limpa dados para contornar esses bloqueios.

Mantenha aplicação, Auth e outros escritores do destino parados durante a checagem e carga. O destino precisa continuar vazio até iniciar a transação de restauro; a verificação prévia não é um bloqueio de todos os processos externos.

Primeiro faça a verificação sem escrita:

```bash
python3 scripts/backups/restore.py \
  --manifest /caminho/privado/finora-backups/finora-DATA-ID.json \
  --confirm-destination local-recuperacao \
  --check-only
```

Somente com destino revisado e checks aprovados, execute o mesmo comando sem `--check-only`. Em destino hospedado, informe o ref separado em `--confirm-destination` e configure `FINORA_RESTORE_ISOLATED=yes`.

O restauro usa uma transação única e desabilita triggers durante a carga para preservar relações Auth/financeiras. Isso exige privilégios suficientes; Supabase gerenciado pode recusar operações nas tabelas Auth. Nesse caso a transação deve falhar/rollback e o script não contorna permissões: use o processo de recuperação suportado pelo Supabase em um projeto separado ou ensaie em PostgreSQL local provisionado com schema equivalente. Não execute integração/E2E ou scripts de inicialização local contra o projeto de produção.

Após o restauro, compare contagens e totais financeiros de contas, lançamentos, parcelas, lotes e posições; verifique centavos, referências de usuários, RLS e acesso anônimo. Confira políticas, grants e funções do schema, recuperação de Auth e configuração externa antes de disponibilizar o destino. Meça a duração e registre a data do último backup recuperável. Um checksum válido não comprova recuperação. Ensaie mensalmente e antes de migrations relevantes; confirme que o intervalo entre backups atende à perda de dados aceitável.

### Validação dos scripts sem dados reais

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/backups -p 'test_*.py'
python3 scripts/backups/backup.py --help
python3 scripts/backups/restore.py --help
PYTHONDONTWRITEBYTECODE=1 python3 scripts/backups/verify-local.py
```

Os testes `test_guards.py` usam somente valores fictícios em memória, validando isolamento, configuração TLS, identidade de projeto, proteção contra override PostgreSQL, paths privados e manifesto. Não acessam banco nem fazem dump/restauro.

`verify-local.py` exige `npm run db:start` e lê apenas o **schema** do container local conhecido, por socket Unix, sem ler `.env` nem dados. Cria fonte/destinos novos em PostgreSQL 17 com `--network none`, monta somente um diretório privado temporário e insere fixtures fictícias. Executa os scripts reais, incluindo o backup criptografado agendado e sua decifragem/restauração em um segundo destino vazio. Compara Auth/identidades, centavos, parcelas, lotes e posição inicial, verifica RLS por usuário e acesso anônimo, preservação dos metadados de migrations, `--check-only`, checksum corrompido e bloqueio da origem/destino não vazio. Remove container e arquivos ao final.

Os 15 testes de proteção/criptografia usam valores fictícios, incluindo derivação real, recuperação de bytes, senha incorreta e ciphertext adulterado. A validação do ensaio completo deve ser repetida com o schema final antes de publicar migrations; registre o resultado em `docs/STATUS.md`. Esse ensaio não comprova recuperação de um backup de produção, privilégios de Auth no Supabase hospedado, login/SMTP ou restauração da configuração externa. Esses pontos precisam de ensaio próprio no projeto separado antes de declarar a recuperação de produção validada.
