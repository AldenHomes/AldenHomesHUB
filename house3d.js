/* House3D — the customer's home style in 3D, with the front door they're looking at and their siding colour (owner, 2026-11-09:
   "seeing the door on the house when making door selections… a close up door view and then one faraway shot… the house should have the
   siding color applied"). Used by selections.html's Front Door Style question.

   How a page uses it: put <div class="h3d-slot" data-h3d="close|far" data-model="<home style>" data-door="<door picture>"
   data-door-hex="#rrggbb" data-siding="<siding picture>"></div> anywhere. This file watches the page, moves its one 3D view into the
   slot (so the page can redraw freely) and brings it up to date. House3D.has(style) says whether a style has a model.

   Models come from Chief Architect's Collada (.dae) export, kept in models/<name>/. Per model: where Chief's own front door is (hidden;
   ours goes in the same opening), and the two camera views. To add a home style: export it from Chief as .dae, put it in models/, find
   its front door opening (see the notes in .claude/percy-test) and add a MODELS entry.

   Doors are built from the same Therma-Tru drawings the question shows (selection-photos/doors/): the cream door becomes a painted
   slab (the drawing's lines and shadows kept as shading + a little relief), the grey glass becomes real glass. Works for any door
   drawn that way, so new doors need no measuring.

   three.js 0.160.0 from jsDelivr, loaded only when a 3D view is first shown. Draws only when something changes (easy on iPads). */
