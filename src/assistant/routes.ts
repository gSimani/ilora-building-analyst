/**
 * Routes used only by the analyst page:
 *   POST /api/brain  - one step of the tool-use loop (Nemotron on Nebius, or the offline planner)
 *   POST /api/speak  - Amazon Polly generative speech (204 when Polly is off; the page then uses the browser voice)
 *   GET  /api/config - which brain and voice are active, so the page can label them honestly
 * The MCP traffic itself never goes through here: the browser calls /mcp directly.
 */
import type { Express } from "express";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { OfflinePlanner } from "./planner.js";
import { NemotronBrain } from "./nemotron.js";
import type { Brain, BrainRequest } from "./types.js";
import { listProperties } from "../domain.js";
import { rateLimit } from "./limits.js";

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

export function makeBrain(kind = process.env.BRAIN ?? "offline"): Brain {
  return kind === "nemotron" ? new NemotronBrain() : new OfflinePlanner(listProperties());
}

const voiceOn = () => process.env.VOICE === "polly";

export function mountAssistant(app: Express) {
  const brain = makeBrain();
  const polly = voiceOn() ? new PollyClient({ region: process.env.AWS_REGION ?? "us-east-1" }) : undefined;

  app.get("/api/config", (_req, res) => {
    res.json({ brain: brain.name, voice: polly ? `polly-${process.env.POLLY_ENGINE ?? "generative"}:${process.env.POLLY_VOICE ?? "Ruth"}` : "browser" });
  });

  const brainLimit = rateLimit({ perIp: num(process.env.BRAIN_LIMIT_PER_IP, 120), total: num(process.env.BRAIN_LIMIT_TOTAL, 1000) });
  const speakLimit = rateLimit({ perIp: num(process.env.SPEAK_LIMIT_PER_IP, 40), total: num(process.env.SPEAK_LIMIT_TOTAL, 100) });

  app.post("/api/brain", brainLimit, async (req, res) => {
    const body = req.body as BrainRequest;
    if (!Array.isArray(body?.messages) || !Array.isArray(body?.tools) || !body.messages.length) {
      res.status(400).json({ error: "Send { messages, tools } with at least one message." });
      return;
    }
    const t = performance.now();
    try {
      const out = await brain.next(body);
      res.json({ ...out, brain: brain.name, ms: Math.round(performance.now() - t) });
    } catch (err) {
      console.error("brain failed", err);
      res.status(502).json({ error: `The ${brain.name} brain did not answer: ${(err as Error).message}` });
    }
  });

  app.post("/api/speak", speakLimit, async (req, res) => {
    // Answers run about 350 characters; 600 caps what one request can cost.
    const text = String(req.body?.text ?? "").slice(0, 600);
    if (!polly || !text) {
      res.status(204).end();
      return;
    }
    try {
      const out = await polly.send(
        new SynthesizeSpeechCommand({ Engine: (process.env.POLLY_ENGINE ?? "generative") as never, OutputFormat: "mp3", VoiceId: (process.env.POLLY_VOICE ?? "Ruth") as never, Text: text }),
      );
      const audio = await out.AudioStream?.transformToByteArray();
      res.type("audio/mpeg").send(Buffer.from(audio ?? []));
    } catch (err) {
      console.error("polly failed", err);
      res.status(204).end();
    }
  });
}
