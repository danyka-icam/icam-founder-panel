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
 "company_profile":"http://127.0.0.1:8846/api/v1/company-eligibility-profile",
 "funding_projects":"http://127.0.0.1:8846/api/v1/funding-project-candidates",
 "commercial":"http://127.0.0.1:8083/founder-ui-preview/commercial/dashboard.json",
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

def radar_semantics(row,kind):
    x=dict(row or {}); ctx=x.get("context") or {}; title=str(x.get("title") or "")
    low=" ".join(str(v or "") for v in [title,ctx.get("world"),ctx.get("line"),ctx.get("branch")]).lower()
    translations={
      "External NIST consideration / no response required from system now.":"NIST рассматривает комментарий; сейчас от нас ничего не требуется.",
      "Outcome windows not yet resolved; first gate around 2026-10-13.":"Окна исходов ещё не разрешились; первая контрольная точка — около 13 октября 2026.",
      "Outcome windows not yet mature.":"Окна исходов ещё не созрели.",
      "External response / fresh status confirmation.":"Ждём внешний ответ или новое подтверждение статуса.",
      "External replies / opportunity creation.":"Ждём внешние ответы или появление возможности.",
      "External program decision/credits.":"Ждём внешнее решение программы или начисление кредитов."
    }
    x["title"]=translations.get(title,title)
    dest=None; next_step=None; why=x.get("why")
    if "forecast core" in low:
        dest={"kind":"research","label":"Forecast Core","route":"Дождаться контрольной точки → проверить исход по зафиксированному протоколу → обновить результат."}
        why=why or "Это открытая прогнозная точка: до наступления окна исход нельзя считать известным."
        d=iso_date_from(x.get("date"))
        x["radar_class"]="REVIEW" if d else "WATCH"
        next_step="В дату контрольной точки проверить только предусмотренный источник исхода; не подменять ожидание новым прогнозом."
    elif kind=="predictions" and "twin" in low:
        dest={"kind":"research","label":"Twin / Synthetic Worlds","route":"Сохранять запечатанный прогноз неизменным → дождаться исхода → оценить по протоколу."}
        why=why or "Запечатанный прогноз является контрольной точкой эксперимента; его нельзя трактовать как уже подтверждённый результат."
        x["radar_class"]="WATCH"
        next_step="Не менять запечатанный прогноз. Поднять карточку, когда появится предусмотренный источник исхода или дата раскрытия."
    elif kind=="predictions":
        dest={"kind":"research","label":"Прогнозный контур","route":"Дождаться предусмотренной точки проверки → сверить исход → зафиксировать результат."}
        why=why or "Это прогнозная точка наблюдения, а не подтверждённый исход."
        x["radar_class"]="WATCH"
        next_step="Ждать предусмотренную точку проверки; не повышать прогноз до факта."
    elif "научное присутствие" in low or "nist" in low:
        dest={"kind":"reputation","label":"Научное присутствие","route":"Следить за внешним ответом; новое действие создавать только при изменении статуса."}
        why=why or "Внешний научный контур уже запущен; сейчас важен новый подтверждённый ответ, а не повторное действие."
        x["radar_class"]="BACKGROUND" if "nothing is required" in low or "ничего не требуется" in x["title"].lower() else "WATCH"
        next_step="Не предпринимать повторных действий без нового внешнего сигнала."
    elif "выход на рынок" in low:
        dest={"kind":"commercial","label":"Коммерческий ATLAS / выход на рынок","route":"Ждать ответ → при новом внешнем событии вернуть объект в коммерческий контур."}
        why=why or "Контакт уже сделан; ценность следующего сигнала — в новом внешнем ответе или изменении статуса."
        x["radar_class"]="WATCH"; next_step="Не создавать повторный контакт только из-за тишины; поднять карточку при новом ответе или заранее заданном повторном контакте."
    elif "институциональные возможности" in low:
        dest={"kind":"institutional","label":"Институциональные возможности","route":"Ждать решение программы → при изменении статуса проверить последствия и следующий шаг."}
        why=why or "Заявка или внешний процесс уже находится у другой стороны."
        x["radar_class"]="WATCH"; next_step="Следить за официальным решением; до нового статуса не считать исход ни положительным, ни отрицательным."
    elif kind=="learning":
        dest={"kind":"research","label":"Обучение ATLAS","route":"Пройти следующую формальную контрольную точку исследовательского контура."}
        why=why or "Это состояние внутреннего цикла обучения и проверки ATLAS, а не внешний рыночный сигнал."
        d=iso_date_from(x.get("next_date") or x.get("date"))
        if d:
            try: days=(datetime.strptime(d,"%Y-%m-%d").date()-datetime.now(timezone.utc).date()).days
            except Exception: days=None
            x["radar_class"]="ACTION_NOW" if days is not None and 0 <= days <= 7 else "REVIEW"
        else: x["radar_class"]="WATCH"
        next_step="Проверить следующую контрольную точку по протоколу этого контура и не смешивать исследовательский результат с рыночным подтверждением."
    if dest: x["destination"]=dest
    if why: x["why"]=why
    if next_step: x["next_step_ru"]=next_step
    return x

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
def opportunity_fact_keys(row):
    title=str(row.get("title") or "").lower()
    if "nº 29/2026" in title or "no 29/2026" in title or "rhae ia" in title:
        return [
          "legal_entity_brazil","headquarters_brazil","administration_brazil","for_profit",
          "company_size_class","eligible_project_coordinator","coordinator_formal_company_link",
          "coordinator_lattes_current","cnpq_institution_directory_registered",
          "candidate_ai_project_defined","nib_mission_alignment","counterpart_20pct_capacity"
        ]
    if "tecnologias digitais" in title:
        return ["legal_entity_brazil","headquarters_brazil","for_profit","legal_form",
                "project_theme","trl_initial","trl_target"]
    if "semicondutores" in title:
        return ["legal_entity_brazil","legal_form","company_size_class","startup_legal_status",
                "annual_revenue_band_brl"]
    if "startups inovadoras" in title:
        return ["legal_entity_brazil","legal_form","startup_legal_status","annual_revenue_band_brl"]
    return []

