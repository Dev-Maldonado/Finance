import { syncBenchmarks } from '../src/integrations/benchmark-sync';
const results = await syncBenchmarks();
console.log(JSON.stringify(results));
if (results.some(r => r.status === 'error')) process.exitCode = 1;
