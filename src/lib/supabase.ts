import { createBrowserClient } from "@supabase/ssr";
import { requireSupabasePublicConfig } from "./supabase-config";
export function browserDb() {
  const { url, key } = requireSupabasePublicConfig();
  return createBrowserClient(url, key);
}
