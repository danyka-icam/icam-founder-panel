from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib import request
import json, os, re, hashlib, time

INDEX=os.environ.get("STEWARD_NAV_INDEX","/var/lib/aiclavis-steward-navigator/index.jsonl")
OLLAMA_MODEL=os.environ.get("STEWARD_NAV_OLLAMA_MODEL","").strip()
OLLAMA_URL=os.environ.get("STEWARD_NAV_OLLAMA_URL","http://127.0.0.1:11434/api/chat")
MAX_EVIDENCE=int(os.environ.get("STEWARD_NAV_MAX_EVIDENCE","8"))
AGENT_URL=os.environ.get("STEWARD_AGENT_URL","http://127.0.0.1:8834/api/steward-agent/answer")
ACTIONS_URL=os.environ.get("STEWARD_ACTIONS_URL","http://127.0.0.1:8800")
ACTIONS_TOKENS_FILE=os.environ.get("STEWARD_ACTIONS_TOKENS_FILE","/etc/context-steward-actions/tokens.json")
DECISION_LIFECYCLE_URL=os.environ.get("STEWARD_DECISION_LIFECYCLE_URL","http://127.0.0.1:8814/api/founder-decisions/lifecycles?status=OPEN")
DECISION_PRESENTATION_URL=os.environ.get("STEWARD_DECISION_PRESENTATION_URL","http://127.0.0.1:8816/api/founder-decisions/presentation")
COMMERCIAL_DASHBOARD=os.environ.get("STEWARD_COMMERCIAL_DASHBOARD","/opt/icam/preview/founder-ui-preview/commercial/dashboard.json")
FOUNDER_RADAR_URL=os.environ.get("STEWARD_FOUNDER_RADAR_URL","http://127.0.0.1:8843/api/v1/founder-radar")
RU_STOP=set("и в во на к ко с со из от до по для а но или это как что где мы вы я у о об не ли же бы за про при этот эта эти уже ещё мне нам сейчас".split())
GENERIC=set("research signal signals twin факт событие исследование прогноз точка система рабочая память".split())

def norm(s):
    return re.sub(r"[^0-9a-zа-яё_./:*+-]+"," ",str(s).lower(),flags=re.I).strip()

def toks(s):
    return [x for x in norm(s).split() if len(x)>1 and x not in RU_STOP]

def distinctive(s):
    out=[]
    for t in toks(s):
        base=t.strip(":*+-")
        if not base or base in GENERIC: continue
        if len(base)>=5 or re.search(r"[0-9_./]",base) or (re.search(r"[a-z]",base) and len(base)>=3):
            out.append(base)
    return out

def load_index():
    out=[]
    try:
        with open(INDEX,encoding="utf-8") as f:
            for line in f:
                try: out.append(json.loads(line))
                except: pass
    except FileNotFoundError: pass
    return out

def row_blob(r):
    return norm(" ".join([str(r.get("title","")),str(r.get("text","")),
        " ".join(map(str,r.get("identifiers") or []))," ".join(map(str,r.get("tags") or []))]))

def score_parts(q,context,r):
    nb=row_blob(r); title=norm(r.get("title",""))
    qt=toks(q); ct=distinctive((context or {}).get("title",""))
    score=0.0; qhits=0; chits=0
    nq=norm(q)
    if nq and len(nq)>=5 and nq in nb: score+=10
    for t in qt:
        if t in nb:
            qhits+=1; score+=2.0 if (len(t)>=5 or re.search(r"[0-9_*./:+-]",t)) else 0.8
        if t in title: score+=5
    for t in ct:
        if t in nb: chits+=1; score+=8
        if t in title: score+=12
        if t in (r.get("identifiers") or []): score+=16
    required=0 if not ct else (1 if len(ct)<=2 else (2 if len(ct)<=5 else 3))
    anchored=chits>=required
    if ct and chits>=max(2,required): score+=10
    return score,qhits,chits,anchored

def retrieve(q,context=None):
    ranked=[]
    for r in load_index():
        s,qh,ch,anch=score_parts(q,context,r)
        if s>0 and anch: ranked.append((s,ch,qh,r))
    ranked.sort(key=lambda x:(-x[0],-x[1],-x[2],str(x[3].get("title",""))))
    if not ranked:return []
    top=ranked[0][0]
    keep=[x for x in ranked if x[0]>=max(6.0,top*0.55)]
    return [{**r,"score":round(s,3)} for s,ch,qh,r in keep[:MAX_EVIDENCE]]

def signal_fact(r):
    text=str(r.get("text") or "")
    summaries=re.findall(r"summary_ru (.*?) why_it_matters_ru",text)
    whys=re.findall(r"why_it_matters_ru (.*?)(?= axis | relevance_score | impact_score | architecture_proximity | market_significance | architecture_convergence | recommended_action | enriched_at |$)",text)
    summary=(summaries[-1] if summaries else "").strip()
    why=(whys[-1] if whys else "").strip()
    action=""
    m=re.search(r"recommended_action ([^ ]+)",text)
    if m and m.group(1)=="review-atlas":
        action=" Это кандидат на содержательный просмотр в контексте ATLAS, а не уже доказанная связь."
    if summary or why:
        summary=summary.rstrip(" .")
        why=why.rstrip(" .")
        return ("Что это: "+summary+". " if summary else "")+("Почему это попало к нам: "+why+". " if why else "")+action
    return ""

def clean_fact(r):
    if "signals" in (r.get("tags") or []):
        x=signal_fact(r)
        if x:return x.strip()
    text=str(r.get("text") or "").strip()
    text=re.sub(r"\b(?:sha256|path|filename|durable_location|received_at|verified_at|idempotency_key|signal_id)\b\s+\S+","",text,flags=re.I)
    text=re.sub(r"\s+"," ",text).strip()
    return text[:420]
def is_priority_question(q):
    n=norm(q)
    return bool(re.search(r"(что|чего).{0,24}(срочн|важн).{0,24}(делать|сделать|сейчас)|что делать сейчас|за что взяться|с чего начать|приоритет.{0,12}сейчас|самое срочное",n))

