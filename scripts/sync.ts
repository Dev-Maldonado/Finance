import { syncMarket } from "../src/integrations/sync";
const results = await syncMarket();
console.log(JSON.stringify(results));
if (results.some((r) => r.status === "error")) process.exitCode = 1;
