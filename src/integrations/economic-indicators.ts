import { serverFetch } from './benchmark-sync';
import { D } from '@/financial/engine';
export type EconomicIndicator = { value:string|null; reference:string|null; source:'Banco Central'|'IBGE'; url:string; error:string|null };
export type EconomicIndicators = { selic:EconomicIndicator; ipca:EconomicIndicator; checkedAt:string };
const selicBase='https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados';
export const ipcaURL='https://servicodados.ibge.gov.br/api/v3/agregados/1737/periodos/-12/variaveis/2265?localidades=N1%5Ball%5D';
function numeric(value:unknown,min:number,max:number) {
 if(typeof value!=='string'||!/^[-+]?\d+(?:[.,]\d+)?$/.test(value.trim()))throw Error('Valor oficial inválido');
 const number=D(value.trim().replace(',','.'));
 if(!number.isFinite()||number.lt(min)||number.gt(max))throw Error('Valor oficial fora do intervalo');
 return number.toFixed(2);
}
function date(value:unknown) {
 if(typeof value!=='string'||!/^\d{2}\/\d{2}\/\d{4}$/.test(value))throw Error('Data oficial inválida');
 const iso=value.split('/').reverse().join('-');
 if(new Date(`${iso}T00:00:00Z`).toISOString().slice(0,10)!==iso)throw Error('Data oficial inválida');
 return iso;
}
export function parseSelic(input:unknown,today:string) {
 if(!Array.isArray(input))throw Error('Resposta do Banco Central inválida');
 const entries=input.map(row=>({reference:date(row.data),value:numeric(row.valor,0,100)})).filter(row=>row.reference<=today).sort((a,b)=>a.reference.localeCompare(b.reference));
 const latest=entries.at(-1);
 if(!latest)throw Error('Sem referência oficial vigente');
 return latest;
}
export function parseIPCA(input:unknown,today:string) {
 if(!Array.isArray(input))throw Error('Resposta do IBGE inválida');
 const variable=input.find(row=>row.id==='2265'&&row.unidade==='%');
 const series=variable?.resultados?.flatMap((r:{series?:unknown[]})=>r.series??[]).find((s:{localidade?:{id:string;nivel?:{id:string}}})=>s.localidade?.id==='1'&&s.localidade?.nivel?.id==='N1')?.serie;
 if(!series||typeof series!=='object')throw Error('Série nacional IPCA indisponível');
 const latest=Object.entries(series).filter(([month])=>/^\d{4}(0[1-9]|1[0-2])$/.test(month)&&`${month.slice(0,4)}-${month.slice(4)}`<today.slice(0,7)).sort(([a],[b])=>a.localeCompare(b)).at(-1);
 if(!latest)throw Error('Sem mês oficial publicado');
 return {value:numeric(latest[1],-100,100),reference:`${latest[0].slice(0,4)}-${latest[0].slice(4)}`};
}
export async function loadEconomicIndicators(fetcher:typeof fetch=serverFetch,now=new Date()):Promise<EconomicIndicators> {
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(now);
 const start=new Date(`${today}T12:00:00Z`);start.setUTCDate(start.getUTCDate()-30);
 const format=(iso:string)=>iso.split('-').reverse().join('/');
 const selicURL=`${selicBase}?formato=json&dataInicial=${format(start.toISOString().slice(0,10))}&dataFinal=${format(today)}`;
 const get=async(url:string)=>{const response=await fetcher(url,{signal:AbortSignal.timeout(10000),next:{revalidate:3600},headers:{Accept:'application/json'}});if(!response.ok)throw Error('Fonte oficial indisponível');return response.json();};
 const [selic,ipca]=await Promise.allSettled([get(selicURL).then(data=>parseSelic(data,today)),get(ipcaURL).then(data=>parseIPCA(data,today))]);
 const result=(r:PromiseSettledResult<{value:string;reference:string}>,source:EconomicIndicator['source'],url:string):EconomicIndicator=>r.status==='fulfilled'?{...r.value,source,url,error:null}:{value:null,reference:null,source,url,error:'Não foi possível consultar a fonte oficial. Tente novamente mais tarde.'};
 return {selic:result(selic,'Banco Central',selicURL),ipca:result(ipca,'IBGE',ipcaURL),checkedAt:now.toISOString()};
}
