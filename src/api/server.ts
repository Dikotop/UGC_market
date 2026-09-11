import express, { type NextFunction, type Request, type Response } from "express";
import { analyticsRouter } from "./routes/analytics.js";

export function createServer(): express.Express {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/analytics", analyticsRouter);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("ALERT: unhandled API error", err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