def founder_priority_context(ctx):
    out=dict(ctx or {})
    try:
        radar=read_json_url(FOUNDER_RADAR_URL)
    except Exception as e:
        out["founder_priority_brief"]={"available":False,"reason":type(e).__name__}
        return out
    movement=radar.get("movement") or {}
    flow=radar.get("movement_flow") or {}
    strategy=radar.get("strategy") or {}
    due=[x for x in (movement.get("items") or []) if x.get("state")=="ACTION_DUE"]
    due=due[:20]
    queue=(flow.get("bottleneck_queue") or [])[:20]

    strategic=[]
    for lane_key in ("commercial","authority","research","product"):
        lane=((strategy.get("lanes") or {}).get(lane_key) or {})
        for x in (lane.get("items") or []):
            if str(x.get("leverage_tier") or "") not in {"STRONG","PROMISING"}:
                continue
            strategic.append({
              "lane":lane_key,"lane_label":lane.get("label"),"title":x.get("title"),
              "date":x.get("date"),"radar_class":x.get("radar_class"),
              "leverage_tier":x.get("leverage_tier"),"leverage_tier_label":x.get("leverage_tier_label"),
              "leverage_tier_reason":x.get("leverage_tier_reason"),"why":x.get("why"),
              "source_ref":x.get("source_ref")
            })

    commercial_manual=[]
    try:
        with open(COMMERCIAL_DASHBOARD,encoding="utf-8") as f:
            commercial=json.load(f)
        for x in (commercial.get("manual_queue") or [])[:40]:
            commercial_manual.append({k:x.get(k) for k in (
              "item_id","company","product_id","product_name","kind","reason","target_url",
              "action_label","created_at","recipient_name","recipient_role","why_now","source_refs"
            )})
    except Exception:
        commercial_manual=[]

    out["kind"]="founder_priority_brief"
    out["title"]="Что наиболее срочно делать сейчас"
    out["founder_priority_brief"]={
      "available":True,
      "generated_at":radar.get("generated_at"),
      "source_guard":movement.get("source_guard") or {},
      "counts":movement.get("counts") or {},
      "action_due":[{k:x.get(k) for k in ("title","domain","state","date","priority","next_step","route","meta","source_ref")} for x in due],
      "bottleneck_queue":[{k:x.get(k) for k in ("title","domain","state","date","priority","required_move","next_step","route","bottleneck_kind","source_ref","execution")} for x in queue],
      "founder_manual_actions":commercial_manual,
      "strategic_leverage":strategic[:20],
      "execution_counts":flow.get("execution_counts") or {},
      "execution_queue":[{k:x.get(k) for k in ("title","domain","state","date","priority","next_step","route","execution","source_ref")} for x in (flow.get("execution_queue") or [])[:40]],
      "flow_bottlenecks":(flow.get("bottlenecks") or [])[:10],
      "rule":"Сначала ACTION_DUE с ближайшим подтверждённым сроком; затем ACTION_DUE без даты; затем переходы, блокирующие движение. WAITING_EXTERNAL не считать задачей Основателя без наступившего follow-up."
    }
    return out

def priority_answer(ctx):
    b=(ctx or {}).get("founder_priority_brief") or {}
    if not b.get("available"):
        return "Сейчас я не могу безопасно назвать приоритет: живая карта движения недоступна. Это не считаю тишиной — сначала нужно восстановить источник."

    guard=(b.get("source_guard") or {}).get("status") or "UNKNOWN"
    execution=b.get("execution_queue") or []
    founder_exec=[x for x in execution if ((x.get("execution") or {}).get("class")=="FOUNDER")]
    system_items=[x for x in execution if ((x.get("execution") or {}).get("class")=="SYSTEM_REVIEW")]
    auto_items=[x for x in execution if ((x.get("execution") or {}).get("class")=="AUTO")]
    manual=b.get("founder_manual_actions") or []
    strategic=b.get("strategic_leverage") or []

    lines=["Что делать сейчас:"]
    personal=[]
    seen=set()
    for x in manual:
        key=("commercial",str(x.get("item_id") or x.get("company") or ""))
        if key in seen: continue
        seen.add(key)
        title=str(x.get("company") or "Коммерческая задача")
        product=str(x.get("product_name") or "")
        action=str(x.get("action_label") or x.get("reason") or "выполнить ручной коммерческий шаг")
        personal.append((title,product,action))
    for x in founder_exec:
        key=("movement",str(x.get("title") or ""))
        if key in seen: continue
        seen.add(key)
        action=str(x.get("next_step") or x.get("route") or "требуется подтверждённый ручной шаг")
        personal.append((str(x.get("title") or "Объект"),"",action))

    if personal:
        lines.append(f"Лично тебе — {len(personal)} подтверждённых ручных действий.")
        for i,(title,product,action) in enumerate(personal[:7],1):
            suffix=(" · "+product) if product else ""
            lines.append(f"{i}. {title}{suffix} — {action}.")
    else:
        lines.append("Подтверждённых действий, которые прямо сейчас должен сделать Основатель, нет.")

    if strategic:
        lines.append("")
        lines.append("Сильные внешние входы, которые сейчас двигают цель:")
        for i,x in enumerate(strategic[:5],1):
            tier=str(x.get("leverage_tier_label") or "вход")
            reason=str(x.get("leverage_tier_reason") or x.get("why") or "")
            lines.append(f"{i}. {x.get('title') or 'Сигнал'} — {tier}. {reason}")
        lines.append("Это не автоматически твоя ручная работа: сначала система должна подтвердить маршрут там, где он ещё не подтверждён.")

    waits=(b.get("counts") or {}).get("WAITING_EXTERNAL",0)
    lines.append("")
    lines.append(f"Система отдельно ведёт {len(system_items)} объектов на разбор и {len(auto_items)} автоматических переходов; {waits} объектов находятся у внешней стороны. Я не превращаю их в твою очередь без нового события или наступившего срока.")

    if guard=="DEGRADED":
        lines.append("Важно: покрытие источников деградировано, поэтому обзор неполный.")
    elif guard=="LIMITED":
        lines.append("Покрытие ограничено только известным внешним ограничением; критичные живые источники доступны.")
    return "\n".join(lines)

