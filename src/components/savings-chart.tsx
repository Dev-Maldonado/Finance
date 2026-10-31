"use client";
import { useChartMotion } from './use-motion-preference';
import { useMobileChart, MobileChartData } from "./mobile-chart";
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
  data: { date: string; principal: number; yield: number; estimateComplete?: boolean }[];
}) {
  const mobileChart = useMobileChart();
  const chartMotion = useChartMotion();
  if (!data.length)
    return (
      <p className="notice" role="status">
        Nenhuma evolução registrada até a data selecionada.
      </p>
    );
  const incomplete = data.some(point => point.estimateComplete === false);
  const chartData = data.map(point => ({ ...point, yield: point.estimateComplete === false ? null : point.yield }));
  return (
    <>
    {incomplete && <p className="notice" role="status">A linha de rendimento foi interrompida após resgate sem detalhamento por lote. Confira o saldo registrado e o extrato oficial.</p>}
    <div
      className="chart"
      aria-label="Evolução do principal e do rendimento bruto estimado da caixinha"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 5" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(v) => String(v).slice(5)}
            fontSize={10}
          />
          <YAxis fontSize={10} width={60} />
          <Tooltip
            isAnimationActive={false}
            trigger={mobileChart ? "click" : "hover"}
            formatter={(v) =>
              new Intl.NumberFormat("pt-BR", {
                style: "currency",
                currency: "BRL",
              }).format(Number(v))
            }
          />
          <Area
            {...chartMotion}
            dataKey="principal"
            name="Capital aportado restante"
            stackId="total"
            stroke="#a894e4"
            fill="#e8e0fb"
          />
          <Area
            {...chartMotion}
            dataKey="yield"
            connectNulls={false}
            name="Rendimento bruto estimado"
            stackId="total"
            stroke="#5B35D5"
            fill="#bfa9f1"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
    <MobileChartData points={chartData.map(p=>({label:p.date.split("-").reverse().join("/"),values:[{label:"Capital aportado",value:p.principal},{label:"Rendimento bruto estimado",value:p.yield}]}))}/>
    </>
  );
}
