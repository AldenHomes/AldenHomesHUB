/* ============================================================
   Alden Homes Hub — service worker
   Makes the hub installable and lets the app shell open when
   the connection is slow or down.

   - Our own pages (.html): network first, so a fresh upload shows
     right away — but if the network hasn't answered in 2.5 s and a
     saved copy exists, the saved copy opens (slow cell signal) and
     the fresh one is saved for next time.
   - Our own files with ?v= in the link (apple.css?v=30 …): saved
     copy first — a new version always gets a new link.
   - Our other files (scripts, pictures, maps, forms): saved copy
     first for speed, refreshed in the background for next time.
   - Firebase / PDF libraries from the CDNs: cached after first
     use (their URLs are version-pinned, so they never change).
   - Everything else (Firestore, Storage, sign-in, QR images) is
     left completely alone.
   ============================================================ */
const CACHE = 'alden-hub-v12';

const SHELL = [
  'index.html',
  'schedule.html',
  'service.html',
  'packets.html',
  'construction.html',
  'house.html',
  'admin.html',
  'punch.html',
  'jobcost.html',
  'history.html',
  'mywork.html',
  'assistant.js',
  'hubsearch.js',
  'manifest.webmanifest',
  'icons/logo.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

function isPinnedCdn(url){
  return (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/'))
      || url.hostname === 'cdn.jsdelivr.net';
}

self.addEventListener('install', event=>{
  event.waitUntil(
    caches.open(CACHE).then(cache=>
      // Added one at a time so a single failed download can't block the install.
      Promise.all(SHELL.map(path=>
        cache.add(new Request(path, { cache: 'reload' }))
          .catch(err=>console.warn('Could not pre-cache', path, err))
      ))
    ).then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate', event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k !== CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

async function networkFirst(request){
  const cache = await caches.open(CACHE);
  try{
    // 'no-cache' = check with the server every time; without it the browser can keep
    // showing its own saved copy of a page for up to 10 minutes after an update.
    const response = await fetch(request, { cache: 'no-cache' });
    if(response.ok) cache.put(request, response.clone());
    return response;
  } catch(err){
    // ignoreSearch so view-packet.html?dev=... still finds its cached page
    const cached = await cache.match(request, { ignoreSearch: true });
    if(cached) return cached;
    throw err;
  }
}

// a page: network first, the saved copy after 2.5 s (or when offline)
async function pageFirst(request, event){
  const cache = await caches.open(CACHE);
  const fresh = fetch(request, { cache: 'no-cache' }).then(r=>{ if(r.ok) cache.put(request, r.clone()); return r; });
  event.waitUntil(fresh.catch(()=>{}));
  const cached = await cache.match(request, { ignoreSearch: true });
  if(!cached) return fresh.catch(()=>networkFirst(request));
  const slow = new Promise(res=>setTimeout(()=>res(cached), 2500));
  return Promise.race([fresh.catch(()=>cached), slow]);
}
// saved copy now, fresh copy saved in the background for next time
async function savedThenRefresh(request, event){
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const fresh = fetch(request, { cache: 'no-cache' }).then(r=>{ if(r.ok) cache.put(request, r.clone()); return r; });
  if(cached){ event.waitUntil(fresh.catch(()=>{})); return cached; }
  return fresh;
}
async function cacheFirst(request){
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if(cached) return cached;
  const response = await fetch(request);
  // Cross-origin <script> responses are "opaque" (status 0) but still safe to cache.
  if(response.ok || response.type === 'opaque') cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', event=>{
  const request = event.request;
  if(request.method !== 'GET') return;
  const url = new URL(request.url);

  if(url.origin === self.location.origin){
    const isPage = request.mode === 'navigate' || /\.html?$/.test(url.pathname) || url.pathname.endsWith('/');
    if(isPage) event.respondWith(pageFirst(request, event));
    else if(url.searchParams.has('v')) event.respondWith(cacheFirst(request));
    else if(/\.webmanifest$/.test(url.pathname) || url.pathname.endsWith('sw.js')) event.respondWith(networkFirst(request));
    else event.respondWith(savedThenRefresh(request, event));
  } else if(isPinnedCdn(url)){
    event.respondWith(cacheFirst(request));
  }
});
