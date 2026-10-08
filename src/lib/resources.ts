import { z } from "zod";
const text = z.string().trim().min(1).max(200),
  optional = z.string().max(1000).optional(),
  id = z.uuid(),
  nullableId = z
    .union([id, z.literal(""), z.null()])
    .optional()
    .transform((v) => v || null);
export const amount = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, "Use até duas casas decimais")
  .refine((v) => Number(v) > 0, "Valor deve ser positivo");
const positive = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,8})?$/)
  .refine((v) => Number(v) > 0);
const date = z.iso.date();
export const schemas = {
  financial_liabilities: z.object({
    name: text,
    amount: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/),
    due_date: z
      .union([date, z.literal("")])
      .optional()
      .transform((v) => v || null),
    notes: optional,
  }),
  savings_reconciliations: z.object({
    goal_id: id,
    date,
    confirmed_balance: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/),
    notes: optional,
  }),
  recurring_transactions: z.object({
    account_id: id,
    category_id: nullableId,
    description: text,
    type: z.enum(["income", "expense"]),
    amount,
    next_date: date,
    frequency: z.enum(["monthly", "weekly"]),
    active: z.boolean().default(true),
  }),
  financial_accounts: z.object({
    name: text,
    institution: optional,
    kind: z.enum(["bank", "cash"]).default("bank"),
    initial_balance: z
      .string()
      .regex(/^-?\d{1,12}(\.\d{1,2})?$/)
      .default("0"),
    color: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .optional(),
    archived: z.boolean().optional(),
  }),
  categories: z.object({
    name: text,
    parent_id: nullableId,
    budget: amount.nullable().optional(),
  }),
  credit_cards: z.object({
    name: text,
    color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#5B35D5"),
    institution: optional,
    brand: optional,
    last_four: z.string().regex(/^\d{4}$/),
    credit_limit: amount,
    closing_day: z.coerce.number().int().min(1).max(28),
    due_day: z.coerce.number().int().min(1).max(28),
    account_id: id,
  }),
  savings_goals: z.object({
    name: text,
    description: optional,
    target: amount,
    target_date: z
      .union([date, z.literal("")])
      .optional()
      .transform((v) => v || null),
    institution: optional,
    indexer: z.enum(["cdi", "none", "fixed", "selic", "manual"]).default("cdi"),
    percentage: z
      .string()
      .regex(/^\d{1,4}(\.\d{1,4})?$/)
      .default("100"),
    annual_rate: z
      .string()
      .regex(/^\d{1,4}(\.\d{1,4})?$/)
      .default("0"),
    product: z
      .enum(["custom", "cdb", "rdb", "treasury", "fund"])
      .default("custom"),
    tax_exempt: z.boolean().default(false),
  }),
  investment_opening_positions: z.object({
    asset_id: id,
    quantity: positive,
    cost: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/),
    date,
    notes: optional,
  }),
  investment_assets: z.object({
    ticker: text,
    name: text,
    asset_class: z.enum([
      "stock",
      "fii",
      "etf",
      "bdr",
      "fiagro",
      "fund",
      "cdb",
      "lci",
      "lca",
      "treasury",
      "international",
      "custom",
    ]),
    currency: z.string().length(3).default("BRL"),
    cnpj: optional,
    share_class: optional,
    maturity: z
      .union([date, z.literal("")])
      .optional()
      .transform((v) => v || null),
    indexer: optional,
    percentage: z.string().optional(),
    annual_rate: z.string().optional(),
  }),
  investment_corporate_actions: z.object({
    asset_id: id,
    type: z.enum(["split", "reverse_split", "bonus", "ticker_change"]),
    ratio: positive,
    date,
    new_ticker: optional,
  }),
  investment_income: z.object({
    asset_id: id,
    description: text,
    amount,
    date,
    status: z.literal("announced").default("announced"),
    type: z
      .enum(["dividend", "jcp", "interest", "amortization"])
      .default("dividend"),
    source_id: optional,
  }),
  budgets: z.object({
    name: text,
    category_id: nullableId,
    amount,
    month: date,
  }),
  financial_goals: z.object({
    name: text,
    kind: z.enum(["savings", "investment", "net_worth"]).default("savings"),
    target: amount,
    target_date: z
      .union([date, z.literal("")])
      .optional()
      .transform((v) => v || null),
  }),
};
export const operationSchemas = {
  transaction: z.object({
    account_id: id,
    category_id: nullableId,
    description: text,
    type: z.enum(["income", "expense", "yield", "adjustment"]),
    amount,
    date,
    status: z.enum(["confirmed", "pending"]).default("confirmed"),
    notes: optional,
    recurrence: optional,
    source_id: optional,
  }),
  transfer: z
    .object({ from_account: id, to_account: id, amount, date })
    .refine(
      (p) => p.from_account !== p.to_account,
      "Selecione contas diferentes",
    ),
  purchase: z.object({
    card_id: id,
    description: text,
    amount,
    date,
    installments: z.coerce.number().int().min(1).max(120),
    category_id: nullableId,
  }),
  pay_invoice: z.object({ invoice_id: id, account_id: id, amount, date }),
  create_goal: schemas.savings_goals,
  savings_deposit: z.object({ goal_id: id, account_id: id, amount, date }),
  savings_withdraw: z.object({ goal_id: id, account_id: id, amount, date }),
  confirm_yield: z.object({ goal_id: id, amount, date }),
  investment: z.object({
    asset_id: id,
    account_id: id,
    type: z.enum(["buy", "sell"]),
    quantity: positive,
    price: positive,
    fees: z
      .string()
      .regex(/^\d{1,12}(\.\d{1,2})?$/)
      .default("0"),
    date,
    broker: optional,
  }),
  confirm_income: z.object({ income_id: id, account_id: id, date }),
};
export const selects: Record<string, string> = {
  manual_asset_prices: "*,price::text",
  financial_liabilities: "*,amount::text",
  savings_reconciliations: "*,confirmed_balance::text",
  recurring_transactions: "*,amount::text",
  net_worth_snapshots: "*,assets::text,liabilities::text",
  tax_rules: "*,ir_rate::text",
  financial_accounts: "*,initial_balance::text",
  account_balances: "*,initial_balance::text",
  categories: "*,budget::text",
  credit_cards: "*,credit_limit::text",
  transactions: "*,amount::text",
  credit_card_purchases: "*,amount::text",
  credit_card_installments: "*,amount::text",
  credit_card_invoices: "*",
  credit_card_payments: "*,amount::text",
  savings_goals: "*,target::text,percentage::text,annual_rate::text",
  savings_lots:
    "*,principal::text,remaining::text,percentage::text,annual_rate::text",
  savings_movements: "*,amount::text",
  investment_opening_positions: "*,quantity::text,cost::text",
  investment_assets: "*,percentage::text,annual_rate::text",
  investment_operations: "*,quantity::text,price::text,fees::text",
  investment_income: "*,amount::text",
  investment_corporate_actions: "*,ratio::text",
  budgets: "*,amount::text",
  financial_goals: "*,target::text",
  benchmark_rates: "*,value::text",
  asset_cash_events: "*,rate::text",
  asset_price_history: "*,price::text",
  fund_nav_history: "*,nav::text",
  provider_sync_logs: "*",
  provider_sync_states: "*",
  fund_registry: "*",
};
export type Resource = keyof typeof schemas;
