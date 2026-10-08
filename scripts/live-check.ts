import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { syncMarket } from "../src/integrations/sync";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
  throw new Error("Live verification requires the local development database");
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
let id: string | undefined;
try {
  const { data, error } = await db.auth.admin.createUser({
    email: `live-${randomUUID()}@example.test`,
    password: randomUUID() + "Aa1!",
    email_confirm: true,
  });
  if (error) throw error;
  id = data.user.id;
  const { error: e } = await db
    .from("investment_assets")
    .insert({
      user_id: id,
      ticker: "PETR4",
      name: "Public provider verification",
      asset_class: "stock",
    });
  if (e) throw e;
  const outcomes = await syncMarket();
  console.log(JSON.stringify(outcomes));
  if (outcomes.some((o) => o.status === "error")) process.exitCode = 1;
} finally {
  if (id) {
    const { error } = await db.auth.admin.deleteUser(id);
    if (error)
      throw new Error("Temporary verification user could not be removed");
  }
}
