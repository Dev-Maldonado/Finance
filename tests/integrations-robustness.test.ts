import { test, expect, vi, afterEach } from 'vitest';
import { boundedBytes, fetchData } from '../src/integrations/providers';
import { supabasePublicConfig } from '../src/lib/supabase-config';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); });
test('compressed feeds are size-limited while reading, rather than after allocating the whole payload', async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(4)); controller.enqueue(new Uint8Array(4)); }, cancel() { cancelled = true; } });
  await expect(boundedBytes(new Response(stream), 5)).rejects.toThrow('excede limite');
  expect(cancelled).toBe(true);
});

test('a global abort stops retry backoff and prevents additional network attempts', async () => {
  vi.useFakeTimers();
  const abort = new AbortController();
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 429 }));
  const result = expect(fetchData('https://example.test', { signal: abort.signal }, 3)).rejects.toThrow('deadline');
  await Promise.resolve();
  abort.abort(new Error('deadline'));
  await vi.runAllTimersAsync();
  await result;
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test('preview deployments reject absent configuration and the production project, but accept a separate project', () => {
  vi.stubEnv('NEXT_PUBLIC_FINORA_DEPLOYMENT_ENV', 'preview');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', ''); vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
  expect(supabasePublicConfig()).toBeNull();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://jqxuwhvkcdfxuxfktzmw.supabase.co/'); vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public-key');
  expect(supabasePublicConfig()).toBeNull();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://JQXUWHVKCDFXUXFKTZMW.supabase.co/');
  expect(supabasePublicConfig()).toBeNull();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://dedicated-preview.supabase.co');
  expect(supabasePublicConfig()?.url).toBe('https://dedicated-preview.supabase.co');
});
