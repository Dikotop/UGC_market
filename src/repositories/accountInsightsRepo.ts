import { pool } from "../db/pool.js";
import type { AccountMetric } from "../instagram/insights.js";

// Whitelist mapping metric -> column name, so the column can be safely
// interpolated into SQL (it never comes from unvalidated input).
const METRIC_COLUMNS: Record<AccountMetric, string> = {
  impressions: "impressions",
  reach: "reach",
  profile_views: "profile_views",
  website_clicks: "website_clicks",
  follower_count: "follower_count",
  email_contacts: "email_contacts",
  phone_call_clicks: "phone_call_clicks",
  text_message_clicks: "text_message_clicks",
  get_directions_clicks: "get_directions_clicks",
};

export async function upsertAccountMetricPoint(
  igAccountId: number,
  metric: AccountMetric,
  date: string,
  value: number,
): Promise<void> {
  const column = METRIC_COLUMNS[metric];
  await pool.query(
    `INSERT INTO account_insights_daily (ig_account_id, metric_date, ${column})
     VALUES ($1, $2, $3)
     ON CONFLICT (ig_account_id, metric_date) DO UPDATE SET
       ${column} = EXCLUDED.${column},
       updated_at = now()`,
    [igAccountId, date, value],
  );
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
  impressions: number | null;
  reach: number | null;
  profileViews: number | null;
  websiteClicks: number | null;
  followerCount: number | null;
  emailContacts: number | null;
  phoneCallClicks: number | null;
  textMessageClicks: number | null;
  getDirectionsClicks: number | null;
}

export async function getAccountInsightsRange(
  igAccountId: number,
  from: string,
  to: string,
): Promise<AccountInsightRow[]> {
  const { rows } = await pool.query(
    `SELECT metric_date, impressions, reach, profile_views, website_clicks, follower_count,
            email_contacts, phone_call_clicks, text_message_clicks, get_directions_clicks
     FROM account_insights_daily
     WHERE ig_account_id = $1 AND metric_date BETWEEN $2 AND $3
     ORDER BY metric_date ASC`,
    [igAccountId, from, to],
  );
  return rows.map((r) => ({
    metricDate: r.metric_date,
    impressions: r.impressions,
    reach: r.reach,
    profileViews: r.profile_views,
    websiteClicks: r.website_clicks,
    followerCount: r.follower_count,
    emailContacts: r.email_contacts,
    phoneCallClicks: r.phone_call_clicks,
    textMessageClicks: r.text_message_clicks,
    getDirectionsClicks: r.get_directions_clicks,
  }));
}
