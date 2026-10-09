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
  .ai-card img{display:block; width:100%; max-height:190px; object-fit:cover; border-radius:7px; margin-top:8px; background:#e9e6dc;}
  .ai-all{align-self:stretch; padding:12px 8px; border-radius:8px; border:none; background:var(--good, #3f7a4e); color:#fff; font-size:14.5px; font-weight:700; cursor:pointer; font-family:inherit;}
  .ai-all:disabled{opacity:.5; cursor:default;}
  /* walk-through: the camera, what's being heard, and one button to finish */
  .ai-walk{display:none; flex-direction:column; min-height:0; flex:1;}
  .ai-panel.walking .ai-walk{display:flex;}
  .ai-panel.walking .ai-log, .ai-panel.walking .ai-foot{display:none;}
  .ai-walk video{width:100%; max-height:46vh; min-height:150px; background:#1e2022; object-fit:cover; display:block;}
  .ai-walk-rec{display:flex; align-items:center; gap:7px; padding:8px 14px 0; font-size:12.5px; font-weight:700; color:var(--danger, #b3452f);}
  .ai-walk-rec .dot{width:9px; height:9px; border-radius:50%; background:var(--danger, #b3452f); animation:aiPulse 1.2s ease-in-out infinite;}
  .ai-walk-rec .pics{margin-left:auto; color:var(--ink-soft, #6b6f72); font-weight:400;}
  .ai-walk-text{flex:1; min-height:54px; max-height:110px; overflow:hidden; display:flex; flex-direction:column; justify-content:flex-end; padding:8px 14px; font-size:14.5px; line-height:1.45; color:var(--ink, #33363a);}
  .ai-walk-text.quiet{color:var(--ink-soft, #6b6f72);}
  .ai-walk-btns{display:flex; gap:8px; padding:10px 12px 12px; border-top:1px solid #ece8dd;}
  .ai-walk-btns button{padding:13px 10px; border-radius:8px; font-size:15px; font-weight:700; cursor:pointer; font-family:inherit;}
  .ai-walk-btns .stop{flex:1; background:var(--danger, #b3452f); color:#fff; border:none;}
  .ai-walk-btns .cancel{background:#fff; color:var(--ink-soft, #6b6f72); border:2px solid var(--steel-line, #d4d2c8);}
  .ai-pic-nav{display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:6px; font-size:12px; color:var(--ink-soft, #6b6f72);}
  .ai-pic-nav button{border:1px solid var(--steel-line, #d4d2c8); background:#fff; border-radius:6px; padding:6px 10px; font-size:12.5px; font-weight:700; color:var(--navy, #4B4F54); cursor:pointer; font-family:inherit;}
  .ai-pic-nav button:disabled{opacity:.4; cursor:default;}
  .ai-panel, .ai-panel *{box-sizing:border-box;}
  .ai-panel{font-family:-apple-system,"Segoe UI","Helvetica Neue",Arial,sans-serif; color:var(--ink, #33363a);}
`;
  const html = `<button type="button" class="ai-fab" id="aiFab" title="Ask the hub assistant" aria-label="Ask the hub assistant">
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0"/><line x1="12" y1="18" x2="12" y2="22"/></svg>
</button>
<div class="ai-panel" id="aiPanel" role="dialog" aria-label="Hub assistant">
  <div class="ai-head"><strong>Hub assistant</strong><button type="button" id="aiClose" aria-label="Close">&times;</button></div>
  <div class="ai-log" id="aiLog"></div>
  <div class="ai-walk" id="aiWalk">
    <video id="aiVideo" playsinline muted autoplay></video>
    <div class="ai-walk-rec"><span class="dot"></span><span id="aiWalkTime">0:00</span><span class="pics" id="aiWalkPics"></span></div>
    <div class="ai-walk-text quiet" id="aiWalkText">Walk through and say what needs doing as you point the camera at it.</div>
    <div class="ai-walk-btns"><button type="button" class="cancel" id="aiWalkCancel">Cancel</button><button type="button" class="stop" id="aiWalkStop">Done &mdash; make the list</button></div>
  </div>
  <div class="ai-foot">
    <button type="button" class="ai-round" id="aiMic" title="Tap and speak" aria-label="Tap and speak">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0"/><line x1="12" y1="18" x2="12" y2="22"/></svg>
    </button>
    <button type="button" class="ai-round" id="aiCam" title="Record a walk-through" aria-label="Record a walk-through" style="display:none;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="13" height="12" rx="2"/><path d="M15 10l6-3v10l-6-3z"/></svg>
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
    cancelWalk();
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

  // Put proposed changes on screen as cards. `tape` (walk-through only) = { frames:[{ t, shot }], clips:[{ t, text }] }:
  // every still kept during the walk with the time it was taken, and the transcript in short pieces
  // with the time each was said. An item's picture is the still from the moment its piece was spoken;
  // Earlier / Later on the card step through the neighbouring stills. Only the one showing when
  // Confirm is pressed gets uploaded.
  function showActions(actions, tape){
    const ids = [];
    const words = t=>String(t || '').toLowerCase().match(/[a-z]{4,}/g) || [];
    const guessClip = text=>{
      let best = 0, score = 0;
      const want = new Set(words(text));
      tape.clips.forEach((c, i)=>{ const hit = new Set(words(c.text).filter(w=>want.has(w))).size; if(hit > score){ score = hit; best = i + 1; } });
      return best;
    };
    const frameAt = ms=>{
      let best = -1, off = Infinity;
      tape.frames.forEach((f, i)=>{ const d = Math.abs(f.t - ms); if(d < off){ off = d; best = i; } });
      return best;
    };
    actions.forEach(a=>{
      const id = 'c' + (++cardSeq);
      let fi = -1;
      const fromWalk = !!tape && a.type === 'add_punch_item';
      if(fromWalk && tape.frames.length){
        // the assistant says which piece an item came from; if it didn't, go by the wording
        const clip = tape.clips[(a.clip || 0) - 1] || tape.clips[guessClip((a.summary || {}).text) - 1];
        if(clip) fi = frameAt(clip.t - WALK_LAG_MS);
      }
      pending[id] = fi >= 0 ? { ...a, _tape: tape, _fi: fi } : (fromWalk ? { ...a, _walk: true } : a);
      ids.push(id);
      const sum = a.summary || {};
      const card = add(`<div class="t">${escHtml(sum.title || 'Change')}</div>
        <div class="x">${escHtml(sum.text || '')}</div>
        ${sum.people ? `<div class="p">${escHtml(sum.people)}</div>` : ''}
        <div class="row"><button type="button" class="ai-no" data-ai-cancel="${id}">Cancel</button><button type="button" class="ai-yes" data-ai-confirm="${id}">Confirm</button></div>`, 'ai-card');
      card.dataset.card = id;
      if(fi >= 0){
        const pic = document.createElement('div');
        pic.className = 'ai-pic';
        pic.innerHTML = `<img alt="Picture from the walk-through"><div class="ai-pic-nav"><button type="button" data-ai-pic="-1">&lsaquo; Earlier</button><span>Not the right moment?</span><button type="button" data-ai-pic="1">Later &rsaquo;</button></div>`;
        card.insertBefore(pic, card.querySelector('.row'));
        showPic(id);
      }
    });
    if(ids.length > 1){
      const all = add(`Add all ${ids.length}`, 'ai-all');
      all.setAttribute('role', 'button');
      all.dataset.aiAll = ids.join(',');
    }
  }
  // draw (or redraw, after Earlier / Later) the still a walk-through card is holding
  function showPic(id){
    const a = pending[id], card = log.querySelector(`[data-card="${id}"]`);
    if(!a || !a._tape || !card) return;
    const img = card.querySelector('.ai-pic img');
    if(img.src) URL.revokeObjectURL(img.src);
    img.src = URL.createObjectURL(a._tape.frames[a._fi].shot);
    card.querySelector('[data-ai-pic="-1"]').disabled = a._fi <= 0;
    card.querySelector('[data-ai-pic="1"]').disabled = a._fi >= a._tape.frames.length - 1;
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
      showActions(data.actions || []);
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
  async function settleCard(id, confirmed){
    const action = pending[id];
    if(!action) return;
    const card = log.querySelector(`[data-card="${id}"]`);
    const yes = card.querySelector('[data-ai-confirm]');
    const finish = (cls, text)=>{
      delete pending[id];
      card.querySelector('.row').remove();
      const nav = card.querySelector('.ai-pic-nav');
      if(nav) nav.remove();
      if(cls === 'cancelled' && card.querySelector('.ai-pic')) card.querySelector('.ai-pic').remove();
      if(cls) card.classList.add(cls);
      const st = document.createElement('div'); st.className = 'state'; st.textContent = text; card.appendChild(st);
    };
    if(!confirmed){ finish('cancelled', 'Cancelled — nothing was saved.'); history.push({ role:'user', text:'(I cancelled that.)' }); return; }
    card.querySelectorAll('button').forEach(b=>{ b.disabled = true; });
    yes.textContent = 'Saving…';
    const again = text=>{
      card.querySelectorAll('button').forEach(b=>{ b.disabled = false; });
      yes.textContent = 'Confirm';
      add(text, 'ai-msg bot');
    };
    try{
      const { summary, _tape, _fi, _walk, ...toRun } = action;
      const _shot = _tape ? _tape.frames[_fi].shot : null;
      let noPicture = false;
      if(_shot){
        // the walk-through picture goes up first, so the item is saved with it attached
        try{ const up = await uploadShot(_shot, toRun.homeId); toRun.photos = [up.url]; toRun.photoPaths = [up.path]; }
        catch(err){ console.error('walk-through picture did not upload', err); noPicture = true; }
      }
      const data = await call({ action:'run', actions:[toRun] });
      const r = (data.results || [])[0] || {};
      if(r.ok){
        // say what became of the picture, so a missing one isn't a mystery
        const pic = noPicture ? ' · the picture didn\'t upload, so it was saved without one'
          : _shot ? (r.photosSaved ? ' · picture attached' : ' · saved, but the picture was not kept')
          : _walk ? ' · no picture was taken for this one' : '';
        finish('done', '✓ Done' + pic);
        history.push({ role:'user', text:'(I confirmed that and it was saved.)' });
      }
      else again(escHtml(r.problem || 'That couldn\'t be saved.'));
    } catch(err){
      console.error(err);
      again(problemText(err));
    }
  }
  log.addEventListener('click', async e=>{
    const nav = e.target.closest('[data-ai-pic]');
    if(nav){
      const id = nav.closest('.ai-card').dataset.card, a = pending[id];
      if(a && a._tape){ a._fi = Math.max(0, Math.min(a._tape.frames.length - 1, a._fi + Number(nav.dataset.aiPic))); showPic(id); }
      return;
    }
    const all = e.target.closest('[data-ai-all]');
    if(all){
      if(all.disabled || all.dataset.busy) return;
      all.dataset.busy = '1'; all.style.opacity = '.5';
      for(const id of all.dataset.aiAll.split(',')) await settleCard(id, true);   // one at a time; ones already settled are skipped
      all.remove();
      return;
    }
    const yes = e.target.closest('[data-ai-confirm]'), no = e.target.closest('[data-ai-cancel]');
    if(yes) settleCard(yes.dataset.aiConfirm, true);
    else if(no) settleCard(no.dataset.aiCancel, false);
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

  /* ---- walk-through: point the phone's camera and talk ----
     Nothing is saved as a video. While they walk, the hub keeps a still from the camera every
     second and a half, each with the time it was taken, and the browser turns the speech into text
     (same as the microphone), which is cut into short pieces with the time each was said. At the end
     the numbered pieces go to the assistant; it breaks them into punch list items and says which
     piece each came from, and the card shows the still from that moment. The stills stay on this
     device; only the one on a card that gets confirmed is uploaded. */
  const WALK_PIECE_MS = 2500;     // the transcript is cut into pieces about this long
  const WALK_GAP_MS = 1500;       // ...and at any silence longer than this
  const WALK_FRAME_MS = 1500;     // how often a still is kept
  const WALK_LAG_MS = 600;        // words appear a little after they're spoken, so look this far back for the picture
  const WALK_MAX_MS = 10 * 60000; // a walk-through stops by itself after ten minutes
  const WALK_MAX_CLIPS = 300;
  let walk = null;
  const walkTotal = ()=>(walk.done + ' ' + walk.cur).replace(/\s+/g, ' ').trim();
  function walkShot(){
    const v = el('aiVideo');
    const scale = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);   // drawn now, so it's this moment even if saving takes a beat
    return new Promise(res=>c.toBlob(b=>res(b), 'image/jpeg', 0.72));
  }
  function walkFrame(){
    if(!walk || !walk.on || !el('aiVideo').videoWidth) return;
    const f = { t: Date.now() - walk.startedAt, shot: null };
    walk.frames.push(f);
    walk.saving.push(walkShot().then(b=>{ f.shot = b; }).catch(()=>{}));
    el('aiWalkPics').textContent = 'Camera on';
  }
  function walkHeard(){
    const now = Date.now(), total = walkTotal();
    const last = walk.clips[walk.clips.length - 1];
    if(!last || ((now - walk.lastHeard > WALK_GAP_MS || now - walk.lastClip > WALK_PIECE_MS) && walk.clips.length < WALK_MAX_CLIPS && total.length > walk.prevLen)){
      walk.clips.push({ at: last ? Math.max(walk.prevLen, last.at + 1) : 0, t: now - walk.startedAt });
      walk.lastClip = now;
      walkFrame();   // and a still right at the moment a new piece starts
    }
    walk.lastHeard = now;
    walk.prevLen = total.length;
    const box = el('aiWalkText');
    box.classList.remove('quiet');
    box.textContent = total.length > 220 ? '…' + total.slice(-220) : total;
  }
  function walkListen(){
    const rec = walk.rec = new Speech();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = !ANDROID;
    const started = Date.now();
    rec.onresult = e=>{
      if(!walk) return;
      walk.cur = Array.from(e.results).map(r=>r[0].transcript).join(' ');
      walkHeard();
    };
    rec.onerror = e=>{ if(walk && (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture')) walk.deaf = true; };
    rec.onend = ()=>{
      if(!walk) return;
      walk.done = walkTotal(); walk.cur = '';
      if(walk.on && !walk.deaf){
        // the browser ends a stretch of listening after a pause — start the next one
        walk.quick = Date.now() - started < 1000 ? walk.quick + 1 : 0;
        if(walk.quick < 6){ try{ walkListen(); return; } catch(err){ console.error(err); } }
        walk.deaf = true;
      }
      if(walk.on && walk.deaf){
        const box = el('aiWalkText');
        box.classList.add('quiet');
        box.textContent = (walk.done ? walk.done.slice(-140) + '\n\n' : '') + 'The microphone stopped. Press Done to use what was heard so far.';
      }
      if(walk.finish) walk.finish();
    };
    rec.start();
  }
  async function startWalk(){
    if(walk || busy) return;
    stopListening();
    let stream;
    try{ stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false }); }
    catch(err){ console.error(err); add('The camera is blocked or this device doesn\'t have one. Allow the camera for this page in the browser, or use the microphone instead.', 'ai-msg bot'); return; }
    walk = { stream, clips: [], frames: [], saving: [], done: '', cur: '', prevLen: 0, lastHeard: 0, lastClip: 0, on: true, quick: 0, startedAt: Date.now() };
    el('aiPanel').classList.add('walking');   // shown first: some phones won't start a hidden video
    el('aiVideo').srcObject = stream;
    try{ await el('aiVideo').play(); } catch(e){ console.warn('camera preview did not start by itself', e); }
    el('aiWalkText').className = 'ai-walk-text quiet';
    el('aiWalkText').textContent = 'Walk through and say what needs doing as you point the camera at it.';
    el('aiWalkPics').textContent = 'Starting the camera…';
    el('aiWalkTime').textContent = '0:00';
    el('aiWalkStop').disabled = false;
    walk.timer = setInterval(()=>{
      if(!walk) return;
      const secs = Math.floor((Date.now() - walk.startedAt) / 1000);
      el('aiWalkTime').textContent = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
      if(walk.on && Date.now() - walk.startedAt > WALK_MAX_MS) finishWalk();
    }, 500);
    walk.shooter = setInterval(walkFrame, WALK_FRAME_MS);
    walkFrame();
    try{ if(navigator.wakeLock) walk.wake = await navigator.wakeLock.request('screen'); } catch(e){}   // keep the phone from dimming mid-walk
    try{ walkListen(); } catch(err){ console.error(err); walk.deaf = true; }
  }
  // stop listening and the camera; hands back what was gathered
  async function endWalk(){
    const w = walk;
    if(!w) return null;
    w.on = false;
    clearInterval(w.shooter);
    // the last few words arrive just after stop() — give them a moment
    await new Promise(res=>{ w.finish = res; try{ w.rec.stop(); } catch(e){ res(); } setTimeout(res, 1500); });
    await Promise.all(w.saving);
    clearInterval(w.timer);
    try{ if(w.wake) w.wake.release(); } catch(e){}
    w.stream.getTracks().forEach(t=>t.stop());
    el('aiVideo').srcObject = null;
    el('aiPanel').classList.remove('walking');
    const total = (w.done + ' ' + w.cur).replace(/\s+/g, ' ').trim();
    walk = null;
    return { w, total };
  }
  function cancelWalk(){ if(walk) endWalk(); }
  async function finishWalk(){
    if(!walk || !walk.on) return;
    el('aiWalkStop').disabled = true;
    el('aiWalkStop').textContent = 'Finishing…';
    const secs = Math.floor((Date.now() - walk.startedAt) / 1000);
    const got = await endWalk();
    el('aiWalkStop').innerHTML = 'Done &mdash; make the list';
    if(!got) return;
    const { w, total } = got;
    if(!total){ add('I didn\'t hear anything during that walk-through, so there\'s nothing to make a list from. Check the microphone is allowed for this page and try again.', 'ai-msg bot'); return; }
    // cut the text where each piece started (pulled back to the start of a word); pieces with no words are dropped
    const cuts = w.clips.map(c=>{ const sp = total.lastIndexOf(' ', Math.min(c.at, total.length)); return sp < 0 ? 0 : sp; });
    const tape = { frames: w.frames.filter(f=>f.shot), clips: [] };
    w.clips.forEach((c, i)=>{
      const text = total.slice(cuts[i], i + 1 < cuts.length ? cuts[i + 1] : total.length).trim();
      if(text) tape.clips.push({ t: c.t, text });
    });
    if(!tape.clips.length) tape.clips.push({ t: 0, text: total });
    const transcript = tape.clips.map((c, i)=>'[' + (i + 1) + '] ' + c.text).join('\n');
    add(escHtml(`Walk-through · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`), 'ai-msg user');
    if(!tape.frames.length) add('The camera didn\'t give me any pictures during that walk-through, so the items will come without them.', 'ai-msg bot');
    const waiting = add('Making the list…', 'ai-msg bot');
    busy = true; el('aiSend').disabled = true;
    try{
      const data = await call({ action:'ask', walk:true, text: transcript, history, context: pageContext() });
      waiting.textContent = data.reply || '';
      history.push({ role:'user', text: 'Walk-through transcript:\n' + transcript.slice(0, 1300) }, { role:'assistant', text: data.reply || '' });
      history = history.slice(-6);
      showActions(data.actions || [], tape);
    } catch(err){
      console.error(err);
      waiting.textContent = problemText(err);
      // don't lose a whole walk-through to a dropped connection
      add('Here is what was heard, so it isn\'t lost:\n\n' + escHtml(total), 'ai-msg bot');
    }
    busy = false; el('aiSend').disabled = false;
    log.scrollTop = log.scrollHeight;
  }
  // Save one walk-through picture where punch list photos live. Pages that don't already use
  // file storage load that part of Firebase the first time it's needed.
  async function uploadShot(blob, homeId){
    if(typeof firebase.storage !== 'function'){
      const app = document.querySelector('script[src*="firebase-app-compat"]');
      await new Promise((res, rej)=>{
        const sc = document.createElement('script');
        sc.src = (app ? app.src : 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js').replace('firebase-app-compat', 'firebase-storage-compat');
        sc.onload = res; sc.onerror = rej;
        document.head.appendChild(sc);
      });
    }
    const path = `houses/${homeId || 'punch-list'}/photos/punch-walk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const stored = firebase.storage().ref().child(path);
    await stored.put(blob, { contentType: 'image/jpeg' });
    return { url: await stored.getDownloadURL(), path };
  }
  if(Speech && navigator.mediaDevices && navigator.mediaDevices.getUserMedia){
    el('aiCam').style.display = '';
    el('aiCam').addEventListener('click', startWalk);
    el('aiWalkStop').addEventListener('click', finishWalk);
    el('aiWalkCancel').addEventListener('click', ()=>{ cancelWalk(); });
  }
})();
