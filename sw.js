/* ============================================================
   Alden Homes Hub — service worker
   Makes the hub installable and lets the app shell open when
   the connection is slow or down.

   - Our own pages: always try the network first, so a freshly
     uploaded file shows up right away. The cached copy is only
     used when the network can't be reached.
   - Firebase / PDF libraries from the CDNs: cached after first
     use (their URLs are version-pinned, so they never change).
   - Everything else (Firestore, Storage, sign-in, QR images) is
     left completely alone.
   ============================================================ */
const CACHE = 'alden-hub-v6';

const SHELL = [
  'index.html',
  'schedule.html',
  'service.html',
  'packets.html',
  'construction.html',
  'house.html',
  'admin.html',
  'punch.html',
  'assistant.js',
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
    const response = await fetch(request);
    if(response.ok) cache.put(request, response.clone());
    return response;
  } catch(err){
    // ignoreSearch so view-packet.html?dev=... still finds its cached page
    const cached = await cache.match(request, { ignoreSearch: true });
    if(cached) return cached;
    throw err;
  }
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
    event.respondWith(networkFirst(request));
  } else if(isPinnedCdn(url)){
    event.respondWith(cacheFirst(request));
  }
});
