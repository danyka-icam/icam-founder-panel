// Local dev stand for the v2 panel. NOT deployed (deploy.sh syncs registry/,
// final/ and v2/ only). Serves v2/ plus SYNTHETIC API payloads:
//   /founder-ui-preview/api/...          → inline panel fixtures below
//   /founder-star-view/api/temporal-universe   → fixtures/founder-universe/temporal-universe.json
//   /founder-star-view/api/portfolio-admission → fixtures/founder-universe/portfolio-admission.json
//
// Usage: node dev/stand.mjs            (http://127.0.0.1:8765/founder-ui-preview/v2/)
// Env:   PORT=8765
//        TU=ok|404|timeout|badschema   Temporal Universe behaviour
//        ADM=ok|404|timeout|badschema  Portfolio Admission behaviour
//        ROUTES=ok|down                observer/routes behaviour
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIX = path.join(ROOT, "fixtures", "founder-universe");
const TU = process.env.TU || "ok";
const ADM = process.env.ADM || "ok";
const ROUTES = process.env.ROUTES || "ok";
const now = Date.now(), D = 86400000;
const iso = (d) => new Date(now - d * D).toISOString();

const objects = { items: [
  { object_id: "CMP-000005", name: "BrazilPortal", declared_status: "ACTIVE_BUILD", owning_branch: "BrazilPortal", last_event_at: iso(2), last_meaning_kind: "STAGE_CHANGE", last_summary: "Юр. проверка раздела «Инвесторам» начата" },
  { object_id: "FND-001", name: "Foundation", declared_status: "ACTIVE_INFRASTRUCTURE", owning_branch: "Foundation", last_event_at: iso(4), last_meaning_kind: "GATE_RESULT", last_summary: "Soak: orphan receipt обнаружен" },
  { object_id: "FND-005", name: "Personal Twin", declared_status: "ACTIVE_RESEARCH", owning_branch: "Digital Twin", last_event_at: iso(19), last_meaning_kind: "DECISION", last_summary: "PTC-R0 отложен до стабилизации", needs_founder: true },
  { object_id: "RD1-ATL", name: "Atlas advisory", declared_status: "ACTIVE_DESIGN", owning_branch: "Atlas", last_event_at: iso(1), last_meaning_kind: "STATUS_CHANGE", last_summary: "RC1 принят в read-only" },
  { object_id: "RD1-HSA", name: "Health Security Alliance", declared_status: "PREPARING", owning_branch: "Research", last_event_at: iso(9), last_meaning_kind: "EXTERNAL_EVENT", last_summary: "Партнёр прислал черновик MoU" },
  { object_id: "OPS-014", name: "Market Scanner", declared_status: "ACTIVE_SERVICE", owning_branch: "Signals", last_event_at: iso(3), last_meaning_kind: "TEST_RESULT", last_summary: "QA PASS" },
  { object_id: "OPS-020", name: "Документный хаб", declared_status: "ACTIVE_ENGINEERING", owning_branch: "Foundation", last_event_at: iso(27), last_meaning_kind: "NEW_FILE" },
  { object_id: "RD1-OLD", name: "CVC пилот 2025", declared_status: "ARCHIVED", owning_branch: "Research", last_event_at: iso(140) },
  { object_id: "FND-009", name: "Без происхождения", declared_status: "PARKED" }
]};
const routes = [
  { route_id: "R-TWIN", source_object_id: "FND-005", status: "ACTIVE", stage: "PERSONAL_CLONE_PROSPECTIVE_LEARNING", next_move: "Оценить 2 эпизода и выбрать 1 для пилота", ball_owner: "Founder", review_condition: "До 20 мая при отсутствии прогресса", last_movement_at: iso(16), blockers: [{ title: "Не завершена оценка эпизодов" }, { title: "Нет подтверждения бюджета" }], priority: "HIGH", area: "RESEARCH" },
  { route_id: "R-ATLAS", source_object_id: "RD1-ATL", status: "ACTIVE", stage: "PORTFOLIO_LIVE / ATLAS_ADVISORY_LOCAL_RC1", next_move: "Утвердить модель данных Atlas v1.2", ball_owner: "Архитектор", review_condition: "После интеграции с BrazilPortal", last_movement_at: iso(1), blockers: [], area: "PLATFORM", depends_on: ["R-FND"] },
  { route_id: "R-BP", source_object_id: "CMP-000005", status: "ACTIVE", stage: "ACTIVE_BUILD", next_move: "Юр. проверка контента раздела «Инвесторам»", ball_owner: "Юрист", review_condition: "После получения комментариев", last_movement_at: iso(8), blockers: [{ title: "Нет комментариев юриста" }], area: "PLATFORM", depends_on: ["R-ATLAS"] },
  { route_id: "R-HSA", source_object_id: "RD1-HSA", status: "ACTIVE", stage: "PREPARING", next_move: "Согласование MoU с партнёром", ball_owner: "Операционный директор", review_condition: "Перед встречей 24 мая", last_movement_at: iso(3), blockers: [] },
  { route_id: "R-FND", source_object_id: "FND-001", status: "ACTIVE", stage: "FOUNDATION_FINAL_SOAK", next_move: "Закрыть orphan receipt", ball_owner: "Founder", last_movement_at: iso(4), blockers: [] },
  { route_id: "R-SIG", source_object_id: "OPS-777", status: "ACTIVE", stage: "ACTIVE_SERVICE", ball_owner: "Scanner", last_movement_at: null },
  { route_id: "R-FND2", source_object_id: "FND-001", status: "ACTIVE", stage: "ACTIVE_BUILD", next_move: "Readback byte-for-byte", ball_owner: "Инженер", last_movement_at: iso(6) },
  { route_id: "R-OLD", source_object_id: "RD1-OLD", status: "CLOSED", stage: "DONE", last_movement_at: iso(140) }
];
const panelApi = {
  "observer/routes": () => ROUTES === "down" ? null : { routes },
  "observer/summary": () => ({ summary: { routes_active: 7 } }),
  "observer/metrics": () => ({ metrics: { operational: { stale_routes_7d: { value: 2 } } } }),
  "continuity/founder-inbox": () => ({ needs_founder: [
    { object_id: "FND-005", title: "Подтвердить бюджет пилота Personal Twin", reason: "Решение требует Основателя", opened_at: iso(5) },
    { object_id: "RD1-HSA", title: "Входящее: запрос на партнёрство от фонда", reason: "Внешнее предложение", opened_at: iso(1) }
  ], summary: { needs_founder: 2 } }),
  "continuity/objects": () => objects,
  "continuity/blockers": () => ({ items: [{ object_id: "FND-001", title: "orphan receipt в soak", status: "OPEN" }, { object_id: "X", is_test: true, status: "OPEN" }] }),
  "testing/summary": () => ({ active: [], recent: [] }),
  "testing-health": () => ({}), "testing-runner-health": () => ({}),
  "hub/sync-health": () => ({}), "continuity-health": () => ({}),
  "panel/operations": () => ({ source_status: "AVAILABLE", freshness_state: "FRESH", counts: {}, operations: [] }),
  "panel/brazilportal": () => ({ source_status: "AVAILABLE", status_views: {}, identity: {} }),
  "panel/foundation": () => ({ source_status: "DEGRADED", dimensions: [], blocking_reasons: ["orphan receipt"] }),
  "panel/atlas": () => ({ source_status: "UNAVAILABLE" }),
  "panel/twin": () => ({ source_status: "AVAILABLE" }),
  "signals": () => ({ activation_state: "ACTIVATED", signals: [{ signal_id: "s1", entity: "Fund", title: "t" }] }),
  "signals/field-movement": () => ({ axes: [] }),
  "signals/diagnostics": () => ({})
};

