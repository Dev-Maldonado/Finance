import { syncMarket } from "../src/integrations/sync";
import { syncRecurring } from "../src/integrations/recurring-sync";
const [results, recurring] = await Promise.all([syncMarket(), syncRecurring()]);
console.log(JSON.stringify({ results, recurring }));
if (results.some((r) => r.status === "error" || r.status === "partial")) process.exitCode = 1;
