/* ============================================================
   HUB CHAT — quick messages between staff, on every staff page (owner, 2026-10-29).

   A page gets it with a single line just before </body>:   <script src="chat.js"></script>
   It adds a "Chat" button (with a red count of unread chats) to the header and a panel on the right:
   the list of chats, a chat itself, and "New chat" (one person, or several = a group with an optional name).

   Stored in Firestore, PRIVATE to the people in each chat (security rule `chats` — published by the owner):
     chats/{id}            { members:[uid], names:{uid:name}, group:bool, title, createdAt, createdBy,
                             lastText, lastAt, lastBy, lastByName, read:{ uid: ISO time last read } }
     chats/{id}/messages   { text, by (uid), byName, at }
   A chat is unread for me when lastAt is newer than read[me] and I didn't write the last message.
   Other pages can listen for window 'hubchat' events ({ detail: { unread, chats } }) — the hub's bell does —
   and open a chat with window.hubChat.open(id).
   ============================================================ */
(function(){
  const bar = document.querySelector('.titlebar');
  if(!bar || document.getElementById('hubChatBtn') || typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) return;
  const HUB_API = 'https://us-central1-alden-homes-hub.cloudfunctions.net/hubApi';

  const css = `
  .hub-chat-btn{display:none; position:relative; align-items:center; gap:6px; background:transparent; border:1px solid var(--steel-line, #d4d2c8); color:var(--ink-soft, #6b6f72); height:30px; padding:0 10px; border-radius:var(--radius, 3px); cursor:pointer; font-size:11.5px; font-family:inherit;}
  .hub-chat-btn.show{display:inline-flex;}
  .hub-chat-btn:hover{background:#f3f1ea; color:var(--navy, #4B4F54);}
  .hub-chat-btn .hc-count{position:absolute; top:-7px; right:-7px; min-width:18px; height:18px; padding:0 5px; border-radius:9px; background:#c0392b; color:#fff; font-size:11px; font-weight:700; line-height:18px; text-align:center; display:none;}
  .hub-chat-btn.has .hc-count{display:block;}
  .hc-panel{position:fixed; top:0; right:0; bottom:0; width:390px; max-width:100vw; z-index:160; background:var(--paper-2, #fff); box-shadow:-10px 0 40px rgba(0,0,0,.22);
    transform:translateX(105%); transition:transform .22s ease; display:flex; flex-direction:column; font-family:-apple-system,"Segoe UI","Helvetica Neue",Arial,sans-serif; color:var(--ink, #33363a); text-align:left;}
  .hc-panel.show{transform:none;}
  .hc-panel, .hc-panel *{box-sizing:border-box;}
  .hc-top{display:flex; align-items:center; gap:8px; padding:12px 14px; border-bottom:1px solid #ece8dd; border-top:4px solid var(--rust, #A3AA83);}
  .hc-top h3{flex:1; min-width:0; margin:0; font-size:17px; color:var(--navy, #4B4F54); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
  .hc-top small{display:block; font-size:12px; font-weight:400; color:var(--ink-soft, #6b6f72); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
  .hc-b{flex:none; border:1px solid var(--steel-line, #d4d2c8); background:#fff; color:var(--ink-soft, #6b6f72); border-radius:var(--radius, 3px); padding:6px 11px; font-size:12.5px; cursor:pointer; font-family:inherit;}
  .hc-b.primary{background:var(--navy, #4B4F54); border-color:var(--navy, #4B4F54); color:#fff;}
  .hc-b:disabled{opacity:.5; cursor:default;}
  .hc-body{flex:1; min-height:0; overflow-y:auto;}
  .hc-row{display:flex; gap:10px; align-items:flex-start; padding:12px 14px; border-bottom:1px solid #f1ede3; cursor:pointer;}
  .hc-row:hover{background:#f3f5ee;}
  .hc-av{flex:none; width:34px; height:34px; border-radius:50%; background:#e6ecf5; color:#3b5a8a; font-weight:700; font-size:13px; display:flex; align-items:center; justify-content:center;}
  .hc-av.g{background:#eaf1ec; color:#3f7a4e;}
  .hc-main{flex:1; min-width:0;}
  .hc-name{font-size:14.5px; font-weight:600; color:var(--navy, #4B4F54); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
  .hc-last{font-size:12.5px; color:var(--ink-soft, #6b6f72); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
  .hc-row.unread .hc-name::after{content:''; display:inline-block; width:8px; height:8px; border-radius:50%; background:#c0392b; margin-left:7px; vertical-align:middle;}
  .hc-row.unread .hc-last{color:var(--ink, #33363a); font-weight:600;}
  .hc-time{flex:none; font-size:11.5px; color:var(--ink-soft, #6b6f72);}
  .hc-none{padding:26px 18px; font-size:13.5px; color:var(--ink-soft, #6b6f72); text-align:center; line-height:1.5;}
  .hc-msgs{padding:12px 12px 4px; display:flex; flex-direction:column; gap:4px;}
  .hc-day{align-self:center; font-size:11.5px; color:var(--ink-soft, #6b6f72); margin:8px 0 4px;}
  .hc-who{font-size:11.5px; color:var(--ink-soft, #6b6f72); margin:6px 0 0 4px;}
  .hc-msg{max-width:82%; align-self:flex-start; background:#f0eee7; border-radius:14px 14px 14px 4px; padding:7px 11px; font-size:14px; line-height:1.4; white-space:pre-wrap; overflow-wrap:anywhere;}
  .hc-msg.me{align-self:flex-end; background:var(--navy, #4B4F54); color:#fff; border-radius:14px 14px 4px 14px;}
  .hc-msg time{display:block; font-size:10.5px; opacity:.65; margin-top:2px; text-align:right;}
  .hc-msg a{color:inherit;}
  .hc-msg a.hc-home{font-weight:700; text-decoration:underline; text-decoration-style:dotted; text-underline-offset:2px;}
  .hc-send{display:flex; gap:8px; align-items:flex-end; padding:10px 12px; border-top:1px solid #ece8dd;}
  .hc-send textarea{flex:1; min-width:0; resize:none; border:1px solid var(--steel-line, #d4d2c8); border-radius:16px; padding:8px 12px; font-size:14px; font-family:inherit; max-height:120px; line-height:1.35; outline:none;}
  .hc-send textarea:focus{border-color:var(--navy, #4B4F54);}
  .hc-pick label{text-transform:none; letter-spacing:normal; font-weight:400; color:var(--ink, #33363a); margin:0; display:flex; align-items:center; gap:10px; padding:10px 14px; border-bottom:1px solid #f1ede3; font-size:14.5px; cursor:pointer;}
  .hc-pick input{width:17px; height:17px;}
  .hc-newbar{padding:10px 14px; border-top:1px solid #ece8dd; display:flex; flex-direction:column; gap:8px;}
  .hc-newbar input[type=text]{border:1px solid var(--steel-line, #d4d2c8); border-radius:var(--radius, 3px); padding:8px 10px; font-size:14px; font-family:inherit;}
  .hc-find{margin:10px 14px 4px; width:calc(100% - 28px); border:1px solid var(--steel-line, #d4d2c8); border-radius:var(--radius, 3px); padding:8px 10px; font-size:14px; font-family:inherit;}
  @media (max-width:600px){ .hc-panel{width:100vw;} }`;
  document.head.insertAdjacentHTML('beforeend', '<style>' + css + '</style>');

  const BUBBLE = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'hub-chat-btn'; btn.id = 'hubChatBtn'; btn.title = 'Chat with the team'; btn.setAttribute('aria-label', 'Chat');
  btn.innerHTML = BUBBLE + '<span>Chat</span><span class="hc-count" id="hubChatCount"></span>';
  const account = bar.querySelector('.titlebar-account');
  if(account) account.insertBefore(btn, account.firstChild); else bar.appendChild(btn);
  document.body.insertAdjacentHTML('beforeend', '<div class="hc-panel" id="hubChatPanel" role="dialog" aria-label="Chat"></div>');
  const panel = document.getElementById('hubChatPanel');

  const esc = s=>(s == null ? '' : String(s)).replace(/[&<>"']/g, c=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  /* HOMES IN A MESSAGE (owner, 2026-10-29: "if I reference a home it should give the option to click the lot number and jump to it"):
     "AP 423", "AP-423", "AP #423", "CL lot 98" — any development code + lot of a home in the hub — and "lot 423" when only one home has
     that lot, become links to that home's page. Web addresses become links too. */
  let homes = null, homesAt = 0;
  function loadHomes(){
    if(homes && Date.now() - homesAt < 300000) return Promise.resolve();
    return firebase.firestore().collection('jobs').get().then(s=>{ homes = s.docs.map(d=>({ id: d.id, ...d.data() })).filter(j=>j.lot); homesAt = Date.now(); })
      .catch(err=>{ console.error('chat: could not read homes', err); homes = homes || []; });
  }
  const homeTitle = j=>[j.community, j.lot ? 'Lot ' + j.lot : '', j.client].filter(Boolean).join(' · ');
  function homeLinks(t){   // t is already escaped
    if(!homes || !homes.length) return t;
    const codes = new Set(homes.map(j=>String(j.community || '').toUpperCase()).filter(Boolean));
    const today = new Date().toISOString().slice(0, 10);
    const pick = list=>list.length === 1 ? list[0] : list.find(j=>!j.settle || j.settle >= today) || null;   // a lot used twice: the one still being built
    const a = j=>m=>`<a class="hc-home" href="house.html?id=${encodeURIComponent(j.id)}" title="${esc(homeTitle(j))}">${m}</a>`;
    return t.replace(/\b([A-Za-z]{2})\s*[-#]?\s*(?:lot\s*#?\s*)?(\d{1,4})\b|\blot\s*#?\s*(\d{1,4})\b/gi, (m, code, n1, n2)=>{
      if(code){
        if(!codes.has(code.toUpperCase())) return m;
        const j = pick(homes.filter(h=>String(h.community || '').toUpperCase() === code.toUpperCase() && String(h.lot).replace(/^0+/, '') === n1.replace(/^0+/, '')));
        return j ? a(j)(m) : m;
      }
      const same = homes.filter(h=>String(h.lot).replace(/^0+/, '') === n2.replace(/^0+/, ''));
      const j = same.length === 1 ? same[0] : null;
      return j ? a(j)(m) : m;
    });
  }
  const linkify = s=>String(s == null ? '' : s).split(/(https?:\/\/[^\s<]+)/g).map((part, i)=>i % 2 ? `<a href="${esc(part)}" target="_blank" rel="noopener">${esc(part)}</a>` : homeLinks(esc(part))).join('');
  const initials = n=>String(n || '?').split(/[\s(@.]+/).filter(Boolean).slice(0, 2).map(w=>w[0].toUpperCase()).join('') || '?';
  function when(iso){
    const d = new Date(iso); if(isNaN(d)) return '';
    const mins = Math.round((Date.now() - d) / 60000);
    if(mins < 1) return 'now';
    if(mins < 60) return mins + 'm';
    if(d.toDateString() === new Date().toDateString()) return d.toLocaleTimeString(undefined, { hour:'numeric', minute:'2-digit' });
    return d.toLocaleDateString(undefined, { month:'short', day:'numeric' });
  }
  const clock = iso=>{ const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString(undefined, { hour:'numeric', minute:'2-digit' }); };
  const dayOf = iso=>{ const d = new Date(iso); if(isNaN(d)) return ''; const t = new Date(); const y = new Date(Date.now() - 864e5);
    return d.toDateString() === t.toDateString() ? 'Today' : d.toDateString() === y.toDateString() ? 'Yesterday' : d.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' }); };

  let me = null, myName = '', db = null, chats = [], staff = null, view = 'list', openId = '', msgs = [], stopMsgs = null, picked = new Set(), find = '';

  /* ---- who's who ---- */
  async function loadStaff(){
    if(staff) return staff;
    try{
      const token = await me.getIdToken();
      const r = await fetch(HUB_API, { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer ' + token }, body: JSON.stringify({ action:'staff' }) });
      const d = await r.json(); staff = (d.staff || []).filter(s=>s.uid);
    } catch(err){ console.error('chat: could not load the team', err); staff = []; }
    const mine = staff.find(s=>s.uid === me.uid); if(mine) myName = mine.name;
    return staff;
  }
  const nameOf = (c, uid)=>(c && c.names && c.names[uid]) || ((staff || []).find(s=>s.uid === uid) || {}).name || 'Someone';
  const others = c=>(c.members || []).filter(u=>u !== me.uid);
  const chatTitle = c=>c.title || others(c).map(u=>nameOf(c, u)).join(', ') || 'Just you';
  const unread = c=>!!c.lastAt && c.lastBy !== me.uid && (c.lastAt > ((c.read || {})[me.uid] || ''));

  /* ---- the chat list (always listening, for the red count) ---- */
  firebase.auth().onAuthStateChanged(user=>{
    const ok = !!user && !user.isAnonymous;
    btn.classList.toggle('show', ok);
    if(!ok || (me && me.uid === user.uid)) return;
    me = user; myName = user.displayName || String(user.email || '').split('@')[0]; db = firebase.firestore();
    db.collection('chats').where('members', 'array-contains', me.uid).onSnapshot(s=>{
      chats = s.docs.map(d=>({ id: d.id, ...d.data() })).sort((a, b)=>String(b.lastAt || b.createdAt || '').localeCompare(String(a.lastAt || a.createdAt || '')));
      const n = chats.filter(unread).length;
      document.getElementById('hubChatCount').textContent = n > 9 ? '9+' : n;
      btn.classList.toggle('has', n > 0);
      window.dispatchEvent(new CustomEvent('hubchat', { detail: { unread: n, chats: chats.filter(unread).map(c=>({ id: c.id, title: chatTitle(c), lastText: c.lastText || '', lastByName: c.lastByName || '', lastAt: c.lastAt || '' })) } }));
      if(panel.classList.contains('show')){ if(view === 'list') draw(); else if(view === 'chat'){ drawHead(); markRead(); } }
    }, err=>console.error('chat list error (is the chats security rule published?)', err));
  });

  /* ---- drawing ---- */
  function draw(){
    if(view === 'chat') return drawChat();
    if(view === 'new') return drawNew();
    panel.innerHTML = `<div class="hc-top"><h3>Chat</h3><button type="button" class="hc-b primary" data-hc="new">+ New chat</button><button type="button" class="hc-b" data-hc="close">Close</button></div>
      <div class="hc-body">${chats.length ? chats.map(c=>{ const g = c.group || others(c).length > 1;
        return `<div class="hc-row ${unread(c) ? 'unread' : ''}" data-chat="${esc(c.id)}"><div class="hc-av ${g ? 'g' : ''}">${g ? '&#9679;&#9679;' : esc(initials(chatTitle(c)))}</div>
          <div class="hc-main"><div class="hc-name">${esc(chatTitle(c))}</div><div class="hc-last">${c.lastText ? esc((c.lastBy === me.uid ? 'You: ' : g && c.lastByName ? c.lastByName.split(' ')[0] + ': ' : '') + c.lastText) : '<i>No messages yet</i>'}</div></div>
          <div class="hc-time">${esc(when(c.lastAt || c.createdAt))}</div></div>`; }).join('')
        : '<div class="hc-none">No chats yet.<br>Press <b>+ New chat</b> to send someone a quick message.</div>'}</div>`;
  }
  async function drawNew(){
    panel.innerHTML = `<div class="hc-top"><button type="button" class="hc-b" data-hc="back">&#8249; Back</button><h3>New chat</h3></div><div class="hc-body"><div class="hc-none">Loading the team…</div></div>`;
    await loadStaff();
    if(view !== 'new') return;
    panel.innerHTML = `<div class="hc-top"><button type="button" class="hc-b" data-hc="back">&#8249; Back</button><h3>New chat<small>Pick one person, or several for a group</small></h3></div>
      <input type="text" class="hc-find" id="hcFind" placeholder="Find a name…" value="${esc(find)}" autocomplete="off">
      <div class="hc-body hc-pick" id="hcPick"></div>
      <div class="hc-newbar">${''}<input type="text" id="hcTitle" placeholder="Group name (optional)" style="display:none" maxlength="60">
        <button type="button" class="hc-b primary" data-hc="start" id="hcStart" disabled>Start chat</button></div>`;
    drawPick();
    const f = document.getElementById('hcFind'); f.focus();
  }
  function drawPick(){
    const box = document.getElementById('hcPick'); if(!box) return;
    const list = staff.filter(s=>s.uid !== me.uid && (!find || s.name.toLowerCase().includes(find.toLowerCase()) || String(s.email || '').toLowerCase().includes(find.toLowerCase())));
    box.innerHTML = list.length ? list.map(s=>`<label><input type="checkbox" data-pick="${esc(s.uid)}" ${picked.has(s.uid) ? 'checked' : ''}><span class="hc-av">${esc(initials(s.name))}</span><span>${esc(s.name)}</span></label>`).join('') : '<div class="hc-none">Nobody by that name.</div>';
    const st = document.getElementById('hcStart'), t = document.getElementById('hcTitle');
    st.disabled = !picked.size; st.textContent = picked.size > 1 ? `Start a group chat (${picked.size + 1} people)` : 'Start chat';
    t.style.display = picked.size > 1 ? '' : 'none';
  }
  function drawHead(){
    const c = chats.find(x=>x.id === openId); if(!c) return;
    const h = panel.querySelector('.hc-top h3');
    if(h) h.innerHTML = esc(chatTitle(c)) + (c.group || others(c).length > 1 ? `<small>${esc([myName || 'You', ...others(c).map(u=>nameOf(c, u))].join(', '))}</small>` : '');
  }
  function drawChat(){
    panel.innerHTML = `<div class="hc-top"><button type="button" class="hc-b" data-hc="back">&#8249; Chats</button><h3></h3><button type="button" class="hc-b" data-hc="close">Close</button></div>
      <div class="hc-body" id="hcBody"><div class="hc-msgs" id="hcMsgs"></div></div>
      <div class="hc-send"><textarea id="hcText" rows="1" placeholder="Type a message… (a lot like AP 423 becomes a link)" maxlength="2000"></textarea><button type="button" class="hc-b primary" data-hc="send">Send</button></div>`;
    drawHead(); drawMsgs();
    document.getElementById('hcText').focus();
  }
  function drawMsgs(){
    const box = document.getElementById('hcMsgs'); if(!box) return;
    const c = chats.find(x=>x.id === openId) || {}, g = c.group || others(c).length > 1;
    let lastDay = '', lastBy = '';
    box.innerHTML = msgs.length ? msgs.map(m=>{
      const d = dayOf(m.at), mine = m.by === me.uid;
      const head = (d !== lastDay ? `<div class="hc-day">${esc(d)}</div>` : '') + (g && !mine && (m.by !== lastBy || d !== lastDay) ? `<div class="hc-who">${esc(m.byName || nameOf(c, m.by))}</div>` : '');
      lastDay = d; lastBy = m.by;
      return head + `<div class="hc-msg ${mine ? 'me' : ''}">${linkify(m.text)}<time>${esc(clock(m.at))}</time></div>`;
    }).join('') : '<div class="hc-none">Say hello 👋</div>';
    const body = document.getElementById('hcBody'); body.scrollTop = body.scrollHeight;
  }

  /* ---- actions ---- */
  function markRead(){
    const c = chats.find(x=>x.id === openId);
    if(c && unread(c) && document.visibilityState === 'visible') db.collection('chats').doc(c.id).update('read.' + me.uid, new Date().toISOString()).catch(err=>console.error('chat: mark read', err));
  }
  function openChat(id){
    view = 'chat'; openId = id; msgs = [];
    if(stopMsgs) stopMsgs();
    panel.classList.add('show');
    loadHomes();
    drawChat();
    stopMsgs = db.collection('chats').doc(id).collection('messages').orderBy('at').limitToLast(200).onSnapshot(s=>{
      msgs = s.docs.map(d=>({ id: d.id, ...d.data() }));
      drawMsgs(); markRead();
      loadHomes().then(()=>{ if(openId === id) drawMsgs(); });
    }, err=>console.error('chat messages error', err));
    markRead();
  }
  async function send(){
    const ta = document.getElementById('hcText'), text = ta.value.trim(); if(!text || !openId) return;
    ta.value = ''; ta.style.height = '';
    const at = new Date().toISOString(), ref = db.collection('chats').doc(openId);
    if(!myName || myName === String(me.email || '').split('@')[0]) await loadStaff();
    try{
      await ref.collection('messages').add({ text: text.slice(0, 2000), by: me.uid, byName: myName, at });
      await ref.update('lastText', text.slice(0, 140), 'lastAt', at, 'lastBy', me.uid, 'lastByName', myName, 'read.' + me.uid, at);
    } catch(err){ console.error('chat send', err); ta.value = text; alert('Couldn\'t send it. Check your connection and try again.'); }
  }
  async function start(){
    const ids = [...picked], group = ids.length > 1;
    // one person you already have a chat with → that chat
    if(!group){ const c = chats.find(x=>!x.group && others(x).length === 1 && others(x)[0] === ids[0]); if(c){ picked.clear(); openChat(c.id); return; } }
    await loadStaff();
    const members = [me.uid, ...ids], names = {};
    members.forEach(u=>{ names[u] = u === me.uid ? myName : nameOf(null, u); });
    const at = new Date().toISOString(), title = group ? String((document.getElementById('hcTitle') || {}).value || '').trim().slice(0, 60) : '';
    try{
      const ref = await db.collection('chats').add({ members, names, group, title, createdAt: at, createdBy: me.uid, lastText: '', lastAt: '', lastBy: '', lastByName: '', read: { [me.uid]: at } });
      picked.clear(); find = '';
      chats = [{ id: ref.id, members, names, group, title, createdAt: at, read: {} }, ...chats.filter(x=>x.id !== ref.id)];
      openChat(ref.id);
    } catch(err){ console.error('chat start', err); alert('Couldn\'t start the chat. (If this keeps happening, the chat security rule may not be published yet.)'); }
  }
  function close(){ panel.classList.remove('show'); if(stopMsgs){ stopMsgs(); stopMsgs = null; } openId = ''; view = 'list'; }

  btn.addEventListener('click', e=>{ e.stopPropagation(); if(panel.classList.contains('show')){ close(); return; } view = 'list'; panel.classList.add('show'); draw(); loadStaff(); });
  panel.addEventListener('click', e=>{
    const a = e.target.closest('[data-hc]'), row = e.target.closest('[data-chat]');
    if(row){ openChat(row.dataset.chat); return; }
    if(!a) return;
    const k = a.dataset.hc;
    if(k === 'close') close();
    else if(k === 'back'){ if(stopMsgs){ stopMsgs(); stopMsgs = null; } openId = ''; view = 'list'; draw(); }
    else if(k === 'new'){ view = 'new'; picked.clear(); find = ''; draw(); }
    else if(k === 'start') start();
    else if(k === 'send') send();
  });
  panel.addEventListener('change', e=>{ const p = e.target.closest('[data-pick]'); if(p){ if(p.checked) picked.add(p.dataset.pick); else picked.delete(p.dataset.pick); drawPick(); } });
  panel.addEventListener('input', e=>{
    if(e.target.id === 'hcFind'){ find = e.target.value; drawPick(); }
    if(e.target.id === 'hcText'){ e.target.style.height = ''; e.target.style.height = Math.min(120, e.target.scrollHeight) + 'px'; }
  });
  panel.addEventListener('keydown', e=>{
    if(e.target.id === 'hcText' && e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); send(); }
    if(e.key === 'Escape'){ e.stopPropagation(); close(); }
  });
  document.addEventListener('visibilitychange', ()=>{ if(view === 'chat') markRead(); });

  window.hubChat = { linkify, loadHomes, open: id=>{ if(me) openChat(id); }, show: ()=>{ if(me){ view = 'list'; panel.classList.add('show'); draw(); } } };
  // a link like any-page.html#chat=<id> opens that chat
  const m = location.hash.match(/chat=([\w-]+)/);
  if(m) firebase.auth().onAuthStateChanged(u=>{ if(u && !u.isAnonymous) setTimeout(()=>openChat(m[1]), 300); });
})();
