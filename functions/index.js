/* ============================================================
   Alden Homes Hub — server side

   Three pieces live here:

   1. subPortal      — what a subcontractor's personal link talks to. The link carries
                       a private code; this checks the code and only ever returns, or
                       changes, that one sub's own tasks. Subs never touch the database.

   2. onScheduleSend — when the office presses "Send to subs" on a house, every sub on
                       that house is emailed their jobs straight away.

   3. dailyFollowUp  — each morning: re-asks subs whose dates changed, asks anyone newly
                       added to a house, and reminds subs who haven't answered about
                       work that's coming up soon.

   The database security rules stay staff-only. Everything a sub can do goes
   through the checks in this file.
   ============================================================ */
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { defineSecret, defineString } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const crypto = require('crypto');

const BUCKET = 'alden-homes-hub.firebasestorage.app';
admin.initializeApp({ storageBucket: BUCKET });
const db = admin.firestore();

// A link to a stored file that works without signing in — the same kind the hub's own
// pages get when staff upload something. The token in it is what makes it unguessable.
function fileUrl(path, token){
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}
// What a sub sees about one file on a house.
function fileForSub(id, f){
  // Photos are tagged with who added them. Staff show simply as "Alden Homes" to subs —
  // the office sees the individual's name, but it isn't handed out to vendors.
  const by = f.by && f.by.type === 'sub' ? (f.by.name || 'Subcontractor') : 'Alden Homes';
  return { id, kind: f.kind || 'photo', name: f.name || '', url: f.url || '', caption: f.caption || '', folder: f.folder || '', taskId: f.taskId || '', taskTitle: f.taskTitle || '', by, at: f.uploadedAt || '' };
}
// A sub may only open a house the office has sent out AND where they have at least one task.
async function houseForSub(houseId, subId){
  if(typeof houseId !== 'string' || !houseId) return null;
  const doc = await db.collection('build-schedules').doc(houseId).get();
  if(!doc.exists) return null;
  const sched = doc.data();
  if(!sched.sentAt || !(sched.tasks || []).some(t=>(t.subIds || []).includes(subId))) return null;
  return sched;
}

const PORTAL_URL = 'https://aldenhomes.github.io/AldenHomesHUB/sub.html';
const TIME_ZONE = 'America/New_York';
// Only the hub itself (and a local preview while developing) may call the portal from a browser.
const ALLOWED_ORIGINS = ['https://aldenhomes.github.io', /^http:\/\/localhost(:\d+)?$/];

// Reminders: only nag about work starting within this many days, and not more often than this.
// Staff can change these in the database at settings/notifications.
const DEFAULT_LEAD_DAYS = 14;
const DEFAULT_REMINDER_DAYS = 3;

// The Gmail account the emails go out from. Its app password is stored as a secret
// (never in this file): firebase functions:secrets:set GMAIL_APP_PASSWORD
const MAIL_USER = defineString('MAIL_USER', { default: 'aldenhomesserver@gmail.com' });
const MAIL_NAME = defineString('MAIL_NAME', { default: 'Alden Homes Scheduling' });
// Where a sub's reply should land, if not the sending mailbox (e.g. the office address).
const MAIL_REPLY_TO = defineString('MAIL_REPLY_TO', { default: '' });
// Emailing is switched on with ENABLE_EMAIL=1 in functions/.env, once that secret exists.
// Until then only the sub portal is deployed, so it can go live without waiting on the mailbox.
const EMAIL_ON = process.env.ENABLE_EMAIL === '1';
const GMAIL_APP_PASSWORD = EMAIL_ON ? defineSecret('GMAIL_APP_PASSWORD') : null;

