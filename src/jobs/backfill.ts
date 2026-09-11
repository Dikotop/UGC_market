import { GraphApiError, isHistoryLimitError } from "../lib/graphApi.js";
import {
  TIMESERIES_METRICS,
  TOTAL_VALUE_METRICS,
  fetchTimeseriesMetrics,
  fetchTotalValueMetrics,
  type AccountMetric,
} from "../instagram/insights.js";
import { fetchMediaInsights, listAllMedia } from "../instagram/media.js";
import {
  getEarliestNonZeroDates,
  listDatesWithTotalValues,
  upsertAccountMetrics,
  upsertBackfillStatus,
} from "../repositories/accountInsightsRepo.js";
import { getAccount } from "../repositories/igAccountRepo.js";
import {
  markInsightsAvailable,
  markInsightsUnavailable,
  upsertMediaInsightSnapshot,
  upsertMediaItem,
} from "../repositories/mediaRepo.js";

const WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
// The API serves at most two years of history; past that it rejects the
// range outright, so there's no point walking further back.
const MAX_HISTORY_DAYS = 730;
const CALL_DELAY_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Whether a pass covered all available history, and why it stopped if not. */
interface PassResult {
  complete: boolean;
  notes: string;
}

/**
 * Walks 30-day windows backwards, writing every daily point each call
 * returns. All time-series metrics come from the same call, so they share
 * one pass.
 */
async function backfillTimeseries(
  igUserId: string,
  accessToken: string,
  igAccountId: number,
  historyStart: Date,
): Promise<PassResult> {
  let until = new Date();
  let windows = 0;

  while (until.getTime() > historyStart.getTime()) {
    const since = new Date(Math.max(until.getTime() - WINDOW_DAYS * DAY_MS, historyStart.getTime()));

    let byMetric;
    try {
      byMetric = await fetchTimeseriesMetrics(igUserId, accessToken, since, until);
    } catch (err) {
      if (err instanceof GraphApiError && isHistoryLimitError(err)) break;
      if (err instanceof GraphApiError && !err.isTokenError) {
        return { complete: false, notes: `time series, ${windows} windows, stopped: ${err.message}` };
      }
      throw err;
    }

    const perDate = new Map<string, Map<AccountMetric, number>>();
    for (const [metric, points] of byMetric) {
      for (const p of points) {
        if (!perDate.has(p.date)) perDate.set(p.date, new Map());
        perDate.get(p.date)!.set(metric, p.value);
      }
    }
    for (const [date, values] of perDate) {
      await upsertAccountMetrics(igAccountId, date, values);
    }

    if (perDate.size === 0) break;

    until = since;
    windows++;
    await sleep(CALL_DELAY_MS);
  }

  return { complete: true, notes: `time series, ${windows} windows walked` };
}

/**
 * total_value metrics only report an aggregate for the range asked for, so
 * each day needs its own call. One call covers all of them at once, and days
 * already stored are skipped so an interrupted run can resume.
 */
async function backfillTotalValues(
  igUserId: string,
  accessToken: string,
  igAccountId: number,
  historyStart: Date,
): Promise<PassResult> {
  const alreadyDone = await listDatesWithTotalValues(igAccountId);
  let days = 0;

  for (let until = new Date(); until.getTime() > historyStart.getTime(); until = new Date(until.getTime() - DAY_MS)) {
    if (alreadyDone.has(isoDate(until))) continue;
    const since = new Date(until.getTime() - DAY_MS);

    let values;
    try {
      values = await fetchTotalValueMetrics(igUserId, accessToken, since, until);
    } catch (err) {
      if (err instanceof GraphApiError && isHistoryLimitError(err)) break;
      // Throttling that outlived the retries. Keep what's written and let
      // the next run resume from here rather than losing the whole pass.
      if (err instanceof GraphApiError && !err.isTokenError) {
        console.warn(`  total_value pass stopped at ${isoDate(until)}: ${err.message}`);
        return { complete: false, notes: `total_value, ${days} days, stopped: ${err.message}` };
      }
      throw err;
    }

    // The window ends at `until`, so that's the day these totals describe.
    await upsertAccountMetrics(igAccountId, isoDate(until), values);
    days++;
    await sleep(CALL_DELAY_MS);
  }

  return { complete: true, notes: `total_value, ${days} days walked` };
}

async function recordStatuses(
  igAccountId: number,
  metrics: readonly AccountMetric[],
  pass: PassResult,
): Promise<void> {
  const earliest = await getEarliestNonZeroDates(igAccountId, metrics);
  for (const metric of metrics) {
    const earliestDate = earliest.get(metric) ?? null;
    const status = !earliestDate ? "failed" : pass.complete ? "completed" : "partial";
    await upsertBackfillStatus({
      igAccountId,
      metricName: metric,
      earliestAvailableDate: earliestDate,
      status,
      notes: pass.notes,
    });
    console.log(`  [${metric}] status=${status} earliest=${earliestDate ?? "n/a"}`);
  }
}

export async function runBackfill(): Promise<void> {
  const account = await getAccount();
  if (!account) {
    throw new Error("No Instagram account configured. Run `npm run auth:setup` first.");
  }

  const historyStart = new Date(Date.now() - MAX_HISTORY_DAYS * DAY_MS);

  console.log(`Backfilling account time-series metrics for @${account.igUsername ?? account.igUserId}...`);
  const timeseriesPass = await backfillTimeseries(
    account.igUserId,
    account.accessToken,
    account.id,
    historyStart,
  );
  await recordStatuses(account.id, TIMESERIES_METRICS, timeseriesPass);

  console.log("Backfilling account total-value metrics (one call per day, this takes a few minutes)...");
  const totalsPass = await backfillTotalValues(
    account.igUserId,
    account.accessToken,
    account.id,
    historyStart,
  );
  await recordStatuses(account.id, TOTAL_VALUE_METRICS, totalsPass);

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
  const today = isoDate(new Date());
  for (const media of mediaBuffer) {
    try {
      const values = await fetchMediaInsights(
        media.igMediaId,
        account.accessToken,
        media.mediaProductType ?? undefined,
      );
      await upsertMediaInsightSnapshot(media.dbId, today, values);
      await markInsightsAvailable(media.dbId);
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
