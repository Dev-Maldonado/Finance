import { expect,test,vi } from 'vitest';
import { parseSelic,parseIPCA,loadEconomicIndicators } from '../src/integrations/economic-indicators';
const ipca=(value='4.58')=>[{id:'2265',unidade:'%',resultados:[{series:[{localidade:{id:'1',nivel:{id:'N1'}},serie:{'202609':value}}]}]}];
test('BCB Selic is annual, references are valid and future observations cannot be displayed',()=>{
 expect(parseSelic([{data:'08/10/2026',valor:'13.75'},{data:'04/11/2026',valor:'99'}],'2026-10-09')).toEqual({value:'13.75',reference:'2026-10-08'});
 expect(()=>parseSelic([{data:'31/02/2026',valor:'13.75'}],'2026-10-09')).toThrow();
 expect(()=>parseSelic([{data:'08/10/2026',valor:'NaN'}],'2026-10-09')).toThrow();
});
test('IBGE accepts only the national 12-month IPCA series and published months, including deflation',()=>{
 expect(parseIPCA(ipca(),'2026-10-09')).toEqual({value:'4.58',reference:'2026-09'});
 expect(parseIPCA(ipca('-0.50'),'2026-10-09').value).toBe('-0.50');
 expect(()=>parseIPCA([{id:'63',unidade:'%'}],'2026-10-09')).toThrow();
 expect(()=>parseIPCA(ipca('...'),'2026-10-09')).toThrow();
});
test('independent API failures never substitute invented values and bounded official URLs are used',async()=>{
 const fetcher=vi.fn(async(url:string)=>{if(url.includes('bcb.gov'))throw Error('down');return {ok:true,json:async()=>ipca()} as Response;});
 const result=await loadEconomicIndicators(fetcher as typeof fetch,new Date('2026-10-09T12:00:00Z'));
 expect(result.selic).toMatchObject({value:null,reference:null,source:'Banco Central'});expect(result.ipca).toMatchObject({value:'4.58',reference:'2026-09',source:'IBGE'});
 expect(fetcher.mock.calls[0][0]).toContain('dataFinal=09/10/2026');
});
