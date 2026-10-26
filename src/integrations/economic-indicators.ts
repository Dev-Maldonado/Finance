import { serverFetch } from './benchmark-sync';
import { D } from '@/financial/engine';
export type EconomicIndicator = { value:string|null; reference:string|null; source:'Banco Central'|'IBGE'; url:string; error:string|null; stale?:boolean; fetchedAt?:string; note?:string };
export type EconomicIndicators = { selic:EconomicIndicator; ipca:EconomicIndicator; usd:EconomicIndicator; checkedAt:string };
const selicBase='https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados';
export const ipcaURL='https://servicodados.ibge.gov.br/api/v3/agregados/1737/periodos/-12/variaveis/2265?localidades=N1%5Ball%5D';
export const sidraURL='https://apisidra.ibge.gov.br/values/t/1737/n1/all/v/2265/p/last%2012';
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
function parseSGS(input:unknown,today:string,min:number) {
 if(!Array.isArray(input))throw Error('Resposta do Banco Central inválida');
 const entries=input.map(row=>({reference:date(row.data),value:numeric(row.valor,min,100)})).filter(row=>row.reference<=today).sort((a,b)=>a.reference.localeCompare(b.reference));
 const latest=entries.at(-1);
 if(!latest)throw Error('Sem referência oficial vigente');
 return latest;
}
export function parseSelic(input:unknown,today:string) { return parseSGS(input,today,0); }
export function parseIPCA(input:unknown,today:string) {
 if(!Array.isArray(input))throw Error('Resposta do IBGE inválida');
 const variable=input.find(row=>row.id==='2265'&&row.unidade==='%');
 const series=variable?.resultados?.flatMap((r:{series?:unknown[]})=>r.series??[]).find((s:{localidade?:{id:string;nivel?:{id:string}}})=>s.localidade?.id==='1'&&s.localidade?.nivel?.id==='N1')?.serie;
 if(!series||typeof series!=='object')throw Error('Série nacional IPCA indisponível');
 const latest=Object.entries(series).filter(([month])=>/^\d{4}(0[1-9]|1[0-2])$/.test(month)&&`${month.slice(0,4)}-${month.slice(4)}`<today.slice(0,7)).sort(([a],[b])=>a.localeCompare(b)).at(-1);
 if(!latest)throw Error('Sem mês oficial publicado');
 return {value:numeric(latest[1],-100,100),reference:`${latest[0].slice(0,4)}-${latest[0].slice(4)}`};
}
export function parseSidraIPCA(input:unknown,today:string) {
 if(!Array.isArray(input))throw Error('Resposta SIDRA inválida');
 const series=input.filter(r=>String(r.NC)==='1'&&String(r.D1C)==='1'&&String(r.D2C)==='2265'&&r.MN==='%').map(r=>[r.D3C,r.V]);
 return parseIPCA([{id:'2265',unidade:'%',resultados:[{series:[{localidade:{id:'1',nivel:{id:'N1'}},serie:Object.fromEntries(series)}]}]}],today);
}
export function parseDollar(input:unknown,today:string) {
 if(!input||typeof input!=='object'||!Array.isArray((input as {value:unknown}).value))throw Error('Resposta PTAX inválida');
 const entries=(input as {value:{cotacaoVenda:unknown;dataHoraCotacao:unknown}[]}).value.map(r=>{
  if(typeof r.dataHoraCotacao!=='string'||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(r.dataHoraCotacao))throw Error('Referência PTAX inválida');
  const reference=r.dataHoraCotacao.slice(0,10);date(reference.split('-').reverse().join('/'));
  const value=D(String(r.cotacaoVenda));if(!value.isFinite()||value.lte(0)||value.gt(1000))throw Error('Cotação PTAX inválida');
  return {reference,value:value.toFixed(4),time:r.dataHoraCotacao};
 }).filter(r=>r.reference<=today).sort((a,b)=>a.time.localeCompare(b.time));
 const latest=entries.at(-1);if(!latest)throw Error('Sem cotação oficial publicada');return {value:latest.value,reference:latest.reference};
}
export async function loadEconomicIndicators(fetcher:typeof fetch=serverFetch,now=new Date()):Promise<EconomicIndicators> {
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(now);
 const start=new Date(`${today}T12:00:00Z`);start.setUTCDate(start.getUTCDate()-30);
 const format=(iso:string)=>iso.split('-').reverse().join('/');
 const selicURL=`${selicBase}?formato=json&dataInicial=${format(start.toISOString().slice(0,10))}&dataFinal=${format(today)}`;
 const get=async(url:string)=>{const response=await fetcher(url,{signal:AbortSignal.timeout(4500),cache:'no-store',headers:{Accept:'application/json'}});if(!response.ok)throw Error('Fonte oficial indisponível');return response.json();};
 const ipcaFallback=`https://api.bcb.gov.br/dados/serie/bcdata.sgs.13522/dados?formato=json&dataInicial=${format(`${Number(today.slice(0,4))-1}-01-01`)}&dataFinal=${format(today)}`;
 const usdStart=new Date(`${today}T12:00:00Z`);usdStart.setUTCDate(usdStart.getUTCDate()-14);
 const usDate=(iso:string)=>`${iso.slice(5,7)}-${iso.slice(8,10)}-${iso.slice(0,4)}`;
 const usdURL=`https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@dataInicial='${usDate(usdStart.toISOString().slice(0,10))}'&@dataFinalCotacao='${usDate(today)}'&$top=20&$orderby=dataHoraCotacao%20desc&$format=json`;
 let ipcaSource:EconomicIndicator['source']='IBGE',ipcaSourceURL=sidraURL;
 const getIPCA=async()=>{
  try{return parseSidraIPCA(await get(sidraURL),today);}catch{}
  try{ipcaSourceURL=ipcaURL;return parseIPCA(await get(ipcaURL),today);}catch{}
  ipcaSource='Banco Central';ipcaSourceURL=ipcaFallback;
  const input=await get(ipcaFallback);
  if(!Array.isArray(input))throw Error('Série IPCA indisponível');
  const r=parseSGS(input.filter(row=>date(row.data).slice(0,7)<today.slice(0,7)),today,-100);return {...r,reference:r.reference.slice(0,7)};
 };
 const [selic,ipca,usd]=await Promise.allSettled([get(selicURL).then(data=>parseSelic(data,today)),getIPCA(),get(usdURL).then(data=>parseDollar(data,today))]);
 const result=(r:PromiseSettledResult<{value:string;reference:string}>,source:EconomicIndicator['source'],url:string):EconomicIndicator=>r.status==='fulfilled'?{...r.value,source,url,error:null}:{value:null,reference:null,source,url,error:'Não foi possível consultar a fonte oficial. Tente novamente mais tarde.'};
 return {selic:result(selic,'Banco Central',selicURL),ipca:{...result(ipca,ipcaSource,ipcaSourceURL),note:'IPCA nacional acumulado em 12 meses · IBGE'},usd:{...result(usd,'Banco Central',usdURL),note:'PTAX de venda · cotação diária oficial, sem cotação em tempo real'},checkedAt:now.toISOString()};
}
