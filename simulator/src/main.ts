/**
 * ILORA.ai Building Analyst page.
 *
 * This page is a real MCP client: it connects to the ILORA.ai server over
 * Streamable HTTP and runs initialize, tools/list, tools/call and resources/read
 * itself. Every JSON-RPC message is shown in the debug panel. The "brain" (the
 * model that picks a tool) runs server-side at /api/brain because it needs the Nebius
 * key; it never sees the MCP connection, only the tool list and results.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";

type Block = { text: string } | { toolUse: { toolUseId: string; name: string; input: Record<string, unknown> } } | { toolResult: { toolUseId: string; status: "success" | "error"; content: { json: unknown }[] } };
type Message = { role: "user" | "assistant"; content: Block[] };
type BrainReply =
  | { stop: "tool_use"; message: Message; toolUse: { toolUseId: string; name: string; input: Record<string, unknown> }; brain: string; ms: number }
  | { stop: "end_turn"; message: Message; text: string; brain: string; ms: number };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const MCP_URL = new URL("/mcp", location.href);
const SUGGESTIONS = [
  "How is Coral Wren Plaza doing?",
  "Does my rent roll match my income statement for Coral Wren Plaza?",
  "Show me the lines.",
  "Which leases expire in the next 90 days at Tamarind Grove?",
  "Tell me about the second one.",
];

// ------------------------------------------------------------------ JSON-RPC wire log

function logWire(dir: "→" | "←", body: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return;
  }
  const msgs = Array.isArray(parsed) ? parsed : [parsed];
  for (const m of msgs as Record<string, unknown>[]) {
    const li = document.createElement("li");
    const label = (m.method as string) ?? (m.note ? "note" : m.error ? "error" : "result");
    const extra = m.method === "tools/call" ? ` ${(m.params as { name: string }).name}` : "";
    li.innerHTML = `<details><summary><span class="dir">${dir}</span>${label}${extra}${m.id !== undefined ? ` · id ${m.id}` : ""}</summary><pre></pre></details>`;
    li.querySelector("pre")!.textContent = JSON.stringify(m, null, 2);
    $("wire").append(li);
    li.scrollIntoView({ block: "end" });
  }
}

const loggingFetch: typeof fetch = async (input, init) => {
  if (typeof init?.body === "string") logWire("→", init.body);
  const res = await fetch(input, init);
  if ((init?.method ?? "GET") === "GET" && res.status === 405) {
    // The client asks for an optional server-to-client stream; a stateless server declines with 405, as the spec allows.
    logWire("←", JSON.stringify({ note: "GET /mcp → 405: stateless server, no server-initiated stream (expected)" }));
    return res;
  }
  const copy = res.clone();
  copy.text().then((t) => t && logWire("←", t));
  return res;
};

// ------------------------------------------------------------------ MCP connection

const client = new Client({ name: "ilora-building-analyst", version: "0.1.0" });
const transport = new StreamableHTTPClientTransport(MCP_URL, { fetch: loggingFetch });
let tools: Tool[] = [];
const messages: Message[] = [];

async function connect() {
  await client.connect(transport);
  tools = (await client.listTools()).tools;
  const info = client.getServerVersion();
  const cfg = await fetch("/api/config").then((r) => r.json()).catch(() => ({ brain: "unknown", voice: "browser" }));
  $("session-info").textContent = `${info?.name} ${info?.version} · MCP ${transport.protocolVersion} · ${tools.length} tools · brain: ${cfg.brain} · voice: ${cfg.voice}`;
}

// ------------------------------------------------------------------ conversation

function addTurn(who: "user" | "analyst" | "error", text: string, meta?: string) {
  const div = document.createElement("div");
  div.className = `turn ${who}`;
  div.textContent = text;
  if (meta) {
    const m = document.createElement("span");
    m.className = "meta";
    m.textContent = meta;
    div.append(m);
  }
  $("conversation").append(div);
  div.scrollIntoView({ block: "end" });
  if (who !== "user") $("no-screen-caption").textContent = text;
}

/** Tool results go back to the brain as structured data, or as the parsed error. */
function payloadOf(r: CallToolResult): unknown {
  if (!r.isError && r.structuredContent) return r.structuredContent;
  const t = r.content.find((c) => c.type === "text") as { text: string } | undefined;
  try {
    return JSON.parse(t?.text ?? "{}");
  } catch {
    return { error: { message: t?.text ?? "Unknown error" } };
  }
}

