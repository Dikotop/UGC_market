import { pool } from "../db/pool.js";
import { runDailyCollect } from "../jobs/dailyCollect.js";

runDailyCollect()
  .then(() => pool.end())
  .catch((err) => {
    console.error("ALERT:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
    return pool.end();
  });
