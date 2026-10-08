import type { SupabaseClient, User } from "@supabase/supabase-js";
import { selects } from "./resources";
import type { Snapshot } from "./summary";
export async function loadSnapshot(
  db: SupabaseClient,
  user: User,
): Promise<Snapshot> {
  const entries = await Promise.all(
    Object.entries(selects)
      .filter(([name]) => name !== "fund_registry")
      .map(async ([name, fields]) => {
        const records: unknown[] = [];
        const order = name === "provider_sync_states" ? "provider" : "id";
        for (let offset = 0; offset < 100000; offset += 1000) {
          const { data, error } = await db
            .from(name)
            .select(fields)
            .order(order)
            .range(offset, offset + 999);
          if (error) throw new Error(`${name}: ${error.message}`);
          records.push(...data);
          if (data.length < 1000) return [name, records];
        }
        throw new Error(
          `Volume de ${name} excede o limite do dashboard; totais não calculados.`,
        );
      }),
  );
  return {
    user: { id: user.id, email: user.email ?? "" },
    ...Object.fromEntries(entries),
  } as Snapshot;
}
