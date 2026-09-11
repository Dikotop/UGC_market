import { pool } from "../db/pool.js";
import type { MediaInsightValues } from "../instagram/media.js";
import type { IgMediaItem } from "../types/instagram.js";

export interface MediaItemRow {
  id: number;
  igMediaId: string;
}

export async function upsertMediaItem(igAccountId: number, item: IgMediaItem): Promise<MediaItemRow> {
  const { rows } = await pool.query<{ id: number; ig_media_id: string }>(
    `INSERT INTO media_items (ig_account_id, ig_media_id, media_type, media_product_type, caption, permalink, media_url, thumbnail_url, posted_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (ig_media_id) DO UPDATE SET
       media_type = EXCLUDED.media_type,
       media_product_type = EXCLUDED.media_product_type,
       caption = EXCLUDED.caption,
       permalink = EXCLUDED.permalink,
       media_url = EXCLUDED.media_url,
       thumbnail_url = EXCLUDED.thumbnail_url,
       updated_at = now()
     RETURNING id, ig_media_id`,
    [
      igAccountId,
      item.id,
      item.media_type ?? null,
      item.media_product_type ?? null,
      item.caption ?? null,
      item.permalink ?? null,
      item.media_url ?? null,
      item.thumbnail_url ?? null,
      item.timestamp ? new Date(item.timestamp) : null,
    ],
  );
  return { id: rows[0].id, igMediaId: rows[0].ig_media_id };
}

export async function markInsightsUnavailable(mediaItemId: number, errorMessage: string): Promise<void> {
  await pool.query(
    `UPDATE media_items SET insights_unavailable = true, insights_error = $2, updated_at = now() WHERE id = $1`,
    [mediaItemId, errorMessage],
  );
}

export async function upsertMediaInsightSnapshot(
  mediaItemId: number,
  date: string,
  values: MediaInsightValues,
): Promise<void> {
  await pool.query(
    `INSERT INTO media_insights_daily
       (media_item_id, snapshot_date, reach, views, likes, comments, saved, shares, total_interactions,
        profile_visits, follows, ig_reels_video_view_total_time, ig_reels_avg_watch_time, raw)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (media_item_id, snapshot_date) DO UPDATE SET
       reach = EXCLUDED.reach,
       views = EXCLUDED.views,
       likes = EXCLUDED.likes,
       comments = EXCLUDED.comments,
       saved = EXCLUDED.saved,
       shares = EXCLUDED.shares,
       total_interactions = EXCLUDED.total_interactions,
       profile_visits = EXCLUDED.profile_visits,
       follows = EXCLUDED.follows,
       ig_reels_video_view_total_time = EXCLUDED.ig_reels_video_view_total_time,
       ig_reels_avg_watch_time = EXCLUDED.ig_reels_avg_watch_time,
       raw = EXCLUDED.raw`,
    [
      mediaItemId,
      date,
      values.reach ?? null,
      values.views ?? null,
      values.likes ?? null,
      values.comments ?? null,
      values.saved ?? null,
      values.shares ?? null,
      values.total_interactions ?? null,
      values.profile_visits ?? null,
      values.follows ?? null,
      values.ig_reels_video_view_total_time ?? null,
      values.ig_reels_avg_watch_time ?? null,
      JSON.stringify(values),
    ],
  );
}

/** Clears a previous failure marker once insights come back successfully. */
export async function markInsightsAvailable(mediaItemId: number): Promise<void> {
  await pool.query(
    `UPDATE media_items SET insights_unavailable = false, insights_error = NULL, updated_at = now()
     WHERE id = $1 AND insights_unavailable = true`,
    [mediaItemId],
  );
}

export interface MediaWithLatestInsight {
  id: number;
  igMediaId: string;
  mediaType: string | null;
  permalink: string | null;
  caption: string | null;
  postedAt: Date | null;
  insightsUnavailable: boolean;
  latest: {
    snapshotDate: string;
    likes: number | null;
    comments: number | null;
    reach: number | null;
    views: number | null;
    totalInteractions: number | null;
  } | null;
}

export async function listMediaWithLatestInsights(igAccountId: number): Promise<MediaWithLatestInsight[]> {
  const { rows } = await pool.query(
    `SELECT m.id, m.ig_media_id, m.media_type, m.permalink, m.caption, m.posted_at, m.insights_unavailable,
            latest.snapshot_date, latest.likes, latest.comments, latest.reach, latest.views,
            latest.total_interactions
     FROM media_items m
     LEFT JOIN LATERAL (
       SELECT snapshot_date, likes, comments, reach, views, total_interactions
       FROM media_insights_daily d
       WHERE d.media_item_id = m.id
       ORDER BY snapshot_date DESC
       LIMIT 1
     ) latest ON true
     WHERE m.ig_account_id = $1
     ORDER BY m.posted_at DESC NULLS LAST`,
    [igAccountId],
  );
  return rows.map((r) => ({
    id: r.id,
    igMediaId: r.ig_media_id,
    mediaType: r.media_type,
    permalink: r.permalink,
    caption: r.caption,
    postedAt: r.posted_at,
    insightsUnavailable: r.insights_unavailable,
    latest: r.snapshot_date
      ? {
          snapshotDate: r.snapshot_date,
          likes: r.likes,
          comments: r.comments,
          reach: r.reach,
          views: r.views,
          totalInteractions: r.total_interactions,
        }
      : null,
  }));
}

export interface MediaHistoryResult {
  media: { id: number; igMediaId: string; caption: string | null; permalink: string | null; postedAt: Date | null } | null;
  history: Array<Record<string, unknown>>;
}

export async function getMediaHistory(igMediaId: string): Promise<MediaHistoryResult> {
  const { rows: mediaRows } = await pool.query(
    `SELECT id, ig_media_id, caption, permalink, posted_at FROM media_items WHERE ig_media_id = $1`,
    [igMediaId],
  );
  const media = mediaRows[0];
  if (!media) return { media: null, history: [] };

  const { rows: history } = await pool.query(
    `SELECT snapshot_date, reach, views, likes, comments, saved, shares, total_interactions,
            profile_visits, follows, ig_reels_video_view_total_time, ig_reels_avg_watch_time
     FROM media_insights_daily WHERE media_item_id = $1 ORDER BY snapshot_date ASC`,
    [media.id],
  );

  return {
    media: {
      id: media.id,
      igMediaId: media.ig_media_id,
      caption: media.caption,
      permalink: media.permalink,
      postedAt: media.posted_at,
    },
    history,
  };
}

export interface MediaItemForBackfill extends MediaItemRow {
  mediaProductType: string | null;
}

export async function listRecentMediaItems(
  igAccountId: number,
  sinceDate: Date,
): Promise<MediaItemForBackfill[]> {
  const { rows } = await pool.query<{ id: number; ig_media_id: string; media_product_type: string | null }>(
    `SELECT id, ig_media_id, media_product_type FROM media_items WHERE ig_account_id = $1 AND posted_at >= $2 ORDER BY posted_at DESC`,
    [igAccountId, sinceDate],
  );
  return rows.map((r) => ({ id: r.id, igMediaId: r.ig_media_id, mediaProductType: r.media_product_type }));
}

export async function listAllMediaItems(igAccountId: number): Promise<MediaItemForBackfill[]> {
  const { rows } = await pool.query<{ id: number; ig_media_id: string; media_product_type: string | null }>(
    `SELECT id, ig_media_id, media_product_type FROM media_items WHERE ig_account_id = $1`,
    [igAccountId],
  );
  return rows.map((r) => ({ id: r.id, igMediaId: r.ig_media_id, mediaProductType: r.media_product_type }));
}
