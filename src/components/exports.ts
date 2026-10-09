import { rows, str, type Row, type Snapshot } from "@/lib/summary";
import { periodMetrics } from "@/lib/dashboard";
import { D, money } from "@/financial/engine";
import { numericColumn } from "@/lib/workbook";
import { categoryLabel } from '@/lib/categories';
export type ExportOptions = { title?: string; period?: string; summary?: Record<string, string> };
function download(data: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function safeExportCell(value: unknown, key = "") {
  const raw = String(value ?? "");
  if (numericColumn(key) && /^-?\d+(?:\.\d+)?$/.test(raw)) return raw;
  return /^[=+\-@\t\r\n]/.test(raw.trimStart()) ? `'${raw}` : raw;
}
export function buildCsv(data: Row[]) {
  const keys = [...new Set(data.flatMap(row => Object.keys(row)))];
  const quote = (value: unknown, key = "") => `"${safeExportCell(value, key).replaceAll('"', '""')}"`;
  return "\uFEFF" + [keys.map(k => quote(k)).join(","), ...data.map(row => keys.map(k => quote(row[k], k)).join(","))].join("\r\n");
}
export function exportReportRows(snapshot: Snapshot, start: string, end: string, fullInvoiceMonths = false, asOf = end): Row[] {
  const metrics = periodMetrics(snapshot, start, end, fullInvoiceMonths, asOf);
  const category = (id: unknown) => categoryLabel(rows(snapshot, 'categories'), String(id ?? ''), ' / ');
  return [
    ...metrics.tx.map(t => ({ date: str(t, "date"), description: str(t, "description"), amount: str(t, "amount"), type: str(t, "type"), category: category(t.category_id), account: str(rows(snapshot, "financial_accounts").find(a => a.id === t.account_id) ?? {}, "name"), source_id: str(t, "source_id") || `export:${str(t, "id")}`, status: str(t, "status"), record_kind: "cash_ledger" })),
    ...metrics.installments.map(part => ({ date: str(part, "date"), description: `${str(part, "description")} · parcela ${str(part, "number")}/${str(part, "installments")}`, amount: money(D(str(part, "amount")).neg()), type: "card_installment", category: category(part.category_id), account: str(rows(snapshot, "credit_cards").find(c => c.id === part.card_id) ?? {}, "name"), source_id: `installment:${str(part, "id")}`, status: "scheduled_bill", record_kind: "monthly_competence" })),
  ].sort((a,b) => a.date.localeCompare(b.date));
}
export async function exportData(data: Row[], format: "csv" | "xlsx" | "pdf", options: ExportOptions = {}) {
  const keys = [...new Set(data.flatMap(row => Object.keys(row)))];
  if (format === "csv") { download(buildCsv(data), "text/csv;charset=utf-8", "finora-transacoes.csv"); return; }
  if (format === "xlsx") {
    const { buildWorkbook } = await import("@/lib/workbook");
    download(new Uint8Array(buildWorkbook(keys, data.map(row => keys.map(k => safeExportCell(row[k], k))))), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "finora-relatorio.xlsx"); return;
  }
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const clean = (text: string) => text.replace(/[^\x20-\x7e\xa0-\xff]/g, " ");
  const currency = (value: string) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
  let page = doc.addPage([842, 595]), y = 555, number = 0;
  const columns = ["date", "description", "category", "type", "amount"], labels = ["Data", "Descrição", "Categoria / subcategoria", "Tipo", "Valor (R$)"], positions = [30, 105, 360, 570, 735];
  const header = () => {
    number++; page.drawText(clean(options.title || "FINORA - Relatório financeiro"), { x: 30, y, size: 18, font: bold, color: rgb(.35,.2,.8) }); y -= 25;
    page.drawText(clean(`${options.period || "Registros selecionados"} · ${data.length} registros · Página ${number}`), { x: 30, y, size: 9, font }); y -= 24;
    labels.forEach((label,i) => page.drawText(clean(label), { x: positions[i], y, size: 10, font: bold })); y -= 8;
    page.drawLine({ start: { x: 30, y }, end: { x: 810, y }, thickness: .5, color: rgb(.8,.8,.85) }); y -= 15;
  };
  const newPage = () => { page = doc.addPage([842, 595]); y = 555; header(); };
  header();
  for (const row of data) {
    if (y < 65) newPage();
    const values = columns.map(k => str(row,k));
    if (!values[1]) values[1] = Object.entries(row).filter(([k]) => !columns.includes(k)).map(([k,v]) => `${k}: ${v ?? ""}`).join(" · ");
    if (values[0]) values[0] = values[0].split("-").reverse().join("/");
    values[4] = /^-?\d+(\.\d+)?$/.test(values[4]) ? currency(values[4]) : values[4];
    const wrapped = values.map((value, i) => {
      const width = (positions[i + 1] ?? 815) - positions[i] - 10;
      const chunks: string[] = [];
      let line = '';
      for (const character of clean(value)) {
        if (line && font.widthOfTextAtSize(line + character, 8) > width) { chunks.push(line); line = ''; }
        line += character;
      }
      chunks.push(line);
      return chunks;
    });
    const height = Math.max(...wrapped.map(lines => lines.length)) * 11 + 7;
    if (y - height < 50) newPage();
    wrapped.forEach((lines, i) => lines.forEach((line, lineIndex) => page.drawText(line, { x: positions[i], y: y - lineIndex * 11, size: 8, font })));
    y -= height;
  }
  if (options.summary) {
    if (y < 105) newPage(); y -= 12;
    for (const [label,value] of Object.entries(options.summary)) { if (y<40)newPage(); page.drawText(clean(`${label}: ${currency(value)}`), { x: 30,y,size: 10,font: bold });y-=17; }
  }
  if (y < 50) newPage();
  page.drawText("Parcelas representam competência mensal. Pagamento de fatura não repete a despesa.", { x:30,y:y-15,size:8,font });
  download(new Uint8Array(await doc.save()), "application/pdf", "finora-relatorio.pdf");
}
