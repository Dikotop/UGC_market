import { GraphApiError } from "../lib/graphApi.js";
import { ACCOUNT_METRICS, fetchAccountInsight } from "../instagram/insights.js";
import { fetchMediaInsights, listAllMedia } from "../instagram/media.js";
import { upsertAccountMetricPoint } from "../repositories/accountInsightsRepo.js";
import { getAccount } from "../repositories/igAccountRepo.js";
import {
  listRecentMediaItems,
  markInsightsUnavailable,
  upsertMediaInsightSnapshot,
  upsertMediaItem,
} from "../repositories/mediaRepo.js";
import { refreshTokenIfNeeded } from "./refreshToken.js";

const RECENT_MEDIA_WINDOW_DAYS = 30;
const CALL_DELAY_MS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runDailyCollect(): Promise<void> {
  // Throws on missing/expired/failed-to-refresh token - caller must not
  // swallow this, it needs to surface as a loud failure (see scripts/runCollectOnce.ts).
  await refreshTokenIfNeeded();

  const account = await getAccount();
  if (!account) {
    throw new Error("No Instagram account configured.");
  }

  const until = new Date();
  const since = new Date(until.getTime() - 2 * 24 * 60 * 60 * 1000);

  console.log(`Collecting account insights for @${account.igUsername ?? account.igUserId}...`);
  for (const metric of ACCOUNT_METRICS) {
    try {
      const points = await fetchAccountInsight(account.igUserId, account.accessToken, metric, since, until);
      for (const p of points) {
        await upsertAccountMetricPoint(account.id, metric, p.date, p.value);
      }
    } catch (err) {
      if (err instanceof GraphApiError && err.isTokenError) throw err;
      console.error(
        `ALERT: failed to collect metric "${metric}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    await sleep(CALL_DELAY_MS);
  }

  console.log("Checking for new media...");
  let newMediaCount = 0;
  outer: for await (const page of listAllMedia(account.igUserId, account.accessToken)) {
    for (const item of page) {
      // The media list comes back newest-first, so once we hit something
      // older than our lookback window there's nothing more to catch up on.
      const postedAt = item.timestamp ? new Date(item.timestamp) : null;
      if (postedAt && postedAt < since) break outer;
      await upsertMediaItem(account.id, item);
      newMediaCount++;
    }
  }
  console.log(`Upserted ${newMediaCount} recent media items.`);

  console.log("Refreshing insights for recently-posted media...");
  const windowStart = new Date(Date.now() - RECENT_MEDIA_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const recentMedia = await listRecentMediaItems(account.id, windowStart);
  const today = new Date().toISOString().slice(0, 10);
  let failedCount = 0;
  for (const media of recentMedia) {
    try {
      const values = await fetchMediaInsights(
        media.igMediaId,
        account.accessToken,
        media.mediaProductType ?? undefined,
      );
      await upsertMediaInsightSnapshot(media.id, today, values);
    } catch (err) {
      if (err instanceof GraphApiError && err.isTokenError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      await markInsightsUnavailable(media.id, message);
      failedCount++;
    }
    await sleep(CALL_DELAY_MS);
  }

  console.log(`Daily collect complete. ${recentMedia.length} recent media checked, ${failedCount} failed.`);
}
