import { afterEach, expect, test, vi } from "vitest";
import { supabasePublicConfig } from "../src/lib/supabase-config";

afterEach(() => vi.unstubAllEnvs());

test("uses the configured hosted project when deployment variables are absent", () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  const config = supabasePublicConfig();
  expect(config?.url).toBe("https://jqxuwhvkcdfxuxfktzmw.supabase.co");
  expect(config?.key).toMatch(/^sb_publishable_/);
});

test("keeps local or alternate project URL and key together", () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "local-public-key");
  expect(supabasePublicConfig()).toEqual({
    url: "http://localhost:54321",
    key: "local-public-key",
  });
});

test("refuses partial overrides instead of mixing two projects", () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  expect(supabasePublicConfig()).toBeNull();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "local-public-key");
  expect(supabasePublicConfig()).toBeNull();
});
