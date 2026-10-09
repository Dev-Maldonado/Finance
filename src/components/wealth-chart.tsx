"use client";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
export function WealthChart({
  data,
}: {
  data: { date: string; net: number; assets: number }[];
}) {
  if (!data.length)
    return (
      <p className="notice" role="status">
        Nenhuma posição patrimonial registrada no período. Registre posições em
        dias diferentes para acompanhar a evolução.
      </p>
    );
  return (
    <div
      className="chart"
      aria-label="Evolução do patrimônio bruto e líquido registrado"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
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
          <Line
            isAnimationActive={false}
            dataKey="net"
            name="Patrimônio líquido registrado"
            stroke="#5B35D5"
            strokeWidth={2}
          />
          <Line
            isAnimationActive={false}
            dataKey="assets"
            name="Patrimônio bruto registrado"
            stroke="#a58cd9"
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
