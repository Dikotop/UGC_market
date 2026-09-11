import { graphGet, graphGetPaginated } from "../lib/graphApi.js";
import type { IgMediaItem } from "../types/instagram.js";

const MEDIA_FIELDS =
  "id,caption,media_type,media_product_type,permalink,media_url,thumbnail_url,timestamp";

export function listAllMedia(igUserId: string, accessToken: string): AsyncGenerator<IgMediaItem[]> {
  return graphGetPaginated<IgMediaItem>(`/${igUserId}/media`, {
    access_token: accessToken,
    fields: MEDIA_FIELDS,
    limit: 50,
  });
}

export interface MediaInsightValues {
  reach?: number;
  views?: number;
  likes?: number;
  comments?: number;
  saved?: number;
  shares?: number;
  total_interactions?: number;
  profile_visits?: number;
  follows?: number;
  ig_reels_video_view_total_time?: number;
  ig_reels_avg_watch_time?: number;
}

const COMMON_METRICS = ["reach", "views", "likes", "comments", "saved", "shares", "total_interactions"];
// Reels don't support profile_visits/follows; everything else doesn't support
// the reels watch-time metrics. Asking for an unsupported metric fails the
// entire call, so the sets are kept strictly separate.
const REELS_METRICS = [...COMMON_METRICS, "ig_reels_video_view_total_time", "ig_reels_avg_watch_time"];
const POST_METRICS = [...COMMON_METRICS, "profile_visits", "follows"];

export async function fetchMediaInsights(
  mediaId: string,
  accessToken: string,
  mediaProductType: string | undefined,
): Promise<MediaInsightValues> {
  const metrics = mediaProductType === "REELS" ? REELS_METRICS : POST_METRICS;
  const res = await graphGet<{ data: { name: string; values?: { value?: number }[] }[] }>(
    `/${mediaId}/insights`,
    {
      access_token: accessToken,
      metric: metrics.join(","),
    },
  );

  const values: MediaInsightValues = {};
  for (const item of res.data) {
    const v = item.values?.[0]?.value;
    if (typeof v === "number") {
      (values as Record<string, number>)[item.name] = v;
    }
  }
  return values;
}
