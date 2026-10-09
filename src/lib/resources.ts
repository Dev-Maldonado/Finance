import { z } from "zod";
import { D } from "@/financial/engine";
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
export const nonnegativeMoney = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "Use até duas casas decimais");
export const signedMoney = z.string().regex(/^-?\d{1,12}(\.\d{1,2})?$/, "Use até duas casas decimais");
const optionalDate = z.union([date, z.literal(""), z.null()]).optional().transform(v => v || null);
export const schemas = {
  user_settings: z.object({
    name: optional,
    emergency_months_target: z.coerce.number().int().min(1).max(24).default(6),
  }),
  financial_obligations: z.object({
    name: text,
    amount,
    due_date: date,
    status: z.enum(["pending", "cancelled"]).default("pending"),
    category_id: nullableId,
    liability_id: nullableId,
    transaction_id: nullableId,
    notes: optional,
  }),
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
    frequency: z.enum(["monthly", "weekly", "annual"]),
    active: z.boolean().default(true),
    end_date: optionalDate,
    start_date: optionalDate,
    anchor_month: z.coerce.number().int().min(1).max(12).optional(),
    anchor_day: z.coerce.number().int().min(1).max(31).optional(),
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
    spending_kind: z.enum(["essential", "optional", "unclassified"]).default("unclassified"),
  }),
  credit_cards: z.object({
    name: text,
    color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#5B35D5"),
    institution: optional,
    brand: optional,
    last_four: z.string().regex(/^\d{4}$/),
    credit_limit: amount,
    closing_day: z.coerce.number().int().min(1).max(31),
    due_day: z.coerce.number().int().min(1).max(31),
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
    is_emergency_reserve: z.boolean().default(false),
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
    amount: signedMoney,
    date,
    status: z.enum(["confirmed", "pending"]).default("confirmed"),
    notes: optional,
    recurrence: optional,
    source_id: optional,
  }).refine(p => p.type === "adjustment" ? !D(p.amount).isZero() : D(p.amount).gt(0), "Informe um valor positivo; ajustes podem ser negativos"),
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
    entry_method: z.enum(["total", "installment"]).default("total"),
    installment_amount: amount.optional(),
  }).superRefine((value, context) => {
    if (value.entry_method === "installment" && !value.installment_amount) context.addIssue({ code: "custom", path: ["installment_amount"], message: "Informe o valor individual da parcela" });
    const total = value.entry_method === "installment" && value.installment_amount ? D(value.installment_amount).mul(value.installments) : D(value.amount);
    if (total.gte("1000000000000")) context.addIssue({ code: "custom", path: ["amount"], message: "Valor total excede o limite permitido" });
    if (total.div(value.installments).toDecimalPlaces(2, 1).lte(0)) context.addIssue({ code: "custom", path: ["amount"], message: "Cada parcela deve ter pelo menos um centavo" });
  }).transform(value => ({ ...value, amount: value.entry_method === "installment" && value.installment_amount ? D(value.installment_amount).mul(value.installments).toFixed(2) : value.amount })) ,
  pay_invoice: z.object({ invoice_id: id, account_id: id, amount, date }),
  create_goal: schemas.savings_goals,
  savings_deposit: z.object({ goal_id: id, account_id: id, amount, date }),
  savings_withdraw: z.object({
    goal_id: id, account_id: id, amount: nonnegativeMoney, date,
    yield_amount: nonnegativeMoney.default("0"),
    ir_amount: nonnegativeMoney.default("0"),
    iof_amount: nonnegativeMoney.default("0"),
  }).refine(p => D(p.amount).plus(p.yield_amount).gt(0), "Informe principal ou rendimento para resgatar")
    .refine(p => D(p.ir_amount).plus(p.iof_amount).lte(p.yield_amount), "Os impostos não podem superar o rendimento confirmado"),
  reconcile_savings: schemas.savings_reconciliations.extend({ apply_adjustment: z.boolean().default(false) }),
  reconcile_account: z.object({ account_id: id, date, confirmed_balance: signedMoney, notes: optional, apply_adjustment: z.boolean().default(false) }),
  reconcile_invoice: z.object({ invoice_id: id, date, confirmed_balance: nonnegativeMoney, notes: optional }),
  pay_obligation: z.object({ obligation_id: id, account_id: id, date, principal_reduction: nonnegativeMoney.default("0") }),
  confirm_yield: z.object({ goal_id: id, amount, date }),

};
export const selects: Record<string, string> = {
  manual_asset_prices: "*,price::text",
  financial_liabilities: "*,amount::text",
  financial_obligations: "*,amount::text,principal_reduction::text",
  user_settings: "*",
  account_reconciliations: "*,confirmed_balance::text,registered_balance::text,difference::text",
  invoice_reconciliations: "*,confirmed_balance::text,registered_balance::text,difference::text",
  savings_reconciliations: "*,confirmed_balance::text",
  recurring_transactions: "*,amount::text",
  net_worth_snapshots: "*,assets::text,liabilities::text",
  tax_rules: "*,ir_rate::text",
  financial_accounts: "*,initial_balance::text",
  account_balances: "*,initial_balance::text,balance::text",
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
