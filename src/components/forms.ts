export type Field = {
  key: string;
  label: string;
  type?: string;
  options?: [string, string][];
  source?: string;
  default?: string;
  required?: boolean;
  min?: number;
  max?: number;
  help?: string;
};
export type FormDef = {
  title: string;
  editTitle?: string;
  resource?: string;
  action?: string;
  endpoint?: string;
  purchaseCalculator?: boolean;
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
  preferences: {
    title: "Preferências financeiras",
    editTitle: "Preferências financeiras",
    resource: "user_settings",
    fields: [
      {
        key: "emergency_months_target",
        label: "Meses de despesas essenciais para a reserva",
        type: "number",
        min: 1,
        max: 24,
        default: "6",
      },
    ],
  },
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
  obligation: {
    title: "Agendar compromisso",
    editTitle: "Editar compromisso",
    resource: "financial_obligations",
    fields: [
      name,
      amount,
      { key: "due_date", label: "Vencimento", type: "date" },
      category,
      {
        key: "liability_id",
        label: "Dívida relacionada",
        source: "liabilities",
        required: false,
      },
      {
        key: "status",
        label: "Status",
        options: [
          ["pending", "Pendente"],
          ["cancelled", "Cancelado"],
        ],
        default: "pending",
      },
    ],
  },
  payObligation: {
    title: "Confirmar pagamento do compromisso",
    editTitle: "Confirmar pagamento do compromisso",
    action: "pay_obligation",
    fields: [
      { key: "obligation_id", label: "Compromisso", source: "obligations" },
      account,
      date,
      {
        key: "principal_reduction",
        label: "Principal da dívida amortizado (R$)",
        type: "decimal",
        default: "0",
        help: "Informe somente a parcela que reduz o saldo devedor. Juros e tarifas não amortizam principal.",
      },
    ],
  },
  reconciliation: {
    title: "Registrar saldo oficial da caixinha",
    action: "reconcile_savings",
    fields: [
      { key: "goal_id", label: "Caixinha", source: "goals" },
      {
        key: "confirmed_balance",
        label: "Saldo informado pela instituição (R$)",
        type: "decimal",
      },
      date,
      { key: "notes", label: "Fonte / observações", required: false },
      {
        key: "apply_adjustment",
        label: "Aplicar diferença ao saldo confirmado",
        type: "checkbox",
        help: "Marque somente depois de conferir o extrato; a diferença ficará auditada.",
      },
    ],
  },
  recurring: {
    title: "Novo lançamento recorrente",
    editTitle: "Editar recorrência",
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
      { key: "next_date", label: "Data de início / próxima ocorrência", type: "date" },
      { key: "end_date", label: "Data de término (opcional)", type: "date", required: false, help: "Deixe em branco para continuar por tempo indeterminado." },
      {
        key: "anchor_day",
        label: "Dia preferido do mês",
        type: "number",
        min: 1,
        max: 31,
        required: false,
        help: "No mês mais curto, será usado o último dia. Não se aplica à frequência semanal.",
      },
      {
        key: "frequency",
        label: "Frequência",
        options: [
          ["monthly", "Mensal"],
          ["weekly", "Semanal"],
          ["annual", "Anual"],
        ],
      },
      {
        key: "active",
        label: "Recorrência ativa",
        type: "checkbox",
        default: "true",
      },
    ],
  },
  account: {
    title: "Nova conta",
    editTitle: "Editar conta",
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
    editTitle: "Editar categoria",
    resource: "categories",
    fields: [
      name,
      {
        key: "spending_kind",
        label: "Tipo de gasto",
        options: [
          ["essential", "Essencial"],
          ["optional", "Opcional"],
          ["unclassified", "Ainda não classificado"],
        ],
        default: "unclassified",
      },
      {
        key: "parent_id",
        label: "Categoria principal",
        source: "category_roots",
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
      { key: "to_account", label: "Destino", source: "accounts" },
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
      {
        key: "color",
        label: "Cor do cartão",
        type: "color",
        default: "#5B35D5",
      },
      { key: "institution", label: "Instituição", required: false },
      { key: "brand", label: "Bandeira", required: false },
      { key: "last_four", label: "Quatro últimos dígitos", type: "text" },
      { key: "credit_limit", label: "Limite (R$)", type: "decimal" },
      {
        key: "closing_day",
        label: "Dia de fechamento",
        type: "number",
        min: 1,
        max: 31,
        help: "Dias 29–31 usam o último dia nos meses mais curtos.",
      },
      {
        key: "due_day",
        label: "Dia de vencimento",
        type: "number",
        min: 1,
        max: 31,
      },
      account,
    ],
  },
  purchase: {
    title: "Registrar compra",
    editTitle: "Editar compra",
    action: "purchase",
    purchaseCalculator: true,
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
  installment: {
    title: "Editar parcela futura",
    editTitle: "Editar parcela futura",
    endpoint: "/api/installments",
    fields: [
      { key: "amount", label: "Valor da parcela (R$)", type: "decimal", help: "A alteração afeta somente esta parcela. Parcelas vencidas ou de faturas com pagamentos são preservadas." },
      { key: "notes", label: "Motivo da correção", required: false },
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
    title: "Nova caixinha", endpoint: "/api/manual-savings/create",
    fields: [name,{ key:"initial_balance", label:"Valor inicial já depositado (R$)", type:"decimal", default:"0" },
      { ...account, required:false, label:"Conta de origem (opcional)", help:"Selecione para transferir da conta. Sem conta, registra um saldo já depositado, sem descontar novamente do banco." },
      date, { key:"target", label:"Meta (R$)", type:"decimal" },
      { key:"target_date",label:"Data desejada",type:"date",required:false },
      { key:"institution",label:"Instituição",required:false },
      { key:"description",label:"Descrição",required:false },
      { key:"is_emergency_reserve",label:"Esta caixinha é reserva de emergência",type:"checkbox" }],
  },
  deposit: { title:"Depositar na caixinha", endpoint:"/api/manual-savings/deposit", fields:[{key:"goal_id",label:"Caixinha",source:"goals"},account,amount,date] },
  withdrawal: { title:"Retirar da caixinha", endpoint:"/api/manual-savings/withdraw",fields:[{key:"goal_id",label:"Caixinha",source:"goals"},{...account,label:"Conta de destino"},{...amount,label:"Valor total da retirada (R$)",help:"Informe o total que sai da caixinha. A conta recebe esse valor menos os impostos informados."},{key:"ir_amount",label:"IR retido (R$)",type:"decimal",default:"0"},{key:"iof_amount",label:"IOF retido (R$)",type:"decimal",default:"0",help:"Opcional: mantenha zero quando não houver impostos no resgate. Use somente valores confirmados."},date] },
  savingsBalance: { title:"Informar rendimento",editTitle:"Corrigir saldo mensal", endpoint:"/api/manual-savings/balance", fields:[{key:"goal_id",label:"Caixinha",source:"goals"},{key:"balance",label:"Saldo total atualizado da caixinha (R$)",type:"decimal",help:"Informe o saldo total, não apenas o lucro. Uma atualização por mês; um novo saldo no mesmo mês substitui o anterior com histórico de correção."},date] },
  budget: {
    title: "Novo orçamento",
    editTitle: "Editar orçamento",
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
    editTitle: "Editar meta",
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
  endpoint: undefined,
  fields: forms.goal.fields.filter(f=>!["initial_balance","account_id","date"].includes(f.key)),
  resource: "savings_goals",
  title: "Editar caixinha",
  editTitle: "Editar caixinha",
};

/** Use the same readable labels in forms, cards and reports. */
export function fieldOptionLabel(form: FormDef, field: string, value: string) {
  return form.fields.find(item => item.key === field)?.options?.find(([id]) => id === value)?.[1] || 'Não informado';
}
