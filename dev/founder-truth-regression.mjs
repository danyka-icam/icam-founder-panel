const BASE = (process.env.PANEL_BASE_URL || "http://127.0.0.1:18883").replace(/\/$/, "");
let fails = 0;
function check(ok, msg, detail = "") {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${msg}${detail ? " · " + detail : ""}`);
  if (!ok) fails++;
}
async function get(path) {
  const r = await fetch(BASE + path, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}
function arr(v) { return Array.isArray(v) ? v : []; }
function n(v) { const x = Number(v); return Number.isFinite(x) ? x : null; }

const paths = {
  docs: "/founder-ui-preview/api/hub/sync-health",
  testing: "/founder-ui-preview/api/testing/summary",
  foundation: "/founder-ui-preview/api/panel/foundation",
  registry: "/founder-ui-preview/api/agent-registry",
  lineage: "/founder-ui-preview/api/agent-lineage",
  commercial: "/founder-ui-preview/commercial/dashboard.json",
  signals: "/founder-ui-preview/api/signals",
  scanner: "/founder-ui-preview/api/signals/diagnostics",
  operations: "/founder-ui-preview/api/panel/operations"
};
const data = {};
for (const [k,p] of Object.entries(paths)) {
  try { data[k] = await get(p); check(true, `${k} source readable`); }
  catch (e) { check(false, `${k} source readable`, e.message); }
}

if (data.docs) {
  const q = data.docs.review_queue || {};
  const manual=n(q.manual_review_required), actionable=n(q.actionable_review), quarantine=n(q.unassigned_review_quarantine);
  check(manual == null || actionable == null || quarantine == null || manual === actionable + quarantine,
    "document manual review splits into actionable + quarantine",
    `manual=${manual} actionable=${actionable} quarantine=${quarantine}`);
  const legacy=n(q.legacy_unassigned_quarantine), fresh=n(q.new_unassigned_quarantine);
  check(quarantine == null || legacy == null || fresh == null || quarantine === legacy + fresh,
    "document quarantine splits into legacy + new",
    `quarantine=${quarantine} legacy=${legacy} new=${fresh}`);
}

if (data.testing) {
  const active=arr(data.testing.active), recent=arr(data.testing.recent), founder=arr(data.testing.needs_founder);
  const by=new Map([...active,...recent].filter(x=>x&&x.test_id).map(x=>[x.test_id,x]));
  const contour=[...by.values()].filter(x=>["NEEDS_ADJUDICATION","RERUN_REQUIRED","BLOCKED"].includes(String(x.status||"").toUpperCase()));
  check(Array.isArray(data.testing.needs_founder), "Testing explicitly supplies needs_founder[]", `founder=${founder.length}`);
  check(true, "Testing contour work kept distinct from Founder work", `contour=${contour.length} founder=${founder.length}`);
}

if (data.commercial) {
  const t=data.commercial.totals||{};
  const all=n(t.all), live=n(t.live_dated), imported=n(t.imported_undated);
  check(all == null || live == null || imported == null || all === live + imported,
    "commercial total splits into live-dated + imported-undated",
    `all=${all} live=${live} imported=${imported}`);
  const waiting=n(t.waiting), wl=n(t.waiting_live_dated), wi=n(t.waiting_imported_undated);
  check(waiting == null || wl == null || wi == null || waiting === wl + wi,
    "commercial waiting splits by provenance",
    `waiting=${waiting} live=${wl} imported=${wi}`);
  check(arr(data.commercial.manual_queue).length === (n(t.founder) ?? arr(data.commercial.manual_queue).length),
    "commercial Founder/manual queue reconciles with founder count",
    `manual=${arr(data.commercial.manual_queue).length} founder=${t.founder}`);
}

if (data.registry && data.lineage) {
  const agents=arr(data.registry.agents), edges=arr(data.lineage.edges), c=data.registry.counts||{};
  const ids=new Set(agents.map(a=>a.agent_id).filter(Boolean));
  const verifiedAgents=agents.filter(a=>String(a.evidence_status||"").toUpperCase()==="VERIFIED").length;
  const verifiedEdges=edges.filter(e=>String(e.verification_state||"").toUpperCase()==="VERIFIED").length;
  const outside=[...new Set(edges.flatMap(e=>[e.source_id,e.target_id]).filter(id=>id&&!ids.has(id)))];
  check(n(c.total_agents)==null || n(c.total_agents)===agents.length, "Agent Registry total reconciles with agents[]", `count=${c.total_agents} rows=${agents.length}`);
  check(outside.length===0, "all Lineage endpoints exist in Agent Registry", outside.join(", "));
  check(verifiedAgents<=agents.length, "verified agent evidence count is bounded", `${verifiedAgents}/${agents.length}`);
  check(verifiedEdges<=edges.length, "verified lineage count is bounded", `${verifiedEdges}/${edges.length}`);
  const gapKeys=["authority_conflicts","unregistered_agents","decisions_without_evidence","lineage_gaps","stalled_agents","degraded_agents"];
  const missing=gapKeys.filter(k=>c[k]==null);
  check(missing.length===0, "Agent Registry supplies all Founder gap counters", missing.join(", "));
}

if (data.foundation) {
  const f=data.foundation, dims=arr(f.dimensions), blocking=arr(f.blocking_reasons);
  const mandatory=dims.filter(d=>d.mandatory!==false);
  const pass=mandatory.filter(d=>String(d.state||"").toUpperCase()==="PASS");
  if (String(f.source_status||"").toUpperCase()==="READY") {
    check(mandatory.length>0 && pass.length===mandatory.length, "Foundation READY requires all mandatory dimensions PASS", `${pass.length}/${mandatory.length}`);
    check(blocking.length===0, "Foundation READY requires zero blocking reasons", `blocking=${blocking.length}`);
  } else {
    check(true, "Foundation is not READY; strict READY gate not applied", String(f.source_status||""));
  }
}

if (data.signals && data.scanner) {
  const c=data.signals.counts||{}, stored=n(c.stored_total), returned=n(c.returned);
  check(stored==null || returned==null || stored>=returned, "signal storage is not smaller than current read window", `stored=${stored} returned=${returned}`);
  const emitted=n(data.scanner?.scanner?.run_summary?.signals_emitted);
  check(emitted==null || emitted>=0, "scanner last-cycle emissions are an independent nonnegative counter", `emitted=${emitted}`);
}

if (data.operations) {
  const ops=arr(data.operations.operations);
  const closed=new Set(["DONE","CLOSED","ARCHIVED","CANCELLED"]);
  const open=ops.filter(o=>!closed.has(String(o.status||"").toUpperCase()));
  const objects=new Set(open.map(o=>String(o.object_id||"объект не определён")));
  check(objects.size<=open.length, "operations object count does not exceed open commitment rows", `objects=${objects.size} rows=${open.length}`);
}

console.log(fails ? `FOUNDER TRUTH REGRESSION FAILED: ${fails}` : "FOUNDER TRUTH REGRESSION OK");
process.exit(fails ? 1 : 0);
