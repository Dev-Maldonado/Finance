import {D,money} from '@/financial/engine';
import {manualPosition} from './manual-investments';
import type {Snapshot,Row} from './summary';
export function investmentTotals(snapshot:Snapshot,asOf:string){
 const saved=(snapshot.investment_totals as Row[]|undefined)?.[0];
 let equities=D(0),crypto=D(0);
 if(saved){equities=D(String(saved.equities));crypto=D(String(saved.crypto));}
 else for(const asset of (snapshot.investment_assets as Row[]|undefined)??[]){
  const p=manualPosition(snapshot,asset,asOf);if(!p.supported)continue;
  const amount=p.current??p.pos.cost;
  if(asset.manual_kind==='crypto')crypto=crypto.plus(amount);else equities=equities.plus(amount);
 }
 return {equities:money(equities),crypto:money(crypto),total:money(equities.plus(crypto)),updatedAt:saved?String(saved.updated_at):null,consolidated:!!saved};
}
