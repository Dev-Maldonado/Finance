/** Keep gateway/network failures readable while preserving the backend's business validation. */
export async function requestJson(url: string, init: RequestInit = {}) {
  let response: Response;
  try { response = await fetch(url, init); }
  catch { throw new Error('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'); }
  let result;
  try { result = await response.json(); }
  catch { throw new Error('O servidor não respondeu corretamente. Tente novamente em instantes.'); }
  if (result === null || typeof result !== 'object') throw new Error('O servidor não respondeu corretamente. Tente novamente em instantes.');
  if (!response.ok) throw new Error(result?.error || 'Não foi possível concluir a operação. Tente novamente.');
  return result;
}
