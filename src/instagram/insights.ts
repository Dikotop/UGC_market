import { graphGet } from "../lib/graphApi.js";
import type { InsightsResponse } from "../types/instagram.js";

export const ACCOUNT_METRICS = [
  "impressions",
  "reach",
  "profile_views",
  "website_clicks",
  "follower_count",
  "email_contacts",
  "phone_call_clicks",
  "text_message_clicks",
  "get_directions_clicks",
] as const;

export type AccountMetric = (typeof ACCOUNT_METRICS)[number];

export interface DailyMetricPoint {
  date: string;
  value: number;
}

function toUnixSeconds(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}

/**
 * Fetches one account-level metric as daily points between since/until.
 * Throws GraphApiError if the metric/date-range isn't supported - callers
 * (backfill/daily jobs) are responsible for recording that per metric.
 */
export async function fetchAccountInsight(
  igUserId: string,
  accessToken: string,
  metric: AccountMetric,
  since: Date,
  until: Date,
): Promise<DailyMetricPoint[]> {
  const res = await graphGet<InsightsResponse>(`/${igUserId}/insights`, {
    access_token: accessToken,
    metric,
    period: "day",
    since: toUnixSeconds(since),
    until: toUnixSeconds(until),
  });

  const result = res.data[0];
  if (!result) return [];

  return result.values
    .filter((v): v is { value: number; end_time: string } => v.value !== undefined && v.end_time !== undefined)
    .map((v) => ({ date: v.end_time.slice(0, 10), value: v.value }));
}
