# ATLAS Activity Event Producer Contract v0.2

Статус: активный контракт публикации материальных событий веток.

Назначение: позволить веткам публиковать значимые изменения в Activity Inbox так, чтобы Timeline получал события без превращения heartbeat, polling и технических readback-снимков в историю компании.

## Обязательные поля

- `producer_id` — стабильная идентичность producer;
- `source_event_id` — стабильная локальная идентичность события у producer; повтор должен использовать то же значение;
- `source_branch`;
- `event_type`;
- `human_change`;
- `why_it_matters`;
- `valid_at` — только доказанная дата/время;
- `evidence_ceiling`;
- `next_milestone`;
- `materiality_class`;
- `evidence_refs[]` — минимум одна точная ссылка на доказательство.

## Идемпотентность

`event_id` детерминированно строится из `producer_id + source_event_id`. Изменение формулировки при повторной доставке не создаёт вторую точку Timeline.

## Допустимые типы событий

`STARTED`, `STRATEGY_CHANGED`, `MILESTONE_REACHED`, `ADVANCED`, `BLOCKED`, `UNBLOCKED`, `FROZEN`, `RESUMED`, `COMPLETED`, `EXTERNAL_RESPONSE`, `WAITING_EXTERNAL`, `FOUNDER_DECISION`, `PUBLICATION`.

## Классы материальности

`STATE_TRANSITION`, `MILESTONE`, `EXTERNAL_HINGE`, `FOUNDER_DECISION`, `PUBLICATION`, `COMMERCIAL_ACTION`, `SYSTEM_REPAIR`.

## Запрещено считать материальным событием

Heartbeat, результат polling, обычный health/sync snapshot, readback, сырой лог, неизменившийся snapshot или событие, восстановленное только по тематическому сходству.

## Доказательная граница

- `valid_at` не вычисляется и не восстанавливается приблизительно;
- `evidence_ceiling` ограничивает утверждение события;
- `evidence_refs[]` доказывают происхождение, но не делают артефакт каноническим автоматически;
- публикация события не разрешает объектную/линейную привязку; неизвестная привязка остаётся неизвестной;
- Activity Inbox остаётся интерфейсом событий веток, а не зеркалом Continuity или произвольного состояния сервисов.
