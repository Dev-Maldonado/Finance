"use client";
import { PurchaseHistory } from "./purchase-history";
import { ManualInvestments } from "./manual-investments";
import { financialTone, type FinancialTone } from "@/lib/financial-tone";
import { useEffect, useState, useMemo } from "react";
import { WealthRegistrationFeedback, type WealthFeedback } from "./wealth-registration-feedback";
import Link from "next/link";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  LayoutDashboard,
  Wallet,
  CreditCard,
  ArrowLeftRight,
  Tags,
  PiggyBank,
  ChartNoAxesCombined,
  Target,
  FileChartColumn,
  Settings,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  LogOut,
  Menu,
  RefreshCw,
  ArrowRight,
  Download,
  TrendingUp,
  ShieldCheck,
  CalendarDays,
  MoreHorizontal,
  ChevronDown,
  X,
  AlertTriangle,
} from "lucide-react";
import { Dashboard } from "./dashboard";
import { CDIStatus, type BenchmarkStatus } from "./cdi-status";
import { savingsMetrics } from "@/lib/savings-metrics";
import { Auth } from "./auth";
import { DeleteDialog, type RemovalKind } from "./delete-dialog";
import { FinancialPlanning } from "./financial-planning";
import { DataConfidence } from "./data-confidence";
import { ReconciliationPanel } from "./reconciliation-panel";
import { periodMetrics, budgetMetrics } from "@/lib/dashboard";
import { cardColors } from "@/lib/card-color";
import {
  cardInvoices,
  invoiceMonthLabel,
  invoiceTotals,
} from "@/lib/card-invoices";
import { InvoiceMonthPicker, MonthlyInvoices } from "./monthly-invoices";
import { browserDb } from "@/lib/supabase";
import { Snapshot, Row, rows, str, financialSummary } from "@/lib/summary";
import { portfolioPerformance } from "@/financial/portfolio-performance";
import { D, money, simulate } from "@/financial/engine";
import { forms, FormDef, fieldOptionLabel } from "./forms";
import { Dialog, post } from "./dialog";
import { WealthChart } from "./wealth-chart";
import { SavingsChart } from "./savings-chart";
import { savingsHistory } from "@/financial/savings-history";
import type { Lot, Movement, Rate } from "@/financial/engine";
import { FlowChart } from "./chart";
import { CategoryManagement } from "./category-management";
import { CategoryExpensesReport } from "./category-expenses-report";
import { CategoryPicker } from "./category-picker";
import { categoryMatches, categoryLabel, categoryOptions } from "@/lib/categories";
import { exportData, exportReportRows } from "./exports";
import { MobileNavigation } from "./mobile-navigation";
const nav = [
  ["dashboard", "Dashboard", LayoutDashboard],
  ["contas", "Contas e Saldos", Wallet],
  ["cartoes", "Cartões", CreditCard],
  ["transacoes", "Transações", ArrowLeftRight],
  ["categorias", "Categorias", Tags],
  ["caixinhas", "Caixinhas", PiggyBank],
  ["investimentos", "Investimentos", ChartNoAxesCombined],
  ["planejamento", "Planejamento", Target],
  ["relatorios", "Relatórios", FileChartColumn],
  ["configuracoes", "Configurações", Settings],
] as const;
const brl = (v: string | number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(v),
  );
const localDate = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(),
  );
const pretty = (v: string) =>
  v
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
        new Date(v + "T12:00:00Z"),
      )
    : "—";
