/* House3D — the customer's home style in 3D, with the front door they're looking at and their siding colour (owner, 2026-11-09:
   "seeing the door on the house when making door selections… a close up door view and then one faraway shot… the house should have the
   siding color applied"). Used by selections.html's Front Door Style question.

   How a page uses it: put <div class="h3d-slot" data-h3d="close|far" data-model="<home style>" data-door="<door picture>"
   data-door-hex="#rrggbb" data-siding="<siding picture>"></div> anywhere. This file watches the page, moves its one 3D view into the
   slot (so the page can redraw freely) and brings it up to date. House3D.has(style) says whether a style has a model.

   Models come from Chief Architect's Collada (.dae) export (the "SketchFab Houses" files, whole-house file only), kept in
   models/<key>/house.dae + its *_textures folder. Per model (MODELS): the home style it belongs to + elevation letter, the front door
   opening and the garage door openings, measured by .claude/percy-test/analyze.html (it looks at the house from every side and finds
   flat door-sized / garage-sized surfaces by depth). Our doors go just in front of Chief's (or in its place when `hide` names Chief's
   door material). Camera views are worked out from those openings. Styles with more than one elevation get an A / B / C switch on the
   view (screen only). To add a style: copy its whole-house .dae + textures into models/<key>/, run analyze.html?k=<key>, add an entry.

   Doors are built from the same Therma-Tru drawings the question shows (selection-photos/doors/): the cream door becomes a painted
   slab (the drawing's lines and shadows kept as shading + a little relief), the grey glass becomes real glass. Works for any door
   drawn that way, so new doors need no measuring.

   three.js 0.160.0 from jsDelivr, loaded only when a 3D view is first shown. Draws only when something changes (easy on iPads). */
