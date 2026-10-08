import { zipSync, strToU8 } from "fflate";
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
        `<row r="${r + 1}">${row.map((value, c) => `<c r="${column(c)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`).join("")}</row>`,
    )
    .join("");
  const files = {
    "[Content_Types].xml":
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    "_rels/.rels":
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml":
      '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="FINORA" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${content}</sheetData></worksheet>`,
  };
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([name, s]) => [name, strToU8(s)]),
    ),
  );
}
