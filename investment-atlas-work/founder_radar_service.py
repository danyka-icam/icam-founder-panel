#!/usr/bin/env python3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib import request
from datetime import datetime, timezone
import json, os, re, hashlib

PORT=int(os.environ.get("FOUNDER_RADAR_PORT","8843"))
BASE=os.environ.get("FOUNDER_RADAR_BASE","http://127.0.0.1:8083")
URLS={
 "inbox":BASE+"/founder-ui-preview/api/continuity/founder-inbox",
 "twin":BASE+"/founder-ui-preview/api/panel/twin",
 "signal_lab":BASE+"/founder-ui-preview/api/signal-lab-status",
 "signals":BASE+"/founder-ui-preview/api/signals",
 "founder":BASE+"/founder-ui-preview/api/founder-projection",
 "temporal":BASE+"/founder-star-view/api/temporal-universe",
 "investment":"http://127.0.0.1:8842/api/v1/investment-lab/summary",
 "activity":"http://127.0.0.1:8825/api/activity-inbox",
}

def now(): return datetime.now(timezone.utc).isoformat()
def getj(name,timeout=6):
    with request.urlopen(URLS[name],timeout=timeout) as r: return json.load(r)
def iso_date_from(*values):
    for v in values:
        if not v: continue
        m=re.search(r"(20\d{2}-\d{2}-\d{2})",str(v))
        if m:return m.group(1)
    return None
def item_id(prefix,*parts):
    return prefix+"-"+hashlib.sha256("|".join(str(x or "") for x in parts).encode()).hexdigest()[:16]
def branch_rows(temporal):
    out=[]
    for w in temporal.get("worlds",[]) or []:
        for l in w.get("lines",[]) or []:
            for b in l.get("branches",[]) or []: out.append((w,l,b))
    return out
def founder_relevant_wait(ctx,title,date):
    blob=" ".join(str(x or "") for x in [ctx.get("world"),ctx.get("line"),ctx.get("branch"),title]).lower()
    if date:return True
    if re.search(r"forecast|прогноз|outcome|исход|reveal|раскры",blob):return True
    if re.search(r"external|response|reply|decision|credits|conference|конферен|application|заявк|outreach|tender|тендер|grant|грант|publication|публикац|journal|invite|приглаш",blob):return True
    if any(k in (ctx.get("line") or "").lower() for k in ["выход на рынок","институциональные возможности","научное присутствие"]):return True
    return False

def temporal_projection(temporal):
    waiting=[]; upcoming=[]; predictions=[]; reputation=[]
    for w,l,b in branch_rows(temporal):
        tv=b.get("temporal") or {}
        ctx={"world":w.get("title"),"line":l.get("title"),"branch":b.get("title"),"memory_id":b.get("memory_id")}
        for x in tv.get("waiting",[]) or []:
            title=x.get("title") or "Ожидание"
            date=iso_date_from(x.get("valid_from"),x.get("recorded_at"),title)
            row={"radar_id":item_id("wait",b.get("memory_id"),title,date),"title":title,"date":date,
                 "status":"WAITING","context":ctx,
                 "source_ref":{"kind":"temporal_branch_waiting","memory_id":b.get("memory_id"),"waiting_id":x.get("id")}}
            if founder_relevant_wait(ctx,title,date): waiting.append(row)
            blob=" ".join(str(z or "") for z in [l.get("title"),b.get("title"),title]).lower()
            if date:
                upcoming.append({**row,"radar_id":item_id("date",b.get("memory_id"),title,date),
                                 "kind":"prediction" if re.search(r"forecast|прогноз|outcome|исход|reveal|раскры",blob) else "deadline"})
            if re.search(r"forecast|прогноз|outcome|исход|reveal|раскры",blob):
                predictions.append({**row,"kind":"forecast"})
        for x in tv.get("next",[]) or []:
            title=x.get("title") or "Следующий рубеж"
            date=iso_date_from(x.get("at"),x.get("valid_from"),x.get("recorded_at"),title)
            row={"radar_id":item_id("next",b.get("memory_id"),title,date),"title":title,"date":date,
                 "status":"NEXT","context":ctx,
                 "source_ref":{"kind":"temporal_branch_next","memory_id":b.get("memory_id"),"next_id":x.get("id")}}
            if date: upcoming.append({**row,"kind":"milestone"})
            blob=" ".join(str(z or "") for z in [l.get("title"),b.get("title"),title]).lower()
            if re.search(r"forecast|прогноз|outcome|исход|reveal|раскры",blob):
                predictions.append({**row,"kind":"forecast"})
        lab=(l.get("title") or "").lower()
        if any(k in lab for k in ["научное присутствие","институциональные возможности","выход на рынок"]):
            nowv=tv.get("now")
            state=(nowv.get("state") if isinstance(nowv,dict) else nowv)
            reputation.append({"radar_id":item_id("rep",b.get("memory_id")),"title":b.get("title"),
                "context":ctx,"status":state,"waiting_count":len(tv.get("waiting",[]) or []),
                "next_count":len(tv.get("next",[]) or []),
                "source_ref":{"kind":"temporal_branch","memory_id":b.get("memory_id")}})
    return waiting,upcoming,predictions,reputation
