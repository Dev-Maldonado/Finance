"use client";
import { useMobileChart, MobileChartData } from "./mobile-chart";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { CalendarCheck } from "lucide-react";
export function WealthChart({
  data,
}: {
  data: { date: string; net: number; assets: number }[];
}) {
  const mobileChart = useMobileChart();
  if (!data.length)
    return (
      <p className="notice">
        Nenhuma posição patrimonial registrada no período. Registre posições em
        dias diferentes para acompanhar a evolução.
      </p>
    );
  if (data.length === 1) {
    const position = data[0];
    const brl = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
    return <section className="wealth-single-position" aria-label="Posição patrimonial registrada">
      <div className="wealth-position-heading"><CalendarCheck size={20} /><div><strong>Posição em {position.date.split("-").reverse().join("/")}</strong><small>Seu histórico patrimonial começou.</small></div></div>
      <dl><div><dt>Patrimônio bruto</dt><dd>{brl(position.assets)}</dd></div><div><dt>Patrimônio líquido</dt><dd>{brl(position.net)}</dd></div></dl>
      <p>Registre novamente em outro dia para visualizar a evolução. No mesmo dia, o registro é atualizado sem duplicar o histórico.</p>
    </section>;
  }
  return (
    <>
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
            trigger={mobileChart ? "click" : "hover"}
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
    <MobileChartData points={data.map(p=>({label:p.date.split("-").reverse().join("/"),values:[{label:"Patrimônio bruto",value:p.assets},{label:"Patrimônio líquido",value:p.net}]}))}/>
    </>
  );
}
