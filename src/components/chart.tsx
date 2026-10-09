"use client";
import { useMobileChart, MobileChartData } from "./mobile-chart";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
export function FlowChart({
  data,
}: {
  data: { name: string; income: number; expense: number; yield: number }[];
}) {
  const mobileChart = useMobileChart();
  return (
    <>
    <div
      className="chart"
      aria-label="Gráfico de entradas, gastos e rendimentos recebidos"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ left: 0, right: 8, top: 12, bottom: 0 }}
        >
          <defs>
            <linearGradient id="flow-income" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#15803d" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#15803d" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 5"
            vertical={false}
            stroke="#ececf3"
          />
          <XAxis
            dataKey="name"
            axisLine={false}
            tickLine={false}
            fontSize={11}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            fontSize={11}
            width={60}
            tickFormatter={(value) =>
              new Intl.NumberFormat("pt-BR", {
                notation: "compact",
                maximumFractionDigits: 1,
              }).format(Number(value))
            }
          />
          <Tooltip
            trigger={mobileChart ? "click" : "hover"}
            formatter={(v) =>
              new Intl.NumberFormat("pt-BR", {
                style: "currency",
                currency: "BRL",
              }).format(Number(v))
            }
          />
          <Area
            isAnimationActive={false}
            type="monotone"
            dataKey="income"
            name="Entradas"
            stroke="#15803d"
            strokeWidth={2.5}
            fill="url(#flow-income)"
          />
          <Area
            isAnimationActive={false}
            type="monotone"
            dataKey="expense"
            name="Saídas"
            stroke="#c4586e"
            strokeWidth={2}
            fill="transparent"
          />
          <Area
            isAnimationActive={false}
            type="monotone"
            dataKey="yield"
            name="Rendimentos"
            stroke="#21a788"
            strokeWidth={2}
            fill="transparent"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
    <MobileChartData points={data.map(p=>({label:p.name,values:[{label:"Entradas",value:p.income},{label:"Saídas",value:p.expense},{label:"Rendimentos recebidos",value:p.yield}]}))}/>
    </>
  );
}
export const palette = [
  "#5B35D5",
  "#A48AE8",
  "#D1C3F5",
  "#F4B56D",
  "#8DCDBB",
  "#B5C5F1",
];
export function CategoryChart({
  data,
  onSelect,
}: {
  data: { id?: string; name: string; value: number }[];
  onSelect?: (id: string) => void;
}) {
  return (
    <div className="donut" aria-label="Distribuição dos gastos por categoria">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            isAnimationActive={false}
            dataKey="value"
            innerRadius={58}
            outerRadius={84}
            paddingAngle={4}
            onClick={onSelect ? (_, index) => onSelect(data[index]?.id || '') : undefined}
            cursor={onSelect ? 'pointer' : 'default'}
          >
            {data.map((r, i) => (
              <Cell key={r.name} fill={palette[i % palette.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v) =>
              new Intl.NumberFormat("pt-BR", {
                style: "currency",
                currency: "BRL",
              }).format(Number(v))
            }
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