def activity_projection(activity,existing_upcoming):
    upcoming=[]; waiting=[]; reputation=[]
    existing={(x.get("title"),x.get("date")) for x in existing_upcoming}
    for e in (activity.get("items",[]) if activity else []) or []:
        branch=e.get("source_branch")
        title=e.get("next_milestone") or e.get("human_change")
        if not title: continue
        date=iso_date_from(e.get("next_milestone"),e.get("human_change"))
        event_date=iso_date_from(e.get("valid_at"))
        blob=" ".join(str(x or "") for x in [branch,e.get("event_type"),e.get("human_change"),e.get("next_milestone")]).lower()
        founder_relevant=bool(
          date or re.search(r"conference|конферен|application|заявк|outreach|response|reply|decision|publication|публикац|forecast|прогноз|outcome|исход|tender|тендер|grant|грант",blob)
        )
        if not founder_relevant: continue
        row={"radar_id":item_id("activity",e.get("event_id"),title,date),"title":title,"date":date,
             "observed_at":event_date,"status":"NEXT_MILESTONE","context":{"branch":branch},"why":e.get("why_it_matters"),
             "source_ref":{"kind":"activity_event","event_id":e.get("event_id"),"source_branch":branch}}
        if date and (title,date) not in existing: upcoming.append({**row,"kind":"branch_milestone"})
        if re.search(r"response|reply|decision|outcome|исход|application|заявк|conference|конферен|publication|публикац|outreach",blob):
            waiting.append({**row,"status":"WAITING"})
        if re.search(r"science|науч|visibility|publication|публикац|conference|конферен|external",blob):
            reputation.append({**row,"status":e.get("event_type")})
    return waiting,upcoming,reputation

def prediction_projection(twin,predictions):
    out=list(predictions)
    if twin:
        for field,state,title in [
          ("seal_created_at","SEALED","Прогноз Twin запечатан"),
          ("outcome_due_at","DUE","Ожидаемый исход Twin"),
          ("expected_outcome_at","DUE","Ожидаемый исход Twin"),
          ("reveal_at","REVEAL","Раскрытие прогноза Twin"),
          ("resolution_at","RESOLUTION","Разрешение прогноза Twin"),
          ("outcome_at","OUTCOME","Исход Twin")]:
            if twin.get(field):
                out.append({"radar_id":item_id("twin",field,twin.get(field)),"title":title,
                            "date":str(twin.get(field))[:10],"status":state,"kind":"twin",
                            "context":{"branch":"Twin / Synthetic Worlds Program"},
                            "source_ref":{"kind":"twin_state","field":field}})
        if twin.get("current_prediction") or twin.get("seal_created_at"):
            out.append({"radar_id":item_id("twin-current",twin.get("current_commitment")),
                        "title":"Twin: текущий прогноз","date":None,
                        "status":twin.get("current_prediction") or "UNKNOWN","kind":"twin",
                        "result":twin.get("last_outcome"),"scored_n":twin.get("prospective_scored_n"),
                        "source_ref":{"kind":"twin_state"}})
    seen=set(); res=[]
    for x in out:
        ref=x.get("source_ref") or {}
        k=(ref.get("kind"),ref.get("memory_id"),x.get("title"),x.get("date"),x.get("status"))
        if k in seen: continue
        seen.add(k); res.append(x)
    return res
