import { unzipSync, strFromU8 } from "fflate";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CVMProvider } from "./cvm";
import { fetchData } from "./providers";
import { fundId } from "@/lib/fund-id";
import { parseCsv } from "@/lib/import";
export async function syncCVM(db: SupabaseClient, month: string) {
  if (!/^\d{6}$/.test(month)) throw new Error("Mês CVM inválido");
  const response = await fetchData(
    `https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS/inf_diario_fi_${month}.zip`,
  );
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 80_000_000) throw new Error("Arquivo CVM excede limite");
  const files = unzipSync(bytes, {
    filter: (file) => {
      if (file.originalSize > 400_000_000)
        throw new Error("CSV CVM excede limite");
      return file.name.endsWith(".csv");
    },
  });
  const { data: assets, error } = await db
    .from("investment_assets")
    .select("cnpj,share_class")
    .eq("asset_class", "fund");
  if (error) throw error;
  const wanted = new Set(
    (assets ?? []).map((a) => fundId(a.cnpj, a.share_class || "")),
  );
  let count = 0;
  for (const content of Object.values(files)) {
    const text = new TextDecoder("windows-1252").decode(content);
    const data = new CVMProvider()
      .parseDailyCsv(text)
      .filter((r) => wanted.has(r.fund_id));
    for (let i = 0; i < data.length; i += 500) {
      const { error: e } = await db
        .from("fund_nav_history")
        .upsert(data.slice(i, i + 500), { onConflict: "fund_id,date" });
      if (e) throw e;
      count += Math.min(500, data.length - i);
    }
  }
  return count;
}
export async function syncFundRegistry(db: SupabaseClient) {
  const response = await fetchData(
    "https://dados.cvm.gov.br/dados/FI/CAD/DADOS/cad_fi.csv",
  );
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 100_000_000)
    throw new Error("Cadastro CVM excede limite");
  const entries = parseCsv(
    new TextDecoder("windows-1252").decode(bytes),
    ";",
  ).map((r) => {
    if (!r.CNPJ_FUNDO || !r.DENOM_SOCIAL)
      throw new Error("Layout CVM não reconhecido");
    const id = r.CNPJ_FUNDO.replace(/\D/g, "");
    return {
      id,
      cnpj: id,
      name: r.DENOM_SOCIAL,
      administrator: r.ADMIN,
      share_class: "",
      metadata: { status: r.SIT, classification: r.CLASSE },
    };
  });
  const registry = await fetchData(
    "https://dados.cvm.gov.br/dados/FI/CAD/DADOS/registro_fundo_classe.zip",
  );
  const bytesClasses = new Uint8Array(await registry.arrayBuffer());
  if (bytesClasses.length > 80_000_000)
    throw new Error("Cadastro de classes excede limite");
  const files = unzipSync(bytesClasses, {
    filter: (f) => {
      if (f.originalSize > 300_000_000)
        throw new Error("Cadastro de classes descompactado excede limite");
      return f.name.endsWith(".csv");
    },
  });
  const read = (name: string) => {
    const bytes = files[name];
    if (!bytes)
      throw new Error("Arquivo esperado ausente no cadastro de classes CVM");
    return parseCsv(new TextDecoder("windows-1252").decode(bytes), ";");
  };
  const funds = new Map(
    read("registro_fundo.csv").map((f) => [f.ID_Registro_Fundo, f]),
  );
  const classes = read("registro_classe.csv");
  const byId = new Map(classes.map((c) => [c.ID_Registro_Classe, c]));
  for (const c of classes) {
    if (!c.CNPJ_Classe || !c.Denominacao_Social)
      throw new Error("Layout de classes CVM não reconhecido");
    const parent = funds.get(c.ID_Registro_Fundo);
    const id = fundId(c.CNPJ_Classe);
    entries.push({
      id,
      cnpj: c.CNPJ_Classe.replace(/\D/g, ""),
      name: c.Denominacao_Social,
      administrator: parent?.Administrador || "",
      share_class: "",
      metadata: { status: c.Situacao, classification: c.Classificacao },
    });
  }
  for (const sub of read("registro_subclasse.csv")) {
    const c = byId.get(sub.ID_Registro_Classe);
    if (!c) throw new Error("Subclasse sem classe no cadastro oficial");
    const parent = funds.get(c.ID_Registro_Fundo);
    entries.push({
      id: fundId(c.CNPJ_Classe, sub.ID_Subclasse),
      cnpj: c.CNPJ_Classe.replace(/\D/g, ""),
      name: sub.Denominacao_Social || c.Denominacao_Social,
      administrator: parent?.Administrador || "",
      share_class: sub.ID_Subclasse,
      metadata: { status: sub.Situacao, classification: c.Classificacao },
    });
  }
  const distinct = [...new Map(entries.map((e) => [e.id, e])).values()];
  for (let i = 0; i < distinct.length; i += 500) {
    const { error } = await db
      .from("fund_registry")
      .upsert(distinct.slice(i, i + 500));
    if (error) throw error;
  }
  return distinct.length;
}