let busy = false;
async function ask(text: string, mode: "ask" | "review" = "ask") {
  if (busy || !text.trim()) return;
  busy = true;
  $("talk").setAttribute("disabled", "");
  addTurn("user", text);
  messages.push({ role: "user", content: [{ text }] });
  const used: string[] = [];
  try {
    for (let step = 0; step < (mode === "review" ? 16 : 5); step++) {
      const reply = (await fetch("/api/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, messages, tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) }),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `brain HTTP ${r.status}`);
        return r.json();
      })) as BrainReply;
      messages.push(reply.message);
      if (reply.stop === "end_turn") {
        addTurn("analyst", reply.text, `${used.length ? `tools: ${used.join(", ")} · ` : ""}${reply.brain}`);
        speak(reply.text);
        return;
      }
      const t0 = performance.now();
      const result = (await client.callTool({ name: reply.toolUse.name, arguments: reply.toolUse.input })) as CallToolResult;
      used.push(`${reply.toolUse.name} ${Math.round(performance.now() - t0)} ms`);
      messages.push({
        role: "user",
        content: [{ toolResult: { toolUseId: reply.toolUse.toolUseId, status: result.isError ? "error" : "success", content: [{ json: payloadOf(result) }] } }],
      });
      if (!result.isError) await showVisual(reply.toolUse.name, result);
    }
    addTurn("error", "I couldn't finish that. Try asking again.");
  } catch (err) {
    addTurn("error", `Something went wrong: ${(err as Error).message}`);
  } finally {
    busy = false;
    $("talk").removeAttribute("disabled");
  }
}

// ------------------------------------------------------------------ MCP Apps host (inline Card / List)

let frameCleanup: (() => void) | undefined;
let currentFrame: HTMLIFrameElement | undefined;

/** Tell the current view its container changed (e.g. the screen was turned back on) so it re-measures. */
function notifyContainerChanged() {
  const w = $("visual").clientWidth;
  currentFrame?.contentWindow?.postMessage(
    { jsonrpc: "2.0", method: "ui/notifications/host-context-changed", params: { theme: "dark", displayMode: "inline", containerDimensions: { width: w, maxHeight: 720 } } },
    "*",
  );
}

async function showVisual(toolName: string, result: CallToolResult) {
  const tool = tools.find((t) => t.name === toolName);
  const uri = (tool?._meta as { ui?: { resourceUri?: string } } | undefined)?.ui?.resourceUri;
  if (!uri) return;
  const res = await client.readResource({ uri });
  const html = (res.contents[0] as { text: string }).text;
  frameCleanup?.();
  const frame = document.createElement("iframe");
  frame.title = `${tool?.title ?? toolName} view`;
  frame.setAttribute("sandbox", "allow-scripts");
  frame.style.height = "320px";
  frame.style.colorScheme = "dark"; // keep the frame's canvas transparent on the dark device screen
  frame.srcdoc = html;
  $("visual").replaceChildren(frame);
  currentFrame = frame;

  const theme = "dark"; // the simulated Echo Show screen is dark in both page themes
  const onMessage = (e: MessageEvent) => {
    if (e.source !== frame.contentWindow) return;
    const m = e.data as { jsonrpc?: string; id?: number; method?: string; params?: Record<string, unknown> };
    if (m?.jsonrpc !== "2.0") return;
    const reply = (r: unknown) => frame.contentWindow?.postMessage({ jsonrpc: "2.0", id: m.id, result: r }, "*");
    switch (m.method) {
      case "ui/initialize":
        reply({
          protocolVersion: "2026-01-26",
          hostInfo: { name: "ilora-building-analyst", version: "0.1.0" },
          hostCapabilities: { message: {} },
          hostContext: { theme, displayMode: "inline", availableDisplayModes: ["inline"], platform: "web", toolInfo: { tool } },
        });
        break;
      case "ui/notifications/initialized":
        frame.contentWindow?.postMessage({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: result }, "*");
        break;
      case "ui/notifications/size-changed": {
        // A view rendered while the screen is off measures 0; keep the last real height until it is visible again.
        const h = Number(m.params?.height ?? 0);
        if (h >= 40) frame.style.height = `${Math.min(Math.ceil(h), 720)}px`;
        break;
      }
      case "ui/message": {
        const text = ((m.params?.content as { text: string }[]) ?? [])[0]?.text;
        reply({});
        if (text) void ask(text);
        break;
      }
      default:
        if (m.id !== undefined) frame.contentWindow?.postMessage({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "Not supported" } }, "*");
    }
  };
  window.addEventListener("message", onMessage);
  frameCleanup = () => window.removeEventListener("message", onMessage);
}

