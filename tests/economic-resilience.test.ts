import { expect,test,vi } from 'vitest';
import { loadEconomicIndicators,parseDollar,parseSidraIPCA } from '../src/integrations/economic-indicators';
import { cachedEconomicIndicators } from '../src/integrations/economic-cache';
import type { SupabaseClient } from '@supabase/supabase-js';
const now=new Date('2026-10-26T12:00:00Z');
const sidra=[{NC:'1',D1C:'1',D2C:'2265',D3C:'202609',MN:'%',V:'4.58'}];
const aggregate=[{id:'2265',unidade:'%',resultados:[{series:[{localidade:{id:'1',nivel:{id:'N1'}},serie:{202609:'4.58'}}]}]}];
const response=(value:unknown)=>({ok:true,json:async()=>value}) as Response;
const providers=vi.fn(async(url:string)=>response(url.includes('apisidra')?sidra:url.includes('olinda')?{value:[{cotacaoVenda:5.1234,dataHoraCotacao:'2026-10-23 13:00:00'}]}:[{data:'23/10/2026',valor:'13.75'}]));
test('SIDRA validates national accumulated inflation and excludes unreported months',()=>{
 expect(parseSidraIPCA([...sidra,{...sidra[0],D3C:'202610',V:'99'}],'2026-10-26')).toEqual({reference:'2026-09',value:'4.58'});
 expect(()=>parseSidraIPCA([{...sidra[0],D1C:'2'}],'2026-10-26')).toThrow();
});
test('PTAX keeps precision, uses last time within a day and excludes future/nonfinite quotes',()=>{
 expect(parseDollar({value:[{cotacaoVenda:5.2,dataHoraCotacao:'2026-10-23 13:00:00'},{cotacaoVenda:5.1,dataHoraCotacao:'2026-10-23 10:00:00'},{cotacaoVenda:99,dataHoraCotacao:'2026-10-27 13:00:00'}]},'2026-10-26')).toEqual({value:'5.2000',reference:'2026-10-23'});
 expect(()=>parseDollar({value:[{cotacaoVenda:'NaN',dataHoraCotacao:'2026-10-23 13:00:00'}]},'2026-10-26')).toThrow();
});
test('independent official requests and IBGE alternate route recover from upstream outages',async()=>{
 const valid=await loadEconomicIndicators(providers as typeof fetch,now);expect(valid.usd.value).toBe('5.1234');expect(valid.ipca.value).toBe('4.58');
 const fetcher=vi.fn(async(url:string)=>{if(url.includes('apisidra')||url.includes('olinda'))throw Error('down');return response(url.includes('ibge')?aggregate:[{data:'23/10/2026',valor:'13.75'}]);});
 const recovered=await loadEconomicIndicators(fetcher as typeof fetch,now);expect(recovered.ipca).toMatchObject({value:'4.58',source:'IBGE'});expect(recovered.usd.value).toBeNull();expect(recovered.selic.value).toBe('13.75');
 const fallback=await loadEconomicIndicators((async(url:string)=>{if(url.includes('ibge'))throw Error('down');return response(url.includes('13522')?[{data:'01/09/2026',valor:'4.58'},{data:'01/10/2026',valor:'99'}]:[{data:'23/10/2026',valor:'13.75'}]);}) as typeof fetch,now);
 expect(fallback.ipca).toMatchObject({value:'4.58',source:'Banco Central',reference:'2026-09'});
 const deflation=await loadEconomicIndicators((async(url:string)=>{if(url.includes('ibge'))throw Error('down');return response([{data:'01/09/2026',valor:url.includes('13522')?'-0.50':'13.75'}]);}) as typeof fetch,now);expect(deflation.ipca.value).toBe('-0.50');
});
const records=['selic','ipca','usd'].map(indicator=>({indicator,value:indicator==='usd'?'5.1234':'4.58',reference:indicator==='ipca'?'2026-09':'2026-10-23',source:indicator==='ipca'?'IBGE':'Banco Central',url:indicator==='ipca'?'https://apisidra.ibge.gov.br/values/':'https://api.bcb.gov.br/dados/',fetched_at:now.toISOString()}));
function db(data:unknown,fail=false){return {from:()=>({select:()=>({abortSignal:async()=>{if(fail)throw Error('cache failed');return {data,error:null};}})})} as unknown as SupabaseClient;}
test('fresh cache avoids remote calls; failed providers retain dated last valid values without invention',async()=>{
 const fetcher=vi.fn(async()=>{throw Error('down');});
 const fresh=await cachedEconomicIndicators(db(records),null,false,fetcher,now);expect(fetcher).not.toHaveBeenCalled();expect(fresh.usd.value).toBe('5.1234');
 const stale=await cachedEconomicIndicators(db(records),null,true,fetcher,now);expect(stale.ipca).toMatchObject({stale:true,value:'4.58',reference:'2026-09'});expect(stale.ipca.error).toContain('último dado');
 const empty=await cachedEconomicIndicators(db([]),null,false,fetcher,now);expect(empty.ipca.value).toBeNull();
});
test('cache read/write failures never discard successful official values',async()=>{
 const writer={from:()=>({upsert:()=>({abortSignal:async()=>{throw Error('cache down');}})})} as unknown as SupabaseClient;
 const result=await cachedEconomicIndicators(db([],true),writer,false,providers as typeof fetch,now);expect(result.ipca.value).toBe('4.58');expect(result.usd.value).toBe('5.1234');
});
