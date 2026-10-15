#!/usr/bin/env python3
import argparse,hashlib,html,json,re,time,urllib.request,xml.etree.ElementTree as ET
from datetime import datetime,timezone,timedelta
from html.parser import HTMLParser
from pathlib import Path
ROOT=Path(__file__).resolve().parent
CFG=ROOT/"MARKET_SCANNER_SOURCE_MAP_v0.1.json"; STATE=ROOT/"market_scanner_state.json"; OUT=ROOT/"market_signals_outbox.jsonl"; LEDGER=ROOT/"market_scanner_run_ledger.jsonl"
def now(): return datetime.now(timezone.utc).isoformat()
def norm(s): return re.sub(r"\s+"," ",html.unescape(s or "")).strip()
def load(p,d):
    try:return json.loads(p.read_text(encoding="utf-8"))
    except:return d
def save(p,o):
    t=p.with_suffix(p.suffix+".tmp");t.write_text(json.dumps(o,ensure_ascii=False,indent=2),encoding="utf-8");t.replace(p)
def add(p,o):
    with p.open("a",encoding="utf-8") as f:f.write(json.dumps(o,ensure_ascii=False)+"\n")
def fetch(url):
    q=urllib.request.Request(url,headers={"User-Agent":"ATLAS-Market-Scanner/0.1","Accept-Language":"en,ru;q=.7"})
    with urllib.request.urlopen(q,timeout=25) as r:return r.read().decode(r.headers.get_content_charset() or "utf-8",errors="replace")
def fetch_json_post(url,body):
    q=urllib.request.Request(url,data=json.dumps(body).encode("utf-8"),headers={"User-Agent":"ATLAS-Market-Scanner/0.2","Content-Type":"application/json","Accept":"application/json"})
    with urllib.request.urlopen(q,timeout=35) as r:return json.loads(r.read().decode("utf-8",errors="replace"))
def mtext(v):
    if isinstance(v,str):return norm(v)
    if isinstance(v,dict):
        for k in ("eng","en","ENG"):
            if v.get(k): return norm(v.get(k) if isinstance(v.get(k),str) else " ".join(v.get(k)))
        for x in v.values():
            if isinstance(x,str) and x.strip(): return norm(x)
            if isinstance(x,list) and x: return norm(" ".join(str(y) for y in x))
    if isinstance(v,list):return norm(" ".join(str(x) for x in v))
    return norm(str(v or ""))
def tedapi(s):
    lookback=max(1,int(s.get("lookback_days") or 7))
    since=(datetime.now(timezone.utc)-timedelta(days=lookback)).strftime("%Y%m%d")
    qterms=[str(x).replace('"','') for x in (s.get("query_terms") or s.get("watch_terms") or []) if str(x).strip()]
    expr=" OR ".join('FT = "'+x+'"' for x in qterms[:20]) or 'FT = "artificial intelligence"'
    query="PD >= "+since+" AND ("+expr+")"
    body={"query":query,"fields":["publication-number","notice-title","buyer-name","publication-date"],"page":1,"limit":int(s.get("limit") or 100),"scope":"ALL","checkQuerySyntax":False,"paginationMode":"PAGE_NUMBER"}
    data=fetch_json_post(s["url"],body)
    entries=[]
    for x in data.get("notices",[]) or []:
        nid=str(x.get("publication-number") or "").strip()
        if not nid: continue
        title=mtext(x.get("notice-title")) or nid
        title_terms=[str(v) for v in (s.get("title_terms") or []) if str(v).strip()]
        if title_terms:
            hit=False
            for term in title_terms:
                if term=="AI":
                    if re.search(r"\bAI\b",title): hit=True; break
                elif term.lower() in title.lower():
                    hit=True; break
            if not hit: continue
        buyer=mtext(x.get("buyer-name"))
        published=str(x.get("publication-date") or "")
        links=x.get("links") or {}
        htmls=links.get("html") or links.get("htmlDirect") or {}
        url=htmls.get("ENG") or htmls.get("eng") or ("https://ted.europa.eu/en/notice/-/detail/"+nid)
        entries.append({"id":nid,"title":title,"buyer":buyer,"published":published,"url":url})
    dedup={}
    for e in entries:
        k=re.sub(r"\s+"," ",str(e.get("title") or "").strip().lower())
        if k not in dedup or str(e.get("published") or "")>str(dedup[k].get("published") or ""): dedup[k]=e
    entries=list(dedup.values())
    entries.sort(key=lambda x:str(x.get("published") or ""),reverse=True)
    return {"entries":entries[:int(s.get("limit") or 100)],"query":query,"total":data.get("totalNoticeCount") or data.get("total")}