def question_intent(q):
    n=norm(q)
    if re.search(r"где|в какой ветке|какая ветка|где это было|where",n): return "where"
    if re.search(r"чего жд|что жд|ожида|когда результат|когда раскры|expected",n): return "waiting"
    if re.search(r"что получил|какой результат|результат|чем закончил|outcome|result",n): return "result"
    if re.search(r"что дальше|следующ|следующий шаг|что делать|next",n): return "next"
    return "what"

def field_from_text(text,names):
    for name in names:
        m=re.search(r"(?:^|\s)"+re.escape(name)+r"\s+(.+?)(?=\s(?:state|status|outcome|result|expected_outcome|outcome_due_at|reveal_at|next_move|next_gate|review_condition|recommended_action|source_branch|source_branch_id|owning_branch|summary_ru|why_it_matters_ru|title|signal_type|observed_at|published_at|ingested_at|enrichment)\s|$)",text,re.I)
        if m:
            v=re.sub(r"\s+"," ",m.group(1)).strip(" .")
            if v:return v[:320]
    return ""

def token_field(text,name):
    m=re.search(r"(?:^|\s)"+re.escape(name)+r"\s+([^\s]+)",text,re.I)
    return m.group(1).strip(" .") if m else ""

def human_signal_action(value):
    v=str(value or "").lower()
    if v=="review-atlas":
        return "содержательно просмотреть сигнал в контексте ATLAS. Это кандидат на проверку, а не уже доказанная связь"
    if v=="watch":
        return "оставить сигнал под наблюдением; отдельное решение сейчас не назначено"
    if v=="none":
        return "отдельное действие по этому сигналу не назначено"
    return str(value or "")

def answer_by_intent(intent,q,ctx,ev):
    title=str((ctx or {}).get("title") or "").strip()
    details=str((ctx or {}).get("details") or "").strip()
    layer=str((ctx or {}).get("layer") or "").strip()
    if not ev:
        base=f"По точке «{title}» " if title else ""
        if intent=="waiting":
            return base+"в рабочей памяти нет подтверждённого ожидания или срока. "+(details if details else "Из карточки дополнительное ожидание не передано.")
        if intent=="result":
            return base+"подтверждённый результат в рабочей памяти не найден. "+(details if details else "Не буду угадывать результат по похожим материалам.")
        if intent=="next":
            return base+"подтверждённый следующий шаг не передан. "+(details if details else "Не буду придумывать действие.")
        if intent=="where":
            return base+("это слой «"+layer+"». " if layer else "")+"Точную ветку или линию я не могу доказать по доступной памяти."
        return ""

    top=ev[0]
    text=str(top.get("text") or "")
    is_signal="signals" in (top.get("tags") or [])
    if intent=="waiting" and is_signal:
        status=token_field(text,"status")
        if status=="watch":
            return "Это внешний исследовательский сигнал под наблюдением. Отдельный ожидаемый результат или срок для него не передан."
        return "Для этого исследовательского сигнала отдельное ожидание или срок не переданы."
    if intent=="result" and is_signal:
        status=token_field(text,"status")
        return "Это внешний исследовательский сигнал, а не наш завершённый эксперимент. Его текущий статус: "+(status or "не передан")+"."
    if intent=="next" and is_signal:
        action=token_field(text,"recommended_action")
        if action:
            return "Следующий шаг: "+human_signal_action(action)+"."
        return "Для этого исследовательского сигнала отдельный следующий шаг не назначен."
    if intent=="waiting":
        v=field_from_text(text,("expected_outcome","outcome_due_at","reveal_at","review_condition","next_gate"))
        if v:return "Ждём: "+v+"."
        a=field_from_text(text,("recommended_action",))
        if a and a not in ("none","watch"): return "Явного результата ещё нет. Переданное действие: "+a+"."
        return "Для этой точки подтверждённое ожидание или срок в найденной памяти не переданы."
    if intent=="result":
        v=field_from_text(text,("outcome","result","state","status"))
        if v:return "Подтверждённый результат/состояние: "+v+"."
        return "В найденной памяти отдельный подтверждённый результат для этой точки не передан."
    if intent=="next":
        v=field_from_text(text,("next_move","next_gate","recommended_action","review_condition"))
        if v:return "Следующий подтверждённый шаг: "+v+"."
        return "Подтверждённый следующий шаг в найденной памяти не передан."
    if intent=="where":
        v=field_from_text(text,("owning_branch","source_branch","source_branch_id"))
        if v:return "Рабочая ветка/источник: "+v+"."
        return ("Это слой «"+layer+"». " if layer else "")+"Точная ветка в найденной записи не передана."
    return ""

