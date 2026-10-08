import { fundId } from "@/lib/fund-id";
import { parseCsv } from "@/lib/import";
export class CVMProvider {
  // Feed rows are validated against the official layout; class/subclass is kept, never inferred from a ticker.
  parseDailyCsv(text: string) {
    return parseCsv(text, ";").map((row) => {
      const fund = row.CNPJ_FUNDO_CLASSE || row.CNPJ_FUNDO;
      const date = row.DT_COMPTC;
      const nav = row.VL_QUOTA;
      if (
        !fund ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !/^-?\d+(\.\d+)?$/.test(nav)
      )
        throw new Error("Informe CVM inválido ou layout não suportado");
      return {
        fund_id: fundId(fund, row.ID_SUBCLASSE || ""),
        date,
        nav,
        source: "CVM informe diário",
      };
    });
  }
}
