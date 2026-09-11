import cron from "node-cron";
import { env } from "../config/env.js";
import { runDailyCollect } from "../jobs/dailyCollect.js";

export function startScheduler(): void {
  if (!cron.validate(env.CRON_SCHEDULE)) {
    throw new Error(`Invalid CRON_SCHEDULE: "${env.CRON_SCHEDULE}"`);
  }

  cron.schedule(env.CRON_SCHEDULE, () => {
    console.log(`[cron] Starting daily collect run at ${new Date().toISOString()}`);
    runDailyCollect()
      .then(() => console.log("[cron] Daily collect run finished successfully."))
      .catch((err) => {
        console.error("ALERT: scheduled daily collect run failed", err);
      });
  });

  console.log(`Daily collect scheduled with cron expression "${env.CRON_SCHEDULE}".`);
}
