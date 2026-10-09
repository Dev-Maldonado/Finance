export function deadline(timeoutMs: number, parent?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Prazo da sincronização excedido')), timeoutMs);
  timer.unref?.();
  const abort = () => controller.abort(parent?.reason);
  if (parent?.aborted) abort(); else parent?.addEventListener('abort', abort, { once: true });
  return { signal: controller.signal, close() { clearTimeout(timer); parent?.removeEventListener('abort', abort); } };
}

export function within<T>(promise: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export function signaled<T extends PromiseLike<unknown>>(query: T, signal: AbortSignal): T {
  const cancellable = query as T & { abortSignal?: (signal: AbortSignal) => T };
  return cancellable.abortSignal ? cancellable.abortSignal(signal) : query;
}
