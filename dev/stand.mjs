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
//        INBOX=ok|many                 many = 9 needs_founder items (some undated) for the hero
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIX = path.join(ROOT, "fixtures", "founder-universe");
const TU = process.env.TU || "ok";
const ADM = process.env.ADM || "ok";
const ROUTES = process.env.ROUTES || "ok";
const INBOX = process.env.INBOX || "ok";
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
  { route_id: "R-OLD", source_object_id: "RD1-OLD", status: "CLOSED_NO_GO", stage: "DONE", next_move: "старый шаг не должен считаться активным", deadline: "2026-08-20", last_movement_at: iso(140) }
];
const founderProjection = {
  schema_id: "founder-projection.v0.1", compiled_at: new Date().toISOString(), read_only: true,
  coverage: { path_memory_complete: false, movement_complete: false },
  lines: [
    { line: "Финальная стабилизация Foundation", world: "Фундамент и инфраструктура", state: "движется", state_basis: "VERIFIED_RULE",
      capital_in_use: [{ capital_id: "CAP-STATE", resource: "Company semantic state stack" }],
      intersections: [{ with: "BrazilPortal", bridge_refs: ["CAP-STATE"], evidence_ceiling: "Shared admitted capital only; not causality." }] },
    { line: "BrazilPortal", world: "Продукты и порталы", state: "нужна сверка", state_basis: "CYCLE_EVIDENCE_REQUIRED",
      capital_in_use: [{ capital_id: "CAP-STATE", resource: "Company semantic state stack" }],
      intersections: [{ with: "Финальная стабилизация Foundation", bridge_refs: ["CAP-STATE"], evidence_ceiling: "Shared admitted capital only; not causality." }] },
    { line: "Atlas advisory", world: "Продукты и порталы", state: "здоровое ожидание", state_basis: "VERIFIED_RULE", capital_in_use: [], intersections: [] }
  ],
  today: {
    founder_decisions: [
      { decision_id: "D-1", lifecycle_id: "FDL-SMOKE-1", question: "Разрешить тестовый запуск?", why_now: "Пакет готов к явному решению.", presentation_state: "READY", authority_mode: "RECONCILED_EXISTING_CANON", deadline_or_condition: "До решения запуск запрещён.", object_refs: [{ id: "FND-003", kind: "founder_object" }], identity_evidence: [{ type: "decision_id", value: "D-1" }, { type: "decision_packet_sha256", value: "smoke-packet-1" }], choices: [{ canonical: "APPROVE", label: "Одобрить" }, { canonical: "DEFER", label: "Отложить" }] },
      { decision_id: "D-2", question: "Подтвердить следующий этап?", why_now: "Достигнут текущий рубеж.", presentation_state: "READY", choices: [{ canonical: "APPROVE", label: "Подтвердить" }] }
    ],
    company_movements: [
      { movement_id: "MOV-1", source_system: "Testing", source_object_id: "FND-001", state_family: "BLOCKED_SOURCE_CUSTODY", human_change: "Диагностический тест заблокирован из-за отсутствия исходных материалов.", why_it_matters: "Проблема в передаче данных, а не в проверяемой гипотезе.", evidence_ceiling: "Не является научным опровержением.", next_effect: "Нужен полный пакет исходных материалов.", evidence_count: 2, first_seen: iso(2), last_seen: iso(1) }
    ]
  },
  company_capital: { admitted_count: 1, items: [
    { id: "CAP-STATE", type: "ORGANIZATIONAL_CAPABILITY", maturity: "REUSED_CAPITAL", preserved_resource: "Company semantic state stack", evidence_ceiling: "Operational capability only.", consumer_lines: ["Финальная стабилизация Foundation", "BrazilPortal"] }
  ] },
  organizational_intelligence: { signal_count: 2, founder_action_count: 0 },
  intersections: { edge_count: 1 }, steward: { system_reconciliation_count: 1, founder_gate_count: 2 },
  hard_rules: ["Решение Основателя показывается только из Founder Decision Presentation."]
};

