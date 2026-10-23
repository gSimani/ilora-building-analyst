/**
 * MCP Apps (io.modelcontextprotocol/ui) views for the two visual tools.
 *
 * Built only from the Alexa+ Card and List patterns, inline mode, with Alexa+
 * type, spacing and shape token values. ILORA teal appears only as an accent.
 * Each view speaks the MCP Apps postMessage protocol (ui/initialize, then
 * ui/notifications/tool-result) and renders from structuredContent.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const UI_MIME = "text/html;profile=mcp-app";
export const UI = {
  rentCheck: "ui://ilora/rent-check-card.html",
  leaseList: "ui://ilora/expiring-leases-list.html",
} as const;

/** Alexa+ token values (Visual Foundations), exposed as CSS custom properties. */
const TOKENS = `
:root{
  --textStyleDisplay4:28px;--textStyleHeadline1:20px;--textStyleHeadline2:18px;--textStyleBody1:16px;--textStyleBody2:14px;--textStyleBody3:12px;
  --spacing2XSmall:6px;--spacingXSmall:8px;--spacingSmall:12px;--spacingMedium:16px;--spacingLarge:20px;--spacingXLarge:24px;
  --shapeRoundedRectSmall:8px;--shapeRoundedRectMedium:12px;--shapeRoundedRectLarge:16px;
  --card:#FFFFFF;--outer:#FAF9FB;--inner:#FFFFFF;--ink:#14181E;--muted:#4A5260;--rule:#E4E2E8;
  --accent:#0A817D;--accent-soft:#E3F4F3;--warn:#9D174D;--btn:#0A817D;--btn-ink:#FFFFFF;
}
:root[data-theme=dark]{
  --card:#14181E;--outer:#14181E;--inner:#1B2028;--ink:#F2F3F5;--muted:#B4BAC4;--rule:#2A313C;
  --accent:#5BBFBA;--accent-soft:#1B2A2C;--warn:#FCA5A5;--btn:#2D415E;--btn-ink:#F2F3F5;
}
:root{color-scheme:light}:root[data-theme=dark]{color-scheme:dark}
*{box-sizing:border-box}
html,body{margin:0;background:transparent;color:var(--ink);font:400 var(--textStyleBody1)/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.card{background:var(--card);border-radius:var(--shapeRoundedRectLarge);padding:var(--spacingLarge);border:1px solid var(--rule)}
.kicker{font-size:var(--textStyleBody3);letter-spacing:.04em;text-transform:uppercase;color:var(--accent);margin:0 0 var(--spacing2XSmall)}
h1{font-size:var(--textStyleHeadline1);font-weight:600;margin:0 0 var(--spacingMedium)}
.muted{color:var(--muted);font-size:var(--textStyleBody2)}
.num{font-variant-numeric:tabular-nums}
button{font:600 var(--textStyleBody2)/1 inherit;min-height:44px;padding:0 var(--spacingMedium);border:0;border-radius:var(--shapeRoundedRectSmall);background:var(--btn);color:var(--btn-ink);cursor:pointer}
button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
`;

/** Minimal MCP Apps client: handshake, theme, tool result, follow-up message. */
const BRIDGE = `
let nextId=1;const pending=new Map();
function send(msg){window.parent.postMessage(msg,"*")}
function request(method,params){const id=nextId++;send({jsonrpc:"2.0",id,method,params});return new Promise(r=>pending.set(id,r))}
function applyTheme(ctx){if(ctx&&ctx.theme)document.documentElement.dataset.theme=ctx.theme}
function reportSize(){send({jsonrpc:"2.0",method:"ui/notifications/size-changed",params:{width:document.documentElement.scrollWidth,height:document.body.scrollHeight}})}
const reportSoon=()=>setTimeout(reportSize,60); // a timer, not rAF: rAF is paused while the page is in the background
new ResizeObserver(reportSoon).observe(document.body);
window.addEventListener("resize",reportSoon); // the frame was hidden and is shown again
window.addEventListener("message",e=>{const m=e.data;if(!m||m.jsonrpc!=="2.0")return;
  if(m.id&&pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id);return}
  if(m.method==="ui/notifications/tool-result"){const sc=m.params&&m.params.structuredContent;if(sc&&!m.params.isError){render(sc);reportSize()}}
  if(m.method==="ui/notifications/host-context-changed"){applyTheme(m.params);reportSoon()}});
function ask(text){return request("ui/message",{role:"user",content:[{type:"text",text}]})}
const fmt=n=>"$"+Math.round(n).toLocaleString("en-US");
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
if(matchMedia("(prefers-color-scheme: dark)").matches)document.documentElement.dataset.theme="dark";
request("ui/initialize",{appInfo:{name:"ilora-view",version:"0.1.0"},appCapabilities:{},protocolVersion:"2026-01-26"})
  .then(r=>{applyTheme(r&&r.hostContext);send({jsonrpc:"2.0",method:"ui/notifications/initialized",params:{}})});
`;

