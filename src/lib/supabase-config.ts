// Project URL and publishable key are public browser configuration.
// Administrative credentials must only come from server environment variables.
const defaultProject = {
  url: "https://jqxuwhvkcdfxuxfktzmw.supabase.co",
  key: "sb_publishable_gjOi7vB63ivtcLioaH7tmA_MZQLUQ3d",
};

export function supabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url && !key) return defaultProject;
  // Never combine credentials from different projects when an override is partial.
  if (!url || !key) return null;
  return { url, key };
}

export function requireSupabasePublicConfig() {
  const config = supabasePublicConfig();
  if (!config) throw new Error("Configure URL e chave pública do Supabase juntas.");
  return config;
}
