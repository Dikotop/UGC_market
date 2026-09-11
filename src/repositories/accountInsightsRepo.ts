import { pool } from "../db/pool.js";
import type { AccountMetric } from "../instagram/insights.js";

// Whitelist mapping metric -> column name, so the column can be safely
// interpolated into SQL (it never comes from unvalidated input).
const METRIC_COLUMNS: Record<AccountMetric, string> = {
  reach: "reach",
  follower_count: "follower_count",
  online_followers: "online_followers",
  views: "views",
  likes: "likes",
  comments: "comments",
  shares: "shares",
  saves: "saves",
  replies: "replies",
  profile_views: "profile_views",
  website_clicks: "website_clicks",
  profile_links_taps: "profile_links_taps",
  accounts_engaged: "accounts_engaged",
  total_interactions: "total_interactions",
};

/** Writes several metrics for one date in a single statement. */
export async function upsertAccountMetrics(
  igAccountId: number,
  date: string,
  values: Map<AccountMetric, number>,
): Promise<void> {
  const entries = [...values.entries()].filter(([metric]) => metric in METRIC_COLUMNS);
  if (entries.length === 0) return;

  const columns = entries.map(([metric]) => METRIC_COLUMNS[metric]);
  const placeholders = entries.map((_, i) => `$${i + 3}`);
  const updates = columns.map((c) => `${c} = EXCLUDED.${c}`);

  await pool.query(
    `INSERT INTO account_insights_daily (ig_account_id, metric_date, ${columns.join(", ")})
     VALUES ($1, $2, ${placeholders.join(", ")})
     ON CONFLICT (ig_account_id, metric_date) DO UPDATE SET
       ${updates.join(", ")},
       updated_at = now()`,
    [igAccountId, date, ...entries.map(([, value]) => value)],
  );
}

/**
 * Dates that already have total_value metrics written, so a re-run can skip
 * them instead of walking the whole two years again. `views` stands in for
 * the set: every total_value write includes it, even as a zero.
 */
export async function listDatesWithTotalValues(igAccountId: number): Promise<Set<string>> {
  const { rows } = await pool.query<{ metric_date: string }>(
    `SELECT metric_date FROM account_insights_daily
     WHERE ig_account_id = $1 AND views IS NOT NULL`,
    [igAccountId],
  );
  return new Set(rows.map((r) => r.metric_date));
}

/**
 * Earliest date each metric has a non-zero value on. Zeros are what the API
 * reports for days outside the range it still holds data for, so they don't
 * count as coverage.
 */
export async function getEarliestNonZeroDates(
  igAccountId: number,
  metrics: readonly AccountMetric[],
): Promise<Map<AccountMetric, string>> {
  const known = metrics.filter((m) => m in METRIC_COLUMNS);
  if (known.length === 0) return new Map();

  const selects = known.map((m) => {
    const column = METRIC_COLUMNS[m];
    return `min(metric_date) FILTER (WHERE ${column} > 0) AS ${column}`;
  });

  const { rows } = await pool.query(
    `SELECT ${selects.join(", ")} FROM account_insights_daily WHERE ig_account_id = $1`,
    [igAccountId],
  );

  const out = new Map<AccountMetric, string>();
  for (const metric of known) {
    const value = rows[0]?.[METRIC_COLUMNS[metric]];
    if (value) out.set(metric, typeof value === "string" ? value : String(value));
  }
  return out;
}

export type BackfillStatus = "completed" | "partial" | "failed";

export async function upsertBackfillStatus(params: {
  igAccountId: number;
  metricName: string;
  earliestAvailableDate: string | null;
  status: BackfillStatus;
  notes?: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO metric_backfill_status (ig_account_id, metric_name, earliest_available_date, status, notes, last_run_at)
     VALUES ($1,$2,$3,$4,$5, now())
     ON CONFLICT (ig_account_id, metric_name) DO UPDATE SET
       earliest_available_date = EXCLUDED.earliest_available_date,
       status = EXCLUDED.status,
       notes = EXCLUDED.notes,
       last_run_at = now()`,
    [params.igAccountId, params.metricName, params.earliestAvailableDate, params.status, params.notes ?? null],
  );
}

export interface AccountInsightRow {
  metricDate: string;
  reach: number | null;
  followerCount: number | null;
  onlineFollowers: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  replies: number | null;
  profileViews: number | null;
  websiteClicks: number | null;
  profileLinksTaps: number | null;
  accountsEngaged: number | null;
  totalInteractions: number | null;
}

export async function getAccountInsightsRange(
  igAccountId: number,
  from: string,
  to: string,
): Promise<AccountInsightRow[]> {
  const { rows } = await pool.query(
    `SELECT metric_date, reach, follower_count, online_followers, views, likes, comments, shares,
            saves, replies, profile_views, website_clicks, profile_links_taps, accounts_engaged,
            total_interactions
     FROM account_insights_daily
     WHERE ig_account_id = $1 AND metric_date BETWEEN $2 AND $3
     ORDER BY metric_date ASC`,
    [igAccountId, from, to],
  );
  return rows.map((r) => ({
    metricDate: r.metric_date,
    reach: r.reach,
    followerCount: r.follower_count,
    onlineFollowers: r.online_followers,
    views: r.views,
    likes: r.likes,
    comments: r.comments,
    shares: r.shares,
    saves: r.saves,
    replies: r.replies,
    profileViews: r.profile_views,
    websiteClicks: r.website_clicks,
    profileLinksTaps: r.profile_links_taps,
    accountsEngaged: r.accounts_engaged,
    totalInteractions: r.total_interactions,
  }));
}