class P(HTMLParser):
    def __init__(self):super().__init__(convert_charrefs=True);self.skip=0;self.parts=[];self.links=[];self.href=None;self.lp=[]
    def handle_starttag(self,t,a):
        if t in {"script","style","noscript","svg"}:self.skip+=1
        if self.skip:return
        if t=="a":self.href=dict(a).get("href");self.lp=[]
    def handle_endtag(self,t):
        if t in {"script","style","noscript","svg"} and self.skip:self.skip-=1;return
        if t=="a" and self.href is not None:
            x=norm(" ".join(self.lp))
            if x:self.links.append({"text":x,"href":self.href})
            self.href=None
    def handle_data(self,d):
        if self.skip:return
        s=norm(d)
        if s:self.parts.append(s);self.lp.append(s) if self.href is not None else None
def terms(text,watch):return sorted({t for t in watch if t.lower() in text.lower()})
def htmlsnap(raw,s):
    p=P();p.feed(raw);text=norm(" ".join(p.parts));ts=terms(text,s.get("watch_terms",[]))
    links=[x for x in p.links if terms((x["text"]+" "+str(x["href"])),s.get("watch_terms",[]))][:100]
    prices=[]
    if "pricing" in s.get("axis",[]):
        for m in re.finditer(r"(?:\$|£|€)\s?[\d][\d,\.]*",text):
            if m.group(0) not in prices:prices.append(m.group(0))
    obj={"terms":ts,"links":links,"prices":prices[:30]}
    obj["semantic_hash"]=hashlib.sha256(json.dumps(obj,sort_keys=True).encode()).hexdigest();return obj
def arxiv(raw,s):
    ns={"a":"http://www.w3.org/2005/Atom"};r=ET.fromstring(raw);es=[]
    for e in r.findall("a:entry",ns):
        title=norm(e.findtext("a:title","",ns));summ=norm(e.findtext("a:summary","",ns));ts=terms(title+" "+summ,s["watch_terms"])
        if ts:es.append({"id":e.findtext("a:id","",ns),"title":title,"published":e.findtext("a:published","",ns),"terms":ts})
    return {"entries":es[:25]}
def signal(s,typ,evidence,title=None,published=None):
    sid="mkt-"+hashlib.sha256((s["id"]+typ+json.dumps(evidence,sort_keys=True)).encode()).hexdigest()[:20];score=min(100,s["priority"]+({"pricing-change":5,"positioning-shift":5,"research-signal":3,"procurement-window":5,"authority-window":5}.get(typ,0)))
    return {"schema":"atlas.market-signal.v1","signal_id":sid,"observed_at":now(),"published_at":published,"entity":s["entity"],"signal_type":typ,"title":title or f"{s['entity']}: обнаружено изменение","summary_ru":"Обнаружено семантически значимое изменение публичного источника.","why_it_matters_ru":"Затронуты оси: "+", ".join(s["axis"]), "axis":s["axis"],"relevance_score":score,"impact_score":score,"confidence":"high" if typ=="pricing-change" else "medium","source":{"name":s["id"],"url":s["url"]},"evidence":evidence[:8],"status":"important" if score>=90 else "watch","dedupe_key":sid}
