import { fundId } from "@/lib/fund-id";
import { parseCsv } from "@/lib/import";
import { validatedDate, ProviderValidationError } from './providers';
export class CVMProvider {
  // Feed rows are validated against the official layout; class/subclass is kept, never inferred from a ticker.
  parseDailyCsv(text: string) {
    return parseCsv(text, ";").map((row) => {
      const fund = row.CNPJ_FUNDO_CLASSE || row.CNPJ_FUNDO;
      const date = row.DT_COMPTC;
      const nav = row.VL_QUOTA;
      if (
        !fund || fund.replace(/\D/g, '').length !== 14 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !/^-?\d+(\.\d+)?$/.test(nav)
      )
        throw new ProviderValidationError("Informe CVM inválido ou layout não suportado");
      return {
        fund_id: fundId(fund, row.ID_SUBCLASSE || ""),
        date: validatedDate(date),
        nav,
        source: "CVM informe diário",
      };
    });
  }
}
