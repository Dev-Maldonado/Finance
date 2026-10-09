// Project URL and publishable key are public browser configuration.
// Administrative credentials must only come from server environment variables.
const defaultProject = {
  url: "https://jqxuwhvkcdfxuxfktzmw.supabase.co",
  key: "sb_publishable_gjOi7vB63ivtcLioaH7tmA_MZQLUQ3d",
};

export function supabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const deployment = process.env.NEXT_PUBLIC_FINORA_DEPLOYMENT_ENV || process.env.VERCEL_ENV;
  // Preview builds must explicitly use another project, in both browser and server.
  if (deployment === 'preview' && (!url || !key)) return null;
  if (!url && !key) return defaultProject;
  // Never combine credentials from different projects when an override is partial.
  if (!url || !key) return null;
  try {
    const parsed = new URL(url);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/' || (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:'))) return null;
    if (deployment === 'preview' && parsed.origin === defaultProject.url) return null;
  } catch { return null; }
  return { url, key };
}

export function requireSupabasePublicConfig() {
  const config = supabasePublicConfig();
  if (!config) throw new Error("Configure URL e chave pública do Supabase juntas.");
  return config;
}
