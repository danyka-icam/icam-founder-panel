# ICAM Founder Panel — Registry UI Scaffold v0.1

## Назначение

Это **presentation-only frontend scaffold** эталонного экрана `Реестр` для ICAM Founder Panel.

Он НЕ реализует и НЕ должен заменять:
- authority / approval logic;
- Continuity;
- registry truth semantics;
- durability meaning;
- Orchestrator behavior;
- backend writes;
- реальные статусы объектов.

Текущие данные на экране — **mock/demo data** для проверки UI.

## Что внутри

- `index.html` — экран Registry.
- `styles.css` — material system + layout + components.
- `app.js` — только минимальный UI interaction (выбор строки), без backend.
- `design-tokens.json` — стартовые токены material system.

## Быстрый запуск

Подойдёт любой статический web server.

Например:

```bash
python3 -m http.server 8080
```

После этого открыть:

```text
http://localhost:8080
```

## Что нужно сделать на сервере

Рекомендуемый путь — развернуть как отдельный staging/static route, НЕ подменяя текущую Founder Panel до visual acceptance.

Пример:

```text
/founder-ui-preview/registry/
```

После визуального gate этот scaffold можно либо перенести в текущий frontend stack, либо использовать CSS/tokens/components как источник для адаптации существующего кода.

## Интеграционный контракт

Данные должны приходить снаружи. UI не должен принимать решений.

Предлагаемые frontend-модели:

```ts
RegistryKpis
RegistryObject[]
RegistryObjectDetail
IntegrityReport
RegistryRelationGraph
RegistryEvent[]
RegistryAttentionItem[]
```

Backend/Continuity остаются единственным владельцем истины. Любой write/action должен подключаться только к существующему authority envelope.

## Важное визуальное правило

`Founder Panel Material = smoky graphite layered matte surface, not flat dark UI.`

Цель — светлее и серее обычного dark UI, матовая дымка, слабая внутренняя наполненность карточек, минимум глянца, приглушённые семантические акценты.
