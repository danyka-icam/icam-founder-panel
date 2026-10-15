#!/usr/bin/env python3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from datetime import datetime, timezone
import json, os

PORT=int(os.environ.get("COMPANY_ELIGIBILITY_PORT","8844"))
PROFILE=Path(os.environ.get("COMPANY_ELIGIBILITY_PROFILE","/var/lib/aiclavis-company-eligibility/profile.json"))
PROJECTS=Path(os.environ.get("FUNDING_PROJECT_CANDIDATES","/var/lib/aiclavis-company-eligibility/project_candidates.json"))

def load():
    d=json.loads(PROFILE.read_text())
    facts=d.get("facts") or {}
    counts={"VERIFIED":0,"UNKNOWN":0,"CONFLICT":0,"OTHER":0}
    for f in facts.values():
        s=str((f or {}).get("status") or "UNKNOWN").upper()
        counts[s if s in counts else "OTHER"]+=1
    d["summary"]={
      "facts_total":len(facts),
      "verified":counts["VERIFIED"],
      "unknown":counts["UNKNOWN"],
      "conflict":counts["CONFLICT"],
      "coverage_pct":round((counts["VERIFIED"]/len(facts)*100),1) if facts else 0
    }
    d["served_at"]=datetime.now(timezone.utc).isoformat()
    d["read_only"]=True
    return d

class H(BaseHTTPRequestHandler):
    def log_message(self,*a): pass
    def sendj(self,obj,code=200):
        b=json.dumps(obj,ensure_ascii=False,indent=2).encode()
        self.send_response(code); self.send_header("Content-Type","application/json; charset=utf-8")
        self.send_header("Cache-Control","no-store"); self.send_header("Content-Length",str(len(b)))
        self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        p=self.path.split("?",1)[0]
        try:
            if p=="/health":
                d=load(); return self.sendj({"ok":True,"service":"aiclavis-company-eligibility","version":"0.1","schema":d.get("schema"),"read_only":True})
            if p=="/api/v1/company-eligibility-profile": return self.sendj(load())
            if p=="/api/v1/funding-project-candidates":
                d=json.loads(PROJECTS.read_text()); d["read_only"]=True
                return self.sendj(d)
            return self.sendj({"error":"not_found"},404)
        except Exception as e:
            return self.sendj({"error":type(e).__name__,"detail":str(e)[:200]},500)

if __name__=="__main__":
    ThreadingHTTPServer(("127.0.0.1",PORT),H).serve_forever()