def commercial_context_answer(q,ctx):
    snap=(ctx or {}).get("commercial_snapshot") or {}
    if not snap.get("available"): return ""
    manual=snap.get("manual_queue") or []
    selected=snap.get("selected_task") or {}
    nq=norm(q)
    by_kind={}
    for x in manual: by_kind.setdefault(str(x.get("kind") or "OTHER"),[]).append(x)
    def line(x):
        url=x.get("target_url")
        refs=[]
        for u in (x.get("source_refs") or []):
            if u and u not in refs: refs.append(u)
        route=(" — "+url) if url else ((" — источники: "+", ".join(refs[:3])) if refs else " — подтверждённой ссылки нет")
        return "• "+str(x.get("company") or x.get("item_id") or "кейс")+" — "+str(x.get("action_label") or x.get("kind") or "действие")+route
    if re.search(r"вс[её]|очеред|накоп|сначала|поряд|разбер",nq):
        ready=by_kind.get("MANUAL_FORM",[])+by_kind.get("MANUAL_SEND",[])
        verify=by_kind.get("VERIFY_SENT",[])
        route=by_kind.get("MANUAL_CONTACT_RESEARCH",[])
        parts=[f"Сейчас в ручной коммерческой очереди {len(manual)} задач: готовых ручных отправок {len(ready)}, проверок прошлой отправки {len(verify)}, задач на поиск контакта/маршрута {len(route)}."]
        if ready: parts.append("Можно выполнить прямо сейчас:\n"+"\n".join(line(x) for x in ready))
        if verify: parts.append("Сначала проверить историю, чтобы не допустить дубль:\n"+"\n".join(line(x) for x in verify))
        if route: parts.append("Маршрут ещё надо разрешить:\n"+"\n".join(line(x) for x in route))
        parts.append("Это рабочая последовательность по исполнимости, а не оценка бизнес-приоритета.")
        return "\n\n".join(parts)
    if selected:
        parts=[f"По {selected.get('company') or ctx.get('title')}: {selected.get('reason') or 'причина ручного режима не передана'}."]
        if selected.get("target_url"): parts.append("Подтверждённая рабочая ссылка: "+str(selected.get("target_url")))
        refs=[]
        for u in (selected.get("source_refs") or []):
            if u and u not in refs: refs.append(u)
        if refs: parts.append("Подтверждённые исходные ссылки: "+", ".join(refs[:5]))
        if not selected.get("target_url") and not refs: parts.append("Подтверждённой ссылки сейчас нет. Её нужно найти отдельным поиском маршрута; я не буду угадывать URL или email.")
        if selected.get("subject"): parts.append("Тема уже подготовлена: "+str(selected.get("subject")))
        parts.append("Можно попросить меня «разбери всю ручную очередь» — я соберу все текущие кейсы из живой коммерческой проекции.")
        return "\n\n".join(parts)
    return ""

def context_answer(q,ctx,ev):
    commercial=commercial_context_answer(q,ctx)
    if commercial: return commercial
    intent=question_intent(q)
    direct=answer_by_intent(intent,q,ctx,ev)
    if direct and intent!="what":
        return direct
    title=str((ctx or {}).get("title") or "").strip()
    date=str((ctx or {}).get("date") or "").strip()
    layer=str((ctx or {}).get("layer") or "").strip()
    why=str((ctx or {}).get("why") or "").strip()
    details=str((ctx or {}).get("details") or "").strip()
    if not ev:
        base=f"По выбранной точке «{title}»" if title else "По этому вопросу"
        facts=[]
        if date:facts.append("Дата: "+date+".")
        if layer:facts.append("Это слой «"+layer+"».")
        if details:facts.append(details)
        if why:facts.append("Почему это отмечено: "+why)
        tail=(" Из самой карточки я могу уверенно сказать только следующее: "+" ".join(facts)) if facts else ""
        return base+" я не нашёл в рабочей памяти отдельного подтверждённого описания, которое можно безопасно связать с ней."+tail+" Не буду подменять неизвестное похожим материалом из другой ветки."
    top=ev[0]
    head=(f"По выбранной точке «{title}» нашёлся рабочий контекст, который совпадает с ней по нескольким специфическим признакам." if title else
          "Нашёлся рабочий контекст, который лучше всего совпадает с твоим вопросом.")
    body=[]; fact=clean_fact(top)
    if fact: body.append(fact)
    if why and why.lower() not in fact.lower(): body.append("Почему это важно в панели: "+why)
    if details: body.append("По самой карточке: "+details)
    related=[]
    for x in ev[1:4]:
        t=str(x.get("title") or "").strip()
        if t and t!=top.get("title"): related.append(t)
    out=head
    if body: out+="\n\n"+"\n\n".join(body)
    if related: out+="\n\nЕщё по тому же контексту нашлись: "+"; ".join(related)+"."
    out+="\n\nМожно продолжить вопросом «что получили?», «чего ждём?» или «где это было?» — я сохраню контекст разговора."
    return out
SYSTEM="""Ты Steward Navigator — рабочий навигатор Основателя AICLAVIS / ATLAS / ICAM.
Отвечай по-русски и обычным человеческим языком, как коллега.
Сначала идентифицируй выбранный объект/ветку, затем отвечай. Не смешивай соседние темы из-за общего слова.
Используй только CONTEXT и EVIDENCE. Если точной связи нет, прямо скажи об этом.
Тебя зовут Стю. В пользовательском общении называй себя только «Стю», не «Стюард», не «Steward Navigator» и не «Навигатор».
Если CONTEXT.kind == "founder_priority_brief", это живая сводка Founder Panel. Сначала отделяй founder_manual_actions и execution.class=FOUNDER как личную очередь Основателя. strategic_leverage показывает сильные/перспективные внешние входы, но не превращай их в ручную задачу без подтверждённого маршрута. SYSTEM_REVIEW и AUTO — работа системы, а не Основателя. WAITING_EXTERNAL не превращай в задачу Основателя без наступившего follow-up. Обязательно учитывай source_guard: при DEGRADED скажи, что обзор неполный. Не придумывай приоритет вне переданной карты движения.
Основной ответ: что это; к какой работе относится; что известно; чего ждём/какой следующий шаг, если подтверждено.
Не выводи пути файлов, SHA-256, JSON и служебные поля без прямой просьбы о технических деталях.
Технические доказательства интерфейс показывает отдельно.
Если CONTEXT.kind == "radar_signal", работай как навигатор сигнального радара: сначала объясни, что произошло и что действительно подтверждено; затем назови класс внимания из attention_label; объясни why; используй destination и next_step как подтверждённый маршрут. Не повышай WATCH/BACKGROUND до срочного действия. REVIEW означает содержательный разбор, а не решение Основателя. ACTION_NOW означает срочность окна или проверки, но не автоматически право на действие. Если source_url передан, можешь дать его буквально; если маршрута или доказательств нет, скажи об этом и не придумывай. Для внешних возможностей отдельно учитывай eligibility_status, недостающие факты и дедлайн. Если передан evidence_ceiling, это жёсткий потолок вывода: обязательно назови его смысл и не делай более сильных утверждений. Если переданы pattern_id/pattern_signals, объясняй паттерн как агрегат сигналов, а не как новый самостоятельный факт.
Если CONTEXT содержит commercial_snapshot, работай как оперативный помощник коммерческого контура: опирайся на selected_task и manual_queue, различай ручную отправку, поиск маршрута и VERIFY_SENT, давай готовые подтверждённые target_url/source_refs буквально, если они переданы. Никогда не придумывай email, URL или факт отправки. Если verified URL отсутствует, скажи, что нужен отдельный поиск маршрута. Можешь разбирать всю накопившуюся ручную очередь и предлагать порядок действий без изменения truth store."""

