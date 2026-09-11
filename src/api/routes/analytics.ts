import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../asyncHandler.js";
import { getAccountInsightsRange } from "../../repositories/accountInsightsRepo.js";
import { getAccount } from "../../repositories/igAccountRepo.js";
import { getMediaHistory, listMediaWithLatestInsights } from "../../repositories/mediaRepo.js";

export const analyticsRouter = Router();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

analyticsRouter.get(
  "/account",
  asyncHandler(async (req, res) => {
    const account = await getAccount();
    if (!account) {
      res.status(404).json({ error: "No Instagram account configured." });
      return;
    }

    const defaults = defaultRange();
    const fromResult = isoDate.safeParse(req.query.from ?? defaults.from);
    const toResult = isoDate.safeParse(req.query.to ?? defaults.to);
    if (!fromResult.success || !toResult.success) {
      res.status(400).json({ error: "from/to must be dates in YYYY-MM-DD format" });
      return;
    }

    const data = await getAccountInsightsRange(account.id, fromResult.data, toResult.data);
    res.json({
      account: { igUserId: account.igUserId, igUsername: account.igUsername },
      from: fromResult.data,
      to: toResult.data,
      data,
    });
  }),
);

analyticsRouter.get(
  "/media",
  asyncHandler(async (_req, res) => {
    const account = await getAccount();
    if (!account) {
      res.status(404).json({ error: "No Instagram account configured." });
      return;
    }
    const data = await listMediaWithLatestInsights(account.id);
    res.json({ data });
  }),
);

analyticsRouter.get(
  "/media/:id",
  asyncHandler(async (req, res) => {
    const result = await getMediaHistory(req.params.id);
    if (!result.media) {
      res.status(404).json({ error: "Media not found." });
      return;
    }
    res.json(result);
  }),
);
