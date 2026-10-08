import { describe, it, expect } from "vitest";
import {
  D,
  accrued,
  estimateTax,
  position,
  simulate,
  splitInstallments,
  Lot,
} from "../src/financial/engine";
const lot: Lot = {
  id: "l",
  principal: "5000",
  remaining: "5000",
  start_date: "2026-10-01",
  percentage: "100",
  indexer: "cdi",
  product: "cdb",
  tax_exempt: false,
};
const rates = [
  { date: "2026-10-01", value: "0.05" },
  { date: "2026-10-02", value: "0.05" },
  { date: "2026-10-05", value: "0.05" },
];
describe("CDI por lote com taxas diárias publicadas", () => {
  for (const [percent, expected] of [
    ["100", "5007.50"],
    ["110", "5008.25"],
    ["120", "5009.01"],
  ])
    it(`${percent}% CDI com referência independente`, () => {
      expect(
        accrued({ ...lot, percentage: percent }, rates, [], "2026-10-06")
          .balance,
      ).toBe(expected);
    });
  it("não inventa rendimento em final de semana ou dia sem taxa", () => {
    expect(accrued(lot, rates, [], "2026-10-04").balance).toBe("5005.00");
    expect(accrued(lot, [], [], "2026-10-06").balance).toBe("5000.00");
  });
  it("calcula aplicação posterior apenas nas datas elegíveis", () =>
    expect(
      accrued({ ...lot, start_date: "2026-10-05" }, rates, [], "2026-10-06")
        .balance,
    ).toBe("5002.50"));
  it("resgate parcial remove principal e sua parcela de juros estimados", () => {
    const result = accrued(
      lot,
      rates,
      [{ lot_id: "l", date: "2026-10-05", type: "withdrawal", amount: "2500" }],
      "2026-10-06",
    );
    expect(result.principal).toBe("2500.00");
    expect(result.balance).toBe("2503.75");
    expect(result.withdrawnEstimatedYield).toBe("2.50");
  });
  it("reprocessamento determinístico", () =>
    expect(accrued(lot, rates, [], "2026-10-06")).toEqual(
      accrued(lot, rates, [], "2026-10-06"),
    ));
  it("contrato novo não altera percentual de lote antigo", () =>
    expect(accrued(lot, rates, [], "2026-10-06").balance).not.toBe(
      accrued({ ...lot, percentage: "120" }, rates, [], "2026-10-06").balance,
    ));
});
describe("tributação e projeções", () => {
  it("IR regressivo para CDB, IOF no dia 1", () =>
    expect(estimateTax("100", 1, "cdb", false)).toEqual({
      ir: "0.90",
      iof: "96.00",
      net: "3.10",
      supported: true,
    }));
  it("não inventa tributo de produto personalizado", () =>
    expect(estimateTax("100", 365, "custom", false).supported).toBe(false));
  it("isento", () =>
    expect(estimateTax("100", 20, "custom", true).net).toBe("100.00"));
  it("IR após 720 dias", () =>
    expect(estimateTax("100", 721, "cdb", false).net).toBe("85.00"));
  it("simulação sem taxa conserva capital", () =>
    expect(simulate("1000", "100", "0", 12).at(-1)?.balance).toBe("2200.00"));
  it("parcelas conservam centavos", () => {
    const amounts = splitInstallments("100", 3);
    expect(amounts).toEqual(["33.33", "33.33", "33.34"]);
    expect(amounts.reduce((a, v) => a.plus(v), D(0)).toFixed(2)).toBe("100.00");
  });
});
describe("carteira, custo, eventos e lucro", () => {
  const buy = {
    id: "1",
    asset_id: "a",
    type: "buy",
    quantity: "10",
    price: "30",
    fees: "5",
    date: "2026-01-01",
  };
  it("preço médio inclui taxas", () =>
    expect(position([buy]).average).toBe("30.50000000"));
  it("venda reconhece custo proporcional e taxas", () => {
    const p = position([
      buy,
      {
        ...buy,
        id: "2",
        type: "sell",
        quantity: "4",
        price: "35",
        fees: "2",
        date: "2026-02-01",
      },
    ]);
    expect(p.realized).toBe("16.00");
    expect(p.cost).toBe("183.00");
  });
  it("desdobramento conserva custo", () => {
    const p = position(
      [buy],
      [{ asset_id: "a", type: "split", ratio: "2", date: "2026-02-01" }],
    );
    expect(p.quantity).toBe("20.00000000");
    expect(p.cost).toBe("305.00");
  });
  it("não permite venda acima da posição", () =>
    expect(() => position([{ ...buy, type: "sell" }])).toThrow());
});

describe("performance ajustada por fluxos", () => {
  it("aporte não vira rentabilidade", async () => {
    const { modifiedDietz } = await import("../src/financial/performance");
    expect(
      modifiedDietz("1000", "2000", "2026-01-01", "2026-01-31", [
        { date: "2026-01-15", amount: "1000" },
      ]),
    ).toBe("0.000000");
  });
  it("CDI benchmark respeita mesmo período", async () => {
    const { benchmarkReturn } = await import("../src/financial/performance");
    expect(benchmarkReturn(rates, "2026-10-02", "2026-10-05")).toBe("0.100025");
  });
});

it("tributação usa regras configuradas pela data de vigência", () => {
  const rule = {
    product: "cdb",
    valid_from: "2026-01-01",
    valid_to: "2026-12-31",
    min_days: 0,
    max_days: null,
    ir_rate: "0.1",
    iof_applicable: false,
  };
  expect(estimateTax("100", 100, "cdb", false, [rule], "2026-10-07").net).toBe(
    "90.00",
  );
  expect(
    estimateTax("100", 100, "cdb", false, [rule], "2027-01-01").supported,
  ).toBe(false);
});
it("compras do mesmo dia são aplicadas antes de vendas independentemente da ordem de consulta", () => {
  const sell = {
    id: "a",
    asset_id: "same",
    type: "sell",
    quantity: "1",
    price: "20",
    fees: "0",
    date: "2026-10-01",
  };
  const buy = { ...sell, id: "z", type: "buy", quantity: "2", price: "10" };
  expect(position([sell, buy]).quantity).toBe("1.00000000");
});
