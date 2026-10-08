export type Field = {
  key: string;
  label: string;
  type?: string;
  options?: [string, string][];
  source?: string;
  default?: string;
  required?: boolean;
};
export type FormDef = {
  title: string;
  editTitle?: string;
  resource?: string;
  action?: string;
  endpoint?: string;
  fields: Field[];
};
const name: Field = { key: "name", label: "Nome" },
  amount: Field = { key: "amount", label: "Valor (R$)", type: "decimal" },
  date: Field = { key: "date", label: "Data", type: "date" },
  account: Field = { key: "account_id", label: "Conta", source: "accounts" },
  category: Field = {
    key: "category_id",
    label: "Categoria",
    source: "categories",
    required: false,
  };
export const forms: Record<string, FormDef> = {
  liability: {
    title: "Dívida ou obrigação",
    resource: "financial_liabilities",
    fields: [
      name,
      amount,
      { key: "due_date", label: "Vencimento", type: "date", required: false },
      { key: "notes", label: "Observações", required: false },
    ],
  },
  reconciliation: {
    title: "Registrar saldo oficial da caixinha",
    resource: "savings_reconciliations",
    fields: [
      { key: "goal_id", label: "Caixinha", source: "goals" },
      {
        key: "confirmed_balance",
        label: "Saldo informado pela instituição (R$)",
        type: "decimal",
      },
      date,
      { key: "notes", label: "Fonte / observações", required: false },
    ],
  },
  recurring: {
    title: "Novo lançamento recorrente",
    resource: "recurring_transactions",
    fields: [
      { key: "description", label: "Descrição" },
      {
        key: "type",
        label: "Tipo",
        options: [
          ["expense", "Despesa"],
          ["income", "Receita"],
        ],
      },
      amount,
      account,
      category,
      { key: "next_date", label: "Próxima data", type: "date" },
      {
        key: "frequency",
        label: "Frequência",
        options: [
          ["monthly", "Mensal"],
          ["weekly", "Semanal"],
        ],
      },
    ],
  },
  account: {
    title: "Nova conta",
    resource: "financial_accounts",
    fields: [
      name,
      { key: "institution", label: "Instituição", required: false },
      {
        key: "kind",
        label: "Tipo",
        options: [
          ["bank", "Conta bancária"],
          ["cash", "Dinheiro"],
        ],
      },
      {
        key: "initial_balance",
        label: "Saldo inicial (R$)",
        type: "decimal",
        default: "0",
      },
      { key: "color", label: "Cor", type: "color", default: "#5B35D5" },
    ],
  },
  category: {
    title: "Nova categoria",
    resource: "categories",
    fields: [
      name,
      {
        key: "parent_id",
        label: "Categoria principal",
        source: "categories",
        required: false,
      },
      {
        key: "budget",
        label: "Limite mensal (R$)",
        type: "decimal",
        required: false,
      },
    ],
  },
  transaction: {
    title: "Novo lançamento",
    editTitle: "Editar lançamento",
    action: "transaction",
    fields: [
      { key: "description", label: "Descrição" },
      {
        key: "type",
        label: "Tipo",
        options: [
          ["expense", "Despesa"],
          ["income", "Receita"],
          ["yield", "Rendimento confirmado"],
          ["adjustment", "Ajuste positivo"],
        ],
      },
      amount,
      date,
      account,
      category,
      {
        key: "status",
        label: "Status",
        options: [
          ["confirmed", "Confirmado"],
          ["pending", "Pendente"],
        ],
      },
      { key: "notes", label: "Observações", required: false },
    ],
  },
  transfer: {
    title: "Transferir entre contas",
    action: "transfer",
    fields: [
      { key: "from_account", label: "Origem", source: "accounts" },
      { key: "to_account", label: "Destino", source: "all_accounts" },
      amount,
      date,
    ],
  },
  card: {
    title: "Novo cartão",
    editTitle: "Editar cartão",
    resource: "credit_cards",
    fields: [
      name,
      { key: "color", label: "Cor do cartão", type: "color", default: "#5B35D5" },
      { key: "institution", label: "Instituição", required: false },
      { key: "brand", label: "Bandeira", required: false },
      { key: "last_four", label: "Quatro últimos dígitos", type: "text" },
      { key: "credit_limit", label: "Limite (R$)", type: "decimal" },
      { key: "closing_day", label: "Dia de fechamento (1–28)", type: "number" },
      { key: "due_day", label: "Dia de vencimento (1–28)", type: "number" },
      account,
    ],
  },
  purchase: {
    title: "Registrar compra",
    editTitle: "Editar compra",
    action: "purchase",
    fields: [
      { key: "card_id", label: "Cartão", source: "cards" },
      { key: "description", label: "Descrição" },
      amount,
      date,
      {
        key: "installments",
        label: "Número de parcelas",
        type: "number",
        default: "1",
      },
      category,
    ],
  },
  invoice: {
    title: "Pagar fatura",
    editTitle: "Pagar fatura",
    action: "pay_invoice",
    fields: [
      { key: "invoice_id", label: "Fatura", source: "invoices" },
      account,
      amount,
      date,
    ],
  },
  goal: {
    title: "Nova caixinha",
    action: "create_goal",
    fields: [
      name,
      { key: "description", label: "Descrição", required: false },
      { key: "target", label: "Meta (R$)", type: "decimal" },
      {
        key: "target_date",
        label: "Data desejada",
        type: "date",
        required: false,
      },
      { key: "institution", label: "Instituição", required: false },
      {
        key: "indexer",
        label: "Remuneração",
        options: [
          ["cdi", "Percentual do CDI"],
          ["none", "Sem rendimento"],
          ["manual", "Rendimento manual"],
          ["fixed", "Prefixada (contrato necessário)"],
          ["selic", "Selic (contrato necessário)"],
        ],
      },
      {
        key: "percentage",
        label: "Percentual do CDI",
        type: "decimal",
        default: "100",
      },
      {
        key: "annual_rate",
        label: "Taxa prefixada anual (%)",
        type: "decimal",
        default: "0",
      },
      {
        key: "product",
        label: "Produto tributário",
        options: [
          ["custom", "Personalizado / ainda não informado"],
          ["cdb", "CDB"],
          ["rdb", "RDB"],
          ["treasury", "Tesouro"],
          ["fund", "Fundo"],
        ],
      },
      {
        key: "tax_exempt",
        label: "Produto isento de IR/IOF?",
        type: "checkbox",
      },
    ],
  },
  deposit: {
    title: "Aportar na caixinha",
    action: "savings_deposit",
    fields: [
      { key: "goal_id", label: "Caixinha", source: "goals" },
      account,
      amount,
      date,
    ],
  },
  withdrawal: {
    title: "Resgatar principal",
    action: "savings_withdraw",
    fields: [
      { key: "goal_id", label: "Caixinha", source: "goals" },
      account,
      amount,
      date,
    ],
  },
  confirmedYield: {
    title: "Conciliar rendimento recebido",
    action: "confirm_yield",
    fields: [
      { key: "goal_id", label: "Caixinha", source: "goals" },
      amount,
      date,
    ],
  },
  opening: {
    title: "Registrar posição inicial existente",
    resource: "investment_opening_positions",
    fields: [
      { key: "asset_id", label: "Ativo", source: "assets" },
      { key: "quantity", label: "Quantidade existente", type: "decimal" },
      { key: "cost", label: "Custo total de aquisição (R$)", type: "decimal" },
      date,
      { key: "notes", label: "Fonte / observações", required: false },
    ],
  },
  asset: {
    title: "Novo investimento",
    resource: "investment_assets",
    fields: [
      { key: "ticker", label: "Ticker ou identificador" },
      name,
      {
        key: "asset_class",
        label: "Classe",
        options: [
          ["stock", "Ações"],
          ["fii", "FIIs"],
          ["etf", "ETFs"],
          ["bdr", "BDRs"],
          ["fiagro", "FIAGROs"],
          ["fund", "Fundos tradicionais"],
          ["cdb", "CDB / RDB"],
          ["lci", "LCI"],
          ["lca", "LCA"],
          ["treasury", "Tesouro"],
          ["international", "Internacional"],
          ["custom", "Personalizado"],
        ],
      },
      { key: "currency", label: "Moeda", default: "BRL" },
      { key: "cnpj", label: "CNPJ do fundo", required: false },
      {
        key: "share_class",
        label: "ID da subclasse CVM (quando disponível)",
        required: false,
      },
      { key: "maturity", label: "Vencimento", type: "date", required: false },
    ],
  },
  investment: {
    title: "Registrar operação",
    action: "investment",
    fields: [
      { key: "asset_id", label: "Ativo", source: "assets" },
      account,
      {
        key: "type",
        label: "Operação",
        options: [
          ["buy", "Compra / aporte"],
          ["sell", "Venda / resgate"],
        ],
      },
      { key: "quantity", label: "Quantidade / cotas", type: "decimal" },
      { key: "price", label: "Preço / valor da cota (R$)", type: "decimal" },
      { key: "fees", label: "Taxas (R$)", type: "decimal", default: "0" },
      date,
      { key: "broker", label: "Corretora", required: false },
    ],
  },
  price: {
    title: "Informar preço manual",
    endpoint: "/api/prices",
    fields: [
      { key: "asset_id", label: "Ativo", source: "assets" },
      { key: "price", label: "Preço / cota", type: "decimal" },
      date,
    ],
  },
  corporate: {
    title: "Evento corporativo confirmado",
    resource: "investment_corporate_actions",
    fields: [
      { key: "asset_id", label: "Ativo", source: "assets" },
      {
        key: "type",
        label: "Evento",
        options: [
          ["split", "Desdobramento"],
          ["reverse_split", "Grupamento"],
          ["bonus", "Bonificação (fator total)"],
          ["ticker_change", "Mudança de ticker"],
        ],
      },
      {
        key: "ratio",
        label: "Fator de quantidade",
        type: "decimal",
        default: "1",
      },
      date,
      {
        key: "new_ticker",
        label: "Novo ticker (se aplicável)",
        required: false,
      },
    ],
  },
  dividend: {
    title: "Cadastrar provento anunciado",
    resource: "investment_income",
    fields: [
      { key: "asset_id", label: "Ativo", source: "assets" },
      { key: "description", label: "Descrição" },
      amount,
      date,
      {
        key: "type",
        label: "Tipo",
        options: [
          ["dividend", "Dividendo"],
          ["jcp", "JCP"],
          ["interest", "Juros"],
          ["amortization", "Amortização"],
        ],
      },
    ],
  },
  income: {
    title: "Confirmar recebimento",
    action: "confirm_income",
    fields: [
      { key: "income_id", label: "Provento anunciado", source: "income" },
      account,
      date,
    ],
  },
  budget: {
    title: "Novo orçamento",
    resource: "budgets",
    fields: [
      name,
      category,
      amount,
      { key: "month", label: "Mês (primeiro dia)", type: "date" },
    ],
  },
  financialGoal: {
    title: "Nova meta",
    resource: "financial_goals",
    fields: [
      name,
      {
        key: "kind",
        label: "Tipo",
        options: [
          ["savings", "Economia"],
          ["investment", "Investimentos"],
          ["net_worth", "Patrimônio líquido"],
        ],
      },
      { key: "target", label: "Meta (R$)", type: "decimal" },
      {
        key: "target_date",
        label: "Data desejada",
        type: "date",
        required: false,
      },
    ],
  },
};

forms.goalEdit = {
  ...forms.goal,
  action: undefined,
  resource: "savings_goals",
  title: "Editar caixinha",
};
