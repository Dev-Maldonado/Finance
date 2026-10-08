"use client";
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
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ left: 0, right: 8, top: 12, bottom: 0 }}
        >
          <defs>
            <linearGradient id="purple" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5B35D5" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#5B35D5" stopOpacity={0} />
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
          <YAxis axisLine={false} tickLine={false} fontSize={11} width={55} />
          <Tooltip
            formatter={(v) =>
              new Intl.NumberFormat("pt-BR", {
                style: "currency",
                currency: "BRL",
              }).format(Number(v))
            }
          />
          <Area
            type="monotone"
            dataKey="income"
            name="Entradas"
            stroke="#5B35D5"
            strokeWidth={2.5}
            fill="url(#purple)"
          />
          <Area
            type="monotone"
            dataKey="expense"
            name="Saídas"
            stroke="#f18c9c"
            strokeWidth={2}
            fill="transparent"
          />
          <Area
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
}: {
  data: { name: string; value: number }[];
}) {
  return (
    <div className="donut">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            innerRadius={58}
            outerRadius={84}
            paddingAngle={4}
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
