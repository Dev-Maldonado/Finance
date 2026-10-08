# 18. MODELAGEM DO BANCO DE DADOS

Criar as entidades necessárias com chaves, índices e relacionamentos adequados.

### Usuários e contas

- profiles
- financial_accounts
- transactions
- transfers
- categories
- subcategories
- recurring_transactions

### Cartões

- credit_cards
- credit_card_purchases
- credit_card_installments
- credit_card_invoices
- credit_card_payments

### Caixinhas

- savings_goals
- savings_products
- savings_lots
- savings_movements
- savings_yield_calculations
- savings_reconciliations

### Investimentos

- investment_accounts
- investment_assets
- investment_operations
- investment_positions
- investment_income
- investment_corporate_actions
- fund_registry
- fund_share_classes
- fund_nav_history

### APIs e taxas

- financial_data_providers
- benchmark_rates
- asset_price_history
- provider_sync_logs
- provider_sync_states

### Planejamento

- budgets
- financial_goals
- net_worth_snapshots
- user_settings

Armazenar nas séries financeiras:

- Valor.
- Data de referência.
- Fonte.
- Data de coleta.
- Status de validação.
- Metadados relevantes.

Criar mecanismos de idempotência para importações e operações financeiras.

Evitar atualizações que provoquem duplicação de patrimônio.

Aplicar RLS para garantir isolamento entre usuários.

---