def action_token(role):
    with open(ACTIONS_TOKENS_FILE,encoding="utf-8") as f:
        d=json.load(f)
    for token,r in d.items():
        if r==role:return token
    raise RuntimeError("missing action token for role "+role)

def action_post(path,payload,role):
    req=request.Request(ACTIONS_URL+path,data=json.dumps(payload,ensure_ascii=False).encode(),headers={"Content-Type":"application/json","Authorization":"Bearer "+action_token(role)},method="POST")
    try:
        with request.urlopen(req,timeout=20) as r:return json.load(r)
    except Exception as e:
        if hasattr(e,"read"):
            try: raise RuntimeError(e.read().decode()[:500])
            except RuntimeError: raise
        raise

def action_get(path,role="PROPOSE"):
    req=request.Request(ACTIONS_URL+path,headers={"Authorization":"Bearer "+action_token(role)},method="GET")
    with request.urlopen(req,timeout=20) as r:return json.load(r)

def read_json_url(url):
    with request.urlopen(url,timeout=10) as r:return json.load(r)

def commercial_context(ctx):
    """Attach the current read-only commercial snapshot for manual-work questions."""
    if str((ctx or {}).get("kind") or "")!="commercial_manual_action": return ctx or {}
    out=dict(ctx or {})
    try:
        with open(COMMERCIAL_DASHBOARD,encoding="utf-8") as f: d=json.load(f)
    except Exception as e:
        out["commercial_snapshot"]={"available":False,"reason":type(e).__name__}
        return out
    manual=d.get("manual_queue") if isinstance(d.get("manual_queue"),list) else []
    selected_id=str(out.get("object_id") or "")
    selected=next((x for x in manual if str(x.get("item_id") or "")==selected_id),None)
    compact=[]
    for x in manual[:80]:
        compact.append({k:x.get(k) for k in (
            "item_id","company","product_id","product_name","kind","reason","target_url",
            "subject","action_label","created_at","recipient_name","recipient_role","why_now","source_refs"
        )})
    autos=[]
    for x in (d.get("automatic_today") or [])[:40]:
        autos.append({k:x.get(k) for k in ("case_id","company","product_id","product_name","sent_at","followup_due_at","channel")})
    out["commercial_snapshot"]={
        "available":True,"generated_at":d.get("generated_at"),"totals":d.get("totals") or {},
        "selected_task":selected,"manual_queue":compact,"automatic_today":autos,
        "rules":[
            "Если безопасный шаг автоматизируем, он не является задачей Основателя.",
            "Не предлагать повторную отправку для VERIFY_SENT до подтверждения истории.",
            "Использовать target_url/source_refs только если они реально переданы проекцией; URL не угадывать.",
            "Можно разбирать всю manual_queue как единую рабочую очередь и предлагать порядок ручной работы."
        ]
    }
    return out

def decision_live(lifecycle_id):
    lid=str(lifecycle_id or "").strip()
    if not lid: raise ValueError("lifecycle_id_required")
    life=read_json_url(DECISION_LIFECYCLE_URL)
    hit=next((x for x in life.get("items",[]) if x.get("lifecycle_id")==lid),None)
    if not hit: raise ValueError("decision_not_open")
    pres=read_json_url(DECISION_PRESENTATION_URL)
    card=next((x for x in pres.get("founder_visible",[]) if x.get("lifecycle_id")==lid),None)
    if not card or card.get("presentation_state")!="READY": raise ValueError("decision_not_ready")
    return hit,card

def decision_identity(lifecycle,card):
    vals={}
    for x in lifecycle.get("identity_evidence",[]) or []:
        t=str(x.get("type") or ""); v=x.get("value")
        if t and v: vals.setdefault(t,[]).append(str(v))
    if len(vals.get("decision_id",[]))!=1 or len(vals.get("decision_packet_sha256",[]))!=1:
        raise ValueError("decision_identity_incomplete")
    refs=[str(x.get("id")) for x in (lifecycle.get("object_refs") or []) if x.get("id")]
    if len(set(refs))!=1: raise ValueError("decision_object_identity_ambiguous")
    return vals["decision_id"][0],vals["decision_packet_sha256"][0],refs[0]

def presentation_digest(card):
    material={k:card.get(k) for k in ["lifecycle_id","question","why_now","choices","deadline_or_condition","verified_consequences","what_happens_after_choice","presentation_state","authority_mode","object_refs","identity_evidence"]}
    blob=json.dumps(material,ensure_ascii=False,sort_keys=True,separators=(",",":")).encode()
    return hashlib.sha256(blob).hexdigest()

