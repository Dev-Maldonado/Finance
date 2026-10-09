import { describe, expect, test } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { buildCsv, exportReportRows } from "../src/components/exports";
import { decimalInput, parseCsv, prepareImportRows, realDate, scopedSource, forceNewImportSource } from "../src/lib/import";
import { buildWorkbook } from "../src/lib/workbook";
import type { Snapshot } from "../src/lib/summary";

const account = "10000000-0000-4000-8000-000000000001";
describe("import identities and classification", () => {
  test("legitimate identical rows keep separate stable identities and require review", () => {
    const csv = "description,date,amount\nCafé,2026-10-01,-15.20\nCafé,2026-10-01,-15.20";
    const first = prepareImportRows(csv, "csv"), repeat = prepareImportRows(csv, "csv");
    expect(first.map(row => row.source_id)).toEqual(repeat.map(row => row.source_id));
    expect(new Set(first.map(row => row.source_id)).size).toBe(2);
    expect(first[0].fingerprint).toBe(first[1].fingerprint);
    expect(first[1].possible_duplicate).toBe(true);
    expect(first.every(row => row.identity_kind === "fingerprint")).toBe(true);
    expect(first.map(row => row.signed_amount)).toEqual(["-15.20", "-15.20"]);
  });

  test("distinct files retain matching rows for review while repeat confirmations stay idempotent", () => {
    const a = prepareImportRows("description,date,amount,batch\nCafé,2026-10-01,-15.20,A", "csv")[0];
    const b = prepareImportRows("description,date,amount,batch\nCafé,2026-10-01,-15.20,B", "csv")[0];
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.source_id).not.toBe(b.source_id);
    const id = "12345678-1234-4000-8000-123456789abc";
    expect(forceNewImportSource(a.source_id, a.identity_kind, id)).toBe(forceNewImportSource(a.source_id, a.identity_kind, id));
    expect(forceNewImportSource(a.source_id, a.identity_kind, id)).not.toBe(a.source_id);
    expect(() => forceNewImportSource("bank-fitid", "source", id)).toThrow(/banco/);
    expect(() => forceNewImportSource(a.source_id, a.identity_kind)).toThrow(/prévia/);
  });

  test("bank-provided IDs distinguish identical amounts and are scoped to their account once", () => {
    const csv = "description,date,amount,source_id\nCafé,2026-10-01,-15.20,bank-a\nCafé,2026-10-01,-15.20,bank-b";
    const prepared = prepareImportRows(csv, "csv");
    expect(prepared.map(row => row.source_id)).toEqual(["bank-a", "bank-b"]);
    expect(prepared.every(row => !row.possible_duplicate && row.identity_kind === "source")).toBe(true);
    expect(scopedSource(account, scopedSource(account, "bank-a"))).toBe(`${account}:bank-a`);
    expect(scopedSource("other-account", "bank-a")).not.toBe(scopedSource(account, "bank-a"));
  });

  test("local dates and decimals preserve cents and reject nonexistent dates or ambiguous numbers", () => {
    expect(realDate("29/02/2024")).toBe("2024-02-29");
    expect(decimalInput("R$ 1.234,56")).toBe("1234.56");
    expect(decimalInput("(59,90)")).toBe("-59.90");
    expect(decimalInput("'-59.90")).toBe("-59.90");
    for (const date of ["2026-02-29", "31/04/2026", "2026-13-01"]) expect(() => realDate(date)).toThrow();
    for (const value of ["1,2,3", "1e3", "12.345"]) expect(() => decimalInput(value)).toThrow();
    expect(() => prepareImportRows("description,date,amount\nZero,2026-10-01,0", "csv")).toThrow(/zero/i);
  });

  test("linked bank movements require a decision and exported card installments are skipped", () => {
    const ofx = `<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST><STMTTRN><TRNTYPE>XFER</TRNTYPE><DTPOSTED>20261001120000</DTPOSTED><TRNAMT>-20.00</TRNAMT><FITID>xfer-1</FITID><MEMO>Transferência</MEMO></STMTTRN></BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    expect(prepareImportRows(ofx, "ofx")[0]).toMatchObject({ suggested_classification: "transfer", requires_review: true });
    const rows = prepareImportRows("description,date,amount,type\nFatura,2026-10-01,-20,invoice_payment\nAporte,2026-10-01,-30,savings_deposit\nParcela,2026-10-01,-10,card_installment", "csv");
    expect(rows.map(row => row.suggested_classification)).toEqual(["invoice_payment", "match", "skip"]);
    expect(rows.every(row => row.requires_review)).toBe(true);
  });
});

describe("exports preserve financial types", () => {
  test("CSV protects spreadsheet formulas while negative amounts roundtrip without apostrophes", () => {
    const csv = buildCsv([{ description: '=HYPERLINK("https://example.test")', date: "2026-10-01", amount: "-59.90", type: "expense", source_id: "test-id" }]);
    const decoded = parseCsv(csv);
    expect(decoded[0].description).toBe('\'=HYPERLINK("https://example.test")');
    expect(decoded[0].amount).toBe("-59.90");
    expect(prepareImportRows(csv, "csv")[0]).toMatchObject({ signed_amount: "-59.90", source_id: "test-id" });
  });

  test("workbooks use numeric money and date cells, keep long IDs exact and never execute formulas", () => {
    const files = unzipSync(buildWorkbook(["description", "amount", "date", "source_id"], [
      ["=1+1", "-59.90", "2026-10-01", "001234567890123456789"],
      ["A&B", "123456789012345678.91", "2026-10-02", "reference"],
    ]));
    const xml = strFromU8(files["xl/worksheets/sheet1.xml"]);
    expect(xml).toContain('<c r="B2" t="n"><v>-59.90</v></c>');
    expect(xml).toMatch(/<c r="C2" s="1" t="n"><v>\d+<\/v><\/c>/);
    expect(xml).toContain('<c r="B3" t="inlineStr"');
    expect(xml).toContain("001234567890123456789");
    expect(xml).toContain("A&amp;B");
    expect(xml).not.toContain("<f>");
    expect(Object.keys(files)).toHaveLength(6);
    expect(strFromU8(files["xl/styles.xml"])).toContain('numFmtId="14"');
  });

  test("monthly exports include only the period installment and distinguish its competence from paid cash", () => {
    const snapshot: Snapshot = {
      user: { id: "user", email: "" },
      financial_accounts: [{ id: "account", name: "Conta" }],
      categories: [{ id: "cat", name: "Transportes" }],
      transactions: [{ id: "payment", account_id: "account", date: "2026-10-10", description: "Fatura paga", type: "invoice_payment", amount: "-50.00", status: "confirmed" }],
      credit_cards: [{ id: "card", name: "Cartão" }],
      credit_card_purchases: [{ id: "purchase", card_id: "card", description: "Compra", date: "2026-09-01", amount: "150.00", installments: "3", category_id: "cat", status: "confirmed" }],
      credit_card_invoices: [{ id: "oct", due_date: "2026-10-10" }, { id: "nov", due_date: "2026-11-10" }],
      credit_card_installments: [{ id: "oct-part", purchase_id: "purchase", invoice_id: "oct", amount: "50.00", number: "2" }, { id: "nov-part", purchase_id: "purchase", invoice_id: "nov", amount: "50.00", number: "3" }],
    };
    const exported = exportReportRows(snapshot, "2026-10-01", "2026-10-31");
    expect(exported).toHaveLength(2);
    expect(exported.find(row => row.type === "card_installment")).toMatchObject({ date: "2026-10-10", amount: "-50.00", record_kind: "monthly_competence", category: "Transportes" });
    expect(exported.find(row => row.type === "invoice_payment")).toMatchObject({ record_kind: "cash_ledger", source_id: "export:payment" });
    expect(exported.some(row => row.source_id === "installment:nov-part")).toBe(false);
  });
});