def profile_gap(row,profile):
    facts=(profile or {}).get("facts") or {}
    keys=opportunity_fact_keys(row)
    checks=[]
    for k in keys:
        f=facts.get(k) or {"status":"UNKNOWN","value":None,"source_refs":[]}
        checks.append({"key":k,"status":str(f.get("status") or "UNKNOWN").upper(),
                       "value":f.get("value"),"source_refs":f.get("source_refs") or [],
                       "verified_at":f.get("verified_at")})
    verified=sum(1 for x in checks if x["status"]=="VERIFIED")
    conflicts=sum(1 for x in checks if x["status"]=="CONFLICT")
    unresolved=[x for x in checks if x["status"]!="VERIFIED"]
    return {
      "required_fact_keys":keys,"checks":checks,"required":len(keys),"verified":verified,
      "conflicts":conflicts,"unresolved":len(unresolved),
      "coverage_pct":round((verified/len(keys)*100),1) if keys else None,
      "next_fact_key":unresolved[0]["key"] if unresolved else None
    }

def evaluate_known_rules(row,gap):
    # This evaluator is deliberately narrow: it only applies rules explicitly
    # extracted into the current opportunity record. Unknown facts never pass.
    checks={x["key"]:x for x in gap.get("checks") or []}
    if not checks or any(x["status"]!="VERIFIED" for x in checks.values()):
        return {"status":"PENDING_PROFILE_FACTS","passed":None,"failures":[]}
    title=str(row.get("title") or "").lower()
    failures=[]
    def v(k): return checks[k].get("value") if k in checks else None
    if "rhae ia" in title or "29/2026" in title:
        for k in ["legal_entity_brazil","headquarters_brazil","administration_brazil","for_profit",
                  "eligible_project_coordinator","coordinator_formal_company_link","coordinator_lattes_current",
                  "cnpq_institution_directory_registered","candidate_ai_project_defined",
                  "nib_mission_alignment","counterpart_20pct_capacity"]:
            if v(k) is not True: failures.append(k)
        allowed={"MICRO","MICROEMPRESA","SMALL","PEQUENA","PEQUENA EMPRESA","STARTUP"}
        if str(v("company_size_class") or "").strip().upper() not in allowed: failures.append("company_size_class")
    elif "tecnologias digitais" in title:
        for k in ["legal_entity_brazil","headquarters_brazil","for_profit"]:
            if v(k) is not True: failures.append(k)
        excluded={"MEI","EMPRESARIO INDIVIDUAL","EMPRESÁRIO INDIVIDUAL","COOPERATIVA","NONPROFIT","SEM FINS LUCRATIVOS"}
        if str(v("legal_form") or "").strip().upper() in excluded: failures.append("legal_form")
        try:
            ti=float(v("trl_initial")); tt=float(v("trl_target"))
            if not (3 <= ti <= 8 and 3 <= tt <= 8): failures.extend(["trl_initial","trl_target"])
            if tt==8 and not (3 <= ti <= 6): failures.append("trl_initial")
        except Exception:
            failures.extend(["trl_initial","trl_target"])
        if not v("project_theme"): failures.append("project_theme")
    else:
        return {"status":"NO_FORMAL_EVALUATOR","passed":None,"failures":[]}
    failures=sorted(set(failures))
    return {"status":"PASS" if not failures else "FAIL","passed":not failures,"failures":failures}

def program_overlay(row, company_profile=None):
    title=str((row or {}).get("title") or "")
    if "Finep Mais Inovação Brasil - Rodada 2" in title and "Tecnologias Digitais" in title:
        return {
          "official_deadline_verified":{
            "value":"2026-10-14T17:00",
            "status":"VERIFIED_CURRENT_OFFICIAL_PAGE",
            "source_url":"https://www.finep.gov.br/e/chamada-publica/222684/755485"
          },
          "economics":{
            "funding_type":"NON_REPAYABLE_SUBSIDY",
            "finep_request_min_brl":5000000,
            "finep_request_max_simple_brl":25000000,
            "finep_request_max_network_brl":40000000,
            "micro_small_counterpart_pct_min":5,
            "estimated_min_total_project_brl_if_micro_small_simple":5263157.89,
            "estimated_min_counterpart_brl_if_micro_small_simple":263157.89,
            "basis":"official Finep Annex 1 / presentation"
          },
          "partnership":{
            "required":True,
            "minimum":"at least one ICT in simple arrangement",
            "network":"at least two Brazilian coexecuting companies plus at least one ICT",
            "status":"CONFIRMED_BY_OFFICIAL_ANNEX"
          },
          "candidate_project_fit":{
            "status":"STRONG_CANDIDATE_NOT_YET_VERIFIED",
            "theme":"Linha Temática 1.1 – Plataformas Nacionais para Operação e Escala de Sistemas de IA",
            "why":"Official line includes orchestration/management of multiple AI models and agents plus monitoring of performance, quality, security and reliability. Existing aiclavis artifacts demonstrate adjacent implemented architecture, but the grant project scope and TRL are not yet frozen.",
            "does_not_prove":["project eligibility","TRL 3-8","merit score","Brazilian-national-component preference"]
          },
          "effort_override":{"status":"HIGH","label":"высокие усилия: проект от R$ 5 млн + обязательная ICT + TRL/пакет"},
          "upside_override":{"status":"QUANTIFIED_HIGH","label":"не менее R$ 5 млн запрашиваемой безвозвратной субсидии"},
          "route_override":{"decision":"PARTNER","label":"искать ICT-партнёра параллельно с проверкой проекта",
                            "reason":"ICT обязательна даже для Arranjo Simples; это подтверждённая часть маршрута, а не предположение."}
        }
    return {}

