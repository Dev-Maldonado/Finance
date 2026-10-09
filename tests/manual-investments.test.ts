import { expect, test } from 'vitest';
import { manualPortfolio } from '../src/lib/manual-investments';
import { financialSummary, type Snapshot } from '../src/lib/summary';
import { portfolioPerformance } from '../src/financial/portfolio-performance';
const asset = { id:'a',name:'Fundo XPTO',ticker:'MANUAL',currency:'BRL',asset_class:'custom',manual_kind:'fund',manual_control:true };
const snapshot = (extra: Partial<Snapshot> = {}): Snapshot => ({ user:{id:'u',email:'u@test'},investment_assets:[asset],manual_investment_purchases:[{id:'1',asset_id:'a',quantity:'10',amount:'1000',date:'2026-08-01',status:'confirmed'},{id:'2',asset_id:'a',quantity:'5',amount:'600',date:'2026-08-10',status:'confirmed'}],manual_investment_updates:[{id:'v1',asset_id:'a',price:'130',date:'2026-08-31',month:'2026-08-01'}],...extra } as Snapshot);
test('multiple fund entries consolidate exact capital, quantity, weighted average and 21.88% profit',()=>{
 const s=snapshot(),p=manualPortfolio(s,'2026-08-31');
 expect(p).toMatchObject({invested:'1600.00',current:'1950.00',profit:'350.00',percent:'21.88',pending:0});
 expect(p.positions[0].pos).toMatchObject({quantity:'15.00000000',average:'106.66666667'});
 expect(financialSummary(s,'2026-08-01','2026-08-31','2026-08-31').investments).toBe('1950.00');
});
test('crypto fractional units and different purchase prices retain every acquisition and exact totals',()=>{
 const s=snapshot({investment_assets:[{...asset,name:'Bitcoin',manual_kind:'crypto'}],manual_investment_purchases:[
  {id:'1',asset_id:'a',quantity:'0.002',amount:'1000',date:'2026-08-01'},
  {id:'2',asset_id:'a',quantity:'0.003',amount:'1200',date:'2026-08-02'},
  {id:'3',asset_id:'a',quantity:'0.001',amount:'500',date:'2026-08-03'},
 ],manual_investment_updates:[{id:'v1',asset_id:'a',price:'500000',date:'2026-08-31'}]});
 const p=manualPortfolio(s,'2026-08-31');expect(p).toMatchObject({invested:'2700.00',current:'3000.00',profit:'300.00'});expect(p.positions[0].pos.average).toBe('450000.00000000');expect(p.positions[0].purchases).toHaveLength(3);
});
test('without a manual update, imported market prices never fabricate manual value or returns',()=>{
 const s=snapshot({manual_investment_updates:[],asset_price_history:[{ticker:'MANUAL',price:'999',date:'2026-08-31',currency:'BRL',source:'brapi'}],fund_nav_history:[{fund_id:'',nav:'999',date:'2026-08-31'}]});
 const p=manualPortfolio(s,'2026-08-31');expect(p.pending).toBe(1);expect(p.positions[0]).toMatchObject({current:null,profit:null,percent:null});expect(p.history).toEqual([]);
 const summary=financialSummary(s,'2026-08-01','2026-08-31','2026-08-31');expect(summary.investments).toBe('1600.00');expect(summary.positions[0].quote).toBeUndefined();expect(summary.positions[0].unrealized).toBe('0.00');
});
test('new capital is not monthly profit: unchanged unit price keeps price variation at zero',()=>{
 const s=snapshot({manual_investment_purchases:[{id:'1',asset_id:'a',quantity:'10',amount:'1000',date:'2026-08-01'},{id:'2',asset_id:'a',quantity:'5',amount:'500',date:'2026-09-10'}],manual_investment_updates:[{id:'v1',asset_id:'a',price:'100',date:'2026-08-31'},{id:'v2',asset_id:'a',price:'100',date:'2026-09-30'}]});
 const p=manualPortfolio(s,'2026-09-30');expect(p.history).toEqual([{month:'2026-08',invested:'1000.00',current:'1000.00',profit:'0.00'},{month:'2026-09',invested:'1500.00',current:'1500.00',profit:'0.00'}]);expect(p.positions[0].variation).toBe('0.00');expect(p.profit).toBe('0.00');
 expect(portfolioPerformance(s,'2026-09-01','2026-09-30').personal).not.toBeNull();
});
test('corrections/cancellations, losses, a zero unit value and future records respect historical dates',()=>{
 const s=snapshot({manual_investment_purchases:[{id:'1',asset_id:'a',quantity:'10',amount:'1000',date:'2026-08-01'},{id:'2',asset_id:'a',quantity:'5',amount:'600',date:'2026-08-10',status:'cancelled'},{id:'3',asset_id:'a',quantity:'20',amount:'2000',date:'2026-10-10'}],manual_investment_updates:[{id:'v1',asset_id:'a',price:'90',date:'2026-08-31'},{id:'v2',asset_id:'a',price:'0',date:'2026-09-30'},{id:'v3',asset_id:'a',price:'999',date:'2026-10-31'}]});
 expect(manualPortfolio(s,'2026-08-31')).toMatchObject({invested:'1000.00',current:'900.00',profit:'-100.00',percent:'-10.00'});
 expect(manualPortfolio(s,'2026-09-30')).toMatchObject({invested:'1000.00',current:'0.00',profit:'-1000.00',percent:'-100.00'});
});
test('partial prices keep unpriced capital out of profit calculations; foreign currencies are never summed as reais',()=>{
 const s=snapshot({investment_assets:[asset,{...asset,id:'b',name:'Ethereum',manual_kind:'crypto'},{...asset,id:'c',name:'Legacy USD',currency:'USD'}],manual_investment_purchases:[{id:'1',asset_id:'a',quantity:'10',amount:'1000',date:'2026-08-01'},{id:'2',asset_id:'b',quantity:'1',amount:'500',date:'2026-08-01'},{id:'3',asset_id:'c',quantity:'1',amount:'9999',date:'2026-08-01'}]});
 const p=manualPortfolio(s,'2026-08-31');expect(p).toMatchObject({invested:'1500.00',current:'1300.00',profit:'300.00',percent:'30.00',pending:1});expect(p.history[0].current).toBeNull();
});