def propose_founder_decision(body):
    lid=str(body.get("lifecycle_id") or "").strip()
    choice=str(body.get("choice") or "").upper().strip()
    if choice not in ("APPROVE","REJECT","DEFER"): raise ValueError("invalid_decision_choice")
    lifecycle,card=decision_live(lid)
    allowed={str(x.get("canonical") or "").upper() for x in card.get("choices",[]) or []}
    if choice not in allowed: raise ValueError("choice_not_offered")
    decision_id,packet_sha,object_id=decision_identity(lifecycle,card)
    digest=presentation_digest(card)
    label=next((x.get("label") for x in card.get("choices",[]) if str(x.get("canonical") or "").upper()==choice),choice)
    payload={"lifecycle_id":lid,"decision_id":decision_id,"decision_packet_sha256":packet_sha,"decision_effect":choice,"presentation_digest":digest}
    evidence=[{"kind":"FOUNDER_DECISION_LIFECYCLE","lifecycle_id":lid},{"kind":"DECISION_PACKET","decision_id":decision_id,"decision_packet_sha256":packet_sha}]
    existing=None
    try:
        actions=action_get("/api/actions","PROPOSE")
        for a in actions.get("items",[]) or []:
            ap=a.get("payload") or {}
            if a.get("status")=="PENDING" and a.get("action_type")=="FOUNDER_DECISION_RECORD" and ap.get("lifecycle_id")==lid:
                existing=a; break
    except Exception:
        existing=None
    proposal_body={"action_type":"FOUNDER_DECISION_RECORD","target_object_id":object_id,"description":f"Зафиксировать решение Основателя {choice} по «{card.get('question') or lid}»","payload":payload,"evidence":evidence,"proposed_by":"Founder Panel / Steward Navigator"}
    if existing: proposal_body["action_id"]=existing.get("action_id")
    proposal=action_post("/api/actions/propose",proposal_body,"PROPOSE")
    return {"ok":True,"proposal":{"action_id":proposal.get("action_id"),"action_hash":proposal.get("action_hash"),"lifecycle_id":lid,"question":card.get("question"),"choice":choice,"choice_label":label or choice,"presentation_digest":digest,"target_object_id":object_id}}

def confirm_founder_decision(body):
    if body.get("founder_confirmation")!="CONFIRM": raise ValueError("founder_confirmation_required")
    aid=str(body.get("action_id") or "").strip(); ah=str(body.get("action_hash") or "").strip(); lid=str(body.get("lifecycle_id") or "").strip()
    if not aid or not ah or not lid: raise ValueError("decision_action_identity_required")
    action=action_get("/api/actions/"+aid,"PROPOSE")
    if action.get("status")!="PENDING" or action.get("action_type")!="FOUNDER_DECISION_RECORD": raise ValueError("decision_action_not_pending")
    ap=action.get("payload") or {}
    if ap.get("lifecycle_id")!=lid: raise ValueError("decision_lifecycle_mismatch")
    lifecycle,card=decision_live(lid)
    if presentation_digest(card)!=ap.get("presentation_digest"): raise ValueError("decision_presentation_stale")
    decision_id,packet_sha,object_id=decision_identity(lifecycle,card)
    if decision_id!=ap.get("decision_id") or packet_sha!=ap.get("decision_packet_sha256") or object_id!=action.get("target_object_id"):
        raise ValueError("decision_identity_changed")
    result=action_post("/api/actions/"+aid+"/approve",{"confirmed_hash":ah,"decided_by":"Founder","reason":"Explicit Founder decision in Founder Panel"},"FOUNDER")
    effect=str(ap.get("decision_effect") or "").upper()
    state=None
    for _ in range(8):
        time.sleep(.25)
        all_life=read_json_url(DECISION_LIFECYCLE_URL.replace("?status=OPEN",""))
        x=next((z for z in all_life.get("items",[]) if z.get("lifecycle_id")==lid),None)
        if x:
            state={"status":x.get("status"),"decision_effect":x.get("decision_effect"),"closed_at":x.get("closed_at")}
            if (effect in ("APPROVE","REJECT") and x.get("status")=="RESOLVED") or (effect=="DEFER" and x.get("decision_effect")=="DEFER"): break
    return {"ok":True,"status":result.get("status"),"action_id":aid,"lifecycle_id":lid,"decision_effect":effect,"lifecycle":state,"continuity_result":result.get("continuity_result")}

def propose_status_correction(body):
    ctx=body.get("context") or {}
    object_id=str(ctx.get("object_id") or "").strip()
    if not object_id or ctx.get("exact_object") is not True:
        raise ValueError("exact_object_required")
    new_status=str(body.get("new_status") or "").upper().strip()
    if new_status!="CLOSED":
        raise ValueError("only_closed_supported")
    title=str(ctx.get("title") or object_id)
    current=str(ctx.get("status") or "не передан")
    reason=str(body.get("reason") or "явная команда Основателя через Steward Navigator").strip()
    payload={"status":"CLOSED"}
    proposal=action_post("/api/actions/propose",{
      "action_type":"FOUNDER_STATUS_CORRECTION",
      "target_object_id":object_id,
      "description":f"Закрыть «{title}»: {current} → CLOSED. {reason}",
      "payload":payload,
      "evidence":[{"kind":"FOUNDER_EXPLICIT_REQUEST","reason":reason},{"kind":"PANEL_CONTEXT","route_id":ctx.get("route_id"),"object_id":object_id,"status":ctx.get("status")}],
      "proposed_by":"Steward Navigator"
    },"PROPOSE")
    return {"ok":True,"proposal":{"action_id":proposal.get("action_id"),"action_hash":proposal.get("action_hash"),"target_object_id":object_id,"title":title,"old_status":current,"new_status":"CLOSED","reason":reason}}

def confirm_status_correction(body):
    if body.get("founder_confirmation")!="CONFIRM":
        raise ValueError("founder_confirmation_required")
    action_id=str(body.get("action_id") or "").strip(); action_hash=str(body.get("action_hash") or "").strip()
    if not action_id or not action_hash: raise ValueError("action_identity_required")
    result=action_post(f"/api/actions/{action_id}/approve",{"confirmed_hash":action_hash,"decided_by":"Founder","reason":body.get("reason") or "Explicit confirmation in Founder Panel"},"FOUNDER")
    return {"ok":True,"status":result.get("status"),"action_id":action_id,"continuity_result":result.get("continuity_result")}

