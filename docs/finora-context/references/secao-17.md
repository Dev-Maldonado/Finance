# 17. SISTEMA CENTRAL DE INTEGRAÇÕES FINANCEIRAS

Criar módulo backend exclusivo para comunicação com APIs externas.

Estrutura sugerida:

```text
src/
  integrations/
    bcb/
      bcb-client.ts
      cdi-provider.ts
      selic-provider.ts
    brapi/
      brapi-client.ts
      stocks-provider.ts
      fii-provider.ts
      funds-provider.ts
    cvm/
      cvm-client.ts
      fund-registry.ts
      daily-nav-importer.ts
    shared/
      provider-types.ts
      provider-errors.ts
      cache.ts

  financial/
    calculations/
      cdi-engine.ts
      savings-engine.ts
      tax-engine.ts
      portfolio-engine.ts
      performance-engine.ts
      net-worth-engine.ts
```

Adaptar os diretórios à arquitetura existente.

## 17.1 Atualização automática

Criar jobs para:

**CDI**
- Consultar diariamente os novos registros disponíveis.

**Ações e ETFs**
- Atualizar preços conforme disponibilidade da fonte, licença e limites do plano.

**FIIs**
- Atualizar preços e eventos quando publicados.

**Fundos**
- Processar novas cotas após publicação dos informes.

**Carteira**
- Recalcular posições impactadas pelas atualizações.

Usar agendador compatível com a infraestrutura disponível.

Não depender de uma aba de navegador aberta para manter as atualizações.

## 17.2 Cache

Implementar:

- Cache de taxas.
- Cache de cotações.
- Histórico de preços.
- Histórico de cotas.
- Datas de atualização.
- Controle de versões e correções.

Evitar solicitar os mesmos dados repetidamente.

## 17.3 Tratamento de falhas

Suportar:

- Timeout.
- API indisponível.
- Erro 429.
- Credencial inválida.
- Limites gratuitos.
- Respostas incompletas.
- Cotação não encontrada.
- Dados desatualizados.

Utilizar retry com backoff e limites.

Nunca substituir falhas de integração por valores fictícios apresentados como reais.

## 17.4 Configuração das APIs

Criar uma área administrativa de integrações.

Exibir:

- Provedor.
- Status.
- Última sincronização.
- Último sucesso.
- Erros recentes.
- Cobertura.
- Modo automático/manual.

Guardar tokens exclusivamente no servidor.

Utilizar variáveis de ambiente:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
BRAPI_API_TOKEN=
CRON_SECRET=
```

Não expor segredos ao navegador.

## 17.5 Estratégia de custos

Priorizar:

1. Banco Central para CDI e índices compatíveis.
2. CVM para dados públicos de fundos.
3. Provedores de mercado para cotações e proventos.
4. Entrada manual como alternativa.
5. Serviços pagos apenas se realmente necessários e mediante configuração explícita.

Verificar termos de uso e licenças, especialmente redistribuição e armazenamento de dados de mercado.

Não utilizar scraping frágil como dependência principal.

---