const organizationalIntelligence = {
  schema_id: "organizational-intelligence-projection.v0.1", compiled_at: new Date().toISOString(), read_only: true,
  signal_count: 4, founder_action_count: 1, signals: [
    { signal_id: "OI-COMP-1", class: "COMPOUNDING_LOOP", subject: "CAP-STATE", affected_lines: ["Финальная стабилизация Foundation", "BrazilPortal"], evidence_refs: ["CAP-STATE"], evidence_ceiling: "Recorded reuse only; not causal improvement.", falsification_condition: "Reuse is withdrawn.", founder_action_required: false },
    { signal_id: "OI-DEP-1", class: "DEPENDENCY_CONCENTRATION_CANDIDATE", subject: "CAP-STATE", affected_lines: ["Финальная стабилизация Foundation", "BrazilPortal", "Atlas advisory"], evidence_refs: ["CAP-STATE"], evidence_ceiling: "Recorded concentration only; not fragility or risk.", falsification_condition: "Independent substitutes are verified.", founder_action_required: false },
    { signal_id: "OI-GAP-1", class: "CANONICAL_ROUTE_GAP", subject: "Public proof assets", affected_lines: [], evidence_refs: ["GAP-PUBLIC"], evidence_ceiling: "Recorded route gap only; no urgency inference.", falsification_condition: "A canonical downstream route is verified.", founder_action_required: false },
    { signal_id: "OI-FDG-1", class: "FOUNDER_AUTHORITY_GATE", subject: "Founder approval required for frozen run", affected_lines: [], evidence_refs: ["FDL-1"], evidence_ceiling: "Current OPEN Founder Decision Lifecycle only.", falsification_condition: "Lifecycle is resolved.", founder_action_required: true }
  ]
};

const founderRadar = {
  schema: "aiclavis.founder-radar.v0.1", generated_at: new Date().toISOString(), read_only: true,
  attention: [], opportunities: [],
  waiting: [{ radar_id: "wait-smoke-1", title: "Ждём внешний ответ по тестовой заявке.", date: null, status: "WAITING", why: "Ответ находится вне контура компании.", context: { world: "Коммерческий ATLAS", line: "Рыночный вход", branch: "Smoke branch" }, source_ref: { kind: "temporal_branch_waiting", memory_id: "MEM-SMOKE", waiting_id: "N-SMOKE" } }],
  upcoming: [], predictions: [],
  field: { source_coverage: { ok_count: 1, total_sources: 1 }, signals: [{ radar_id: "field-smoke-1", signal_id: "SIG-SMOKE-1", title: "Внешний сигнал для проверки", status: "ACT", relevance_score: 88, why: "Появилось подтверждённое изменение во внешнем поле.", context: { world: "Коммерческий ATLAS", line: "Рынок", branch: "Signal smoke" }, source_ref: { kind: "market_signal", signal_id: "SIG-SMOKE-1" }, evidence: [{ kind: "fixture" }] }] },
  atlas_learning: [], investment: { available: false }, reputation: []
};

const stewardReconciliation = {
  schema_id: "steward-reconciliation-projection.v0.1", compiled_at: new Date().toISOString(), read_only: true,
  system_reconciliation_count: 3, founder_gate_count: 1, workqueue_observed_count: 4, organizational_intelligence_signal_count: 4, intersection_edge_count: 1,
  system_reconciliation: [
    { reconciliation_id: "REC-S1", source: "COMPANY_PATH", subject: "BrazilPortal", gap_class: "CYCLE_EVIDENCE_REQUIRED", route: "SYSTEM_RECONCILIATION", founder_action_required: false, evidence_refs: ["BrazilPortal","CYCLE_EVIDENCE_REQUIRED"] },
    { reconciliation_id: "REC-S2", source: "COMPANY_PATH", subject: "Atlas advisory", gap_class: "INSUFFICIENT_ORDERED_PATH_EVIDENCE", route: "SYSTEM_RECONCILIATION", founder_action_required: false, evidence_refs: ["Atlas advisory"] },
    { reconciliation_id: "REC-S3", source: "COMPANY_CAPITAL", subject: "Public proof assets", gap_class: "ROUTE_NOT_CANONICAL", route: "SYSTEM_RECONCILIATION", founder_action_required: false, evidence_refs: ["GAP-PUBLIC"] }
  ],
  founder_gates: [{ lifecycle_id: "FDL-1", subject: "Founder approval required for frozen run", route: "FOUNDER_DECISION_LIFECYCLE", founder_action_required: true }],
  hard_rules: ["System reconciliation gaps never become Founder tasks by default."]
};

