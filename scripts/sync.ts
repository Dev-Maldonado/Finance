import { syncBenchmarks } from "../src/integrations/benchmark-sync";
import { syncRecurring } from "../src/integrations/recurring-sync";
const [results, recurring] = await Promise.all([syncBenchmarks(), syncRecurring()]);
console.log(JSON.stringify({ results, recurring }));
if (results.some(r => r.status === "error")) process.exitCode = 1;