function universe(res, mode, file) {
  if (mode === "404") { res.writeHead(404); return res.end("not found"); }
  if (mode === "timeout") return; // never answer; the client aborts
  const body = JSON.parse(fs.readFileSync(path.join(FIX, file), "utf8"));
  if (mode === "badschema") body.schema_id = body.schema_id.replace(/v0\.\d+$/, "v9.0");
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  let p = u.pathname;
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
  if (p === "/founder-star-view/api/temporal-universe") return universe(res, TU, "temporal-universe.json");
  if (p === "/founder-star-view/api/portfolio-admission") return universe(res, ADM, "portfolio-admission.json");
  if (p.startsWith("/founder-ui-preview/api/")) {
    const key = p.slice("/founder-ui-preview/api/".length);
    if (key.startsWith("continuity/rd1-projection/")) {
      const id = decodeURIComponent(key.split("/").pop());
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(id === "RD1-HSA" ? { object_id: id, stage: "PREPARING", next_gate: "MoU signed", owner: "COO" } : { object_id: id, available: false }));
    }
    const f = panelApi[key]; const body = f && f();
    if (!body) { res.writeHead(503); return res.end("{}"); }
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify(body));
  }
  if (p.startsWith("/founder-ui-preview/")) p = p.slice("/founder-ui-preview".length);
  if (p.endsWith("/")) p += "index.html";
  const fp = path.join(ROOT, p);
  if (!fp.startsWith(path.join(ROOT, "v2")) || !fs.existsSync(fp)) { res.writeHead(404); return res.end(); }
  const ct = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" }[path.extname(fp)] || "application/octet-stream";
  res.writeHead(200, { "content-type": ct });
  fs.createReadStream(fp).pipe(res);
});
const port = Number(process.env.PORT || 8765);
server.listen(port, "127.0.0.1", () => console.log(`stand: http://127.0.0.1:${port}/founder-ui-preview/v2/  TU=${TU} ADM=${ADM} ROUTES=${ROUTES}`));