def opportunities_projection(signals,upcoming):
    out=[]
    rows=(signals.get("signals",[]) if signals else []) or []

    # Opportunity Scanner writes append-only state events. Collapse them to the
    # newest event per stable opportunity_key, then show only current open
    # windows. A closed/expired event removes the card without deleting history.
    latest={}
    for s in rows:
        if not str(s.get("signal_type") or "").startswith("opportunity-"):
            continue
        k=s.get("opportunity_key") or s.get("signal_id")
        prev=latest.get(k)
        if prev is None or str(s.get("observed_at") or "") > str(prev.get("observed_at") or ""):
            latest[k]=s
    today=datetime.now(timezone.utc).date()
    open_status={"OPEN","OPEN_FOR_SUBMISSION","LISTED_AS_OPEN","POSTED"}
    for k,s in latest.items():
        official=str(s.get("official_status") or "").upper()
        deadline=iso_date_from(s.get("deadline"))
        expired=False
        if deadline:
            try: expired=datetime.strptime(deadline,"%Y-%m-%d").date() < today
            except Exception: pass
        if s.get("signal_type")!="opportunity-candidate" or official not in open_status or expired:
            continue
        eligibility=s.get("eligibility_status") or "UNCHECKED"
        requirements=s.get("eligibility_requirements") or []
        missing_facts=s.get("eligibility_missing_facts") or []
        next_check=s.get("eligibility_next_check")
        review_sources=s.get("eligibility_review_sources") or []
        source_conflicts=s.get("eligibility_source_conflicts") or []
        why=s.get("why_it_matters_ru") or "Официальный источник сообщает об открытом внешнем окне."
        elig_upper=str(eligibility).upper()
        if elig_upper=="UNCHECKED":
            why += " Соответствие aiclavis условиям допуска ещё не проверено."
        elif elig_upper=="NEEDS_CALL_DOCUMENT_REVIEW":
            why += " Окно подтверждено, но полный документ конкурса ещё нужно разобрать до company-fit проверки."
        elif elig_upper=="NEEDS_COMPANY_FACTS":
            why += " Источник уже даёт часть критериев заявителя; нужны подтверждённые факты компании для сопоставления."
        days_left=None
        if deadline:
            try: days_left=(datetime.strptime(deadline,"%Y-%m-%d").date()-today).days
            except Exception: pass
        if days_left is not None and 0 <= days_left <= 14:
            radar_class="ACTION_NOW"
        elif elig_upper in {"NEEDS_CALL_DOCUMENT_REVIEW","NEEDS_COMPANY_FACTS","ELIGIBLE"}:
            radar_class="REVIEW"
        else:
            radar_class="WATCH"
        if elig_upper=="ELIGIBLE":
            next_step="Допуск подтверждён источником. Проверить пакет и маршрут подачи до дедлайна."
        elif elig_upper=="NEEDS_COMPANY_FACTS":
            next_step="Срочно сопоставить критерии программы с подтверждёнными фактами aiclavis; до этого не считать подачу допустимой."
        elif elig_upper=="NEEDS_CALL_DOCUMENT_REVIEW":
            next_step="Разобрать официальный документ конкурса и только затем решать вопрос о соответствии aiclavis."
        else:
            next_step="Проверить условия допуска и срок; не считать окно пригодным для aiclavis до подтверждения."
        out.append({
            "radar_id":item_id("opp",k),"opportunity_key":k,
            "title":s.get("title") or s.get("entity") or "Внешняя возможность",
            "kind":"official_opportunity","date":deadline,"days_left":days_left,"radar_class":radar_class,
            "why":why,"next_step_ru":next_step,
            "destination":{"kind":"institutional_opportunity","label":"Институциональные возможности","route":"Проверка допуска → решение о подаче → подготовка пакета."},
            "status":"opportunity","source":s.get("source"),
            "official_status":official,"eligibility_status":eligibility,
            "program_type":s.get("program_type"),"opportunity_url":s.get("opportunity_url"),
            "relevance_score":s.get("relevance_score"),"evidence":s.get("evidence") or [],
            "eligibility_requirements":requirements,
            "eligibility_missing_facts":missing_facts,
            "eligibility_next_check":next_check,
            "eligibility_review_sources":review_sources,
            "eligibility_source_conflicts":source_conflicts,
            "context":{"eligibility_status":eligibility,"program_type":s.get("program_type"),
                       "official_status":official,
                       "eligibility_requirements":requirements,
                       "eligibility_missing_facts":missing_facts,
                       "eligibility_next_check":next_check,
                       "eligibility_review_sources":review_sources,
                       "eligibility_source_conflicts":source_conflicts},
            "source_ref":{"kind":"market_signal","signal_id":s.get("signal_id"),
                          "opportunity_key":k}
        })

    # Preserve pre-existing dated/commercial opportunities from canonical
    # temporal/activity sources and legacy non-opportunity market signals.
    for s in rows:
        if str(s.get("signal_type") or "").startswith("opportunity-"):
            continue
        enr=s.get("enrichment") or {}
        action=(enr.get("recommended_action") or s.get("status") or "").lower()
        blob=" ".join(str(x or "") for x in [s.get("title"),s.get("entity"),s.get("signal_type")]).lower()
        commercial=bool(re.search(r"tender|тендер|grant|грант|conference|конферен|rfp|partnership|partner|commercial|program|award",blob))
        if action in ("act","opportunity") or commercial:
            out.append({"radar_id":item_id("opp",s.get("signal_id")),
                        "title":s.get("title") or s.get("entity") or "Внешняя возможность",
                        "kind":"market_signal","date":iso_date_from(s.get("deadline"),s.get("observed_at")),
                        "why":enr.get("why_it_matters_ru") or s.get("why_it_matters_ru"),
                        "status":action or "watch","source":s.get("source"),
                        "source_ref":{"kind":"market_signal","signal_id":s.get("signal_id")}})
    for x in upcoming:
        blob=" ".join(str(z or "") for z in [x.get("title"),(x.get("context") or {}).get("line"),(x.get("context") or {}).get("branch")]).lower()
        if re.search(r"conference|конферен|tender|тендер|grant|грант|application|заявк|program|программ|outreach|партн|partner",blob):
            out.append({**x,"radar_id":item_id("opp-date",x.get("radar_id")),"kind":"dated_opportunity"})
    return sorted(out,key=lambda x:({"ACTION_NOW":0,"REVIEW":1,"WATCH":2}.get(x.get("radar_class"),3),x.get("date") is None,x.get("date") or "9999",-int(x.get("relevance_score") or 0)))

