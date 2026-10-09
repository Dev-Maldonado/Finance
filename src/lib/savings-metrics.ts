import { D, money } from '@/financial/engine';
import { manualSavingsPosition } from './manual-savings';
import { rows, str, type Snapshot } from './summary';
import { dateShift } from './dashboard';
export function savingsMetrics(snapshot: Snapshot,today: string,periodStart=`${today.slice(0,7)}-01`) {
 const details=rows(snapshot,'savings_goals').map(goal=>{
  const current=manualSavingsPosition(snapshot,goal,today),before=manualSavingsPosition(snapshot,goal,dateShift(periodStart,-1));
  return { goalId:str(goal,'id'),daily:'0.00',monthly:money(D(current.earnings).minus(before.earnings)),cumulative:current.profit??'0.00',asOf:current.latest?str(current.latest,'date'):null,complete:current.known,unallocatedYieldWithdrawal:false,waitingForRate:false,waitingSince:null };
 });
 return { latestCDI:undefined as import('./summary').Row | undefined,details,daily:'0.00',monthly:money(details.reduce((a,d)=>a.plus(d.monthly),D(0))),unallocatedYieldWithdrawal:false };
}
export function savingsPeriodMetrics(snapshot: Snapshot,start: string,end: string,today: string) {
 const asOf=end<today?end:today;
 if(start>asOf)return {value:'0.00',unallocatedYieldWithdrawal:false,partial:false};
 const metrics=savingsMetrics(snapshot,asOf,start);
 return {value:metrics.monthly,unallocatedYieldWithdrawal:false,partial:metrics.details.some(d=>!d.complete)};
}
