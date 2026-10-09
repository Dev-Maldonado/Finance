import { zipSync, strToU8 } from "fflate";
import { D } from "@/financial/engine";
export const numericColumn = (header: string) => /^(amount|valor|balance|initial_balance|confirmed_balance|registered_balance|difference|price|preco|nav|quantity|quantidade|fees|taxas|cost|custo|target|meta|budget|percentage|annual_rate|rate|ir_amount|iof_amount|yield_amount|total|principal|remaining|receipts|expenses|income|net|yield|liabilities|assets|credit_limit|ir_rate)$/i.test(header.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
const xml = (v: unknown) =>
  String(v ?? "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
function column(i: number) {
  let label = "";
  for (i++; i > 0; i = Math.floor((i - 1) / 26))
    label = String.fromCharCode(65 + ((i - 1) % 26)) + label;
  return label;
}
export function buildWorkbook(headers: string[], rows: unknown[][]) {
  const content = [headers, ...rows]
    .map(
      (row, r) =>
        `<row r="${r + 1}">${row.map((value, c) => {
          const reference = `${column(c)}${r + 1}`, raw = String(value ?? "");
          if (r > 0 && numericColumn(headers[c]) && /^-?\d+(?:\.\d+)?$/.test(raw) && D(raw).sd() <= 15) return `<c r="${reference}" t="n"><v>${raw}</v></c>`;
          if (r > 0 && /^(date|data|due_date|start_date|target_date|month)$/.test(headers[c]) && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
            const serial = Date.parse(`${raw}T00:00:00Z`) / 86400000 + 25569;
            if (Number.isFinite(serial)) return `<c r="${reference}" s="1" t="n"><v>${serial}</v></c>`;
          }
          return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
        }).join("")}</row>`,
    )
    .join("");
  const files = {
    "[Content_Types].xml":
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    "_rels/.rels":
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml":
      '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="FINORA" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    "xl/styles.xml": '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>',
    "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${content}</sheetData></worksheet>`,
  };
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([name, s]) => [name, strToU8(s)]),
    ),
  );
}
