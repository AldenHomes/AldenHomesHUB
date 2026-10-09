/* ============================================================
   HUB ASSISTANT — the microphone button, on every staff page.

   One shared file so the assistant looks and behaves the same everywhere. A page gets it
   with a single line just before </body>:   <script src="assistant.js"></script>
   (It needs the page to have signed in with Firebase already, which every staff page does.)

   The mic turns speech into text on this device (the browser does that), the text goes to
   the hub's server, and Claude works out what was meant. Looking things up just answers.
   Anything that would CHANGE something comes back as a card with Confirm / Cancel —
   nothing is saved until Confirm is pressed.
   ============================================================ */
(function(){
  if(document.getElementById('aiFab') || typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) return;

  const css = `
  .ai-fab{position:fixed; right:18px; bottom:18px; z-index:90; width:60px; height:60px; border-radius:50%; border:none; background:var(--navy, #4B4F54); color:#fff; cursor:pointer; box-shadow:0 6px 20px rgba(30,32,34,.35); display:none; align-items:center; justify-content:center;}
  .ai-fab.show{display:flex;}
  .ai-fab:hover{background:var(--navy-2, #33363a);}
  .ai-panel{position:fixed; right:18px; bottom:18px; z-index:95; width:min(400px, calc(100vw - 24px)); max-height:min(620px, calc(100vh - 36px)); background:var(--paper-2, #ffffff); border-radius:12px; box-shadow:0 16px 48px rgba(30,32,34,.35); border-top:4px solid var(--rust, #A3AA83); display:none; flex-direction:column; overflow:hidden;}
  .ai-panel.show{display:flex;}
  .ai-head{display:flex; align-items:center; justify-content:space-between; padding:12px 14px; border-bottom:1px solid #ece8dd;}
  .ai-head strong{font-size:15px; color:var(--navy, #4B4F54);}
  .ai-head button{border:none; background:none; font-size:22px; line-height:1; color:var(--ink-soft, #6b6f72); cursor:pointer;}
  .ai-log{flex:1; overflow-y:auto; padding:14px; display:flex; flex-direction:column; gap:10px; min-height:150px;}
  .ai-msg{max-width:88%; padding:9px 12px; border-radius:12px; font-size:14.5px; line-height:1.45; white-space:pre-wrap; word-break:break-word;}
  .ai-msg.user{align-self:flex-end; background:var(--navy, #4B4F54); color:#fff; border-bottom-right-radius:3px;}
  .ai-msg.bot{align-self:flex-start; background:#f3f5ee; color:var(--ink, #33363a); border-bottom-left-radius:3px;}
  .ai-msg.hint{align-self:stretch; max-width:none; background:none; color:var(--ink-soft, #6b6f72); font-size:13px; padding:0;}
  .ai-msg.hint em{display:block; font-style:normal; margin-top:6px; padding:7px 10px; background:#faf8f2; border:1px solid #ece8dd; border-radius:8px; color:var(--ink, #33363a);}
  .ai-card{align-self:stretch; border:2px solid var(--amber, #c98a2b); background:#fffaf1; border-radius:10px; padding:12px;}
  .ai-card.done{border-color:#c5dccb; background:#eaf1ec;}
  .ai-card.cancelled{border-color:var(--steel-line, #d4d2c8); background:#faf8f2; opacity:.75;}
  .ai-card .t{font-size:13px; font-weight:700; color:var(--navy, #4B4F54);}
  .ai-card .x{font-size:15px; line-height:1.45; margin-top:5px; white-space:pre-wrap; word-break:break-word;}
  .ai-card .p{font-size:12.5px; color:var(--ink-soft, #6b6f72); margin-top:5px;}
  .ai-card .row{display:flex; gap:8px; margin-top:10px;}
  .ai-card .row button{flex:1; padding:11px 8px; border-radius:8px; font-size:14.5px; font-weight:700; cursor:pointer; font-family:inherit;}
  .ai-yes{background:var(--good, #3f7a4e); color:#fff; border:none;}
  .ai-no{background:#fff; color:var(--ink-soft, #6b6f72); border:2px solid var(--steel-line, #d4d2c8);}
  .ai-card .state{font-size:13px; font-weight:700; margin-top:8px; color:var(--good, #3f7a4e);}
  .ai-card.cancelled .state{color:var(--ink-soft, #6b6f72);}
  .ai-foot{display:flex; gap:8px; align-items:center; padding:10px 12px 12px; border-top:1px solid #ece8dd;}
  .ai-foot input{flex:1; min-width:0; padding:11px 12px; border:1px solid var(--steel-line, #d4d2c8); border-radius:22px; font-size:15px; font-family:inherit; color:var(--ink, #33363a);}
  .ai-foot input:focus{outline:2px solid var(--amber, #c98a2b); outline-offset:0; border-color:var(--amber, #c98a2b);}
  .ai-round{flex:none; width:44px; height:44px; border-radius:50%; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; background:#eef0e8; color:var(--rust-2, #6B7355);}
  .ai-round.send{background:var(--navy, #4B4F54); color:#fff;}
  .ai-round:disabled{opacity:.45; cursor:default;}
  .ai-round.listening{background:var(--danger, #b3452f); color:#fff; animation:aiPulse 1.2s ease-in-out infinite;}
  @keyframes aiPulse{0%,100%{box-shadow:0 0 0 0 rgba(179,69,47,.45);} 50%{box-shadow:0 0 0 10px rgba(179,69,47,0);}}
  .ai-panel, .ai-panel *{box-sizing:border-box;}
  .ai-panel{font-family:-apple-system,"Segoe UI","Helvetica Neue",Arial,sans-serif; color:var(--ink, #33363a);}
`;
  const html = `<button type="button" class="ai-fab" id="aiFab" title="Ask the hub assistant" aria-label="Ask the hub assistant">
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0"/><line x1="12" y1="18" x2="12" y2="22"/></svg>
</button>
<div class="ai-panel" id="aiPanel" role="dialog" aria-label="Hub assistant">
  <div class="ai-head"><strong>Hub assistant</strong><button type="button" id="aiClose" aria-label="Close">&times;</button></div>
  <div class="ai-log" id="aiLog"></div>
  <div class="ai-foot">
    <button type="button" class="ai-round" id="aiMic" title="Tap and speak" aria-label="Tap and speak">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0"/><line x1="12" y1="18" x2="12" y2="22"/></svg>
    </button>
    <input type="text" id="aiText" placeholder="Say it or type it…" maxlength="1000" autocomplete="off">
    <button type="button" class="ai-round send" id="aiSend" title="Send" aria-label="Send">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
    </button>
  </div>
</div>`;
  document.head.insertAdjacentHTML('beforeend', '<style>' + css + '</style>');
  document.body.insertAdjacentHTML('beforeend', html);

  function escHtml(s){
    return (s==null?'':String(s)).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  // Which home is on screen, if any: a home's own page, or a house open in Construction Schedules.
  // (Those pages keep it in a page-level variable; anywhere else there's simply no home.)
  function pageContext(){
    let homeId = '';
    try{
      if(/house\.html$/i.test(location.pathname) && typeof houseId === 'string') homeId = houseId;
      else if(/construction\.html$/i.test(location.pathname) && typeof openScheduleId === 'string') homeId = openScheduleId;
    } catch(e){}
    return { page: (location.pathname.split('/').pop() || 'index.html'), homeId: homeId || '' };
  }

  const API = 'https://us-central1-alden-homes-hub.cloudfunctions.net/hubAssistant';
  const el = id=>document.getElementById(id);
  const log = el('aiLog');
  let history = [];      // the last few things said, so a follow-up like "no, lot 41" makes sense
  let pending = {};      // proposed changes waiting on Confirm, by card id
  let busy = false, cardSeq = 0;

  firebase.auth().onAuthStateChanged(user=>{
    // only signed-in staff get the button (homeowners on the request form are anonymous)
    el('aiFab').classList.toggle('show', !!user && !user.isAnonymous);
    if(!user || user.isAnonymous) el('aiPanel').classList.remove('show');
  });

  function add(html, cls){
    const div = document.createElement('div');
    div.className = cls;
    div.innerHTML = html;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    return div;
  }
  function open(){
    el('aiPanel').classList.add('show');
    el('aiFab').classList.remove('show');
    if(!log.children.length) add(pageContext().homeId
      ? 'Tap the microphone and say what you need, or type it. You\'re on a home, so you can just say "here". For example:<em>Add a note here saying drywall is complete and tag Chase</em><em>Put touch up the foyer paint on the punch list for this house</em><em>When does this home settle?</em>'
      : 'Tap the microphone and say what you need, or type it. For example:<em>Add a note to AP 40 saying drywall is complete and tag Chase</em><em>Put touch up the foyer paint on the punch list for Lot 12</em><em>When does the Smith house settle?</em>', 'ai-msg hint');
    el('aiText').focus();
  }
  function close(){
    stopListening();
    el('aiPanel').classList.remove('show');
    el('aiFab').classList.add('show');
  }
  el('aiFab').addEventListener('click', open);
  el('aiClose').addEventListener('click', close);

  async function call(body){
    const token = await firebase.auth().currentUser.getIdToken();
    const res = await fetch(API, { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer ' + token }, body: JSON.stringify(body) });
    if(!res.ok){
      const info = await res.json().catch(()=>({}));
      throw Object.assign(new Error('assistant ' + res.status), { status: res.status, ai: info.status });
    }
    return res.json();
  }
  function problemText(err){
    if(err.status === 404) return 'The assistant isn\'t switched on yet.';
    if(err.ai === 401 || err.ai === 403) return 'The assistant\'s key isn\'t working. Let whoever looks after the hub know.';
    if(err.ai === 429 || err.ai === 529) return 'The assistant is busy right now. Try again in a moment.';
    if(err.ai === 400) return 'The assistant couldn\'t handle that. It may be out of credit — let whoever looks after the hub know.';
    return 'That didn\'t go through. Check your connection and try again.';
  }

  async function send(){
    const text = el('aiText').value.trim();
    if(!text || busy) return;
    stopListening();
    el('aiText').value = '';
    add(escHtml(text), 'ai-msg user');
    const waiting = add('Thinking…', 'ai-msg bot');
    busy = true; el('aiSend').disabled = true;
    try{
      const data = await call({ action:'ask', text, history, context: pageContext() });
      waiting.textContent = data.reply || '';
      history.push({ role:'user', text }, { role:'assistant', text: data.reply || '' });
      history = history.slice(-6);
      (data.actions || []).forEach(a=>{
        const id = 'c' + (++cardSeq);
        pending[id] = a;
        const sum = a.summary || {};
        add(`<div class="t">${escHtml(sum.title || 'Change')}</div>
          <div class="x">${escHtml(sum.text || '')}</div>
          ${sum.people ? `<div class="p">${escHtml(sum.people)}</div>` : ''}
          <div class="row"><button type="button" class="ai-no" data-ai-cancel="${id}">Cancel</button><button type="button" class="ai-yes" data-ai-confirm="${id}">Confirm</button></div>`, 'ai-card').dataset.card = id;
      });
    } catch(err){
      console.error(err);
      waiting.textContent = problemText(err);
    }
    busy = false; el('aiSend').disabled = false;
    log.scrollTop = log.scrollHeight;
  }
  el('aiSend').addEventListener('click', send);
  el('aiText').addEventListener('keydown', e=>{ if(e.key === 'Enter') send(); });

  // Confirm / Cancel on a proposed change
  log.addEventListener('click', async e=>{
    const yes = e.target.closest('[data-ai-confirm]'), no = e.target.closest('[data-ai-cancel]');
    const id = yes ? yes.dataset.aiConfirm : no ? no.dataset.aiCancel : '';
    const action = pending[id];
    if(!action) return;
    const card = log.querySelector(`[data-card="${id}"]`);
    const finish = (cls, text)=>{
      delete pending[id];
      card.querySelector('.row').remove();
      if(cls) card.classList.add(cls);
      const st = document.createElement('div'); st.className = 'state'; st.textContent = text; card.appendChild(st);
    };
    if(no){ finish('cancelled', 'Cancelled — nothing was saved.'); history.push({ role:'user', text:'(I cancelled that.)' }); return; }
    card.querySelectorAll('button').forEach(b=>{ b.disabled = true; });
    yes.textContent = 'Saving…';
    try{
      const { summary, ...toRun } = action;
      const data = await call({ action:'run', actions:[toRun] });
      const r = (data.results || [])[0] || {};
      if(r.ok){ finish('done', '\u2713 Done'); history.push({ role:'user', text:'(I confirmed that and it was saved.)' }); }
      else {
        card.querySelectorAll('button').forEach(b=>{ b.disabled = false; });
        yes.textContent = 'Confirm';
        add(escHtml(r.problem || 'That couldn\'t be saved.'), 'ai-msg bot');
      }
    } catch(err){
      console.error(err);
      card.querySelectorAll('button').forEach(b=>{ b.disabled = false; });
      yes.textContent = 'Confirm';
      add(problemText(err), 'ai-msg bot');
    }
  });

  /* ---- the microphone: the browser turns speech into text. Not every browser can
     (Firefox can't) — there the mic is hidden, and typing, or the keyboard's own
     microphone on a phone, still works. ---- */
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  /* The mic stays on until it's pressed again (the owner found it cutting people off mid-sentence).
     Browsers end a listening session by themselves after a pause, so each time one ends while the
     mic is still "on" another is started and the words carry over: `base` is everything heard in
     earlier sessions (or already typed in the box), `part` is the current session so far. */
  const ANDROID = /Android/i.test(navigator.userAgent);   // its long sessions repeat words, so it gets short ones back to back
  let rec = null, listening = false, base = '', part = '', sendOnStop = false, startedAt = 0, quickEnds = 0;
  function micLooks(on){
    el('aiMic').classList.toggle('listening', on);
    el('aiMic').title = on ? 'Press again when you\'re done talking' : 'Talk';
    el('aiText').placeholder = on ? 'Listening… press the microphone again when you\'re done' : 'Say it or type it…';
  }
  // switch the mic off; sendIt = send what was heard once the last words have come in
  function micOff(sendIt){
    if(!listening) return;
    listening = false;
    sendOnStop = !!sendIt;
    micLooks(false);
    try{ rec.stop(); } catch(e){}
  }
  function stopListening(){ micOff(false); }
  function startSession(){
    rec = new Speech();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = !ANDROID;
    part = '';
    startedAt = Date.now();
    rec.onresult = e=>{
      if(!listening && !sendOnStop) return;   // switched off without sending (typed and pressed Send, or closed)
      part = Array.from(e.results).map(r=>r[0].transcript).join(' ').replace(/\s+/g, ' ').trim();
      el('aiText').value = (base + ' ' + part).trim();
    };
    rec.onerror = e=>{
      if(e.error === 'no-speech' || e.error === 'aborted') return;   // just a pause — onend carries on
      listening = false;
      micLooks(false);
      if(e.error === 'not-allowed' || e.error === 'service-not-allowed') add('The microphone is blocked for this page. Allow it in the browser\'s address bar, or just type instead.', 'ai-msg bot');
    };
    rec.onend = ()=>{
      base = (base + ' ' + part).trim();
      part = '';
      if(listening){
        // the browser stopped by itself; keep going unless it's refusing to start (then leave the words in the box)
        quickEnds = Date.now() - startedAt < 1000 ? quickEnds + 1 : 0;
        if(quickEnds < 4){ try{ startSession(); return; } catch(err){ console.error(err); } }
        listening = false;
        micLooks(false);
        return;
      }
      if(sendOnStop){ sendOnStop = false; if(base) send(); }   // the Confirm step is the safety net
    };
    rec.start();
  }
  if(!Speech){
    el('aiMic').style.display = 'none';
  } else {
    el('aiMic').addEventListener('click', ()=>{
      if(listening){ micOff(true); return; }
      base = el('aiText').value.trim();   // carry on from anything already in the box
      quickEnds = 0; sendOnStop = false;
      listening = true;
      micLooks(true);
      try{ startSession(); } catch(e){ console.error(e); listening = false; micLooks(false); }
    });
  }
})();
