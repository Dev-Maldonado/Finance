import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Snapshot } from "./summary";
export async function loadSnapshot(
  db: SupabaseClient,
  user: User,
): Promise<Snapshot> {
  const { data, error } = await db.rpc("read_financial_snapshot");
  if (error) throw new Error(`Snapshot financeiro: ${error.message}`);
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("Snapshot financeiro inválido; totais não calculados.");
  const totals = await db.from("investment_totals").select("equities,crypto,updated_at");
  if(totals.error)throw new Error("Não foi possível carregar os investimentos consolidados.");
  return {
    user: { id: user.id, email: user.email ?? "" },
    ...data,
    investment_totals: totals.data,
  } as Snapshot;
}
