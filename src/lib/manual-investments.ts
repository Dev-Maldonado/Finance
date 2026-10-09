import { D, money, position, type Operation } from '@/financial/engine';
import type { Snapshot, Row } from './summary';
const records = (s: Snapshot, key: string) => (s[key] as Row[] | undefined) ?? [];
const value = (row: Row, key: string) => String(row[key] ?? '');
export function manualPurchases(s: Snapshot, assetId: string): Row[] {
  return records(s,'manual_investment_purchases').filter(p => p.asset_id === assetId);
}
export function manualUpdates(s: Snapshot, assetId: string): Row[] {
  return records(s,'manual_investment_updates').filter(p => p.asset_id === assetId).sort((a,b) => value(a,'date').localeCompare(value(b,'date')));
}
export function manualOperations(s: Snapshot, asset: Row): Operation[] {
  const buys = manualPurchases(s,value(asset,'id')).filter(p => p.status !== 'cancelled').map(p => ({ id:value(p,'id'),asset_id:value(asset,'id'),type:'buy',quantity:value(p,'quantity'),price:'0',fees:'0',date:value(p,'date'),cost_override:value(p,'amount') }));
  return buys;
}
export function manualPosition(s: Snapshot, asset: Row, asOf: string) {
  const purchases = manualPurchases(s,value(asset,'id')).filter(p => p.status !== 'cancelled' && value(p,'date') <= asOf);
  const pos = position(manualOperations(s,asset).filter(p => p.date <= asOf),[]);
  const updates = manualUpdates(s,value(asset,'id')).filter(p => value(p,'date') <= asOf);
  const latest = updates.at(-1), previous = updates.at(-2);
  const supported = asset.currency === 'BRL';
  const current = latest && supported ? money(D(pos.quantity).mul(value(latest,'price'))) : null;
  const profit = current !== null ? money(D(current).minus(pos.cost)) : null;
  const percent = profit !== null && D(pos.cost).gt(0) ? D(profit).div(pos.cost).mul(100).toFixed(2) : null;
  const variation = latest && previous && D(value(previous,'price')).gt(0) ? D(value(latest,'price')).div(value(previous,'price')).minus(1).mul(100).toFixed(2) : null;
  const kind = value(asset,'manual_kind');
  return { asset, kind, pos, purchases, updates, latest, current, profit, percent, variation, supported };
}
export function manualPortfolio(s: Snapshot, asOf: string) {
  const positions = records(s,'investment_assets').map(a => manualPosition(s,a,asOf));
  const invested = money(positions.filter(p=>p.supported).reduce((total,p) => total.plus(p.pos.cost),D(0)));
  const priced = positions.filter(p => p.current !== null && D(p.pos.quantity).gt(0));
  const capital = priced.reduce((total,p) => total.plus(p.pos.cost),D(0));
  const current = money(priced.reduce((total,p) => total.plus(p.current!),D(0)));
  const profit = money(D(current).minus(capital));
  const pending = positions.filter(p => p.supported && !p.latest && D(p.pos.quantity).gt(0)).length;
  const percent = capital.gt(0) ? D(profit).div(capital).mul(100).toFixed(2) : null;
  const months = [...new Set(positions.flatMap(p => p.updates.map(u => value(u,'date').slice(0,7))))].filter(m => m <= asOf.slice(0,7)).sort();
  const history = months.map(month => {
    const end = new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
    const date = end < asOf ? end : asOf;
    const historical = positions.filter(p=>p.supported).map(p => manualPosition(s,p.asset,date));
    const applied = historical.reduce((total,p) => total.plus(p.pos.cost),D(0));
    const complete = historical.every(p => !D(p.pos.quantity).gt(0) || p.current !== null);
    const worth = complete ? money(historical.reduce((total,p) => total.plus(p.current ?? '0'),D(0))) : null;
    return { month, invested: money(applied), current: worth, profit: worth !== null ? money(D(worth).minus(applied)) : null };
  });
  return { positions, invested, current, profit, percent, pending, priced: priced.length, history };
}
