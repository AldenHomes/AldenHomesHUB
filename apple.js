/* The hub's "new look" (owner, 2026-10-29): an Apple-style skin over every staff page.
   Phones always get it. Computers get it when the person switches it on (Admin Settings → "The new look"), saved on this
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
  const on = ()=>phoneMQ.matches || pref() === 'apple';

  const APPS = [
    ['schedule.html', 'Production Schedule', '#4B4F54', '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'],
    ['construction.html', 'Construction', '#FF9500', '<path d="M3 21h18M5 21V10l7-6 7 6v11"/><path d="M10 21v-6h4v6"/>'],
    ['punch.html', 'Punch List', '#34C759', '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>'],
    ['service.html', 'Service Center', '#32ADE6', '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>'],
    ['selections.html', 'Selections', '#AF52DE', '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="8" r="1.3"/><circle cx="8" cy="13" r="1.3"/><circle cx="16" cy="13" r="1.3"/>'],
    ['invoices.html', 'Invoices', '#FF3B30', '<path d="M7 3h8l4 4v14H7z"/><path d="M10 12h6M10 16h4"/>'],
    ['permits.html', 'Permits', '#8C9470', '<path d="M6 3h9l3 3v15H6z"/><path d="M9 13l2 2 4-4"/>'],
    ['jobcost.html', 'Job Costing', '#30B0C7', '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'],
    ['history.html', 'Cost History', '#5856D6', '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'],
    ['packets.html', 'Sales Packets', '#D99A00', '<path d="M4 7h16v13H4z"/><path d="M9 7V4h6v3"/>'],
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
    } else if(!isHub){
      const rail = document.createElement('nav');
      rail.className = 'ab-rail'; rail.setAttribute('aria-label', 'Apps');
      rail.innerHTML = `<a class="ab-app ab-home" href="index.html" title="Hub" aria-label="Hub"><img src="icons/icon-192.png" alt=""></a>`
        + APPS.map(([href, name, color, p])=>`<a class="ab-app${page === href ? ' here' : ''}" href="${href}" title="${name}" aria-label="${name}"><span style="background:${color}">${svg(p, 17)}</span></a>`).join('')
        + '<span class="ab-grow"></span>'
        + `<a class="ab-app ab-plain${page === 'mywork.html' ? ' here' : ''}" href="mywork.html" title="My work" aria-label="My work">${svg(ICON.work, 21)}</a>`
        + chatBtn('ab-app ab-plain', 21)
        + `<a class="ab-app ab-plain${page === 'admin.html' ? ' here' : ''}" href="admin.html" title="Settings" aria-label="Settings">${svg(ICON.gear, 21)}</a>`;
      document.body.appendChild(rail);
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

  document.addEventListener('click', e=>{
    if(!e.target.closest('[data-ab-chat]')) return;
    if(window.hubChat && hubChat.show) hubChat.show();
  });
  window.addEventListener('hubchat', e=>{
    unread = (e.detail && e.detail.unread) || 0;
    document.querySelectorAll('[data-ab-unread]').forEach(b=>{ b.textContent = unread || ''; b.hidden = !unread; });
  });
  window.addEventListener('hashchange', ()=>{ build(); hubTouches(); });
  const ready = ()=>{ build(); hubTouches(); };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
  (phoneMQ.addEventListener ? phoneMQ.addEventListener('change', ready) : phoneMQ.addListener(ready));

  // Admin Settings and the hub call these. set('apple' | '') switches this device right away.
  window.hubTheme = {
    get: pref,
    phone: ()=>phoneMQ.matches,
    set(v){ try{ v ? localStorage.setItem('hubTheme', v) : localStorage.removeItem('hubTheme'); } catch(e){} ready(); },
  };
})();
