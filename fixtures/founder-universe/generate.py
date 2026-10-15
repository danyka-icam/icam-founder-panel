"""Regenerate the synthetic Founder Universe fixtures.

python3 fixtures/founder-universe/generate.py

Synthetic data only. It follows the declared top-level contracts of
atlas-temporal-universe.v0.1 and atlas-portfolio-admission.v0.1 and matches
the current production-preview counts (3 worlds / 16 lines / 24 placed stars /
7 company events / 4 line events / 3 unresolved; memory=113, placed=24,
exact_owner_candidates=11, review_required=78, owner_conflicts=1).
Nested shapes (schema_id, temporal, history events, owner_conflicts map,
trusted_owner_map, capital, strategic_trajectories) follow the live backend
files as reconciled on 2026-09-30; see README.md for what is still assumed.
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
def line_id(i):
    return "N-%06x" % (0x5a1000 + i * 37)

def event(eid, date, change, why, nxt, transition="ADVANCED", subject=None, line=None, world=None,
          truth="VERIFIED", binding="EXACT_OBJECT", scope="LINE", target=None, branch=None, evidence=1):
    return {"event_id": eid, "change": change, "transition": transition, "subject": subject, "line": line, "world": world,
            "evidence_count": evidence, "truth_status": truth, "why_it_matters": why, "next_milestone": nxt,
            "source_branch": branch, "scope": scope, "binding_class": binding, "target": target, "date": date}

def item(iid, title, time_class):
    return {"id": iid, "title": title, "time_class": time_class, "valid_from": None, "recorded_at": None}

def temporal(state=None, waiting=(), nxt=(), history=()):
    return {"now": {"state": state, "truth": None, "valid_from": None, "recorded_at": None},
            "waiting": [item("W-%d" % i, t, "CURRENT_STATE") for i, t in enumerate(waiting)],
            "next_transition": [item("T-%d" % i, t, "FUTURE_CONDITION") for i, t in enumerate(nxt)],
            "history": list(history)}

CAPITAL = {
  "BrazilPortal": [{"id": "N-c0a001", "title": "Verifiable public research records and DOI-backed artifacts"},
                   {"id": "N-c0a002", "title": "Company semantic state stack"}],
  "Корпоративный венчурный контур": [{"id": "N-c0a003", "title": "Pilot budget envelope (CVC)"}],
}
LINE_HISTORY = {
  "Финальная стабилизация Foundation": [event("E-L1", "2026-09-26", "Soak выявил orphan receipt", "Без закрытия receipt readiness не может стать PASS", "Закрыть orphan receipt", transition="BLOCKED", subject="FND-001", line="Финальная стабилизация Foundation", world="Фундамент и инфраструктура", branch="Foundation")],
  "Atlas advisory": [event("E-L2", "2026-09-29", "RC1 принят в read-only", "Atlas может отдавать советы без права записи", "Модель данных Atlas v1.2", subject="RD1-ATL", line="Atlas advisory", world="Продукты и порталы", branch="Atlas")],
  "Юридический контур BrazilPortal": [event("E-L3", "2026-09-28", "Начата юр. проверка раздела «Инвесторам»", "Раздел нельзя публиковать без юридического согласования", "Комментарии юриста", subject="CMP-000007", line="Юридический контур BrazilPortal", world="Продукты и порталы", branch="BrazilPortal", truth="PENDING_RECONCILIATION", binding="PENDING_EXACT_OBJECT_PROOF")],
  "Health Security Alliance": [event("E-L4", "2026-09-21", "Партнёр прислал черновик MoU", "Открывает путь к совместной программе", "Встреча с партнёром", subject="RD1-HSA", line="Health Security Alliance", world="Исследования и партнёрства", branch="Research")],
}
TEMPORAL = {
  "FND-001": temporal("Финальная стабилизация", ["Закрытие orphan receipt"], ["Readiness aggregate PASS"],
                      [event("E-S1", "2026-09-25", "Foundation перешёл в финальный soak", "Последний шаг перед readiness", "Readiness aggregate PASS", subject="FND-001")]),
  "CMP-000005": temporal("Активная сборка", ["Комментарии юриста"], ["Публикация раздела «Инвесторам»"]),
  "FND-005": temporal("Проспективное обучение", ["Оценка эпизодов"], ["Выбор эпизода для пилота"],
                      [event("E-S2", "2026-09-12", "PTC-R0 отложен до стабилизации", "Без протокола нельзя начинать проспективное обучение", "Оценка эпизодов", transition="DEFERRED", subject="FND-005")]),
  "RD1-HSA": temporal("Подготовка", ["Встреча с партнёром"], ["Подписание MoU"]),
}

def temporal_universe():
    worlds, placed, n = [], [], 0
    for wid, wt, lines in WORLDS:
        wl = []
        for _lid, lt, brs in lines:
            n += 1
            lid = line_id(n)
            b = []
            for i, (mid, t, ct, ver) in enumerate(brs):
                b.append({"id": f"{lid}-B{i + 1}", "title": t, "canonical_title": ct, "memory_id": mid, "verified": ver,
                          "temporal": TEMPORAL.get(mid, temporal())})
                placed.append((mid, lt, wt))
            wl.append({"id": lid, "title": lt, "branches": b, "capital": CAPITAL.get(lt, []), "recent_history": LINE_HISTORY.get(lt, [])})
        worlds.append({"id": wid, "title": wt, "lines": wl})
    company = [
        event("E-C1", "2026-07-08", "Запущен портфель Founder Universe", "Все линии получили единое каноническое пространство", "Первые размещённые звёзды", scope="COMPANY"),
        event("E-C2", "2026-07-21", "RD1 принят в read-only режиме", "Исследования читаются без права записи", "RD1 operation", scope="COMPANY"),
        event("E-C3", "2026-08-04", "Market Scanner прошёл QA", "Внешние сигналы можно показывать Основателю", "Активация потока сигналов", scope="COMPANY"),
        event("E-C4", "2026-08-18", "BrazilPortal объявлен приоритетным направлением", "Ресурсы смещаются в продукт для инвесторов", "Раздел «Инвесторам»", transition="PRIORITIZED", scope="COMPANY"),
        event("E-C5", "2026-09-03", "Панель v2 принята как кандидат интеграции", "Основатель видит компанию в одном месте", "Founder review", scope="COMPANY"),
        event("E-C6", "2026-09-12", "Personal Twin: safe read projection", "Twin доступен без раскрытия предсказаний", "Оценка эпизодов", scope="COMPANY"),
        event("E-C7", "2026-09-25", "Foundation перешёл в финальный soak", "Последний шаг перед readiness", "Readiness aggregate PASS", scope="COMPANY", truth="PENDING_RECONCILIATION"),
    ]
    unresolved = [
        event("E-U1", "2026-09-10", "Встреча с фондом из Сингапура", "Возможный внешний партнёр для портала", "Решение о следующей встрече", transition="OBSERVED", subject="Singapore fund", truth="PENDING_RECONCILIATION", binding="PENDING_EXACT_OBJECT_PROOF", scope="PENDING_BINDING", evidence=1),
        event("E-U2", "2026-08-27", "Черновик тезисов для инвестора", "Нужен владелец, чтобы тезисы попали в линию", "Назначить владельца", transition="CREATED", truth="PENDING_RECONCILIATION", binding="PENDING_EXACT_OBJECT_PROOF", scope="PENDING_BINDING"),
        event("E-U3", "2026-08-02", "Идея: программа акселерации", "Может стать отдельной линией health-tech", "Решение о размещении", transition="PROPOSED", truth="UNVERIFIED", binding="PENDING_EXACT_OBJECT_PROOF", scope="PENDING_BINDING", evidence=0),
    ]
    tu = {
      "schema_id": "atlas-temporal-universe.v0.1",
      "window": {"from": "2026-07-02T00:00:00Z", "to": "2026-09-30T00:00:00Z", "days": 90},
      "company_history": company,
      "worlds": worlds,
      "strategic_trajectories": [
        {"id": "ST-1", "title": "Платформа для инвесторов", "status": "ACTIVE", "horizon": "2026-Q4",
         "north_star": "Инвестор видит проверяемое состояние компании без посредников",
         "path": ["Atlas advisory", "Единая модель данных", "Раздел «Инвесторам»", "Публичный запуск"],
         "publication_contour": "Investor portal", "evidence_basis": ["RC1 read-only", "Юр. проверка начата"]},
        {"id": "ST-2", "title": "Доверенный фундамент", "status": "ACTIVE", "horizon": "2026-Q4",
         "north_star": "Каждое утверждение панели доказуемо источником",
         "path": ["Финальный soak", "Readback byte-for-byte", "Readiness PASS"],
         "rule": "Никакой зелёный статус без доказательства", "feeds_back_to": ["Платформа для инвесторов"]},
        {"id": "ST-3", "title": "Health-tech партнёрства", "status": "FORMING", "horizon": "2027",
         "north_star": "Совместные программы с партнёрами по безопасности здоровья",
         "path": ["MoU с партнёром", "Пилотная программа", "Акселерация"],
         "growth_programs": ["Акселерация health-tech"]}],
      "unresolved_history": unresolved,
      "rules": ["Мир и линия берутся только из канонической Founder Universe",
                "unresolved_history не привязывается к объектам по сходству",
                "Звезда видна на карте только после размещения"],
    }
    assert len(worlds) == 3 and sum(len(w["lines"]) for w in worlds) == 16 and len(placed) == 24
    assert len(company) == 7 and sum(len(v) for v in LINE_HISTORY.values()) == 4 and len(unresolved) == 3
    return tu, placed

def portfolio_admission(placed):
    spec = [  # memory_id, title, proposed_line (exact TU title), kind, state, owning_branch
        ("OPS-014", "Market Scanner", "Market Scanner", "SERVICE", "ACTIVE", "Signals"),
        ("OPS-020", "Документный хаб", "Документный хаб", "ARTIFACT", "ACTIVE", "Foundation"),
        ("MEM-0301", "Тезисы для встречи с инвестором", "BrazilPortal", "NOTE", "ACTIVE", "BrazilPortal"),
        ("MEM-0302", "Финмодель Atlas", "Atlas advisory", "DOCUMENT", "ACTIVE", "Atlas"),
        ("MEM-0303", "Доступ BrazilPortal для команды", "BrazilPortal", "TASK", "ACTIVE", "BrazilPortal"),
        ("MEM-0304", "MoU v2", "Health Security Alliance", "DOCUMENT", "ACTIVE", "Research"),
        ("MEM-0305", "Readback протокол", "Финальная стабилизация Foundation", "DOCUMENT", "ACTIVE", "Foundation"),
        ("MEM-0306", "Scanner coverage report", "Market Scanner", "REPORT", "ACTIVE", "Signals"),
        # near-miss title on purpose: the panel must NOT fuzzy-match it to "Atlas advisory"
        ("MEM-0307", "Twin episode log", "atlas advisory", "DATASET", "ACTIVE", "Atlas"),
        ("MEM-0308", "CVC shortlist 2025", "Корпоративный венчурный контур", "DOCUMENT", "ARCHIVED", "Research"),
        ("MEM-0309", "Voice corpus v0", "Construction voice research", "DATASET", "HISTORICAL", "Research")]
    cands = [{"memory_id": m, "kind": k, "title": t, "state": s, "evidence_status": "EXACT_OWNER_MATCH", "owning_branch": ob,
              "proposed_line": l, "basis": "owning_branch «%s» есть в trusted_owner_map" % ob} for m, t, l, k, s, ob in spec]
    reasons = ["владелец не указан", "несколько возможных линий", "owning_branch вне доверенной карты", "нет доказательств принадлежности"]
    kinds = ["NOTE", "DOCUMENT", "TASK", "ARTIFACT", "IDEA"]
    review = [{"memory_id": f"MEM-{1000 + i}", "kind": kinds[i % 5], "title": f"Объект памяти №{1000 + i}",
               "state": "ARCHIVED" if i % 13 == 0 else "ACTIVE", "evidence_status": "INSUFFICIENT" if i % 3 else "UNVERIFIED",
               "owning_branch": [None, "Research", "Foundation", "Unknown"][i % 4], "reason": reasons[i % 4]} for i in range(78)]
    adm = {
      "schema_id": "atlas-portfolio-admission.v0.1",
      "compiled_at": "2026-09-30T06:00:00Z",
      "counts": {"memory": 113, "placed": 24, "exact_owner_candidates": 11, "review_required": 78, "owner_conflicts": 1},
      # owning_branch -> exact canonical line title
      "trusted_owner_map": {"Signals": "Market Scanner", "Foundation": "Документный хаб", "BrazilPortal": "BrazilPortal",
                            "Atlas": "Atlas advisory", "Research": "Health Security Alliance",
                            "H008": "Человек, представление и действие"},
      # owning_branch -> competing exact line titles
      "owner_conflicts": {"ATLAS Structural & Epistemic Core": ["Atlas advisory", "Проверка самого ATLAS"]},
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
