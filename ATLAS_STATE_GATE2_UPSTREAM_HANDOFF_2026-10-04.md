# Founder Panel → ATLAS: Gate 2 upstream handoff

Date: 2026-10-04
Status: BLOCKED_UPSTREAM / SEMANTICS AND OWNER REQUIRED

Founder Panel сейчас корректно показывает `NO_ATLAS_STATE_SOURCE`. Существующие ATLAS-контуры нельзя молча объединять в «общее состояние ATLAS»: сигнальный контур, исследования/эксперименты, коммерческий процесс и Founder-проекции имеют разные полномочия и разные источники истины.

## Что ATLAS-ветка должна решить до реализации

1. Назвать `source_authority`, который имеет право утверждать общее состояние ATLAS.
2. Определить, что означает `operating_mode` и кто его меняет.
3. Определить, что входит в `active_modules` и какое доказательство подтверждает активность модуля.
4. Развести сигнальное, исследовательское и коммерческое состояние; ни одно из них не представляет весь ATLAS само по себе.
5. Определить точную семантику freeze/disable, blockers и decisions/gates.
6. Определить freshness как смысловую свежесть источника/домена, а не время HTTP-ответа.
7. Зафиксировать доказательную модель: что является фактом, производным состоянием, неизвестным, устаревшим и частично покрытым.

## Минимальный контракт v1

Источник должен отдавать:

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

Этот shape уже проверяется panel-side валидатором `dev/upstream-gate-check.mjs atlas-state`.

## Жёсткие границы

- Signal store подтверждает только сигнальный домен, а не общее состояние ATLAS.
- Signal Lab подтверждает состояние своего runtime, а не всего ATLAS.
- Testing подтверждает тестовые процедуры/результаты, а не весь ATLAS.
- Founder Map остаётся производной проекцией.
- Документы и артефакты не заменяют текущий state source.
- Отсутствие активности не означает freeze.
- Технический сбой отдельного сервиса не автоматически является blocker всего ATLAS.
- `null` / UNKNOWN допустимы; заполнение пробелов догадками запрещено.

## Условие снятия Gate 2

Gate 2 снимается только когда одновременно существуют:

1. зафиксированный владелец семантики ATLAS state;
2. versioned contract v1;
3. живой authoritative source;
4. один реальный payload, проходящий `dev/upstream-gate-check.mjs atlas-state`;
5. явная граница canonical source → normalized Founder projection;
6. source-level различение LIVE / DEGRADED / STALE / UNAVAILABLE;
7. read-only Founder projection без клиентского восстановления состояния;
8. раздельная видимость сигнального, исследовательского и коммерческого доменов.

До выполнения этих условий `NO_ATLAS_STATE_SOURCE` остаётся правильным поведением Founder Panel.

## Что вернуть в panel-v2

ATLAS-ветке достаточно вернуть:

- документ выбора authority и семантики v1;
- read-only source/projection contract;
- статус deploy;
- версию/revision;
- один реальный payload;
- описание freshness/evidence границ.

После этого panel-v2 независимо проверит payload и подключит экран.
