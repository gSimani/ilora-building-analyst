/**
 * HTTP surface: the MCP endpoint (Streamable HTTP, stateless) plus a health check.
 * The same app runs locally (src/http.ts) and on AWS Lambda (src/lambda.ts).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import express, { type Express } from "express";
import cors from "cors";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { createServer, SERVER_INFO } from "./server.js";
import { loadAll } from "./data.js";

export function createApp(extra?: (app: Express) => void): Express {
  loadAll(); // read the dataset at startup so the first tool call is fast
  const app = express();
  app.disable("x-powered-by");
  app.use(
    cors({
      origin: (process.env.CORS_ORIGINS ?? "*").split(",").map((s) => s.trim()),
      exposedHeaders: ["Mcp-Session-Id", "Mcp-Protocol-Version"],
      allowedHeaders: ["Content-Type", "Accept", "Mcp-Session-Id", "Mcp-Protocol-Version", "Last-Event-ID"],
    }),
  );
  app.use(express.json({ limit: "256kb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, server: SERVER_INFO.name, version: SERVER_INFO.version, mcp_protocol: LATEST_PROTOCOL_VERSION, transport: "streamable-http" });
  });

  // Stateless Streamable HTTP: a fresh server and transport per request, JSON responses.
  app.post("/mcp", async (req, res) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("mcp request failed", err);
      if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  });

  // No server-initiated stream and no sessions in stateless mode.
  const notAllowed = (_req: express.Request, res: express.Response) =>
    res.status(405).set("Allow", "POST").json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. POST JSON-RPC to /mcp." }, id: null });
  app.get("/mcp", notAllowed);
  app.delete("/mcp", notAllowed);

  extra?.(app);

  // The built simulator (npm run build), served from the same origin as /mcp.
  const sim = process.env.SIMULATOR_DIR ?? join(import.meta.dirname, "..", "simulator", "dist");
  if (existsSync(sim)) app.use(express.static(sim));
  return app;
}
