import { createServer } from "./api/server.js";
import { env } from "./config/env.js";
import { startScheduler } from "./cron/scheduler.js";

const app = createServer();

app.listen(env.PORT, () => {
  console.log(`UGC_market analytics server listening on port ${env.PORT}`);
  startScheduler();
});
