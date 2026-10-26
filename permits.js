/* ============================================================
   PERMITS (owner, 2026-10-26) — the "Permits" card, on house.html (the home on screen, global `job`) and in the Permits app
   (permits.html sets window.PERMIT_JOB and has a #permitsMount box; it also uses window.Permits for the list and settings).
   At the Cliffs (Cornwall Borough) the order is: water & sewer application → once approved, the zoning permit application →
   once zoning is approved, the building permit. Each step has Submitted / Approved dates (and a permit # where there is one),
   saved on the home as jobs/{id}.permits = { ws:{sent,ok}, zoning:{sent,ok,no}, building:{sent,ok,no}, forms:{ ws:{…}, zoning:{…} } }.
   FILL OUT TO COMPLETION (owner, 2026-10-26: "fill out all the forms in the alden hub to completion then just download pdf to print or
   to email out"): "Fill out" opens a form screen with a box for EVERY blank on the borough's form (FORMS below). Each box starts with
   what the hub knows (`def`: the home, Alden's details in settings/permits.company, the development, the home style's size in
   settings/permits.models, today's date); anything typed is saved for that home in permits.forms[form][key] ('' = left blank on
   purpose). Choices (Residential / Commercial …, Yes / No) are pick lists that circle or tick the form. The applicant's signature is
   drawn once in the Permits app → Settings (settings/permits.signature, a PNG) and added per form with a tick box. "Download PDF" /
   "Open to print" write it all onto the borough's own blank PDF (forms/…, public forms) in the browser with pdf-lib.
   Positions are PDF points from the bottom left, measured from the blank forms' text and checked against the office's filled CL 113
   applications. To add a development: its blank forms in forms/, an entry in PERMIT_DEVS, and its fields in FORMS.
   ============================================================ */
