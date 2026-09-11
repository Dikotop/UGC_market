import { GraphApiError } from "../lib/graphApi.js";
import { type AccountMetric, ACCOUNT_METRICS, fetchAccountInsight } from "../instagram/insights.js";
import { fetchMediaInsights, listAllMedia } from "../instagram/media.js";
import {
  upsertAccountMetricPoint,
  upsertBackfillStatus,
} from "../repositories/accountInsightsRepo.js";
import { getAccount } from "../repositories/igAccountRepo.js";
import {
  markInsightsUnavailable,
  upsertMediaInsightSnapshot,
  upsertMediaItem,
} from "../repositories/mediaRepo.js";

const WINDOW_DAYS = 30;
// Safety cap so a runaway loop can't hammer the API forever - ~2.5 years
// of 30-day windows, comfortably beyond what any metric actually supports.
const MAX_WINDOWS = 30;
const CALL_DELAY_MS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type StopReason = "no-more-data" | "api-limit" | "max-windows";

async function backfillAccountMetric(
  igUserId: string,
  accessToken: string,
  igAccountId: number,
  metric: AccountMetric,
): Promise<void> {
  let until = new Date();
  let earliestDate: string | null = null;
  let windowsWalked = 0;
  let sawAnyData = false;
  let stopReason: StopReason = "no-more-data";

  while (windowsWalked < MAX_WINDOWS) {
    const since = new Date(until.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
    let points;
    try {
      points = await fetchAccountInsight(igUserId, accessToken, metric, since, until);
    } catch (err) {
      if (err instanceof GraphApiError && !err.isTokenError) {
        stopReason = "api-limit";
        break;
      }
      throw err;
    }

    if (points.length === 0) {
      stopReason = "no-more-data";
      break;
    }

    sawAnyData = true;
    for (const p of points) {
      await upsertAccountMetricPoint(igAccountId, metric, p.date, p.value);
      if (!earliestDate || p.date < earliestDate) earliestDate = p.date;
    }

    until = since;
    windowsWalked++;
    if (windowsWalked === MAX_WINDOWS) stopReason = "max-windows";
    await sleep(CALL_DELAY_MS);
  }

  const status = !sawAnyData ? "failed" : stopReason === "no-more-data" ? "completed" : "partial";
  await upsertBackfillStatus({
    igAccountId,
    metricName: metric,
    earliestAvailableDate: earliestDate,
    status,
    notes: `stopped: ${stopReason}, windows walked: ${windowsWalked}`,
  });

  console.log(`  [${metric}] status=${status} earliest=${earliestDate ?? "n/a"}`);
}

export async function runBackfill(): Promise<void> {
  const account = await getAccount();
  if (!account) {
    throw new Error("No Instagram account configured. Run `npm run auth:setup` first.");
  }

  console.log(`Backfilling account-level metrics for @${account.igUsername ?? account.igUserId}...`);
  for (const metric of ACCOUNT_METRICS) {
    await backfillAccountMetric(account.igUserId, account.accessToken, account.id, metric);
  }

  console.log("Backfilling media list...");
  let mediaCount = 0;
  const mediaBuffer: Array<{ dbId: number; igMediaId: string; mediaProductType: string | null }> = [];
  for await (const page of listAllMedia(account.igUserId, account.accessToken)) {
    for (const item of page) {
      const saved = await upsertMediaItem(account.id, item);
      mediaBuffer.push({
        dbId: saved.id,
        igMediaId: item.id,
        mediaProductType: item.media_product_type ?? null,
      });
      mediaCount++;
    }
  }
  console.log(`Found ${mediaCount} media items.`);

  console.log("Backfilling media insights...");
  let unavailableCount = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (const media of mediaBuffer) {
    try {
      const values = await fetchMediaInsights(
        media.igMediaId,
        account.accessToken,
        media.mediaProductType ?? undefined,
      );
      await upsertMediaInsightSnapshot(media.dbId, today, values);
    } catch (err) {
      if (err instanceof GraphApiError && err.isTokenError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      await markInsightsUnavailable(media.dbId, message);
      unavailableCount++;
    }
    await sleep(CALL_DELAY_MS);
  }

  console.log(
    `Backfill complete. ${mediaCount} media items processed, ${unavailableCount} without available insights.`,
  );
}