def field_projection(signals):
    rows=[x for x in ((signals.get("signals",[]) if signals else []) or []) if not str(x.get("signal_type") or "").startswith("opportunity-")]
    grouped={}
    for s in rows:
        typ=str(s.get("signal_type") or "unknown")
        title=str(s.get("title") or s.get("entity") or "Сигнал").strip()
        entity=str(s.get("entity") or "").strip()
        # Generic capability titles repeat on every scanner cycle. Grouping by
        # entity/type/title preserves the latest state while retaining repeat count.
        key=(entity,typ,title)
        grouped.setdefault(key,[]).append(s)
    out=[]
    rank={"ACTION_NOW":0,"REVIEW":1,"WATCH":2,"BACKGROUND":3}
    for key,grp in grouped.items():
        grp=sorted(grp,key=lambda x:str(x.get("observed_at") or ""))
        s=grp[-1]; enr=s.get("enrichment") or {}
        action=str(enr.get("recommended_action") or "").lower()
        ap=int(enr.get("architecture_proximity") or 0); ms=int(enr.get("market_significance") or 0)
        conv=bool(enr.get("architecture_convergence"))
        if action in {"act","opportunity"}:
            lane="ACTION_NOW"
        elif action=="review-atlas" or (conv and ap>=65 and ms>=35):
            lane="REVIEW"
        elif action=="watch":
            lane="WATCH"
        else:
            lane="BACKGROUND"
        typ=str(s.get("signal_type") or "")
        if lane=="REVIEW" and typ=="research-signal":
            destination={"kind":"research","label":"Исследовательский ATLAS","route":"Проверить, меняет ли сигнал модель, архитектуру или исследовательскую очередь ATLAS."}
        elif typ=="research-signal":
            destination={"kind":"research","label":"ICAM / Наука","route":"Сохранить как внешний научный сигнал; повышать только при подтверждённом влиянии на программу."}
        elif typ=="capability-release":
            destination={"kind":"market","label":"Рынок / конкурентная среда","route":"Проверить подтверждённое продуктовое или архитектурное изменение до коммерческого действия."}
        else:
            destination={"kind":"radar","label":"Сигнальный радар","route":"Сначала определить владеющий контур; автоматически действие не создавать."}
        next_step={
          "ACTION_NOW":"Проверить маршрут действия и срок; если доказательства достаточны — передать во владеющий контур.",
          "REVIEW":"Разобрать содержательно: меняет ли это нашу модель, архитектуру, исследовательскую или коммерческую траекторию.",
          "WATCH":"Наблюдать. Новое действие не создавать без дополнительного подтверждения.",
          "BACKGROUND":"Фоновый сигнал. Действий не требуется; хранить для накопления картины."
        }[lane]
        src=s.get("source") or {}
        out.append({
          "radar_id":item_id("field",s.get("signal_id"),key[0],key[1],key[2]),
          "signal_id":s.get("signal_id"),"signal_type":s.get("signal_type"),"entity":s.get("entity"),
          "title":s.get("title") or s.get("entity") or "Сигнал","observed_at":s.get("observed_at"),"published_at":s.get("published_at"),
          "status":s.get("status"),"radar_class":lane,
          "summary_ru":enr.get("summary_ru") or s.get("summary_ru"),
          "why":enr.get("why_it_matters_ru") or s.get("why_it_matters_ru"),
          "next_step_ru":next_step,"destination":destination,
          "recommended_action":enr.get("recommended_action"),"architecture_proximity":enr.get("architecture_proximity"),
          "market_significance":enr.get("market_significance"),"architecture_convergence":enr.get("architecture_convergence"),
          "relevance_score":s.get("relevance_score"),"impact_score":s.get("impact_score"),"confidence":s.get("confidence"),
          "axis":s.get("axis") or [],"source":src,"source_url":src.get("url"),"evidence":s.get("evidence") or [],
          "repeat_count":len(grp),"first_observed_at":grp[0].get("observed_at"),"latest_observed_at":s.get("observed_at"),
          "source_signal_ids":[x.get("signal_id") for x in grp if x.get("signal_id")],
          "source_ref":{"kind":"market_signal","signal_id":s.get("signal_id")}
        })
    out.sort(key=lambda x:(rank.get(x.get("radar_class"),9),-int(x.get("market_significance") or 0),-int(x.get("architecture_proximity") or 0),str(x.get("latest_observed_at") or "")),reverse=False)
    counts={k:sum(1 for x in out if x.get("radar_class")==k) for k in rank}
    counts.update({"raw":len(rows),"clusters":len(out),"collapsed_repeats":max(0,len(rows)-len(out))})
    return {"signals":out,"counts":counts,"source_coverage":signals.get("source_coverage") if signals else None}

