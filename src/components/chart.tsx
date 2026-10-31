"use client";
import { useChartMotion } from './use-motion-preference';
import { useMobileChart, MobileChartData } from "./mobile-chart";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  ComposedChart,
  Bar,
  Line,
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
  variant = 'area',
}: {
  data: { name: string; income: number; expense: number; yield: number }[];
  variant?: 'area' | 'reference';
}) {
  const mobileChart = useMobileChart();
  const chartMotion = useChartMotion();
  const Chart = variant === 'reference' ? ComposedChart : AreaChart;
  return (
    <>
    <div
      className="chart"
      aria-label="Gráfico de entradas, gastos e rendimentos recebidos"
    >
      <ResponsiveContainer width="100%" height="100%">
        <Chart
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
              (variant === 'reference' ? 'R$ ' : '') + new Intl.NumberFormat("pt-BR", {
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
          {variant === 'reference' ? <>
            <Bar dataKey="income" name="Receitas" fill="#159b77" radius={[2, 2, 0, 0]} maxBarSize={16} {...chartMotion} />
            <Bar dataKey="expense" name="Gastos" fill="#d95370" radius={[2, 2, 0, 0]} maxBarSize={16} {...chartMotion} />
            <Bar dataKey="yield" name="Rendimentos recebidos" fill="#6940e6" radius={[2, 2, 0, 0]} maxBarSize={16} {...chartMotion} />
            <Line dataKey="income" name="Evolução das receitas" tooltipType="none" legendType="none" type="monotone" stroke="#6940e6" strokeWidth={1.8} dot={false} {...chartMotion} />
          </> : <><Area
            {...chartMotion}
            type="monotone"
            dataKey="income"
            name="Entradas"
            stroke="#15803d"
            strokeWidth={2.5}
            fill="url(#flow-income)"
          />
          <Area
            {...chartMotion}
            type="monotone"
            dataKey="expense"
            name="Saídas"
            stroke="#c4586e"
            strokeWidth={2}
            fill="transparent"
          />
          <Area
            {...chartMotion}
            type="monotone"
            dataKey="yield"
            name="Rendimentos"
            stroke="#21a788"
            strokeWidth={2}
            fill="transparent"
          /></>}
        </Chart>
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
  colors = palette,
  compact = false,
  center,
}: {
  data: { id?: string; name: string; value: number }[];
  onSelect?: (id: string) => void;
  colors?: string[];
  compact?: boolean;
  center?: { value: string; label: string };
}) {
  const mobileChart = useMobileChart();
  const chartMotion = useChartMotion();
  return (
    <div className="donut" aria-label="Distribuição dos gastos por categoria">
      <ResponsiveContainer width="100%" height={center ? 160 : '100%'}>
        <PieChart>
          <Pie
            data={data}
            {...chartMotion}
            dataKey="value"
            innerRadius={compact ? 49 : 58}
            outerRadius={compact ? 72 : 84}
            paddingAngle={compact ? 1 : 4}
            onClick={onSelect ? (_, index) => onSelect(data[index]?.id || '') : undefined}
            cursor={onSelect ? 'pointer' : 'default'}
          >
            {data.map((r, i) => (
              <Cell key={r.name} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip
            trigger={center && mobileChart ? 'click' : 'hover'}
            isAnimationActive={false}
            position={center ? { x: 0, y: 164 } : undefined}
            allowEscapeViewBox={center ? { x: false, y: true } : undefined}
            wrapperStyle={center ? { width: '100%', pointerEvents: 'none' } : undefined}
            content={center ? ({ active, payload }) => {
              const item = payload?.[0];
              if (!active || !item) return null;
              return <div className="analysis-donut-tooltip" role="status"><span title={String(item.name)}>{String(item.name)}</span><b>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(item.value))}</b></div>;
            } : undefined}
            formatter={(v) =>
              new Intl.NumberFormat("pt-BR", {
                style: "currency",
                currency: "BRL",
              }).format(Number(v))
            }
          />
        </PieChart>
      </ResponsiveContainer>
      {center && <div className="analysis-donut-total"><b>{center.value}</b><small>{center.label}</small></div>}
    </div>
  );
}
