import { syncMarket } from "../src/integrations/sync";
let running = false;
async function run() {
  if (running) return;
  running = true;
  try {
    const results = await syncMarket();
    console.log(JSON.stringify({ time: new Date().toISOString(), results }));
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
