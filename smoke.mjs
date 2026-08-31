// Post-deploy browser smoke check for the ICAM Founder Panel.
// Loads the real production page (through nginx Basic Auth) headlessly and
// fails loudly on any console/page error — same check Klim ran by hand
// during the initial handoff (2026-08-31), now automated.
//
// Auth: a dedicated read-only Basic Auth user (`ci-smoke`), separate from
// Niki's own founder credentials — scoped to this check only.
//
// Env:
//   PANEL_URL              default: production /final/index.html
//   PANEL_SMOKE_BASIC_AUTH  "user:pass" (from ICAM_PANEL_SMOKE_BASIC_AUTH secret)

import { chromium } from "playwright";

const url =
  process.env.PANEL_URL ||
  "https://console.attentionmechanics.institute/founder-ui-preview/final/index.html";
const auth = process.env.PANEL_SMOKE_BASIC_AUTH || "";
const [username, password] = auth.split(":");

if (!username || !password) {
  console.error("PANEL_SMOKE_BASIC_AUTH not set (expected 'user:pass')");
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 1200 },
  httpCredentials: { username, password },
});

const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push("console: " + msg.text());
});
page.on("requestfailed", (req) => {
  // 401/404 on an asset the page itself requested is a real regression.
  errors.push("requestfailed: " + req.url() + " (" + (req.failure()?.errorText || "?") + ")");
});

let httpStatus = null;
try {
  const response = await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
  httpStatus = response ? response.status() : null;
  await page.waitForTimeout(1000);
} catch (e) {
  errors.push("navigation failed: " + e.message);
}

await browser.close();

if (httpStatus !== 200) {
  errors.push("unexpected HTTP status: " + httpStatus);
}

if (errors.length) {
  console.error("SMOKE CHECK FAILED:");
  for (const e of errors) console.error(" - " + e);
  process.exit(1);
}

console.log("SMOKE CHECK PASSED: " + url + " (HTTP " + httpStatus + ", 0 errors)");