def propose_commercial_action(body):
    kind=str(body.get("action_type") or "").upper().strip()
    if kind not in {"MANUAL_SEND_CONFIRMED","HISTORICAL_SENT_CONFIRMED","MANUAL_ROUTE_BLOCKED","COMMERCIAL_CASE_DECLINED"}:
        raise ValueError("commercial_action_type_not_allowed")
    case_id=str(body.get("case_id") or "").strip()
    company=str(body.get("company") or "").strip()
    product_id=str(body.get("product_id") or "").strip()
    channel=str(body.get("channel") or "").strip()
    if not case_id or not company or not product_id:
        raise ValueError("commercial_action_identity_required")
    occurred_at=str(body.get("timestamp") or datetime.now(timezone.utc).isoformat())
    payload={
      "commercial_event_type":kind,
      "case_id":case_id,
      "timestamp":occurred_at,
      "channel":channel or None,
      "company":company,
      "product_id":product_id,
      "target_url":body.get("target_url"),
      "commercial_state":("HISTORICAL_SENT" if kind=="HISTORICAL_SENT_CONFIRMED" else ("WAITING" if kind=="MANUAL_SEND_CONFIRMED" else ("DECLINED_BY_FOUNDER" if kind=="COMMERCIAL_CASE_DECLINED" else "ROUTE_BLOCKED"))),
      "followup_policy":"PLUS_7D" if kind in {"MANUAL_SEND_CONFIRMED","HISTORICAL_SENT_CONFIRMED"} else None,
      "reason_code":body.get("reason_code"),
      "reason_note":body.get("reason_note")
    }
    if kind=="HISTORICAL_SENT_CONFIRMED": action_label="Подтвердить историческую отправку"
    elif kind=="MANUAL_SEND_CONFIRMED": action_label="Подтвердить ручную отправку"
    elif kind=="COMMERCIAL_CASE_DECLINED": action_label="Отклонить коммерческий кейс"
    else: action_label="Зафиксировать невозможность ручной отправки"
    description=action_label+f": {company} · {product_id} · {case_id}"
    proposal=action_post("/api/actions/propose",{
      "action_type":kind,
      "target_object_id":case_id,
      "description":description,
      "payload":payload,
      "evidence":[
        {"kind":"FOUNDER_EXPLICIT_PANEL_CONFIRMATION","case_id":case_id,"company":company},
        {"kind":"COMMERCIAL_PANEL_PROJECTION","generated_at":body.get("projection_generated_at"),"target_url":body.get("target_url")}
      ],
      "proposed_by":"Founder Panel / Commercial Manual Action Center"
    },"PROPOSE")
    return {"ok":True,"proposal":{
      "action_id":proposal.get("action_id"),"action_hash":proposal.get("action_hash"),
      "action_type":kind,"case_id":case_id,"company":company,"product_id":product_id,
      "question":("Подтвердить, что это касание уже было отправлено ранее?" if kind=="HISTORICAL_SENT_CONFIRMED" else ("Подтвердить, что ручная отправка уже выполнена?" if kind=="MANUAL_SEND_CONFIRMED" else ("Отклонить этот коммерческий кейс целиком?" if kind=="COMMERCIAL_CASE_DECLINED" else "Зафиксировать, что текущий ручной маршрут не удалось использовать?")))
    }}

def confirm_commercial_action(body):
    if body.get("founder_confirmation")!="CONFIRM":
        raise ValueError("founder_confirmation_required")
    aid=str(body.get("action_id") or "").strip(); ah=str(body.get("action_hash") or "").strip()
    if not aid or not ah: raise ValueError("action_identity_required")
    action=action_get("/api/actions/"+aid,"PROPOSE")
    if action.get("status") not in {"PENDING","APPROVE_WRITE_FAILED"} or action.get("action_type") not in {"MANUAL_SEND_CONFIRMED","HISTORICAL_SENT_CONFIRMED","MANUAL_ROUTE_BLOCKED","COMMERCIAL_CASE_DECLINED"}:
        raise ValueError("commercial_action_not_pending")
    result=action_post("/api/actions/"+aid+"/approve",{
      "confirmed_hash":ah,"decided_by":"Founder",
      "reason":"Explicit Founder confirmation in Commercial Manual Action Center"
    },"FOUNDER")
    return {"ok":True,"status":result.get("status"),"action_id":aid,
            "action_type":action.get("action_type"),"payload":action.get("payload"),
            "continuity_result":result.get("continuity_result")}

def retry_failed_commercial_action(body):
    """Retry only an already Founder-confirmed commercial action whose write failed.
    This creates no new authority: the failed ledger row itself must prove the
    prior Founder decision and its immutable action_hash is reused verbatim.
    """
    aid=str(body.get("action_id") or "").strip()
    if not aid: raise ValueError("action_identity_required")
    action=action_get("/api/actions/"+aid,"PROPOSE")
    if action.get("status")!="APPROVE_WRITE_FAILED": raise ValueError("commercial_action_not_failed")
    if action.get("action_type") not in {"MANUAL_SEND_CONFIRMED","HISTORICAL_SENT_CONFIRMED","MANUAL_ROUTE_BLOCKED","COMMERCIAL_CASE_DECLINED"}: raise ValueError("commercial_action_type_not_allowed")
    if str(action.get("decided_by") or "").lower()!="founder": raise ValueError("prior_founder_confirmation_missing")
    ah=str(action.get("action_hash") or "")
    if not ah: raise ValueError("action_hash_missing")
    result=action_post("/api/actions/"+aid+"/approve",{
      "confirmed_hash":ah,"decided_by":"Founder",
      "reason":"Retry of previously Founder-confirmed commercial action after technical write failure"
    },"FOUNDER")
    return {"ok":True,"status":result.get("status"),"action_id":aid,
            "action_type":action.get("action_type"),"payload":action.get("payload"),
            "continuity_result":result.get("continuity_result")}

def cancel_pending_action(body):
    if body.get("founder_confirmation")!="CANCEL": raise ValueError("founder_cancellation_required")
    aid=str(body.get("action_id") or "").strip(); ah=str(body.get("action_hash") or "").strip()
    if not aid or not ah: raise ValueError("action_identity_required")
    action=action_get("/api/actions/"+aid,"PROPOSE")
    if action.get("status")!="PENDING": raise ValueError("action_not_pending")
    result=action_post("/api/actions/"+aid+"/reject",{"confirmed_hash":ah,"decided_by":"Founder","reason":"Founder cancelled pending Panel action"},"FOUNDER")
    return {"ok":True,"status":result.get("status"),"action_id":aid}

