/**
 * AWS Lambda entry point (function URL, payload format 2.0).
 *
 * /mcp is served by the SDK's web-standard Streamable HTTP transport directly:
 * the Lambda event becomes a Fetch Request and the Response goes straight back.
 * Running the Node transport behind an Express-on-Lambda adapter dropped the
 * Content-Type header the transport checks, so every call got 415.
 * Everything else (simulator page, /api/*, /health) goes through Express.
 */
import serverless from "serverless-http";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createApp } from "./app.js";
import { mountAssistant } from "./assistant/routes.js";
import { createServer } from "./server.js";

type UrlEvent = {
  rawPath: string;
  rawQueryString?: string;
  headers: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
  requestContext: { http: { method: string }; domainName: string };
};
type UrlResult = { statusCode: number; headers: Record<string, string>; body: string; isBase64Encoded?: boolean };

// Audio and images must go back base64-encoded; sent as text, the MP3 from Polly arrived
// corrupted and the browser could not play it.
const express = serverless(createApp(mountAssistant), { binary: ["audio/*", "image/*", "font/*"] });
const CORS = {
  "access-control-allow-origin": process.env.CORS_ORIGINS ?? "*",
  "access-control-allow-headers": "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-expose-headers": "Mcp-Session-Id, Mcp-Protocol-Version",
};

async function mcp(event: UrlEvent): Promise<UrlResult> {
  const method = event.requestContext.http.method;
  if (method === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (method !== "POST") {
    return {
      statusCode: 405,
      headers: { ...CORS, allow: "POST", "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. POST JSON-RPC to /mcp." }, id: null }),
    };
  }
  const body = event.body ? (event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body) : undefined;
  const headers = new Headers();
  for (const [k, v] of Object.entries(event.headers)) if (v !== undefined) headers.set(k, v);
  const req = new Request(`https://${event.requestContext.domainName}${event.rawPath}${event.rawQueryString ? `?${event.rawQueryString}` : ""}`, {
    method,
    headers,
    body,
  });
  const server = createServer();
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    const res = await transport.handleRequest(req);
    const out: Record<string, string> = { ...CORS };
    res.headers.forEach((v, k) => (out[k] = v));
    return { statusCode: res.status, headers: out, body: await res.text() };
  } finally {
    await transport.close();
    await server.close();
  }
}

export const handler = async (event: UrlEvent, context: unknown) => {
  if (event.rawPath === "/mcp") return mcp(event);
  return express(event, context as never);
};