(function(){
  const PDFLIB = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
  // developments with permit forms set up (borough info is public)
  const PERMIT_DEVS = {
    CL: { borough: 'Cornwall Borough', city: 'Lebanon PA', zip: '17042', subdivision: 'Cliffs', forms: { ws: 'cornwall-ws', zoning: 'cornwall-zoning' } },
  };
  const STEPS_FORMS = [
    { id: 'ws', t: 'Water & sewer application', hint: 'First. The zoning application goes in once this is approved.', form: 'ws' },
    { id: 'zoning', t: 'Zoning permit', hint: 'After water & sewer is approved.', form: 'zoning', no: true },
    { id: 'building', t: 'Building permit', hint: 'After zoning is approved.', no: true },
  ];
  // a development without forms in the hub yet: one line to track the dates
  const OTHER_STEPS = [{ id: 'building', t: 'Permits', hint: 'This development\'s permit forms aren\'t in the hub yet — track the dates here.', no: true }];

  /* Every blank on each form. p = page in the finished PDF; x, y = where the text starts; s = text size; def(c) = the hub's answer.
     type 'choice': opts each circle (ring: x, y, width, height) or tick (mark: x, y) their spot. type 'sig': the applicant's signature. */
  const FORMS = {
    'cornwall-ws': { title: 'Water & Sewer application', files: ['forms/cornwall-water.pdf', 'forms/cornwall-sewer.pdf'], fields: [
      { sec: 'Water service — the property' },
      { k: 'street', l: 'Street address', p: 0, x: 80, y: 606, def: c=>c.street },
      { k: 'city', l: 'City and state', p: 0, x: 358, y: 606, def: c=>c.dev.city },
      { k: 'zip', l: 'Zip', p: 0, x: 448, y: 606, def: c=>c.dev.zip },
      { k: 'subdiv', l: 'Subdivision', p: 0, x: 80, y: 572, def: c=>c.dev.subdivision },
      { k: 'lot', l: 'Lot number', p: 0, x: 158, y: 572, def: c=>c.lot },
      { k: 'upi', l: 'UPI', p: 0, x: 235, y: 572, s: 9, def: c=>c.inf.parcel },
      { k: 'zdist', l: 'Zoning district', p: 0, x: 358, y: 572, s: 9 },
      { k: 'cval', l: 'Construction est. value', p: 0, x: 448, y: 572, s: 9 },
      { k: 'use', l: 'Use of structure', p: 0, x: 150, y: 542, def: ()=>'New single-family dwelling' },
      { k: 'units', l: 'If residential, number of dwelling units', p: 0, x: 250, y: 519, def: ()=>'1' },
      { k: 'edus', l: 'If nonresidential, number of EDUs', p: 0, x: 230, y: 496 },
      { sec: 'Water service — property owner' },
      { k: 'oname', l: 'Property owner(s)', p: 0, x: 160, y: 485, def: c=>c.co.name },
      { k: 'oaddr', l: 'Address', p: 0, x: 115, y: 462, def: c=>c.co.address },
      { k: 'owork', l: 'Work phone', p: 0, x: 133, y: 439, def: c=>c.co.phone },
      { k: 'ocell', l: 'Home / cell phone', p: 0, x: 312, y: 439, s: 9 },
      { k: 'oemail', l: 'E-mail', p: 0, x: 434, y: 439, s: 9, def: c=>c.co.email },
      { sec: 'Water service — contractor' },
      { k: 'cname', l: 'Contractor', p: 0, x: 125, y: 416, def: c=>c.co.name },
      { k: 'lic', l: 'State contractor license no.', p: 0, x: 458, y: 416, def: c=>c.co.license },
      { k: 'caddr', l: 'Address', p: 0, x: 115, y: 404, def: c=>c.co.address },
      { k: 'cwork', l: 'Work phone', p: 0, x: 133, y: 381, def: c=>c.co.phone },
      { k: 'ccell', l: 'Home / cell phone', p: 0, x: 302, y: 381, s: 9 },
      { k: 'cemail', l: 'E-mail', p: 0, x: 432, y: 381, s: 9, def: c=>c.co.email },
      { sec: 'Water service — signatures (page 2)' },
      { k: 'wdate1', l: 'Date', p: 1, x: 102, y: 573, def: c=>c.date },
      { k: 'wsig1', l: 'Signature of property owner', type: 'sig', p: 1, x: 335, y: 570 },
      { k: 'wname1', l: 'Print property owner name', p: 1, x: 325, y: 550, def: c=>c.co.applicant || c.co.name },
      { k: 'wdate2', l: 'Second owner: date', p: 1, x: 102, y: 527 },
      { k: 'wname2', l: 'Second owner: print name', p: 1, x: 325, y: 504 },
      { sec: 'Sewer application' },
      { k: 'sname', l: 'I, (applicant)', p: 2, x: 52, y: 654, def: c=>c.co.applicant || c.co.name },
      { k: 'btype', l: 'Type of building', type: 'choice', p: 2, def: ()=>'Residential', opts: [
        { v: 'Residential', mark: [150, 601] }, { v: 'Commercial', mark: [256, 601] }, { v: 'Industrial', mark: [364, 601] },
        { v: 'Apartments', mark: [78, 584] }, { v: 'Restaurant', mark: [230, 584] }, { v: 'Other', mark: [330, 584] }] },
      { k: 'aunits', l: 'Apartments: number of units', p: 2, x: 159, y: 584, s: 9 },
      { k: 'bother', l: 'Other (type of building)', p: 2, x: 395, y: 584, s: 9 },
      { k: 'saddr1', l: 'Service address — line 1', p: 2, x: 150, y: 551, def: c=>c.street + (c.lot ? '   Lot ' + c.lot : '') },
      { k: 'saddr2', l: 'Service address — line 2', p: 2, x: 150, y: 533, def: c=>c.dev.city + ' ' + c.dev.zip },
      { k: 'saddr3', l: 'Township / borough', p: 2, x: 150, y: 516, def: c=>c.dev.borough },
      { k: 'bname', l: 'Billing name (if different)', p: 2, x: 212, y: 487, def: c=>c.co.name },
      { k: 'baddr', l: 'Billing address', p: 2, x: 150, y: 470, def: c=>c.co.address },
      { k: 'sdev', l: 'Development', p: 2, x: 172, y: 436, def: c=>c.dev.subdivision },
      { k: 'scomp', l: 'Company', p: 2, x: 160, y: 401, def: c=>c.co.name },
      { k: 'sphone', l: 'Applicant\'s phone number', p: 2, x: 172, y: 367, def: c=>c.co.phone },
      { k: 'ssig', l: 'Signature of applicant', type: 'sig', p: 2, x: 40, y: 322 },
      { k: 'sdate', l: 'Date', p: 2, x: 150, y: 321, def: c=>c.date },
    ] },
    'cornwall-zoning': { title: 'Zoning permit application', files: ['forms/cornwall-zoning.pdf'], fields: [
      { sec: 'Land / property owner' },
      { k: 'owner', l: 'Property owner(s)', p: 0, x: 142, y: 628, def: c=>c.co.name },
      { k: 'maddr', l: 'Mailing address', p: 0, x: 130, y: 612, def: c=>c.co.address },
      { k: 'oemail', l: 'Email address', p: 0, x: 120, y: 597, s: 9, def: c=>c.co.email },
      { k: 'ophone', l: 'Phone no.', p: 0, x: 392, y: 597, def: c=>c.co.phone },
      { sec: 'Contractor' },
      { k: 'bname', l: 'Business name', p: 0, x: 128, y: 539, def: c=>c.co.name },
      { k: 'baddr', l: 'Address', p: 0, x: 90, y: 524, def: c=>c.co.address },
      { k: 'bemail', l: 'Email address', p: 0, x: 120, y: 508, s: 9, def: c=>c.co.email },
      { k: 'bphone', l: 'Phone no.', p: 0, x: 388, y: 508, def: c=>c.co.phone },
      { sec: 'Proposed improvement' },
      { k: 'site', l: 'Site address', p: 0, x: 118, y: 465, def: c=>c.street + ', ' + c.dev.city + ' ' + c.dev.zip + (c.lot ? '   Lot ' + c.lot : '') },
      { k: 'parcel', l: 'Tax map / parcel #', p: 0, x: 142, y: 450, def: c=>c.inf.parcel },
      { k: 'ptype', l: 'Property type', type: 'choice', p: 0, def: ()=>'Residential', opts: [
        { v: 'Residential', ring: [168, 438, 35, 9] }, { v: 'Commercial', ring: [261, 438, 36, 9] }, { v: 'Other', ring: [346, 438, 22, 9] }] },
      { k: 'pother', l: 'Other (explain)', p: 0, x: 430, y: 435, s: 9 },
      { k: 'future', l: 'Commercial use in the future?', type: 'choice', p: 0, def: ()=>'No', opts: [
        { v: 'Yes', ring: [467, 423, 12, 9] }, { v: 'No', ring: [505, 423, 11, 9] }] },
      { k: 'desc', l: 'Description of improvement', p: 0, x: 188, y: 391, def: ()=>'New SFD' },
      { k: 'puse', l: 'Proposed use', p: 0, x: 456, y: 391, def: ()=>'Residence' },
      { k: 'cost', l: 'Project cost ($)', p: 0, x: 116, y: 362, money: true, def: c=>c.inf.cost },
      { k: 'len', l: 'Length (ft)', p: 0, x: 82, y: 348, size: 'len', def: c=>c.inf.len },
      { k: 'wid', l: 'Width (ft)', p: 0, x: 216, y: 348, size: 'wid', def: c=>c.inf.wid },
      { k: 'hgt', l: 'Height (ft)', p: 0, x: 358, y: 348, size: 'hgt', def: c=>c.inf.hgt },
      { k: 'sqft', l: 'Total sq ft', p: 0, x: 470, y: 334, size: 'sqft', def: c=>c.inf.sqft },
      { sec: 'Signature' },
      { k: 'sig', l: 'Applicant signature', type: 'sig', p: 0, x: 60, y: 221 },
      { k: 'date', l: 'Date', p: 0, x: 470, y: 222, def: c=>c.date },
    ] },
  };

  let settings = null, ed = null;   // ed = the form screen that's open { form, step }
  const $ = id=>document.getElementById(id);
  const esc = s=>(s == null ? '' : String(s)).replace(/[&<>"']/g, c=>({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = ()=>{ const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const short = s=>{ if(!s) return ''; const [y, m, d] = s.split('-'); return Number(m) + '/' + Number(d) + '/' + y.slice(2); };
  const nice = s=>{ if(!s) return ''; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };
  const J = ()=>window.PERMIT_JOB || (typeof job !== 'undefined' ? job : null);
  const hasJob = ()=>!!J();
  const P = ()=>(hasJob() && J().permits) || {};

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
    const due = J().selectionSheet && st && !(p[st.id] || {}).sent;
    b.style.display = due ? 'block' : 'none';
    if(due) b.innerHTML = `&#9888; Permits need to be sent out${dev ? ': ' + esc(st.t.toLowerCase()) : ''}${st.form && dev ? ' — fill out the form' + (st.form === 'ws' ? 's' : '') + ', check the pages, then send' : ''}. <span style="font-weight:400; text-decoration:underline;">Open Permits</span>`;
  }

  const CSS = `
    .pm-step{display:grid; grid-template-columns:28px minmax(0,1fr); gap:4px 10px; padding:12px 0; border-top:1px solid #eee;}
    .pm-step:first-child{border-top:none;}
    .pm-n{width:26px; height:26px; border-radius:50%; background:#e9ebe4; color:#4c5144; font-weight:800; display:flex; align-items:center; justify-content:center; font-size:13px;}
    .pm-step.ok .pm-n{background:#2f6b45; color:#fff;} .pm-step.now .pm-n{background:#1f3550; color:#fff;}
    .pm-t{font-weight:700;} .pm-h{font-size:12.5px; color:#777; margin-top:2px;}
    .pm-row{grid-column:2; display:flex; gap:8px 14px; flex-wrap:wrap; align-items:flex-end; margin-top:8px; font-size:13px;}
    .pm-row label{display:flex; flex-direction:column; gap:3px; font-size:11px; font-weight:700; letter-spacing:.3px; text-transform:uppercase; color:#777;}
    .pm-row input{padding:7px 8px; border:1px solid #d6d2c4; border-radius:6px; font-size:14px; font-family:inherit; text-transform:none; letter-spacing:0; font-weight:400; color:#222;}
    .pm-next{background:#f3f5ee; border:1px solid #dfe3d3; border-radius:8px; padding:9px 12px; font-size:14px; margin-bottom:6px;}
    .pm-btn{border:1px solid #d6d2c4; background:#fff; border-radius:8px; padding:8px 13px; font-size:13.5px; font-weight:700; font-family:inherit; cursor:pointer; color:#1f3550;}
    .pm-btn.primary{background:#1f3550; border-color:#1f3550; color:#fff;} .pm-btn:disabled{opacity:.55; cursor:default;}
    /* the form screen */
    .pf-ov{position:fixed; inset:0; background:rgba(30,32,34,.45); z-index:400; display:flex; justify-content:center; align-items:flex-start; overflow:auto; padding:16px;}
    .pf-box{background:#fff; border-radius:12px; width:min(860px,100%); box-shadow:0 10px 40px rgba(0,0,0,.25); margin:auto 0;}
    .pf-head{position:sticky; top:0; background:#fff; border-bottom:1px solid #eee; padding:14px 18px; display:flex; gap:10px; align-items:center; flex-wrap:wrap; border-radius:12px 12px 0 0; z-index:1;}
    .pf-head h2{margin:0; font-size:18px; color:#1f3550; flex:1 1 240px;}
    .pf-body{padding:6px 18px 18px;}
    .pf-sec{font-size:12px; font-weight:800; letter-spacing:.5px; text-transform:uppercase; color:#6b7355; margin:18px 0 6px; padding-top:10px; border-top:1px solid #eee;}
    .pf-sec:first-child{border-top:none;}
    .pf-grid{display:grid; grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); gap:10px 14px;}
    .pf-f{display:flex; flex-direction:column; gap:3px; font-size:12px; font-weight:700; color:#666;}
    .pf-f input, .pf-f select{padding:8px 9px; border:1px solid #d6d2c4; border-radius:6px; font-size:14px; font-family:inherit; color:#222; background:#fff;}
    .pf-f.changed input, .pf-f.changed select{border-color:#c79a2a; background:#fffaf0;}
    .pf-f .pf-x{font-size:11px; font-weight:600; color:#a07a1c; cursor:pointer; background:none; border:none; padding:0; text-align:left; font-family:inherit;}
    .pf-sig{display:flex; gap:8px; align-items:center; font-size:13.5px; font-weight:600; color:#333; padding:8px 0;}
    .pf-sig img{height:30px; border-bottom:1px solid #ccc;}
    .pf-note{font-size:12.5px; color:#777; margin-top:4px;}`;

  function card(){
    let c = $('permitsCard');
    if(c) return c;
    const mount = $('permitsMount'), before = $('costs'); if(!mount && !before) return null;
    c = document.createElement('div'); c.className = mount ? 'card2' : 'card wide'; c.id = 'permitsCard';
    c.innerHTML = `<div class="card-head"><div class="card-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M9 15l2 2 4-4"/></svg></div><h3>Permits</h3></div>
      <div class="card-body" id="permitsBody"></div>`;
    if(!$('pfCss')){ const st = document.createElement('style'); st.id = 'pfCss'; st.textContent = CSS; document.head.appendChild(st); }
    if(mount) mount.appendChild(c); else before.parentNode.insertBefore(c, before);
    c.addEventListener('click', onCardClick);
    c.addEventListener('change', onCardChange);
    return c;
  }
  // the home style's size and other details the forms start from
  function info(){
    const job = J(), i = { ...(P().info || {}) };
    const m = settings && settings.models && job.model ? settings.models[String(job.model).toLowerCase()] : null;
    ['len', 'wid', 'hgt', 'sqft'].forEach(k=>{ if(i[k] == null || i[k] === ''){ if(job.size && job.size[k]) i[k] = job.size[k]; else if(m && m[k]) i[k] = m[k]; } });
    if((i.sqft == null || i.sqft === '') && job.sqft) i.sqft = job.sqft;
    return i;
  }
  window.renderPermits = function(){
    if(!hasJob()) return;
    const job = J(), dev = PERMIT_DEVS[job.community], STEPS = dev ? STEPS_FORMS : OTHER_STEPS;
    const c = card(); if(!c) return;
    c.style.display = '';
    const p = P();
    banner(dev, STEPS, p);
    const doneIdx = STEPS.filter(s=>(p[s.id] || {}).ok).length;
    const nowIdx = STEPS.findIndex(s=>!(p[s.id] || {}).ok);
    const next = nowIdx < 0 ? 'All permits approved.' : (p[STEPS[nowIdx].id] || {}).sent ? `Waiting on: ${STEPS[nowIdx].t.toLowerCase()} (submitted ${nice(p[STEPS[nowIdx].id].sent)}).` : `Next: ${STEPS[nowIdx].form ? 'fill out and submit' : 'apply for'} the ${STEPS[nowIdx].t.toLowerCase()}.`;
    $('permitsBody').innerHTML = `<div class="pm-next"><b>${esc(next)}</b> <span style="color:#777">${doneIdx} of ${STEPS.length} approved${dev ? ' · ' + esc(dev.borough) : ''}</span></div>
      ${STEPS.map((s, i)=>{ const st = p[s.id] || {};
        return `<div class="pm-step ${st.ok ? 'ok' : i === nowIdx ? 'now' : ''}"><div class="pm-n">${st.ok ? '&#10003;' : i + 1}</div>
          <div><div class="pm-t">${esc(s.t)}</div><div class="pm-h">${esc(s.hint)}</div></div>
          <div class="pm-row">${s.form && dev && dev.forms[s.form] ? `<button type="button" class="pm-btn ${i === nowIdx && !st.sent ? 'primary' : ''}" data-fill="${s.form}">Fill out the form${s.form === 'ws' ? 's' : ''}</button>` : ''}
            <label>Submitted<input type="date" data-pm="${s.id}.sent" value="${esc(st.sent || '')}"></label>
            <label>Approved<input type="date" data-pm="${s.id}.ok" value="${esc(st.ok || '')}"></label>
            ${s.no ? `<label>Permit #<input type="text" data-pm="${s.id}.no" value="${esc(st.no || '')}" style="width:130px"></label>` : ''}</div></div>`; }).join('')}`;
    if(ed) renderEditor();
  };
  async function save(patch){
    try{ await db.collection('jobs').doc(J().id).set({ permits: patch }, { merge: true }); }
    catch(err){ console.error(err); alert('Could not save — check your connection.'); }
  }
  function onCardChange(e){
    const el = e.target;
    if(!el.dataset.pm) return;
    const [step, f] = el.dataset.pm.split('.');
    save({ [step]: { [f]: f === 'no' ? el.value.trim().slice(0, 40) : el.value } });
  }
  function onCardClick(e){
    const b = e.target.closest('[data-fill]'); if(!b) return;
    const dev = PERMIT_DEVS[J().community];
    ed = { step: b.dataset.fill, form: dev.forms[b.dataset.fill] };
    renderEditor();
  }

  /* ---- the form screen ---- */
  function ctx(){
    const job = J(), co = (settings && settings.company) || {};
    return { job, co, dev: PERMIT_DEVS[job.community], inf: info(), street: job.address || '', lot: job.lot || '', date: short(today()) };
  }
  const saved = form=>((P().forms || {})[form.id] || {});
  function defOf(f, c){
    const v = f.def ? f.def(c) : '';
    if(f.size && v !== '' && v != null) return f.k === 'sqft' ? String(v) : String(v);
    return v == null ? '' : String(v);
  }
  function valOf(f, c, form){ const s = saved(form); return Object.prototype.hasOwnProperty.call(s, f.k) ? s[f.k] : defOf(f, c); }
  function renderEditor(){
    if(!ed || !hasJob()) return;
    const form = { id: ed.form, ...FORMS[ed.form] }, c = ctx(), s = saved(form), sig = settings && settings.signature;
    let ov = $('pfOv');
    if(!ov){
      ov = document.createElement('div'); ov.className = 'pf-ov'; ov.id = 'pfOv';
      ov.addEventListener('click', onEdClick); ov.addEventListener('change', onEdChange);
      document.body.appendChild(ov);
      if(!$('pfCss')){ const st = document.createElement('style'); st.id = 'pfCss'; st.textContent = CSS; document.head.appendChild(st); }
    }
    const focus = document.activeElement && ov.contains(document.activeElement) ? document.activeElement.dataset.pf : null;
    const missing = !c.co.name || !c.co.address;
    let body = '', grid = [];
    const flush = ()=>{ if(grid.length){ body += `<div class="pf-grid">${grid.join('')}</div>`; grid = []; } };
    form.fields.forEach(f=>{
      if(f.sec){ flush(); body += `<div class="pf-sec">${esc(f.sec)}</div>`; return; }
      const has = Object.prototype.hasOwnProperty.call(s, f.k), v = valOf(f, c, form), changed = has && String(s[f.k]) !== defOf(f, c);
      const undo = changed ? `<button type="button" class="pf-x" data-undo="${f.k}">Use the hub's: ${esc(defOf(f, c) || '(blank)')}</button>` : '';
      if(f.type === 'sig'){
        flush();
        body += `<div class="pf-sig"><label style="display:flex; gap:8px; align-items:center; cursor:${sig ? 'pointer' : 'default'};"><input type="checkbox" data-pf="${f.k}" ${v === true || v === 'yes' ? 'checked' : ''} ${sig ? '' : 'disabled'}> ${esc(f.l)}: add ${esc(c.co.applicant || 'the applicant')}'s signature</label>
          ${sig ? `<img src="${esc(sig)}" alt="">` : '<span class="pf-note">No signature saved yet — draw it in the Permits app → Settings for the forms.</span>'}</div>`;
        return;
      }
      if(f.type === 'choice'){
        grid.push(`<label class="pf-f ${changed ? 'changed' : ''}">${esc(f.l)}<select data-pf="${f.k}"><option value="">(none)</option>${f.opts.map(o=>`<option ${o.v === v ? 'selected' : ''}>${esc(o.v)}</option>`).join('')}</select>${undo}</label>`);
        return;
      }
      grid.push(`<label class="pf-f ${changed ? 'changed' : ''}">${esc(f.l)}<input type="text" data-pf="${f.k}" value="${esc(f.money && v ? Number(v).toLocaleString('en-US') : v)}" ${f.money ? 'inputmode="decimal"' : ''}>${undo}</label>`);
    });
    flush();
    ov.innerHTML = `<div class="pf-box"><div class="pf-head"><h2>${esc(form.title)} · ${esc([c.job.community, c.job.lot ? 'Lot ' + c.job.lot : ''].filter(Boolean).join(' '))}</h2>
        <button type="button" class="pm-btn primary" data-act="download">Download PDF</button><button type="button" class="pm-btn" data-act="open">Open to print</button><button type="button" class="pm-btn" data-act="close">Close</button></div>
      <div class="pf-body">${missing ? '<p class="pf-note" style="color:#b3261e; font-weight:700;">Alden\'s details aren\'t set yet — type them in the Permits app → Settings for the forms.</p>' : ''}
        <p class="pf-note">Every blank on the form. Boxes start with what the hub knows; change anything, or fill in what's empty. Changes are saved for this home (a yellow box was changed by hand). Leave a box empty to leave that blank on the form.</p>
        ${body}
        <p class="pf-note" style="margin-top:14px;">The office-use-only parts of the form are left for the borough.</p></div></div>`;
    if(focus){ const el = ov.querySelector(`[data-pf="${focus}"]`); if(el){ el.focus(); if(el.setSelectionRange && el.type === 'text') el.setSelectionRange(el.value.length, el.value.length); } }
  }
  function closeEditor(){ ed = null; const ov = $('pfOv'); if(ov) ov.remove(); }
  document.addEventListener('keydown', e=>{ if(e.key === 'Escape' && ed) closeEditor(); });
  function onEdChange(e){
    const el = e.target; if(!el.dataset || !el.dataset.pf) return;
    const form = FORMS[ed.form], f = form.fields.find(x=>x.k === el.dataset.pf); if(!f) return;
    let v = el.type === 'checkbox' ? el.checked : el.value.trim().slice(0, 200);
    if(f.money && v !== '') v = String(v).replace(/[$,\s]/g, '');
    const s = { ...(saved({ id: ed.form })) }; s[f.k] = v;
    J().permits = { ...(J().permits || {}), forms: { ...((J().permits || {}).forms || {}), [ed.form]: s } };   // shows at once; the save follows
    save({ forms: { [ed.form]: { [f.k]: v } } });
    // a home style's size: remember it for the next house of that style
    if(f.size && J().model && v !== '' && isFinite(Number(String(v).replace(/[^\d.]/g, '')))){
      db.collection('settings').doc('permits').set({ models: { [String(J().model).toLowerCase()]: { [f.size]: Number(String(v).replace(/[^\d.]/g, '')) } } }, { merge: true }).catch(err=>console.error(err));
    }
    renderEditor();
  }
  async function onEdClick(e){
    if(e.target.id === 'pfOv'){ closeEditor(); return; }
    const u = e.target.closest('[data-undo]');
    if(u){ const k = u.dataset.undo, s = { ...(saved({ id: ed.form })) }; delete s[k];
      J().permits = { ...(J().permits || {}), forms: { ...((J().permits || {}).forms || {}), [ed.form]: s } };
      save({ forms: { [ed.form]: { [k]: firebase.firestore.FieldValue.delete() } } }); renderEditor(); return; }
    const a = e.target.closest('[data-act]'); if(!a) return;
    if(a.dataset.act === 'close'){ closeEditor(); return; }
    const w = a.dataset.act === 'open' ? window.open('', '_blank') : null;
    if(w) w.document.write('<p style="font:16px sans-serif;padding:24px">Filling in the form…</p>');
    a.disabled = true; const was = a.textContent; a.textContent = 'Filling in…';
    try{
      const form = FORMS[ed.form], bytes = await fill(ed.form), job = J();
      const name = `${[job.community, job.lot].filter(Boolean).join(' ') || 'Home'} - ${form.title}.pdf`;
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      if(w) w.location = url;
      else { const l = document.createElement('a'); l.href = url; l.download = name; document.body.appendChild(l); l.click(); l.remove(); }
    } catch(err){ console.error(err); if(w) w.close(); alert('Could not fill in the form. Check your connection and try again.'); }
    a.disabled = false; a.textContent = was;
  }
  function loadLib(){
    if(window.PDFLib) return Promise.resolve(window.PDFLib);
    return new Promise((ok, bad)=>{ const s = document.createElement('script'); s.src = PDFLIB; s.onload = ()=>ok(window.PDFLib); s.onerror = bad; document.head.appendChild(s); });
  }
  const plain = s=>String(s == null ? '' : s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/[^\x20-\x7e]/g, '');
  // write every answer onto the borough's blank form(s)
  async function fill(formId){
    const { PDFDocument, StandardFonts, rgb } = await loadLib();
    const form = { id: formId, ...FORMS[formId] }, c = ctx();
    const out = await PDFDocument.create();
    const font = await out.embedFont(StandardFonts.Helvetica);
    const ink = rgb(0.05, 0.12, 0.45);
    const pages = [];
    for(const file of form.files){
      const src = await PDFDocument.load(await (await fetch(file)).arrayBuffer());
      (await out.copyPages(src, src.getPageIndices())).forEach(p=>{ out.addPage(p); pages.push(p); });
    }
    const sigImg = settings && settings.signature ? await out.embedPng(settings.signature) : null;
    form.fields.forEach(f=>{
      if(f.sec) return;
      const v = valOf(f, c, form), page = pages[f.p]; if(!page) return;
      if(f.type === 'sig'){
        if((v === true || v === 'yes') && sigImg){ const h = 26, w = Math.min(190, sigImg.width * h / sigImg.height); page.drawImage(sigImg, { x: f.x, y: f.y - 4, width: w, height: w * sigImg.height / sigImg.width }); }
        return;
      }
      if(f.type === 'choice'){
        const o = f.opts.find(x=>x.v === v); if(!o) return;
        if(o.ring) page.drawEllipse({ x: o.ring[0], y: o.ring[1], xScale: o.ring[2], yScale: o.ring[3], borderColor: ink, borderWidth: 1.2 });
        if(o.mark) page.drawText('X', { x: o.mark[0], y: o.mark[1] + 1, size: 12, font, color: ink });
        return;
      }
      let t = plain(v); if(!t) return;
      if(f.money && isFinite(Number(t))) t = Number(t).toLocaleString('en-US');
      if(f.size && ['len', 'wid', 'hgt'].includes(f.size) && /^\d+(\.\d+)?$/.test(t)) t += "'";
      if(f.size === 'sqft' && /^\d+$/.test(t)) t = Number(t).toLocaleString('en-US');
      let s = f.s || 10.5; while(s > 6.5 && font.widthOfTextAtSize(t, s) > 572 - f.x) s -= 0.5;
      page.drawText(t, { x: f.x, y: f.y + 1, size: s, font, color: ink });
    });
    return out.save();
  }
  // Alden's details, the signature and remembered style sizes
  function listen(){
    if(typeof db === 'undefined' || !window.firebase || !firebase.auth().currentUser){ setTimeout(listen, 800); return; }
    db.collection('settings').doc('permits').onSnapshot(d=>{ settings = d.exists ? d.data() : {}; if(hasJob()) renderPermits(); subs.forEach(f=>f(settings)); }, err=>console.error('permits settings', err));
  }
  const subs = [];
  listen();
  // for the Permits app: where a home stands, the developments with forms, and the saved settings
  window.Permits = {
    DEVS: PERMIT_DEVS,
    stepsFor: job=>PERMIT_DEVS[job.community] ? STEPS_FORMS : OTHER_STEPS,
    status(job){
      const steps = this.stepsFor(job), p = job.permits || {};
      const i = steps.findIndex(s=>!(p[s.id] || {}).ok), st = i < 0 ? null : steps[i];
      if(!st) return { state: 'done', label: 'All approved', done: steps.length, of: steps.length };
      const sent = (p[st.id] || {}).sent;
      // nothing recorded on a home that wasn't signed through Selections: probably handled before the hub — grey, not counted as to send
      const nothing = i === 0 && !steps.some(s=>p[s.id] && (p[s.id].sent || p[s.id].ok));
      if(nothing && !job.selectionSheet) return { state: 'new', label: 'Nothing recorded yet', step: st, done: 0, of: steps.length };
      return { state: sent ? 'waiting' : 'todo', label: sent ? 'Waiting on ' + st.t.toLowerCase() : 'Send the ' + st.t.toLowerCase(), step: st, done: i, of: steps.length, since: sent };
    },
    settings: ()=>settings,
    onSettings: f=>{ subs.push(f); if(settings) f(settings); },
  };
})();