def funding_funnel(row,company_profile=None):
    x=dict(row or {})
    overlay=program_overlay(x,company_profile or {})
    eligibility=str(x.get("eligibility_status") or "UNCHECKED").upper()
    gap=profile_gap(x,company_profile or {})
    rule_eval=evaluate_known_rules(x,gap)
    score=int(x.get("relevance_score") or 0)
    requirements=x.get("eligibility_requirements") or []
    missing=x.get("eligibility_missing_facts") or []
    text=" ".join(str(v or "") for v in [x.get("title"),x.get("program_type")," ".join(requirements)," ".join(missing)]).lower()

    # Strategic fit is intentionally preliminary until a canonical company profile
    # exists. Scanner relevance can support a hypothesis, never prove fit.
    if score >= 90:
        fit={"status":"STRONG_PRELIMINARY","label":"сильное предварительное","score":score,
             "basis":"SCANNER_RELEVANCE_ONLY"}
    elif score >= 80:
        fit={"status":"PLAUSIBLE","label":"вероятное","score":score,
             "basis":"SCANNER_RELEVANCE_ONLY"}
    elif score:
        fit={"status":"REVIEW","label":"нужно проверить","score":score,
             "basis":"SCANNER_RELEVANCE_ONLY"}
    else:
        fit={"status":"UNASSESSED","label":"не оценено","score":None,
             "basis":"NO_CANONICAL_COMPANY_PROFILE"}

    # Effort is a preparation estimate, not a cost claim.
    if (overlay.get("effort_override")):
        effort=overlay["effort_override"]
    elif eligibility=="NEEDS_CALL_DOCUMENT_REVIEW":
        effort={"status":"UNKNOWN_UNTIL_RULES","label":"неизвестно до разбора полного документа конкурса"}
    elif len(missing) >= 5:
        effort={"status":"HIGH","label":"высокие подготовительные усилия"}
    elif len(missing) >= 2:
        effort={"status":"MEDIUM","label":"средние подготовительные усилия"}
    else:
        effort={"status":"LOW_OR_UNKNOWN","label":"низкие или ещё не определены"}

    kind=str(x.get("program_type") or "").lower()
    if overlay.get("upside_override"):
        upside=overlay["upside_override"]
    elif any(k in kind for k in ["não reembolsável","grant","subven"]):
        upside={"status":"HIGH_POTENTIAL","label":"высокий потенциальный выигрыш",
                "basis":"NON_DILUTIVE_OR_GRANT_TYPE_AMOUNT_NOT_VERIFIED"}
    else:
        upside={"status":"UNKNOWN","label":"размер выигрыша не подтверждён",
                "basis":"AMOUNT_NOT_VERIFIED"}

    days=x.get("days_left")
    if days is None:
        deadline={"status":"UNKNOWN","label":"срок не извлечён","days_left":None}
    elif days <= 3:
        deadline={"status":"CRITICAL","label":"критично","days_left":days}
    elif days <= 14:
        deadline={"status":"NEAR","label":"близко","days_left":days}
    elif days <= 45:
        deadline={"status":"ACTIVE","label":"есть время","days_left":days}
    else:
        deadline={"status":"DISTANT","label":"не срочно","days_left":days}

    partner_terms=["universidade","university","parceria","parceiro","parceira","partner","consórc","consorc"]
    partner_signal=any(k in text for k in partner_terms)
    if eligibility=="NOT_ELIGIBLE":
        stage="ELIGIBILITY"; decision="DROP"; decision_label="отбросить"
        reason="Критерий допуска не пройден по подтверждённым данным."
    elif eligibility=="ELIGIBLE":
        stage="STRATEGIC_FIT"
        if partner_signal:
            decision="PARTNER"; decision_label="искать партнёра"
            reason="Допуск подтверждён, но структура программы указывает на партнёрский контур."
        elif fit["status"]=="STRONG_PRELIMINARY":
            decision="APPLY"; decision_label="готовить подачу"
            reason="Допуск подтверждён и предварительное стратегическое соответствие сильное; перед подачей проверить effort/upside."
            stage="EFFORT_UPSIDE"
        else:
            decision="WATCH"; decision_label="проверить соответствие"
            reason="Допуск подтверждён, но стратегическое соответствие ещё недостаточно сильное для решения о подаче."
    else:
        stage="ELIGIBILITY"; decision="WATCH"; decision_label="снять блокер допуска"
        if partner_signal:
            reason="Сначала проверить правила допуска и роль партнёра; партнёрство не считать обязательным, пока это не подтверждено документом."
        else:
            reason="Сначала снять юридический/организационный блокер допуска; до этого решение APPLY запрещено."

    profile_next=gap.get("next_fact_key")
    blocker=(("Company Eligibility Profile: "+profile_next) if profile_next else (missing[0] if missing else x.get("eligibility_next_check")))
    if overlay.get("route_override") and eligibility!="NOT_ELIGIBLE":
        rr=overlay["route_override"]
        decision=rr["decision"]; decision_label=rr["label"]; reason=rr["reason"]
    readiness=(company_profile or {}).get("readiness") or {}
    # Company readiness status is advisory only unless a program-specific rule
    # explicitly makes it an eligibility condition. Do not infer ineligibility
    # from CNPJ status alone.
    if rule_eval.get("status")=="FAIL":
        decision="DROP"; decision_label="отбросить"; stage="ELIGIBILITY"
        reason="Подтверждённые факты профиля не проходят формализованные условия допуска этой программы."
    checks={
      "found":{"status":"PASS","label":"найдено"},
      "eligibility":{"status":"PASS" if eligibility=="ELIGIBLE" else "FAIL" if eligibility=="NOT_ELIGIBLE" else "PENDING",
                     "label":eligibility},
      "strategic_fit":{"status":"PRELIMINARY" if fit["status"]!="UNASSESSED" else "PENDING","label":fit["label"]},
      "effort_upside":{"status":"PRELIMINARY","label":effort["label"]+" · "+upside["label"]},
      "deadline":{"status":deadline["status"],"label":deadline["label"]},
      "decision":{"status":decision,"label":decision_label}
    }
    x.update({
      "funnel_stage":stage,
      "funnel_checks":checks,
      "strategic_fit":fit,
      "effort":effort,
      "upside":upside,
      "deadline_pressure":deadline,
      "route_decision":decision,
      "route_decision_label":decision_label,
      "route_decision_reason":reason,
      "blocking_fact":blocker,
      "partner_signal_unverified":partner_signal and eligibility!="ELIGIBLE",
      "company_profile_gap":gap,
      "known_rule_evaluation":rule_eval,
      "program_overlay":overlay,
      "applicant_readiness_advisory":{
        "status":readiness.get("blocking_status"),
        "application_ready":readiness.get("application_ready"),
        "as_of":readiness.get("as_of"),
        "note":"Информационный риск. Не влияет на eligibility без явного требования конкретной программы."
      },
      "funnel_rule":"FOUND → ELIGIBILITY → STRATEGIC FIT → EFFORT/UPSIDE → DEADLINE → APPLY / PARTNER / WATCH / DROP"
    })
    return x