(function(){
  const CDN = 'https://cdn.jsdelivr.net/npm/three@0.160.0';
  const MODELS = {
    percy: { label: 'Percy A', file: 'models/percy-a/percyA.dae', grass: 'PERCY_A_textures/Grass7.jpg',
      door: { hide: /mat147/, at: [12.45, 0.02, -10.62], w: 0.91, h: 2.01, fill: [12.95, 1.9, -8.4] },
      // Chief's garage door face: x 14.38–19.23, floor 0.0–2.13 (16' x 7'), face z −5.045, trim stands out to −4.931 (mat146 is also used elsewhere, so it isn't hidden — ours goes just in front)
      garage: { mat: /mat146/, at: [14.38, 0.0, -5.06], w: 4.85, h: 2.13, inW: 192, inH: 84 },
      views: { close: { pos: [12.75, 1.6, -2.2], tgt: [12.9, 1.05, -10.6] }, far: { pos: [11.8, 1.7, 10], tgt: [14, 2.6, -9] },
        garage: { pos: [16.3, 1.75, 3.4], tgt: [16.8, 1.35, -5] } } },
  };
  const keyOf = style=>{ const s = String(style || '').trim().toLowerCase(); return Object.keys(MODELS).find(k=>s === k || s.startsWith(k + ' ')) || null; };

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
    wrap.innerHTML = '<canvas></canvas><div class="h3d-msg">Loading the house…</div><div class="h3d-hint">Drag to look around · pinch or scroll to zoom</div>';
    const st = document.createElement('style'); st.textContent = `
      .h3d-slot{position:relative; width:100%; aspect-ratio:4/3; max-height:70vh; border-radius:12px; overflow:hidden; background:#cfdbe6;}
      .h3d-slot[data-h3d="far"]{aspect-ratio:16/10;}
      .h3d{position:absolute; inset:0;} .h3d canvas{width:100%; height:100%; display:block; touch-action:none; cursor:grab;}
      .h3d-msg{position:absolute; inset:0; display:flex; align-items:center; justify-content:center; text-align:center; padding:20px; color:#35465a; font-size:15px; background:rgba(207,219,230,.85);}
      .h3d-msg[hidden]{display:none;}
      .h3d-hint{position:absolute; left:10px; bottom:8px; font-size:12px; color:#fff; text-shadow:0 1px 2px rgba(0,0,0,.6); pointer-events:none;}`;
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
      roof: mk(g=>{ const rows = 13, H = 1024 / rows; let s = 7; const rnd = ()=>(s = (s * 16807) % 2147483647) / 2147483647;
        for(let r = 0; r < rows; r++){ const y = r * H, off = (r % 2) * 64 + rnd() * 30; for(let x = -128 + off; x < 1024; x += 128 * (0.8 + rnd() * 0.4)){ const v = 52 + rnd() * 26;
          g.fillStyle = `rgb(${v},${v + 2},${v + 6})`; g.fillRect(x, y, 140, H); g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x, y, 3, H); }
          g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, y + H - 6, 1024, 6); g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(0, y, 1024, 4); } noise(g, 22); }),
    };
  }

  /* ---------- a home style ---------- */
  async function loadModel(key){
    const M = MODELS[key], { THREE, ColladaLoader } = V.L;
    say('Loading the ' + M.label + '…');
    const text = await (await fetch(M.file)).text();
    // which material uses which picture (Collada: material → effect → image)
    const img = {}; for(const m of text.matchAll(/<image id="([^"]+)"[^>]*>\s*<init_from>([^<]+)<\/init_from>/g)) img[m[1]] = m[2];
    const texOf = {}; for(const m of text.matchAll(/<effect id="([^"]+)"[\s\S]*?<\/effect>/g)){ const f = (m[0].match(/<init_from>([^<]+)<\/init_from>/) || [])[1]; if(f) texOf[m[1].replace(/-(effect|fx)$/, '')] = (img[f] || f).split('/').pop(); }
    const base = M.file.replace(/[^/]+$/, ''), root = new ColladaLoader().parse(text, base).scene;
    const C = crisp(THREE, V.renderer), aniso = V.renderer.capabilities.getMaxAnisotropy(), siding = [], lawn = [];
    root.traverse(o=>{
      if(o.isLight){ o.visible = false; return; }   // Chief's own sun / ambient
      if(!o.isMesh) return; o.castShadow = o.receiveShadow = true;
      const mats = (Array.isArray(o.material) ? o.material : [o.material]).map(m=>{
        const tex = texOf[String(m.name || '').replace(/-material$/, '')] || '';
        const glass = !m.map && m.color && m.color.b > 0.75 && m.color.g > 0.75 && m.color.r < 0.7;   // Chief's light blue = glass
        const n = new THREE.MeshStandardMaterial({ name: m.name, color: m.color, map: m.map || null, transparent: m.transparent, opacity: m.opacity,
          roughness: glass ? 0.05 : /Asphalt|Concrete|Grass/i.test(tex) ? 0.95 : 0.8, metalness: glass ? 0.6 : 0, side: m.side, envMapIntensity: glass ? 1.4 : 0.6 });
        if(n.map){ n.map.anisotropy = aniso; n.map.colorSpace = THREE.SRGBColorSpace; }
        const c = /mstreet|classicd/i.test(tex) ? C.lap : /boardbatten/i.test(tex) ? C.bb : /CAAsphalt/i.test(tex) ? C.roof : null;
        if(c && n.map){ const t = c.clone(); t.repeat.copy(n.map.repeat); t.offset.copy(n.map.offset); t.rotation = n.map.rotation; t.center.copy(n.map.center); t.needsUpdate = true; n.map = t; }
        if(/mstreet|boardbatten|classicd/i.test(tex)) siding.push(n);
        if(/Grass/i.test(tex)) lawn.push(o);
        if(M.door.hide.test(m.name)) n.visible = false;                 // Chief's placeholder front door
        if(M.garage && M.garage.mat.test(m.name)) n.color.set(0xf1f0eb); // garage door white (Chief exports a coral placeholder)
        return n; });
      o.material = Array.isArray(o.material) ? mats : mats[0];
    });
    root.updateMatrixWorld(true);
    // Chief's green box → a lawn to the horizon
    let lawnTop = 0; lawn.forEach(o=>{ lawnTop = Math.max(lawnTop, new THREE.Box3().setFromObject(o).max.y); o.visible = false; });
    const box = new THREE.Box3().setFromObject(root), sz = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3()), d = Math.max(sz.x, sz.z);
    const grass = new THREE.TextureLoader().load(base + M.grass); grass.colorSpace = THREE.SRGBColorSpace; grass.wrapS = grass.wrapT = THREE.RepeatWrapping;
    grass.repeat.set(d * 40 / 3, d * 40 / 3); grass.anisotropy = aniso;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(d * 40, d * 40), new THREE.MeshStandardMaterial({ map: grass, color: 0xb8c79a, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = lawnTop - 0.5; ground.receiveShadow = true;
    const group = new THREE.Group(); group.add(root, ground);
    // soft light bouncing into the porch, so the door isn't lost in shade
    const fill = new THREE.PointLight(0xfff4e6, 2.2, 6, 1.5); fill.position.set(...M.door.fill); group.add(fill);
    // the sun: late morning, from the front left
    const sd = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(58), THREE.MathUtils.degToRad(20));
    V.sun.position.copy(ctr).add(sd.multiplyScalar(d * 2)); V.sun.target.position.copy(ctr);
    const sc = V.sun.shadow.camera; sc.left = -d; sc.right = d; sc.top = d; sc.bottom = -d; sc.near = 1; sc.far = d * 5; sc.updateProjectionMatrix();
    V.scene.fog = new THREE.Fog(0xdde7ef, d * 4, d * 22);
    return { key, M, group, siding };
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
    const { THREE } = V, M = V.model.M, maps = await doorMaps(src), aniso = V.renderer.capabilities.getMaxAnisotropy();
    const tex = (cv, srgb)=>{ const t = new THREE.CanvasTexture(cv); if(srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; return t; };
    const W = M.door.w, H = M.door.h, T = 0.045, g = new THREE.Group();
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
    g.position.set(...M.door.at);
    g.userData.paint = [paint, edge];
    return g;
  }

  /* ---------- a garage door, drawn (Haas 600 series, owner 2026-11-09) ----------
     spec = 'long|carriage' etc.: panel 'short' (8 across) or 'long' (4 across), windows in the top section 'carriage' (4-pane, one per
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
    const secs = 4, secH = inH / secs, edge = 3, gap = 2.5, n = panel === 'long' ? 4 : 8, pw = (inW - 2 * edge - (n - 1) * gap) / n, vm = secH * 0.17, ph = secH - 2 * vm;
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
      for(let i = 0; i < n; i++){
        const x = edge + i * (pw + gap), y = y0 + vm;
        if(s === 0 && win === 'standard' && panel === 'short'){ const ww = 18.4, wh = 11.4; windowAt(x + (pw - ww) / 2, y0 + (secH - wh) / 2, ww, wh, 1); continue; }
        recess(x, y, pw, ph); }
      if(s === 0 && (win === 'carriage' || win === 'ranch')){   // one wide window per long panel (or per pair of short panels)
        const ww = win === 'carriage' ? 39.4 : 39.4, wh = win === 'carriage' ? 13.6 : 11.5, slots = 4, sw = (inW - 2 * edge) / slots;
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
  async function makeGarage(spec, hex){
    const { THREE } = V, G = V.model.M.garage, maps = garageMaps(spec, G.inW, G.inH), aniso = V.renderer.capabilities.getMaxAnisotropy();
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
        V.model = await loadModel(want.key); V.scene.add(V.model.group); V.doorObj = null; V.gdObj = null; V.have = {};
      }
      if(V.have.door !== want.door && want.door){
        say('Hanging the door…');
        const d = await makeDoor(want.door, want.hex); if(V.doorObj) V.model.group.remove(V.doorObj);
        V.doorObj = d; V.model.group.add(d); V.have.door = want.door; V.have.hex = want.hex;
      }
      if(V.have.gd !== want.gd && V.model.M.garage.at){
        if(V.gdObj){ V.model.group.remove(V.gdObj); V.gdObj = null; }
        if(want.gd){ V.gdObj = await makeGarage(want.gd, want.gdHex); V.model.group.add(V.gdObj); }
        V.have.gd = want.gd; V.have.gdHex = want.gdHex;
      }
      if(V.gdObj && V.have.gdHex !== want.gdHex){ V.gdObj.userData.paint.forEach(m=>m.color.set(want.gdHex)); V.have.gdHex = want.gdHex; }
      if(V.doorObj && V.have.hex !== want.hex){ V.doorObj.userData.paint.forEach(m=>m.color.set(want.hex)); V.have.hex = want.hex; }
      if(V.have.siding !== want.siding){
        const hex = want.siding ? await sidingHex(want.siding) : null;
        V.model.siding.forEach(m=>{ if(!m.userData.base) m.userData.base = m.color.clone(); if(hex) m.color.set(hex).multiplyScalar(1.45); else m.color.copy(m.userData.base); });
        V.have.siding = want.siding;
      }
      if(V.have.view !== want.view || V.have.viewKey !== want.key){ fly(V.model.M.views[want.view], !V.have.view); V.have.view = want.view; V.have.viewKey = want.key; }
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