const panelApi = {
  "founder-projection": () => founderProjection,
  "radar": () => founderRadar,
  "organizational-intelligence": () => organizationalIntelligence,
  "steward-reconciliation": () => stewardReconciliation,
  "observer/routes": () => ROUTES === "down" ? null : { routes },
  "observer/summary": () => ({ summary: { routes_active: 7 } }),
  "observer/metrics": () => ({ metrics: { operational: { stale_routes_7d: { value: 2 } } } }),
  "continuity/founder-inbox": () => INBOX === "many" ? ({ needs_founder: [
    { object_id: "FND-005", title: "Решение D-12д", reason: "r", opened_at: iso(12) },
    { object_id: "RD1-HSA", title: "Решение D-без-даты-1", reason: "r" },
    { object_id: "CMP-000005", title: "Решение D-1д", reason: "r", opened_at: iso(1) },
    { object_id: "OPS-014", title: "Решение D-30д", reason: "r", opened_at: iso(30) },
    { object_id: "OPS-020", title: "Решение D-3д", reason: "r", opened_at: iso(3) },
    { object_id: "FND-001", title: "Решение D-без-даты-2", reason: "r" },
    { object_id: "RD1-ATL", title: "Решение D-7д", reason: "r", opened_at: iso(7) },
    { object_id: "FND-009", title: "Решение D-0д", reason: "r", opened_at: iso(0) },
    { object_id: "RD1-OLD", title: "Решение D-90д", reason: "r", opened_at: iso(90) }
  ], summary: { needs_founder: 9 } }) : ({ needs_founder: [
    { object_id: "FND-005", title: "Подтвердить бюджет пилота Personal Twin", reason: "Решение требует Основателя", opened_at: iso(5) },
    { object_id: "RD1-HSA", title: "Входящее: запрос на партнёрство от фонда", reason: "Внешнее предложение", opened_at: iso(1) }
  ], summary: { needs_founder: 2 } }),
  "continuity/objects": () => objects,
  "continuity/blockers": () => ({ items: [{ object_id: "FND-001", title: "orphan receipt в soak", status: "OPEN" }, { object_id: "X", is_test: true, status: "OPEN" }] }),
  "testing/summary": () => ({ active: [{ test_id: "TEST-SMOKE-1", request_sha: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789", owning_branch: "Smoke Research", object_id: "FND-SMOKE", test_type: "METHODOLOGY", status: "NEEDS_ADJUDICATION", current_gate: "U10_HANDOFF", procedure_status: "PROCEDURE_PASS", scientific_outcome: "DOMAIN_ADJUDICATION_REQUIRED", result_path: "/private/testing/TEST-SMOKE-1/result__rev2.json", delivery_state: "PUBLISHED", delivery_revision: 2, evidence_refs: ["TEST-SMOKE-1:A:aaa", "TEST-SMOKE-1:B:bbb"], updated_at: iso(0) }], recent: [] }),
  "testing-health": () => ({}), "testing-runner-health": () => ({}),
  "hub/sync-health": () => ({ objects_on_disk: 853, orphan_receipts: 1, hash_mismatches: 0, coverage: "FULL_END_TO_END", recent_48h: [{ filename: "SMOKE_PACKET_2026-10-03.json", branch: "Smoke branch", outbox: true, server: true, index: true, review: "PENDING", received_at: iso(0) }], review_rows: [{ packet_file: "SMOKE_PACKET_2026-10-03.json", claimed_object_id: "FND-SMOKE", sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", artifact_class: "WORKING_REFERENCE", still_pending: true }, { packet_file: "UNKNOWN_PACKET_2026-10-03.md", claimed_object_id: "UNRESOLVED", sha256: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789", artifact_class: "UNKNOWN", still_pending: true, classification_reason: "no explicit canonical/operational/working signal found in content", received_at: iso(0) }] }), "continuity-health": () => ({}),
  "panel/operations": () => ({ source_status: "AVAILABLE", freshness_state: "FRESH", counts: {}, operations: [] }),
  "panel/brazilportal": () => ({
    source_status: "AVAILABLE",
    status_views: {
      declared_status: "ACTIVE_BUILD",
      projected_status: "RESTORE_TARGET_SET",
      projected_status_canonical_relation: "UNRESOLVED"
    },
    identity: {
      component_id: "CMP-SMOKE-BP",
      operational_object_id: "BP-OP-SMOKE-42",
      relation: "DIFFERENT_NAMESPACES_SAME_SYSTEM",
      canonical_read_key: "BP-OP-SMOKE-42"
    },
    open_blockers: { count: 2 }
  }),
  "panel/foundation": () => ({ source_status: "DEGRADED", dimensions: [], blocking_reasons: ["orphan receipt"] }),
  "panel/atlas": () => ({ source_status: "UNAVAILABLE", error_class: "NO_ATLAS_STATE_SOURCE", degraded_reason: "ATLAS has no state source: it is not a Continuity object, exposes no service or state store on this host, and exists in the Hub only as documents (ATLAS_UPDATE_* library artifacts). Those documents are not state and are deliberately not parsed as state.", blocked_stage: "BLOCKED_UPSTREAM", unavailable_fields: ["current_state","learning_state","promotion_state"], unblock_requires: "ATLAS must expose its own state -- either as a Continuity object reporting projected fields, or as a service with a state store. Until then the panel should render UNAVAILABLE with this reason and must not infer role, promotion or learning state from library documents." }),
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