def opportunities_projection(signals,upcoming,company_profile=None):
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
            why += " Окно подтверждено, но полный документ конкурса ещё нужно разобрать до проверки соответствия компании."
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
        item={
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
        }
        out.append(funding_funnel(item,company_profile))

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
            out.append(funding_funnel({"radar_id":item_id("opp",s.get("signal_id")),
                        "title":s.get("title") or s.get("entity") or "Внешняя возможность",
                        "kind":"market_signal","date":iso_date_from(s.get("deadline"),s.get("observed_at")),
                        "why":enr.get("why_it_matters_ru") or s.get("why_it_matters_ru"),
                        "status":action or "watch","source":s.get("source"),
                        "source_ref":{"kind":"market_signal","signal_id":s.get("signal_id")}},company_profile))
    for x in upcoming:
        blob=" ".join(str(z or "") for z in [x.get("title"),(x.get("context") or {}).get("line"),(x.get("context") or {}).get("branch")]).lower()
        if re.search(r"conference|конферен|tender|тендер|grant|грант|application|заявк|program|программ|outreach|партн|partner",blob):
            out.append(funding_funnel({**x,"radar_id":item_id("opp-date",x.get("radar_id")),"kind":"dated_opportunity"},company_profile))
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
      "PAT-CLOSED-LOOP-AUTONOMY",
      "Замкнутый автономный контур: наблюдение → решение → воздействие → обратная связь",
      hits(lambda b,x: any(k in b for k in ["self-healing","autonomous remediation","autonomous class aware optimization","closed-loop experiment","failure prediction and prevention"])),
      "closed-loop-autonomy",
      "В разных предметных областях повторяется механизм, где система не только наблюдает состояние, но и замыкает цикл через автономную оптимизацию, исправление или проверяемое воздействие.",
      "Это архитектурная повторяемость в исследовательском поле. Она не доказывает переносимость механизма в ATLAS, безопасность автономного действия, экономический эффект или готовность рынка.",
      {"kind":"research","label":"Исследовательский ATLAS / замкнутые контуры решений","route":"Сравнить, где находится состояние системы, кто имеет право действовать, как проверяется действие и как результат возвращается в следующую итерацию."}
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
          "next_step_ru":"Собрать единый короткий список программ после проверки допуска, а не разбирать каждую как изолированную карточку.",
          "signals":[{"radar_id":x.get("radar_id"),"title":x.get("title"),"date":x.get("date"),"eligibility_status":x.get("eligibility_status"),"source_url":x.get("opportunity_url")} for x in open_opps[:12]]
        })
    order={"OPEN_CORRIDOR":0,"EMERGING_PATTERN":1}
    patterns.sort(key=lambda x:(order.get(x.get("status"),9),-int(x.get("signal_count") or 0),x.get("title") or ""))
    return patterns

