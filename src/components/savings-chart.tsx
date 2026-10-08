"use client";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
export function SavingsChart({
  data,
}: {
  data: { date: string; principal: number; yield: number }[];
}) {
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 5" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(v) => String(v).slice(5)}
            fontSize={10}
          />
          <YAxis fontSize={10} width={60} />
          <Tooltip
            formatter={(v) =>
              new Intl.NumberFormat("pt-BR", {
                style: "currency",
                currency: "BRL",
              }).format(Number(v))
            }
          />
          <Area
            dataKey="principal"
            name="Capital aportado restante"
            stackId="total"
            stroke="#a894e4"
            fill="#e8e0fb"
          />
          <Area
            dataKey="yield"
            name="Rendimento bruto estimado"
            stackId="total"
            stroke="#5B35D5"
            fill="#bfa9f1"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
