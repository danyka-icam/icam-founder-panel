# Founder Panel — минимальные upstream-контракты источников v0.1

Статус: контракт нормализованной read-only проекции для Founder Panel. Документ не создаёт новые канонические сущности, не назначает владельца upstream-смысла и не разрешает Панели выводить состояние из косвенных признаков.

Этот документ является **нижним потребительским слоем** после `FOUNDER_PANEL_UPSTREAM_GATES_CONSUMER_CONTRACT_v0.3.md`:

`канонический upstream → серверная нормализованная проекция → Founder Panel`.

Поля ниже описывают форму проекции, удобную Панели. Они не становятся каноническим Agent Registry, Lineage или ATLAS state сами по себе. Подключение разрешается только после снятия соответствующего upstream-gate и явного определения преобразования canonical source → normalized projection.

## 1. Agent Registry / Lineage

### Зачем нужен источник

Страница `#agents` должна показывать только зарегистрированных агентов и доказанные связи происхождения. Имена systemd-сервисов, процессы, ветки исследований, события полномочий и смысловое сходство не являются идентичностью агента или lineage.

### Минимальный read-only snapshot

Источник считается достаточным для подключения, когда он отдаёт:

- `source_status`
- `generated_at`
- `registry_revision`
- `agents[]`

Минимальная запись `agents[]`:

- `agent_id` — стабильная каноническая идентичность;
- `role` — роль, объявленная реестром;
- `state` — состояние агента;
- `authority_scope[]` — явно выданные полномочия;
- `parent_agent_id` — только если родительская связь доказана;
- `lineage_id` — идентичность цепочки происхождения, если существует;
- `evidence_status` — состояние доказательной опоры;
- `last_transition_at` — время последнего подтверждённого перехода состояния.

Допустимые агрегаты источника:

- `counts.total_agents`
- `counts.active_agents`
- `counts.degraded_agents`
- `counts.stalled_agents`
- `counts.unregistered_agents`
- `counts.authority_conflicts`
- `counts.lineage_gaps`
- `counts.decisions_without_evidence`

### Жёсткие правила

1. `agent_id` не выводится из имени сервиса, процесса, каталога, роли или текста.
2. `parent_agent_id` и `lineage_id` не выводятся из порядка запуска, совместной работы или сходства названий.
3. `authority_scope` не восстанавливается из истории действий.
4. Отсутствующее поле остаётся неизвестным.
5. Панель только читает snapshot и никогда не меняет Registry, authority или lineage.
6. Если Founder projection недоступна, страница `#agents` остаётся `UNAVAILABLE`; частичная недоступность Lineage деградирует только lineage-блок.

### Условие подключения к Founder Panel

Подключение разрешено только после того, как upstream-команда зафиксировала:

- кто является владельцем канонической идентичности;
- как создаётся и отзывается `agent_id`;
- как фиксируется lineage;
- как меняется `authority_scope`;
- что считается доказательством для `evidence_status`;
- как snapshot получает `registry_revision`.

---

## 2. ATLAS State Source

### Канонический владелец и контракт

Gate 2 снят. Канонический владелец общего состояния ATLAS: `aiclavis-atlas-state` / `ATLAS_STATE_CANON_V1`. Контракт — `aiclavis.atlas-state.v1`, версия `1.0.0`, read-only.

Founder Panel получает только очищенную Founder projection; canonical state-service остаётся серверным authority-слоем.

### Минимальная read-only проекция

Источник обязан сохранять поля:

- `atlas_state_version`
- `generated_at`
- `source_authority`
- `operating_mode`
- `active_modules`
- `signal_pipeline_health`
- `research_runs_active`
- `commercial_runs_active`
- `frozen_or_disabled_branches`
- `current_blockers`
- `current_decisions_or_gates`
- `evidence_refs`
- `freshness`

Допустимые дополнительные поля текущего v1: `activity_state`, `investment_lab_state`, `atlas_state_revision`, `canonicalized_at`, `projection_boundary`.

### Жёсткие правила

1. Signal store остаётся authority только сигнального домена, а не всего ATLAS.
2. Signal Lab остаётся authority исследовательского runtime, а не всего ATLAS.
3. Founder Map остаётся производной проекцией.
4. Commercial и freeze могут честно оставаться `UNKNOWN`/`UNAVAILABLE`; отсутствие активности не превращается в freeze.
5. Freshness является смысловой свежестью доменного authority; время HTTP-ответа не заменяет её.
6. Pending investment review не повышается до зафиксированного investment decision.
7. Founder projection не должна раскрывать внутренние координаты canonical sources; для доказательств допустимы стабильные `evidence_ref_id`.
8. Панель не рассчитывает общий health ATLAS из состояний отдельных доменов.
9. Панель не меняет ATLAS state.

### Текущее состояние подключения

Read-only Gate 2 активирован. Реальный payload проходит `dev/upstream-gate-check.mjs atlas-state`; все обязательные поля присутствуют. Текущий operating mode — `PARTIAL_DECLARED_STATE`, что означает честное объединение только объявленных доменных authority при сохранении UNKNOWN/null.

---

## 3. Текущее проверенное состояние

На 2026-10-04:

- Agent Registry / Lineage live source развёрнут; canonical owner — AICLAVIS Agent Registry Authority;
- Founder projection отдаёт verified agents, отдельные `registry_revision` / `lineage_revision` и source-backed counts;
- Lineage projection отдаёт verified edges отдельно от Registry identity;
- bootstrap census/registry/edge seeds остаются ниже live boundary и напрямую Панелью не читаются;
- Authority Observability по-прежнему не является Agent Registry;
- Atlas Founder Map по-прежнему не является lineage агентов;
- ATLAS State Authority live; Gate 2 resolved for read-only Founder consumption; browser projection uses the sanitized boundary and preserves domain UNKNOWN/DEGRADED states.