def movement_projection(opportunities, field, waiting, commercial):
    items=[]
    nowd=datetime.now(timezone.utc).date()
    def add(domain,title,state,source_ref,next_step=None,route=None,date=None,priority="NORMAL",meta=None):
        items.append({
          "movement_id":item_id("move",domain,title,(source_ref or {}).get("kind"),(source_ref or {}).get("signal_id"),(source_ref or {}).get("id")),
          "domain":domain,"title":title,"state":state,"next_step":next_step,"route":route,
          "date":date,"priority":priority,"source_ref":source_ref or {},"meta":meta or {}
        })
    # Institutional / research funding doors
    for x in opportunities or []:
        if x.get("kind") not in {"official_opportunity","dated_opportunity"}: continue
        rc=str(x.get("radar_class") or "WATCH").upper()
        decision=str(x.get("route_decision") or "WATCH").upper()
        elig=str(x.get("eligibility_status") or "UNCHECKED").upper()
        if decision=="DROP": state="CLOSED"
        elif rc=="ACTION_NOW": state="ACTION_DUE"
        elif decision in {"APPLY","PARTNER"}: state="ROUTE_IDENTIFIED"
        elif elig in {"NEEDS_COMPANY_FACTS","NEEDS_CALL_DOCUMENT_REVIEW","ELIGIBLE"}: state="QUALIFIED"
        else: state="DETECTED"
        add("research_funding",x.get("title") or "Возможность",state,x.get("source_ref"),
            x.get("next_step_ru"),(x.get("destination") or {}).get("route"),x.get("date"),
            "HIGH" if rc=="ACTION_NOW" else "NORMAL",
            {"route_decision":decision,"eligibility_status":elig,"days_left":x.get("days_left")})
    # External field — only actionable/review/watch signals, background is noise for movement.
    for x in ((field or {}).get("signals") or []):
        cls=str(x.get("radar_class") or "BACKGROUND").upper()
        if cls=="BACKGROUND": continue
        dest=x.get("destination") or {}
        routed=bool(dest.get("kind") and dest.get("kind")!="radar")
        if cls=="ACTION_NOW": state="ACTION_DUE"
        elif cls=="REVIEW": state="ROUTE_IDENTIFIED" if routed else "QUALIFIED"
        else: state="DETECTED"
        dom="field"
        if dest.get("kind")=="research": dom="research_field"
        elif dest.get("kind") in {"commercial","market"}: dom="commercial_signal"
        add(dom,x.get("title") or "Сигнал",state,x.get("source_ref"),x.get("next_step_ru"),dest.get("route"),
            iso_date_from(x.get("published_at"),x.get("observed_at")),"HIGH" if cls=="ACTION_NOW" else "NORMAL",
            {"radar_class":cls,"destination":dest.get("label"),"repeat_count":x.get("repeat_count")})
    # Explicit external waits.
    for x in waiting or []:
        add("external_wait",x.get("title") or "Ожидание","WAITING_EXTERNAL",x.get("source_ref"),
            x.get("next_step_ru"),(x.get("destination") or {}).get("route"),x.get("date"),"NORMAL",
            {"context":x.get("context") or {}})
    # Commercial truth stays owned by commercial dashboard.
    c=commercial or {}
    manual=c.get("manual_queue") or []
    for x in manual:
        add("commercial",x.get("company") or x.get("item_id") or "Коммерческая дверь","ACTION_DUE",
            {"kind":"commercial_manual","id":x.get("item_id")},
            x.get("action_label") or x.get("next") or x.get("reason"),x.get("route"),iso_date_from(x.get("deadline")),
            "HIGH",{"product":x.get("product_name"),"why_now":x.get("why_now"),"kind":x.get("kind")})
    live_ids=set()
    for x in c.get("waiting_live") or []:
        live_ids.add(str(x.get("case_id") or x.get("id") or ""))
        due=iso_date_from(x.get("followup_due_at"))
        state="WAITING_EXTERNAL"
        priority="NORMAL"
        if due:
            try:
                if datetime.strptime(due,"%Y-%m-%d").date() <= nowd: state="ACTION_DUE"; priority="HIGH"
            except Exception: pass
        add("commercial",x.get("company") or x.get("case_id") or "Коммерческая дверь",state,
            {"kind":"commercial_case","id":x.get("case_id") or x.get("id")},
            ("Повторный контакт по расписанию" if state=="ACTION_DUE" else "Ждём ответ рынка"),
            x.get("channel") or x.get("send_mode"),due,priority,{"product":x.get("product_name"),"sent_at":x.get("sent_at")})
    for p in c.get("products") or []:
        for x in p.get("items") or []:
            xid=str(x.get("id") or "")
            if xid and xid in live_ids: continue
            stage=str(x.get("stage") or x.get("status") or "").upper()
            source_kind=str(x.get("_source_kind") or "")
            if source_kind=="handoff_seed":
                state="REFERENCE_ONLY"
            elif stage in {"NO_GO","CLOSED","DROP"}: state="CLOSED"
            elif stage in {"HOLD","DEFER","WATCH","WATCH_POST_AWARD"}: state="PARKED"
            elif stage in {"WAITING","SUBMITTED","SENT"}: state="WAITING_EXTERNAL"
            elif stage in {"REPLIED","CONVERSATION","PROPOSAL","PROPOSAL_SENT"}: state="IN_MOTION"
            else: continue
            add("commercial",x.get("company") or xid or "Коммерческая дверь",state,
                {"kind":"commercial_case","id":xid},x.get("next"),x.get("route"),
                iso_date_from(x.get("followup_due_at"),x.get("deadline")),"NORMAL",
                {"product":p.get("name"),"stage":stage,"source_kind":x.get("_source_kind")})
    # De-duplicate identical source objects while keeping higher movement urgency.
    rank={"ACTION_DUE":0,"IN_MOTION":1,"ROUTE_IDENTIFIED":2,"QUALIFIED":3,"WAITING_EXTERNAL":4,"DETECTED":5,"PARKED":6,"REFERENCE_ONLY":7,"CLOSED":8}
    dedup={}
    for x in items:
        ref=x.get("source_ref") or {}
        k=(x.get("domain"),ref.get("kind"),ref.get("id") or ref.get("signal_id") or x.get("title"))
        prev=dedup.get(k)
        if prev is None or rank.get(x.get("state"),99)<rank.get(prev.get("state"),99): dedup[k]=x
    items=list(dedup.values())
    counts={k:sum(1 for x in items if x.get("state")==k) for k in rank}
    active=[x for x in items if x.get("state") not in {"CLOSED","PARKED","REFERENCE_ONLY"}]
    gaps=[]
    for x in active:
        if x.get("state") in {"QUALIFIED","ROUTE_IDENTIFIED","IN_MOTION","ACTION_DUE"} and not x.get("next_step"):
            gaps.append({**x,"gap":"NO_NEXT_STEP"})
        elif x.get("state")=="QUALIFIED" and not x.get("route"):
            gaps.append({**x,"gap":"NO_ROUTE"})
    domains={}
    for x in items:
        d=x.get("domain")
        domains.setdefault(d,{"total":0,"action_due":0,"waiting_external":0,"in_motion":0,"gaps":0})
        domains[d]["total"]+=1
        if x.get("state")=="ACTION_DUE": domains[d]["action_due"]+=1
        if x.get("state")=="WAITING_EXTERNAL": domains[d]["waiting_external"]+=1
        if x.get("state") in {"IN_MOTION","ROUTE_IDENTIFIED"}: domains[d]["in_motion"]+=1
    for g in gaps:
        if g.get("domain") in domains: domains[g["domain"]]["gaps"]+=1
    items.sort(key=lambda x:(rank.get(x.get("state"),99),x.get("date") is None,x.get("date") or "9999",x.get("title") or ""))
    return {
      "contract":"aiclavis.movement-layer.v0.1",
      "states":["DETECTED","QUALIFIED","ROUTE_IDENTIFIED","IN_MOTION","WAITING_EXTERNAL","ACTION_DUE","CLOSED","PARKED","REFERENCE_ONLY"],
      "counts":counts,"domains":domains,"active_total":len(active),"movement_gaps":gaps[:20],
      "items":items[:160],
      "rule":"Movement Layer is a read-only cross-domain projection. Domain systems remain canonical owners; this layer may expose missing movement but never invent or mutate route/owner/next-step."
    }

