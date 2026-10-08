import type { Row } from "@/lib/summary";
function download(data: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
export async function exportData(data: Row[], format: "csv" | "xlsx" | "pdf") {
  const safe = (v: unknown) => {
    const s = String(v ?? "");
    return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  };
  const keys = [...new Set(data.flatMap((row) => Object.keys(row)))];
  if (format === "csv") {
    const quote = (v: unknown) => '"' + safe(v).replaceAll('"', '""') + '"';
    download(
      "\uFEFF" +
        [
          keys.map(quote).join(","),
          ...data.map((row) => keys.map((k) => quote(row[k])).join(",")),
        ].join("\r\n"),
      "text/csv;charset=utf-8",
      "finora-transacoes.csv",
    );
    return;
  }
  if (format === "xlsx") {
    const { buildWorkbook } = await import("@/lib/workbook");
    const buffer = buildWorkbook(
      keys,
      data.map((r) => keys.map((k) => safe(r[k]))),
    );
    download(
      new Uint8Array(buffer),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "finora-relatorio.xlsx",
    );
    return;
  }
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create(),
    font = await doc.embedFont(StandardFonts.Helvetica);
  let page = doc.addPage([842, 595]),
    y = 550;
  const clean = (s: string) => s.replace(/[^\x20-\x7e\xa0-\xff]/g, " ");
  page.drawText("FINORA - Relatorio financeiro", {
    x: 30,
    y,
    size: 18,
    font,
    color: rgb(0.35, 0.2, 0.8),
  });
  y -= 35;
  for (const row of data) {
    const text = clean(Object.values(row).map(safe).join(" | "));
    const chunks = text.match(/.{1,145}/g) ?? [""];
    for (const chunk of chunks) {
      if (y < 35) {
        page = doc.addPage([842, 595]);
        y = 555;
      }
      page.drawText(chunk, { x: 30, y, size: 8, font });
      y -= 13;
    }
    y -= 6;
  }
  download(
    new Uint8Array(await doc.save()),
    "application/pdf",
    "finora-relatorio.pdf",
  );
}