// ------------------------------------------------------------------ voice

let audio: HTMLAudioElement | undefined;
async function speak(text: string) {
  audio?.pause();
  speechSynthesis.cancel();
  try {
    const r = await fetch("/api/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    if (r.status === 200) {
      audio = new Audio(URL.createObjectURL(await r.blob()));
      await audio.play();
      return;
    }
  } catch {
    /* fall through to the browser voice */
  }
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.02;
  speechSynthesis.speak(u);
}

type Rec = { lang: string; interimResults: boolean; start(): void; stop(): void; onresult: ((e: { results: { 0: { transcript: string } }[] }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
const SR = (window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition;

function setupTalk() {
  const btn = $("talk");
  if (!SR) {
    btn.textContent = "Voice input needs Chrome or Edge";
    btn.setAttribute("disabled", "");
    return;
  }
  let rec: Rec | undefined;
  let heard = "";
  const start = () => {
    if (busy || rec) return;
    heard = "";
    rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = (e) => (heard = Array.from(e.results).map((r) => r[0].transcript).join(" "));
    rec.onerror = (e) => addTurn("error", `Microphone: ${e.error}`);
    rec.onend = () => {
      btn.dataset.state = "";
      btn.textContent = "Hold to talk";
      rec = undefined;
      if (heard) void ask(heard);
    };
    btn.dataset.state = "listening";
    btn.textContent = "Listening…";
    rec.start();
  };
  const stop = () => rec?.stop();
  btn.addEventListener("pointerdown", start);
  btn.addEventListener("pointerup", stop);
  btn.addEventListener("pointerleave", stop);
  btn.addEventListener("keydown", (e) => {
    if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); start(); }
  });
  btn.addEventListener("keyup", (e) => {
    if (e.key === " " || e.key === "Enter") stop();
  });
}

// ------------------------------------------------------------------ chrome

function setup() {
  for (const q of SUGGESTIONS) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = q;
    b.onclick = () => ask(q);
    $("suggestions").append(b);
  }
  $("review").addEventListener("click", () => ask("Review my whole portfolio and tell me what to act on first.", "review"));
  $<HTMLFormElement>("type-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $<HTMLInputElement>("typed");
    void ask(input.value);
    input.value = "";
  });
  $<HTMLInputElement>("screen-toggle").addEventListener("change", (e) => {
    const on = (e.target as HTMLInputElement).checked;
    $("device-screen").classList.toggle("voice-only", !on);
    $("no-screen").hidden = on;
    if (on) setTimeout(notifyContainerChanged, 60);
  });
  const dark = $<HTMLInputElement>("theme-toggle");
  dark.checked = matchMedia("(prefers-color-scheme: dark)").matches;
  const applyTheme = () => (document.documentElement.dataset.theme = dark.checked ? "dark" : "light");
  dark.addEventListener("change", applyTheme);
  applyTheme();
  $("debug-toggle").addEventListener("click", () => {
    const d = $("debug");
    d.hidden = !d.hidden;
    $("stage").classList.toggle("with-debug", !d.hidden);
    $("debug-toggle").setAttribute("aria-expanded", String(!d.hidden));
    $("debug-toggle").textContent = d.hidden ? "Show JSON-RPC" : "Hide JSON-RPC";
    setTimeout(notifyContainerChanged, 60); // the layout changes width
  });
  $("visual").innerHTML = '<p class="placeholder">Answers with numbers appear here.</p>';
  setupTalk();
}

setup();
connect().catch((err) => addTurn("error", `Could not reach the MCP server: ${(err as Error).message}`));
