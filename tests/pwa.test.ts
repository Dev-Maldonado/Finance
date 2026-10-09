import { describe,it,expect,vi } from 'vitest';
import vm from 'node:vm';
import { serviceWorkerSource } from '../src/lib/pwa-worker';
function worker() {
 const handlers:Record<string,(event:any)=>void>={};
 const cache={addAll:vi.fn().mockResolvedValue(undefined),match:vi.fn().mockResolvedValue(undefined),put:vi.fn().mockResolvedValue(undefined),keys:vi.fn().mockResolvedValue([]),delete:vi.fn().mockResolvedValue(true)};
 const caches={open:vi.fn().mockResolvedValue(cache),keys:vi.fn().mockResolvedValue(['finora-static-old','other-app']),delete:vi.fn().mockResolvedValue(true),match:vi.fn().mockResolvedValue(new Response('public offline'))};
 const fetch=vi.fn().mockResolvedValue(Object.defineProperty(new Response('public asset'),'type',{value:'basic'}));
 const self={location:{origin:'https://finora.test'},addEventListener:(name:string,fn:any)=>handlers[name]=fn,clients:{claim:vi.fn().mockResolvedValue(undefined)},skipWaiting:vi.fn()};
 vm.runInNewContext(serviceWorkerSource('new'),{self,caches,fetch,URL,Response});
 return {handlers,cache,caches,fetch,self};
}
describe('PWA protects authenticated financial data',()=>{
 it.each(['/api/snapshot','/api/operations','/api/manual-investments/price','/auth/callback','/cartoes?_rsc=abc'])('never caches %s',path=>{
  const w=worker(),respondWith=vi.fn();w.handlers.fetch({request:{url:`https://finora.test${path}`,method:'GET',mode:'cors'},respondWith});expect(respondWith).not.toHaveBeenCalled();expect(w.caches.open).not.toHaveBeenCalled();
 });
 it('does not intercept mutations or external authentication',()=>{
  const w=worker(),respondWith=vi.fn();for(const request of [{url:'https://finora.test/api/operations',method:'POST',mode:'cors'},{url:'https://project.supabase.co/auth/v1/token',method:'GET',mode:'cors'}])w.handlers.fetch({request,respondWith});expect(respondWith).not.toHaveBeenCalled();
 });
 it('always fetches navigation from network and serves only public fallback offline',async()=>{
  const w=worker();w.fetch.mockRejectedValue(new TypeError('offline'));let response:Promise<Response>|undefined;
  w.handlers.fetch({request:{url:'https://finora.test/transacoes',method:'GET',mode:'navigate'},respondWith:(p:Promise<Response>)=>response=p});expect(await (await response!).text()).toBe('public offline');expect(w.cache.put).not.toHaveBeenCalled();
 });
 it('caches immutable static assets',async()=>{
  const w=worker();let response:Promise<Response>|undefined;w.handlers.fetch({request:{url:'https://finora.test/_next/static/chunk.js',method:'GET',mode:'cors'},respondWith:(p:Promise<Response>)=>response=p});await response;expect(w.cache.put).toHaveBeenCalledOnce();
 });
 it('preloads only public files and waits for explicit update',async()=>{
  const w=worker();let pending:Promise<unknown>|undefined;w.handlers.install({waitUntil:(p:Promise<unknown>)=>pending=p});await pending;expect(w.cache.addAll.mock.calls[0][0]).toEqual(['/offline.html','/icons/icon-192.png','/icons/icon-512.png','/icons/maskable-512.png','/icons/apple-touch-icon.png']);expect(w.self.skipWaiting).not.toHaveBeenCalled();w.handlers.message({data:{type:'SKIP_WAITING'}});expect(w.self.skipWaiting).toHaveBeenCalledOnce();
 });
 it('removes only old FINORA caches on activation',async()=>{
  const w=worker();let pending:Promise<unknown>|undefined;w.handlers.activate({waitUntil:(p:Promise<unknown>)=>pending=p});await pending;expect(w.caches.delete).toHaveBeenCalledExactlyOnceWith('finora-static-old');
 });
});