def pattern_projection(field,opportunities):
    rows=(field or {}).get("signals") or []
    patterns=[]
    def blob(x):
        # Pattern evidence must come from the event itself. Explanatory `why`
        # is downstream interpretation and must never become evidence for its own pattern.
        return " ".join(str(v or "") for v in [x.get("title"),x.get("summary_ru")]).lower()
    def hits(test):
        return [x for x in rows if test(blob(x),x)]
    def add_pattern(pid,title,items,theme,why,ceiling,destination,min_n=3):
        if len(items)<min_n: return
        dates=sorted({str(x.get("latest_observed_at") or x.get("observed_at") or "")[:10] for x in items if x.get("latest_observed_at") or x.get("observed_at")})
        classes={}
        for x in items: classes[x.get("radar_class")]=classes.get(x.get("radar_class"),0)+1
        patterns.append({
          "pattern_id":pid,"title":title,"theme":theme,"status":"EMERGING_PATTERN","radar_class":"REVIEW",
          "signal_count":len(items),"distinct_days":len(dates),"first_seen":dates[0] if dates else None,"last_seen":dates[-1] if dates else None,
          "attention_mix":classes,
          "why":why,"evidence_ceiling":ceiling,"destination":destination,"source_ref":{"kind":"radar_pattern","pattern_id":pid},
          "next_step_ru":"Разобрать паттерн как единое целое и проверить, появился ли переносимый механизм, рыночное подтверждение или новый вход.",
          "signals":[{"signal_id":x.get("signal_id"),"title":x.get("title"),"radar_class":x.get("radar_class"),"source_url":x.get("source_url") or (x.get("source") or {}).get("url")} for x in items[:12]]
        })
    add_pattern(
      "PAT-AGENTIC-TWIN",
      "Агенты + цифровые двойники + изменяющееся состояние",
      hits(lambda b,x: ("digital twin" in b or "цифров" in b and "двойн" in b) and ("agent" in b or "агент" in b)),
      "agentic-digital-twin",
      "Несколько новых работ используют агентный контур поверх цифрового двойника или модели состояния.",
      "Это исследовательская конвергенция терминов и механизмов. Она не доказывает рыночный спрос, зрелость продукта или преимущество ATLAS.",
      {"kind":"research","label":"Исследовательский ATLAS / архитектура двойников и агентов","route":"Сравнить механизмы состояния, полномочий агентов, обновления модели и обратной связи."}
    )
    add_pattern(
      "PAT-TWIN-DECISION",
      "Цифровой двойник как контур решений и оптимизации",
      hits(lambda b,x: ("digital twin" in b or "цифров" in b and "двойн" in b) and any(k in b for k in ["decision","policy","optimization","оптимиза","решен"])),
      "digital-twin-decision",
      "Повторяются работы, где цифровой двойник используется не только для наблюдения, а для выбора, оптимизации или поддержки решения.",
      "Пока это только повторяемость в исследовательском поле. Нельзя считать её доказательством корпоративного внедрения или готовности рынка покупать такой класс систем.",
      {"kind":"research","label":"Исследовательский ATLAS / интеллект принятия решений","route":"Проверить, какие архитектуры замыкают цикл наблюдение → модель → решение → действие → обратная связь."}
    )
    add_pattern(
      "PAT-TWIN-SIMULATION",
      "Симуляция, калибровка и переход реальная система ↔ модель вокруг цифровых двойников",
      hits(lambda b,x: ("digital twin" in b or "цифров" in b and "двойн" in b) and any(k in b for k in ["simulat","sim-real","real2sim","calibrat","моделир","калибр"])),
      "digital-twin-simulation",
      "Накопилась группа работ про калибровку двойников, симуляцию и перенос между реальной системой и моделью.",
      "Это исследовательский паттерн. Он не говорит сам по себе, что соответствующие методы применимы к ATLAS или дают коммерческий эффект.",
      {"kind":"research","label":"Twin / Synthetic Worlds","route":"Сравнить способы калибровки, перехода реальная система ↔ симуляция, проверки модели и ограничения переносимости."}
    )
    open_opps=[x for x in (opportunities or []) if x.get("kind")=="official_opportunity"]
    institutions=sorted({str((x.get("source") or {}).get("name") or "").split("-")[0].strip() for x in open_opps if (x.get("source") or {}).get("name")})
    if len(open_opps)>=3 and len(institutions)>=2:
        patterns.append({
          "pattern_id":"PAT-BR-INSTITUTIONAL-FUNDING","title":"Коридор публичного финансирования инноваций в Бразилии",
          "theme":"institutional-funding","status":"OPEN_CORRIDOR","radar_class":"REVIEW","signal_count":len(open_opps),"distinct_institutions":len(institutions),
          "institutions":institutions,
          "first_seen":min([x.get("date") for x in open_opps if x.get("date")],default=None),
          "last_seen":max([x.get("date") for x in open_opps if x.get("date")],default=None),
          "why":"Одновременно открыто несколько программ от разных бразильских институтов; часть касается ИИ и цифровых технологий.",
          "evidence_ceiling":"Это доказывает наличие институционального окна, но не право aiclavis на участие и не вероятность финансирования. Допуск проверяется по каждой программе отдельно.",
          "source_ref":{"kind":"radar_pattern","pattern_id":"PAT-BR-INSTITUTIONAL-FUNDING"},
          "destination":{"kind":"institutional_opportunity","label":"Институциональные возможности","route":"Сначала отсечь неподходящие программы, затем ранжировать оставшиеся по сроку, размеру и стратегическому соответствию."},
          "next_step_ru":"Собрать единый shortlist программ после проверки допуска, а не разбирать каждую как изолированную карточку.",
          "signals":[{"radar_id":x.get("radar_id"),"title":x.get("title"),"date":x.get("date"),"eligibility_status":x.get("eligibility_status"),"source_url":x.get("opportunity_url")} for x in open_opps[:12]]
        })
    order={"OPEN_CORRIDOR":0,"EMERGING_PATTERN":1}
    patterns.sort(key=lambda x:(order.get(x.get("status"),9),-int(x.get("signal_count") or 0),x.get("title") or ""))
    return patterns

