import {expect,test} from 'vitest';
import {pageViewSchema,presetRange,purchaseViewSchema,recurringViewSchema} from '../src/lib/view-preferences';
test('relative date presets follow today while explicit calendar/custom ranges remain explicit',()=>{
 expect(presetRange('month','2028-02-29')).toEqual({start:'2028-02-01',end:'2028-02-29'});
 expect(presetRange('previous','2026-01-01')).toEqual({start:'2025-12-01',end:'2025-12-31'});
 expect(presetRange('7','2026-11-02')).toEqual({start:'2026-10-27',end:'2026-11-02'});
 expect(presetRange('custom','2026-11-02')).toBeNull();
 expect(pageViewSchema.safeParse({period:'custom',start:'2026-10-31',end:'2026-10-01'}).success).toBe(false);
});
test('untrusted saved view data cannot restore invalid dates, unsupported statuses or arbitrary IDs',()=>{
 expect(pageViewSchema.safeParse({period:'custom',start:'2026-02-30',end:'2026-03-01'}).success).toBe(false);
 expect(pageViewSchema.safeParse({account:'not-an-account',status:'paid'}).success).toBe(false);
 expect(recurringViewSchema.safeParse({month:'2026-13',filter:'week'}).success).toBe(false);
 expect(purchaseViewSchema.safeParse({categoryId:'',search:'',status:'active',period:'all',start:'2026-11-01',end:'2026-10-01'}).success).toBe(false);
 expect(pageViewSchema.safeParse({period:'calendar',start:'2026-11-01',end:'2026-11-30',category:'uncategorized',excluded:true}).success).toBe(true);
});
