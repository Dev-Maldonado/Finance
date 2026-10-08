import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireSupabasePublicConfig } from "./supabase-config";
export async function serverDb() {
  const store = await cookies();
  const { url, key } = requireSupabasePublicConfig();
  return createServerClient(
    url,
    key,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (items) => {
          try {
            items.forEach(({ name, value, options }) =>
              store.set(name, value, options),
            );
          } catch {
            /* Server component cannot set cookies; proxy refreshes them. */
          }
        },
      },
    },
  );
}
export async function authenticatedDb() {
  const db = await serverDb();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) throw new Error("UNAUTHORIZED");
  return { db, user };
}
