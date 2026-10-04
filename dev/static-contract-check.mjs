import fs from "node:fs";
const files = ["v2/index.html", "v2/live.js", "v2/command-center.js", "FOUNDER_PANEL_UPSTREAM_GATES_CONSUMER_CONTRACT_v0.3.md", "FOUNDER_PANEL_UPSTREAM_SOURCE_CONTRACTS.md"];
const src = Object.fromEntries(files.map((f) => [f, fs.readFileSync(new URL("../" + f, import.meta.url), "utf8")]));
const all = Object.values(src).join("\n");
let fails = 0;
function check(ok, msg) {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${msg}`);
  if (!ok) fails++;
}
const panels = [...src["v2/index.html"].matchAll(/data-page-panel="([a-z0-9-]+)"/g)].map((m) => m[1]);
const uniquePanels = [...new Set(panels)];
check(uniquePanels.length === 17, `17 top-level panels declared (${uniquePanels.length})`);
const fetchWrites = [...all.matchAll(/fetch\(\s*["']([^"']+)["']\s*,\s*\{[\s\S]{0,500}?method\s*:\s*["'](POST|PUT|PATCH|DELETE)["']/gi)].map((m) => ({ url: m[1], method: m[2].toUpperCase() }));
const panelPostWrites = [...all.matchAll(/panelPost\(\s*["']([^"']+)["']/g)].map((m) => ({ url: m[1], method: "POST" }));
const browserWrites = fetchWrites.concat(panelPostWrites);
const allowedPosts = new Set([
  "/founder-ui-preview/api/steward-navigator/query",
  "/founder-ui-preview/api/steward-navigator/action/propose-status",
  "/founder-ui-preview/api/steward-navigator/action/confirm-status",
  "/founder-ui-preview/api/steward-navigator/action/propose-decision",
  "/founder-ui-preview/api/steward-navigator/action/confirm-decision",
  "/founder-ui-preview/api/steward-navigator/action/cancel"
]);
const disallowedWrites = browserWrites.filter((x) => !(x.method === "POST" && allowedPosts.has(x.url)));
check(disallowedWrites.length === 0, "browser writes limited to approved Steward query/status/decision flows");
check(!/localStorage|sessionStorage|indexedDB|XMLHttpRequest/.test(all), "no browser-local truth store");
check(!/(?:localhost|127\.0\.0\.1):\d+/.test(all), "no localhost service coordinates in shipped client");
check(!/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)\d{1,3}\.\d{1,3}/.test(all), "no private-network coordinates");
check(!/(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9]{20,}|github_pat_|AKIA[0-9A-Z]{16})/.test(all), "no credential-like literals");
check(!/x-atlas-signals-key|ATLAS_SIGNALS_KEY_FILE/i.test(all), "no signals ingest secret markers");
check(!/с объектом FND-007|Legacy-код обращается к `FND-007`/.test(all), "no legacy BrazilPortal identity hard-code");
check(!/data-drawer=|id="drawer"|top-corner-arrow/.test(src["v2/index.html"]), "no legacy placeholder drawer controls");

const liveClient = src["v2/live.js"];
check(/API \+ "\/agent-registry"/.test(liveClient) && /API \+ "\/agent-lineage"/.test(liveClient), "Agent Network uses only upstream-approved same-origin read projections");
check(!/\/api\/v1\/registry|\/api\/v1\/lineage|127\.0\.0\.1:8840/i.test(liveClient), "browser does not bypass same-origin projection to canonical Agent Registry service coordinates");
const atlasStart = liveClient.indexOf("function renderAtlasStateClean");
const atlasEnd = liveClient.indexOf("function renderAtlasSignalLab", atlasStart);
const atlasRenderer = atlasStart >= 0 && atlasEnd > atlasStart ? liveClient.slice(atlasStart, atlasEnd) : "";
check(!!atlasRenderer && !/marketSignals|signalLabStatus|founderMap|hubHealth|hub\/sync-health/i.test(atlasRenderer), "canonical ATLAS renderer does not promote adjacent signal/lab/map/Hub sources into ATLAS state");
const gates = src["FOUNDER_PANEL_UPSTREAM_GATES_CONSUMER_CONTRACT_v0.3.md"];
check(/State: RESOLVED FOR READ-ONLY FOUNDER CONSUMPTION/.test(gates) && /AICLAVIS Agent Registry Authority/.test(gates), "Agent Registry owner/read gate is explicitly resolved in the current consumer contract");
check(/Gate 2 — ATLAS own state/.test(gates) && /State: RESOLVED FOR READ-ONLY FOUNDER CONSUMPTION/.test(gates) && /aiclavis-atlas-state/.test(gates), "ATLAS Gate 2 owner/read boundary is explicitly resolved in the current consumer contract");
check(/API \+ "\/atlas-state"/.test(liveClient), "ATLAS browser client uses the approved same-origin Founder projection");
check(!/127\.0\.0\.1:8845|\/api\/v1\/atlas-state|\/api\/v1\/founder-projection/.test(liveClient), "ATLAS browser client does not expose canonical service coordinates or direct canonical routes");
const sourceContracts = src["FOUNDER_PANEL_UPSTREAM_SOURCE_CONTRACTS.md"];
check(/канонический upstream → серверная нормализованная проекция → Founder Panel/.test(sourceContracts) && /не становятся каноническим Agent Registry, Lineage или ATLAS state/.test(sourceContracts), "panel-facing source contracts remain explicitly downstream of canonical ownership");

console.log(fails ? `STATIC CONTRACT FAILED: ${fails}` : "STATIC CONTRACT OK");
process.exit(fails ? 1 : 0);
