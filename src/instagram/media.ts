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
  impressions?: number;
  reach?: number;
  likes?: number;
  comments?: number;
  saved?: number;
  shares?: number;
  plays?: number;
  video_views?: number;
  total_interactions?: number;
}

const IMAGE_METRICS = ["impressions", "reach", "likes", "comments", "saved", "shares", "total_interactions"];
const VIDEO_METRICS = [...IMAGE_METRICS, "plays", "video_views"];

export async function fetchMediaInsights(
  mediaId: string,
  accessToken: string,
  mediaProductType: string | undefined,
): Promise<MediaInsightValues> {
  const metrics = mediaProductType === "REELS" || mediaProductType === "VIDEO" ? VIDEO_METRICS : IMAGE_METRICS;
  const res = await graphGet<{ data: { name: string; values: { value?: number }[] }[] }>(
    `/${mediaId}/insights`,
    {
      access_token: accessToken,
      metric: metrics.join(","),
    },
  );

  const values: MediaInsightValues = {};
  for (const item of res.data) {
    const v = item.values[0]?.value;
    if (typeof v === "number") {
      (values as Record<string, number>)[item.name] = v;
    }
  }
  return values;
}
