import { it, expect, vi } from "vitest";
import {
  CDIRateProvider,
  fetchData,
  ProviderError,
} from "../src/integrations/providers";
import { parseCsv, parseTransactions } from "../src/lib/import";
it("BCB preserva unidade diária, origem e datas", async () => {
  const fetcher = vi.fn(
    async () =>
      new Response(JSON.stringify([{ data: "01/10/2026", valor: "0.055" }])),
  );
  const rates = await new CDIRateProvider(fetcher).history(
    "2026-10-01",
    "2026-10-07",
  );
  expect(rates[0]).toEqual({
    series: "12",
    date: "2026-10-01",
    value: "0.055",
    source: "BCB SGS 12",
  });
  expect(fetcher.mock.calls.length).toBe(1);
});
it("resposta incompleta não vira taxa inventada", async () => {
  const p = new CDIRateProvider(
    async () => new Response('[{"data":"01/10/2026"}]'),
  );
  await expect(p.history("2026-10-01", "2026-10-07")).rejects.toThrow();
});
it("credencial inválida não sofre retry", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response("", { status: 401 }));
  await expect(fetchData("https://example.com", {}, 3)).rejects.toBeInstanceOf(
    ProviderError,
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher.mockRestore();
});
it("rate limit sofre retry limitado e preserva falha", async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response("", { status: 429 }));
  const p = expect(fetchData("https://example.com", {}, 2)).rejects.toThrow(
    "429",
  );
  await vi.runAllTimersAsync();
  await p;
  expect(fetcher).toHaveBeenCalledTimes(2);
  fetcher.mockRestore();
  vi.useRealTimers();
});
it("CSV respeita campos com vírgulas e aspas", () =>
  expect(parseCsv('name,value\n"A, B",10')[0].name).toBe("A, B"));
it("importações repetidas têm identificadores estáveis", () => {
  const text = "description,date,amount\nMercado,2026-10-01,-15.20";
  expect(parseTransactions(text, "csv")).toEqual(
    parseTransactions(text, "csv"),
  );
  expect(parseTransactions(text, "csv")[0].type).toBe("expense");
});
it("Excel usa células de texto e escapa XML, sem fórmulas executáveis", async () => {
  const { buildWorkbook } = await import("../src/lib/workbook");
  const { unzipSync, strFromU8 } = await import("fflate");
  const files = unzipSync(
    buildWorkbook(["Descrição"], [['=HYPERLINK("bad")'], ["A&B"]]),
  );
  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
  expect(sheet).toContain("inlineStr");
  expect(sheet).toContain("A&amp;B");
  expect(sheet).not.toContain("<f>");
  expect(Object.keys(files)).toHaveLength(6);
});
it("OFX SGML e XML preservam FITID e data", () => {
  const sgml =
    "<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT\n<DTPOSTED>20261001120000\n<TRNAMT>-15.20\n<FITID>abc-123\n<MEMO>Mercado\n</STMTTRN></BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>";
  const xml = sgml
    .replace("<TRNTYPE>DEBIT\n", "<TRNTYPE>DEBIT</TRNTYPE>")
    .replace(
      "<DTPOSTED>20261001120000\n",
      "<DTPOSTED>20261001120000</DTPOSTED>",
    )
    .replace("<TRNAMT>-15.20\n", "<TRNAMT>-15.20</TRNAMT>")
    .replace("<FITID>abc-123\n", "<FITID>abc-123</FITID>")
    .replace("<MEMO>Mercado\n", "<MEMO>Mercado</MEMO>");
  for (const fixture of [sgml, xml])
    expect(parseTransactions(fixture, "ofx")[0]).toEqual({
      description: "Mercado",
      date: "2026-10-01",
      amount: "15.20",
      type: "expense",
      source_id: "abc-123",
    });
});
