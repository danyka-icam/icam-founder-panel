import fs from "node:fs";
const files = ["v2/index.html", "v2/live.js", "v2/command-center.js"];
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
const browserWrites = [...all.matchAll(/fetch\(\s*["']([^"']+)["']\s*,\s*\{[\s\S]{0,500}?method\s*:\s*["'](POST|PUT|PATCH|DELETE)["']/gi)].map((m) => ({ url: m[1], method: m[2].toUpperCase() }));
const allowedPosts = new Set([
  "/founder-ui-preview/api/steward-navigator/query",
  "/founder-ui-preview/api/steward-navigator/action/propose-status",
  "/founder-ui-preview/api/steward-navigator/action/confirm-status"
]);
const disallowedWrites = browserWrites.filter((x) => !(x.method === "POST" && allowedPosts.has(x.url)));
check(disallowedWrites.length === 0, "browser writes limited to Steward query + explicit Founder status-correction flow");
check(!/localStorage|sessionStorage|indexedDB|XMLHttpRequest/.test(all), "no browser-local truth store");
check(!/(?:localhost|127\.0\.0\.1):\d+/.test(all), "no localhost service coordinates in shipped client");
check(!/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)\d{1,3}\.\d{1,3}/.test(all), "no private-network coordinates");
check(!/(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9]{20,}|github_pat_|AKIA[0-9A-Z]{16})/.test(all), "no credential-like literals");
check(!/x-atlas-signals-key|ATLAS_SIGNALS_KEY_FILE/i.test(all), "no signals ingest secret markers");
check(!/с объектом FND-007|Legacy-код обращается к `FND-007`/.test(all), "no legacy BrazilPortal identity hard-code");
console.log(fails ? `STATIC CONTRACT FAILED: ${fails}` : "STATIC CONTRACT OK");
process.exit(fails ? 1 : 0);
