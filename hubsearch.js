/* ============================================================
   HUB SEARCH — a search button in the header of every staff page.

   A page gets it with a single line just before </body>:   <script src="hubsearch.js"></script>
   (It needs the page to have signed in with Firebase already, which every staff page does.)

   The header only carries a small magnifying-glass button, so it takes no room until it's
   wanted. Pressing it (or the "/" key) opens a search box over the page. Type a name, lot,
   address, vendor or a few words: it finds homes (finished ones too), service requests,
   notes, punch list items and vendors, and each result says what it is.
   The lists are fetched the first time the box is opened, then refreshed every couple of
   minutes while it stays in use — nothing loads on pages where nobody searches.
   ============================================================ */
(function(){
  const bar = document.querySelector('.titlebar');
  if(!bar || document.getElementById('hubSearchBtn') || typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) return;

  const css = `
  .hub-search-btn{display:none; align-items:center; gap:6px; background:transparent; border:1px solid var(--steel-line, #d4d2c8); color:var(--ink-soft, #6b6f72); height:30px; padding:0 10px; border-radius:var(--radius, 3px); cursor:pointer; font-size:11.5px; font-family:inherit;}
  .hub-search-btn.show{display:inline-flex;}
  .hub-search-btn:hover{background:#f3f1ea; color:var(--navy, #4B4F54);}
  .hub-search-back{position:fixed; inset:0; z-index:150; background:rgba(30,32,34,.45); display:none; align-items:flex-start; justify-content:center; padding:9vh 14px 14px;}
  .hub-search-back.show{display:flex;}
  .hub-search-panel{width:100%; max-width:600px; background:var(--paper-2, #fff); border-radius:10px; box-shadow:0 20px 60px rgba(0,0,0,.35); border-top:4px solid var(--rust, #A3AA83); overflow:hidden; font-family:-apple-system,"Segoe UI","Helvetica Neue",Arial,sans-serif; color:var(--ink, #33363a); text-align:left;}
  .hub-search-panel, .hub-search-panel *{box-sizing:border-box;}
  .hub-search-top{position:relative; display:flex; align-items:center; gap:8px; padding:12px 12px 12px 14px;}
  .hub-search-top svg{flex:none; opacity:.55;}
  .hub-search-top input{flex:1; min-width:0; border:none; outline:none; font-size:17px; padding:6px 4px; background:transparent; color:var(--ink, #33363a); font-family:inherit;}
  .hub-search-top button{flex:none; border:1px solid var(--steel-line, #d4d2c8); background:#fff; color:var(--ink-soft, #6b6f72); border-radius:var(--radius, 3px); padding:5px 10px; font-size:12px; cursor:pointer; font-family:inherit;}
  .hub-results{border-top:1px solid #ece8dd; max-height:min(62vh, 520px); overflow-y:auto;}
  .hub-result{display:flex; align-items:flex-start; gap:10px; padding:11px 14px; border-top:1px solid #f1ede3; text-decoration:none; color:inherit; cursor:pointer;}
  .hub-result:first-child{border-top:none;}
  .hub-result:hover, .hub-result.on{background:#f3f5ee;}
  .hub-result .hs-main{flex:1; min-width:0;}
  .hub-result .hs-t{font-size:14.5px; font-weight:600; color:var(--navy, #4B4F54); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
  .hub-result .hs-m{font-size:12.5px; color:var(--ink-soft, #6b6f72); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
  .hub-result .hs-kind{flex:none; align-self:center; font-size:10.5px; font-weight:700; letter-spacing:.3px; text-transform:uppercase; border-radius:20px; padding:2px 9px; background:#ece8dd; color:var(--ink-soft, #6b6f72);}
  .hub-result .hs-kind.home{background:#e6ecf5; color:#3b5a8a;}
  .hub-result .hs-kind.service{background:#fdf0dc; color:#96661a;}
  .hub-result .hs-kind.vendor{background:#eaf1ec; color:var(--good, #3f7a4e);}
  .hub-none{padding:18px 14px; font-size:13.5px; color:var(--ink-soft, #6b6f72); text-align:center;}`;
  document.head.insertAdjacentHTML('beforeend', '<style>' + css + '</style>');

  const GLASS = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
  // the button goes with the other small header buttons
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'hub-search-btn';
  btn.id = 'hubSearchBtn';
  btn.title = 'Search the hub';
  btn.setAttribute('aria-label', 'Search the hub');
  btn.innerHTML = GLASS + '<span>Search</span>';
  const account = bar.querySelector('.titlebar-account');
  if(account) account.insertBefore(btn, account.firstChild); else bar.appendChild(btn);

  document.body.insertAdjacentHTML('beforeend', `<div class="hub-search-back" id="hubSearchBack">
    <div class="hub-search-panel" role="dialog" aria-label="Search the hub">
      <div class="hub-search-top">${GLASS.replace('15" height="15"', '19" height="19"')}
        <input type="text" id="hubSearchInput" placeholder="Search homes, requests, notes, vendors…" autocomplete="off" aria-label="Search the hub">
        <button type="button" id="hubSearchClose">Close</button>
      </div>
      <div class="hub-results" id="hubResults"><div class="hub-none">Type a name, a lot number, an address or a vendor.</div></div>
    </div>
  </div>`);
  const back = document.getElementById('hubSearchBack'), input = document.getElementById('hubSearchInput'), results = document.getElementById('hubResults');

  function esc(s){
    return (s==null?'':String(s)).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  // only signed-in staff get it (homeowners on the request form are anonymous)
  let allowed = false;
  firebase.auth().onAuthStateChanged(user=>{ allowed = !!user && !user.isAnonymous; btn.classList.toggle('show', allowed); if(!allowed) close(); });

  function open(){
    if(!allowed) return;
    back.classList.add('show');
    input.value = '';
    draw();
    input.focus();
    load().then(draw);
  }
  function close(){ back.classList.remove('show'); }
  btn.addEventListener('click', open);
  document.getElementById('hubSearchClose').addEventListener('click', close);
  back.addEventListener('click', e=>{ if(e.target === back) close(); });
  // "/" opens it from anywhere on the page, unless someone is typing in a box
  document.addEventListener('keydown', e=>{
    if(e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || back.classList.contains('show')) return;
    const t = e.target, tag = t && t.tagName;
    if(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
    e.preventDefault();
    open();
  });

  /* ---- the lists it searches ---- */
  let data = null, loadedAt = 0, loading = null;
  function homeLabel(j){ return [j.community, j.lot ? 'Lot ' + j.lot : '', j.client].filter(Boolean).join(' · ') || 'Unnamed home'; }
  function today(){ const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function shortDay(iso){ const d = new Date(iso && iso.length > 10 ? iso : iso + 'T12:00:00'); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { month:'short', day:'numeric', year:'2-digit' }); }
  function load(){
    if(data && Date.now() - loadedAt < 120000) return Promise.resolve();
    if(loading) return loading;
    const db = firebase.firestore();
    const get = name=>db.collection(name).get().then(s=>s.docs.map(d=>({ id: d.id, ...d.data() }))).catch(err=>{ console.error('search could not read ' + name, err); return []; });
    loading = Promise.all([get('jobs'), get('service-requests'), get('notes'), get('subs')]).then(([jobs, requests, notes, subs])=>{
      data = { jobs, requests, notes, subs };
      loadedAt = Date.now();
      loading = null;
    });
    return loading;
  }

  /* ---- matching: every word typed has to appear somewhere in the item ---- */
  function find(q){
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hit = text=>{ const t = String(text || '').toLowerCase(); return words.every(w=>t.includes(w)); };
    const now = today();
    const out = [];
    data.jobs.filter(j=>hit([j.community, j.lot ? 'lot ' + j.lot : '', j.lot, j.client, j.address, j.model, j.phone, j.email].join(' '))).forEach(j=>{
      const done = j.settle && j.settle < now;
      out.push({ rank: done ? 1 : 0, kind: 'Home', cls: 'home', title: homeLabel(j), meta: [j.address, j.model, j.settle ? (done ? 'settled ' : 'settles ') + shortDay(j.settle) : ''].filter(Boolean).join(' · '),
        href: 'house.html?id=' + encodeURIComponent(j.id) });
    });
    data.subs.filter(v=>hit([v.name, v.contact, v.phone, v.email, v.trade].join(' '))).forEach(v=>{
      out.push({ rank: 2, kind: 'Vendor', cls: 'vendor', title: v.name || 'Unnamed vendor', meta: [v.contact, v.phone, v.email].filter(Boolean).join(' · ') || 'No contact details yet',
        href: 'construction.html?vendor=' + encodeURIComponent(v.id) });
    });
    data.requests.filter(r=>hit([r.name, r.address, r.lot ? 'lot ' + r.lot : '', r.phone, r.email, r.description, r.vendorName].join(' '))).forEach(r=>{
      out.push({ rank: r.status === 'sent' ? 4 : 3, at: r.submittedAt || '', kind: 'Service', cls: 'service', title: r.description || 'Service request',
        meta: [r.name, r.address, r.status === 'sent' ? 'complete' : (r.status === 'in-progress' ? 'in progress' : 'new'), shortDay(r.submittedAt || '')].filter(Boolean).join(' · '),
        href: 'service.html?open=' + encodeURIComponent(r.id) });
    });
    data.notes.filter(n=>hit([n.text, (n.replies || []).map(x=>x.text).join(' '), n.houseLabel, (n.by || {}).name, (n.mentionNames || []).join(' ')].join(' '))).forEach(n=>{
      const who = (n.by && n.by.name) || 'Someone';
      out.push({ rank: n.todo ? (n.done ? 7 : 5) : 6, at: n.lastAt || n.at || '', kind: n.todo ? 'Punch list' : 'Note', cls: '', title: n.text || '',
        meta: [n.todo ? (n.done ? 'done' : 'open') : 'by ' + who, n.houseId ? (n.houseLabel || 'a home') : 'General', shortDay(n.at || '')].filter(Boolean).join(' · '),
        href: n.houseId ? 'house.html?id=' + encodeURIComponent(n.houseId) + '#notes' : 'punch.html' });
    });
    // homes first, then vendors, service requests, punch items and notes — newest first inside each
    out.sort((a, b)=>a.rank - b.rank || (b.at || '').localeCompare(a.at || ''));
    return out;
  }

  let active = -1, shown = [];
  function draw(){
    const q = input.value.trim();
    shown = []; active = -1;
    if(q.length < 2){ results.innerHTML = '<div class="hub-none">Type a name, a lot number, an address or a vendor.</div>'; return; }
    if(!data){ results.innerHTML = '<div class="hub-none">Searching…</div>'; return; }
    const all = find(q);
    shown = all.slice(0, 25);
    active = shown.length ? 0 : -1;
    results.innerHTML = shown.length
      ? shown.map((r, i)=>`<a class="hub-result${i === active ? ' on' : ''}" href="${esc(r.href)}">
          <span class="hs-main"><div class="hs-t">${esc(r.title)}</div><div class="hs-m">${esc(r.meta)}</div></span>
          <span class="hs-kind ${r.cls}">${esc(r.kind)}</span></a>`).join('')
        + (all.length > shown.length ? `<div class="hub-none">${all.length - shown.length} more — add another word to narrow it down.</div>` : '')
      : '<div class="hub-none">Nothing found. Try a name, a lot number, an address or a vendor.</div>';
  }
  input.addEventListener('input', ()=>{ load().then(draw); draw(); });
  input.addEventListener('keydown', e=>{
    if(e.key === 'Escape'){ close(); return; }
    if(!shown.length) return;
    if(e.key === 'ArrowDown' || e.key === 'ArrowUp'){
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : shown.length - 1)) % shown.length;
      results.querySelectorAll('.hub-result').forEach((el, i)=>{ el.classList.toggle('on', i === active); if(i === active) el.scrollIntoView({ block: 'nearest' }); });
    } else if(e.key === 'Enter' && active >= 0){
      e.preventDefault();
      location.href = shown[active].href;
    }
  });
})();
