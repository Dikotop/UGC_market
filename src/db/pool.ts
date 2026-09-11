import pg from "pg";
import { env } from "../config/env.js";

// Metric counters are stored as BIGINT, which pg hands back as strings by
// default. They stay far below Number.MAX_SAFE_INTEGER, so parse them as
// numbers to keep the API returning JSON numbers.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));

// DATE columns are calendar days with no time or zone; parsing them into JS
// Dates would shift them by the local UTC offset, so keep them as strings.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
});

pool.on("error", (err) => {
  console.error("ALERT: unexpected Postgres pool error", err);
});