def agent_answer(q,ev,history,context):
    payload={"question":q,"context":context or {},"history":history or [],"evidence":ev or []}
    req=request.Request(AGENT_URL,data=json.dumps(payload,ensure_ascii=False).encode(),headers={"Content-Type":"application/json"})
    with request.urlopen(req,timeout=95) as r:data=json.load(r)
    ans=str(data.get("answer") or "").strip()
    if not ans: raise RuntimeError("empty agent answer")
    return ans

def ollama_answer(q,ev,history,context):
    payload={"model":OLLAMA_MODEL,"stream":False,
      "messages":[{"role":"system","content":SYSTEM+"\nCONTEXT:\n"+json.dumps(context or {},ensure_ascii=False)+"\nEVIDENCE:\n"+json.dumps(ev,ensure_ascii=False)}]+
      [{"role":x.get("role","user"),"content":str(x.get("content",""))[:4000]} for x in (history or [])[-10:]]+
      [{"role":"user","content":q}],"options":{"temperature":0.15}}
    req=request.Request(OLLAMA_URL,data=json.dumps(payload).encode(),headers={"Content-Type":"application/json"})
    with request.urlopen(req,timeout=90) as r:data=json.load(r)
    return data.get("message",{}).get("content","").strip()

class H(BaseHTTPRequestHandler):
    def j(self,o,c=200):
        b=json.dumps(o,ensure_ascii=False).encode()
        self.send_response(c); self.send_header("Content-Type","application/json; charset=utf-8")
        self.send_header("Content-Length",str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        if self.path=="/health":
            mode="openai_agent+retrieval_fallback"
            return self.j({"ok":True,"service":"steward-navigator","version":"0.9","index_records":len(load_index()),"language_model":mode})
        return self.j({"error":"not_found"},404)

    def do_POST(self):
        n=int(self.headers.get("Content-Length","0"))
        try: body=json.loads(self.rfile.read(n) or b"{}")
        except Exception: return self.j({"error":"invalid_json"},400)
        if self.path=="/api/steward-navigator/action/propose-status":
            try:return self.j(propose_status_correction(body),202)
            except ValueError as e:return self.j({"error":str(e)},409 if str(e)=="exact_object_required" else 400)
            except Exception as e:return self.j({"error":"action_proposal_failed","detail":str(e)[:300]},502)
        if self.path=="/api/steward-navigator/action/confirm-status":
            try:return self.j(confirm_status_correction(body),200)
            except ValueError as e:return self.j({"error":str(e)},400)
            except Exception as e:return self.j({"error":"action_confirmation_failed","detail":str(e)[:300]},502)
        if self.path=="/api/steward-navigator/action/propose-decision":
            try:return self.j(propose_founder_decision(body),202)
            except ValueError as e:return self.j({"error":str(e)},409 if str(e) in ("decision_not_open","decision_not_ready","decision_presentation_stale","decision_identity_changed") else 400)
            except Exception as e:return self.j({"error":"decision_proposal_failed","detail":str(e)[:300]},502)
        if self.path=="/api/steward-navigator/action/confirm-decision":
            try:return self.j(confirm_founder_decision(body),200)
            except ValueError as e:return self.j({"error":str(e)},409 if str(e) in ("decision_not_open","decision_not_ready","decision_presentation_stale","decision_identity_changed","decision_action_not_pending") else 400)
            except Exception as e:return self.j({"error":"decision_confirmation_failed","detail":str(e)[:300]},502)
        if self.path=="/api/steward-navigator/action/propose-commercial":
            try:return self.j(propose_commercial_action(body),202)
            except ValueError as e:return self.j({"error":str(e)},400)
            except Exception as e:return self.j({"error":"commercial_action_proposal_failed","detail":str(e)[:300]},502)
        if self.path=="/api/steward-navigator/action/confirm-commercial":
            try:return self.j(confirm_commercial_action(body),200)
            except ValueError as e:return self.j({"error":str(e)},409 if str(e)=="commercial_action_not_pending" else 400)
            except Exception as e:return self.j({"error":"commercial_action_confirmation_failed","detail":str(e)[:300]},502)
        if self.path=="/api/steward-navigator/action/retry-failed-commercial":
            try:return self.j(retry_failed_commercial_action(body),200)
            except ValueError as e:return self.j({"error":str(e)},409 if str(e)=="commercial_action_not_failed" else 400)
            except Exception as e:return self.j({"error":"commercial_action_retry_failed","detail":str(e)[:300]},502)
        if self.path=="/api/steward-navigator/action/cancel":
            try:return self.j(cancel_pending_action(body),200)
            except ValueError as e:return self.j({"error":str(e)},409 if str(e)=="action_not_pending" else 400)
            except Exception as e:return self.j({"error":"action_cancellation_failed","detail":str(e)[:300]},502)
        if self.path!="/api/steward-navigator/query":
            return self.j({"error":"not_found"},404)
        q=str(body.get("question","")).strip()
        if not q:
            return self.j({"error":"question_required"},400)
        context=commercial_context(body.get("context") or {})
        if is_priority_question(q):
            context=founder_priority_context(context)
        history=body.get("history") or []
        ev=[] if is_priority_question(q) else retrieve(q,context)
        if "диагностика market scanner" in norm(context.get("title","")):
            ev=[]
        mode="contextual_retrieval_fallback"
        if is_priority_question(q):
            ans=priority_answer(context)
            mode="founder_priority_live"
        else:
            ans=context_answer(q,context,ev)
        try:
            if not is_priority_question(q):
                ans=agent_answer(q,ev,history,context)
                mode="openai_agent"
        except Exception:
            if OLLAMA_MODEL:
                try:
                    ans=ollama_answer(q,ev,history,context)
                    mode="ollama_fallback"
                except Exception:
                    pass
        return self.j({"answer":ans,"evidence":ev,"mode":mode,"memory_complete":False})

    def no(self):
        return self.j({"error":"method_not_allowed"},405)
    do_PUT=no
    do_PATCH=no
    do_DELETE=no
    def log_message(self,*a):
        pass

PORT=int(os.environ.get("STEWARD_NAV_PORT","8833"))
HTTPServer(("127.0.0.1",PORT),H).serve_forever()
