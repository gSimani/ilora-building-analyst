import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp } from "../src/app.js";
import { mountAssistant } from "../src/assistant/routes.js";

/** Starts the real HTTP app on a free port and connects a real MCP client over Streamable HTTP. */
export async function startServer() {
  const http: Server = await new Promise((resolve) => {
    const s = createApp(mountAssistant).listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`));
  const client = new Client({ name: "ilora-tests", version: "1.0.0" });
  await client.connect(transport);
  return {
    base,
    client,
    transport,
    async close() {
      await client.close();
      await new Promise((r) => http.close(r));
    },
  };
}

export type Structured = Record<string, any>;
export const sc = (r: unknown) => (r as { structuredContent: Structured }).structuredContent;
/** Error results carry JSON in their first text block. */
export const errorOf = (r: unknown) => JSON.parse((r as { content: { text: string }[] }).content[0].text).error;
/** What the simulator hands the brain: structuredContent, or the parsed error. */
export const payload = (r: { isError?: boolean; structuredContent?: unknown; content?: unknown }) =>
  r.isError ? JSON.parse((r.content as { text: string }[])[0].text) : r.structuredContent;