def movement_execution_classification(item):
    state=str((item or {}).get("state") or "")
    domain=str((item or {}).get("domain") or "")
    meta=(item or {}).get("meta") or {}
    # Founder involvement is explicit and narrow. The movement layer never
    # invents authority; it only classifies the next transition.
    if domain=="commercial":
        kind=str(meta.get("kind") or "")
        if kind in {"MANUAL_FORM","MANUAL_CONTACT_RESEARCH","VERIFY_SENT"} or state=="ACTION_DUE":
            return {"class":"FOUNDER","label":"требует Основателя",
                    "reason":"Следующий коммерческий шаг находится на ручной границе или требует явного подтверждения."}
        if state=="WAITING_EXTERNAL":
            return {"class":"AUTO","label":"система наблюдает",
                    "reason":"Ход у внешней стороны; система должна следить за ответом/follow-up без ручного вмешательства."}
    if domain=="research_funding":
        if state=="ACTION_DUE":
            return {"class":"SYSTEM_REVIEW","label":"сначала системный разбор",
                    "reason":"Срок близко, но до действия нужно снять подтверждённые блокеры допуска/маршрута; это не автоматически решение Основателя."}
        if state in {"QUALIFIED","ROUTE_IDENTIFIED","DETECTED"}:
            return {"class":"SYSTEM_REVIEW","label":"системный разбор",
                    "reason":"Следующий переход — квалификация или маршрутизация по правилам программы."}
    if domain in {"research_field","field","commercial_signal"}:
        if state in {"DETECTED","QUALIFIED","ROUTE_IDENTIFIED"}:
            return {"class":"AUTO" if state=="ROUTE_IDENTIFIED" else "SYSTEM_REVIEW",
                    "label":"система может продвинуть" if state=="ROUTE_IDENTIFIED" else "нужен системный разбор",
                    "reason":"Это внешний сигнал; содержательная квалификация и передача в владеющий контур не требуют решения Основателя по умолчанию."}
    if domain=="external_wait" or state=="WAITING_EXTERNAL":
        return {"class":"AUTO","label":"система наблюдает",
                "reason":"Это внешнее ожидание; ручное действие не требуется до нового сигнала или наступившего follow-up."}
    return {"class":"SYSTEM_REVIEW","label":"нужен системный разбор",
            "reason":"Безопасный автоматический переход не доказан; сначала требуется системная проверка."}