def attention_projection(inbox,founder):
    out=[]
    formal=(founder or {}).get("today") or {}
    formal_decisions=formal.get("founder_decisions",[]) or []
    for x in (inbox.get("needs_founder",[]) if inbox else []) or []:
        if formal_decisions and str(x.get("issue_type") or "").upper()=="FOUNDER_APPROVAL_REQUIRED":
            continue
        out.append({"radar_id":item_id("founder-inbox",x.get("object_id"),x.get("opened_at")),
                    "title":x.get("summary") or x.get("title") or "Запрос к Основателю",
                    "status":"NEEDS_FOUNDER","date":iso_date_from(x.get("deadline"),x.get("due_at")),
                    "source_ref":{"kind":"founder_inbox","object_id":x.get("object_id")}})
    for x in formal_decisions:
        out.append({"radar_id":item_id("decision",x.get("decision_id"),x.get("question")),
                    "title":x.get("question") or "Формальное решение Основателя","status":"DECISION",
                    "date":iso_date_from(x.get("deadline_or_condition")),
                    "source_ref":{"kind":"founder_decision","decision_id":x.get("decision_id")}})
    return out
def investment_projection(inv):
    if not inv:return {"available":False}
    vc=inv.get("virtual_capital") or {}; hyp=inv.get("hypotheses") or {}; act=inv.get("activity") or {}; dq=inv.get("data_quality") or {}
    return {"available":True,"schema":inv.get("schema"),"lab_status":inv.get("lab_status"),"deployment_mode":inv.get("deployment_mode"),"as_of":inv.get("as_of"),
      "decision_cycle":inv.get("decision_cycle"),"decision_watch":inv.get("decision_watch"),"last_decision":inv.get("last_decision"),"last_decision_at":inv.get("last_decision_at"),
      "architecture":inv.get("architecture"),"last_decision_architecture":inv.get("last_decision_architecture"),"next_decision_architecture":inv.get("next_decision_architecture"),
      "architecture_state":inv.get("architecture_state"),
      "virtual_capital":vc,"hypotheses":hyp,"activity":act,"cadence":inv.get("cadence") or {},
      "decision_history":inv.get("decision_history") or [],"review_diagnostics":inv.get("review_diagnostics") or {},
      "portfolios":inv.get("portfolios") or [],"data_quality":dq,"semantic_evidence":inv.get("semantic_evidence") or {},
      "stage":(inv.get("training") or {}).get("stage"),"next_gate":(inv.get("training") or {}).get("next_gate")}

