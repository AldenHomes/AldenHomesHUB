/* The hub's "new look" (owner, 2026-10-29): an Apple-style skin over every staff page.
   Phones always get it. Computers get it too unless the person switches it off (owner, 2026-11-02: default for everyone) — saved on this
   device in localStorage 'hubTheme' and in settings/hub-prefs[uid].theme so it follows them (index.html copies it back).
   The styles live in apple.css, all under html.apple, so the classic look is untouched when it's off.
   Phones get a bottom bar (Hub · Homes · My work · Chat · Settings); computers get a slim app bar on the left inside apps
   (not on the hub home, where the live tiles are the way in). Customer screens (?present / ?quote / ?show) are left alone. */
(function(){
  if(/[?&](present|quote|show)=/.test(location.search)) return;
  const root = document.documentElement;
  const phoneMQ = window.matchMedia('(max-width: 760px)');
  const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const isHub = page === 'index.html' || page === '';
  root.classList.add('pg-' + page.replace('.html', '').replace(/[^a-z0-9-]/g, ''));
  const pref = ()=>{ try{ return localStorage.getItem('hubTheme') || ''; } catch(e){ return ''; } };
  // on for everyone by default (owner, 2026-11-02); 'classic' = this person switched it off on computers
  const on = ()=>phoneMQ.matches || pref() !== 'classic';

  const APPS = [
    ['schedule.html', 'Production Schedule', '#4B4F54', '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'],
    ['construction.html', 'Construction', '#A0715A', '<path d="M3 21h18M5 21V10l7-6 7 6v11"/><path d="M10 21v-6h4v6"/>'],
    ['punch.html', 'Punch List', '#6B7355', '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>'],
    ['service.html', 'Service Center', '#5B7083', '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>'],
    ['selections.html', 'Selections', '#7A6A80', '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="8" r="1.3"/><circle cx="8" cy="13" r="1.3"/><circle cx="16" cy="13" r="1.3"/>'],
    ['invoices.html', 'Invoices', '#9C5B4A', '<path d="M7 3h8l4 4v14H7z"/><path d="M10 12h6M10 16h4"/>'],
    ['permits.html', 'Permits', '#8C9470', '<path d="M6 3h9l3 3v15H6z"/><path d="M9 13l2 2 4-4"/>'],
    ['jobcost.html', 'Job Costing', '#4F7A7A', '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'],
    ['history.html', 'Cost History', '#6E7C8C', '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'],
    ['packets.html', 'Sales Packets', '#B88A3E', '<path d="M4 7h16v13H4z"/><path d="M9 7V4h6v3"/>'],
  ];
  const svg = (p, w)=>`<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const ICON = {
    hub: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    homes: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    work: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  };
  let unread = 0;

  function classes(){
    const yes = on();
    root.classList.toggle('apple', yes);
    root.classList.toggle('phone', yes && phoneMQ.matches);
    root.classList.toggle('desk', yes && !phoneMQ.matches);
    root.classList.toggle('apple-hub', yes && isHub);
    return yes;
  }
  classes();

  function chatBtn(cls, size){
    return `<button type="button" class="${cls}" data-ab-chat aria-label="Chat">${svg(ICON.chat, size)}<span class="ab-badge" data-ab-unread${unread ? '' : ' hidden'}>${unread || ''}</span>${cls === 'ab-tab' ? '<span>Chat</span>' : ''}</button>`;
  }
  function build(){
    document.querySelectorAll('.ab-bar, .ab-rail').forEach(x=>x.remove());
    if(!classes() || !document.body) return;
    if(phoneMQ.matches){
      const tab = (href, icon, label, here)=>`<a class="ab-tab${here ? ' here' : ''}" href="${href}">${svg(ICON[icon], 24)}<span>${label}</span></a>`;
      const bar = document.createElement('nav');
      bar.className = 'ab-bar'; bar.setAttribute('aria-label', 'Main');
      bar.innerHTML = tab('index.html', 'hub', 'Hub', isHub && location.hash !== '#homes')
        + tab('index.html#homes', 'homes', 'Homes', page === 'house.html' || (isHub && location.hash === '#homes'))
        + tab('mywork.html', 'work', 'My work', page === 'mywork.html')
        + chatBtn('ab-tab', 24)
        + tab('admin.html', 'gear', 'Settings', page === 'admin.html');
      document.body.appendChild(bar);
    } else {
      // on the hub home the live tiles are the way into the apps, so its bar has only My work / Chat / Settings (owner, 2026-11-02)
      const rail = document.createElement('nav');
      rail.className = 'ab-rail'; rail.setAttribute('aria-label', isHub ? 'Shortcuts' : 'Apps');
      rail.innerHTML = `<a class="ab-app ab-home" href="index.html" title="Hub" aria-label="Hub"><img src="icons/icon-192.png" alt=""></a>`
        + (isHub ? [] : APPS).map(([href, name, color, p])=>`<a class="ab-app${page === href ? ' here' : ''}" href="${href}" title="${name}" aria-label="${name}"><span style="background:${color}">${svg(p, 17)}</span></a>`).join('')
        + '<span class="ab-grow"></span>'
        + `<a class="ab-app ab-plain${page === 'mywork.html' ? ' here' : ''}" href="mywork.html" title="My work" aria-label="My work">${svg(ICON.work, 21)}</a>`
        + chatBtn('ab-app ab-plain', 21)
        + `<a class="ab-app ab-plain${page === 'admin.html' ? ' here' : ''}" href="admin.html" title="Settings" aria-label="Settings">${svg(ICON.gear, 21)}</a>`;
      document.body.appendChild(rail);
    }
  }
  function crumbs(){
    const back = document.querySelector('a.back-link');
    // phones, a home's page: "‹ Homes" back to the homes list (the hub's back link is hidden on phones)
    if(page === 'house.html' && back && !document.querySelector('.ab-back')){
      const b = document.createElement('a'); b.className = 'ab-back'; b.href = 'index.html#homes'; b.textContent = '‹ Homes';
      back.parentNode.insertBefore(b, back);
    }
    if(!back || !root.classList.contains('desk') || isHub){ document.querySelectorAll('.ab-crumbs').forEach(c=>{ c.remove(); }); if(back) back.style.display = ''; return; }
    let c = document.querySelector('.ab-crumbs');
    if(!c){ c = document.createElement('nav'); c.className = 'ab-crumbs'; c.setAttribute('aria-label', 'You are here'); back.parentNode.insertBefore(c, back); }
    back.style.display = 'none';
    const app = APPS.find(a=>a[0] === page);
    const name = app ? app[1] : page === 'mywork.html' ? 'My work' : page === 'admin.html' ? 'Settings' : (document.querySelector('.titlebar h1') || {}).textContent || '';
    if(page === 'house.html'){
      const t = (document.getElementById('hTitle') || {}).textContent || 'Home';
      c.innerHTML = `<a href="index.html">Hub</a><span>›</span><a href="index.html#homes">Homes</a><span>›</span><b></b>`;
      c.querySelector('b').textContent = t;
    } else {
      c.innerHTML = '<a href="index.html">Hub</a><span>›</span><b></b>';
      c.querySelector('b').textContent = name;
    }
  }
  function hubTouches(){
    if(!isHub || !root.classList.contains('apple')) return;
    const aside = document.querySelector('.homes-card'); if(aside) aside.id = 'homes';
    const h2 = document.querySelector('.welcome h2');
    if(h2 && !h2.dataset.ab){
      h2.dataset.ab = '1';
      const hr = new Date().getHours();
      h2.textContent = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
      const eye = document.createElement('div'); eye.className = 'ab-date';
      eye.textContent = new Date().toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric' });
      h2.parentNode.insertBefore(eye, h2);
    }
    if(location.hash === '#homes' && aside) setTimeout(()=>aside.scrollIntoView({ behavior:'smooth', block:'start' }), 300);
  }

  /* A home's page in the new look (owner, 2026-10-29): one section at a time — Overview / Schedule / Photos / Costs — instead of one
     long page. Cards are tagged by what they hold; a card added later (Permits) is tagged as it appears. A link to a card
     (#costs, #permitsCard, #coCard, #photosCard…) opens the section that card is in. */
  const SECS = [['overview', 'Overview'], ['schedule', 'Schedule'], ['photos', 'Photos'], ['costs', 'Costs']];
  const secOf = card=>{
    const id = card.id || '';
    if(id === 'photosCard' || id === 'plansCard') return 'photos';
    if(id === 'costs' || id === 'invCard') return 'costs';
    if(card.querySelector('#schedBody, #ordersBody')) return 'schedule';
    return 'overview';
  };
  let homeSec = 'overview';
  function houseSections(){
    if(page !== 'house.html') return;
    const cards = document.querySelector('#home .cards');
    if(!cards) return;
    let bar = document.querySelector('.ab-seg');
    if(!root.classList.contains('apple')){ if(bar) bar.remove(); cards.removeAttribute('data-show'); return; }
    [...cards.children].forEach(c=>{ if(c.classList.contains('card') && !c.dataset.sec) c.dataset.sec = secOf(c); });
    if(!bar){
      bar = document.createElement('div'); bar.className = 'ab-seg'; bar.setAttribute('role', 'tablist'); bar.setAttribute('aria-label', 'Sections');
      bar.innerHTML = SECS.map(([k, t])=>`<button type="button" role="tab" data-sec-btn="${k}">${t}</button>`).join('');
      cards.parentNode.insertBefore(bar, cards);
      bar.addEventListener('click', e=>{ const b = e.target.closest('[data-sec-btn]'); if(b){ homeSec = b.dataset.secBtn; showSec(); } });
      new MutationObserver(()=>houseSections()).observe(cards, { childList: true });
      // links into a section: the hash names a card
      const fromHash = ()=>{ const t = location.hash && document.getElementById(location.hash.slice(1)); const c = t && t.closest('#home .cards > .card'); if(c){ homeSec = c.dataset.sec || secOf(c); showSec(); } };
      window.addEventListener('hashchange', fromHash); setTimeout(fromHash, 600);
    }
    showSec();
  }
  /* Punch List on a phone (owner, 2026-11-02): the add box is folded away, like Reminders — a "+ New item" button at the bottom
     opens it (and puts the cursor in it); "Done" folds it away again. Computers keep the box open. */
  function punchNewItem(){
    if(page !== 'punch.html') return;
    const add = document.querySelector('.add');
    let pill = document.querySelector('.ab-new');
    const phoneOn = root.classList.contains('apple') && phoneMQ.matches;
    if(!add){ return; }
    if(!phoneOn){ add.classList.remove('ab-fold'); if(pill) pill.remove(); return; }
    if(!add.dataset.abFold){
      add.dataset.abFold = '1'; add.classList.add('ab-fold');
      const done = document.createElement('button'); done.type = 'button'; done.className = 'ab-fold-done'; done.textContent = 'Done';
      done.addEventListener('click', ()=>{ add.classList.add('ab-fold'); punchNewItem(); });
      add.insertBefore(done, add.firstChild);
    }
    if(!pill){
      pill = document.createElement('button'); pill.type = 'button'; pill.className = 'ab-new';
      pill.innerHTML = '<span aria-hidden="true">+</span> New item';
      pill.addEventListener('click', ()=>{
        add.classList.remove('ab-fold'); punchNewItem();
        add.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const t = document.getElementById('newText'); if(t) setTimeout(()=>t.focus(), 250);
      });
      const at = document.querySelector('.filters') || document.getElementById('openList');
      at.parentNode.insertBefore(pill, at);
    }
    pill.hidden = !add.classList.contains('ab-fold');
  }

  /* Punch List on an iPhone (owner, 2026-11-02: "the workers here all have iPhones… feel natural"):
     swipe an item left → Done (green) + Delete (red), a long swipe checks it off; tap an item → its options (Edit, date, photo,
     priority) show, otherwise they're hidden. The buttons press the item's own check / delete buttons, so the page's rules apply. */
  let swipeOn = false;
  /* phones: the mic button slides away while scrolling down (reading) and comes back on any scroll up or at the top / bottom (owner, 2026-11-02) */
  function fabTuck(){
    if(fabTuck.on) return; fabTuck.on = true;
    let y = window.scrollY;
    window.addEventListener('scroll', ()=>{
      if(!root.classList.contains('phone')){ root.classList.remove('ab-fab-away'); return; }
      const now = window.scrollY, d = now - y, end = now + window.innerHeight >= document.documentElement.scrollHeight - 40;
      if(Math.abs(d) < 6) return;
      root.classList.toggle('ab-fab-away', d > 0 && now > 80 && !end);
      y = now;
    }, { passive: true });
  }
  function punchSwipe(){
    if(page !== 'punch.html' || swipeOn) return;
    swipeOn = true;
    let it = null, x0 = 0, y0 = 0, dx = 0, dragging = false, decided = false;
    const W = 156;                         // two 78px buttons
    const usable = ()=>root.classList.contains('apple') && phoneMQ.matches;
    const close = el=>{ if(!el) return; el.style.setProperty('--sx', '0px'); el.classList.remove('ab-swiped'); const a = el.querySelector('.ab-sw'); if(a) a.style.width = '0px'; };
    const actions = el=>{
      let a = el.querySelector('.ab-sw');
      if(!a){
        const done = el.classList.contains('done');
        a = document.createElement('div'); a.className = 'ab-sw';
        a.innerHTML = `<button type="button" class="ab-sw-done">${done ? 'Undo' : 'Done'}</button><button type="button" class="ab-sw-del">Delete</button>`;
        el.appendChild(a);
      }
      return a;
    };
    document.addEventListener('touchstart', e=>{
      if(!usable()) return;
      const el = e.target.closest('#openList .item:not(.item-edit), #doneList .item:not(.item-edit)');
      document.querySelectorAll('.item.ab-swiped').forEach(o=>{ if(o !== el) close(o); });
      if(!el || e.target.closest('.ab-sw, input, textarea, select, a')) { it = null; return; }
      it = el; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; dragging = false; decided = false;
    }, { passive: true });
    document.addEventListener('touchmove', e=>{
      if(!it) return;
      const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
      if(!decided){ if(Math.abs(mx) < 8 && Math.abs(my) < 8) return; decided = true; dragging = Math.abs(mx) > Math.abs(my) * 1.2; if(!dragging){ it = null; return; } }
      const start = it.classList.contains('ab-swiped') ? -W : 0;
      dx = Math.min(0, start + mx);
      it.style.setProperty('--sx', dx + 'px');
      actions(it).style.width = (-dx) + 'px';
      it.classList.add('ab-dragging');
    }, { passive: true });
    document.addEventListener('touchend', ()=>{
      if(!it || !dragging){ it = null; return; }
      const el = it; it = null; el.classList.remove('ab-dragging');
      if(-dx > el.offsetWidth * 0.6){ close(el); const c = el.querySelector('.check'); if(c) c.click(); return; }   // long swipe = done
      if(-dx > W / 2){ el.style.setProperty('--sx', -W + 'px'); actions(el).style.width = W + 'px'; el.classList.add('ab-swiped'); }
      else close(el);
    });
    document.addEventListener('click', e=>{
      if(!usable()) return;
      const sw = e.target.closest('.ab-sw button');
      if(sw){ const el = sw.closest('.item'); close(el); const b = el.querySelector(sw.classList.contains('ab-sw-done') ? '.check' : '.x-btn'); if(b) b.click(); return; }
      const el = e.target.closest('#openList .item:not(.item-edit), #doneList .item:not(.item-edit)');
      if(!el || e.target.closest('button, a, input, textarea, select')) return;
      if(el.classList.contains('ab-swiped')){ close(el); return; }
      el.classList.toggle('ab-tools');            // tap = show / hide its options
    });
  }

  function showSec(){
    const cards = document.querySelector('#home .cards'); if(!cards) return;
    cards.dataset.show = homeSec;
    document.querySelectorAll('[data-sec-btn]').forEach(b=>{ const on = b.dataset.secBtn === homeSec; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
  }

  document.addEventListener('click', e=>{
    if(!e.target.closest('[data-ab-chat]')) return;
    if(window.hubChat && hubChat.show) hubChat.show();
  });
  window.addEventListener('hubchat', e=>{
    unread = (e.detail && e.detail.unread) || 0;
    document.querySelectorAll('[data-ab-unread]').forEach(b=>{ b.textContent = unread || ''; b.hidden = !unread; });
  });
  window.addEventListener('hashchange', ()=>{ build(); hubTouches(); });
  const ready = ()=>{ build(); hubTouches(); houseSections(); punchNewItem(); punchSwipe(); crumbs(); fabTuck(); };
  // a home's name arrives after the page loads: keep its crumb current
  if(page === 'house.html') document.addEventListener('DOMContentLoaded', ()=>{ const h = document.getElementById('hTitle'); if(h) new MutationObserver(crumbs).observe(h, { childList: true, characterData: true, subtree: true }); });
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
  (phoneMQ.addEventListener ? phoneMQ.addEventListener('change', ready) : phoneMQ.addListener(ready));

  // Admin Settings and the hub call these. set('apple' | '') switches this device right away.
  window.hubTheme = {
    get: pref,
    phone: ()=>phoneMQ.matches,
    set(v){ try{ v ? localStorage.setItem('hubTheme', v) : localStorage.removeItem('hubTheme'); } catch(e){} ready(); },
  };
})();