/* ---------- small helpers ---------- */
function todayIso(){
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());
}
function addDaysIso(iso, n){
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function daysBetween(fromIso, toIso){
  const ms = iso=>{ const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((ms(toIso) - ms(fromIso)) / 86400000);
}
function newToken(){ return crypto.randomBytes(24).toString('base64url'); }
function niceDate(iso){
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c=>({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function houseName(sched){
  return [sched.community, sched.lot ? 'Lot ' + sched.lot : '', sched.client].filter(Boolean).join(' · ');
}

// Look up which sub a personal-link code belongs to. Returns null for anything that isn't a real code.
async function subForToken(token){
  if(typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  const snap = await db.collection('subs').where('linkToken', '==', token).limit(1).get();
  if(snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// What a sub is allowed to see about one of their tasks. Deliberately leaves out the
// customer's phone and email, other subs, and anything about money.
function taskForSub(houseId, sched, t, subId){
  return {
    houseId,
    taskId: t.id,
    title: t.title || '',
    phase: t.phase || '',
    start: t.start || '',
    end: t.end || '',
    days: t.duration || 1,
    notes: t.notes || '',
    answer: (t.confirm && t.confirm[subId]) || 'pending',
    done: !!t.done,
    house: {
      community: sched.community || '',
      lot: sched.lot || '',
      client: sched.client || '',
      address: sched.address || '',
    },
  };
}

/* ============================================================
   subPortal — the subcontractor's personal link
   ============================================================ */
exports.subPortal = onRequest({ cors: ALLOWED_ORIGINS, maxInstances: 10 }, async (req, res)=>{
  if(req.method !== 'POST'){ res.status(405).json({ error: 'method' }); return; }
  const body = req.body || {};
  try{
    const sub = await subForToken(body.token);
    if(!sub){ res.status(403).json({ error: 'bad-link' }); return; }

    if(body.action === 'load'){
      const today = todayIso();
      const snap = await db.collection('build-schedules').get();
      const tasks = [];
      snap.forEach(doc=>{
        const sched = doc.data();
        if(!sched.sentAt) return; // the office hasn't sent this house out yet — it's still a draft
        (sched.tasks || []).forEach(t=>{
          if(!t.id || !t.start || !(t.subIds || []).includes(sub.id)) return;
          // keep the list short: open work, plus anything finished in the last week
          if(t.done ? (t.doneAt || '').slice(0, 10) < addDaysIso(today, -7) : t.end < addDaysIso(today, -30)) return;
          tasks.push(taskForSub(doc.id, sched, t, sub.id));
        });
      });
      tasks.sort((a, b)=>a.start.localeCompare(b.start));
      res.json({ sub: { name: sub.name || '', notify: sub.notify === 'text' ? 'text' : 'email', hasPhone: !!sub.phone, hasEmail: !!sub.email }, today, tasks });
      return;
    }

    if(body.action === 'respond' || body.action === 'done'){
      const answer = body.answer;
      if(body.action === 'respond' && !['confirmed', 'declined'].includes(answer)){ res.status(400).json({ error: 'answer' }); return; }
      if(typeof body.houseId !== 'string' || typeof body.taskId !== 'string' || !body.houseId || !body.taskId){ res.status(400).json({ error: 'task' }); return; }
      const ref = db.collection('build-schedules').doc(body.houseId);
      const result = await db.runTransaction(async tx=>{
        const doc = await tx.get(ref);
        if(!doc.exists) return null;
        const sched = doc.data();
        const tasks = sched.tasks || [];
        const t = tasks.find(x=>x.id === body.taskId);
        // the task has to exist AND be assigned to the sub this link belongs to
        if(!t || !(t.subIds || []).includes(sub.id)) return null;
        const now = new Date().toISOString();
        if(body.action === 'respond'){
          t.confirm = { ...(t.confirm || {}), [sub.id]: answer };
          t.confirmAt = { ...(t.confirmAt || {}), [sub.id]: now };
        } else {
          t.done = body.done !== false;
          t.doneAt = t.done ? now : '';
          t.doneBy = t.done ? sub.id : '';
        }
        tx.update(ref, { tasks, updatedAt: now });
        return taskForSub(doc.id, sched, t, sub.id);
      });
      if(!result){ res.status(404).json({ error: 'not-yours' }); return; }
      res.json({ task: result });
      return;
    }

    // One house: its address, this sub's jobs there, and the plans and photos the office has shared.
    if(body.action === 'house'){
      const sched = await houseForSub(body.houseId, sub.id);
      if(!sched){ res.status(404).json({ error: 'not-yours' }); return; }
      const filesSnap = await db.collection('house-files').where('houseId', '==', body.houseId).get();
      const files = [], folders = [];
      filesSnap.forEach(d=>{
        const f = d.data();
        if(f.kind === 'folder'){ if(f.name) folders.push(f.name); }
        else files.push(fileForSub(d.id, f));
      });
      files.sort((a, b)=>(b.at || '').localeCompare(a.at || '')); // newest first
      folders.sort((a, b)=>a.localeCompare(b, 'en', { sensitivity: 'base' }));
      res.json({
        folders,
        house: { community: sched.community || '', lot: sched.lot || '', client: sched.client || '', address: sched.address || '', model: sched.model || '' },
        tasks: (sched.tasks || []).filter(t=>t.id && t.start && (t.subIds || []).includes(sub.id)).map(t=>taskForSub(body.houseId, sched, t, sub.id)),
        files,
      });
      return;
    }

    // A photo taken on site. The sub's phone shrinks it first, so it arrives as a small JPEG.
    if(body.action === 'addPhoto'){
      const sched = await houseForSub(body.houseId, sub.id);
      if(!sched){ res.status(404).json({ error: 'not-yours' }); return; }
      const m = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(typeof body.dataUrl === 'string' ? body.dataUrl : '');
      if(!m){ res.status(400).json({ error: 'image' }); return; }
      const bytes = Buffer.from(m[2], 'base64');
      if(bytes.length < 100 || bytes.length > 6 * 1024 * 1024){ res.status(400).json({ error: 'size' }); return; }
      const ext = m[1] === 'png' ? 'png' : 'jpg';
      const ref = db.collection('house-files').doc();
      const path = `houses/${body.houseId}/photos/${ref.id}.${ext}`;
      const token = crypto.randomUUID();
      await admin.storage().bucket().file(path).save(bytes, {
        resumable: false,
        metadata: { contentType: `image/${m[1]}`, metadata: { firebaseStorageDownloadTokens: token } },
      });
      // which of their jobs it goes with, if they picked one that really is theirs
      const task = (sched.tasks || []).find(t=>t.id === body.taskId && (t.subIds || []).includes(sub.id));
      // it can go into a folder the office has set up on this house — but subs can't invent folders
      let folder = '';
      if(typeof body.folder === 'string' && body.folder){
        const match = await db.collection('house-files').where('houseId', '==', body.houseId).where('kind', '==', 'folder').where('name', '==', body.folder).limit(1).get();
        if(!match.empty) folder = body.folder;
      }
      const file = {
        folder,
        houseId: body.houseId, kind: 'photo', name: `${ref.id}.${ext}`, path, url: fileUrl(path, token),
        contentType: `image/${m[1]}`, size: bytes.length,
        caption: typeof body.caption === 'string' ? body.caption.slice(0, 200) : '',
        taskId: task ? task.id : '', taskTitle: task ? (task.title || '') : '', phase: task ? (task.phase || '') : '',
        by: { type: 'sub', id: sub.id, name: sub.name || '' },
        uploadedAt: new Date().toISOString(),
      };
      await ref.set(file);
      res.json({ file: fileForSub(ref.id, file) });
      return;
    }

    if(body.action === 'setNotify'){
      if(!['email', 'text'].includes(body.notify)){ res.status(400).json({ error: 'notify' }); return; }
      await db.collection('subs').doc(sub.id).update({ notify: body.notify });
      res.json({ notify: body.notify });
      return;
    }

    res.status(400).json({ error: 'action' });
  } catch(err){
    logger.error('subPortal failed', err);
    res.status(500).json({ error: 'server' });
  }
});

/* ============================================================
   homePortal — the home buyer's page

   No login: each home has its own private link (…/home.html?k=CODE), the same idea as
   the subcontractor links. The office copies it from the home's page in the hub and
   sends it to the buyer. The codes live in one record, settings/home-links, as
   { jobId: code }, so the office can replace a home's link at any time.

   A buyer only ever gets their own home: progress, key dates, photos and plans. No
   subcontractor names, no costs.
   ============================================================ */
// Task names are written in trade shorthand. Tidy them a little for a home buyer.
function plainTitle(title){
  const fix = { RI: 'rough-in', DW: 'drywall', HVAC: 'HVAC', UGI: 'UGI' };
  const words = String(title || '').trim().split(/\s+/).map((w, i)=>{
    const bare = w.replace(/[^A-Za-z]/g, '').toUpperCase();
    if(fix[bare]) return w.replace(/[A-Za-z]+/, fix[bare]);
    const lower = w === w.toUpperCase() ? w.toLowerCase() : w;
    return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
  });
  return words.join(' ');
}

exports.homePortal = onRequest({ cors: ALLOWED_ORIGINS, maxInstances: 10 }, async (req, res)=>{
  if(req.method !== 'POST'){ res.status(405).json({ error: 'method' }); return; }
  const body = req.body || {};
  try{
    // Which home does this link's code belong to? Anything that isn't a current code is refused.
    const token = body.token;
    if(typeof token !== 'string' || token.length < 20 || token.length > 100){ res.status(403).json({ error: 'bad-link' }); return; }
    const linksDoc = await db.collection('settings').doc('home-links').get();
    const links = linksDoc.exists ? linksDoc.data() : {};
    const jobId = Object.keys(links).find(id=>links[id] === token);
    const jobDoc = jobId ? await db.collection('jobs').doc(jobId).get() : null;
    if(!jobDoc || !jobDoc.exists){ res.status(403).json({ error: 'bad-link' }); return; }
    const job = { id: jobDoc.id, ...jobDoc.data() };

    const today = todayIso();
    const [schedDoc, filesSnap] = await Promise.all([
      db.collection('build-schedules').doc(job.id).get(),
      db.collection('house-files').where('houseId', '==', job.id).get(),
    ]);

    // Progress: how far along, which phase, what's happening now and what's next — no sub names.
    // how many photos were posted against each task, so finished steps can show their pictures
    const photosPerTask = {};
    filesSnap.forEach(d=>{ const f = d.data(); if(f.kind === 'photo' && f.taskId) photosPerTask[f.taskId] = (photosPerTask[f.taskId] || 0) + 1; });

    let progress = null;
    if(schedDoc.exists){
      const tasks = (schedDoc.data().tasks || []).filter(t=>t.start);
      const isDone = t=>!!t.done || t.end < today;
      const isNow = t=>!isDone(t) && t.start <= today;
      const phases = [];
      tasks.forEach(t=>{
        const name = t.phase || 'General';
        let p = phases.find(x=>x.name === name);
        if(!p){ p = { name, total: 0, done: 0, active: false, tasks: [] }; phases.push(p); }
        p.total++;
        if(isDone(t)) p.done++;
        if(isNow(t)) p.active = true;
        // each step of the phase: its name, where it stands, and how many photos it has — no dates, no sub names
        p.tasks.push({ id: t.id || '', title: plainTitle(t.title), state: isDone(t) ? 'done' : (isNow(t) ? 'now' : 'upcoming'), photos: photosPerTask[t.id] || 0 });
      });
      const done = tasks.filter(isDone).length;
      progress = {
        percent: tasks.length ? Math.round(done / tasks.length * 100) : 0,
        phases: phases.map(p=>({ name: p.name, state: p.done === p.total ? 'done' : (p.active || p.done > 0 ? 'now' : 'upcoming'), tasks: p.tasks })),
        now: tasks.filter(isNow).map(t=>plainTitle(t.title)),
        next: tasks.filter(t=>!isDone(t) && t.start > today).slice(0, 3).map(t=>plainTitle(t.title)),
      };
    }

    const photos = [], plans = [], folders = [];
    filesSnap.forEach(d=>{
      const f = d.data();
      if(f.kind === 'folder'){ if(f.name) folders.push(f.name); }
      else if(f.kind === 'plan') plans.push({ id: d.id, name: f.name || 'Plan', url: f.url || '', at: f.uploadedAt || '' });
      else photos.push({ id: d.id, url: f.url || '', folder: f.folder || '', caption: f.caption || '', taskId: f.taskId || '', at: f.uploadedAt || '' });
    });
    photos.sort((a, b)=>(b.at || '').localeCompare(a.at || '')); // newest first
    plans.sort((a, b)=>(a.name || '').localeCompare(b.name || ''));
    folders.sort((a, b)=>a.localeCompare(b, 'en', { sensitivity: 'base' }));

    res.json({
      today,
      home: { name: job.client || '', community: job.community || '', address: job.address || '', model: job.model || '' },
      dates: { walk: job.walk || '', move: job.move || '', settle: job.settle || '' },
      progress, photos, plans, folders,
    });
  } catch(err){
    logger.error('homePortal failed', err);
    res.status(500).json({ error: 'server' });
  }
});

/* ============================================================
   Emailing subs
   ============================================================ */
function buildEmail(sub, items, link, kind){
  const lines = items.map(i=>({
    title: i.t.title,
    when: i.t.start === i.t.end ? niceDate(i.t.start) : `${niceDate(i.t.start)} – ${niceDate(i.t.end)}`,
    where: houseName(i.sched),
    address: i.sched.address || '',
  }));
  const n = lines.length;
  const oneHouse = new Set(items.map(i=>i.houseId)).size === 1 ? houseName(items[0].sched) : '';
  let subject, intro;
  if(kind === 'reminder'){
    subject = n === 1 ? `Reminder — please confirm: ${lines[0].title}, ${lines[0].when}` : `Reminder — ${n} Alden Homes jobs still need your answer`;
    intro = `We haven't heard back on the following. Please confirm, or let us know you can't make it.`;
  } else if(kind === 'changed'){
    subject = n === 1 ? `Date change — please confirm: ${lines[0].title}, ${lines[0].when}` : `Schedule update — ${n} Alden Homes jobs to confirm`;
    intro = `The schedule below is new or has changed. Please confirm the dates, or let us know you can't make it.`;
  } else {
    subject = oneHouse ? `Alden Homes schedule — ${oneHouse} (${n} job${n === 1 ? '' : 's'} to confirm)` : `Alden Homes — ${n} jobs to confirm`;
    intro = `Alden Homes has you scheduled for the following${oneHouse ? ' at ' + oneHouse : ''}. Please confirm, or let us know you can't make it.`;
  }
  const text = [
    `Hi ${sub.name || ''},`, '', intro, '',
    ...lines.map(l=>`- ${l.title} — ${l.when}\n  ${l.where}${l.address ? ' — ' + l.address : ''}`),
    '', `Confirm here (no login needed): ${link}`, '', 'Thank you,', 'Alden Homes',
  ].join('\n');
  // Built from plain tables with the colours set on the cells, which is what email apps
  // (Gmail, Outlook, phone mail) render reliably. The button is a full-width block so it's
  // easy to hit with a thumb, and the link is also written out in case a mail app hides buttons.
  const font = 'font-family:Arial,Helvetica,sans-serif;';
  const html = `<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f4ef"><tr><td align="center" style="padding:24px 12px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;" bgcolor="#ffffff">
    <tr><td bgcolor="#4B4F54" style="padding:20px 24px;${font}font-size:20px;font-weight:bold;color:#ffffff;">Alden Homes<br><span style="font-size:13px;font-weight:normal;color:#d9dccb;">${kind === 'reminder' ? 'Reminder — jobs waiting on your answer' : (kind === 'changed' ? 'Schedule update' : 'Jobs to confirm')}</span></td></tr>
    <tr><td style="padding:22px 24px 4px;${font}font-size:15px;line-height:1.5;color:#33363a;">Hi ${esc(sub.name || '')},<br><br>${esc(intro)}</td></tr>
    <tr><td style="padding:10px 24px 4px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        ${lines.map(l=>`<tr><td style="padding:13px 0;border-top:1px solid #e2ddd0;${font}color:#33363a;">
          <div style="font-size:16px;font-weight:bold;color:#4B4F54;">${esc(l.title)}</div>
          <div style="font-size:15px;font-weight:bold;padding-top:3px;">${esc(l.when)}</div>
          <div style="font-size:13px;color:#6b6f72;padding-top:3px;">${esc(l.where)}${l.address ? '<br>' + esc(l.address) : ''}</div></td></tr>`).join('')}
      </table>
    </td></tr>
    <tr><td style="padding:14px 24px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#3f7a4e" style="padding:17px 12px;${font}font-size:18px;font-weight:bold;"><a href="${esc(link)}" style="color:#ffffff;text-decoration:none;">Confirm my jobs &rarr;</a></td></tr></table>
    </td></tr>
    <tr><td style="padding:10px 24px 0;${font}font-size:13px;line-height:1.5;color:#6b6f72;">No login needed — this link is just for you. It also shows all your Alden Homes jobs, with plans and photos for each house.</td></tr>
    <tr><td style="padding:10px 24px 0;${font}font-size:12px;line-height:1.5;color:#8a8f94;word-break:break-all;">Button not working? Copy this link: ${esc(link)}</td></tr>
    <tr><td style="padding:20px 24px 24px;${font}font-size:15px;color:#33363a;">Thank you,<br>Alden Homes</td></tr>
  </table>
  </td></tr></table>`;
  return { subject, text, html };
}

// Email each sub their list. `bySub` is { subId: [{ houseId, sched, t }] }.
// Returns who was emailed, who was skipped (no email address) and who failed.
async function emailSubs(bySub, kind){
  const outcome = { asked: [], emailed: [], skipped: [], failed: [] };
  const subIds = Object.keys(bySub);
  if(!subIds.length) return outcome;

  const nodemailer = require('nodemailer');
  const transport = nodemailer.createTransport({ service: 'gmail', // Google shows app passwords in groups of four with spaces; strip them in case they were pasted that way.
    auth: { user: MAIL_USER.value(), pass: GMAIL_APP_PASSWORD.value().replace(/\s+/g, '') } });
  const from = `"${MAIL_NAME.value()}" <${MAIL_USER.value()}>`;
  const replyTo = MAIL_REPLY_TO.value() || undefined;

  for(const subId of subIds){
    const doc = await db.collection('subs').doc(subId).get();
    if(!doc.exists){ logger.warn('Task assigned to a vendor that no longer exists', { subId }); continue; }
    const sub = { id: subId, ...doc.data() };
    // Texting isn't connected yet, so everyone with an email address gets email for now.
    // A vendor can have several addresses (office, scheduler, owner) — everyone listed gets it.
    const recipients = String(sub.email || '').split(/[;,]/).map(s=>s.trim()).filter(Boolean);
    if(!recipients.length){ outcome.skipped.push(sub.name || subId); continue; }
    // Every sub gets a personal link automatically the first time they're emailed.
    if(!sub.linkToken){
      sub.linkToken = newToken();
      await doc.ref.update({ linkToken: sub.linkToken });
    }
    const items = bySub[subId].sort((a, b)=>a.t.start.localeCompare(b.t.start));
    const mail = buildEmail(sub, items, `${PORTAL_URL}?k=${encodeURIComponent(sub.linkToken)}`, kind);
    try{
      await transport.sendMail({ from, replyTo, to: recipients, subject: mail.subject, text: mail.text, html: mail.html });
      outcome.emailed.push(sub.name || subId);
      items.forEach(i=>outcome.asked.push({ houseId: i.houseId, taskId: i.t.id, subId, start: i.t.start, end: i.t.end }));
    } catch(err){
      outcome.failed.push(sub.name || subId);
      logger.error('Could not email a sub', { sub: sub.name, error: String(err) });
    }
  }
  return outcome;
}

// Note on each task which dates each sub was asked about, and when — so they aren't asked
// again until the dates change or a reminder is due. `extra` is merged onto the house record.
async function recordAsked(asked, extraByHouse){
  const byHouse = {};
  asked.forEach(a=>{ (byHouse[a.houseId] = byHouse[a.houseId] || []).push(a); });
  Object.keys(extraByHouse || {}).forEach(id=>{ byHouse[id] = byHouse[id] || []; });
  const now = new Date().toISOString();
  for(const houseId of Object.keys(byHouse)){
    const ref = db.collection('build-schedules').doc(houseId);
    await db.runTransaction(async tx=>{
      const doc = await tx.get(ref);
      if(!doc.exists) return;
      const tasks = doc.data().tasks || [];
      byHouse[houseId].forEach(a=>{
        const t = tasks.find(x=>x.id === a.taskId);
        if(t) t.asked = { ...(t.asked || {}), [a.subId]: { start: a.start, end: a.end, at: now } };
      });
      tx.update(ref, { tasks, ...((extraByHouse || {})[houseId] || {}) });
    });
  }
}

/* ============================================================
   onScheduleSend — the office pressed "Send to subs" on a house
   ============================================================ */
if(EMAIL_ON) exports.onScheduleSend = onDocumentWritten({ document: 'build-schedules/{houseId}', secrets: [GMAIL_APP_PASSWORD] }, async event=>{
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  // Only act when the "send" button was just pressed — not on every edit to the schedule.
  if(!after || !after.sendRequestedAt) return;
  if(before && before.sendRequestedAt === after.sendRequestedAt) return;

  const houseId = event.params.houseId;
  const today = todayIso();
  const bySub = {};
  (after.tasks || []).forEach(t=>{
    // everything still ahead that the sub hasn't answered yet
    if(!t.id || !t.start || t.done || t.end < today) return;
    (t.subIds || []).forEach(subId=>{
      if(((t.confirm && t.confirm[subId]) || 'pending') !== 'pending') return;
      (bySub[subId] = bySub[subId] || []).push({ houseId, sched: after, t });
    });
  });

  const outcome = await emailSubs(bySub, 'new');
  const now = new Date().toISOString();
  await recordAsked(outcome.asked, { [houseId]: {
    sentAt: now,
    lastSend: { at: now, emailed: outcome.emailed, skipped: outcome.skipped, failed: outcome.failed },
  } });
  logger.info('Schedule sent to subs', { house: houseName(after), emailed: outcome.emailed.length, skipped: outcome.skipped.length, failed: outcome.failed.length });
});

/* ============================================================
   dailyFollowUp — changes, new assignments and reminders
   ============================================================ */
if(EMAIL_ON) exports.dailyFollowUp = onSchedule({ schedule: 'every day 07:00', timeZone: TIME_ZONE, secrets: [GMAIL_APP_PASSWORD] }, async ()=>{
  const settingsDoc = await db.collection('settings').doc('notifications').get();
  const settings = settingsDoc.exists ? settingsDoc.data() : {};
  if(settings.paused){ logger.info('Sending is paused in settings/notifications.'); return; }
  const leadDays = Number(settings.leadDays) > 0 ? Number(settings.leadDays) : DEFAULT_LEAD_DAYS;
  const reminderDays = Number(settings.reminderDays) > 0 ? Number(settings.reminderDays) : DEFAULT_REMINDER_DAYS;
  const today = todayIso();
  const horizon = addDaysIso(today, leadDays);

  const changed = {};   // never asked about these dates (new on the house, or the dates moved)
  const reminders = {}; // asked, no answer, and the work is coming up soon
  const snap = await db.collection('build-schedules').get();
  snap.forEach(doc=>{
    const sched = doc.data();
    if(!sched.sentAt) return; // drafts never email anyone
    (sched.tasks || []).forEach(t=>{
      if(!t.id || !t.start || t.done || t.end < today) return;
      (t.subIds || []).forEach(subId=>{
        if(((t.confirm && t.confirm[subId]) || 'pending') !== 'pending') return;
        const asked = t.asked && t.asked[subId];
        const item = { houseId: doc.id, sched, t };
        if(!asked || asked.start !== t.start || asked.end !== t.end){
          (changed[subId] = changed[subId] || []).push(item);
        } else if(t.start <= horizon && daysBetween((asked.at || '').slice(0, 10) || today, today) >= reminderDays){
          (reminders[subId] = reminders[subId] || []).push(item);
        }
      });
    });
  });

  const a = await emailSubs(changed, 'changed');
  const b = await emailSubs(reminders, 'reminder');
  await recordAsked([...a.asked, ...b.asked]);
  logger.info('Daily follow-up finished', { changes: a.emailed.length, reminders: b.emailed.length, skipped: [...a.skipped, ...b.skipped], failed: [...a.failed, ...b.failed] });
});
