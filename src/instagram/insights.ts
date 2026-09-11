import { graphGet } from "../lib/graphApi.js";
import type { InsightsResponse } from "../types/instagram.js";

/**
 * Metrics returned as a daily time series: one `values[]` entry per day,
 * so a single call covers a whole date window.
 */
export const TIMESERIES_METRICS = ["reach", "follower_count", "online_followers"] as const;

/**
 * Metrics that only come back as a single aggregate (`total_value`) for the
 * requested range, so a daily figure needs a one-day range per call.
 */
export const TOTAL_VALUE_METRICS = [
  "views",
  "likes",
  "comments",
  "shares",
  "saves",
  "replies",
  "profile_views",
  "website_clicks",
  "profile_links_taps",
  "accounts_engaged",
  "total_interactions",
] as const;

export type TimeseriesMetric = (typeof TIMESERIES_METRICS)[number];
export type TotalValueMetric = (typeof TOTAL_VALUE_METRICS)[number];
export type AccountMetric = TimeseriesMetric | TotalValueMetric;

export interface DailyMetricPoint {
  date: string;
  value: number;
}

function toUnixSeconds(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}

/**
 * Fetches every time-series metric for the window in one call, returning
 * daily points per metric. Throws GraphApiError if the range isn't supported
 * (notably the API's two-year history limit) - callers decide what that means.
 */
export async function fetchTimeseriesMetrics(
  igUserId: string,
  accessToken: string,
  since: Date,
  until: Date,
): Promise<Map<TimeseriesMetric, DailyMetricPoint[]>> {
  const res = await graphGet<InsightsResponse>(`/${igUserId}/insights`, {
    access_token: accessToken,
    metric: TIMESERIES_METRICS.join(","),
    period: "day",
    since: toUnixSeconds(since),
    until: toUnixSeconds(until),
  });

  const out = new Map<TimeseriesMetric, DailyMetricPoint[]>();
  for (const result of res.data) {
    const points = (result.values ?? [])
      .filter((v): v is { value: number; end_time: string } => typeof v.value === "number" && !!v.end_time)
      .map((v) => ({ date: v.end_time.slice(0, 10), value: v.value }));
    out.set(result.name as TimeseriesMetric, points);
  }
  return out;
}

/**
 * Fetches every total_value metric for the given range in one call. Pass a
 * one-day range to get that day's figures.
 */
export async function fetchTotalValueMetrics(
  igUserId: string,
  accessToken: string,
  since: Date,
  until: Date,
): Promise<Map<TotalValueMetric, number>> {
  const res = await graphGet<InsightsResponse>(`/${igUserId}/insights`, {
    access_token: accessToken,
    metric: TOTAL_VALUE_METRICS.join(","),
    metric_type: "total_value",
    period: "day",
    since: toUnixSeconds(since),
    until: toUnixSeconds(until),
  });

  const out = new Map<TotalValueMetric, number>();
  for (const result of res.data) {
    const value = result.total_value?.value;
    if (typeof value === "number") out.set(result.name as TotalValueMetric, value);
  }
  return out;
}
