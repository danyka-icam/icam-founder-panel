(function(){
  "use strict";
  if(window.__aiclavisStuStandaloneLoaded)return;
  window.__aiclavisStuStandaloneLoaded=true;

  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c];});}
  function parse(raw){try{return JSON.parse(raw||"{}")||{};}catch(_){return {};}}
  function ensure(){
    var d=document.querySelector("[data-stu-standalone]");
    if(d)return d;
    d=document.createElement("div");
    d.className="cc-steward-dialog";
    d.setAttribute("data-stu-standalone","");
    d.innerHTML="<div class='cc-steward-shell'><header><div><small>СТЮ</small><h3>Рабочая память и движение</h3></div><button type='button' data-stu-close aria-label='Закрыть'>×</button></header>"+
      "<div class='cc-steward-context' data-stu-context></div>"+
      "<div class='cc-steward-thread' data-stu-thread><div class='cc-steward-intro'>Спрашивай обычным языком. Стю сверит выбранный объект с рабочей памятью и живым состоянием системы.</div></div>"+
      "<form data-stu-form><textarea rows='3' data-stu-input placeholder='Спроси Стю…'></textarea><button type='submit'>Спросить</button></form>"+
      "<footer data-stu-status>Рабочая память ATLAS / AICLAVIS</footer></div>";
    document.body.appendChild(d);
    return d;
  }
  function bubble(role,text){
    return "<div class='cc-steward-msg "+role+"'><p>"+esc(text)+"</p></div>";
  }
  function ask(d,q){
    q=String(q||"").trim(); if(!q)return;
    var th=d.querySelector("[data-stu-thread]"), st=d.querySelector("[data-stu-status]");
    th.insertAdjacentHTML("beforeend",bubble("user",q)+"<div class='cc-steward-msg assistant pending'>Разбираю вопрос и проверяю рабочий контекст…</div>");
    th.scrollTop=th.scrollHeight; st.textContent="Стю сверяет память и живое состояние системы…";
    fetch("/founder-ui-preview/api/steward-navigator/query",{
      method:"POST",credentials:"same-origin",cache:"no-store",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({question:q,context:d._stuContext||{},history:d._stuHistory||[]})
    }).then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.json();})
      .then(function(data){
        var p=th.querySelector(".pending"); if(p)p.remove();
        var ans=data.answer||"Ответ не передан.";
        th.insertAdjacentHTML("beforeend",bubble("assistant",ans));
        d._stuHistory=(d._stuHistory||[]).concat([{role:"user",content:q},{role:"assistant",content:ans}]).slice(-10);
        st.textContent=data.memory_complete===false?"Ответ по доступной памяти":"Ответ по рабочей памяти";
        th.scrollTop=th.scrollHeight;
      }).catch(function(){
        var p=th.querySelector(".pending"); if(p)p.remove();
        th.insertAdjacentHTML("beforeend",bubble("assistant","Стю сейчас не смог получить ответ. Попробуй ещё раз через минуту."));
        st.textContent="Стю временно недоступен";
      });
  }
  function open(raw){
    if(typeof window.__aiclavisOpenStu==="function"){
      try{window.__aiclavisOpenStu(raw);return;}catch(_){}
    }
    var d=ensure(), ctx=parse(raw);
    d._stuContext=ctx; d._stuHistory=[];
    var c=d.querySelector("[data-stu-context]");
    c.innerHTML="<b>"+esc(ctx.title||"Текущий объект")+"</b>"+(ctx.sub?"<span>"+esc(ctx.sub)+"</span>":"");
    d.classList.add("open");
    var th=d.querySelector("[data-stu-thread]");
    th.innerHTML="<div class='cc-steward-intro'>Спрашивай обычным языком. Стю сверит выбранный объект с рабочей памятью и живым состоянием системы.</div>";
    setTimeout(function(){
      var i=d.querySelector("[data-stu-input]"); if(i)i.focus();
      if(ctx.quick_question){var q=ctx.quick_question;ctx.quick_question="";ask(d,q);}
    },20);
  }
  window.__aiclavisStandaloneStuOpen=open;

  document.addEventListener("click",function(e){
    var close=e.target&&e.target.closest&&e.target.closest("[data-stu-close]");
    if(close){var d=close.closest("[data-stu-standalone]");if(d)d.classList.remove("open");return;}
    var el=e.target&&e.target.closest&&e.target.closest("[data-cc-steward-context], [data-g='ask-navigator']");
    if(!el)return;
    e.preventDefault(); e.stopPropagation();
    var raw=el.getAttribute("data-cc-steward-context")||JSON.stringify({kind:"general",title:"Стю",page:(location.hash||"#command").slice(1)});
    open(raw);
  },true);

  document.addEventListener("submit",function(e){
    var f=e.target&&e.target.closest&&e.target.closest("[data-stu-form]"); if(!f)return;
    e.preventDefault();
    var d=f.closest("[data-stu-standalone]"), i=f.querySelector("[data-stu-input]"), q=i&&i.value;
    if(i)i.value=""; ask(d,q);
  },true);

  document.addEventListener("keydown",function(e){
    if(e.key!=="Escape")return;
    var d=document.querySelector("[data-stu-standalone].open"); if(d)d.classList.remove("open");
  });
})();