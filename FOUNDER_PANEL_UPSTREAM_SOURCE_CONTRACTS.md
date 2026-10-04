# Founder Panel — минимальные upstream-контракты источников v0.1

Статус: контракт нормализованной read-only проекции для Founder Panel. Документ не создаёт новые канонические сущности, не назначает владельца upstream-смысла и не разрешает Панели выводить состояние из косвенных признаков.

Этот документ является **нижним потребительским слоем** после `FOUNDER_PANEL_UPSTREAM_GATES_CONSUMER_CONTRACT_v0.1.md`:

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
6. До появления этого источника страница `#agents` остаётся `UNAVAILABLE`.

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

### Зачем нужен источник

Документы `ATLAS_UPDATE_*`, Founder Map, Signal Lab, прогнозные пакеты и research artifacts описывают работу вокруг ATLAS, но не являются текущим каноническим состоянием ATLAS.

Панель не должна выводить `current_state`, роль, состояние обучения или повышение статуса из документов.

### Минимальная read-only проекция

Источник считается достаточным для подключения, когда он отдаёт:

- `source_status`
- `generated_at`
- `state_revision`
- `current_state`
- `material_activity`
- `object_detail`
- `epistemic_role`
- `learning_state`
- `promotion_state`
- `freshness_source_timestamp`

Дополнительные поля, если они существуют в самом источнике:

- `next_action`
- `blocked_stage`
- `blocking_reasons[]`
- `unavailable_fields[]`

### Допустимые модели владения состоянием

Ровно одна из двух:

1. ATLAS становится каноническим объектом Continuity и нужные поля приходят оттуда; или
2. ATLAS имеет собственный state-service / state-store, а Founder Panel получает только read-only projection.

Обе модели одновременно без явного правила приоритета запрещены.

### Жёсткие правила

1. Hub/library документы не повышаются до state source.
2. Signal Lab не считается состоянием ATLAS.
3. Founder Map не считается состоянием ATLAS.
4. Отсутствующие поля остаются неизвестными и могут быть перечислены в `unavailable_fields[]`.
5. Панель не рассчитывает `promotion_state`, `learning_state` или `epistemic_role` самостоятельно.
6. До появления источника endpoint продолжает честно возвращать `NO_ATLAS_STATE_SOURCE`.

### Условие подключения к Founder Panel

Перед сменой `NO_ATLAS_STATE_SOURCE` на живое состояние должны быть определены:

- владелец канонического состояния;
- правило изменения `state_revision`;
- источник времени для `freshness_source_timestamp`;
- какие переходы меняют `current_state`;
- какие переходы меняют `learning_state` и `promotion_state`;
- как различаются `UNAVAILABLE`, `STALE`, `DEGRADED` и живое состояние.

---

## 3. Что уже проверено

На момент фиксации v0.1:

- отдельного живого Agent Registry / Lineage projection на сервере не обнаружено;
- Authority Observability индексирует события Founder authority, но не владеет `agent_id` и не является Agent Registry;
- Atlas Founder Map содержит ветки, evidence ceiling и Founder-gate, но не является lineage агентов;
- `/panel/atlas` корректно сообщает `NO_ATLAS_STATE_SOURCE`;
- Founder Panel не должна устранять эти два пробела локальными эвристиками.
