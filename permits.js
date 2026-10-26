/* ============================================================
   PERMITS (owner, 2026-10-26) — the "Permits" card on house.html.
   At the Cliffs (Cornwall Borough) the order is: water & sewer application → once approved, the zoning permit application →
   once zoning is approved, the building permit. Each step has Submitted / Approved dates (and a permit # where there is one),
   saved on the home as jobs/{id}.permits = { ws:{sent,ok}, zoning:{sent,ok,no}, building:{sent,ok,no}, info:{cost,len,wid,hgt,sqft,parcel} }.
   "Fill out" writes the answers onto the borough's own blank PDF (forms/…, public forms) in the browser with pdf-lib and opens it
   ready to print and sign. Answers come from the home (address, lot), Alden's details (settings/permits.company, typed in Admin
   Settings → Permit forms), the development (PERMIT_DEVS) and the "Details for the forms" box. Size per home style is remembered in
   settings/permits.models so the next house of that style starts filled in. Positions were measured on the blank forms (PDF points,
   from the bottom left) and checked against the office's filled CL 113 applications.
   ============================================================ */
(function(){
  const PDFLIB = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
  // developments with permit forms set up (borough info is public)
  const PERMIT_DEVS = {
    CL: { borough: 'Cornwall Borough', city: 'Lebanon PA', zip: '17042', subdivision: 'Cliffs', forms: { ws: true, zoning: true } },
  };
  const STEPS_FORMS = [
    { id: 'ws', t: 'Water & sewer application', hint: 'First. The zoning application goes in once this is approved.', form: 'ws' },
    { id: 'zoning', t: 'Zoning permit', hint: 'After water & sewer is approved.', form: 'zoning', no: true },
    { id: 'building', t: 'Building permit', hint: 'After zoning is approved.', no: true },
  ];
  // a development without forms in the hub yet: one line to track the dates
  const OTHER_STEPS = [{ id: 'building', t: 'Permits', hint: 'This development\'s permit forms aren\'t in the hub yet — track the dates here.', no: true }];
  let settings = null, open = false, busy = '';
  /* RED BANNER (owner, 2026-10-26): a home signed through Selections (jobs.selectionSheet) shows a red bar at the top of its page
     while a permit step is waiting on us (next step not submitted yet). It goes away while the borough has it, and when all are done. */
  function banner(dev, steps, p){
    let b = $('permitsBanner');
    const home = $('home');
    if(!b && home){ b = document.createElement('a'); b.id = 'permitsBanner'; b.href = '#permitsCard';
      b.style.cssText = 'display:none; margin:0 0 14px; padding:12px 16px; border-radius:10px; background:#b3261e; color:#fff; font-weight:700; font-size:15px; text-decoration:none; box-shadow:0 2px 8px rgba(179,38,30,.25);';
      home.insertBefore(b, home.firstChild); }
    if(!b) return;
    const nowIdx = steps.findIndex(s=>!(p[s.id] || {}).ok), st = nowIdx < 0 ? null : steps[nowIdx];
    const due = job.selectionSheet && st && !(p[st.id] || {}).sent;
    b.style.display = due ? 'block' : 'none';
    if(due) b.innerHTML = `&#9888; Permits need to be sent out${dev ? ': ' + esc(st.t.toLowerCase()) : ''}${st.form && dev ? ' — fill out the form' + (st.form === 'ws' ? 's' : '') + ', check the pages, then send' : ''}. <span style="font-weight:400; text-decoration:underline;">Open Permits</span>`;
  }
  const $ = id=>document.getElementById(id);
  const esc = s=>(s == null ? '' : String(s)).replace(/[&<>"']/g, c=>({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = ()=>{ const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const short = s=>{ if(!s) return ''; const [y, m, d] = s.split('-'); return Number(m) + '/' + Number(d) + '/' + y.slice(2); };
  const nice = s=>{ if(!s) return ''; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };

  function card(){
    let c = $('permitsCard');
    if(c) return c;
    const before = $('costs'); if(!before) return null;
    c = document.createElement('div'); c.className = 'card wide'; c.id = 'permitsCard';
    c.innerHTML = `<div class="card-head"><div class="card-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M9 15l2 2 4-4"/></svg></div><h3>Permits</h3></div>
      <div class="card-body" id="permitsBody"></div>
      <style>
        .pm-step{display:grid; grid-template-columns:28px minmax(0,1fr); gap:4px 10px; padding:12px 0; border-top:1px solid #eee;}
        .pm-step:first-child{border-top:none;}
        .pm-n{width:26px; height:26px; border-radius:50%; background:#e9ebe4; color:#4c5144; font-weight:800; display:flex; align-items:center; justify-content:center; font-size:13px;}
        .pm-step.ok .pm-n{background:#2f6b45; color:#fff;} .pm-step.now .pm-n{background:#1f3550; color:#fff;}
        .pm-t{font-weight:700;} .pm-h{font-size:12.5px; color:#777; margin-top:2px;}
        .pm-row{grid-column:2; display:flex; gap:8px 14px; flex-wrap:wrap; align-items:flex-end; margin-top:8px; font-size:13px;}
        .pm-row label{display:flex; flex-direction:column; gap:3px; font-size:11px; font-weight:700; letter-spacing:.3px; text-transform:uppercase; color:#777;}
        .pm-row input{padding:7px 8px; border:1px solid #d6d2c4; border-radius:6px; font-size:14px; font-family:inherit; text-transform:none; letter-spacing:0; font-weight:400; color:#222;}
        .pm-info{display:grid; grid-template-columns:repeat(auto-fill,minmax(130px,1fr)); gap:10px; margin-top:10px;}
        .pm-info label{display:flex; flex-direction:column; gap:3px; font-size:11px; font-weight:700; text-transform:uppercase; color:#777;}
        .pm-info input{padding:7px 8px; border:1px solid #d6d2c4; border-radius:6px; font-size:14px; font-family:inherit;}
        .pm-next{background:#f3f5ee; border:1px solid #dfe3d3; border-radius:8px; padding:9px 12px; font-size:14px; margin-bottom:6px;}
      </style>`;
    before.parentNode.insertBefore(c, before);
    c.addEventListener('click', onClick);
    c.addEventListener('change', onChange);
    return c;
  }
  const hasJob = ()=>typeof job !== 'undefined' && !!job;
  const P = ()=>(hasJob() && job.permits) || {};
  function info(){
    const i = { ...(P().info || {}) };
    const m = settings && settings.models && job.model ? settings.models[String(job.model).toLowerCase()] : null;
    ['len', 'wid', 'hgt', 'sqft'].forEach(k=>{ if(i[k] == null || i[k] === ''){ if(job.size && job.size[k]) i[k] = job.size[k]; else if(m && m[k]) i[k] = m[k]; } });
    if((i.sqft == null || i.sqft === '') && job.sqft) i.sqft = job.sqft;
    return i;
  }
  window.renderPermits = function(){
    if(!hasJob()) return;
    const dev = PERMIT_DEVS[job.community], STEPS = dev ? STEPS_FORMS : OTHER_STEPS;
    const c = card(); if(!c) return;
    c.style.display = '';
    const p = P(), inf = info();
    banner(dev, STEPS, p);
    const doneIdx = STEPS.filter(s=>(p[s.id] || {}).ok).length;
    let nowIdx = STEPS.findIndex(s=>!(p[s.id] || {}).ok);
    const next = nowIdx < 0 ? 'All permits approved.' : (p[STEPS[nowIdx].id] || {}).sent ? `Waiting on: ${STEPS[nowIdx].t.toLowerCase()} (submitted ${nice(p[STEPS[nowIdx].id].sent)}).` : `Next: ${STEPS[nowIdx].form ? 'fill out and submit' : 'apply for'} the ${STEPS[nowIdx].t.toLowerCase()}.`;
    $('permitsBody').innerHTML = `<div class="pm-next"><b>${esc(next)}</b> <span style="color:#777">${doneIdx} of ${STEPS.length} approved${dev ? ' · ' + esc(dev.borough) : ''}</span></div>
      ${STEPS.map((s, i)=>{ const st = p[s.id] || {};
        return `<div class="pm-step ${st.ok ? 'ok' : i === nowIdx ? 'now' : ''}"><div class="pm-n">${st.ok ? '&#10003;' : i + 1}</div>
          <div><div class="pm-t">${esc(s.t)}</div><div class="pm-h">${esc(s.hint)}</div></div>
          <div class="pm-row">${s.form && dev && dev.forms[s.form] ? `<button type="button" class="btn ${i === nowIdx && !st.sent ? 'btn-primary' : 'btn-ghost'}" data-fill="${s.form}" ${busy === s.form ? 'disabled' : ''}>${busy === s.form ? 'Filling in…' : 'Fill out the form' + (s.form === 'ws' ? 's' : '')}</button>` : ''}
            <label>Submitted<input type="date" data-pm="${s.id}.sent" value="${esc(st.sent || '')}"></label>
            <label>Approved<input type="date" data-pm="${s.id}.ok" value="${esc(st.ok || '')}"></label>
            ${s.no ? `<label>Permit #<input type="text" data-pm="${s.id}.no" value="${esc(st.no || '')}" style="width:130px"></label>` : ''}</div></div>`; }).join('')}
      ${!dev ? '' : `<details ${open ? 'open' : ''} id="pmDetails" style="margin-top:8px;"><summary style="cursor:pointer; font-weight:700; font-size:14px;">Details for the forms</summary>
        <div class="pm-info">
          <label>Project cost ($)<input type="text" data-money data-pi="cost" value="${esc(inf.cost || '')}" placeholder="for the zoning form"></label>
          <label>Length (ft)<input type="number" step="0.5" data-pi="len" value="${esc(inf.len || '')}"></label>
          <label>Width (ft)<input type="number" step="0.5" data-pi="wid" value="${esc(inf.wid || '')}"></label>
          <label>Height (ft)<input type="number" step="0.5" data-pi="hgt" value="${esc(inf.hgt || '')}"></label>
          <label>Total sq ft<input type="number" step="1" data-pi="sqft" value="${esc(inf.sqft || '')}"></label>
          <label>Tax parcel / UPI<input type="text" data-pi="parcel" value="${esc(inf.parcel || '')}" placeholder="optional"></label>
        </div>
        <div style="font-size:12.5px; color:#777; margin-top:6px;">Length, width, height and sq ft are remembered for the ${esc(job.model || 'home style')} so the next one starts filled in. Alden's name, address, phone, email and license # come from Admin Settings → Permit forms.</div>
      </details>`}`;
  };
  async function save(patch){
    try{ await db.collection('jobs').doc(houseId).set({ permits: patch }, { merge: true }); }
    catch(err){ console.error(err); alert('Could not save — check your connection.'); }
  }
  function onChange(e){
    const el = e.target;
    if(el.dataset.pm){
      const [step, f] = el.dataset.pm.split('.');
      const v = f === 'no' ? el.value.trim().slice(0, 40) : el.value;
      save({ [step]: { [f]: v } });
      return;
    }
    if(el.dataset.pi){
      const k = el.dataset.pi, v = k === 'parcel' ? el.value.trim().slice(0, 60) : (el.value === '' ? '' : Number(el.value));
      save({ info: { [k]: v } });
      // a style's size: remember it for the next house of that style
      if(['len', 'wid', 'hgt', 'sqft'].includes(k) && job.model && v !== ''){
        const key = String(job.model).toLowerCase();
        db.collection('settings').doc('permits').set({ models: { [key]: { [k]: v } } }, { merge: true }).catch(err=>console.error(err));
      }
    }
  }
  document.addEventListener('toggle', e=>{ if(e.target && e.target.id === 'pmDetails') open = e.target.open; }, true);
  async function onClick(e){
    const b = e.target.closest('[data-fill]'); if(!b) return;
    const which = b.dataset.fill, co = (settings && settings.company) || {};
    if(!co.name || !co.address){ alert('First type Alden\'s details in Admin Settings → Permit forms (name, address, phone, email, license #).'); return; }
    const w = window.open('', '_blank');
    if(w) w.document.write('<p style="font:16px sans-serif;padding:24px">Filling in the form…</p>');
    busy = which; renderPermits();
    try{
      const url = await fill(which, co, PERMIT_DEVS[job.community], info());
      if(w) w.location = url; else location.href = url;
    } catch(err){ console.error(err); if(w) w.close(); alert('Could not fill in the form. Check your connection and try again.'); }
    busy = ''; renderPermits();
  }
  function loadLib(){
    if(window.PDFLib) return Promise.resolve(window.PDFLib);
    return new Promise((ok, bad)=>{ const s = document.createElement('script'); s.src = PDFLIB; s.onload = ()=>ok(window.PDFLib); s.onerror = bad; document.head.appendChild(s); });
  }
  const plain = s=>String(s == null ? '' : s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/[^\x20-\x7e]/g, '');
  async function fill(which, co, dev, inf){
    const { PDFDocument, StandardFonts, rgb } = await loadLib();
    const street = job.address || '', lot = job.lot || '';
    const cityLine = dev.city + ' ' + dev.zip, date = short(today());
    const money = n=>Number(n) ? Number(n).toLocaleString('en-US') : '';
    const out = await PDFDocument.create();
    const font = await out.embedFont(StandardFonts.Helvetica);
    const ink = rgb(0.05, 0.12, 0.45);
    async function addForm(file){
      const src = await PDFDocument.load(await (await fetch(file)).arrayBuffer());
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach(p=>out.addPage(p));
      return pages;
    }
    const put = (page, x, y, v, size)=>{ v = plain(v); if(!v) return; let s = size || 10.5; while(s > 7 && font.widthOfTextAtSize(v, s) > 560 - x) s -= 0.5; page.drawText(v, { x, y: y + 1, size: s, font, color: ink }); };
    const ring = (page, x, y, xs, ys)=>page.drawEllipse({ x, y, xScale: xs, yScale: ys, borderColor: ink, borderWidth: 1.2 });
    if(which === 'ws'){
      const [w1, w2] = await addForm('forms/cornwall-water.pdf');
      put(w1, 80, 606, street); put(w1, 358, 606, dev.city); put(w1, 448, 606, dev.zip);
      put(w1, 80, 572, dev.subdivision); put(w1, 158, 572, lot); put(w1, 235, 572, inf.parcel, 9);
      put(w1, 150, 542, 'New single-family dwelling'); put(w1, 250, 519, '1');
      put(w1, 160, 485, co.name); put(w1, 115, 462, co.address);
      put(w1, 133, 439, co.phone); put(w1, 434, 439, co.email, 9);
      put(w1, 125, 416, co.name); put(w1, 458, 416, co.license);
      put(w1, 115, 404, co.address); put(w1, 133, 381, co.phone); put(w1, 432, 381, co.email, 9);
      put(w2, 102, 573, date); put(w2, 325, 550, co.applicant || co.name);
      const [s1] = await addForm('forms/cornwall-sewer.pdf');
      put(s1, 52, 654, co.applicant || co.name);
      put(s1, 150, 601, 'X', 12);
      put(s1, 150, 551, street + (lot ? '   Lot ' + lot : '')); put(s1, 150, 533, cityLine); put(s1, 150, 516, dev.borough);
      put(s1, 212, 487, co.name); put(s1, 150, 470, co.address);
      put(s1, 172, 436, dev.subdivision); put(s1, 160, 401, co.name); put(s1, 172, 367, co.phone);
      put(s1, 150, 321, date);
    } else {
      const [z] = await addForm('forms/cornwall-zoning.pdf');
      put(z, 142, 628, co.name); put(z, 130, 612, co.address);
      put(z, 120, 597, co.email, 9); put(z, 392, 597, co.phone);
      put(z, 128, 539, co.name); put(z, 90, 524, co.address);
      put(z, 120, 508, co.email, 9); put(z, 388, 508, co.phone);
      put(z, 118, 465, street + ', ' + cityLine + (lot ? '   Lot ' + lot : ''));
      put(z, 142, 450, inf.parcel);
      ring(z, 168, 438, 35, 9); ring(z, 505, 423, 11, 9);
      put(z, 188, 391, 'New SFD'); put(z, 456, 391, 'Residence');
      put(z, 116, 362, money(inf.cost));
      put(z, 82, 348, inf.len ? inf.len + "'" : ''); put(z, 216, 348, inf.wid ? inf.wid + "'" : ''); put(z, 358, 348, inf.hgt ? inf.hgt + "'" : '');
      put(z, 470, 334, inf.sqft ? Number(inf.sqft).toLocaleString('en-US') : '');
      put(z, 470, 222, date);
    }
    const bytes = await out.save();
    return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  }
  // Alden's details + remembered style sizes
  function listen(){
    if(typeof db === 'undefined' || !window.firebase || !firebase.auth().currentUser){ setTimeout(listen, 800); return; }
    db.collection('settings').doc('permits').onSnapshot(d=>{ settings = d.exists ? d.data() : {}; if(hasJob()) renderPermits(); }, err=>console.error('permits settings', err));
  }
  listen();
})();