def movement_flow_projection(movement, opportunities, field, commercial):
    items=(movement or {}).get("items") or []
    # This is a throughput/control projection, not a success score.
    # "entered" means present in the live movement layer; "qualified" means
    # enough evidence exists to merit a route; "handed_off" means an explicit
    # route/action state exists; "external_result" requires an observed external
    # response/submission/outcome, never inference.
    streams={
      "research_funding":{"label":"Исследования / финансирование","domains":{"research_funding"}},
      "field":{"label":"Движение поля","domains":{"research_field","field","commercial_signal"}},
      "commercial":{"label":"Коммерческие двери","domains":{"commercial"}}
    }
    out={}
    for key,cfg in streams.items():
        xs=[x for x in items if x.get("domain") in cfg["domains"] and x.get("state")!="REFERENCE_ONLY"]
        entered=len(xs)
        qualified=sum(1 for x in xs if x.get("state") in {"QUALIFIED","ROUTE_IDENTIFIED","IN_MOTION","WAITING_EXTERNAL","ACTION_DUE","CLOSED","PARKED"})
        handed=sum(1 for x in xs if x.get("state") in {"ROUTE_IDENTIFIED","IN_MOTION","WAITING_EXTERNAL","ACTION_DUE","CLOSED"})
        external=sum(1 for x in xs if x.get("state") in {"WAITING_EXTERNAL","CLOSED"})
        action_due=sum(1 for x in xs if x.get("state")=="ACTION_DUE")
        detected_only=sum(1 for x in xs if x.get("state")=="DETECTED")
        qual_not_handed=sum(1 for x in xs if x.get("state")=="QUALIFIED")
        route_not_motion=sum(1 for x in xs if x.get("state")=="ROUTE_IDENTIFIED")
        out[key]={
          "label":cfg["label"],"entered":entered,"qualified":qualified,"handed_off":handed,
          "external_result_or_wait":external,"action_due":action_due,
          "leakage":{"detected_not_qualified":detected_only,
                     "qualified_not_handed_off":qual_not_handed,
                     "route_identified_not_in_motion":route_not_motion}
        }

    # Commercial has richer canonical truth; replace the coarse external-result
    # proxy with direct observed states from the commercial dashboard.
    c=commercial or {}
    products=c.get("products") or []
    replied=submitted=proposal=paid=0
    live_runtime=0
    for p in products:
        for x in p.get("items") or []:
            if x.get("_source_kind")=="live_runtime": live_runtime+=1
            st=str(x.get("stage") or x.get("status") or "").upper()
            rs=str(x.get("reply_status") or "").upper()
            ps=str(x.get("proposal_status") or "").upper()
            if rs and rs!="AUTO_REPLY" or st in {"REPLIED","CONVERSATION"}: replied+=1
            if st=="SUBMITTED" or str(x.get("status") or "").upper()=="SUBMITTED": submitted+=1
            if st in {"PROPOSAL","PROPOSAL_SENT"} or ps: proposal+=1
            if st=="PAID" or str(x.get("status") or "").upper()=="PAID": paid+=1
    if "commercial" in out:
        out["commercial"]["observed_outcomes"]={
          "replies":replied,"submissions":submitted,"proposals":proposal,"paid":paid,
          "live_runtime_records":live_runtime
        }

    # Funding outcomes are explicit route decisions / external waits, not success.
    opps=opportunities or []
    out["research_funding"]["route_decisions"]={
      k:sum(1 for x in opps if str(x.get("route_decision") or "").upper()==k)
      for k in ["APPLY","PARTNER","WATCH","DROP"]
    }

    # Field result is intentionally conservative: a routed research signal does
    # not count as an external outcome just because it has a destination.
    frows=((field or {}).get("signals") or [])
    out["field"]["attention_mix"]={
      k:sum(1 for x in frows if str(x.get("radar_class") or "").upper()==k)
      for k in ["ACTION_NOW","REVIEW","WATCH","BACKGROUND"]
    }

    bottlenecks=[]
    bottleneck_queue=[]
    for k,v in out.items():
        l=v.get("leakage") or {}
        if l.get("qualified_not_handed_off",0):
            bottlenecks.append({"stream":k,"kind":"QUALIFIED_NOT_HANDED_OFF","count":l["qualified_not_handed_off"],
                                "message":"Квалифицировано, но ещё не передано в работу."})
        if l.get("route_identified_not_in_motion",0):
            bottlenecks.append({"stream":k,"kind":"ROUTE_NOT_IN_MOTION","count":l["route_identified_not_in_motion"],
                                "message":"Направление определено, но фактическое движение не подтверждено."})
        if l.get("detected_not_qualified",0):
            bottlenecks.append({"stream":k,"kind":"DETECTED_NOT_QUALIFIED","count":l["detected_not_qualified"],
                                "message":"Входы обнаружены, но ещё не квалифицированы."})
    # Concrete queue: show the exact objects behind aggregate bottlenecks.
    for x in items:
        st=x.get("state")
        if st=="QUALIFIED":
            bottleneck_queue.append({**x,"bottleneck_kind":"QUALIFIED_NOT_HANDED_OFF",
                                     "required_move":"Назначить явный маршрут / решение: работать, партнёр, наблюдать или отбросить."})
        elif st=="ROUTE_IDENTIFIED":
            bottleneck_queue.append({**x,"bottleneck_kind":"ROUTE_NOT_IN_MOTION",
                                     "required_move":"Подтвердить передачу во владеющий контур или вернуть в наблюдение."})
        elif st=="DETECTED":
            bottleneck_queue.append({**x,"bottleneck_kind":"DETECTED_NOT_QUALIFIED",
                                     "required_move":"Провести первичную квалификацию: релевантность, доказательства, срок, возможный маршрут."})
    bq_rank={"ACTION_DUE":0,"QUALIFIED":1,"ROUTE_IDENTIFIED":2,"DETECTED":3}
    for x in bottleneck_queue:
        x["execution"]=movement_execution_classification(x)
    bottleneck_queue.sort(key=lambda x:(
        {"FOUNDER":0,"SYSTEM_REVIEW":1,"AUTO":2}.get((x.get("execution") or {}).get("class"),9),
        0 if x.get("priority")=="HIGH" else 1,
        x.get("date") is None,x.get("date") or "9999",
        bq_rank.get(x.get("state"),9),x.get("title") or ""))
    bottlenecks.sort(key=lambda x:-int(x.get("count") or 0))
    execution_counts={"FOUNDER":0,"SYSTEM_REVIEW":0,"AUTO":0}
    for x in bottleneck_queue:
        c=(x.get("execution") or {}).get("class")
        if c in execution_counts: execution_counts[c]+=1
    return {
      "contract":"aiclavis.movement-flow.v0.2",
      "streams":out,
      "bottlenecks":bottlenecks,
      "bottleneck_queue":bottleneck_queue[:40],
      "execution_counts":execution_counts,
      "rule":"No synthetic conversion score. Every stage is counted from explicit live movement or domain state; external outcomes require observed external state."
    }

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

    # The Founder radar is a routing surface, not a dump of every read model.
    # Forecast waits live in the forecast lane; panel plumbing and lab-internal
    # maintenance belong to System/Diagnostics rather than the Founder waiting lane.
    clean_wait=[]
    for x in waiting:
        ctx=x.get("context") or {}; low=" ".join(str(v or "") for v in [x.get("title"),ctx.get("world"),ctx.get("line"),ctx.get("branch")]).lower()
        if "forecast core" in low or re.search(r"outcome windows|forecast|прогноз",low):
            continue
        if (x.get("source_ref") or {}).get("kind")=="activity_event" and any(k in low for k in ["founder-panel","synthetic business world lab"]):
            continue
        clean_wait.append(radar_semantics(x,"waiting"))
    waiting=clean_wait

    predictions=[radar_semantics(x,"predictions") for x in predictions]
    upcoming=sorted(upcoming,key=lambda x:(x.get("date") is None,x.get("date") or "9999"))

    # Reputation is intentionally narrower than commercial outreach: only the
    # scientific/external-presence contour belongs here. Commercial waits remain
    # visible in the waiting lane and their owning commercial route.
    reputation=[radar_semantics(x,"reputation") for x in reputation
                if "научное присутствие" in str((x.get("context") or {}).get("line") or "").lower()]

    sig=data.get("signals") or {}
    field=field_projection(sig)
    opportunities=opportunities_projection(sig,upcoming,data.get("company_profile") or {})
    fp=(data.get("funding_projects") or {}).get("projects") or []
    for o in opportunities:
        title=str(o.get("title") or "")
        match=None
        for pr in fp:
            if str(pr.get("opportunity_match") or "") in title:
                match=pr; break
        if match:
            o["funding_project_candidate"]=match
    patterns=pattern_projection(field,opportunities)
    movement=movement_projection(opportunities,field,waiting,data.get("commercial") or {})
    movement_flow=movement_flow_projection(movement,opportunities,field,data.get("commercial") or {})
    critical_sources=["signals","commercial","temporal","activity"]
    degraded=[{"source":k,"error":errors.get(k)} for k in critical_sources if errors.get(k)]
    coverage=(field or {}).get("source_coverage") or {}
    limited=[]
    if coverage.get("total_sources") is not None and coverage.get("ok_count") is not None and coverage.get("ok_count") < coverage.get("total_sources"):
        failing=coverage.get("failing") or []
        unexpected=[f for f in failing if not f.get("known_degraded")]
        expected=[f for f in failing if f.get("known_degraded")]
        if unexpected:
            degraded.append({"source":"market_scanner_coverage","error":str(coverage.get("ok_count"))+"/"+str(coverage.get("total_sources"))+" sources healthy","failing":unexpected})
        if expected:
            limited.append({"source":"market_scanner_coverage","note":"known external access limits","failing":expected})
    movement["source_guard"]={
      "status":"DEGRADED" if degraded else ("LIMITED" if limited else "HEALTHY"),
      "degraded":degraded,
      "limited":limited,
      "critical_sources":critical_sources,
      "commercial_generated_at":(data.get("commercial") or {}).get("generated_at"),
      "market_source_coverage":coverage
    }
    gap_counts={}
    for o in opportunities:
        for c in ((o.get("company_profile_gap") or {}).get("checks") or []):
            if c.get("status")!="VERIFIED":
                gap_counts[c.get("key")]=gap_counts.get(c.get("key"),0)+1
    profile=data.get("company_profile") or {}
    funding_profile={
      "profile_schema":profile.get("schema"),
      "entity_id":profile.get("entity_id"),
      "entity_label":profile.get("entity_label"),
      "entity_role":profile.get("entity_role"),
      "relationship_to_aiclavis":profile.get("relationship_to_aiclavis"),
      "readiness":profile.get("readiness") or {},
      "profile_summary":profile.get("summary") or {},
      "top_unresolved_facts":[{"key":k,"blocked_opportunities":n} for k,n in sorted(gap_counts.items(),key=lambda kv:(-kv[1],kv[0]))],
      "rule":"Only VERIFIED profile facts may satisfy eligibility. UNKNOWN never passes."
    }
    return {"schema":"aiclavis.founder-radar.v0.16","generated_at":now(),"read_only":True,
      "source_errors":errors,
      "attention":attention_projection(data.get("inbox") or {},data.get("founder") or {}),
      "opportunities":opportunities,
      "funding_profile":funding_profile,
      "waiting":waiting,"upcoming":upcoming,"predictions":predictions,
      "patterns":patterns,
      "movement":movement,
      "movement_flow":movement_flow,
      "field":field,
      "atlas_learning":[radar_semantics(x,"learning") for x in learning_projection(data.get("signal_lab") or {},data.get("twin") or {})],
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
        if p=="/health": return self.sendj({"ok":True,"service":"aiclavis-founder-radar","version":"0.16","read_only":True})
        if p=="/api/v1/founder-radar": return self.sendj(build())
        return self.sendj({"error":"not_found"},404)
    def log_message(self,*a): pass

if __name__=="__main__":
    ThreadingHTTPServer(("127.0.0.1",PORT),H).serve_forever()
