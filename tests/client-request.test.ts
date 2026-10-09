import { afterEach, expect, test, vi } from 'vitest';
import { requestJson } from '../src/lib/client-request';
afterEach(() => vi.unstubAllGlobals());
test('gateway HTML and lost connections show actionable messages rather than JSON/JavaScript errors', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Gateway timeout</html>', { status: 504 })));
  await expect(requestJson('/api/operations')).rejects.toThrow('O servidor não respondeu corretamente');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
  await expect(requestJson('/api/operations')).rejects.toThrow('Verifique sua conexão');
});
test('business validation and successful persisted results are preserved', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'Saldo insuficiente' }, { status: 400 })));
  await expect(requestJson('/api/operations')).rejects.toThrow('Saldo insuficiente');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ id: 'saved' })));
  await expect(requestJson('/api/operations')).resolves.toEqual({ id: 'saved' });
});