function Empty({
  message = "Ainda não há dados por aqui.",
  action,
}: {
  message?: string;
  action?: () => void;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Wallet size={24} />
      </span>
      <h3>{message}</h3>
      <p>Comece com seus próprios registros. Cada passo traz mais clareza.</p>
      {action && (
        <button className="primary" onClick={action}>
          <Plus size={16} />
          Adicionar primeiro registro
        </button>
      )}
    </div>
  );
}
function Panel({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function Stat({
  label,
  value,
  icon: Icon,
  tone = "investment",
  detail,
}: {
  label: string;
  value: string;
  icon: typeof Wallet;
  tone?: FinancialTone;
  detail: string;
}) {
  return (
    <article className={`stat financial-surface ${financialTone(value, tone)}`}>
      <div>
        <span>{label}</span>
        <i className={tone}>
          <Icon size={18} />
        </i>
      </div>
      <strong>{brl(value)}</strong>
      <small>{detail}</small>
    </article>
  );
}
export function Finora(props: {
  section: string;
  configured: boolean;
  detail?: string;
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <Workspace {...props} />
    </QueryClientProvider>
  );
}
function Workspace({
  section,
  configured,
  detail,
}: {
  section: string;
  configured: boolean;
  detail?: string;
}) {
  const qc = useQueryClient();
  const [wealthSaving, setWealthSaving] = useState(false);
  const [wealthFeedback, setWealthFeedback] = useState<WealthFeedback | null>(null);
  const [removal, setRemoval] = useState<{
    kind: RemovalKind;
    row: Row;
  } | null>(null);
  const [showExcluded, setShowExcluded] = useState(false);
  const [selectedCard, setSelectedCard] = useState("");
  const [recurrenceWarning, setRecurrenceWarning] = useState("");
  const [txAccount, setTxAccount] = useState(""),
    [txCategory, setTxCategory] = useState(""),
    [txType, setTxType] = useState(""),
    [txStatus, setTxStatus] = useState("");
  const [invoiceMonth, setInvoiceMonth] = useState(localDate().slice(0, 7));
  useEffect(() => {
    const selected = new URLSearchParams(window.location.search).get("month");
    if (
      section === "cartoes" &&
      selected &&
      /^\d{4}-(0[1-9]|1[0-2])$/.test(selected)
    )
      setInvoiceMonth(selected);
  }, [section]);
  const [session, setSession] = useState<boolean | null>(null),
    [collapsed, setCollapsed] = useState(false),
    [mobile, setMobile] = useState(false),
    [modal, setModal] = useState<{ form: FormDef; initial?: Row } | null>(null),
    [notice, setNotice] = useState(""),
    [search, setSearch] = useState("");
  useEffect(() => {
    if (!mobile) return;
    const menu = document.getElementById("main-navigation");
    menu?.querySelector<HTMLAnchorElement>("nav a")?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if (event.key === "Escape") {
        setMobile(false);
      }
      if (event.key === "Tab") {
        const elements = [
          ...document.querySelectorAll<HTMLElement>(
            ".navigation-backdrop, #main-navigation a, #main-navigation button:not(:disabled)",
          ),
        ];
        if (event.shiftKey && document.activeElement === elements[0]) {
          event.preventDefault();
          elements.at(-1)?.focus();
        } else if (
          !event.shiftKey &&
          document.activeElement === elements.at(-1)
        ) {
          event.preventDefault();
          elements[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      setTimeout(() => document.getElementById("open-navigation")?.focus(), 0);
    };
  }, [mobile]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 761px)");
    const reset = () => {
      if (desktop.matches) setMobile(false);
    };
    desktop.addEventListener("change", reset);
    return () => desktop.removeEventListener("change", reset);
  }, []);
  const [chartMode, setChartMode] = useState("monthly");
  const [period, setPeriod] = useState("month"),
    [start, setStart] = useState(localDate().slice(0, 7) + "-01"),
    [end, setEnd] = useState(localDate());
  useEffect(() => {
    if (!configured) {
      setSession(false);
      return;
    }
    const db = browserDb();
    db.auth.getSession().then(({ data }) => setSession(Boolean(data.session)));
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange((_event, s) => {
      setSession(Boolean(s));
      if (!s || _event === "SIGNED_IN") qc.clear();
    });
    return () => subscription.unsubscribe();
  }, [configured, qc]);
  const query = useQuery<Snapshot>({
    queryKey: ["snapshot"],
    refetchInterval: 5 * 60 * 1000,
    enabled: session === true,
    queryFn: async () => {
      // Due recurring entries are pending and idempotent; confirmed cash is unchanged.
      try {
        await post("/api/recurring", {});
        setRecurrenceWarning("");
      } catch {
        setRecurrenceWarning("Não foi possível gerar as recorrências agora. Seus registros continuam disponíveis; tente novamente em Lançamentos recorrentes.");
      }
      const res = await fetch("/api/snapshot");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
  });
  const snapshot = query.data;
  const benchmarkQuery = useQuery<BenchmarkStatus>({
    queryKey: ["benchmarks"],
    enabled:
      session === true &&
      !!snapshot &&
      rows(snapshot, "savings_lots").some((l) =>
        ["cdi", "selic", "fixed"].includes(str(l, "indexer")),
      ),
    staleTime: 4 * 60 * 60 * 1000,
    refetchInterval: 4 * 60 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      try {
        const response = await fetch("/api/benchmarks", { method: "POST" });
        const data = (await response.json()) as BenchmarkStatus;
        if (data.results?.some((r) => r.status === "success"))
          void qc.invalidateQueries({ queryKey: ["snapshot"] });
        return data;
      } catch {
        return {
          error:
            "Não foi possível verificar o CDI. Último histórico preservado.",
        };
      }
    },
  });
  const today = localDate();
  const goalYieldMetrics = useMemo(
    () => (snapshot ? savingsMetrics(snapshot, today) : null),
    [snapshot, today],
  );
  const allInvoices = useMemo(
    () => (snapshot ? cardInvoices(snapshot, today) : []),
    [snapshot, today],
  );
  const performance = useMemo(
    () => (snapshot ? portfolioPerformance(snapshot, start, end) : null),
    [snapshot, start, end],
  );
  const summary = useMemo(
    () => (snapshot ? financialSummary(snapshot, start, end, today) : null),
    [snapshot, start, end, today],
  );
  const periodSummary = useMemo(
    () =>
      snapshot
        ? periodMetrics(
            snapshot,
            start,
            end,
            ["month", "previous"].includes(period),
            today,
          )
        : null,
    [snapshot, start, end, period, today],
  );
  const periodExpenses = useMemo<Row[]>(
    () =>
      periodSummary
        ? [
            ...periodSummary.tx
              .filter((t) => t.type === "expense")
              .map((t) => ({
                ...t,
                amount: D(str(t, "amount")).abs().toFixed(2),
                origin: "Conta",
                kind: "Despesa",
              })),
            ...periodSummary.installments.map((t) => ({
              ...t,
              amount: str(t, "amount"),
              origin: "Cartão",
              kind: `Parcela ${str(t, "number")}/${str(t, "installments")}`,
            })),
          ]
        : [],
    [periodSummary],
  );
  const open = (key: string, initial?: Row) =>
    setModal({ form: forms[key], initial });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["snapshot"] });
  };
  async function saveWealth() {
    if (wealthSaving || !snapshot) return;
    setWealthSaving(true);
    setWealthFeedback(null);
    setNotice("");
    try {
      const alreadyRegistered = rows(snapshot, "net_worth_snapshots").some(row => str(row, "date") === today);
      const result = await post("/api/snapshot", {});
      const position = result.position;
      const outsidePeriod = position.date < start || position.date > end;
      if (outsidePeriod) changePeriod("month");
      setWealthFeedback({
        kind: "success",
        message: alreadyRegistered ? "Posição patrimonial de hoje atualizada." : "Posição patrimonial de hoje registrada.",
        detail: `${pretty(position.date)} · Patrimônio líquido: ${brl(D(position.assets).minus(position.liabilities).toFixed(2))}. ${outsidePeriod ? "O período foi ajustado para o mês atual para mostrar o registro." : "Salvar novamente hoje atualiza este registro, sem duplicar o histórico."}`,
      });
      await qc.invalidateQueries({ queryKey: ["snapshot"] });
    } catch (error) {
      setWealthFeedback({ kind: "error", message: "Não foi possível registrar a posição.", detail: error instanceof Error ? error.message : String(error) });
    } finally {
      setWealthSaving(false);
    }
  }
  function changePeriod(value: string) {
    setPeriod(value);
    const today = localDate(),
      date = new Date(today + "T12:00:00Z");
    setEnd(today);
    if (value === "month") setStart(today.slice(0, 7) + "-01");
    if (value === "year") setStart(today.slice(0, 4) + "-01-01");
    if (value === "previous") {
      const prev = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 0),
      );
      setEnd(prev.toISOString().slice(0, 10));
      setStart(prev.toISOString().slice(0, 7) + "-01");
    }
    if (value === "7" || value === "30") {
      date.setUTCDate(date.getUTCDate() - (Number(value) - 1));
      setStart(date.toISOString().slice(0, 10));
    }
  }
  if (!configured)
    return (
      <main className="setup">
        <span className="brand">
          f<span>FINORA</span>
        </span>
        <h1>Seu espaço financeiro está quase pronto.</h1>
        <p>
          Configure a conexão com o Supabase para habilitar autenticação e dados
          persistentes. As instruções estão no README do projeto.
        </p>
        <p className="notice">
          Nenhum dado fictício será apresentado como seu patrimônio.
        </p>
      </main>
    );
  if (session === null)
    return <main className="loading">Preparando seu espaço…</main>;
  if (!session)
    return (
      <Auth
        onLogin={() => {
          setSession(true);
          refresh();
        }}
      />
    );
  const current = nav.find((n) => n[0] === section) ?? nav[0];
  const controls: Record<string, [string, string][]> = {
    dashboard: [["transaction", "Novo lançamento"]],
    contas: [
      ["transfer", "Transferir"],
      ["account", "Nova conta"],
    ],
    cartoes: [
      ["purchase", "Registrar compra"],
      ["invoice", "Pagar fatura"],
      ["card", "Novo cartão"],
    ],
    transacoes: [
      ["recurring", "Recorrência"],
      ["transfer", "Transferir"],
      ["transaction", "Novo lançamento"],
    ],
    categorias: [["category", "Nova categoria"]],
    caixinhas: [
      ["deposit", "Aportar"],
      ["withdrawal", "Resgatar"],
      ["goal", "Nova caixinha"],
    ],
    investimentos: [],
    planejamento: [
      ["obligation", "Agendar compromisso"],
      ["liability", "Dívida / obrigação"],
      ["budget", "Novo orçamento"],
      ["financialGoal", "Nova meta"],
    ],
    relatorios: [],
    configuracoes: [],
  };
  const filteredTx = snapshot
    ? rows(snapshot, "transactions")
        .filter(
          (r) =>
            str(r, "date") >= start &&
            (r.status !== "cancelled" ||
              (section === "transacoes" && (showExcluded || txStatus === "cancelled"))) &&
            str(r, "date") <= end &&
            str(r, "description")
              .toLowerCase()
              .includes(search.toLowerCase()) &&
            (!txAccount || r.account_id === txAccount) &&
            (!txCategory ||
              categoryMatches(rows(snapshot, "categories"), str(r, "category_id"), txCategory)) &&
            (!txType || r.type === txType) &&
            (!txStatus || r.status === txStatus),
        )
        .sort((a, b) => str(b, "date").localeCompare(str(a, "date")))
    : [];
  const sum = (list: Row[], key: string) =>
    list.reduce((a, r) => a.plus(str(r, key) || 0), D(0));
  const flowData = periodSummary
    ? (() => {
        const byMonth =
          chartMode === "annual" ||
          (Date.parse(end) - Date.parse(start)) / 86400000 > 366;
        const events = [
          ...periodSummary.tx.filter((t) =>
            ["income", "expense", "yield"].includes(str(t, "type")),
          ),
          ...periodSummary.installments.map((t) => ({ ...t, type: "expense" })),
        ];
        const buckets = new Map<
          string,
          {
            income: ReturnType<typeof D>;
            expense: ReturnType<typeof D>;
            yield: ReturnType<typeof D>;
          }
        >();
        for (const event of events) {
          const key = str(event, "date").slice(0, byMonth ? 7 : 10);
          const row = buckets.get(key) ?? {
            income: D(0),
            expense: D(0),
            yield: D(0),
          };
          const field =
            event.type === "income"
              ? "income"
              : event.type === "yield"
                ? "yield"
                : "expense";
          row[field] = row[field].plus(D(str(event, "amount")).abs());
          buckets.set(key, row);
        }
        return [...buckets.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, r]) => ({
            name: byMonth
              ? key.split("-").reverse().join("/")
              : key.slice(5).split("-").reverse().join("/"),
            income: r.income.toNumber(),
            expense: r.expense.toNumber(),
            yield: r.yield.toNumber(),
          }));
      })()
    : [];
  function transactionTable(list: Row[]) {
    return list.length ? (
      <div className="table-wrap transaction-list">
        <table>
          <thead>
            <tr>
              <th>Descrição</th>
              <th>Categoria</th>
              <th>Conta</th>
              <th>Data</th>
              <th>Status</th>
              <th className="right">Valor</th>
              <th className="transaction-actions">Ações</th>
            </tr>
          </thead>
          <tbody>
            {list.map((t) => (
              <tr key={str(t, "id")}>
                <td>
                  <span
                    className={`transaction-icon ${D(str(t, "amount")).lt(0) ? "out" : "in"}`}
                  >
                    {D(str(t, "amount")).lt(0) ? (
                      <ArrowUpRight size={17} />
                    ) : (
                      <ArrowDownLeft size={17} />
                    )}
                  </span>
                  <span>
                    <strong>{str(t, "description")}</strong>
                    <small>
                      {
                        (
                          {
                            income: "Receita",
                            expense: "Despesa",
                            transfer: "Transferência",
                            invoice_payment: "Pagamento de fatura",
                            investment: "Investimento",
                            yield: "Rendimento",
                            adjustment: "Ajuste",
                          } as Record<string, string>
                        )[str(t, "type")]
                      }
                    </small>
                    {t.type === "income" && t.status === "pending" && str(t, "date") < today && (
                      <small className="pending-receipt-warning" title="A data prevista passou. Edite o lançamento para confirmar o recebimento ou corrigir a data.">
                        <AlertTriangle size={13} aria-hidden="true" /> Recebimento em atraso
                      </small>
                    )}
                  </span>
                </td>
                <td data-label="Categoria">
                  {snapshot ? categoryLabel(rows(snapshot, "categories"), str(t, "category_id"), " / ") : "—"}
                </td>
                <td data-label="Conta">
                  {(snapshot &&
                    rows(snapshot, "financial_accounts").find(
                      (c) => c.id === t.account_id,
                    )?.name) ||
                    "—"}
                </td>
                <td data-label="Data">{pretty(str(t, "date"))}</td>
                <td data-label="Status">
                  <span
                    className={`badge ${t.status === "confirmed" ? "green" : ""}`}
                  >
                    {t.status === "confirmed"
                      ? "Confirmado"
                      : t.status === "cancelled"
                        ? "Excluído"
                        : "Pendente"}
                  </span>
                </td>
                <td data-label="Valor"
                  className={`right amount ${D(str(t, "amount")).lt(0) ? "negative" : "positive"}`}
                >
                  {brl(str(t, "amount"))}
                </td>
                <td className="transaction-actions">
                  {["income", "expense", "yield", "adjustment"].includes(
                    str(t, "type"),
                  ) &&
                    !t.group_id &&
                    t.status !== "cancelled" && (
                      <div className="actions">
                        <button
                          onClick={() =>
                            setModal({
                              form: {
                                ...forms.transaction,
                                action: undefined,
                                endpoint: "/api/transactions",
                              },
                              initial: {
                                ...t,
                                amount: D(str(t, "amount")).abs().toFixed(2),
                              },
                            })
                          }
                        >
                          Editar
                        </button>
                        <button
                          onClick={() =>
                            setRemoval({ kind: "transaction", row: t })
                          }
                        >
                          Excluir
                        </button>
                      </div>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <Empty action={() => open("transaction")} />
    );
  }
  return (
    <div className={`workspace ${collapsed ? "collapsed" : ""}`}>
      {mobile && (
        <button
          className="navigation-backdrop"
          aria-label="Fechar menu"
          onClick={() => {
            setMobile(false);
            document.getElementById("open-navigation")?.focus();
          }}
        />
      )}
      <MobileNavigation items={nav} current={current[0]} email={snapshot?.user.email} refreshing={query.isFetching} onRefresh={() => { void refresh(); }} onLogout={async () => { await browserDb().auth.signOut(); setSession(false); qc.clear(); }} />
      <aside
        id="main-navigation"
        aria-label="Menu principal"
        className={`sidebar ${mobile ? "visible" : ""}`}
      >
        <Link href="/" className="brand">
          f
          {!collapsed && (
            <>
              <span>FINORA</span>
              <small>2.0</small>
            </>
          )}
        </Link>
        <span className="nav-label">SEU ESPAÇO FINANCEIRO</span>
        <nav>
          {nav.map(([path, label, Icon]) => (
            <Link
              key={path}
              href={path === "dashboard" ? "/" : `/${path}`}
              className={current[0] === path ? "active" : ""}
              onClick={() => setMobile(false)}
              title={label}
            >
              <Icon size={20} />
              {!collapsed && <span>{label}</span>}
              {!collapsed && path === "caixinhas" && (
                <small className="new">CDI</small>
              )}
            </Link>
          ))}
        </nav>
        {!collapsed && (
          <div className="sidebar-note">
            <span>
              <ShieldCheck size={22} />
            </span>
            <strong>Mais clareza, mais liberdade.</strong>
            <p>Seu futuro começa nas escolhas de hoje.</p>
          </div>
        )}
        <button
          className="collapse"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <ChevronRight size={18} />
          ) : (
            <>
              <ChevronLeft size={18} />
              Recolher menu
            </>
          )}
        </button>
        <div className="profile">
          <span className="avatar">
            {snapshot?.user.email?.slice(0, 1).toUpperCase() || "F"}
          </span>
          {!collapsed && (
            <div>
              <strong>Minha conta</strong>
              <small>{snapshot?.user.email}</small>
            </div>
          )}
          <button
            aria-label="Sair"
            onClick={async () => {
              await browserDb().auth.signOut();
              setSession(false);
              qc.clear();
            }}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="main" inert={mobile ? true : undefined}>
        <header className="topbar">
          <div>
            <button
              className="mobile-menu icon-button"
              onClick={() => setMobile(!mobile)}
              id="open-navigation"
              aria-label={mobile ? "Fechar menu" : "Abrir menu"}
              aria-expanded={mobile}
              aria-controls="main-navigation"
            >
              <Menu />
            </button>
            <span className="breadcrumb">
              Meu espaço <ChevronRight size={13} />{" "}
              <strong>{current[1]}</strong>
            </span>
          </div>
          <div className="top-actions">
            <span className="private">
              <ShieldCheck size={14} />
              Ambiente privado
            </span>
            <button
              className="icon-button"
              onClick={refresh}
              disabled={query.isFetching}
              aria-busy={query.isFetching}
              aria-label={query.isFetching ? "Atualizando dados" : "Atualizar dados"}
            >
              <RefreshCw size={18} />
            </button>
            <span className="avatar small">
              {snapshot?.user.email?.slice(0, 1).toUpperCase() || "F"}
            </span>
          </div>
        </header>
        <main className="content">
          <div className="page-head">
            <div>
              <span className="eyebrow">
                {current[0] === "dashboard"
                  ? "SEU DINHEIRO, COM CLAREZA"
                  : "FINORA / " + current[1].toUpperCase()}
              </span>
              <h1>
                {current[0] === "dashboard"
                  ? "Seu panorama financeiro"
                  : current[1]}
              </h1>
              <p>
                {current[0] === "dashboard"
                  ? "Tudo o que importa para cuidar do seu presente e construir seu futuro."
                  : "Organize, acompanhe e decida com informações transparentes."}
              </p>
            </div>
            <div className="actions">
              {(controls[current[0]] ?? []).map(([key, label], i, all) => (
                <button
                  key={key}
                  className={i === all.length - 1 ? "primary" : ""}
                  onClick={() => open(key)}
                >
                  <Plus size={16} />
                  {label}
                </button>
              ))}
            </div>
          </div>
          {!["cartoes", "investimentos"].includes(current[0]) && (
            <div className="period-bar">
              <div className="period-tabs">
                {[
                  ["month", "Este mês"],
                  ["previous", "Mês anterior"],
                  ["7", "7 dias"],
                  ["30", "30 dias"],
                  ["year", "Este ano"],
                  ["custom", "Personalizado"],
                ].map(([v, l]) => (
                  <button
                    key={v}
                    className={period === v ? "selected" : ""}
                    onClick={() => changePeriod(v)}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <div className="date-range">
                <CalendarDays size={15} />
                {period === "custom" ? (
                  <>
                    <input
                      aria-label="Data inicial"
                      type="date"
                      value={start}
                      onChange={(e) => {
                        if (e.target.value) {
                          setStart(e.target.value);
                          if (e.target.value > end) setEnd(e.target.value);
                        }
                      }}
                    />
                    <span>—</span>
                    <input
                      aria-label="Data final"
                      type="date"
                      value={end}
                      min={start}
                      onChange={(e) => {
                        if (e.target.value && e.target.value >= start) setEnd(e.target.value);
                      }}
                    />
                  </>
                ) : (
                  <span>
                    {pretty(start)} — {pretty(end)}
                  </span>
                )}
              </div>
            </div>
          )}
          {notice && (
            <div role="status" className="notice dismissible-notice"><span>{notice}</span><button className="icon-button" aria-label="Fechar aviso" onClick={() => setNotice("")}><X size={16} /></button></div>
          )}
          {recurrenceWarning && <p className="error" role="alert">{recurrenceWarning}</p>}
          {query.isPending && <p className="loading" role="status">Carregando seus dados…</p>}
          {query.error && (
            <div className="error" role="alert">
              {query.error.message}
              <button onClick={refresh}>Tentar novamente</button>
            </div>
          )}
          {snapshot && summary && (
            <>
              {current[0] === "dashboard" && (
                <Dashboard
                  snapshot={snapshot}
                  summary={summary}
                  start={start}
                  end={end}
                  period={period}
                  today={today}
                  benchmarkStatus={benchmarkQuery.data}
                  updatingCDI={benchmarkQuery.isFetching}
                  onRefreshCDI={() => {
                    void benchmarkQuery.refetch();
                  }}
                  onPay={(invoice) =>
                    setModal({
                      form: forms.invoice,
                      initial: {
                        invoice_id: invoice.id,
                        account_id: invoice.accountId,
                        amount: invoice.pending,
                        date: today,
                      },
                    })
                  }
                  onSaveWealth={saveWealth}
                  wealthSaving={wealthSaving}
                  wealthFeedback={wealthFeedback}
                />
              )}
              {current[0] === "contas" && (
                <div className="cards-grid">
                  {rows(snapshot, "account_balances")
                    .filter((a) => a.kind !== "savings")
                    .map((a) => (
                      <Panel
                        key={str(a, "id")}
                        title={str(a, "name")}
                        subtitle={str(a, "institution")}
                        action={
                          <button
                            className="icon-button"
                            aria-label={`Editar ${a.name}`}
                            onClick={() => open("account", a)}
                          >
                            <MoreHorizontal size={20} />
                          </button>
                        }
                      >
                        <div
                          className={`account-balance financial-surface ${financialTone(str(a, "balance"), "balance")}`}
                          style={{ borderColor: str(a, "color") }}
                        >
                          <Wallet />
                          <span>Saldo calculado</span>
                          <strong>{brl(str(a, "balance"))}</strong>
                        </div>
                        <span className="badge">
                          {a.archived ? "Arquivada" : "Ativa"}
                        </span>
                        <button
                          className="text-link"
                          onClick={async () => {
                            try {
                              await post("/api/data/financial_accounts", {
                                id: a.id,
                                data: {
                                  name: a.name,
                                  institution: a.institution,
                                  kind: a.kind,
                                  initial_balance: a.initial_balance,
                                  archived: !a.archived,
                                },
                              });
                              refresh();
                            } catch (e) {
                              setNotice(String(e));
                            }
                          }}
                        >
                          {a.archived ? "Reativar" : "Arquivar"}
                        </button>
                      </Panel>
                    ))}
                  {!rows(snapshot, "financial_accounts").length && (
                    <Empty action={() => open("account")} />
                  )}
                </div>
              )}
              {current[0] === "transacoes" && (
                <>
                  <label className="excluded-toggle">
                    <input
                      type="checkbox"
                      checked={showExcluded}
                      onChange={(e) => { setShowExcluded(e.target.checked); if (!e.target.checked && txStatus === "cancelled") setTxStatus(""); }}
                    />
                    Mostrar lançamentos excluídos
                  </label>
                  <Panel
                    title="Histórico de transações"
                    subtitle="Transferências e pagamentos são exibidos sem duplicar despesas."
                    action={
                      <div className="actions">
                        <label className="search">
                          <Search size={16} />
                          <input
                            placeholder="Buscar descrição"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                          />
                        </label>
                        <button onClick={() => exportData(filteredTx, "csv")}>
                          <Download size={16} />
                          CSV
                        </button>
                      </div>
                    }
                  >
                    <div
                      className="transaction-filters"
                      aria-label="Filtrar transações"
                    >
                      <label>
                        Conta
                        <select
                          aria-label="Filtrar transações por conta"
                          value={txAccount}
                          onChange={(e) => setTxAccount(e.target.value)}
                        >
                          <option value="">Todas</option>
                          {rows(snapshot, "financial_accounts").map((a) => (
                            <option key={str(a, "id")} value={str(a, "id")}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Categoria
                        <select
                          aria-label="Filtrar transações por categoria"
                          value={txCategory}
                          onChange={(e) => setTxCategory(e.target.value)}
                        >
                          <option value="">Todas</option>
                          <option value="uncategorized">Sem categoria</option>
                          {categoryOptions(rows(snapshot, "categories"), true).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                        </select>
                      </label>
                      <label>
                        Tipo
                        <select
                          aria-label="Filtrar transações por tipo"
                          value={txType}
                          onChange={(e) => setTxType(e.target.value)}
                        >
                          <option value="">Todos</option>
                          <option value="income">Receita</option>
                          <option value="expense">Despesa</option>
                          <option value="yield">Rendimento</option>
                          <option value="invoice_payment">
                            Pagamento de fatura
                          </option>
                          <option value="transfer">Transferência</option>
                          <option value="investment">Investimento</option>
                          <option value="adjustment">Ajuste</option>
                        </select>
                      </label>
                      <label>
                        Status
                        <select
                          aria-label="Filtrar transações por status"
                          value={txStatus}
                          onChange={(e) => { setTxStatus(e.target.value); if (e.target.value === "cancelled") setShowExcluded(true); }}
                        >
                          <option value="">Todos</option>
                          <option value="confirmed">Confirmado</option>
                          <option value="pending">Pendente</option>
                          <option value="cancelled">Excluído</option>
                        </select>
                      </label>
                      <button
                        onClick={() => {
                          setSearch("");
                          setTxAccount("");
                          setTxCategory("");
                          setTxType("");
                          setTxStatus("");
                          setShowExcluded(false);
                        }}
                      >
                        Limpar filtros
                      </button>
                    </div>
                    {transactionTable(filteredTx)}
                  </Panel>
                  <Panel
                    title="Lançamentos recorrentes"
                    subtitle="Ocorrências até hoje são geradas automaticamente como pendentes. Meses futuros ficam separados na projeção; o saldo muda somente na confirmação."
                    action={
                      <button
                        onClick={async () => {
                          try {
                            const r = await post("/api/recurring", {});
                            setNotice(`${r.generated} ocorrências geradas.`);
                            refresh();
                          } catch (e) {
                            setNotice(String(e));
                          }
                        }}
                      >
                        Gerar até hoje
                      </button>
                    }
                  >
                    {rows(snapshot, "recurring_transactions").map((r) => (
                      <div
                        className="list-row recurrence-row"
                        key={str(r, "id")}
                      >
                        <div>
                          <strong>{r.description}</strong><small>{categoryLabel(rows(snapshot, "categories"), str(r, "category_id"), " / ")}</small>
                          <small>
                            {r.frequency === "monthly"
                              ? `Mensal · dia ${str(r, "anchor_day") || str(r, "next_date").slice(8)}`
                              : r.frequency === "annual" ? "Anual" : "Semanal"}{" "}
                            · próxima {pretty(str(r, "next_date"))}
                            {r.start_date && ` · início ${pretty(str(r, "start_date"))}`}
                            {r.end_date && ` · término ${pretty(str(r, "end_date"))}`}
                          </small>
                        </div>
                        <span className={`badge ${r.active && !r.cancelled_at && !(r.end_date && str(r, "next_date") > str(r, "end_date")) ? "green" : ""}`}>
                          {r.cancelled_at || (r.end_date && str(r, "next_date") > str(r, "end_date"))
                            ? "Encerrada"
                            : r.active
                              ? "Ativa"
                              : "Pausada"}
                        </span>
                        <strong>{brl(str(r, "amount"))}</strong>
                        {!r.cancelled_at && !(r.end_date && str(r, "next_date") > str(r, "end_date")) && (
                          <div className="actions">
                            <button onClick={() => open("recurring", r)}>
                              Editar
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  await post(
                                    "/api/recurring",
                                    {
                                      recurrence_id: r.id,
                                      replacement: {
                                        ...r,
                                        active: !r.active,
                                      },
                                    },
                                  );
                                  refresh();
                                  setNotice(
                                    r.active
                                      ? "Recorrência pausada; lançamentos já gerados permanecem para conferência."
                                      : "Recorrência retomada a partir da próxima ocorrência; períodos pausados não serão gerados retroativamente.",
                                  );
                                } catch (e) {
                                  setNotice(
                                    e instanceof Error
                                      ? e.message
                                      : "Falha ao atualizar recorrência.",
                                  );
                                }
                              }}
                            >
                              {r.active ? "Pausar" : "Retomar"}
                            </button>
                            <button
                              onClick={() =>
                                setRemoval({ kind: "recurring", row: r })
                              }
                            >
                              Encerrar
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                    {!rows(snapshot, "recurring_transactions").length && (
                      <p className="notice">
                        Cadastre despesas e receitas fixas. Novas ocorrências
                        ficam pendentes até sua conferência.
                      </p>
                    )}
                  </Panel>
                  <ImportPanel snapshot={snapshot} onSaved={refresh} />
                </>
              )}
              {current[0] === "categorias" && (
                <>
                  <p className="notice">Gastos confirmados nas contas e parcelas por vencimento. Categorias essenciais ajudam a calcular sua reserva de emergência.</p>
                  <CategoryManagement snapshot={snapshot} expenses={periodExpenses} onEdit={(row) => open("category", row)} onRemove={(row) => setRemoval({ kind: "category", row })} />
                </>
              )}
              {current[0] === "cartoes" && (
                <>
                  <div className="invoice-month-toolbar">
                    <div>
                      <h2>Faturas por mês</h2>
                      <p>
                        Valores pelo mês de vencimento, separados do total
                        comprometido.
                      </p>
                    </div>
                    <InvoiceMonthPicker
                      month={invoiceMonth}
                      today={today}
                      onChange={setInvoiceMonth}
                    />
                  </div>
                  <div className="cards-grid">
                    {rows(snapshot, "credit_cards").filter(c => !selectedCard || c.id === selectedCard).map((c) => (
                      <Panel
                        key={str(c, "id")}
                        title={str(c, "name")}
                        subtitle="Limite, compras e compromissos futuros"
                        action={
                          <button onClick={() => open("card", c)}>
                            Editar
                          </button>
                        }
                      >
                        {renderCard(c)}
                      </Panel>
                    ))}
                    {!rows(snapshot, "credit_cards").length && (
                      <Empty action={() => open("card")} />
                    )}
                  </div>
                  <Panel
                    title={`Faturas de ${invoiceMonthLabel(invoiceMonth)}`}
                    subtitle="Total, pagamentos e saldo de cada cartão no mês selecionado"
                  >
                    <MonthlyInvoices
                      snapshot={snapshot}
                      month={invoiceMonth}
                      today={today}
                      onMonthChange={setInvoiceMonth}
                      cardId={selectedCard}
                      onCardChange={setSelectedCard}
                      onEditInstallment={(part) => setModal({ form: forms.installment, initial: part })}
                      onPay={(invoice) =>
                        setModal({
                          form: forms.invoice,
                          initial: {
                            invoice_id: invoice.id,
                            account_id: invoice.accountId,
                            amount: invoice.pending,
                            date: today,
                          },
                        })
                      }
                    />
                  </Panel>
                  <PurchaseHistory snapshot={snapshot} month={invoiceMonth} today={today} cardId={selectedCard} onCardChange={setSelectedCard}
                    onEdit={p => setModal({ form: { ...forms.purchase, action: undefined, endpoint: "/api/purchases" }, initial: p })}
                    onRemove={p => setRemoval({ kind: "purchase", row: p })} />
                </>
              )}
              {current[0] === "caixinhas" && (
                <>
                  <div className="banner">
                    <PiggyBank size={34} />
                    <div>
                      <h2>Um lugar para cada sonho.</h2>
                      <p>
                        CDI histórico oficial, aportes por lote e estimativas
                        identificadas.
                      </p>
                    </div>
                    <button onClick={() => open("reconciliation")}>
                      Saldo oficial
                    </button>
                    <button onClick={() => open("confirmedYield")}>
                      Conciliar rendimento
                    </button>
                  </div>
                  <CDIStatus
                    snapshot={snapshot}
                    today={today}
                    status={benchmarkQuery.data}
                    updating={benchmarkQuery.isFetching}
                    onRefresh={() => {
                      void benchmarkQuery.refetch();
                    }}
                  />
                  <div className="cards-grid">
                    {summary.goals
                      .filter((g) => !detail || g.goal.id === detail)
                      .map((g) => (
                        <Panel
                          key={str(g.goal, "id")}
                          title={str(g.goal, "name")}
                          subtitle={
                            str(g.goal, "institution") || "Reserva pessoal"
                          }
                          action={
                            <button onClick={() => open("goalEdit", g.goal)}>
                              Editar condições futuras
                            </button>
                          }
                        >
                          {renderGoal(g, true)}
                          <Link
                            className="text-link"
                            href={
                              detail ? "/caixinhas" : `/caixinhas/${g.goal.id}`
                            }
                          >
                            {detail
                              ? "Voltar para todas"
                              : "Ver evolução e aplicações"}{" "}
                            <ArrowRight size={14} />
                          </Link>
                          {detail && (
                            <SavingsChart
                              data={savingsHistory(
                                rows(snapshot, "savings_lots").filter(
                                  (l) => l.goal_id === g.goal.id,
                                ) as unknown as Lot[],
                                rows(snapshot, "benchmark_rates").filter(
                                  (r) => r.validated !== false,
                                ) as unknown as Rate[],
                                rows(snapshot, "savings_movements").filter(
                                  (m) => m.goal_id === g.goal.id,
                                ) as unknown as Movement[],
                                end,
                              ).map((r) => ({
                                ...r,
                                principal: Number(r.principal),
                                yield: Number(r.yield),
                              }))}
                            />
                          )}
                        </Panel>
                      ))}
                    {!summary.goals.length && (
                      <Empty action={() => open("goal")} />
                    )}
                  </div>
                  <Simulator />
                  <Panel
                    title="Aportes e resgates"
                    subtitle="Histórico preservado por aplicação"
                  >
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Caixinha</th>
                            <th>Movimento</th>
                            <th>Data</th>
                            <th>Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows(snapshot, "savings_movements")
                            .filter(
                              (m) =>
                                (!detail || m.goal_id === detail) &&
                                str(m, "date") >= start &&
                                str(m, "date") <= end,
                            )
                            .sort((a, b) =>
                              str(b, "date").localeCompare(str(a, "date")),
                            )
                            .map((m) => (
                              <tr key={str(m, "id")}>
                                <td>
                                  {
                                    rows(snapshot, "savings_goals").find(
                                      (g) => g.id === m.goal_id,
                                    )?.name
                                  }
                                </td>
                                <td>
                                  {(
                                    {
                                      deposit: "Aporte",
                                      withdrawal: "Resgate de principal",
                                      withdrawn_yield: "Rendimento resgatado",
                                      withholding_tax: "Imposto retido",
                                      confirmed_yield: "Rendimento conciliado",
                                      adjustment: "Ajuste conciliado",
                                    } as Record<string, string>
                                  )[str(m, "type")] || str(m, "type")}
                                </td>
                                <td>{pretty(str(m, "date"))}</td>
                                <td>{brl(str(m, "amount"))}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </Panel>
                </>
              )}
              {current[0] === "investimentos" && <ManualInvestments snapshot={snapshot} today={today} onSaved={refresh} />}
              {current[0] === "planejamento" && (
                <>
                  <FinancialPlanning snapshot={snapshot} today={today} />
                  <Panel
                    title="Agenda de compromissos"
                    subtitle="Valores planejados ficam separados do caixa. Confirme somente os pagamentos efetivos."
                  >
                    {rows(snapshot, "financial_obligations")
                      .filter((o) =>
                        ["month", "previous"].includes(period)
                          ? str(o, "due_date").slice(0, 7) === start.slice(0, 7)
                          : str(o, "due_date") >= start &&
                            str(o, "due_date") <= end,
                      )
                      .sort((a, b) =>
                        str(a, "due_date").localeCompare(str(b, "due_date")),
                      )
                      .map((o) => (
                        <div
                          className="list-row obligation-row"
                          key={str(o, "id")}
                        >
                          <div>
                            <strong>{o.name}</strong>
                            <small>
                              Vence {pretty(str(o, "due_date"))}
                              {o.liability_id ? " · dívida vinculada" : ""}
                            </small>
                          </div>
                          <strong>{brl(str(o, "amount"))}</strong>
                          <span
                            className={`badge ${o.status === "paid" ? "green" : o.status === "cancelled" ? "muted" : str(o, "due_date") < today ? "danger" : "amber"}`}
                          >
                            {o.status === "paid"
                              ? "Pago"
                              : o.status === "cancelled"
                                ? "Cancelado"
                                : str(o, "due_date") < today
                                  ? "Pendente · vencido"
                                  : "Pendente"}
                          </span>
                          {o.status === "pending" && (
                            <div className="actions">
                              <button onClick={() => open("obligation", o)}>
                                Editar
                              </button>
                              <button
                                onClick={() =>
                                  open("payObligation", {
                                    obligation_id: o.id,
                                    date: today,
                                    principal_reduction: "0",
                                  })
                                }
                              >
                                Confirmar pagamento
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    {!rows(snapshot, "financial_obligations").length && (
                      <Empty
                        message="Planeje os próximos vencimentos."
                        action={() => open("obligation")}
                      />
                    )}
                  </Panel>
                  <Panel
                    title="Dívidas e obrigações"
                    subtitle="Valores informados são descontados do patrimônio líquido, além das faturas."
                  >
                    {rows(snapshot, "financial_liabilities").map((l) => (
                      <div className="list-row" key={str(l, "id")}>
                        <strong>{l.name}</strong>
                        <span>
                          {l.due_date
                            ? pretty(str(l, "due_date"))
                            : "Sem vencimento"}
                        </span>
                        <strong>{brl(str(l, "amount"))}</strong>
                        <button onClick={() => open("liability", l)}>
                          Atualizar saldo
                        </button>
                      </div>
                    ))}
                  </Panel>
                  <div className="cards-grid">
                    {rows(snapshot, "budgets")
                      .filter(
                        (b) =>
                          str(b, "month").slice(0, 7) >= start.slice(0, 7) &&
                          str(b, "month").slice(0, 7) <= end.slice(0, 7),
                      )
                      .map((b) => {
                        const metrics = budgetMetrics(snapshot, b, today);
                        const spent = Number(metrics.spent),
                          progress = Math.min(100, Number(metrics.percent));
                        return (
                          <Panel
                            key={str(b, "id")}
                            title={str(b, "name")}
                            subtitle={`Orçamento · ${invoiceMonthLabel(str(b, "month").slice(0, 7))}`}
                            action={
                              <div className="actions">
                                <button onClick={() => open("budget", b)}>
                                  Editar
                                </button>
                                <button
                                  onClick={() =>
                                    setRemoval({ kind: "budget", row: b })
                                  }
                                >
                                  Excluir
                                </button>
                              </div>
                            }
                          >
                            <div className="list-row">
                              <strong>{brl(spent)}</strong>
                              <span>de {brl(str(b, "amount"))}</span>
                            </div>
                            <div
                              className={`progress ${spent > Number(b.amount) ? "danger" : ""}`}
                            >
                              <span style={{ width: progress + "%" }} />
                            </div>
                            <p
                              className={
                                spent > Number(b.amount) ? "negative" : ""
                              }
                            >
                              {spent > Number(b.amount)
                                ? "Limite ultrapassado"
                                : "Continue acompanhando suas escolhas."}
                            </p>
                          </Panel>
                        );
                      })}
                    {rows(snapshot, "financial_goals").map((g) => {
                      const actual =
                        g.kind === "investment"
                          ? summary.investments
                          : g.kind === "net_worth"
                            ? summary.netWorth
                            : summary.savings;
                      return (
                        <Panel
                          key={str(g, "id")}
                          title={str(g, "name")}
                          action={
                            <div className="actions">
                              <button onClick={() => open("financialGoal", g)}>
                                Editar
                              </button>
                              <button
                                onClick={() =>
                                  setRemoval({ kind: "financialGoal", row: g })
                                }
                              >
                                Excluir
                              </button>
                            </div>
                          }
                          subtitle={
                            g.target_date
                              ? `Até ${pretty(str(g, "target_date"))}`
                              : "Sua próxima conquista"
                          }
                        >
                          <strong>
                            {brl(actual)} / {brl(str(g, "target"))}
                          </strong>
                          <div className="progress">
                            <span
                              style={{
                                width:
                                  Math.min(
                                    100,
                                    Math.max(
                                      0,
                                      (Number(actual) / Number(g.target)) * 100,
                                    ),
                                  ) + "%",
                              }}
                            />
                          </div>
                        </Panel>
                      );
                    })}
                  </div>
                  <Simulator />
                </>
              )}
              {current[0] === "relatorios" && (
                <>
                  <CategoryExpensesReport snapshot={snapshot} expenses={periodExpenses} today={today} />
                  <Panel
                    title="Evolução patrimonial registrada"
                    subtitle="Posições registradas por dia, sem fabricar histórico anterior. Preços ausentes usam custo de aquisição identificado."
                    action={
                      <button
                        onClick={saveWealth}
                        disabled={wealthSaving}
                        aria-busy={wealthSaving}
                      >
                        {wealthSaving ? "Registrando posição…" : "Registrar posição hoje"}
                      </button>
                    }
                  >
                    <WealthRegistrationFeedback feedback={wealthFeedback} />
                    <WealthChart
                      data={rows(snapshot, "net_worth_snapshots")
                        .filter(
                          (r) =>
                            str(r, "date") >= start && str(r, "date") <= end,
                        )
                        .sort((a, b) =>
                          str(a, "date").localeCompare(str(b, "date")),
                        )
                        .map((r) => ({
                          date: str(r, "date"),
                          net: D(str(r, "assets"))
                            .minus(str(r, "liabilities"))
                            .toNumber(),
                          assets: Number(r.assets),
                        }))}
                    />
                  </Panel>
                  <Panel
                    title="Carteira versus CDI"
                    subtitle="Performance pessoal pelo método Dietz modificado, com aportes, retiradas, taxas e proventos confirmados. Mesmo intervalo para o CDI."
                  >
                    <div className="report-grid">
                      <div>
                        <span>Performance pessoal</span>
                        <strong>
                          {performance?.personal === null
                            ? "Dados insuficientes"
                            : `${performance?.personal}%`}
                        </strong>
                      </div>
                      <div>
                        <span>CDI acumulado no período</span>
                        <strong>
                          {performance?.cdi === null
                            ? "Histórico indisponível"
                            : `${performance?.cdi}%`}
                        </strong>
                      </div>
                      <div>
                        <span>Desempenho relativo ao CDI</span>
                        <strong>
                          {performance?.relative === null
                            ? "Sem base comparável"
                            : `${performance?.relative}%`}
                        </strong>
                      </div>
                    </div>
                  </Panel>
                  <Panel
                    title="Relatório financeiro do período"
                    subtitle={`${pretty(start)} a ${pretty(end)} · despesas e parcelas por vencimento; compras integrais no histórico geral`}
                    action={
                      <div className="actions">
                        {(["csv", "xlsx", "pdf"] as const).map((f) => (
                          <button
                            key={f}
                            onClick={() =>
                              exportData(
                                exportReportRows(
                                  snapshot,
                                  start,
                                  end,
                                  ["month", "previous"].includes(period),
                                  today,
                                ),
                                f,
                                {
                                  title: "Relatório financeiro mensal",
                                  period: `${pretty(start)} a ${pretty(end)}`,
                                  summary: {
                                    Receitas: periodSummary?.income || "0",
                                    Gastos: periodSummary?.expenses || "0",
                                    "Rendimentos recebidos":
                                      periodSummary?.yields || "0",
                                    "Resultado líquido":
                                      periodSummary?.net || "0",
                                  },
                                },
                              )
                            }
                          >
                            <Download size={15} />
                            {f.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    }
                  >
                    <div className="report-grid">
                      {[
                        ["Entradas", periodSummary?.income || "0"],
                        ["Gastos e parcelas", periodSummary?.expenses || "0"],
                        [
                          "Parcelas do cartão",
                          periodSummary?.cardExpense || "0",
                        ],
                        [
                          "Despesas nas contas",
                          periodSummary?.cashExpense || "0",
                        ],
                        [
                          "Resultado líquido do período",
                          periodSummary?.net || "0",
                        ],
                        [
                          "Resultado efetivo em caixa",
                          periodSummary?.cashNet || "0",
                        ],
                        ["Rendimentos recebidos", periodSummary?.yields || "0"],
                        ["Patrimônio bruto atual", summary.assets],
                        ["Patrimônio líquido atual", summary.netWorth],
                        ["Investimentos atuais", summary.investments],
                      ].map(([label, value]) => (
                        <div key={label} className={`financial-surface ${financialTone(value, label.startsWith("Patrimônio") ? "wealth" : label.startsWith("Investimentos") ? "investment" : ["Gastos e parcelas", "Parcelas do cartão", "Despesas nas contas"].includes(label) ? "expense" : "income")}`}>
                          <span>{label}</span>
                          <strong>{brl(value)}</strong>
                        </div>
                      ))}
                    </div>
                    <div className="actions">
                      <button
                        aria-pressed={chartMode === "monthly"}
                        onClick={() => setChartMode("monthly")}
                      >
                        Por dia
                      </button>
                      <button
                        aria-pressed={chartMode === "annual"}
                        onClick={() => setChartMode("annual")}
                      >
                        Por mês
                      </button>
                    </div>
                    <FlowChart data={flowData} />
                  </Panel>
                  <Panel
                    title="Central de rendimentos"
                    subtitle="Recebido, estimado e valorização permanecem separados."
                  >
                    <div className="report-grid">
                      <div>
                        <span>Recebido no período</span>
                        <strong>{brl(summary.yields)}</strong>
                      </div>
                      <div>
                        <span>Caixinhas · bruto estimado</span>
                        <strong>
                          {summary.goals.some(g => g.estimateComplete === false)
                            ? "Conciliação por lote pendente"
                            : brl(money(summary.goals.reduce((a, g) => a.plus(g.gross), D(0))))}
                        </strong>
                      </div>
                      <div>
                        <span>Valorização não realizada</span>
                        <strong>
                          {brl(
                            money(
                              summary.positions
                                .filter((p) => p.supported)
                                .reduce((a, p) => a.plus(p.unrealized), D(0)),
                            ),
                          )}
                        </strong>
                      </div>
                    </div>
                  </Panel>
                </>
              )}
              {current[0] === "configuracoes" && (
                <>
                  <DataConfidence snapshot={snapshot} today={today} />
                  <ReconciliationPanel
                    snapshot={snapshot}
                    today={today}
                    onSave={async (action, payload) => {
                      await post("/api/operations", {
                        action,
                        payload,
                        request_id: crypto.randomUUID(),
                      });
                      refresh();
                      setNotice("Conciliação registrada e totais atualizados.");
                    }}
                  />
                  <Panel
                    title="Preferências do planejamento"
                    subtitle="A meta de reserva usa somente as caixinhas marcadas como reserva de emergência."
                  >
                    <button
                      onClick={() =>
                        open("preferences", rows(snapshot, "user_settings")[0])
                      }
                    >
                      Ajustar meses da reserva
                    </button>
                  </Panel>
                  <Panel
                    title="Segurança da conta"
                    subtitle={snapshot.user.email}
                  >
                    <PasswordForm />
                  </Panel>
                </>
              )}
            </>
          )}
          <footer>
            FINORA <span>Clareza para hoje. Liberdade para amanhã.</span>
            <small>
              Estimativas e projeções são identificadas; não são rentabilidade
              garantida.
            </small>
          </footer>
        </main>
      </div>
      {modal && snapshot && (
        <Dialog
          form={modal.form}
          initial={modal.initial}
          snapshot={snapshot}
          onClose={() => setModal(null)}
          onSaved={() => {
            setNotice("Registro salvo com sucesso.");
            refresh();
          }}
        />
      )}
      {removal && (
        <DeleteDialog
          {...removal}
          onClose={() => setRemoval(null)}
          onSaved={() => {
            setNotice("Alteração concluída. Totais atualizados.");
            refresh();
          }}
        />
      )}
    </div>
  );
  function renderCard(card: Row) {
    const month = section === "cartoes" ? invoiceMonth : today.slice(0, 7);
    const monthly = invoiceTotals(
      allInvoices.filter(
        (invoice) => invoice.cardId === card.id && invoice.month === month,
      ),
    );
    const invoices = rows(snapshot!, "credit_card_invoices").filter(
        (i) => i.card_id === card.id,
      ),
      ids = new Set(invoices.map((i) => i.id)),
      committed = sum(
        rows(snapshot!, "credit_card_installments").filter((i) =>
          ids.has(i.invoice_id),
        ),
        "amount",
      ).minus(
        sum(
          rows(snapshot!, "credit_card_payments").filter((i) =>
            ids.has(i.invoice_id),
          ),
          "amount",
        ),
      );
    return (
      <>
        <div className="bank-card" style={cardColors(str(card, "color"))}>
          <div>
            <span>{str(card, "institution") || "FINORA"}</span>
            <CreditCard size={23} />
          </div>
          <strong>{str(card, "name")}</strong>
          <div className="card-digits">
            •••• &nbsp; •••• &nbsp; •••• &nbsp; {str(card, "last_four")}
          </div>
          <div>
            <span>Seu cartão</span>
            <b>{str(card, "brand") || "CRÉDITO"}</b>
          </div>
        </div>
        <div className="card-monthly-invoice">
          <span>Total da fatura · {invoiceMonthLabel(month)}</span>
          <strong>{brl(monthly.total)}</strong>
          <small>
            Pago: {brl(monthly.paid)} · a pagar: {brl(monthly.pending)}
          </small>
        </div>
        <div className="card-values">
          <div>
            <span>Limite disponível</span>
            <strong>
              {brl(money(D(str(card, "credit_limit")).minus(committed)))}
            </strong>
          </div>
          <div>
            <span>Total comprometido</span>
            <strong>{brl(money(committed))}</strong>
            <small>Todas as faturas ainda não pagas</small>
          </div>
        </div>
        <div className="progress">
          <span
            style={{
              width:
                Math.min(
                  100,
                  committed.div(str(card, "credit_limit")).mul(100).toNumber(),
                ) + "%",
            }}
          />
        </div>
        <small>
          Fechamento dia {str(card, "closing_day")} · vencimento dia{" "}
          {str(card, "due_day")}
        </small>
      </>
    );
  }
  function renderGoal(
    g: NonNullable<typeof summary>["goals"][number],
    detail: boolean,
  ) {
    const yieldMetrics = goalYieldMetrics?.details.find(
      (m) => m.goalId === g.goal.id,
    );
    const pendingLotReconciliation = g.estimateComplete === false;
    const estimateValue = (value: string) => pendingLotReconciliation ? "Conciliação por lote pendente" : brl(value);
    const progress = Math.min(
      100,
      D(g.principal).div(str(g.goal, "target")).mul(100).toNumber(),
    );
    return (
      <div className="goal">
        <div className="goal-heading">
          <span className="goal-icon">
            <PiggyBank size={21} />
          </span>
          <div>
            <strong>{str(g.goal, "name")}</strong>
            <small>
              {g.goal.indexer === "cdi"
                ? `${str(g.goal, "percentage")}% do CDI`
                : fieldOptionLabel(forms.goal, "indexer", str(g.goal, "indexer"))}
            </small>
          </div>
          <span>{progress.toFixed(0)}%</span>
        </div>
        <div className="goal-values">
          <strong>{brl(g.principal)}</strong>
          <span>de {brl(str(g.goal, "target"))}</span>
        </div>
        <div className="progress">
          <span style={{ width: progress + "%" }} />
        </div>
        {detail && (
          <>
            <div className="list-row">
              <span>Saldo estimado</span>
              <strong>{estimateValue(g.estimated)}</strong>
            </div>
            <div className="list-row">
              <span>Rendimento bruto estimado</span>
              <strong>{estimateValue(g.gross)}</strong>
            </div>
            <div className="list-row">
              <span>Último dia útil disponível · bruto estimado</span>
              <strong>{estimateValue(yieldMetrics?.daily ?? "0")}</strong>
            </div>
            <div className="list-row">
              <span>Rendimento do mês atual · bruto estimado</span>
              <strong>{estimateValue(yieldMetrics?.monthly ?? "0")}</strong>
            </div>
            <div className="list-row">
              <span>Rendimento líquido estimado</span>
              <strong>
                {pendingLotReconciliation ? "Conciliação por lote pendente" : g.net === null ? "Produto tributário pendente" : brl(g.net)}
              </strong>
            </div>
            <div className="list-row">
              <span>Rendimento confirmado ainda na caixinha</span>
              <strong>{brl(g.confirmed)}</strong>
            </div>
            <div className="list-row">
              <span>Saldo registrado · principal e valores confirmados</span>
              <strong>{brl(g.registeredBalance)}</strong>
            </div>
            {snapshot &&
              rows(snapshot, "savings_reconciliations")
                .filter((r) => r.goal_id === g.goal.id)
                .sort((a, b) => str(b, "date").localeCompare(str(a, "date")))
                .slice(0, 1)
                .map((r) => (
                  <div className="list-row" key={str(r, "id")}>
                    <span>
                      Saldo oficial informado · {pretty(str(r, "date"))}
                    </span>
                    <strong>{brl(str(r, "confirmed_balance"))}</strong>
                  </div>
                ))}
            <p className="notice">
              {pendingLotReconciliation ? g.estimateLimitation : !g.supported
                ? "Metodologia contratual pendente; rendimento automático indisponível."
                : yieldMetrics?.waitingForRate
                  ? `Aguardando primeira taxa publicada desde ${pretty(yieldMetrics.waitingSince ?? "")}. A taxa anterior ao aporte não gera rendimento.`
                  : g.asOf
                    ? `Data-base do rendimento: ${pretty(g.asOf)}. Estimativa não é saldo confirmado pelo banco.`
                    : "Sem taxas históricas disponíveis. Nenhuma taxa foi inventada."}
            </p>
          </>
        )}
      </div>
    );
  }
}
function Simulator() {
  const [initial, setInitial] = useState("1000"),
    [monthly, setMonthly] = useState("100"),
    [annual, setAnnual] = useState("10"),
    [months, setMonths] = useState(12),
    [percent, setPercent] = useState("100"),
    [target, setTarget] = useState("20000");
  let scenarios: {
    label: string;
    balance: string;
    capital: string;
    yield: string;
  }[] = [];
  let eta: number | null = null;
  try {
    if (
      D(initial).lt(0) ||
      D(monthly).lt(0) ||
      D(annual).lt(0) ||
      D(percent).lt(0) ||
      D(target).lte(0)
    )
      throw new Error("Valores inválidos");
    const adjusted = (reference: string) =>
      D(1)
        .plus(
          D(1)
            .plus(D(reference).div(100))
            .pow(D(1).div(252))
            .minus(1)
            .mul(D(percent).div(100)),
        )
        .pow(252)
        .minus(1)
        .mul(100)
        .toString();
    scenarios = [
      ["CDI menor", D(annual).mul("0.8").toString()],
      ["Referência constante", annual],
      ["CDI maior", D(annual).mul("1.2").toString()],
    ].map(([label, rate]) => ({
      label,
      ...simulate(initial, monthly, adjusted(rate), months).at(-1)!,
    }));
    eta = D(initial).gte(target)
      ? 0
      : (simulate(initial, monthly, adjusted(annual), 1200).find((p) =>
          D(p.balance).gte(target),
        )?.month ?? null);
  } catch {
    scenarios = [];
  }
  return (
    <Panel
      title="Simule seu próximo objetivo"
      subtitle="Cenários hipotéticos de CDI constante, menor ou maior. Aportes ao fim de cada mês, sem tributos; nenhuma taxa futura é apresentada como oficial."
    >
      <div className="simulator">
        {[
          ["Valor inicial (R$)", initial, setInitial],
          ["Aporte mensal (R$)", monthly, setMonthly],
          ["CDI anual de referência hipotético (%)", annual, setAnnual],
          ["Percentual contratado do CDI (%)", percent, setPercent],
          ["Meta financeira (R$)", target, setTarget],
        ].map(([label, value, setter]) => (
          <label key={String(label)}>
            {String(label)}
            <input
              inputMode="decimal"
              value={String(value)}
              onChange={(e) =>
                (setter as React.Dispatch<React.SetStateAction<string>>)(
                  e.target.value.replace(",", "."),
                )
              }
            />
          </label>
        ))}
        <label>
          Prazo (meses)
          <input
            type="number"
            min={1}
            max={1200}
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
          />
        </label>
      </div>
      {scenarios.length ? (
        <>
          <div className="report-grid">
            {scenarios.map((r) => (
              <div key={r.label}>
                <span>{r.label}</span>
                <strong>{brl(r.balance)}</strong>
                <small>
                  Capital: {brl(r.capital)} · ganho projetado: {brl(r.yield)}
                </small>
              </div>
            ))}
          </div>
          <p className="notice">
            {eta === null
              ? "Meta não alcançada em até 1200 meses neste cenário."
              : `Prazo até a meta no cenário de referência: ${eta} meses.`}{" "}
            Projeções não representam rentabilidade garantida.
          </p>
        </>
      ) : (
        <p role="alert">Confira os valores da simulação.</p>
      )}
    </Panel>
  );
}
function PasswordForm() {
  const [value, setValue] = useState(""),
    [message, setMessage] = useState("");
  return (
    <form
      className="password-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const { error } = await browserDb().auth.updateUser({
          password: value,
        });
        setMessage(error?.message || "Senha atualizada.");
        if (!error) setValue("");
      }}
    >
      <label>
        Nova senha
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <button className="primary">Atualizar senha</button>
      <p role="status">{message}</p>
    </form>
  );
}
type ImportDecision = {
  classification: string;
  force_new?: boolean;
  category_id?: string;
  counter_account_id?: string;
  invoice_id?: string;
  goal_id?: string;
  transaction_id?: string;
};
function ImportPanel({
  snapshot,
  onSaved,
  target = "transactions",
}: {
  snapshot: Snapshot;
  onSaved: () => void;
  target?: "transactions" | "investments";
}) {
  const [text, setText] = useState(""),
    [format, setFormat] = useState("csv"),
    [account, setAccount] = useState("");
  const [confirmationId, setConfirmationId] = useState(() => crypto.randomUUID());
  const [preview, setPreview] = useState<Row[]>([]),
    [decisions, setDecisions] = useState<Record<string, ImportDecision>>({});
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(0);
  const identity = (row: Row, index: number) =>
    str(row, "row_id") ||
    str(row, "request_id") ||
    str(row, "source_id") ||
    String(index);
  const update = (id: string, patch: Partial<ImportDecision>) =>
    setDecisions((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  const resetPreview = () => {
    setConfirmationId(crypto.randomUUID());
    setPreview([]);
    setDecisions({});
    setPage(0);
  };
  async function run(confirm: boolean) {
    setBusy(true);
    setMessage("");
    try {
      const choices = preview.map((row, index) => ({
        row_id: identity(row, index),
        ...Object.fromEntries(
          Object.entries(decisions[identity(row, index)] || {}).filter(
            ([, value]) => value !== "",
          ),
        ),
      }));
      const res = await post("/api/import", {
        text,
        format,
        account_id: account,
        confirm,
        target,
        ...(confirm ? { decisions: choices, request_id: confirmationId } : {}),
      });
      if (confirm) {
        setMessage(
          `${res.imported} registros importados; ${res.duplicates ?? 0} duplicidades ignoradas${res.matched ? `; ${res.matched} conciliados com lançamentos existentes` : ""}.`,
        );
        resetPreview();
        onSaved();
      } else {
        const items = res.rows as Row[];
        setPreview(items);
        setPage(0);
        setDecisions(
          Object.fromEntries(
            items.map((row, index) => [
              identity(row, index),
              {
                classification: row.duplicate
                  ? "skip"
                  : row.requires_review
                    ? ""
                    : target === "investments"
                      ? "keep"
                      : str(row, "suggested_classification") ||
                        str(row, "type"),
                category_id: str(row, "category_id"),
              },
            ]),
          ),
        );
        if (!items.length)
          setMessage("O arquivo não contém registros para importar.");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha ao importar");
    } finally {
      setBusy(false);
    }
  }
  const complete = preview.every((row, index) => {
    const d = decisions[identity(row, index)];
    if (!d?.classification) return false;
    return d.classification === "transfer"
      ? !!d.counter_account_id
      : d.classification === "invoice_payment"
        ? !!d.invoice_id
        : ["savings_deposit", "savings_withdraw"].includes(d.classification)
          ? !!d.goal_id
          : d.classification === "match"
            ? !!d.transaction_id
            : true;
  });
  const cashTypes = [
    ["income", "Receita"],
    ["expense", "Despesa"],
    ["yield", "Rendimento confirmado"],
    ["adjustment", "Ajuste"],
    ["transfer", "Transferência própria"],
    ["invoice_payment", "Pagamento de fatura"],
    ["savings_deposit", "Aporte em caixinha"],
    ["savings_withdraw", "Resgate de caixinha"],
    ["match", "Já registrado · conciliar"],
    ["skip", "Ignorar"],
  ];
  return (
    <Panel
      title={
        target === "transactions"
          ? "Importar transações"
          : "Importar operações de investimento"
      }
      subtitle={
        target === "transactions"
          ? "Revise o tipo de cada movimento. Transferências, faturas e aportes não devem virar novas receitas ou despesas."
          : "CSV com ticker,type,quantity,price,fees,date,broker,source_id. Confira quantidade, taxas e valor total antes de confirmar."
      }
    >
      <div className="import-controls">
        <label>
          Conta do arquivo
          <select
            aria-label="Conta do arquivo"
            value={account}
            onChange={(e) => {
              setAccount(e.target.value);
              resetPreview();
            }}
          >
            <option value="">Selecione</option>
            {rows(snapshot, "financial_accounts")
              .filter((a) => a.kind !== "savings" && !a.archived)
              .map((a) => (
                <option key={str(a, "id")} value={str(a, "id")}>
                  {a.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Arquivo {target === "investments" ? "CSV" : "CSV ou OFX"}
          <input
            type="file"
            accept={target === "investments" ? ".csv" : ".csv,.ofx"}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) {
                setText(await f.text());
                setFormat(
                  f.name.toLowerCase().endsWith(".ofx") ? "ofx" : "csv",
                );
                resetPreview();
                setMessage("");
              }
            }}
          />
        </label>
        <button disabled={!text || !account || busy} onClick={() => run(false)}>
          {busy ? "Processando…" : "Pré-visualizar"}
        </button>
      </div>
      {!!preview.length && (
        <>
          <p className="notice">
            {preview.length} registros ·{" "}
            {preview.filter((r) => r.duplicate).length} duplicados
            identificados.{" "}
            {preview.some((r) => r.requires_review)
              ? "Há movimentos que exigem sua classificação antes de confirmar."
              : "Confira a prévia antes de confirmar."}
          </p>
          {target === "transactions" && (
            <label className="bulk-category">
              Aplicar categoria aos novos registros
              <CategoryPicker categories={rows(snapshot, "categories")} label="Categoria dos novos registros importados" onChange={(categoryId) => setDecisions((d) => Object.fromEntries(Object.entries(d).map(([key, value]) => [key, { ...value, category_id: categoryId }])))} />
            </label>
          )}
          <div className="table-wrap">
            <table className="import-preview">
              <thead>
                <tr>
                  <th>Descrição / ativo</th>
                  <th>Data</th>
                  {target === "investments" ? (
                    <>
                      <th>Quantidade</th>
                      <th>Preço unitário</th>
                      <th>Taxas</th>
                      <th>Total em caixa</th>
                    </>
                  ) : (
                    <th>Movimento em caixa</th>
                  )}
                  <th>Classificação e conciliação</th>
                  {target === "transactions" && <th>Categoria</th>}
                </tr>
              </thead>
              <tbody>
                {preview
                  .slice(page * 50, (page + 1) * 50)
                  .map((row, offset) => {
                    const id = identity(row, page * 50 + offset),
                      d = decisions[id] || { classification: "" };
                    return (
                      <tr key={id}>
                        <td>
                          {row.description}
                          <small>
                            {d.force_new
                              ? "Outro lançamento confirmado por você"
                              : row.duplicate
                              ? "Duplicado identificado · será ignorado"
                              : row.possible_duplicate
                                ? "Possível duplicidade · confira o registro existente"
                                : row.requires_review
                                  ? "Revisão necessária"
                                  : "Novo registro"}
                          </small>
                        </td>
                        <td>{pretty(str(row, "date"))}</td>
                        {target === "investments" ? (
                          <>
                            <td>{row.quantity}</td>
                            <td>{brl(str(row, "price") || "0")}</td>
                            <td>{brl(str(row, "fees") || "0")}</td>
                            <td>
                              {brl(str(row, "amount") || "0")}
                              <small>
                                {row.type === "buy"
                                  ? "Compra: saída incluindo taxas"
                                  : "Venda: entrada após taxas"}
                              </small>
                            </td>
                          </>
                        ) : (
                          <td>
                            {brl(
                              str(row, "signed_amount") || str(row, "amount"),
                            )}
                          </td>
                        )}
                        <td>
                          {Boolean(row.duplicate && row.can_force_new) && (
                            <label className="import-force-new">
                              <input type="checkbox" checked={Boolean(d.force_new)}
                                aria-label={`Confirmo outro lançamento de ${str(row, "description")}`}
                                onChange={(e) => update(id, {
                                  force_new: e.target.checked,
                                  classification: e.target.checked
                                    ? target === "investments" ? "keep" : str(row, "suggested_classification") || str(row, "type")
                                    : "skip",
                                })} />
                              É outro lançamento real, com os mesmos dados
                            </label>
                          )}
                          <select
                            aria-label={`Classificação de ${str(row, "description")}`}
                            value={d.classification}
                            disabled={Boolean(row.duplicate) && !d.force_new}
                            onChange={(e) =>
                              update(id, { classification: e.target.value })
                            }
                          >
                            <option value="">Revisar e selecionar</option>
                            {(target === "investments"
                              ? [
                                  ["keep", "Importar operação"],
                                  ["skip", "Ignorar"],
                                ]
                              : cashTypes
                            ).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                          {d.classification === "transfer" && (
                            <select
                              aria-label={`Outra conta de ${str(row, "description")}`}
                              value={d.counter_account_id || ""}
                              onChange={(e) =>
                                update(id, {
                                  counter_account_id: e.target.value,
                                })
                              }
                            >
                              <option value="">Selecione a outra conta</option>
                              {rows(snapshot, "financial_accounts")
                                .filter(
                                  (a) =>
                                    a.id !== account &&
                                    a.kind !== "savings" &&
                                    !a.archived,
                                )
                                .map((a) => (
                                  <option
                                    key={str(a, "id")}
                                    value={str(a, "id")}
                                  >
                                    {a.name}
                                  </option>
                                ))}
                            </select>
                          )}
                          {d.classification === "invoice_payment" && (
                            <select
                              aria-label={`Fatura de ${str(row, "description")}`}
                              value={d.invoice_id || ""}
                              onChange={(e) =>
                                update(id, { invoice_id: e.target.value })
                              }
                            >
                              <option value="">Selecione a fatura</option>
                              {cardInvoices(snapshot, localDate()).map((i) => (
                                <option key={i.id} value={i.id}>
                                  {i.cardName} · vence {pretty(i.due)} ·{" "}
                                  {brl(i.pending)}
                                </option>
                              ))}
                            </select>
                          )}
                          {["savings_deposit", "savings_withdraw"].includes(
                            d.classification,
                          ) && (
                            <select
                              aria-label={`Caixinha de ${str(row, "description")}`}
                              value={d.goal_id || ""}
                              onChange={(e) =>
                                update(id, { goal_id: e.target.value })
                              }
                            >
                              <option value="">Selecione a caixinha</option>
                              {rows(snapshot, "savings_goals").map((g) => (
                                <option key={str(g, "id")} value={str(g, "id")}>
                                  {g.name}
                                </option>
                              ))}
                            </select>
                          )}
                          {d.classification === "match" && (
                            <select
                              aria-label={`Lançamento existente de ${str(row, "description")}`}
                              value={d.transaction_id || ""}
                              onChange={(e) =>
                                update(id, { transaction_id: e.target.value })
                              }
                            >
                              <option value="">
                                Selecione o movimento já registrado
                              </option>
                              {rows(snapshot, "transactions")
                                .filter(
                                  (t) =>
                                    t.account_id === account &&
                                    t.status === "confirmed",
                                )
                                .map((t) => (
                                  <option
                                    key={str(t, "id")}
                                    value={str(t, "id")}
                                  >
                                    {t.description} · {pretty(str(t, "date"))} ·{" "}
                                    {brl(str(t, "amount"))}
                                  </option>
                                ))}
                            </select>
                          )}
                        </td>
                        {target === "transactions" && (
                          <td>
                            <CategoryPicker categories={rows(snapshot, "categories")} label={`Categoria de ${str(row, "description")}`} value={d.category_id || ""} onChange={(categoryId) => update(id, { category_id: categoryId })} />
                          </td>
                        )}
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          {preview.length > 50 && (
            <div className="pagination">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Página anterior
              </button>
              <span>
                Página {page + 1} de {Math.ceil(preview.length / 50)}
              </span>
              <button
                disabled={(page + 1) * 50 >= preview.length}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima página
              </button>
            </div>
          )}
          <button
            className="primary"
            disabled={busy || !complete}
            onClick={() => run(true)}
          >
            Confirmar importação
          </button>
          {!complete && (
            <p role="status">
              Classifique os movimentos e preencha os vínculos necessários para
              confirmar.
            </p>
          )}
        </>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
    </Panel>
  );
}
