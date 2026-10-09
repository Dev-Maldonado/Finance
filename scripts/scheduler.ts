import { syncMarket } from "../src/integrations/sync";
import { syncRecurring } from "../src/integrations/recurring-sync";
let running = false;
async function run() {
  if (running) return;
  running = true;
  try {
    const [results, recurring] = await Promise.all([syncMarket(), syncRecurring()]);
    console.log(JSON.stringify({ time: new Date().toISOString(), results, recurring }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Sync failed");
  } finally {
    running = false;
  }
}
await run();
const timer = setInterval(() => void run(), 24 * 60 * 60 * 1000);
const stop = () => {
  clearInterval(timer);
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