def run():
    cfg=load(CFG,{"sources":[]});state=load(STATE,{"sources":{},"seen":[]});rep={"started_at":now(),"sources":[]};n=0;err=0
    for s in cfg["sources"]:
        row={"source_id":s["id"]}
        try:
            prev=state["sources"].get(s["id"])
            raw=None if s["mode"]=="ted_api" else fetch(s["url"])
            if s["mode"]=="arxiv":
                cur=arxiv(raw,s);fresh=[] if prev is None else [e for e in cur["entries"] if e["id"] not in {x["id"] for x in prev.get("entries",[])}]
                for e in fresh:add(OUT,signal(s,"research-signal",[e["id"],"terms: "+", ".join(e["terms"])],title="Research: "+e["title"],published=e["published"]));n+=1
            elif s["mode"]=="ted_api":
                cur=tedapi(s)
                old_ids={x["id"] for x in (prev or {}).get("entries",[])}
                fresh=[e for e in cur["entries"] if e["id"] not in old_ids] if prev is not None else (cur["entries"][:int(s.get("first_emit_limit") or 10)] if s.get("emit_on_first") else [])
                for e in fresh:
                    ev=[e["url"],"publication: "+e["id"]]
                    if e.get("buyer"):ev.append("buyer: "+e["buyer"])
                    add(OUT,signal(s,"procurement-window",ev,title="EU procurement: "+e["title"],published=e.get("published")));n+=1
            else:
                cur=htmlsnap(raw,s)
                authority_access="authority_access" in (s.get("axis") or [])
                if prev is None and authority_access and s.get("emit_on_first_links"):
                    access_terms=[str(v).lower() for v in (s.get("access_terms") or ["call for proposals","call for papers","cfp","public comment","comment period","working group","workshop","register","registration","participation","join"])]
                    picked=[]
                    for x in cur.get("links",[]):
                        txt=(str(x.get("text") or "")+" "+str(x.get("href") or "")).lower()
                        if any(t in txt for t in access_terms):
                            picked.append(x)
                    for x in picked[:int(s.get("first_emit_limit") or 4)]:
                        add(OUT,signal(s,"authority-window",["current access link: "+x["text"]+" | "+str(x["href"])],title="Access: "+x["text"]));n+=1
                if prev and cur["semantic_hash"]!=prev.get("semantic_hash"):
                    ev=[];ol={(x["text"],x["href"]) for x in prev.get("links",[])}
                    nl=[x for x in cur["links"] if (x["text"],x["href"]) not in ol]
                    if authority_access and nl:
                        access_terms=[str(v).lower() for v in (s.get("access_terms") or ["call for proposals","call for papers","cfp","public comment","comment period","working group","workshop","register","registration","participation","join"])]
                        access=[x for x in nl if any(t in (str(x.get("text") or "")+" "+str(x.get("href") or "")).lower() for t in access_terms)]
                        for x in access[:int(s.get("emit_limit") or 5)]:
                            add(OUT,signal(s,"authority-window",["new access link: "+x["text"]+" | "+str(x["href"])],title="Access: "+x["text"]));n+=1
                        nl=[x for x in nl if x not in access]
                    if nl:ev+=["new link: "+x["text"]+" | "+str(x["href"]) for x in nl[:5]]
                    if prev.get("prices")!=cur.get("prices"):ev+=["prices before: "+", ".join(prev.get("prices",[])[:10]),"prices after: "+", ".join(cur.get("prices",[])[:10])]
                    at=sorted(set(cur["terms"])-set(prev.get("terms",[])));rt=sorted(set(prev.get("terms",[]))-set(cur["terms"]))
                    if at:ev.append("terms added: "+", ".join(at))
                    if rt:ev.append("terms removed: "+", ".join(rt))
                    if ev:
                        typ="pricing-change" if "pricing" in s["axis"] and prev.get("prices")!=cur.get("prices") else ("capability-release" if nl else "positioning-shift")
                        add(OUT,signal(s,typ,ev));n+=1
            state["sources"][s["id"]]=cur;row["status"]="ok"
        except Exception as e:err+=1;row["status"]="error";row["error"]=str(e)
        rep["sources"].append(row)
    state["updated_at"]=now();save(STATE,state);rep["ended_at"]=now();rep["summary"]={"sources":len(cfg["sources"]),"signals_emitted":n,"errors":err};add(LEDGER,rep);return rep
def main():
    a=argparse.ArgumentParser();a.add_argument("--once",action="store_true");a.add_argument("--watch",type=int);a.add_argument("--print-report",action="store_true");x=a.parse_args();interval=max(3600,x.watch or 0)
    while True:
        r=run()
        if x.print_report or x.once:print(json.dumps(r,ensure_ascii=False,indent=2))
        if x.once or not x.watch:break
        time.sleep(interval)
if __name__=="__main__":main()
