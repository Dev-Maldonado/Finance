import { createClient } from '@supabase/supabase-js';
import { requireSupabasePublicConfig } from '../lib/supabase-config';
import { serverFetch } from './benchmark-sync';

// Generates pending entries only. Confirmation of payment remains explicit.
export async function syncRecurring() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new Error('Configuração do agendador indisponível');
  const db = createClient(requireSupabasePublicConfig().url, key, {
    auth: { persistSession: false }, global: { fetch: serverFetch },
  });
  const until_date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const { data, error } = await db.rpc('generate_all_recurring', { until_date }).abortSignal(AbortSignal.timeout(9000));
  if (error) throw new Error('Não foi possível gerar as recorrências previstas; pagamentos existentes preservados');
  return data as { generated: number; users: number };
}
