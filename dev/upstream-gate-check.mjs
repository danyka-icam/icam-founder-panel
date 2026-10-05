#!/usr/bin/env node
import fs from "node:fs";

const MODES = new Set(["agent-record", "lineage-edge", "atlas-state"]);

const REQUIRED = {
  "agent-record": [
    "agent_id", "name", "kind", "owner_branch", "runtime_identity",
    "service_or_runtime", "status", "version_release", "authority_class",
    "canonical_write_scope", "approval_requirement", "input_channels",
    "output_channels", "authority_scope", "evidence_contract",
    "downstream_consumers", "verification_state", "verified_at",
    "record_revision", "last_transition_at"
  ],
  "lineage-edge": [
    "edge_id", "source_id", "target_id", "relation", "evidence_refs",
    "verification_state", "asserted_at", "edge_revision", "last_transition_at"
  ],
  "atlas-state": [
    "atlas_state_version", "generated_at", "source_authority", "operating_mode",
    "active_modules", "signal_pipeline_health", "research_runs_active",
    "commercial_runs_active", "frozen_or_disabled_branches",
    "current_blockers", "current_decisions_or_gates", "evidence_refs",
    "freshness"
  ]
};

function own(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function validate(mode, payload) {
  const errors = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return ["payload must be a JSON object"];
  }

  for (const key of REQUIRED[mode]) {
    if (!own(payload, key)) errors.push(`missing required field: ${key}`);
  }


  return errors;
}

function selfTest() {
  const completeAgent = {
    agent_id: "AGENT-1", name: "Example", kind: "reasoning", owner_branch: null,
    runtime_identity: "runtime", service_or_runtime: "service", status: "ACTIVE",
    version_release: "v1", authority_class: "READ_ONLY", canonical_write_scope: [],
    approval_requirement: false, input_channels: [], output_channels: [], authority_scope: [],
    evidence_contract: ["evidence:1"], downstream_consumers: [], verification_state: "VERIFIED",
    verified_at: "2026-10-04T00:00:00Z", record_revision: 1, last_transition_at: "2026-10-04T00:00:00Z"
  };
  const completeEdge = {
    edge_id: "AGENT-1::PRODUCES::PROJ-1", source_id: "AGENT-1", target_id: "PROJ-1", relation: "PRODUCES",
    evidence_refs: ["evidence:edge:1"], verification_state: "VERIFIED", asserted_at: "2026-10-04T00:00:00Z",
    edge_revision: 1, last_transition_at: "2026-10-04T00:00:00Z"
  };
  const completeAtlas = Object.fromEntries(REQUIRED["atlas-state"].map((k) => [k, null]));

  const checks = [
    [validate("agent-record", completeAgent).length === 0, "complete agent record passes"],
    [validate("agent-record", {...completeAgent, authority_class: undefined}).length === 0, "present-but-unknown agent field is not rewritten by validator"],
    [validate("agent-record", Object.fromEntries(Object.entries(completeAgent).filter(([k]) => k !== "agent_id"))).some(x => x.includes("agent_id")), "missing agent identity fails"],
    [validate("lineage-edge", completeEdge).length === 0, "complete lineage edge passes"],
    [validate("lineage-edge", Object.fromEntries(Object.entries(completeEdge).filter(([k]) => k !== "relation"))).some(x => x.includes("relation")), "missing lineage relation fails"],
    [validate("atlas-state", completeAtlas).length === 0, "complete ATLAS contract shape passes even when values are explicitly unknown"],
    [validate("atlas-state", Object.fromEntries(Object.entries(completeAtlas).filter(([k]) => k !== "source_authority"))).some(x => x.includes("source_authority")), "missing ATLAS source authority fails"]
  ];

  let failed = 0;
  for (const [ok, label] of checks) {
    console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}`);
    if (!ok) failed++;
  }
  console.log(failed ? `UPSTREAM GATE SELF-TEST FAILED: ${failed}` : "UPSTREAM GATE SELF-TEST OK");
  process.exit(failed ? 1 : 0);
}

const [,, mode, file] = process.argv;

if (mode === "--self-test") selfTest();

if (!MODES.has(mode) || !file) {
  console.error("usage: node dev/upstream-gate-check.mjs <agent-record|lineage-edge|atlas-state> <payload.json>");
  console.error("       node dev/upstream-gate-check.mjs --self-test");
  process.exit(2);
}

let payload;
try {
  payload = JSON.parse(fs.readFileSync(file, "utf8"));
} catch (err) {
  console.error(`cannot read JSON payload: ${err.message}`);
  process.exit(2);
}

const errors = validate(mode, payload);
if (errors.length) {
  console.error(`UPSTREAM GATE NOT SATISFIED (${mode})`);
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}

console.log(`UPSTREAM GATE SHAPE SATISFIED (${mode})`);
console.log("This validates field presence only. It does NOT prove canonical ownership, semantic correctness, freshness, or authorization.");
