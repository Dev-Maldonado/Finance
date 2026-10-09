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
  return {
    user: { id: user.id, email: user.email ?? "" },
    ...data,
  } as Snapshot;
}
