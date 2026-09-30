"""Regenerate the synthetic Founder Universe fixtures.

python3 fixtures/founder-universe/generate.py

Synthetic data only. It follows the declared top-level contracts of
atlas-temporal-universe.v0.1 and atlas-portfolio-admission.v0.1 and matches
the current production-preview counts (3 worlds / 16 lines / 24 placed stars /
7 company events / 4 line events / 3 unresolved; memory=113, placed=24,
exact_owner_candidates=11, review_required=78, owner_conflicts=1).
Nested shapes that the contract summary does not spell out (world keys,
history items, temporal, capital, trajectories, conflicts, trusted_owner_map
values, rules) are ASSUMED here; see README.md.
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))

WORLDS = [
 ("W-FOUNDATION", "Фундамент и инфраструктура", [
   ("L-FND-SOAK", "Финальная стабилизация Foundation", [("FND-001", "Foundation", "Foundation core", True), ("FND-002", "Readback контур", "Artifact readback", True)]),
   ("L-FND-AUTH", "Путь полномочий", [("FND-003", "Authority envelope", "Authority action path", False)]),
   ("L-FND-HUB", "Документный хаб", [("FND-004", "Hub sync", "Hub durability", True), ("FND-006", "Manual review queue", "Hub review queue", False)]),
   ("L-FND-TEST", "Контур тестирования", [("FND-008", "Testing runner", "Testing execution", True)]),
   ("L-FND-DIAG", "Диагностика источников", [("FND-010", "Source diagnostics", "Panel diagnostics", True)]),
 ]),
 ("W-PRODUCTS", "Продукты и порталы", [
   ("L-BP-CORE", "BrazilPortal", [("CMP-000005", "BrazilPortal", "BrazilPortal component", True), ("CMP-000006", "Раздел «Инвесторам»", "Investor section", False)]),
   ("L-BP-LEGAL", "Юридический контур BrazilPortal", [("CMP-000007", "Юр. проверка контента", "Legal review", True)]),
   ("L-ATLAS", "Atlas advisory", [("RD1-ATL", "Atlas advisory", "Atlas advisory RC1", True), ("RD1-ATL-2", "Atlas data model v1.2", "Atlas data model", False)]),
   ("L-SIGNALS", "Market Scanner", [("OPS-015", "Scanner bridge", "Market scanner bridge", True), ("OPS-016", "Field movement", "Field movement axes", True)]),
   ("L-TWIN", "Personal Twin", [("FND-005", "Personal Twin", "Personal Twin FND-005", True), ("FND-005-P", "PTC-R0 протокол", "PTC-R0", False)]),
   ("L-OPS", "Операционные обязательства", [("OPS-021", "Commitments ledger", "Commitments", True), ("OPS-022", "Ball owner registry", "Ball owner", False)]),
 ]),
 ("W-RESEARCH", "Исследования и партнёрства", [
   ("L-HSA", "Health Security Alliance", [("RD1-HSA", "Health Security Alliance", "HSA partnership", True), ("RD1-HSA-MOU", "MoU с партнёром", "HSA MoU", False)]),
   ("L-RD1", "RD1 read-only операция", [("RD1-OPS", "RD1 operation", "RD1 read-only", True)]),
   ("L-CVC", "Корпоративный венчурный контур", [("RD1-CVC", "CVC оценка стартапов", "CVC evaluation", False), ("RD1-CVC-P", "Пилот CVC", "CVC pilot", False)]),
   ("L-VOICE", "Construction voice research", [("RD1-VOICE", "Voice corpus", "Construction voice", True)]),
   ("L-ACCEL", "Акселерация health-tech", []),
 ]),
]
CAPITAL = {
  "L-BP-CORE": {"status": "ALLOCATED", "amount": 120000, "currency": "USD", "source": "seed tranche 1"},
  "L-CVC": {"status": "REQUESTED", "amount": 50000, "currency": "USD", "source": "CVC pilot budget"},
}
LINE_HISTORY = {
  "L-FND-SOAK": [{"at": "2026-09-26T10:00:00Z", "title": "Обнаружен orphan receipt в soak", "kind": "GATE_RESULT"}],
  "L-ATLAS": [{"at": "2026-09-29T09:30:00Z", "title": "RC1 принят в read-only", "kind": "STATUS_CHANGE"}],
  "L-BP-LEGAL": [{"at": "2026-09-28T14:00:00Z", "title": "Юр. проверка раздела «Инвесторам» начата", "kind": "STAGE_CHANGE"}],
  "L-HSA": [{"at": "2026-09-21T12:00:00Z", "title": "Партнёр прислал черновик MoU", "kind": "EXTERNAL_EVENT"}],
}
TEMPORAL = {
  "FND-001": {"past": "Soak выявил orphan receipt", "present": "Финальная стабилизация", "waiting": "Закрытие orphan receipt", "next": "Readiness aggregate PASS"},
  "CMP-000005": {"past": "Портал собран", "present": "Активная сборка", "waiting": "Комментарии юриста", "next": "Публикация раздела «Инвесторам»"},
  "FND-005": {"past": "PTC-R0 отложен", "present": "Проспективное обучение", "waiting": "Оценка эпизодов", "next": "Выбор эпизода для пилота"},
  "RD1-HSA": {"past": "Черновик MoU получен", "present": "Подготовка", "waiting": "Встреча с партнёром", "next": "Подписание MoU"},
}

def temporal_universe():
    worlds, placed = [], []
    for wid, wt, lines in WORLDS:
        wl = []
        for lid, lt, brs in lines:
            b = []
            for i, (mid, t, ct, ver) in enumerate(brs):
                b.append({"id": f"{lid}-B{i + 1}", "title": t, "canonical_title": ct, "memory_id": mid, "verified": ver,
                          "temporal": TEMPORAL.get(mid)})
                placed.append((mid, lid, wid))
            wl.append({"id": lid, "title": lt, "branches": b, "capital": CAPITAL.get(lid), "recent_history": LINE_HISTORY.get(lid, [])})
        worlds.append({"id": wid, "title": wt, "lines": wl})
    tu = {
      "schema": "atlas-temporal-universe.v0.1",
      "window": {"from": "2026-07-02T00:00:00Z", "to": "2026-09-30T00:00:00Z", "days": 90},
      "company_history": [
        {"at": "2026-07-08T10:00:00Z", "title": "Запущен портфель Founder Universe", "kind": "DECISION"},
        {"at": "2026-07-21T10:00:00Z", "title": "RD1 принят в read-only режиме", "kind": "GATE_RESULT"},
        {"at": "2026-08-04T10:00:00Z", "title": "Market Scanner прошёл QA", "kind": "TEST_RESULT"},
        {"at": "2026-08-18T10:00:00Z", "title": "BrazilPortal объявлен приоритетным направлением", "kind": "DECISION"},
        {"at": "2026-09-03T10:00:00Z", "title": "Панель v2 принята как кандидат интеграции", "kind": "STATUS_CHANGE"},
        {"at": "2026-09-12T10:00:00Z", "title": "Personal Twin: safe read projection", "kind": "STAGE_CHANGE"},
        {"at": "2026-09-25T10:00:00Z", "title": "Foundation перешёл в финальный soak", "kind": "STAGE_CHANGE"}],
      "worlds": worlds,
      "strategic_trajectories": [
        {"id": "T-PLATFORM", "title": "Платформа для инвесторов", "lines": ["L-ATLAS", "L-BP-CORE", "L-BP-LEGAL"], "status": "ACTIVE"},
        {"id": "T-TRUST", "title": "Доверенный фундамент", "lines": ["L-FND-SOAK", "L-FND-AUTH", "L-FND-TEST"], "status": "ACTIVE"},
        {"id": "T-HEALTH", "title": "Health-tech партнёрства", "lines": ["L-HSA", "L-ACCEL"], "status": "FORMING"}],
      "unresolved_history": [
        {"at": "2026-09-10T10:00:00Z", "title": "Встреча с фондом из Сингапура", "reason": "нет канонического объекта-владельца"},
        {"at": "2026-08-27T10:00:00Z", "title": "Черновик тезисов для инвестора", "reason": "владелец не подтверждён"},
        {"at": "2026-08-02T10:00:00Z", "title": "Идея: программа акселерации", "reason": "не размещено ни в одной линии"}],
      "rules": ["Мир и линия берутся только из канонической Founder Universe",
                "unresolved_history не привязывается к объектам по сходству",
                "Звезда видна на карте только после размещения"],
    }
    assert len(worlds) == 3 and sum(len(w["lines"]) for w in worlds) == 16 and len(placed) == 24
    assert len(tu["company_history"]) == 7 and sum(len(v) for v in LINE_HISTORY.values()) == 4 and len(tu["unresolved_history"]) == 3
    return tu, placed

def portfolio_admission(placed):
    owners = {"L-SIGNALS": "Signals", "L-FND-HUB": "Foundation", "L-BP-CORE": "BrazilPortal", "L-ATLAS": "Atlas", "L-HSA": "Research",
              "L-FND-SOAK": "Foundation", "L-TWIN": "Digital Twin", "L-CVC": "Research", "L-VOICE": "Research"}
    spec = [("OPS-014", "Market Scanner", "L-SIGNALS", "SERVICE", "ACTIVE"), ("OPS-020", "Документный хаб", "L-FND-HUB", "ARTIFACT", "ACTIVE"),
            ("MEM-0301", "Тезисы для встречи с инвестором", "L-BP-CORE", "NOTE", "ACTIVE"), ("MEM-0302", "Финмодель Atlas", "L-ATLAS", "DOCUMENT", "ACTIVE"),
            ("MEM-0303", "Доступ BrazilPortal для команды", "L-BP-CORE", "TASK", "ACTIVE"), ("MEM-0304", "MoU v2", "L-HSA", "DOCUMENT", "ACTIVE"),
            ("MEM-0305", "Readback протокол", "L-FND-SOAK", "DOCUMENT", "ACTIVE"), ("MEM-0306", "Scanner coverage report", "L-SIGNALS", "REPORT", "ACTIVE"),
            ("MEM-0307", "Twin episode log", "L-TWIN", "DATASET", "ACTIVE"), ("MEM-0308", "CVC shortlist 2025", "L-CVC", "DOCUMENT", "ARCHIVED"),
            ("MEM-0309", "Voice corpus v0", "L-VOICE", "DATASET", "HISTORICAL")]
    cands = [{"memory_id": m, "kind": k, "title": t, "state": s, "evidence_status": "EXACT_OWNER_MATCH", "owning_branch": owners[l],
              "proposed_line": l, "basis": "owning_branch совпадает с доверенным владельцем линии " + l} for m, t, l, k, s in spec]
    reasons = ["владелец не указан", "несколько возможных линий", "owning_branch вне доверенной карты", "нет доказательств принадлежности"]
    kinds = ["NOTE", "DOCUMENT", "TASK", "ARTIFACT", "IDEA"]
    review = [{"memory_id": f"MEM-{1000 + i}", "kind": kinds[i % 5], "title": f"Объект памяти №{1000 + i}",
               "state": "ARCHIVED" if i % 13 == 0 else "ACTIVE", "evidence_status": "INSUFFICIENT" if i % 3 else "UNVERIFIED",
               "owning_branch": [None, "Research", "Foundation", "Unknown"][i % 4], "reason": reasons[i % 4]} for i in range(78)]
    adm = {
      "schema": "atlas-portfolio-admission.v0.1",
      "compiled_at": "2026-09-30T06:00:00Z",
      "counts": {"memory": 113, "placed": 24, "exact_owner_candidates": 11, "review_required": 78, "owner_conflicts": 1},
      "trusted_owner_map": {m: {"line": l, "world": w} for m, l, w in placed},
      "owner_conflicts": [{"memory_id": "MEM-0400", "title": "Бюджет пилота CVC", "owners": ["L-CVC", "L-BP-CORE"], "reason": "два доверенных владельца"}],
      "exact_owner_candidates": cands,
      "review_required": review,
      "rules": ["Кандидат не становится звездой без явного размещения",
                "Сходство названий не является основанием принадлежности",
                "Конфликт владельцев решается вручную"],
    }
    assert len(cands) == 11 and len(review) == 78 and 24 + 11 + 78 == 113
    return adm

if __name__ == "__main__":
    tu, placed = temporal_universe()
    for name, data in (("temporal-universe.json", tu), ("portfolio-admission.json", portfolio_admission(placed))):
        with open(os.path.join(HERE, name), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
            f.write("\n")