(function(){
  const CDN = 'https://cdn.jsdelivr.net/npm/three@0.160.0';
  /* door: [left x, bottom y, face z, width, height] of Chief's front door face (world metres, front = +z);
     garages: the same for each garage door. Percy A keeps its hand-measured numbers and hides Chief's door (mat147). */
  const MODELS = {
    'percy-a': { style: 'Percy', elev: 'A', file: 'models/percy-a/percyA.dae', door: [12.45, 0.02, -10.62, 0.91, 2.01], hide: /mat147/,
      garages: [[14.38, 0.0, -5.045, 4.85, 2.13]] },
    'alden': { style: 'Alden', elev: '', file: 'models/alden/house.dae', door: [11.582, 0.02, -6.183, 0.91, 2.01], garages: [[15.072, 0, -1.951, 4.87, 2.13]] },
    'alden-21': { style: 'Alden 2.1', elev: '', file: 'models/alden-21/house.dae', door: [13.44, 0.02, -4.53, 0.91, 2.01], garages: [[16.676, 0.01, -1.964, 4.875, 2.12]] },   // Chief has this door standing open; ours closes the doorway
    'avonlea-a': { style: 'Avonlea', elev: 'A', file: 'models/avonlea-a/house.dae', door: [13.41, 0.03, -16.733, 0.905, 2.4], garages: [[3.815, -0.43, -18.874, 4.865, 2.4]] },
    'avonlea-b': { style: 'Avonlea', elev: 'B', file: 'models/avonlea-b/house.dae', door: [7.033, 0.04, -16.733, 0.905, 2.39], garages: [[-2.512, -0.46, -18.823, 4.87, 2.43]] },
    'avonlea-c': { style: 'Avonlea', elev: 'C', file: 'models/avonlea-c/house.dae', door: [7.548, 0.03, -16.733, 0.905, 2.4], garages: [[-2.157, -0.46, -18.823, 4.87, 2.43]] },
    'bradford': { style: 'Bradford', elev: '', file: 'models/bradford/house.dae', door: [-7.668, 0.02, 4.113, 0.91, 2.01], garages: [[-5.278, 0, 11.392, 4.87, 2.03]] },
    'coleman': { style: 'Coleman', elev: '', file: 'models/coleman/house.dae', door: [-2.535, 0.02, -10.1, 0.91, 2.01], garages: [[3.99, 0.01, -2.856, 4.875, 2.09]] },
    'coleman-21': { style: 'Coleman 2.1', elev: '', file: 'models/coleman-21/house.dae', door: [1.686, 0.02, 8.965, 0.905, 2.01], garages: [[8.236, 0, 16.237, 4.875, 2.13]] },
    'grant-a': { style: 'Grant', elev: 'A', file: 'models/grant-a/house.dae', door: [31.269, 0.02, -6.908, 0.91, 2.01], garages: [[34.114, 0.01, -8.148, 4.875, 2.07]] },
    'grant-b': { style: 'Grant', elev: 'B', file: 'models/grant-b/house.dae', door: [19.545, 0.02, -6.939, 0.91, 2.01], garages: [[22.39, 0, -8.144, 4.875, 2.03]] },
    'hinderton': { style: 'Hinderton', elev: '', file: 'models/hinderton/house.dae', door: [15.524, 0.02, -14.9, 0.905, 2.01], garages: [[17.959, 0.01, -11.522, 4.875, 2.12]] },
    'percy-b': { style: 'Percy', elev: 'B', file: 'models/percy-b/house.dae', door: [12.397, 0.02, -10.595, 0.91, 2.01], garages: [[14.352, 0.01, -5.043, 4.875, 2.12]] },
    'sherman': { style: 'Sherman', elev: '', file: 'models/sherman/house.dae', door: [3.407, 0.08, -1.136, 0.91, 1.95], garages: [[5.232, 0, 1.978, 4.875, 2.13]] },
    'stanford-a': { style: 'Stanford', elev: 'A', file: 'models/stanford-a/house.dae', door: [6.938, 0.02, -12.137, 0.91, 2.01], garages: [[9.148, 0.01, -7.534, 4.875, 2.07]] },
    'stanford-b': { style: 'Stanford', elev: 'B', file: 'models/stanford-b/house.dae', door: [12.126, 0.02, -12.172, 0.91, 2.01], garages: [[5.501, 0.01, -7.534, 4.87, 2.12]] },
    'tiffany': { style: 'Tiffany', elev: '', file: 'models/tiffany/house.dae', door: [9.414, 0.02, -27.014, 0.91, 2.01], garages: [[11.254, 0.01, -21.781, 4.87, 2.12]] },
    'winsloe': { style: 'Winsloe', elev: '', file: 'models/winsloe/house.dae', door: [-4.087, 0.03, -2.819, 0.905, 2.4], garages: [[1.373, 0.01, 0.729, 4.87, 2.12]] },
  };
  const STYLE_KEYS = {}; Object.entries(MODELS).forEach(([k, m])=>(STYLE_KEYS[m.style.toLowerCase()] = STYLE_KEYS[m.style.toLowerCase()] || []).push(k));
  const elevOf = {};   // the elevation being looked at, per style (screen only)
  const keyOf = style=>{ const ks = STYLE_KEYS[String(style || '').trim().toLowerCase()]; if(!ks) return null; const e = elevOf[MODELS[ks[0]].style]; return ks.find(k=>MODELS[k].elev === e) || ks[0]; };

  let lib = null, V = null;   // V = the one 3D view: { wrap, canvas, renderer, scene, camera, controls, ... }
  const loadLib = ()=>lib || (lib = Promise.all([
    import(CDN + '/+esm'),
    import(CDN + '/examples/jsm/loaders/ColladaLoader.js/+esm'),
    import(CDN + '/examples/jsm/controls/OrbitControls.js/+esm'),
    import(CDN + '/examples/jsm/environments/RoomEnvironment.js/+esm'),
  ]).then(([THREE, a, b, c])=>({ THREE, ColladaLoader: a.ColladaLoader, OrbitControls: b.OrbitControls, RoomEnvironment: c.RoomEnvironment })));

  /* ---------- the view (made once) ---------- */
  function makeView(){
    const wrap = document.createElement('div'); wrap.className = 'h3d';
    wrap.innerHTML = '<canvas></canvas><div class="h3d-elev"></div><div class="h3d-msg">Loading the house…</div><div class="h3d-hint">Drag to look around · pinch or scroll to zoom</div>';
    wrap.querySelector('.h3d-elev').addEventListener('click', e=>{ const b = e.target.closest('[data-elev]'); if(!b) return; e.stopPropagation(); elevOf[b.dataset.style] = b.dataset.elev;
      const s = document.querySelector('.h3d-slot'); if(s){ lastSig = ''; check(); } });
    const st = document.createElement('style'); st.textContent = `
      .h3d-slot{position:relative; width:100%; aspect-ratio:4/3; max-height:70vh; border-radius:12px; overflow:hidden; background:#cfdbe6;}
      .h3d-slot[data-h3d="far"]{aspect-ratio:16/10;}
      .h3d{position:absolute; inset:0;} .h3d canvas{width:100%; height:100%; display:block; touch-action:none; cursor:grab;}
      .h3d-msg{position:absolute; inset:0; display:flex; align-items:center; justify-content:center; text-align:center; padding:20px; color:#35465a; font-size:15px; background:rgba(207,219,230,.85);}
      .h3d-msg[hidden]{display:none;}
      .h3d-hint{position:absolute; left:10px; bottom:8px; font-size:12px; color:#fff; text-shadow:0 1px 2px rgba(0,0,0,.6); pointer-events:none;}
      .h3d-elev{position:absolute; right:8px; top:8px; display:flex; gap:4px; align-items:center; z-index:2; font-size:12px; color:#fff; text-shadow:0 1px 2px rgba(0,0,0,.6);}
      .h3d-elev:empty{display:none;}
      .h3d-elev button{border:0; border-radius:999px; padding:5px 11px; font:inherit; font-weight:700; background:rgba(255,255,255,.85); color:#1f3550; cursor:pointer; text-shadow:none;}
      .h3d-elev button.on{background:#1f3550; color:#fff;}`;
    document.head.appendChild(st);
    V = { wrap, canvas: wrap.querySelector('canvas'), msg: wrap.querySelector('.h3d-msg'), want: {}, have: {}, ready: false };
    return V;
  }
  const say = t=>{ if(!V) return; V.msg.textContent = t || ''; V.msg.hidden = !t; };

  async function boot(){
    if(V.booting) return V.booting;
    return V.booting = (async ()=>{
      let L; try { L = await loadLib(); } catch(e){ say('The 3D view could not load (no internet?).'); throw e; }
      const { THREE, OrbitControls, RoomEnvironment } = L; V.L = L;
      let renderer; try { renderer = new THREE.WebGLRenderer({ canvas: V.canvas, antialias: true, preserveDrawingBuffer: true }); }
      catch(e){ say('3D isn’t available on this device.'); throw e; }
      renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(32, 4 / 3, 0.1, 5000);
      scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(renderer), 0.04).texture;
      // sky: a soft blue gradient
      const sk = document.createElement('canvas'); sk.width = 4; sk.height = 512; { const g = sk.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 512);
        gr.addColorStop(0, '#6f9fd1'); gr.addColorStop(0.55, '#b9d2ea'); gr.addColorStop(1, '#e6eef4'); g.fillStyle = gr; g.fillRect(0, 0, 4, 512); }
      const skyT = new THREE.CanvasTexture(sk); skyT.colorSpace = THREE.SRGBColorSpace; scene.background = skyT;
      scene.add(new THREE.HemisphereLight(0xdfeaff, 0x6f7a55, 0.35));
      const sun = new THREE.DirectionalLight(0xfff1dd, 3.2); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 4; scene.add(sun, sun.target);
      const controls = new OrbitControls(camera, V.canvas); controls.maxPolarAngle = Math.PI / 2 - 0.02; controls.minDistance = 1.2; controls.maxDistance = 60;
      Object.assign(V, { THREE, renderer, scene, camera, controls, sun });
      controls.addEventListener('change', draw);
      THREE.DefaultLoadingManager.onLoad = draw;   // textures arriving
      new ResizeObserver(fit).observe(V.wrap);
      return V;
    })();
  }
  function fit(){ if(!V || !V.renderer) return; const r = V.wrap.getBoundingClientRect(); if(!r.width || !r.height) return;
    V.renderer.setSize(r.width, r.height, false); V.camera.aspect = r.width / r.height; V.camera.updateProjectionMatrix(); draw(); }
  let drawQ = false;
  function draw(){ if(drawQ || !V || !V.renderer) return; drawQ = true; requestAnimationFrame(()=>{ drawQ = false; V.renderer.render(V.scene, V.camera); }); }

  /* ---------- crisp siding / shingle pictures (Chief only exports small blurry swatches) ---------- */
  function crisp(THREE, renderer){
    const noise = (g, amt)=>{ const d = g.getImageData(0, 0, 1024, 1024), p = d.data; for(let i = 0; i < p.length; i += 4){ const n = (Math.random() - 0.5) * amt; p[i] += n; p[i + 1] += n; p[i + 2] += n; } g.putImageData(d, 0, 0); };
    const mk = fn=>{ const c = document.createElement('canvas'); c.width = c.height = 1024; const g = c.getContext('2d'); fn(g); const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t; };
    return {
      lap: mk(g=>{ const H = 128; for(let i = 0; i < 8; i++){ const y = i * H, gr = g.createLinearGradient(0, y, 0, y + H); gr.addColorStop(0, '#b9bcbe'); gr.addColorStop(0.8, '#a9acae'); gr.addColorStop(1, '#9fa2a4');
        g.fillStyle = gr; g.fillRect(0, y, 1024, H); g.fillStyle = '#5e6163'; g.fillRect(0, y + H - 9, 1024, 9); g.fillStyle = '#7b7e80'; g.fillRect(0, y + H - 12, 1024, 3); g.fillStyle = '#c9cccd'; g.fillRect(0, y, 1024, 3); } noise(g, 7); }),
      bb: mk(g=>{ g.fillStyle = '#b3b6b8'; g.fillRect(0, 0, 1024, 1024); const S = 1024 / 5, W = 34; for(let i = 0; i < 5; i++){ const x = 16 + i * S;
        g.fillStyle = '#7f8284'; g.fillRect(x + W, 0, 7, 1024); g.fillStyle = '#bfc2c4'; g.fillRect(x, 0, W, 1024); g.fillStyle = '#d2d4d5'; g.fillRect(x, 0, 4, 1024); g.fillStyle = '#9da0a2'; g.fillRect(x + W - 4, 0, 4, 1024); } noise(g, 6); }),
      // cedar-look shakes (Cedar Impressions / Northwoods): staggered shingles of uneven width, a shadow under each course
      shake: mk(g=>{ const rows = 6, H = 1024 / rows; let s = 11; const rnd = ()=>(s = (s * 16807) % 2147483647) / 2147483647;
        for(let r = 0; r < rows; r++){ const y = r * H; let x = -60 * rnd(); while(x < 1024){ const w = 60 + rnd() * 90, v = 168 + rnd() * 26;
            g.fillStyle = `rgb(${v},${v + 2},${v + 3})`; g.fillRect(x, y, w, H); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x, y, 3, H); x += w; }
          g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, y + H - 10, 1024, 10); g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, y, 1024, 4); } noise(g, 14); }),
      roof: mk(g=>{ const rows = 13, H = 1024 / rows; let s = 7; const rnd = ()=>(s = (s * 16807) % 2147483647) / 2147483647;
        for(let r = 0; r < rows; r++){ const y = r * H, off = (r % 2) * 64 + rnd() * 30; for(let x = -128 + off; x < 1024; x += 128 * (0.8 + rnd() * 0.4)){ const v = 52 + rnd() * 26;
          g.fillStyle = `rgb(${v},${v + 2},${v + 6})`; g.fillRect(x, y, 140, H); g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x, y, 3, H); }
          g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, y + H - 6, 1024, 6); g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(0, y, 1024, 4); } noise(g, 22); }),
    };
  }

  // the average colour of a picture, in linear light (r, g, b 0–1)
  function avgLin(img){ const c = document.createElement('canvas'); c.width = c.height = 48; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 48, 48);
    const d = x.getImageData(0, 0, 48, 48).data, lin = v=>Math.pow(v / 255, 2.2); let r = 0, g = 0, b = 0; for(let i = 0; i < d.length; i += 4){ r += lin(d[i]); g += lin(d[i + 1]); b += lin(d[i + 2]); }
    const k = d.length / 4; return [r / k, g / k, b / k]; }
  const whenLoaded = tex=>new Promise(res=>{ let n = 0; const t = ()=>{ const im = tex && tex.image; if(im && (im.complete === undefined || im.complete) && (im.naturalWidth || im.width)) return res(im); if(++n > 100) return res(null); setTimeout(t, 100); }; t(); });
  // Chief's siding swatches by name (CertainTeed Monogram "classicd5", Mainstreet "mstreetd4 / MS_D4", clapboards, board & batten,
  // Cedar Impressions "cinewd7 / cid7", Northwoods "nws7", Chief's own "Siding…", ship lap)
  const kindOf = tex=>/boardbatten|VS_CB/i.test(tex) ? 'bb' : /cinewd7|cid7|nws7|shake/i.test(tex) ? 'shake'
    : /mstreet|classicd|clapboard|MS_D4|CBrds|ShipLap|^Siding|Pewter_Siding|Siding--|^Beige\(48\)/i.test(tex) ? 'lap' : null;   // Beige(48) = Chief's stucco-look placeholder on walls that are siding on Alden homes

  /* ---------- a home style ---------- */
  async function loadModel(key){
    const M = MODELS[key], { THREE, ColladaLoader } = V.L;
    say('Loading the ' + M.style + (STYLE_KEYS[M.style.toLowerCase()].length > 1 ? ' ' + M.elev : '') + '…');
    const text = await (await fetch(M.file)).text();
    // which material uses which picture (Collada: material → effect → image)
    const img = {}; for(const m of text.matchAll(/<image id="([^"]+)"[^>]*>\s*<init_from>([^<]+)<\/init_from>/g)) img[m[1]] = m[2];
    const texOf = {}; for(const m of text.matchAll(/<effect id="([^"]+)"[\s\S]*?<\/effect>/g)){ const f = (m[0].match(/<init_from>([^<]+)<\/init_from>/) || [])[1]; if(f) texOf[m[1].replace(/-(effect|fx)$/, '')] = (img[f] || f).split('/').pop(); }
    const base = M.file.replace(/[^/]+$/, ''), root = new ColladaLoader().parse(text, base).scene;
    const C = crisp(THREE, V.renderer), aniso = V.renderer.capabilities.getMaxAnisotropy(), siding = [], lawn = [], swatch = [];
    // how bright each crisp picture is on average, so a colour comes out the same whichever pattern it sits on
    const crispAvg = {}; for(const k of ['lap', 'bb', 'shake']){ const a = avgLin(C[k].image); crispAvg[k] = (a[0] + a[1] + a[2]) / 3; }
    let grassFile = '';
    root.traverse(o=>{
      if(o.isLight){ o.visible = false; return; }   // Chief's own sun / ambient
      if(!o.isMesh) return; o.castShadow = o.receiveShadow = true;
      const mats = (Array.isArray(o.material) ? o.material : [o.material]).map(m=>{
        const tex = texOf[String(m.name || '').replace(/-material$/, '')] || '', kind = kindOf(tex);
        const glass = !m.map && m.color && m.color.b > 0.75 && m.color.g > 0.75 && m.color.r < 0.7;   // Chief's light blue = glass
        const n = new THREE.MeshStandardMaterial({ name: m.name, color: m.color, map: m.map || null, transparent: m.transparent, opacity: m.opacity,
          roughness: glass ? 0.05 : /Asphalt|Concrete|Grass/i.test(tex) ? 0.95 : 0.8, metalness: glass ? 0.6 : 0, side: m.side, envMapIntensity: glass ? 1.4 : 0.6 });
        if(n.map){ n.map.anisotropy = aniso; n.map.colorSpace = THREE.SRGBColorSpace; }
        const c = kind ? C[kind] : /CAAsphalt/i.test(tex) ? C.roof : null;
        if(c && n.map){ const orig = n.map, t = c.clone(); t.repeat.copy(orig.repeat); t.offset.copy(orig.offset); t.rotation = orig.rotation; t.center.copy(orig.center); t.needsUpdate = true; n.map = t;
          // the crisp picture is grey: tint it to Chief's swatch colour (worked out once the swatch has loaded)
          if(kind){ n.userData.kind = kind; n.userData.k = 1.45 * crispAvg.lap / crispAvg[kind]; swatch.push(whenLoaded(orig).then(im=>{ if(!im) return; const a = avgLin(im);
            n.userData.base = new THREE.Color(a[0], a[1], a[2]).multiplyScalar(n.userData.k * (kind === 'shake' ? 0.75 : 1));   /* shakes read too orange at full strength */ if(!n.userData.picked) n.color.copy(n.userData.base); draw(); })); } }
        if(kind === 'lap' || kind === 'bb') siding.push(n);   // the customer's siding colour goes on lap siding and board & batten; shakes and stone keep theirs
        if(/Grass/i.test(tex)){ lawn.push(o); grassFile = grassFile || (img[Object.keys(img).find(k=>/Grass/i.test(img[k]))] || ''); }
        if(M.hide && M.hide.test(m.name)) n.visible = false;   // Chief's front door, where ours replaces it
        // Chief's placeholder colours — coral garage doors (#d35143) and orange front doors (#f6a629) — show round our doors as frames
        // and sidelites: make them white trim
        if(!m.map && m.color && ['d35143', 'f6a629'].includes(m.color.getHexString(THREE.SRGBColorSpace))) n.color.set(0xf1f0eb);
        return n; });
      o.material = Array.isArray(o.material) ? mats : mats[0];
    });
    root.updateMatrixWorld(true);
    // Chief's green box → a lawn to the horizon
    let lawnTop = 0; lawn.forEach(o=>{ lawnTop = Math.max(lawnTop, new THREE.Box3().setFromObject(o).max.y); o.visible = false; });
    const hb = new THREE.Box3(); root.traverse(o=>{ if(o.isMesh && o.visible) hb.expandByObject(o); });   // the house itself (no lawn box)
    const sz = hb.getSize(new THREE.Vector3()), ctr = hb.getCenter(new THREE.Vector3()), d = Math.max(sz.x, sz.z);
    const grass = new THREE.TextureLoader().load(base + (grassFile || 'Grass7.jpg')); grass.colorSpace = THREE.SRGBColorSpace; grass.wrapS = grass.wrapT = THREE.RepeatWrapping;
    grass.repeat.set(d * 40 / 3, d * 40 / 3); grass.anisotropy = aniso;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(d * 40, d * 40), new THREE.MeshStandardMaterial({ map: grass, color: 0xb8c79a, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(ctr.x, lawnTop - 0.5, ctr.z); ground.receiveShadow = true;
    const group = new THREE.Group(); group.add(root, ground);
    // the openings and the camera views worked out from them
    const [dx, dy, dz, dw, dh] = M.door, dcx = dx + dw / 2;
    const door = { at: [dx, dy, M.hide ? dz : dz + 0.06], w: dw, h: dh };   // just in front of Chief's door (its knob included), or in its place
    const garages = (M.garages || []).map(([x, y, z, w, h])=>({ at: [x, y, z + 0.012], w, h, inW: w / 0.0254, inH: h / 0.0254 }));
    const g0 = garages.slice().sort((a, b)=>b.w - a.w)[0];
    const farDist = Math.max(sz.x * 0.72, 10);
    const views = M.views || {
      close: { pos: [dcx - 0.15, dy + 1.58, dz + 8.4], tgt: [dcx, dy + 1.05, dz] },
      far: { pos: [ctr.x - sz.x * 0.12, 1.7, hb.max.z + farDist], tgt: [ctr.x, Math.min(2.6, sz.y * 0.35), hb.max.z - sz.z * 0.45] },
      garage: g0 ? { pos: [g0.at[0] + g0.w / 2 - 0.5, g0.at[1] + 1.75, g0.at[2] + Math.max(8.4, g0.w * 1.75)], tgt: [g0.at[0] + g0.w / 2, g0.at[1] + 1.35, g0.at[2]] } : null };
    if(!views.garage) views.garage = views.far;
    // soft light bouncing into the porch, so the door isn't lost in shade
    const fill = new THREE.PointLight(0xfff4e6, 2.2, 6, 1.5); fill.position.set(dcx, dy + 1.9, dz + 2.2); group.add(fill);
    // the sun: late morning, from the front left
    const sd = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(58), THREE.MathUtils.degToRad(20));
    V.sun.position.copy(ctr).add(sd.multiplyScalar(d * 2)); V.sun.target.position.copy(ctr);
    const sc = V.sun.shadow.camera; sc.left = -d; sc.right = d; sc.top = d; sc.bottom = -d; sc.near = 1; sc.far = d * 5; sc.updateProjectionMatrix();
    V.scene.fog = new THREE.Fog(0xdde7ef, d * 4, d * 22);
    return { key, M, group, siding, door, garages, views };
  }

  /* ---------- a door from its drawing ---------- */
  const doorCache = {};
  function doorMaps(src){
    if(doorCache[src]) return doorCache[src];
    return doorCache[src] = new Promise((res, rej)=>{ const im = new Image(); im.onload = ()=>{ try {
      const W0 = im.naturalWidth, H0 = im.naturalHeight, c0 = document.createElement('canvas'); c0.width = W0; c0.height = H0;
      const x0 = c0.getContext('2d'); x0.drawImage(im, 0, 0); const p0 = x0.getImageData(0, 0, W0, H0).data, L0 = i=>0.3 * p0[i] + 0.59 * p0[i + 1] + 0.11 * p0[i + 2];
      // the door itself = the columns and rows that are mostly light (skips the thin frame line round the drawing and the dark sill)
      const colLight = x=>{ let n = 0, t = 0; for(let y = Math.floor(H0 * 0.05); y < H0 * 0.95; y += 2){ t++; if(L0((y * W0 + x) * 4) > 190) n++; } return n / t > 0.5; };
      let x1 = 0, x2 = W0 - 1; while(x1 < W0 / 3 && !colLight(x1)) x1++; while(x2 > W0 * 2 / 3 && !colLight(x2)) x2--;
      const rowLight = y=>{ let n = 0, t = 0; for(let x = x1; x <= x2; x += 2){ t++; if(L0((y * W0 + x) * 4) > 190) n++; } return n / t > 0.5; };
      let y1 = 0, y2 = H0 - 1; while(y1 < H0 / 4 && !rowLight(y1)) y1++; while(y2 > H0 * 3 / 4 && !rowLight(y2)) y2--;
      x1 += 1; x2 -= 1; y1 += 1; y2 -= 1;
      // work at a fixed size: 512 wide
      const W = 512, H = 1138, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
      x.imageSmoothingQuality = 'high'; x.drawImage(im, x1, y1, x2 - x1 + 1, y2 - y1 + 1, 0, 0, W, H);
      const px = x.getImageData(0, 0, W, H), p = px.data, n = W * H;
      // glass = cool grey (the door is warm cream); a blur then a cut keeps whole panes and drops thin shadow lines
      const g0 = new Float32Array(n); for(let j = 0; j < n; j++){ const i = j * 4, l = 0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2]; g0[j] = (p[i] - p[i + 2] <= 5 && l > 110) ? 1 : 0; }   // neutral grey to white = glass (bright reflections too); the door is warm cream
      const R = 4, I = new Float32Array((W + 1) * (H + 1));
      for(let y = 0; y < H; y++){ let row = 0; for(let xx = 0; xx < W; xx++){ row += g0[y * W + xx]; I[(y + 1) * (W + 1) + xx + 1] = I[y * (W + 1) + xx + 1] + row; } }
      const glass = new Uint8Array(n);
      for(let y = 0; y < H; y++) for(let xx = 0; xx < W; xx++){ const a = Math.max(0, xx - R), b = Math.min(W, xx + R + 1), cc = Math.max(0, y - R), dd = Math.min(H, y + R + 1);
        const s = I[dd * (W + 1) + b] - I[cc * (W + 1) + b] - I[dd * (W + 1) + a] + I[cc * (W + 1) + a]; glass[y * W + xx] = s / ((b - a) * (dd - cc)) > 0.62 ? 1 : 0; }
      const mk = ()=>{ const cv = document.createElement('canvas'); cv.width = W; cv.height = H; return cv; };
      const shade = mk(), bump = mk(), mask = mk(), sd = shade.getContext('2d').createImageData(W, H), bd = bump.getContext('2d').createImageData(W, H), md = mask.getContext('2d').createImageData(W, H);
      for(let j = 0; j < n; j++){ const i = j * 4, l = 0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2], gl = glass[j];
        const s = gl ? 255 : Math.min(255, l * 255 / 243), bv = gl ? 90 : l;   // door shading (cream made white, so the paint shows true); glass sits lower
        sd.data[i] = sd.data[i + 1] = sd.data[i + 2] = s; sd.data[i + 3] = 255;
        bd.data[i] = bd.data[i + 1] = bd.data[i + 2] = bv; bd.data[i + 3] = 255;
        md.data[i] = md.data[i + 1] = md.data[i + 2] = gl ? 255 : 0; md.data[i + 3] = 255; }
      shade.getContext('2d').putImageData(sd, 0, 0); bump.getContext('2d').putImageData(bd, 0, 0); mask.getContext('2d').putImageData(md, 0, 0);
      res({ shade, bump, mask }); } catch(e){ rej(e); } };
      im.onerror = rej; im.src = src; });
  }
  async function makeDoor(src, hex){
    const { THREE } = V, D = V.model.door, maps = await doorMaps(src), aniso = V.renderer.capabilities.getMaxAnisotropy();
    const tex = (cv, srgb)=>{ const t = new THREE.CanvasTexture(cv); if(srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; return t; };
    const W = D.w, H = D.h, T = 0.045, g = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color: hex, map: tex(maps.shade, true), bumpMap: tex(maps.bump), bumpScale: 1.2, roughness: 0.42, envMapIntensity: 0.7 });
    const edge = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.45, envMapIntensity: 0.7 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(W, H, T), [edge, edge, edge, edge, paint, edge]);
    slab.position.set(W / 2, H / 2, T / 2); slab.castShadow = slab.receiveShadow = true; g.add(slab);
    const glassM = new THREE.MeshPhysicalMaterial({ color: 0x8e9aa1, roughness: 0.18, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.4, alphaMap: tex(maps.mask), alphaTest: 0.5 });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(W, H), glassM); glass.position.set(W / 2, H / 2, T + 0.0015); g.add(glass);
    // brushed nickel handleset
    const nickel = new THREE.MeshStandardMaterial({ color: 0xc9c9c4, metalness: 1, roughness: 0.32 }), hx = W - 0.075, f = T;
    const part = (geo, x, y, z, rx)=>{ const m = new THREE.Mesh(geo, nickel); m.position.set(x, y, z); if(rx) m.rotation.x = rx; m.castShadow = true; g.add(m); };
    part(new THREE.BoxGeometry(0.055, 0.3, 0.012), hx, 0.98, f + 0.006);
    part(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 20), hx, 0.92, f + 0.04, Math.PI / 2);
    part(new THREE.BoxGeometry(0.12, 0.018, 0.018), hx - 0.055, 0.92, f + 0.07);
    part(new THREE.CylinderGeometry(0.022, 0.022, 0.018, 28), hx, 1.08, f + 0.015, Math.PI / 2);
    g.position.set(...D.at);
    g.userData.paint = [paint, edge];
    return g;
  }

  /* ---------- a garage door, drawn (Haas 600 series, owner 2026-11-09) ----------
     spec = 'long|carriage' etc.: panel 'short' (8 across on a 16' door, 4 on an 8'-9') or 'long' (half as many), windows in the top section 'carriage' (4-pane, one per
     long panel / pair of short panels), 'ranch' (one long window per long panel / pair), 'standard' (one per short panel) or 'none'.
     Four sections. Drawn at 6 px per inch: grey shading (paint colour multiplies it), a bump map for the recessed panels and joints, and
     a glass mask. The same drawing makes the flat picture (garagePic) and the 3D door. */
  const gdCache = {};
  function garageMaps(spec, inW = 192, inH = 84){
    const key = spec + '|' + inW + 'x' + inH; if(gdCache[key]) return gdCache[key];
    const [panel, win] = String(spec).split('|'), S = 6, W = inW * S, H = inH * S, mk = ()=>{ const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
    const shade = mk(), bump = mk(), mask = mk(), sx = shade.getContext('2d'), bx = bump.getContext('2d'), mx = mask.getContext('2d');
    const g = v=>`rgb(${v},${v},${v})`, R = (ctx, v, x, y, w, h)=>{ ctx.fillStyle = typeof v === 'number' ? g(v) : v; ctx.fillRect(x * S, y * S, w * S, h * S); };
    R(sx, 238, 0, 0, inW, inH); R(bx, 170, 0, 0, inW, inH);
    // a light stucco texture so the steel isn't flat
    { const d = sx.getImageData(0, 0, W, H), p = d.data; for(let i = 0; i < p.length; i += 4){ const n = (Math.random() - 0.5) * 6; p[i] += n; p[i + 1] += n; p[i + 2] += n; } sx.putImageData(d, 0, 0); }
    const nShort = Math.max(2, Math.round((inW - 6) / 23.5)), nLong = Math.max(1, Math.round(nShort / 2));   // 16' = 8 short / 4 long, 8'-9' = 4 / 2
    const secs = 4, secH = inH / secs, edge = 3, gap = 2.5, n = panel === 'long' ? nLong : nShort, pw = (inW - 2 * edge - (n - 1) * gap) / n, vm = secH * 0.17, ph = secH - 2 * vm;
    const recess = (x, y, w, h)=>{   // a recessed panel: darker field, shadowed top/left edge, lit bottom/right edge
      R(sx, 229, x, y, w, h); R(sx, 196, x, y, w, 0.6); R(sx, 205, x, y, 0.6, h); R(sx, 250, x, y + h - 0.6, w, 0.6); R(sx, 247, x + w - 0.6, y, 0.6, h);
      R(bx, 150, x, y, w, h); R(bx, 110, x, y, w, 0.5); R(bx, 110, x, y, 0.5, h); R(bx, 110, x, y + h - 0.5, w, 0.5); R(bx, 110, x + w - 0.5, y, 0.5, h); };
    const windowAt = (x, y, w, h, panes)=>{   // trim, glass, and grilles (door colour)
      R(sx, 246, x - 1.2, y - 1.2, w + 2.4, h + 2.4); R(bx, 205, x - 1.2, y - 1.2, w + 2.4, h + 2.4); R(sx, 205, x - 1.2, y + h + 1, w + 2.4, 0.4);
      R(mx, '#fff', x, y, w, h); R(bx, 90, x, y, w, h);
      for(let k = 1; k < panes; k++){ const gx = x + w * k / panes - 0.5; R(mx, '#000', gx, y, 1, h); R(sx, 244, gx, y, 1, h); R(bx, 200, gx, y, 1, h); } };
    for(let s = 0; s < secs; s++){
      const y0 = s * secH;
      if(s){ R(sx, 150, 0, y0 - 0.35, inW, 0.5); R(sx, 252, 0, y0 + 0.15, inW, 0.4); R(bx, 40, 0, y0 - 0.4, inW, 0.8); }   // the joint between sections
      // RA 360 full view: an aluminium frame (door colour) round glass panes, one pane per long-panel slot in every section
      if(panel === 'full'){ const st = 3.2, rl = 2.2, cols = nLong, cw = (inW - st) / cols;
        for(let i = 0; i < cols; i++){ const x = st + i * cw, gw = cw - st; R(mx, '#fff', x, y0 + rl, gw, secH - 2 * rl); R(bx, 70, x, y0 + rl, gw, secH - 2 * rl);
          R(sx, 214, x - 0.4, y0 + rl - 0.4, gw + 0.8, 0.4); R(sx, 214, x - 0.4, y0 + rl, 0.4, secH - 2 * rl); }
        continue; }
      // SelectView: a smooth (flush) door with windows stacked down one side — 'column' = one window per section at the right,
      // 'column2' = two side by side (the brochure's possibilities)
      if(panel === 'flush'){ const ww = 39.4, wh = 13.6, sw = (inW - 2 * edge) / nLong, at = slot=>windowAt(edge + sw * (slot + 0.5) - ww / 2, y0 + (secH - wh) / 2, ww, wh, 1);
        if(win === 'column') at(nLong - 1);
        else if(win === 'column2'){ at(nLong - 1); at(nLong - 2); }
        else if(win === 'stagger') at(s % 2 ? 0 : nLong - 1);          // right, left, right, left down the door
        else if(win === 'toprow' && s === 0) for(let i = 0; i < nLong; i++) at(i);
        else if(win === 'tl' && s < 2){ const tw = 25, th = 12, per = nLong, tsw = (inW - 2 * edge) / per;   // TL Series: rows of 25" x 12" lites
          for(let i = 0; i < per; i++) windowAt(edge + tsw * (i + 0.5) - tw / 2, y0 + (secH - th) / 2, tw, th, 1); }
        continue; }
      for(let i = 0; i < n; i++){
        const x = edge + i * (pw + gap), y = y0 + vm;
        if(s === 0 && win === 'standard' && panel === 'short'){ const ww = 18.4, wh = 11.4; windowAt(x + (pw - ww) / 2, y0 + (secH - wh) / 2, ww, wh, 1); continue; }
        recess(x, y, pw, ph); }
      if(s === 0 && (win === 'carriage' || win === 'ranch')){   // one wide window per long panel (or per pair of short panels)
        const ww = win === 'carriage' ? 39.4 : 39.4, wh = win === 'carriage' ? 13.6 : 11.5, slots = nLong, sw = (inW - 2 * edge) / slots;
        for(let i = 0; i < slots; i++){ const cx = edge + sw * (i + 0.5); R(sx, 238, cx - sw / 2 + 0.5, y0 + 1, sw - 1, secH - 2); R(bx, 170, cx - sw / 2 + 0.5, y0 + 1, sw - 1, secH - 2);
          windowAt(cx - ww / 2, y0 + (secH - wh) / 2, ww, wh, win === 'carriage' ? 4 : 1); } }
    }
    // outline
    sx.strokeStyle = g(170); sx.lineWidth = 3; sx.strokeRect(1.5, 1.5, W - 3, H - 3);
    return gdCache[key] = { shade, bump, mask };
  }
  // a flat coloured picture of a garage door (for the question's tiles and the "Just the door" view)
  const picCache = {};
  function garagePic(spec, hex, w = 480){
    const key = spec + '|' + hex + '|' + w; if(picCache[key]) return picCache[key];
    const m = garageMaps(spec), h = Math.round(w * m.shade.height / m.shade.width), c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    x.fillStyle = hex || '#f2f2ee'; x.fillRect(0, 0, w, h); x.globalCompositeOperation = 'multiply'; x.drawImage(m.shade, 0, 0, w, h);
    const gl = document.createElement('canvas'); gl.width = w; gl.height = h; const gx = gl.getContext('2d'), gr = gx.createLinearGradient(0, 0, 0, h * 0.3);
    gr.addColorStop(0, '#5e6b75'); gr.addColorStop(1, '#2f3a43'); gx.fillStyle = gr; gx.fillRect(0, 0, w, h);
    // keep the glass only where the mask is white
    const md = document.createElement('canvas'); md.width = w; md.height = h; const mdx = md.getContext('2d'); mdx.drawImage(m.mask, 0, 0, w, h);
    const a = mdx.getImageData(0, 0, w, h), gd = gx.getImageData(0, 0, w, h); for(let i = 0; i < a.data.length; i += 4) gd.data[i + 3] = a.data[i + 1]; gx.putImageData(gd, 0, 0);
    x.globalCompositeOperation = 'source-over'; x.drawImage(gl, 0, 0);
    return picCache[key] = c.toDataURL('image/jpeg', 0.9);
  }
  async function makeGarage(spec, hex, G){
    const { THREE } = V, maps = garageMaps(spec, Math.round(G.inW), Math.round(G.inH)), aniso = V.renderer.capabilities.getMaxAnisotropy();
    const tex = (cv, srgb)=>{ const t = new THREE.CanvasTexture(cv); if(srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; return t; };
    const T = 0.04, g = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color: hex, map: tex(maps.shade, true), bumpMap: tex(maps.bump), bumpScale: 1.5, roughness: 0.55, envMapIntensity: 0.6 });
    const edge = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.6 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(G.w, G.h, T), [edge, edge, edge, edge, paint, edge]); slab.position.set(G.w / 2, G.h / 2, T / 2); slab.castShadow = slab.receiveShadow = true; g.add(slab);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(G.w, G.h), new THREE.MeshPhysicalMaterial({ color: 0x2a343c, roughness: 0.12, metalness: 0.2, clearcoat: 1, envMapIntensity: 1.5, alphaMap: tex(maps.mask), alphaTest: 0.5 }));
    glass.position.set(G.w / 2, G.h / 2, T + 0.0015); g.add(glass);
    g.position.set(...G.at); g.userData.paint = [paint, edge]; return g;
  }

  /* ---------- siding colour from the siding picture they picked ---------- */
  const sideCache = {};
  function sidingHex(src){ return sideCache[src] || (sideCache[src] = new Promise(res=>{ const im = new Image(); im.onload = ()=>{ try {
      const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d'); x.drawImage(im, im.naturalWidth * 0.2, im.naturalHeight * 0.2, im.naturalWidth * 0.6, im.naturalHeight * 0.6, 0, 0, 64, 64);
      const d = x.getImageData(0, 0, 64, 64).data, lin = v=>Math.pow(v / 255, 2.2); let r = 0, g = 0, b = 0; const k = d.length / 4;
      for(let i = 0; i < d.length; i += 4){ r += lin(d[i]); g += lin(d[i + 1]); b += lin(d[i + 2]); }
      const s = v=>Math.round(Math.pow(v / k, 1 / 2.2) * 255).toString(16).padStart(2, '0'); res('#' + s(r) + s(g) + s(b)); } catch(e){ res(null); } };
      im.onerror = ()=>res(null); im.src = src; })); }

  /* ---------- bring the view up to what the slot asks for ---------- */
  let busy = false, again = false;
  async function update(slot){
    if(busy){ again = true; return; } busy = true;
    try {
      const want = { key: keyOf(slot.dataset.model), view: ['far', 'garage'].includes(slot.dataset.h3d) ? slot.dataset.h3d : 'close', door: slot.dataset.door || '', hex: slot.dataset.doorHex || '#f4f3ee', siding: slot.dataset.siding || '',
        gd: slot.dataset.gd || '', gdHex: slot.dataset.gdHex || '#f2f2ee' };
      if(!want.key){ say('There’s no 3D model of this home style yet.'); return; }
      await boot(); fit();
      const { THREE } = V;
      if(!V.model || V.model.key !== want.key){
        if(V.model) V.scene.remove(V.model.group);
        V.model = await loadModel(want.key); V.scene.add(V.model.group); V.doorObj = null; V.gdObjs = []; V.have = {};
      }
      if(V.have.door !== want.door && want.door){
        say('Hanging the door…');
        const d = await makeDoor(want.door, want.hex); if(V.doorObj) V.model.group.remove(V.doorObj);
        V.doorObj = d; V.model.group.add(d); V.have.door = want.door; V.have.hex = want.hex;
      }
      if(V.have.gd !== want.gd){
        (V.gdObjs || []).forEach(o=>V.model.group.remove(o)); V.gdObjs = [];
        if(want.gd) for(const G of V.model.garages){ const o = await makeGarage(want.gd, want.gdHex, G); V.model.group.add(o); V.gdObjs.push(o); }
        V.have.gd = want.gd; V.have.gdHex = want.gdHex;
      }
      if(V.have.gdHex !== want.gdHex){ (V.gdObjs || []).forEach(o=>o.userData.paint.forEach(m=>m.color.set(want.gdHex))); V.have.gdHex = want.gdHex; }
      if(V.doorObj && V.have.hex !== want.hex){ V.doorObj.userData.paint.forEach(m=>m.color.set(want.hex)); V.have.hex = want.hex; }
      if(V.have.siding !== want.siding){
        const hex = want.siding ? await sidingHex(want.siding) : null;
        V.model.siding.forEach(m=>{ m.userData.picked = !!hex; if(hex) m.color.set(hex).multiplyScalar(m.userData.k || 1.45); else if(m.userData.base) m.color.copy(m.userData.base); });
        V.have.siding = want.siding;
      }
      if(V.have.view !== want.view || V.have.viewKey !== want.key){ fly(V.model.views[want.view], !V.have.view); V.have.view = want.view; V.have.viewKey = want.key; }
      const ks = STYLE_KEYS[V.model.M.style.toLowerCase()], el = V.wrap.querySelector('.h3d-elev');
      el.innerHTML = ks.length > 1 ? 'Elevation ' + ks.map(k=>'<button type="button" data-style="' + MODELS[k].style + '" data-elev="' + MODELS[k].elev + '" class="' + (k === V.model.key ? 'on' : '') + '">' + MODELS[k].elev + '</button>').join('') : '';
      say(''); draw();
    } catch(e){ console.error('House3D', e); if(V && !V.msg.textContent) say('The 3D view ran into a problem.'); }
    finally { busy = false; if(again){ again = false; const s = document.querySelector('.h3d-slot'); if(s) update(s); } }
  }
  // move the camera to a view (a short glide unless it's the first)
  function fly(v, now){
    const { THREE, camera, controls } = V, P = new THREE.Vector3(...v.pos), T = new THREE.Vector3(...v.tgt);
    if(now){ camera.position.copy(P); controls.target.copy(T); controls.update(); draw(); return; }
    const p0 = camera.position.clone(), t0 = controls.target.clone(), start = performance.now();
    const step = ()=>{ const k = Math.min(1, (performance.now() - start) / 700), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      camera.position.lerpVectors(p0, P, e); controls.target.lerpVectors(t0, T, e); controls.update(); V.renderer.render(V.scene, camera); if(k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  // watch the page: whenever a slot appears (the page redraws a lot), move the view into it and update
  let lastSig = '';
  function check(){
    const slot = document.querySelector('.h3d-slot'); if(!slot) return;
    if(!V) makeView();
    if(V.wrap.parentNode !== slot) slot.appendChild(V.wrap);
    const sig = [slot.dataset.model, slot.dataset.h3d, slot.dataset.door, slot.dataset.doorHex, slot.dataset.siding, slot.dataset.gd, slot.dataset.gdHex].join('|');
    if(sig !== lastSig || !V.renderer){ lastSig = sig; update(slot); } else fit();
  }
  new MutationObserver(check).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', check);

  window.House3D = { has: style=>!!keyOf(style), models: MODELS, garagePic };
})();
