"use client";
import { useEffect, useState, useMemo } from "react";
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
} from "lucide-react";
import { ProventEvents } from "./provent-events";
import { Auth } from "./auth";
import { DeleteDialog } from "./delete-dialog";
import { cardColors } from "@/lib/card-color";
import { AssetSearch } from "./asset-search";
import { browserDb } from "@/lib/supabase";
import { Snapshot, Row, rows, str, financialSummary } from "@/lib/summary";
import { portfolioPerformance } from "@/financial/portfolio-performance";
import { D, money, simulate } from "@/financial/engine";
import { forms, FormDef } from "./forms";
import { Dialog, post } from "./dialog";
import { WealthChart } from "./wealth-chart";
import { SavingsChart } from "./savings-chart";
import { savingsHistory } from "@/financial/savings-history";
import type { Lot, Movement, Rate } from "@/financial/engine";
import { FlowChart, CategoryChart, palette } from "./chart";
import { exportData } from "./exports";
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
  tone = "purple",
  detail,
}: {
  label: string;
  value: string;
  icon: typeof Wallet;
  tone?: string;
  detail: string;
}) {
  return (
    <article className="stat">
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
  const [removal, setRemoval] = useState<{ kind: "transaction" | "purchase"; row: Row } | null>(null);
  const [showExcluded, setShowExcluded] = useState(false);
  const [showExcludedPurchases, setShowExcludedPurchases] = useState(false);
  const [session, setSession] = useState<boolean | null>(null),
    [collapsed, setCollapsed] = useState(false),
    [mobile, setMobile] = useState(false),
    [modal, setModal] = useState<{ form: FormDef; initial?: Row } | null>(null),
    [notice, setNotice] = useState(""),
    [search, setSearch] = useState("");
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
    enabled: session === true,
    queryFn: async () => {
      const res = await fetch("/api/snapshot");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
  });
  const snapshot = query.data;
  const performance = useMemo(
    () => (snapshot ? portfolioPerformance(snapshot, start, end) : null),
    [snapshot, start, end],
  );
  const summary = useMemo(
    () => (snapshot ? financialSummary(snapshot, start, end) : null),
    [snapshot, start, end],
  );
  const open = (key: string, initial?: Row) =>
    setModal({ form: forms[key], initial });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["snapshot"] });
  };
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
    investimentos: [
      ["opening", "Posição inicial"],
      ["corporate", "Evento"],
      ["price", "Preço manual"],
      ["investment", "Registrar operação"],
      ["asset", "Novo ativo"],
    ],
    planejamento: [
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
            (r.status !== "cancelled" || (section === "transacoes" && showExcluded)) &&
            str(r, "date") <= end &&
            str(r, "description").toLowerCase().includes(search.toLowerCase()),
        )
        .sort((a, b) => str(b, "date").localeCompare(str(a, "date")))
    : [];
  const sum = (list: Row[], key: string) =>
    list.reduce((a, r) => a.plus(str(r, key) || 0), D(0));
  const categoryData =
    snapshot && summary
      ? rows(snapshot, "categories")
          .map((c) => {
            const cash = sum(
                summary.tx.filter(
                  (t) => t.type === "expense" && t.category_id === c.id,
                ),
                "amount",
              ).abs(),
              card = sum(
                summary.purchases.filter((t) => t.category_id === c.id),
                "amount",
              );
            return {
              name: str(c, "name"),
              value: cash.plus(card).toNumber(),
              id: str(c, "id"),
            };
          })
          .filter((c) => c.value > 0)
      : [];
  const flowData = snapshot
    ? (() => {
        const effectiveMode =
          chartMode === "annual" ||
          (Date.parse(end) - Date.parse(start)) / 86400000 > 366
            ? "annual"
            : "monthly";
        const buckets: string[] = [];
        const cursor = new Date(start + "T12:00:00Z");
        if (effectiveMode === "annual") cursor.setUTCDate(1);
        while (
          cursor.toISOString().slice(0, 10) <= end &&
          buckets.length < 1200
        ) {
          buckets.push(
            cursor.toISOString().slice(0, effectiveMode === "annual" ? 7 : 10),
          );
          if (effectiveMode === "annual")
            cursor.setUTCMonth(cursor.getUTCMonth() + 1);
          else cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
        return buckets.map((key) => {
          const tx = rows(snapshot, "transactions").filter(
            (t) =>
              str(t, "date") >= start &&
              str(t, "date") <= end &&
              str(t, "date").startsWith(key) &&
              t.status === "confirmed",
          );
          const cards = rows(snapshot, "credit_card_purchases").filter(
            (t) =>
              str(t, "date") >= start &&
              str(t, "date") <= end &&
              str(t, "date").startsWith(key),
          );
          return {
            name:
              effectiveMode === "annual"
                ? key.split("-").reverse().join("/")
                : key.slice(5).split("-").reverse().join("/"),
            income: sum(
              tx.filter((t) => t.type === "income"),
              "amount",
            ).toNumber(),
            expense: sum(
              tx.filter((t) => t.type === "expense"),
              "amount",
            )
              .abs()
              .plus(sum(cards, "amount"))
              .toNumber(),
            yield: sum(
              tx.filter((t) => t.type === "yield"),
              "amount",
            ).toNumber(),
          };
        });
      })()
    : [];
  function transactionTable(list: Row[]) {
    return list.length ? (
      <div className="table-wrap">
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
                  </span>
                </td>
                <td>
                  {(snapshot &&
                    rows(snapshot, "categories").find(
                      (c) => c.id === t.category_id,
                    )?.name) ||
                    "—"}
                </td>
                <td>
                  {(snapshot &&
                    rows(snapshot, "financial_accounts").find(
                      (c) => c.id === t.account_id,
                    )?.name) ||
                    "—"}
                </td>
                <td>{pretty(str(t, "date"))}</td>
                <td>
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
                <td
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
                        <button onClick={() => setRemoval({ kind: "transaction", row: t })}>
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
      <aside className={`sidebar ${mobile ? "visible" : ""}`}>
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
          aria-label="Recolher menu"
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
      <div className="main">
        <header className="topbar">
          <div>
            <button
              className="mobile-menu icon-button"
              onClick={() => setMobile(!mobile)}
              aria-label="Abrir menu"
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
              aria-label="Atualizar dados"
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
                      if (e.target.value) setEnd(e.target.value);
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
          {notice && (
            <p role="status" className="notice" onClick={() => setNotice("")}>
              {notice}
            </p>
          )}
          {query.isPending && <p className="loading">Carregando seus dados…</p>}
          {query.error && (
            <div className="error" role="alert">
              {query.error.message}
              <button onClick={refresh}>Tentar novamente</button>
            </div>
          )}
          {snapshot && summary && (
            <>
              {current[0] === "dashboard" && (
                <>
                  <div className="stats">
                    <Stat
                      label="Saldo disponível"
                      value={summary.cash}
                      icon={Wallet}
                      detail="Contas e dinheiro · sem limites de cartão"
                    />
                    <Stat
                      label="Entradas"
                      value={summary.income}
                      icon={ArrowDownLeft}
                      tone="green"
                      detail="Receitas confirmadas no período"
                    />
                    <Stat
                      label="Saídas"
                      value={summary.expense}
                      icon={ArrowUpRight}
                      tone="pink"
                      detail="Despesas e compras · sem duplicar faturas"
                    />
                    <Stat
                      label="Gastos nos cartões"
                      value={summary.cardExpense}
                      icon={CreditCard}
                      tone="orange"
                      detail="Compras registradas no período"
                    />
                    <Stat
                      label="Rendimentos recebidos"
                      value={summary.yields}
                      icon={TrendingUp}
                      tone="green"
                      detail="Valores efetivamente confirmados"
                    />
                    <Stat
                      label="Patrimônio líquido"
                      value={summary.netWorth}
                      icon={ChartNoAxesCombined}
                      detail="Patrimônio menos cartões e outras obrigações"
                    />
                  </div>
                  <div className="dashboard-grid">
                    <Panel
                      title="Seu dinheiro ao longo do tempo"
                      subtitle={`Entradas, saídas e rendimentos · ${pretty(start)} a ${pretty(end)}`}
                      action={
                        <div className="period-tabs">
                          <button
                            className={
                              chartMode === "monthly" ? "selected" : ""
                            }
                            onClick={() => setChartMode("monthly")}
                          >
                            Mensal
                          </button>
                          <button
                            className={chartMode === "annual" ? "selected" : ""}
                            onClick={() => setChartMode("annual")}
                          >
                            Anual
                          </button>
                        </div>
                      }
                    >
                      <div className="chart-legend">
                        <span>
                          <i />
                          Entradas
                        </span>
                        <span>
                          <i className="pink-dot" />
                          Saídas
                        </span>
                        <span>
                          <i className="green-dot" />
                          Rendimentos
                        </span>
                      </div>
                      <FlowChart data={flowData} />
                    </Panel>
                    <Panel
                      title="Gastos por categoria"
                      subtitle="Cada escolha faz parte da sua história"
                      action={
                        <Link href="/categorias">
                          <ArrowUpRight size={18} />
                        </Link>
                      }
                    >
                      {categoryData.length ? (
                        <>
                          <CategoryChart data={categoryData} />
                          <div className="category-legend">
                            {categoryData.slice(0, 5).map((c, i) => (
                              <button
                                key={c.id}
                                onClick={() => {
                                  setSearch(c.name);
                                  setNotice(
                                    `Categoria ${c.name}: ${brl(c.value)} no período.`,
                                  );
                                }}
                              >
                                <span>
                                  <i
                                    style={{
                                      background: palette[i % palette.length],
                                    }}
                                  />
                                  {c.name}
                                </span>
                                <strong>{brl(c.value)}</strong>
                              </button>
                            ))}
                          </div>
                        </>
                      ) : (
                        <Empty message="Seus gastos aparecerão aqui." />
                      )}
                    </Panel>
                    <Panel
                      title="Meus cartões"
                      subtitle="Tudo sob controle, sem surpresas"
                      action={
                        <Link href="/cartoes" className="text-link">
                          Ver todos <ArrowRight size={14} />
                        </Link>
                      }
                    >
                      {rows(snapshot, "credit_cards").length ? (
                        renderCard(rows(snapshot, "credit_cards")[0])
                      ) : (
                        <Empty action={() => open("card")} />
                      )}
                    </Panel>
                    <Panel
                      title="Minhas caixinhas"
                      subtitle="Pequenos passos. Grandes conquistas."
                      action={
                        <Link href="/caixinhas" className="text-link">
                          Ver todas <ArrowRight size={14} />
                        </Link>
                      }
                    >
                      {summary.goals.length ? (
                        summary.goals
                          .slice(0, 3)
                          .map((g) => renderGoal(g, false))
                      ) : (
                        <Empty action={() => open("goal")} />
                      )}
                    </Panel>
                    <Panel
                      title="Meus investimentos"
                      subtitle="Seu patrimônio em movimento"
                      action={
                        <Link href="/investimentos" className="text-link">
                          Ver carteira <ArrowRight size={14} />
                        </Link>
                      }
                    >
                      <div className="investment-total">
                        <span>Total da carteira em BRL</span>
                        <strong>{brl(summary.investments)}</strong>
                        <p>
                          Cotações disponíveis ou custo de aquisição
                          identificado.
                        </p>
                      </div>
                      {summary.positions.slice(0, 4).map((p) => (
                        <div className="list-row" key={str(p.asset, "id")}>
                          <span className="asset-icon">
                            {str(p.asset, "ticker").slice(0, 2)}
                          </span>
                          <div>
                            <strong>{str(p.asset, "ticker")}</strong>
                            <small>{str(p.asset, "name")}</small>
                          </div>
                          <strong>
                            {p.supported ? brl(p.value) : "Moeda estrangeira"}
                          </strong>
                        </div>
                      ))}
                    </Panel>
                    <Panel
                      title="Resumo do período"
                      subtitle="O resultado das suas escolhas"
                    >
                      <div className="summary-tile">
                        <span>Entradas menos despesas</span>
                        <strong>
                          {brl(money(D(summary.income).minus(summary.expense)))}
                        </strong>
                        <small>Sem confundir aportes com despesas</small>
                      </div>
                      {[
                        ["Patrimônio bruto", summary.assets],
                        ["Guardado em caixinhas", summary.savings],
                        ["Compromissos de cartão", summary.cardLiability],
                      ].map(([l, v]) => (
                        <div className="list-row" key={l}>
                          <span>{l}</span>
                          <strong>{brl(v)}</strong>
                        </div>
                      ))}
                    </Panel>
                  </div>
                  <Panel
                    title="Transações recentes"
                    subtitle="Os últimos movimentos da sua vida financeira"
                    action={
                      <Link href="/transacoes" className="text-link">
                        Ver todas <ArrowRight size={14} />
                      </Link>
                    }
                  >
                    {transactionTable(filteredTx.slice(0, 6))}
                  </Panel>
                </>
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
                          className="account-balance"
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
                    <input type="checkbox" checked={showExcluded} onChange={e => setShowExcluded(e.target.checked)} />
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
                    {transactionTable(filteredTx)}
                  </Panel>
                  <Panel
                    title="Lançamentos recorrentes"
                    subtitle="Gerados como pendentes para conferência; não alteram saldo até confirmação."
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
                      <div className="list-row" key={str(r, "id")}>
                        <strong>{r.description}</strong>
                        <span>
                          {r.frequency === "monthly" ? "Mensal" : "Semanal"} ·
                          próxima {pretty(str(r, "next_date"))}
                        </span>
                        <strong>{brl(str(r, "amount"))}</strong>
                      </div>
                    ))}
                  </Panel>
                  <ImportPanel snapshot={snapshot} onSaved={refresh} />
                </>
              )}
              {current[0] === "categorias" && (
                <div className="cards-grid">
                  {rows(snapshot, "categories").map((c) => (
                    <Panel
                      key={str(c, "id")}
                      title={str(c, "name")}
                      subtitle={
                        c.parent_id
                          ? `Subcategoria de ${rows(snapshot, "categories").find((p) => p.id === c.parent_id)?.name}`
                          : "Categoria principal"
                      }
                      action={
                        <button onClick={() => open("category", c)}>
                          Editar
                        </button>
                      }
                    >
                      <div className="list-row">
                        <span>Gastos no período</span>
                        <strong>
                          {brl(
                            categoryData.find((d) => d.id === c.id)?.value ?? 0,
                          )}
                        </strong>
                      </div>
                      {c.budget && (
                        <div className="list-row">
                          <span>Limite mensal</span>
                          <strong>{brl(str(c, "budget"))}</strong>
                        </div>
                      )}
                      <button
                        className="text-link"
                        onClick={() =>
                          setNotice(
                            filteredTx
                              .filter((t) => t.category_id === c.id)
                              .map(
                                (t) =>
                                  `${t.description}: ${brl(str(t, "amount"))}`,
                              )
                              .join(" · ") ||
                              "Nenhuma despesa nesta categoria.",
                          )
                        }
                      >
                        Detalhar despesas
                      </button>
                    </Panel>
                  ))}
                  {!rows(snapshot, "categories").length && (
                    <Empty action={() => open("category")} />
                  )}
                </div>
              )}
              {current[0] === "cartoes" && (
                <>
                  <div className="cards-grid">
                    {rows(snapshot, "credit_cards").map((c) => (
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
                    title="Faturas e parcelas"
                    subtitle="Fechamento, vencimento e pagamentos parciais"
                  >
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Cartão</th>
                            <th>Vencimento</th>
                            <th>Total</th>
                            <th>Pago</th>
                            <th>Saldo</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows(snapshot, "credit_card_invoices")
                            .sort((a, b) =>
                              str(a, "due_date").localeCompare(
                                str(b, "due_date"),
                              ),
                            )
                            .map((inv) => {
                              const total = sum(
                                  rows(
                                    snapshot,
                                    "credit_card_installments",
                                  ).filter((i) => i.invoice_id === inv.id),
                                  "amount",
                                ),
                                paid = sum(
                                  rows(snapshot, "credit_card_payments").filter(
                                    (p) => p.invoice_id === inv.id,
                                  ),
                                  "amount",
                                ),
                                balance = total.minus(paid),
                                card = rows(snapshot, "credit_cards").find(
                                  (c) => c.id === inv.card_id,
                                );
                              const due = str(inv, "due_date"),
                                closing = new Date(due + "T12:00:00Z");
                              if (
                                Number(card?.due_day) <=
                                Number(card?.closing_day)
                              )
                                closing.setUTCMonth(closing.getUTCMonth() - 1);
                              closing.setUTCDate(Number(card?.closing_day));
                              const status = balance.lte(0)
                                ? "Paga"
                                : paid.gt(0)
                                  ? "Parcialmente paga"
                                  : due < localDate()
                                    ? "Atrasada"
                                    : localDate() <
                                        closing.toISOString().slice(0, 10)
                                      ? "Aberta"
                                      : "Fechada";
                              return (
                                <tr key={str(inv, "id")}>
                                  <td>{card?.name}</td>
                                  <td>{pretty(due)}</td>
                                  <td>{brl(money(total))}</td>
                                  <td>{brl(money(paid))}</td>
                                  <td>{brl(money(balance))}</td>
                                  <td>
                                    <span className="badge">{status}</span>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </Panel>
                  <Panel title="Compras registradas" action={
                    <label className="excluded-toggle">
                      <input type="checkbox" checked={showExcludedPurchases} onChange={e => setShowExcludedPurchases(e.target.checked)} />
                      Mostrar compras excluídas
                    </label>
                  }>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Descrição</th>
                            <th>Data</th>
                            <th>Total</th>
                            <th>Parcelas</th>
                            <th className="transaction-actions">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows(snapshot, "credit_card_purchases", showExcludedPurchases).map((p) => (
                            <tr key={str(p, "id")}>
                              <td><span>{p.description}</span>{p.status === "cancelled" && <span className="badge">Excluída</span>}</td>
                              <td>{pretty(str(p, "date"))}</td>
                              <td>{brl(str(p, "amount"))}</td>
                              <td>{p.installments}×</td>
                              <td className="transaction-actions">
                                {p.status !== "cancelled" && <div className="actions">
                                  <button onClick={() => setModal({
                                    form: { ...forms.purchase, action: undefined, endpoint: "/api/purchases" }, initial: p,
                                  })}>Editar</button>
                                  <button onClick={() => setRemoval({ kind: "purchase", row: p })}>Excluir</button>
                                </div>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Panel>
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
                                  (r) =>
                                    r.series ===
                                    (g.goal.indexer === "selic" ? "11" : "12"),
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
                          {rows(snapshot, "savings_movements").map((m) => (
                            <tr key={str(m, "id")}>
                              <td>
                                {
                                  rows(snapshot, "savings_goals").find(
                                    (g) => g.id === m.goal_id,
                                  )?.name
                                }
                              </td>
                              <td>
                                {m.type === "deposit"
                                  ? "Aporte"
                                  : m.type === "withdrawal"
                                    ? "Resgate de principal"
                                    : "Rendimento conciliado"}
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
              {current[0] === "investimentos" && (
                <>
                  <AssetSearch />
                  <div className="stats three">
                    <Stat
                      label="Carteira em BRL"
                      value={summary.investments}
                      icon={ChartNoAxesCombined}
                      detail="Mercado quando disponível; custo identificado"
                    />
                    <Stat
                      label="Valorização não realizada"
                      value={money(
                        summary.positions
                          .filter((p) => p.supported)
                          .reduce((a, p) => a.plus(p.unrealized), D(0)),
                      )}
                      icon={TrendingUp}
                      detail="Não representa renda recebida"
                    />
                    <Stat
                      label="Resultado realizado"
                      value={money(
                        summary.positions.reduce(
                          (a, p) => a.plus(p.pos.realized),
                          D(0),
                        ),
                      )}
                      icon={Wallet}
                      detail="Vendas menos custo e taxas"
                    />
                  </div>
                  <Panel
                    title="Minha carteira"
                    subtitle="Fundos usam cotas efetivas; preços manuais são identificados."
                  >
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Ativo</th>
                            <th>Classe</th>
                            <th>Quantidade</th>
                            <th>Preço médio</th>
                            <th>Valor da posição</th>
                            <th>Fonte / data</th>
                          </tr>
                        </thead>
                        <tbody>
                          {summary.positions.map((p) => (
                            <tr key={str(p.asset, "id")}>
                              <td>
                                <strong>{p.asset.ticker}</strong>
                                <small>{p.asset.name}</small>
                              </td>
                              <td>{p.asset.asset_class}</td>
                              <td>{p.pos.quantity}</td>
                              <td>{brl(p.pos.average)}</td>
                              <td>
                                {p.supported
                                  ? brl(p.value)
                                  : "Conversão cambial pendente"}
                              </td>
                              <td>
                                {p.quote ? (
                                  <>
                                    <span className="badge">
                                      {p.quote.source}
                                    </span>
                                    <small>
                                      {pretty(str(p.quote, "date"))}
                                    </small>
                                  </>
                                ) : (
                                  <span className="badge">
                                    Custo de aquisição · sem cotação
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!summary.positions.length && (
                      <Empty action={() => open("asset")} />
                    )}
                  </Panel>
                  <ImportPanel
                    snapshot={snapshot}
                    onSaved={refresh}
                    target="investments"
                  />
                  <ProventEvents snapshot={snapshot} onSaved={refresh} />
                  <Panel
                    title="Proventos"
                    subtitle="Anúncios só viram receita após confirmar o recebimento."
                    action={
                      <div className="actions">
                        <button onClick={() => open("dividend")}>
                          Novo anúncio
                        </button>
                        <button
                          className="primary"
                          onClick={() => open("income")}
                        >
                          Confirmar recebimento
                        </button>
                      </div>
                    }
                  >
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Ativo</th>
                            <th>Descrição</th>
                            <th>Data</th>
                            <th>Valor</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows(snapshot, "investment_income").map((p) => (
                            <tr key={str(p, "id")}>
                              <td>
                                {
                                  rows(snapshot, "investment_assets").find(
                                    (a) => a.id === p.asset_id,
                                  )?.ticker
                                }
                              </td>
                              <td>{p.description}</td>
                              <td>{pretty(str(p, "date"))}</td>
                              <td>{brl(str(p, "amount"))}</td>
                              <td>
                                <span className="badge">
                                  {p.status === "received"
                                    ? "Recebido"
                                    : "Anunciado"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Panel>
                </>
              )}
              {current[0] === "planejamento" && (
                <>
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
                    {rows(snapshot, "budgets").map((b) => {
                      const month = str(b, "month").slice(0, 7),
                        cash = sum(
                          rows(snapshot, "transactions").filter(
                            (t) =>
                              t.status === "confirmed" &&
                              t.type === "expense" &&
                              str(t, "date").startsWith(month) &&
                              (!b.category_id ||
                                t.category_id === b.category_id),
                          ),
                          "amount",
                        ).abs(),
                        card = sum(
                          rows(snapshot, "credit_card_purchases").filter(
                            (t) =>
                              str(t, "date").startsWith(month) &&
                              (!b.category_id ||
                                t.category_id === b.category_id),
                          ),
                          "amount",
                        );
                      const spent = cash.plus(card).toNumber();
                      const progress = Math.min(
                        100,
                        (spent / Number(b.amount)) * 100,
                      );
                      return (
                        <Panel
                          key={str(b, "id")}
                          title={str(b, "name")}
                          subtitle={`Orçamento · ${str(b, "month").slice(0, 7)}`}
                          action={
                            <button onClick={() => open("budget", b)}>
                              Editar
                            </button>
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
                  <Panel
                    title="Evolução patrimonial registrada"
                    subtitle="Posições registradas por dia, sem fabricar histórico anterior. Preços ausentes usam custo de aquisição identificado."
                    action={
                      <button
                        onClick={async () => {
                          try {
                            await post("/api/snapshot", {});
                            refresh();
                            setNotice(
                              "Posição patrimonial de hoje registrada.",
                            );
                          } catch (e) {
                            setNotice(String(e));
                          }
                        }}
                      >
                        Registrar posição hoje
                      </button>
                    }
                  >
                    <WealthChart
                      data={rows(snapshot, "net_worth_snapshots")
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
                    subtitle={`${pretty(start)} a ${pretty(end)}`}
                    action={
                      <div className="actions">
                        {(["csv", "xlsx", "pdf"] as const).map((f) => (
                          <button
                            key={f}
                            onClick={() => exportData(filteredTx, f)}
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
                        ["Entradas", summary.income],
                        ["Saídas", summary.expense],
                        ["Rendimentos recebidos", summary.yields],
                        ["Patrimônio bruto atual", summary.assets],
                        ["Patrimônio líquido atual", summary.netWorth],
                        ["Investimentos atuais", summary.investments],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <span>{label}</span>
                          <strong>{brl(value)}</strong>
                        </div>
                      ))}
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
                          {brl(
                            money(
                              summary.goals.reduce(
                                (a, g) => a.plus(g.gross),
                                D(0),
                              ),
                            ),
                          )}
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
                  <Panel
                    title="Integrações financeiras"
                    subtitle="A taxa CDI não conecta sua conta bancária."
                  >
                    <div className="integration-grid">
                      {[
                        ["bcb", "Banco Central", "CDI diário · SGS 12"],
                        ["cvm", "CVM", "Cadastro e cotas de fundos"],
                        ["brapi", "brapi", "Cotações conforme cobertura"],
                      ].map(([provider, label, detail]) => {
                        const state = rows(
                            snapshot,
                            "provider_sync_states",
                          ).find((s) => s.provider === provider),
                          log = rows(snapshot, "provider_sync_logs")
                            .filter((l) => l.provider === provider)
                            .sort((a, b) =>
                              str(b, "started_at").localeCompare(
                                str(a, "started_at"),
                              ),
                            )[0];
                        return (
                          <div className="integration" key={provider}>
                            <span className="asset-icon">
                              {label.slice(0, 2)}
                            </span>
                            <h3>{label}</h3>
                            <p>{detail}</p>
                            <span className={`badge ${state ? "green" : ""}`}>
                              {log?.status === "error"
                                ? "Falha na última tentativa"
                                : state
                                  ? "Histórico disponível"
                                  : "Ainda não sincronizado"}
                            </span>
                            <small>
                              Último sucesso:{" "}
                              {state?.last_success
                                ? new Date(
                                    str(state, "last_success"),
                                  ).toLocaleString("pt-BR")
                                : "—"}
                            </small>
                            {log?.message && (
                              <p className="error">{str(log, "message")}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <p className="notice">
                      Atualizações automáticas exigem um agendador no servidor.
                      Fontes indisponíveis mantêm apenas o histórico válido, com
                      sua data-base.
                    </p>
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
      {removal && <DeleteDialog
        {...removal}
        onClose={() => setRemoval(null)}
        onSaved={() => { setNotice("Registro excluído. Totais atualizados."); refresh(); }}
      />}
    </div>
  );
  function renderCard(card: Row) {
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
        <div className="card-values">
          <div>
            <span>Limite disponível</span>
            <strong>
              {brl(money(D(str(card, "credit_limit")).minus(committed)))}
            </strong>
          </div>
          <div>
            <span>Comprometido</span>
            <strong>{brl(money(committed))}</strong>
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
                : str(g.goal, "indexer")}
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
              <strong>{brl(g.estimated)}</strong>
            </div>
            <div className="list-row">
              <span>Rendimento bruto estimado</span>
              <strong>{brl(g.gross)}</strong>
            </div>
            <div className="list-row">
              <span>Líquido estimado</span>
              <strong>
                {g.net === null ? "Produto tributário pendente" : brl(g.net)}
              </strong>
            </div>
            <div className="list-row">
              <span>Ganhos conciliados</span>
              <strong>{brl(g.confirmed)}</strong>
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
              {!g.supported
                ? "Metodologia contratual pendente; rendimento automático indisponível."
                : g.asOf
                  ? `Data-base CDI: ${pretty(g.asOf)}. Estimativa não é saldo confirmado pelo banco.`
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
    [account, setAccount] = useState(""),
    [preview, setPreview] = useState<Row[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function run(confirm: boolean) {
    setBusy(true);
    setMessage("");
    try {
      const res = await post("/api/import", {
        text,
        format,
        account_id: account,
        confirm,
        target,
      });
      if (confirm) {
        setMessage(
          `${res.imported} transações importadas; ${res.duplicates} duplicidades ignoradas.`,
        );
        setPreview([]);
        onSaved();
      } else setPreview(res.rows);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha ao importar");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel
      title={
        target === "transactions"
          ? "Importar transações"
          : "Importar operações de investimento"
      }
      subtitle={
        target === "transactions"
          ? "CSV: description,date,amount,source_id. Valores negativos são despesas. Revise antes de confirmar."
          : "CSV: ticker,type (buy/sell),quantity,price,fees,date,broker,source_id. Ativos devem estar cadastrados. Confirmação atômica, com deduplicação."
      }
    >
      <div className="import-controls">
        <label>
          Conta
          <select
            value={account}
            onChange={(e) => {
              setAccount(e.target.value);
              setPreview([]);
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
          Arquivo CSV ou OFX
          <input
            type="file"
            accept=".csv,.ofx"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) {
                setText(await f.text());
                setFormat(
                  f.name.toLowerCase().endsWith(".ofx") ? "ofx" : "csv",
                );
                setPreview([]);
              }
            }}
          />
        </label>
        <button disabled={!text || !account || busy} onClick={() => run(false)}>
          Pré-visualizar
        </button>
      </div>
      {preview.length > 0 && (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th>Data</th>
                  <th>Valor</th>
                  <th>Conciliação</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 100).map((r, i) => (
                  <tr key={i}>
                    <td>{r.description}</td>
                    <td>{r.date}</td>
                    <td>{r.amount}</td>
                    <td>
                      {r.duplicate ? "Duplicada — ignorar" : "Novo lançamento"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>{preview.length} linhas no arquivo.</p>
          <button className="primary" disabled={busy} onClick={() => run(true)}>
            Confirmar importação
          </button>
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
