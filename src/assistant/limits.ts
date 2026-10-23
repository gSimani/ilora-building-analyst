/**
 * Request caps for the two routes that can cost money (Polly speech and the
 * brain, which can call Nemotron on Nebius). A public function URL is reachable by anyone,
 * so these keep a stray script from running up a bill.
 *
 * In-memory and per Lambda instance: a speed bump, not a guarantee. The real
 * ceiling is the stack's ReservedConcurrency plus an AWS Budgets alert.
 */
import type { NextFunction, Request, Response } from "express";

type Window = { start: number; count: number };

export function rateLimit({ perIp, total, windowMs = 60 * 60 * 1000 }: { perIp: number; total: number; windowMs?: number }) {
  const byIp = new Map<string, Window>();
  let all: Window = { start: Date.now(), count: 0 };

  const tick = (w: Window, now: number): Window => (now - w.start > windowMs ? { start: now, count: 0 } : w);

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const ip = String(req.headers["x-forwarded-for"] ?? req.ip ?? "unknown").split(",")[0].trim();
    all = tick(all, now);
    const mine = tick(byIp.get(ip) ?? { start: now, count: 0 }, now);
    if (mine.count >= perIp || all.count >= total) {
      res.status(429).set("Retry-After", String(Math.ceil((windowMs - (now - mine.start)) / 1000))).json({
        error: "Demo limit reached for now. The MCP tools at /mcp still work; voice and the assistant come back within the hour.",
      });
      return;
    }
    mine.count++;
    all.count++;
    byIp.set(ip, mine);
    if (byIp.size > 5000) byIp.clear(); // bound memory on a long-lived instance
    next();
  };
}