/** Card: one title, two supporting figures, one action. */
const RENT_CHECK = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rent roll check</title><style>${TOKENS}
.figs{display:grid;grid-template-columns:1fr 1fr;gap:var(--spacingSmall);margin-bottom:var(--spacingMedium)}
.fig{background:var(--outer);border-radius:var(--shapeRoundedRectMedium);padding:var(--spacingSmall)}
.fig b{display:block;font-size:var(--textStyleHeadline1);font-weight:600}
.gap{font-size:var(--textStyleHeadline2);margin:0 0 var(--spacingSmall)}
.gap .num{color:var(--warn);font-weight:600}
ol{margin:0 0 var(--spacingMedium);padding:0;list-style:none}
li{padding:var(--spacingXSmall) 0;border-top:1px solid var(--rule)}
li .row{display:flex;justify-content:space-between;gap:var(--spacingSmall);font-weight:600}
li .src{font-size:var(--textStyleBody3);color:var(--muted);margin-top:2px}
</style></head><body><div class="card" id="root"><p class="kicker">ILORA.ai check</p><h1>Loading…</h1></div>
<script>${BRIDGE}
function render(d){const root=document.getElementById("root");
const causes=d.causes.slice(0,3).map(c=>{const s=c.sources.find(x=>x.line)||c.sources[0];
 return '<li><div class="row"><span>'+esc(c.label)+'</span><span class="num">'+fmt(c.amount)+'</span></div><div class="src">'+esc(s.document)+', page '+s.page+(s.line?', line '+s.line:'')+'</div></li>'}).join("");
root.innerHTML='<p class="kicker">ILORA.ai check · '+esc(d.name)+'</p><h1>'+(d.matches?'Rent roll matches the statement':'Rental income is short of the rent roll')+'</h1>'
 +'<div class="figs"><div class="fig"><span class="muted">Rent roll</span><b class="num">'+fmt(d.rent_roll_total)+'</b></div><div class="fig"><span class="muted">Income statement</span><b class="num">'+fmt(d.statement_total)+'</b></div></div>'
 +(d.matches?'':'<p class="gap">Gap <span class="num">'+fmt(d.gap)+'</span></p><ol>'+causes+'</ol>')
 +(d.causes.length?'<button id="go">Show the lines</button>':'');
const b=document.getElementById("go");if(b)b.onclick=()=>ask("Show me the lines for "+d.causes[0].label+" ("+d.causes[0].flag_id+")")}
</script></body></html>`;

/** List: header plus a homogeneous stack of leases. */
const LEASE_LIST = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Expiring leases</title><style>${TOKENS}
.head{display:flex;justify-content:space-between;align-items:baseline;gap:var(--spacingSmall)}
ul{margin:0;padding:0;list-style:none}
li{display:grid;grid-template-columns:28px 1fr auto;gap:var(--spacingSmall);align-items:center;padding:var(--spacingSmall) 0;border-top:1px solid var(--rule)}
.pos{width:28px;height:28px;border-radius:9999px;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center;font-size:var(--textStyleBody3);font-weight:600}
.t{font-weight:600}.r{text-align:right}
</style></head><body><div class="card" id="root"><p class="kicker">ILORA.ai</p><h1>Loading…</h1></div>
<script>${BRIDGE}
const date=s=>new Date(s+"T12:00:00Z").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"});
function render(d){const root=document.getElementById("root");
const items=d.leases.slice(0,5).map(l=>'<li><span class="pos">'+l.position+'</span><span><span class="t">'+esc(l.label)+'</span><br><span class="muted">Ends '+date(l.expiration_date)+'</span></span><span class="r"><span class="num t">'+fmt(l.annual_rent)+'</span><br><span class="muted num">'+l.share_of_income_pct+'% of income</span></span></li>').join("");
root.innerHTML='<p class="kicker">ILORA.ai · '+esc(d.name)+'</p><div class="head"><h1>'+d.count+(d.count===1?' lease ends':' leases end')+' by '+date(d.window_end)+'</h1></div>'
 +'<p class="muted num" style="margin:0 0 var(--spacingSmall)">'+fmt(d.total_annual_rent)+' a year · '+d.share_of_income_pct+'% of rent roll income</p>'
 +(d.count?'<ul>'+items+'</ul>':'<p class="muted">No leases end in this window.</p>')
 +(d.count>5?'<p class="muted">'+(d.count-5)+' more not shown.</p>':'')}
</script></body></html>`;

export const UI_HTML: Record<string, string> = { [UI.rentCheck]: RENT_CHECK, [UI.leaseList]: LEASE_LIST };

export function registerUiResources(server: McpServer) {
  const meta = { ui: { prefersBorder: false } };
  server.registerResource(
    "rent-check-card",
    UI.rentCheck,
    { title: "Rent roll check card", description: "Card view for check_rent_roll_vs_statement", mimeType: UI_MIME, _meta: meta },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: UI_MIME, text: RENT_CHECK, _meta: meta }] }),
  );
  server.registerResource(
    "expiring-leases-list",
    UI.leaseList,
    { title: "Expiring leases list", description: "List view for list_expiring_leases", mimeType: UI_MIME, _meta: meta },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: UI_MIME, text: LEASE_LIST, _meta: meta }] }),
  );
}