def learning_projection(signal_lab,twin):
    rows=[]
    if signal_lab:
        st=signal_lab.get("current_stage") or {}
        rows.append({"key":"signal_lab","title":"ATLAS Signal Lab","stage":st.get("label") or st.get("name"),
                     "result":signal_lab.get("latest_review"),"next":signal_lab.get("next_gate"),
                     "next_date":iso_date_from(signal_lab.get("next_cycle")),"source_ref":{"kind":"signal_lab"}})
    if twin:
        rows.append({"key":"twin","title":"Twin / Synthetic Worlds","stage":twin.get("current_prediction"),
                     "result":twin.get("last_outcome"),"next":"ожидается исход" if not twin.get("last_outcome") else None,
                     "next_date":iso_date_from(twin.get("outcome_due_at"),twin.get("expected_outcome_at"),twin.get("reveal_at")),
                     "source_ref":{"kind":"twin_state"}})
    return rows
def build():
    data={}; errors={}
    for name in URLS:
        try:data[name]=getj(name)
        except Exception as e: errors[name]=type(e).__name__+": "+str(e)[:120]
    temporal=data.get("temporal") or {}
    waiting,upcoming,predictions,reputation=temporal_projection(temporal)
    aw,au,ar=activity_projection(data.get("activity") or {},upcoming)
    waiting.extend(aw); upcoming.extend(au); reputation.extend(ar)
    predictions=prediction_projection(data.get("twin") or {},predictions)
    upcoming=sorted(upcoming,key=lambda x:(x.get("date") is None,x.get("date") or "9999"))
    sig=data.get("signals") or {}
    field=field_projection(sig)
    opportunities=opportunities_projection(sig,upcoming)
    patterns=pattern_projection(field,opportunities)
    return {"schema":"aiclavis.founder-radar.v0.3","generated_at":now(),"read_only":True,
      "source_errors":errors,
      "attention":attention_projection(data.get("inbox") or {},data.get("founder") or {}),
      "opportunities":opportunities,
      "waiting":waiting,"upcoming":upcoming,"predictions":predictions,
      "patterns":patterns,
      "field":field,
      "atlas_learning":learning_projection(data.get("signal_lab") or {},data.get("twin") or {}),
      "investment":investment_projection(data.get("investment")),"reputation":reputation,
      "sync_contract":{"branch_to_radar":"indirect_projection","activity_fields":["source_branch","event_type","human_change","why_it_matters","valid_at","evidence_ceiling","next_milestone"],"rule":"Branches publish normal Activity/Temporal state; Radar never requires a branch-specific write or manual copy.","timeline_sync":"Radar and Timeline render dates from the same source records; changing the source date changes both surfaces."},
      "rules":["Projection only; no radar item is canonical truth by itself.",
        "Dates are copied/extracted from canonical source fields or explicit dated source text.",
        "The same source date may be rendered in Radar and Timeline; Radar does not create a second deadline.",
        "Semantic similarity never creates branch identity.",
        "Agent network is excluded from Founder Radar and belongs to System."]}

class H(BaseHTTPRequestHandler):
    def sendj(self,obj,code=200):
        b=json.dumps(obj,ensure_ascii=False,indent=2).encode()
        self.send_response(code); self.send_header("Content-Type","application/json; charset=utf-8")
        self.send_header("Cache-Control","no-store"); self.send_header("Content-Length",str(len(b)))
        self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        p=self.path.split("?",1)[0]
        if p=="/health": return self.sendj({"ok":True,"service":"aiclavis-founder-radar","version":"0.2","read_only":True})
        if p=="/api/v1/founder-radar": return self.sendj(build())
        return self.sendj({"error":"not_found"},404)
    def log_message(self,*a): pass

if __name__=="__main__":
    ThreadingHTTPServer(("127.0.0.1",PORT),H).serve_forever()
