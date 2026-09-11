import { pool } from "../db/pool.js";
import { runBackfill } from "../jobs/backfill.js";

runBackfill()
  .then(() => pool.end())
  .catch((err) => {
    console.error("ALERT: backfill failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
    return pool.end();
  });
