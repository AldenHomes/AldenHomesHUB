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
                       work that's coming up soon. Also tells the office about any job
                       a sub has left unanswered for three weeks.

   The database security rules stay staff-only. Everything a sub can do goes
   through the checks in this file.
   ============================================================ */
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentWritten, onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
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
    declineNote: (t.confirmNote && t.confirmNote[subId]) || '',
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
   Telling the office about something a sub did
   (declined a job, sent a note, or has left a job unanswered for weeks).

   It is saved as a note on the home, "mentioning" every staff login that has
   switched that kind of notice on (Admin Settings → My notifications, kept in
   settings/staff-notify as { uid: { kind: true } } — they are off until someone turns
   them on). From there it behaves like any
   other note that mentions someone: it shows on their bell and is emailed to them.
   A sub approving a job tells nobody — the office only hears about problems.
   ============================================================ */
const WAITING_DAYS = 21; // how long a job can sit unanswered before the office is told
function whenText(t){
  return t.start === t.end ? niceDate(t.start) : `${niceDate(t.start)} – ${niceDate(t.end)}`;
}
function cleanText(s, max){
  return typeof s === 'string' ? s.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max) : '';
}
async function staffWanting(kind){
  const [list, prefsDoc] = await Promise.all([
    admin.auth().listUsers(1000),
    db.collection('settings').doc('staff-notify').get(),
  ]);
  const prefs = prefsDoc.exists ? prefsDoc.data() : {};
  return list.users
    .filter(u=>u.email && !u.disabled && prefs[u.uid] && prefs[u.uid][kind] === true)
    .map(u=>u.uid);
}
async function notifyStaff(kind, { houseId, sched, taskId, by, text, photos }){
  const mentions = await staffWanting(kind);
  // saved even if nobody has switched this kind on, so it's still on the home's notes
  await db.collection('notes').add({
    houseId, houseLabel: houseName(sched), text, by, mentions, kind, taskId: taskId || '',
    ...(photos && photos.length ? { photos } : {}),
    at: new Date().toISOString(), readBy: {},
  });
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
      const tasks = [], others = [];
      snap.forEach(doc=>{
        const sched = doc.data();
        if(!sched.sentAt) return; // the office hasn't sent this house out yet — it's still a draft
        const before = tasks.length;
        (sched.tasks || []).forEach(t=>{
          if(!t.id || !t.start || !(t.subIds || []).includes(sub.id)) return;
          // keep the list short: open work, plus anything finished in the last week
          if(t.done ? (t.doneAt || '').slice(0, 10) < addDaysIso(today, -7) : t.end < addDaysIso(today, -30)) return;
          tasks.push(taskForSub(doc.id, sched, t, sub.id));
        });
        // The rest of the schedule on houses where they have work, for their calendar — so they can
        // see what comes before and after them. Just the job and its dates: never who is doing it.
        if(tasks.length > before) (sched.tasks || []).forEach(t=>{
          if(!t.id || !t.start || !t.end || (t.subIds || []).includes(sub.id) || t.end < addDaysIso(today, -45)) return;
          others.push({ houseId: doc.id, title: t.title || '', phase: t.phase || '', start: t.start, end: t.end, done: !!t.done });
        });
      });
      tasks.sort((a, b)=>a.start.localeCompare(b.start));
      res.json({ sub: { name: sub.name || '', notify: sub.notify === 'text' ? 'text' : 'email', hasPhone: !!sub.phone, hasEmail: !!sub.email }, today, tasks, others });
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
        let declined = null;
        if(body.action === 'respond'){
          const was = (t.confirm && t.confirm[sub.id]) || 'pending';
          t.confirm = { ...(t.confirm || {}), [sub.id]: answer };
          t.confirmAt = { ...(t.confirmAt || {}), [sub.id]: now };
          // a decline can carry a reason; approving clears any earlier one
          const notes = { ...(t.confirmNote || {}) };
          const reason = answer === 'declined' ? cleanText(body.note, 500) : '';
          if(reason) notes[sub.id] = reason; else delete notes[sub.id];
          t.confirmNote = notes;
          if(answer === 'declined' && was !== 'declined') declined = { sched, title: t.title || 'a job', when: whenText(t), reason };
        } else {
          t.done = body.done !== false;
          t.doneAt = t.done ? now : '';
          t.doneBy = t.done ? sub.id : '';
        }
        tx.update(ref, { tasks, updatedAt: now });
        return { task: taskForSub(doc.id, sched, t, sub.id), declined };
      });
      if(!result){ res.status(404).json({ error: 'not-yours' }); return; }
      // The office hears about a decline (with the reason, if one was given) — never about an approval.
      if(result.declined){
        const d = result.declined;
        try{
          await notifyStaff('subDeclined', {
            houseId: body.houseId, sched: d.sched, taskId: body.taskId,
            by: { type: 'sub', id: sub.id, name: sub.name || 'A subcontractor' },
            text: `Declined: ${d.title} — ${d.when}` + (d.reason ? `\n“${d.reason}”` : ''),
          });
        } catch(err){ logger.error('Could not tell the office about a decline', err); }
      }
      res.json({ task: result.task });
      return;
    }

    // A note to the office about one of their jobs — a question, or asking to slide the dates.
    // It can carry photos they've just added to that job ("can you look at this?").
    if(body.action === 'note'){
      const typed = cleanText(body.text, 1000);
      const fileIds = (Array.isArray(body.fileIds) ? body.fileIds : []).filter(id=>typeof id === 'string' && id).slice(0, 6);
      if(!typed && !fileIds.length){ res.status(400).json({ error: 'text' }); return; }
      const sched = await houseForSub(body.houseId, sub.id);
      const t = sched && (sched.tasks || []).find(x=>x.id === body.taskId && (x.subIds || []).includes(sub.id));
      if(!t){ res.status(404).json({ error: 'not-yours' }); return; }
      // only photos this sub added to this house count — a made-up id is simply ignored
      const photos = [];
      for(const id of fileIds){
        const f = await db.collection('house-files').doc(id).get();
        const d = f.exists ? f.data() : null;
        if(d && d.kind === 'photo' && d.houseId === body.houseId && d.by && d.by.type === 'sub' && d.by.id === sub.id && d.url) photos.push(d.url);
      }
      const text = typed || `Sent ${photos.length === 1 ? 'a photo' : photos.length + ' photos'} for you to look at.`;
      // every note emails the office, so one link can't send more than a handful an hour
      const hourAgo = new Date(Date.now() - 3600000).toISOString();
      const recent = (Array.isArray(sub.noteLog) ? sub.noteLog : []).filter(at=>at > hourAgo);
      if(recent.length >= 10){ res.status(429).json({ error: 'slow-down' }); return; }
      await db.collection('subs').doc(sub.id).update({ noteLog: [...recent, new Date().toISOString()] });
      await notifyStaff('subNote', {
        houseId: body.houseId, sched, taskId: t.id,
        by: { type: 'sub', id: sub.id, name: sub.name || 'A subcontractor' },
        text: `About ${t.title || 'a job'} — ${whenText(t)}:\n${text}`,
        photos,
      });
      res.json({ ok: true });
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
      // Extra work on this house that the buyer has approved and that's assigned to this sub.
      // Only approved ones, only their own items, and never the price the buyer is paying.
      const coSnap = await db.collection('change-orders').where('houseId', '==', body.houseId).get();
      const changeOrders = [];
      coSnap.forEach(d=>{
        const c = d.data();
        if(c.status !== 'approved') return;
        const mine = (c.items || []).filter(i=>i.subId === sub.id).map(i=>i.desc || '');
        if(mine.length) changeOrders.push({ id: d.id, number: c.number || 0, title: c.title || '', items: mine, approvedAt: (c.decision && c.decision.at) || '' });
      });
      changeOrders.sort((a, b)=>(b.number || 0) - (a.number || 0));
      res.json({
        folders,
        changeOrders,
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

    // The buyer approving (and signing) or declining a change order the office sent them.
    if(body.action === 'decideChangeOrder'){
      const decision = body.decision;
      if(!['approved', 'declined'].includes(decision) || typeof body.changeOrderId !== 'string' || !body.changeOrderId){ res.status(400).json({ error: 'request' }); return; }
      const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ').slice(0, 80) : '';
      const signature = typeof body.signature === 'string' ? body.signature : '';
      if(decision === 'approved'){
        if(name.length < 2){ res.status(400).json({ error: 'name' }); return; }
        // a drawn signature, sent as a small PNG
        if(!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature) || signature.length < 400 || signature.length > 300000){ res.status(400).json({ error: 'signature' }); return; }
      }
      const ref = db.collection('change-orders').doc(body.changeOrderId);
      const result = await db.runTransaction(async tx=>{
        const doc = await tx.get(ref);
        // it has to be this home's change order, and still waiting for an answer
        if(!doc.exists || doc.data().houseId !== job.id) return 'not-yours';
        if(doc.data().status !== 'sent') return 'already-decided';
        const now = new Date().toISOString();
        tx.update(ref, {
          status: decision,
          decision: {
            by: decision === 'approved' ? name : (name || job.client || ''),
            at: now,
            signature: decision === 'approved' ? signature : '',
            // kept with the record of the signing
            device: String(req.get('User-Agent') || '').slice(0, 300),
            totalAgreed: decision === 'approved' ? (doc.data().total || 0) : null,
          },
          updatedAt: now,
        });
        return 'ok';
      });
      if(result !== 'ok'){ res.status(result === 'not-yours' ? 404 : 409).json({ error: result }); return; }
      res.json({ ok: true });
      return;
    }

    const today = todayIso();
    const [schedDoc, filesSnap, coSnap] = await Promise.all([
      db.collection('build-schedules').doc(job.id).get(),
      db.collection('house-files').where('houseId', '==', job.id).get(),
      db.collection('change-orders').where('houseId', '==', job.id).get(),
    ]);
    // Change orders the office has sent — never drafts. The buyer sees what's being changed
    // and the price, not which subcontractor does the work.
    const changeOrders = [];
    coSnap.forEach(d=>{
      const c = d.data();
      if(!['sent', 'approved', 'declined'].includes(c.status)) return;
      changeOrders.push({
        id: d.id, number: c.number || 0, title: c.title || '', note: c.note || '', status: c.status,
        items: (c.items || []).map(i=>({ desc: i.desc || '', price: Number(i.price) || 0 })),
        total: Number(c.total) || 0, sentAt: c.sentAt || '',
        decidedBy: (c.decision && c.decision.by) || '', decidedAt: (c.decision && c.decision.at) || '',
      });
    });
    changeOrders.sort((a, b)=>(b.number || 0) - (a.number || 0));

    // Progress: how far along, which phase, what's happening now and what's next — no sub names.
    // how many photos were posted against each task, so finished steps can show their pictures
    const photosPerTask = {};
    // A buyer only ever sees the photos the office has picked for them ("Show to customer" on the home's page).
    filesSnap.forEach(d=>{ const f = d.data(); if(f.kind === 'photo' && f.shared === true && f.taskId) photosPerTask[f.taskId] = (photosPerTask[f.taskId] || 0) + 1; });

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
      else if(f.shared === true) photos.push({ id: d.id, url: f.url || '', folder: f.folder || '', caption: f.caption || '', taskId: f.taskId || '', at: f.uploadedAt || '' });
    });
    photos.sort((a, b)=>(b.at || '').localeCompare(a.at || '')); // newest first
    plans.sort((a, b)=>(a.name || '').localeCompare(b.name || ''));
    folders.sort((a, b)=>a.localeCompare(b, 'en', { sensitivity: 'base' }));

    res.json({
      today,
      home: { name: job.client || '', community: job.community || '', address: job.address || '', model: job.model || '' },
      dates: { walk: job.walk || '', move: job.move || '', settle: job.settle || '' },
      progress, photos, plans, folders, changeOrders,
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
    // the dates they were told before, when this job has been moved
    was: i.was ? (i.was.start === i.was.end ? niceDate(i.was.start) : `${niceDate(i.was.start)} – ${niceDate(i.was.end)}`) : '',
  }));
  const n = lines.length;
  const oneHouse = new Set(items.map(i=>i.houseId)).size === 1 ? houseName(items[0].sched) : '';
  let subject, intro;
  if(kind === 'reminder'){
    subject = n === 1 ? `Reminder — please confirm: ${lines[0].title}, ${lines[0].when}` : `Reminder — ${n} Alden Homes jobs still need your answer`;
    intro = `We haven't heard back on the following. Please approve or decline each one — you can also send us a note if you have a question or need different dates.`;
  } else if(kind === 'changed'){
    const moved = lines.filter(l=>l.was).length;
    subject = n === 1 ? `${moved ? 'Dates moved' : 'New job'} — please confirm: ${lines[0].title}, ${lines[0].when}`
      : (moved ? `Dates moved — ${n} Alden Homes jobs to confirm` : `Schedule update — ${n} Alden Homes jobs to confirm`);
    intro = moved === n ? `The dates for the ${n === 1 ? 'job' : 'jobs'} below have moved. Please approve or decline the new dates — you can also send us a note if you have a question or need different dates.`
      : moved ? `Some of the dates below have moved, and some jobs are new. Please approve or decline each one — you can also send us a note if you have a question or need different dates.`
      : `The schedule below is new. Please approve or decline each one — you can also send us a note if you have a question or need different dates.`;
  } else {
    subject = oneHouse ? `Alden Homes schedule — ${oneHouse} (${n} job${n === 1 ? '' : 's'} to confirm)` : `Alden Homes — ${n} jobs to confirm`;
    intro = `Alden Homes has you scheduled for the following${oneHouse ? ' at ' + oneHouse : ''}. Please approve or decline each one — you can also send us a note if you have a question or need different dates.`;
  }
  const text = [
    `Hi ${sub.name || ''},`, '', intro, '',
    ...lines.map(l=>`- ${l.title} — ${l.when}${l.was ? ` (moved — was ${l.was})` : ''}\n  ${l.where}${l.address ? ' — ' + l.address : ''}`),
    '', `Approve or decline here (no login needed): ${link}`, '', 'Thank you,', 'Alden Homes',
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
          ${l.was ? `<div style="font-size:13px;color:#b3452f;padding-top:3px;">Moved &mdash; was ${esc(l.was)}</div>` : ''}
          <div style="font-size:13px;color:#6b6f72;padding-top:3px;">${esc(l.where)}${l.address ? '<br>' + esc(l.address) : ''}</div></td></tr>`).join('')}
      </table>
    </td></tr>
    <tr><td style="padding:14px 24px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#3f7a4e" style="padding:17px 12px;${font}font-size:18px;font-weight:bold;"><a href="${esc(link)}" style="color:#ffffff;text-decoration:none;">Approve or decline my jobs &rarr;</a></td></tr></table>
    </td></tr>
    <tr><td style="padding:10px 24px 0;${font}font-size:13px;line-height:1.5;color:#6b6f72;">No login needed — this link is just for you. It also shows all your Alden Homes jobs, with plans and photos for each house.</td></tr>
    <tr><td style="padding:10px 24px 0;${font}font-size:12px;line-height:1.5;color:#8a8f94;word-break:break-all;">Button not working? Copy this link: ${esc(link)}</td></tr>
    <tr><td style="padding:20px 24px 24px;${font}font-size:15px;color:#33363a;">Thank you,<br>Alden Homes</td></tr>
  </table>
  </td></tr></table>`;
  return { subject, text, html };
}

// What the office has set on the hub's Admin Settings page (settings/notifications).
// Read fresh every time, so switching emails off there takes effect straight away.
async function notifySettings(){
  const doc = await db.collection('settings').doc('notifications').get();
  const s = doc.exists ? doc.data() : {};
  return {
    paused: !!s.paused,
    leadDays: Number(s.leadDays) > 0 ? Number(s.leadDays) : DEFAULT_LEAD_DAYS,
    reminderDays: Number(s.reminderDays) > 0 ? Number(s.reminderDays) : DEFAULT_REMINDER_DAYS,
    replyTo: typeof s.replyTo === 'string' ? s.replyTo.trim() : '',
  };
}

// Email each sub their list. `bySub` is { subId: [{ houseId, sched, t }] }.
// Returns who was emailed, who was skipped (no email address) and who failed.
async function emailSubs(bySub, kind, settings){
  const outcome = { asked: [], emailed: [], skipped: [], failed: [] };
  const subIds = Object.keys(bySub);
  if(!subIds.length) return outcome;

  const nodemailer = require('nodemailer');
  const transport = nodemailer.createTransport({ service: 'gmail', // Google shows app passwords in groups of four with spaces; strip them in case they were pasted that way.
    auth: { user: MAIL_USER.value(), pass: GMAIL_APP_PASSWORD.value().replace(/\s+/g, '') } });
  const from = `"${MAIL_NAME.value()}" <${MAIL_USER.value()}>`;
  const replyTo = (settings && settings.replyTo) || MAIL_REPLY_TO.value() || undefined;

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
    // "Send again" after dates were moved is a date-change email, not a brand-new request
    const mail = buildEmail(sub, items, `${PORTAL_URL}?k=${encodeURIComponent(sub.linkToken)}`, kind === 'new' && items.some(i=>i.was) ? 'changed' : kind);
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

// If a sub was already told dates for this job and the job has since moved, the dates they were told.
function movedFrom(t, subId){
  const asked = t.asked && t.asked[subId];
  return asked && asked.start && (asked.start !== t.start || asked.end !== t.end) ? { start: asked.start, end: asked.end } : null;
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
   hubApi — things the staff pages need that only the server can do.
   Every call must carry the signed-in staff member's Firebase ID token.
   ============================================================ */
async function staffFromRequest(req){
  const m = /^Bearer (.+)$/.exec(req.get('Authorization') || '');
  if(!m) return null;
  try{
    const who = await admin.auth().verifyIdToken(m[1]);
    // homeowners using the public service form are signed in anonymously — they are not staff
    if(!who.firebase || who.firebase.sign_in_provider === 'anonymous') return null;
    return who;
  } catch(err){ return null; }
}
function staffName(user){
  return user.displayName || String(user.email || '').split('@')[0] || 'Someone';
}

exports.hubApi = onRequest({ cors: ALLOWED_ORIGINS, maxInstances: 10 }, async (req, res)=>{
  if(req.method !== 'POST'){ res.status(405).json({ error: 'method' }); return; }
  try{
    const who = await staffFromRequest(req);
    if(!who){ res.status(401).json({ error: 'sign-in' }); return; }
    const body = req.body || {};

    // Everyone with a hub login, for the @ menu in notes.
    if(body.action === 'staff'){
      const list = await admin.auth().listUsers(1000);
      const staff = list.users
        .filter(u=>u.email && !u.disabled)
        // name = what shows in notes and the @ menu; setName = what was typed on Admin Settings ('' if nothing yet)
        .map(u=>({ uid: u.uid, email: u.email, name: staffName(u), setName: u.displayName || '' }));
      // Two logins can share a name (the same person at two email addresses, say).
      // Add the email's domain to those so each one can be @mentioned on its own.
      const seen = {};
      staff.forEach(s=>{ const k = s.name.toLowerCase(); seen[k] = (seen[k] || 0) + 1; });
      staff.forEach(s=>{ if(seen[s.name.toLowerCase()] > 1) s.name = `${s.name} (${s.email.split('@')[1] || s.email})`; });
      staff.sort((a, b)=>a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
      res.json({ staff });
      return;
    }

    // Admin Settings → Team: give a login a proper name (e.g. "Blake" instead of "bam654").
    // It's stored on the login itself, so it shows everywhere that person is named.
    if(body.action === 'setName'){
      const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ').slice(0, 40) : '';
      if(typeof body.uid !== 'string' || !body.uid){ res.status(400).json({ error: 'uid' }); return; }
      if(/[@<>]/.test(name)){ res.status(400).json({ error: 'name' }); return; }
      const user = await admin.auth().getUser(body.uid).catch(()=>null);
      if(!user || !user.email){ res.status(404).json({ error: 'no-user' }); return; }
      await admin.auth().updateUser(body.uid, { displayName: name || null });
      res.json({ uid: body.uid, name });
      return;
    }
    res.status(400).json({ error: 'action' });
  } catch(err){
    logger.error('hubApi failed', err);
    res.status(500).json({ error: 'server' });
  }
});

/* ============================================================
   hubAssistant — "press the button and say it".

   A staff member speaks or types a request on the hub ("add a note to AP 40 saying
   drywall is complete and tag Chase"). The words come here, and Claude works out what
   they mean using the list of homes and the team.

   Two rules keep it safe:
   • Claude can only do the handful of things defined below. Looking things up happens
     straight away. Anything that CHANGES something is not done here — it is handed back
     to the hub as a proposal, shown to the person with Confirm / Cancel.
   • Only when they press Confirm does the hub call back with action "run", and the
     change is saved under that person's name.

   Switched on with ENABLE_ASSISTANT=1 in functions/.env once the ANTHROPIC_API_KEY
   secret exists (same idea as ENABLE_EMAIL).
   ============================================================ */
const ASSISTANT_ON = process.env.ENABLE_ASSISTANT === '1';
const ANTHROPIC_API_KEY = ASSISTANT_ON ? defineSecret('ANTHROPIC_API_KEY') : null;
const ASSISTANT_MODEL = 'claude-opus-5-5';

// Which home a service request is about — the same rules as service.html and house.html.
function addrKey(a){
  const m = String(a || '').toLowerCase().replace(/[.,#]/g, ' ').match(/(\d+)\s+([a-z0-9]+)/);
  return m ? m[1] + ' ' + m[2] : '';
}
function lotKey(l){ return String(l == null ? '' : l).toLowerCase().replace(/lot|#|\s/g, ''); }
function homeForRequest(r, jobs){
  if(r.houseId) return jobs.find(j=>j.id === r.houseId) || null;
  const a = addrKey(r.address), lot = lotKey(r.lot);
  const byAddr = a ? jobs.filter(j=>addrKey(j.address) === a) : [];
  if(byAddr.length === 1) return byAddr[0];
  const byLot = lot ? jobs.filter(j=>lotKey(j.lot) === lot) : [];
  if(byAddr.length > 1){ const both = byAddr.filter(j=>byLot.includes(j)); return both.length === 1 ? both[0] : null; }
  return byLot.length === 1 ? byLot[0] : null;
}
function jobLabel(j){ return [j.community, j.lot ? 'Lot ' + j.lot : '', j.client].filter(Boolean).join(' · ') || 'Unnamed home'; }

const str = { type: 'string' };
const ASSISTANT_TOOLS = [
  { name: 'get_home', strict: true,
    description: 'Look up everything about one home: its dates, its build schedule (each job, its dates, the vendor, whether they approved, whether it is done), open punch list items, recent notes and service requests. Use it before answering a question about a specific home.',
    input_schema: { type: 'object', properties: { home_id: { ...str, description: 'The id of the home, from the list of homes.' } }, required: ['home_id'], additionalProperties: false } },
  { name: 'list_punch_items', strict: true,
    description: 'List the open punch list items (to-dos for the in-house crew) across every home, with each item\'s id, text, home and who it is for.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false } },
  { name: 'list_service_requests', strict: true,
    description: 'List service requests from homeowners. "open" = new and in progress; "all" also includes completed ones.',
    input_schema: { type: 'object', properties: { which: { type: 'string', enum: ['open', 'all'] } }, required: ['which'], additionalProperties: false } },
  { name: 'add_note', strict: true,
    description: 'Propose adding a note to a home. It is shown to the user to confirm; it is not saved until they do.',
    input_schema: { type: 'object', properties: {
      home_id: { ...str, description: 'The id of the home the note is about.' },
      text: { ...str, description: 'The note, as a clean sentence. Do not include @names — list people in notify_user_ids instead.' },
      notify_user_ids: { type: 'array', items: str, description: 'uids of team members to tag and notify. Empty if nobody was named.' },
    }, required: ['home_id', 'text', 'notify_user_ids'], additionalProperties: false } },
  { name: 'add_punch_item', strict: true,
    description: 'Propose adding an item to the punch list. It is shown to the user to confirm; it is not saved until they do.',
    input_schema: { type: 'object', properties: {
      text: { ...str, description: 'What needs doing, short and clear.' },
      home_id: { ...str, description: 'The id of the home it is for, or an empty string if it is not about a particular home.' },
      assign_user_ids: { type: 'array', items: str, description: 'uids of the team members it is for. Empty if nobody was named.' },
      due_date: { ...str, description: 'The date it needs to be done by, as YYYY-MM-DD, worked out from today\'s date if they said something like "by Friday". An empty string if no date was mentioned.' },
      high_priority: { type: 'boolean', description: 'True only if they said it is high priority, urgent, or similar.' },
    }, required: ['text', 'home_id', 'assign_user_ids', 'due_date', 'high_priority'], additionalProperties: false } },
  { name: 'complete_punch_item', strict: true,
    description: 'Propose checking an item off the punch list. Find the item id with list_punch_items or get_home first. Shown to the user to confirm.',
    input_schema: { type: 'object', properties: { item_id: { ...str, description: 'The id of the punch list item.' } }, required: ['item_id'], additionalProperties: false } },
];
const ASSISTANT_WRITES = ['add_note', 'add_punch_item', 'complete_punch_item'];

const ASSISTANT_RULES = `You are the assistant built into the Alden Homes Hub, the internal tool the office staff of a home builder use to run their jobs. People press a button and speak, so what you receive is speech turned into text. Expect slips: lot numbers and names can come through slightly wrong ("a p forty", "AP40", "lot fourty"), and a first name may be spelled differently from the team list.

Finding the home: match what was said against the list of homes below by community code and lot number, by the buyer's name, or by the address. "AP 40" means community AP, lot 40. If exactly one home fits, use it. If two fit equally well, or nothing fits, ask which home they mean and offer the closest ones — a note saved to the wrong home is worse than a quick question.

Finding the person: match first names against the team list. If a name could be two people, ask.

Changing things: you cannot save anything yourself. Calling add_note, add_punch_item or complete_punch_item puts the action on the person's screen with Confirm and Cancel buttons, and it only happens if they press Confirm. So when the request is clear, call the tool straight away rather than asking "shall I?" first, then tell them in one short sentence what is waiting for them to confirm. Never say something was saved or done.

Wording: for a note or a punch list item, write what the person said as a clean sentence — capital letter, full stop, obvious speech-to-text slips fixed — without adding anything they didn't say. Leave the people out of the text; they go in the list of ids and the hub adds the tags.

Questions: answer from the lists below, or look the home up with get_home when the answer needs its schedule, notes, punch list or service history. If the information isn't there, say so plainly.

How to answer: the reader is office staff reading on a phone, not a technical person. Keep it to a sentence or two in plain words, no formatting symbols, with dates written like "Tue, Oct 20". Refer to homes the way the staff do ("AP Lot 40, Smith"), never by id.

If they ask for something you have no way to do — moving schedule dates, emailing a sub, changing a service request — say you can't do that from here yet, and mention where in the hub it's done if you know (Construction Schedules, Service Center, Punch List, Admin Settings).`;

// Everything the assistant is told up front: who is asking, the team, and every home.
async function assistantContext(who){
  const [jobsSnap, list] = await Promise.all([db.collection('jobs').get(), admin.auth().listUsers(1000)]);
  const today = todayIso();
  const jobs = jobsSnap.docs.map(d=>({ id: d.id, ...d.data() }));
  const staff = list.users.filter(u=>u.email && !u.disabled).map(u=>({ uid: u.uid, name: staffName(u), email: u.email }));
  const me = staff.find(s=>s.uid === who.uid) || { uid: who.uid, name: String(who.email || '').split('@')[0] || 'Someone', email: who.email || '' };
  const homeLine = j=>[
    `id=${j.id}`, j.community || '?', j.lot ? `Lot ${j.lot}` : 'no lot', j.client || 'no buyer name', j.address || 'no address', j.model || '',
    j.settle ? (j.settle < today ? `settled ${j.settle}` : `settles ${j.settle}`) : 'no settlement date',
  ].filter(Boolean).join(' | ');
  const active = jobs.filter(j=>!j.settle || j.settle >= today), finished = jobs.filter(j=>j.settle && j.settle < today);
  const facts = [
    `Today is ${niceDate(today)}, ${today}.`,
    `The person speaking is ${me.name} (uid ${me.uid}). "Me", "myself" or "I" means them.`,
    '', 'The team (name, uid):', ...staff.map(s=>`- ${s.name} | ${s.uid}`),
    '', `Homes being built (${active.length}):`, ...active.map(j=>'- ' + homeLine(j)),
    '', `Finished homes (${finished.length}):`, ...finished.map(j=>'- ' + homeLine(j)),
  ].join('\n');
  return { jobs, staff, me, today, facts };
}

// The look-ups the assistant can run by itself. Each returns plain text for it to read.
async function assistantLookup(name, input, ctx){
  if(name === 'get_home'){
    const job = ctx.jobs.find(j=>j.id === input.home_id);
    if(!job) return 'There is no home with that id. Use an id from the list of homes.';
    const [schedDoc, notesSnap, reqSnap, subsSnap] = await Promise.all([
      db.collection('build-schedules').doc(job.id).get(),
      db.collection('notes').where('houseId', '==', job.id).get(),
      db.collection('service-requests').get(),
      db.collection('subs').get(),
    ]);
    const subName = {}; subsSnap.forEach(d=>{ subName[d.id] = d.data().name || 'Unnamed vendor'; });
    const notes = notesSnap.docs.map(d=>({ id: d.id, ...d.data() })).sort((a, b)=>(b.at || '').localeCompare(a.at || ''));
    const sched = schedDoc.exists ? schedDoc.data() : null;
    return JSON.stringify({
      home: jobLabel(job), address: job.address || '', model: job.model || '', buyer_phone: job.phone || '', buyer_email: job.email || '',
      dates: { foundation: job.fndn || '', walk_through: job.walk || '', move_in: job.move || '', settlement: job.settle || '' },
      schedule: !sched ? 'No build schedule yet.' : {
        sent_to_subs: !!sched.sentAt, projected_finish: sched.projectedEnd || '',
        jobs: (sched.tasks || []).filter(t=>t.start).map(t=>({
          job: t.title || '', start: t.start, end: t.end, done: !!t.done,
          vendors: (t.subIds || []).map(id=>`${subName[id] || 'Removed vendor'} (${({ confirmed: 'approved', declined: 'declined' })[(t.confirm || {})[id]] || 'no answer yet'})`),
        })),
      },
      open_punch_items: notes.filter(n=>n.todo && !n.done).map(n=>({ item_id: n.id, text: n.text || '', for: n.mentionNames || [], needed_by: n.due || '', high_priority: n.priority === 'high' })),
      recent_notes: notes.filter(n=>!n.todo).slice(0, 10).map(n=>({ when: (n.at || '').slice(0, 10), by: (n.by && n.by.name) || '', text: n.text || '' })),
      service_requests: reqSnap.docs.map(d=>d.data()).filter(r=>{ const h = homeForRequest(r, ctx.jobs); return h && h.id === job.id; })
        .map(r=>({ submitted: (r.submittedAt || '').slice(0, 10), status: r.status === 'sent' ? 'complete' : (r.status || 'new'), assigned_to: r.vendorName || '', description: r.description || '' })),
    });
  }
  if(name === 'list_punch_items'){
    const snap = await db.collection('notes').where('todo', '==', true).get();
    const open = snap.docs.map(d=>({ id: d.id, ...d.data() })).filter(n=>!n.done);
    return JSON.stringify(open.map(n=>({ item_id: n.id, text: n.text || '', home: n.houseId ? (n.houseLabel || '') : 'General (no home)', for: n.mentionNames || [], added: (n.at || '').slice(0, 10), needed_by: n.due || '', high_priority: n.priority === 'high' })));
  }
  if(name === 'list_service_requests'){
    const snap = await db.collection('service-requests').get();
    const rows = snap.docs.map(d=>d.data()).filter(r=>input.which === 'all' || r.status !== 'sent');
    return JSON.stringify(rows.map(r=>{ const h = homeForRequest(r, ctx.jobs); return {
      name: r.name || '', address: r.address || '', lot: r.lot || '', home: h ? jobLabel(h) : '', submitted: (r.submittedAt || '').slice(0, 10),
      status: r.status === 'sent' ? 'complete' : (r.status || 'new'), assigned_to: r.vendorName || '', description: r.description || '' }; }));
  }
  return 'Unknown tool.';
}

// Check a proposed change against the real data, and describe it in words for the Confirm box.
// Returns { action, summary } or { error } (the error is read back to the assistant).
async function assistantCheck(name, input, ctx){
  const people = ids=>[...new Set(Array.isArray(ids) ? ids : [])].map(uid=>ctx.staff.find(s=>s.uid === uid));
  if(name === 'add_note'){
    const job = ctx.jobs.find(j=>j.id === input.home_id);
    const text = cleanText(input.text, 2000);
    const who = people(input.notify_user_ids);
    if(!job) return { error: 'There is no home with that id.' };
    if(!text) return { error: 'The note has no text.' };
    if(who.includes(undefined)) return { error: 'One of those uids is not on the team list.' };
    return { action: { type: 'add_note', homeId: job.id, text, notify: who.map(s=>s.uid) },
      summary: { title: `Add a note to ${jobLabel(job)}`, text, people: who.length ? 'Notify ' + who.map(s=>s.name).join(', ') : '' } };
  }
  if(name === 'add_punch_item'){
    const job = input.home_id ? ctx.jobs.find(j=>j.id === input.home_id) : null;
    const text = cleanText(input.text, 500);
    const who = people(input.assign_user_ids);
    if(input.home_id && !job) return { error: 'There is no home with that id. Use an empty string for no home.' };
    if(!text) return { error: 'The item has no text.' };
    if(who.includes(undefined)) return { error: 'One of those uids is not on the team list.' };
    const due = typeof input.due_date === 'string' ? input.due_date.trim() : '';
    if(due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return { error: 'due_date must be YYYY-MM-DD, or an empty string for no date.' };
    const high = input.high_priority === true;
    return { action: { type: 'add_punch_item', homeId: job ? job.id : '', text, assign: who.map(s=>s.uid), due, high },
      summary: { title: `Add to the punch list${job ? ' for ' + jobLabel(job) : ''}`, text,
        people: [who.length ? 'For ' + who.map(s=>s.name).join(', ') : '', due ? 'Needed by ' + niceDate(due) : '', high ? 'High priority' : ''].filter(Boolean).join(' · ') } };
  }
  if(name === 'complete_punch_item'){
    const doc = typeof input.item_id === 'string' && input.item_id ? await db.collection('notes').doc(input.item_id).get() : null;
    if(!doc || !doc.exists || !doc.data().todo) return { error: 'There is no punch list item with that id.' };
    if(doc.data().done) return { error: 'That item is already checked off.' };
    return { action: { type: 'complete_punch_item', itemId: doc.id },
      summary: { title: 'Check off the punch list', text: doc.data().text || '', people: doc.data().houseId ? (doc.data().houseLabel || '') : '' } };
  }
  return { error: 'Unknown tool.' };
}

// Carry out a change the person confirmed. Checked again here, since it arrives from the browser.
async function assistantRun(action, ctx){
  const now = new Date().toISOString();
  const by = { uid: ctx.me.uid, name: ctx.me.name, email: ctx.me.email, via: 'assistant' };
  const named = ids=>ids.map(uid=>ctx.staff.find(s=>s.uid === uid).name);
  if(action.type === 'add_note'){
    const ok = await assistantCheck('add_note', { home_id: action.homeId, text: action.text, notify_user_ids: action.notify }, ctx);
    if(ok.error) return ok.error;
    const a = ok.action, job = ctx.jobs.find(j=>j.id === a.homeId);
    // the tags go on the end of the text, the way they'd appear if it had been typed on the home's page
    const tags = named(a.notify).map(n=>'@' + n).join(' ');
    await db.collection('notes').add({
      houseId: job.id, houseLabel: jobLabel(job), text: a.text + (tags ? ' ' + tags : ''),
      mentions: a.notify.filter(uid=>uid !== ctx.me.uid), mentionNames: named(a.notify.filter(uid=>uid !== ctx.me.uid)), by, at: now, readBy: {},
    });
    return '';
  }
  if(action.type === 'add_punch_item'){
    const ok = await assistantCheck('add_punch_item', { home_id: action.homeId, text: action.text, assign_user_ids: action.assign, due_date: action.due || '', high_priority: action.high === true }, ctx);
    if(ok.error) return ok.error;
    const a = ok.action, job = a.homeId ? ctx.jobs.find(j=>j.id === a.homeId) : null;
    await db.collection('notes').add({
      todo: true, done: false, text: a.text, houseId: job ? job.id : '', houseLabel: job ? jobLabel(job) : 'General',
      due: a.due, priority: a.high ? 'high' : '', photos: [], photoPaths: [],
      mentions: a.assign, mentionNames: named(a.assign), by, at: now, readBy: {},
    });
    return '';
  }
  if(action.type === 'complete_punch_item'){
    const ok = await assistantCheck('complete_punch_item', { item_id: action.itemId }, ctx);
    if(ok.error) return ok.error;
    await db.collection('notes').doc(ok.action.itemId).update({ done: true, doneAt: now, doneBy: { uid: ctx.me.uid, name: ctx.me.name } });
    return '';
  }
  return 'That is not something the assistant can do.';
}

if(ASSISTANT_ON) exports.hubAssistant = onRequest({ cors: ALLOWED_ORIGINS, maxInstances: 5, timeoutSeconds: 120, secrets: [ANTHROPIC_API_KEY] }, async (req, res)=>{
  if(req.method !== 'POST'){ res.status(405).json({ error: 'method' }); return; }
  try{
    const who = await staffFromRequest(req);
    if(!who){ res.status(401).json({ error: 'sign-in' }); return; }
    const body = req.body || {};
    const ctx = await assistantContext(who);

    // The person pressed Confirm: do what was proposed.
    if(body.action === 'run'){
      const actions = Array.isArray(body.actions) ? body.actions.slice(0, 10) : [];
      const results = [];
      for(const a of actions){
        const problem = await assistantRun(a || {}, ctx);
        results.push({ ok: !problem, problem });
      }
      logger.info('Assistant actions run', { by: ctx.me.name, actions: actions.map(a=>a && a.type), failed: results.filter(r=>!r.ok).length });
      res.json({ results });
      return;
    }

    if(body.action !== 'ask'){ res.status(400).json({ error: 'action' }); return; }
    const text = cleanText(body.text, 1000);
    if(!text){ res.status(400).json({ error: 'text' }); return; }
    // a little of the conversation so far, so "no, I meant lot 41" makes sense
    const history = (Array.isArray(body.history) ? body.history : []).slice(-6)
      .filter(h=>h && ['user', 'assistant'].includes(h.role) && typeof h.text === 'string' && h.text.trim())
      .map(h=>({ role: h.role, content: h.text.slice(0, 1500) }));
    while(history.length && history[0].role !== 'user') history.shift();
    const messages = [...history, { role: 'user', content: text }];

    const sdk = require('@anthropic-ai/sdk');
    const Anthropic = sdk.Anthropic || sdk.default || sdk;
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value().trim() });
    const request = {
      model: ASSISTANT_MODEL,
      max_tokens: 16000,
      // short spoken commands: quick answers matter more than deep deliberation
      output_config: { effort: 'low' },
      // the instructions never change, so they can be cached; the lists of homes and people follow
      system: [{ type: 'text', text: ASSISTANT_RULES, cache_control: { type: 'ephemeral' } }, { type: 'text', text: ctx.facts }],
      tools: ASSISTANT_TOOLS,
    };
    // If Claude's safety checks ever decline a request, let the service retry it on its fallback
    // model instead of failing. If this account can't use that option, carry on without it.
    let useFallbacks = true;
    const callClaude = async ()=>{
      if(useFallbacks){
        try{
          return await client.beta.messages.create({ ...request, messages, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
        } catch(err){
          if(!(err instanceof Anthropic.BadRequestError)) throw err;
          logger.warn('Assistant: fallback option not accepted, continuing without it', { message: err.message });
          useFallbacks = false;
        }
      }
      return client.messages.create({ ...request, messages });
    };

    const proposed = [];
    let reply = '', tokensIn = 0, tokensOut = 0;
    for(let turn = 0; turn < 6; turn++){
      const response = await callClaude();
      tokensIn += (response.usage.input_tokens || 0) + (response.usage.cache_read_input_tokens || 0) + (response.usage.cache_creation_input_tokens || 0);
      tokensOut += response.usage.output_tokens || 0;
      reply = response.content.filter(b=>b.type === 'text').map(b=>b.text).join('\n').trim() || reply;
      if(response.stop_reason === 'refusal'){ reply = 'Sorry, I can\'t help with that one.'; break; }
      if(response.stop_reason === 'pause_turn'){ messages.push({ role: 'assistant', content: response.content }); continue; }
      if(response.stop_reason !== 'tool_use') break;

      messages.push({ role: 'assistant', content: response.content });
      const results = [];
      for(const block of response.content.filter(b=>b.type === 'tool_use')){
        let content, isError = false;
        try{
          if(ASSISTANT_WRITES.includes(block.name)){
            const checked = await assistantCheck(block.name, block.input || {}, ctx);
            if(checked.error){ content = checked.error; isError = true; }
            else {
              proposed.push({ ...checked.action, summary: checked.summary });
              content = 'This is now on the person\'s screen with Confirm and Cancel. It has NOT been saved yet.';
            }
          } else {
            content = await assistantLookup(block.name, block.input || {}, ctx);
          }
        } catch(err){
          logger.error('Assistant tool failed', { tool: block.name, error: String(err) });
          content = 'That look-up failed.'; isError = true;
        }
        results.push({ type: 'tool_result', tool_use_id: block.id, content, ...(isError ? { is_error: true } : {}) });
      }
      messages.push({ role: 'user', content: results });
    }
    logger.info('Assistant request', { by: ctx.me.name, tokensIn, tokensOut, proposed: proposed.map(p=>p.type) });
    res.json({ reply: reply || (proposed.length ? 'Here is what I\'ll do once you confirm.' : 'Sorry, I didn\'t catch that. Could you say it another way?'), actions: proposed });
  } catch(err){
    logger.error('hubAssistant failed', { error: String(err), status: err && err.status });
    // a status here means Claude's service answered with an error (bad key, out of credit, busy)
    if(err && err.status) res.status(502).json({ error: 'ai', status: err.status });
    else res.status(500).json({ error: 'server' });
  }
});

/* ============================================================
   onNoteCreated — someone was @mentioned in a note on a home.
   Email each person mentioned, at the address they sign in to the hub with.
   (The "emails to subs" switch on Admin Settings doesn't affect this — these go to staff.)
   ============================================================ */
if(EMAIL_ON) exports.onNoteCreated = onDocumentCreated({ document: 'notes/{noteId}', secrets: [GMAIL_APP_PASSWORD] }, async event=>{
  const note = event.data.data();
  const author = (note.by && note.by.uid) || '';
  const uids = [...new Set(Array.isArray(note.mentions) ? note.mentions : [])].filter(uid=>uid && uid !== author);
  if(!uids.length) return;

  const nodemailer = require('nodemailer');
  const transport = nodemailer.createTransport({ service: 'gmail', auth: { user: MAIL_USER.value(), pass: GMAIL_APP_PASSWORD.value().replace(/\s+/g, '') } });
  const from = `"Alden Homes Hub" <${MAIL_USER.value()}>`;
  const who = (note.by && note.by.name) || 'Someone';
  const house = note.houseLabel || 'a home';
  const site = 'https://aldenhomes.github.io/AldenHomesHUB/';
  // A staff note opens the home; something from a sub opens that job on the schedule,
  // which is where another vendor can be picked.
  const fromSub = ['subDeclined', 'subNote', 'subWaiting'].includes(note.kind);
  // a punch list item (a note with todo: true) given to someone opens the punch list
  const link = note.todo ? `${site}punch.html`
    : fromSub ? `${site}construction.html?house=${encodeURIComponent(note.houseId || '')}&task=${encodeURIComponent(note.taskId || '')}`
    : `${site}house.html?id=${encodeURIComponent(note.houseId || '')}#notes`;
  const where = note.houseId ? ` for <strong>${esc(house)}</strong>` : '';
  // a punch list item can be high priority and can have a date it's needed by
  const urgent = note.priority === 'high';
  const dueBy = /^\d{4}-\d{2}-\d{2}$/.test(note.due || '') ? `, needed by ${niceDate(note.due)}` : '';
  const wording = note.todo ? { heading: urgent ? 'High priority punch list item' : 'Punch list item for you', subject: `${urgent ? 'HIGH PRIORITY — ' : ''}Punch list: ${String(note.text || '').slice(0, 60)}`, lead: `<strong>${esc(who)}</strong> added a ${urgent ? '<strong style="color:#b3452f;">high priority</strong> ' : ''}punch list item for you${where}${esc(dueBy)}:`, plain: `${who} added a ${urgent ? 'HIGH PRIORITY ' : ''}punch list item for you${note.houseId ? ' for ' + house : ''}${dueBy}:`, button: 'Open the punch list' } : {
    subDeclined: { heading: 'A sub declined a job', subject: `Declined: ${who} on ${house}`, lead: `<strong>${esc(who)}</strong> declined a job on <strong>${esc(house)}</strong>:`, plain: `${who} declined a job on ${house}:`, button: 'Open this job' },
    subNote: { heading: 'Note from a sub', subject: `Note from ${who} on ${house}`, lead: `<strong>${esc(who)}</strong> sent a note about <strong>${esc(house)}</strong>:`, plain: `${who} sent a note about ${house}:`, button: 'Open this job' },
    subWaiting: { heading: 'Still waiting on a sub', subject: `Still waiting on an answer — ${house}`, lead: `A job on <strong>${esc(house)}</strong> has been waiting on an answer for more than ${WAITING_DAYS / 7} weeks:`, plain: `A job on ${house} has been waiting on an answer for more than ${WAITING_DAYS / 7} weeks:`, button: 'Open this job' },
  }[note.kind] || { heading: 'New note for you', subject: `New note for you on ${house}`, lead: `<strong>${esc(who)}</strong> mentioned you in a note on <strong>${esc(house)}</strong>:`, plain: `${who} mentioned you in a note on ${house}:`, button: 'Open this home' };
  const optOut = fromSub ? `You can switch these off in the hub: ${site}admin.html` : '';
  // photos a sub sent with their note
  const notePhotos = (Array.isArray(note.photos) ? note.photos : []).filter(u=>typeof u === 'string' && /^https:\/\//.test(u)).slice(0, 6);
  const font = 'font-family:Arial,Helvetica,sans-serif;';
  const html = `<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f4ef"><tr><td align="center" style="padding:24px 12px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;" bgcolor="#ffffff">
    <tr><td bgcolor="#4B4F54" style="padding:20px 24px;${font}font-size:20px;font-weight:bold;color:#ffffff;">Alden Homes Hub<br><span style="font-size:13px;font-weight:normal;color:#d9dccb;">${wording.heading}</span></td></tr>
    <tr><td style="padding:22px 24px 6px;${font}font-size:15px;line-height:1.5;color:#33363a;">${wording.lead}</td></tr>
    <tr><td style="padding:8px 24px 4px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#faf8f2" style="padding:14px 16px;border-left:4px solid #A3AA83;${font}font-size:15px;line-height:1.55;color:#33363a;">${esc(note.text || '').replace(/\n/g, '<br>')}</td></tr></table></td></tr>
    ${notePhotos.length ? `<tr><td style="padding:10px 24px 0;">${notePhotos.map(url=>`<a href="${esc(url)}"><img src="${esc(url)}" width="150" alt="Photo" style="width:150px;max-width:46%;height:auto;border:0;margin:0 6px 6px 0;"></a>`).join('')}</td></tr>` : ''}
    <tr><td style="padding:16px 24px 0;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#3f7a4e" style="padding:16px 12px;${font}font-size:17px;font-weight:bold;"><a href="${esc(link)}" style="color:#ffffff;text-decoration:none;">${wording.button} &rarr;</a></td></tr></table></td></tr>
    <tr><td style="padding:10px 24px 24px;${font}font-size:12px;line-height:1.5;color:#8a8f94;word-break:break-all;">Button not working? Copy this link: ${esc(link)}${optOut ? '<br><br>' + esc(optOut) : ''}</td></tr>
  </table></td></tr></table>`;
  const text = `${wording.plain}\n\n${note.text || ''}${notePhotos.length ? '\n\nPhotos:\n' + notePhotos.join('\n') : ''}\n\n${wording.button}: ${link}${optOut ? '\n\n' + optOut : ''}`;

  for(const uid of uids){
    try{
      const user = await admin.auth().getUser(uid);
      if(!user.email || user.disabled) continue;
      await transport.sendMail({ from, to: user.email, subject: wording.subject, text, html });
      logger.info('Emailed a note mention', { to: user.email, house });
    } catch(err){
      logger.error('Could not email a note mention', { uid, error: String(err) });
    }
  }
});

/* ============================================================
   onNoteReplied — someone commented on a note.
   The hub decides who should hear about it (everyone already in the conversation, plus
   anyone tagged in the comment) and saves that list on the comment as `notify`.
   This emails those people.
   ============================================================ */
if(EMAIL_ON) exports.onNoteReplied = onDocumentUpdated({ document: 'notes/{noteId}', secrets: [GMAIL_APP_PASSWORD] }, async event=>{
  const before = event.data.before.data() || {}, note = event.data.after.data() || {};
  const had = new Set((before.replies || []).map(r=>r.id));
  const fresh = (note.replies || []).filter(r=>r && r.id && !had.has(r.id));
  // only a newly added comment counts — not a check-off, a "read" flag or a deleted comment
  if(fresh.length !== 1 || (note.replies || []).length <= (before.replies || []).length) return;
  const reply = fresh[0];
  const author = (reply.by && reply.by.uid) || '';
  const uids = [...new Set(Array.isArray(reply.notify) ? reply.notify : [])].filter(uid=>uid && uid !== author);
  if(!uids.length) return;

  const nodemailer = require('nodemailer');
  const transport = nodemailer.createTransport({ service: 'gmail', auth: { user: MAIL_USER.value(), pass: GMAIL_APP_PASSWORD.value().replace(/\s+/g, '') } });
  const who = (reply.by && reply.by.name) || 'Someone';
  const house = note.houseId ? (note.houseLabel || 'a home') : 'the punch list';
  const site = 'https://aldenhomes.github.io/AldenHomesHUB/';
  const link = note.houseId ? `${site}house.html?id=${encodeURIComponent(note.houseId)}#notes` : `${site}punch.html`;
  const original = String(note.text || '');
  const font = 'font-family:Arial,Helvetica,sans-serif;';
  const html = `<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f4ef"><tr><td align="center" style="padding:24px 12px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;" bgcolor="#ffffff">
    <tr><td bgcolor="#4B4F54" style="padding:20px 24px;${font}font-size:20px;font-weight:bold;color:#ffffff;">Alden Homes Hub<br><span style="font-size:13px;font-weight:normal;color:#d9dccb;">New comment</span></td></tr>
    <tr><td style="padding:22px 24px 6px;${font}font-size:15px;line-height:1.5;color:#33363a;"><strong>${esc(who)}</strong> commented on a note on <strong>${esc(house)}</strong>:</td></tr>
    <tr><td style="padding:8px 24px 4px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#faf8f2" style="padding:14px 16px;border-left:4px solid #A3AA83;${font}font-size:15px;line-height:1.55;color:#33363a;">${esc(reply.text || '').replace(/\n/g, '<br>')}</td></tr></table></td></tr>
    <tr><td style="padding:10px 24px 0;${font}font-size:13px;line-height:1.5;color:#6b6f72;">The note: ${esc(original.slice(0, 300))}${original.length > 300 ? '…' : ''}</td></tr>
    <tr><td style="padding:16px 24px 0;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#3f7a4e" style="padding:16px 12px;${font}font-size:17px;font-weight:bold;"><a href="${esc(link)}" style="color:#ffffff;text-decoration:none;">Open the note &rarr;</a></td></tr></table></td></tr>
    <tr><td style="padding:10px 24px 24px;${font}font-size:12px;line-height:1.5;color:#8a8f94;word-break:break-all;">Button not working? Copy this link: ${esc(link)}</td></tr>
  </table></td></tr></table>`;
  const text = `${who} commented on a note on ${house}:\n\n${reply.text || ''}\n\nThe note: ${original.slice(0, 300)}\n\nOpen the note: ${link}`;
  for(const uid of uids){
    try{
      const user = await admin.auth().getUser(uid);
      if(!user.email || user.disabled) continue;
      await transport.sendMail({ from: `"Alden Homes Hub" <${MAIL_USER.value()}>`, to: user.email, subject: `New comment on ${house}`, text, html });
      logger.info('Emailed a note comment', { to: user.email, house });
    } catch(err){
      logger.error('Could not email a note comment', { uid, error: String(err) });
    }
  }
});

/* ============================================================
   onChangeOrderDecided — the buyer approved or declined a change order.
   • The staff member who wrote it is emailed either way.
   • On approval, each subcontractor with an item on it is emailed — this is the first
     they hear of it. If emails to subs are switched off (Admin Settings), they are not
     emailed; the office can send it later with "Notify subs" on the change order.
   ============================================================ */
if(EMAIL_ON) exports.onChangeOrderDecided = onDocumentWritten({ document: 'change-orders/{coId}', secrets: [GMAIL_APP_PASSWORD] }, async event=>{
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  if(!after) return;
  const justDecided = ['approved', 'declined'].includes(after.status) && (!before || before.status !== after.status);
  const askedToNotify = after.status === 'approved' && !!after.notifyRequestedAt && (!before || before.notifyRequestedAt !== after.notifyRequestedAt);
  if(!justDecided && !askedToNotify) return;

  const nodemailer = require('nodemailer');
  const transport = nodemailer.createTransport({ service: 'gmail', auth: { user: MAIL_USER.value(), pass: GMAIL_APP_PASSWORD.value().replace(/\s+/g, '') } });
  const font = 'font-family:Arial,Helvetica,sans-serif;';
  const house = after.houseLabel || 'a home';
  const label = `Change order #${after.number || ''}${after.title ? ' — ' + after.title : ''}`;
  const shell = (heading, inner)=>`<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f4ef"><tr><td align="center" style="padding:24px 12px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;" bgcolor="#ffffff">
      <tr><td bgcolor="#4B4F54" style="padding:20px 24px;${font}font-size:20px;font-weight:bold;color:#ffffff;">Alden Homes<br><span style="font-size:13px;font-weight:normal;color:#d9dccb;">${esc(heading)}</span></td></tr>
      ${inner}
    </table></td></tr></table>`;
  const button = (href, text)=>`<tr><td style="padding:16px 24px 0;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#3f7a4e" style="padding:16px 12px;${font}font-size:17px;font-weight:bold;"><a href="${esc(href)}" style="color:#ffffff;text-decoration:none;">${esc(text)} &rarr;</a></td></tr></table></td></tr>
      <tr><td style="padding:10px 24px 24px;${font}font-size:12px;line-height:1.5;color:#8a8f94;word-break:break-all;">Button not working? Copy this link: ${esc(href)}</td></tr>`;

  // 1. tell the staff member who wrote it
  if(justDecided && after.createdBy && after.createdBy.email){
    const who = (after.decision && after.decision.by) || 'The home buyer';
    const verb = after.status === 'approved' ? 'approved and signed' : 'declined';
    const link = `https://aldenhomes.github.io/AldenHomesHUB/house.html?id=${encodeURIComponent(after.houseId || '')}#changeorders`;
    try{
      await transport.sendMail({
        from: `"Alden Homes Hub" <${MAIL_USER.value()}>`, to: after.createdBy.email,
        subject: `${after.status === 'approved' ? 'Approved' : 'Declined'}: ${label} on ${house}`,
        text: `${who} ${verb} ${label} on ${house}.\n\nOpen this home: ${link}`,
        html: shell(after.status === 'approved' ? 'Change order approved' : 'Change order declined',
          `<tr><td style="padding:22px 24px 4px;${font}font-size:15px;line-height:1.5;color:#33363a;"><strong>${esc(who)}</strong> ${verb} <strong>${esc(label)}</strong> on ${esc(house)}.</td></tr>${button(link, 'Open this home')}`),
      });
    } catch(err){ logger.error('Could not email the change order result to staff', { error: String(err) }); }
  }

  // 2. on approval, tell the subs who have work on it
  if(after.status !== 'approved' || after.subNotifiedAt) return;
  const settings = await notifySettings();
  if(settings.paused && !askedToNotify){
    await event.data.after.ref.update({ subNotice: 'paused' });
    logger.info('Change order approved; subs not emailed because emails are switched off', { house });
    return;
  }
  const bySub = {};
  (after.items || []).forEach(i=>{ if(i.subId) (bySub[i.subId] = bySub[i.subId] || []).push(i.desc || ''); });
  const emailed = [], skipped = [];
  for(const subId of Object.keys(bySub)){
    const doc = await db.collection('subs').doc(subId).get();
    if(!doc.exists) continue;
    const sub = doc.data();
    const recipients = String(sub.email || '').split(/[;,]/).map(s=>s.trim()).filter(Boolean);
    if(!recipients.length){ skipped.push(sub.name || subId); continue; }
    let token = sub.linkToken;
    if(!token){ token = newToken(); await doc.ref.update({ linkToken: token }); }
    const link = `${PORTAL_URL}?k=${encodeURIComponent(token)}`;
    const items = bySub[subId];
    try{
      await transport.sendMail({
        from: `"${MAIL_NAME.value()}" <${MAIL_USER.value()}>`, replyTo: settings.replyTo || MAIL_REPLY_TO.value() || undefined, to: recipients,
        subject: `Approved change order — ${house}`,
        text: `Hi ${sub.name || ''},\n\nThe home buyer has approved a change order at ${house}${after.address ? ' (' + after.address + ')' : ''} that includes work for you:\n\n${items.map(d=>'- ' + d).join('\n')}\n\nSee it with the rest of your Alden Homes jobs: ${link}\n\nThank you,\nAlden Homes`,
        html: shell('Approved change order',
          `<tr><td style="padding:22px 24px 4px;${font}font-size:15px;line-height:1.5;color:#33363a;">Hi ${esc(sub.name || '')},<br><br>The home buyer has approved a change order at <strong>${esc(house)}</strong>${after.address ? ' (' + esc(after.address) + ')' : ''} that includes work for you:</td></tr>
           <tr><td style="padding:8px 24px 4px;"><table width="100%" cellpadding="0" cellspacing="0" border="0">${items.map(d=>`<tr><td style="padding:11px 0;border-top:1px solid #e2ddd0;${font}font-size:15px;font-weight:bold;color:#4B4F54;">${esc(d)}</td></tr>`).join('')}</table></td></tr>
           ${button(link, 'Open my jobs')}`),
      });
      emailed.push(sub.name || subId);
    } catch(err){
      skipped.push(sub.name || subId);
      logger.error('Could not email a sub about a change order', { sub: sub.name, error: String(err) });
    }
  }
  await event.data.after.ref.update({ subNotifiedAt: new Date().toISOString(), subNotice: 'sent', subsEmailed: emailed, subsSkipped: skipped });
  logger.info('Change order approved; subs notified', { house, emailed: emailed.length, skipped: skipped.length });
});

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
  const settings = await notifySettings();
  if(settings.paused){
    // Emails are switched off on the Admin Settings page. The house is still shared with subs
    // (they can see it from their link), but nobody is emailed — and nothing is marked as
    // "asked", so they'll be picked up by the morning follow-up once emails are back on.
    const now = new Date().toISOString();
    await event.data.after.ref.update({ sentAt: now, lastSend: { at: now, emailed: [], skipped: [], failed: [], paused: true } });
    logger.info('Schedule shared with subs, emails are switched off', { house: houseName(after) });
    return;
  }
  const today = todayIso();
  const bySub = {};
  (after.tasks || []).forEach(t=>{
    // everything still ahead that the sub hasn't answered yet
    if(!t.id || !t.start || t.done || t.end < today) return;
    (t.subIds || []).forEach(subId=>{
      if(((t.confirm && t.confirm[subId]) || 'pending') !== 'pending') return;
      (bySub[subId] = bySub[subId] || []).push({ houseId, sched: after, t, was: movedFrom(t, subId) });
    });
  });

  const outcome = await emailSubs(bySub, 'new', settings);
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
// Keep track of how long each sub has had each job without answering. Returns the ones
// that have just passed WAITING_DAYS, and whether anything on the tasks was changed.
// The clock restarts if the job's dates move, and stops once they answer or the job is done.
function trackWaiting(tasks, today){
  const overdue = [];
  let changed = false;
  tasks.forEach(t=>{
    if(!t.id || !t.start) return;
    const open = !t.done && t.end >= today;
    const isWaiting = subId=>open && (t.subIds || []).includes(subId) && ((t.confirm && t.confirm[subId]) || 'pending') === 'pending';
    const waiting = { ...(t.waiting || {}) };
    let touched = false;
    Object.keys(waiting).forEach(subId=>{ if(!isWaiting(subId)){ delete waiting[subId]; touched = true; } });
    (t.subIds || []).filter(isWaiting).forEach(subId=>{
      const w = waiting[subId];
      if(!w || w.start !== t.start || w.end !== t.end){
        waiting[subId] = { start: t.start, end: t.end, since: today };
        touched = true;
      } else if(!w.notified && daysBetween(w.since, today) >= WAITING_DAYS){
        waiting[subId] = { ...w, notified: today };
        overdue.push({ t, subId, since: w.since });
        touched = true;
      }
    });
    if(touched){ t.waiting = waiting; changed = true; }
  });
  return { overdue, changed };
}
// Runs every morning whether or not emails to subs are switched on — this one is for the office.
async function flagLongWaits(snap, today){
  for(const doc of snap.docs){
    if(!doc.data().sentAt) continue;
    if(!trackWaiting(JSON.parse(JSON.stringify(doc.data().tasks || [])), today).changed) continue;
    try{
      const found = await db.runTransaction(async tx=>{
        const fresh = await tx.get(doc.ref);
        if(!fresh.exists || !fresh.data().sentAt) return null;
        const tasks = fresh.data().tasks || [];
        const result = trackWaiting(tasks, today);
        if(result.changed) tx.update(doc.ref, { tasks });
        return { sched: fresh.data(), overdue: result.overdue };
      });
      for(const o of (found ? found.overdue : [])){
        const subDoc = await db.collection('subs').doc(o.subId).get();
        const name = (subDoc.exists && subDoc.data().name) || 'A subcontractor';
        await notifyStaff('subWaiting', {
          houseId: doc.id, sched: found.sched, taskId: o.t.id,
          by: { type: 'system', name: 'Hub reminder' },
          text: `${name} still hasn't answered on ${o.t.title || 'a job'} — ${whenText(o.t)}. Waiting since ${niceDate(o.since)}.`,
        });
      }
    } catch(err){ logger.error('Could not check a house for long waits', { house: doc.id, error: String(err) }); }
  }
}

/* Reminders people set on a note (the little bell on a home's Notes): `reminders: { uid: 'YYYY-MM-DD' }`,
   with `remindNext` = the earliest one still waiting. On the morning it's due, the note goes back
   on that person's bell marked as a reminder, they're emailed, and the reminder is cleared. */
async function sendNoteReminders(today){
  const snap = await db.collection('notes').where('remindNext', '>', '').where('remindNext', '<=', today).get();
  if(snap.empty) return;
  const nodemailer = require('nodemailer');
  const transport = nodemailer.createTransport({ service: 'gmail', auth: { user: MAIL_USER.value(), pass: GMAIL_APP_PASSWORD.value().replace(/\s+/g, '') } });
  const site = 'https://aldenhomes.github.io/AldenHomesHUB/';
  const font = 'font-family:Arial,Helvetica,sans-serif;';
  let sent = 0;
  for(const doc of snap.docs){
    const note = doc.data();
    const reminders = note.reminders || {};
    const due = Object.keys(reminders).filter(uid=>reminders[uid] && reminders[uid] <= today);
    const left = Object.keys(reminders).filter(uid=>!due.includes(uid) && reminders[uid]).map(uid=>reminders[uid]).sort();
    const now = new Date().toISOString();
    // back on their bell as unread, and the reminder itself is used up
    const patch = { remindNext: left[0] || '', lastAt: now };
    due.forEach(uid=>{
      patch['reminders.' + uid] = admin.firestore.FieldValue.delete();
      patch['reminded.' + uid] = today;
      patch['readBy.' + uid] = false;
    });
    if(due.length) patch.watchers = admin.firestore.FieldValue.arrayUnion(...due);
    try{ await doc.ref.update(patch); }
    catch(err){ logger.error('Could not update a note after its reminder', { note: doc.id, error: String(err) }); continue; }

    const house = note.houseId ? (note.houseLabel || 'a home') : 'the punch list';
    const link = note.houseId ? `${site}house.html?id=${encodeURIComponent(note.houseId)}#notes` : `${site}punch.html`;
    const who = (note.by && note.by.name) || 'Someone';
    const html = `<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f4ef"><tr><td align="center" style="padding:24px 12px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;" bgcolor="#ffffff">
    <tr><td bgcolor="#4B4F54" style="padding:20px 24px;${font}font-size:20px;font-weight:bold;color:#ffffff;">Alden Homes Hub<br><span style="font-size:13px;font-weight:normal;color:#d9dccb;">Your reminder</span></td></tr>
    <tr><td style="padding:22px 24px 6px;${font}font-size:15px;line-height:1.5;color:#33363a;">You asked to be reminded today about this note from <strong>${esc(who)}</strong> on <strong>${esc(house)}</strong>:</td></tr>
    <tr><td style="padding:8px 24px 4px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#faf8f2" style="padding:14px 16px;border-left:4px solid #c98a2b;${font}font-size:15px;line-height:1.55;color:#33363a;">${esc(note.text || '').replace(/\n/g, '<br>')}</td></tr></table></td></tr>
    <tr><td style="padding:16px 24px 0;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#3f7a4e" style="padding:16px 12px;${font}font-size:17px;font-weight:bold;"><a href="${esc(link)}" style="color:#ffffff;text-decoration:none;">Open the note &rarr;</a></td></tr></table></td></tr>
    <tr><td style="padding:10px 24px 24px;${font}font-size:12px;line-height:1.5;color:#8a8f94;word-break:break-all;">Button not working? Copy this link: ${esc(link)}</td></tr>
  </table></td></tr></table>`;
    const text = `You asked to be reminded today about this note from ${who} on ${house}:\n\n${note.text || ''}\n\nOpen the note: ${link}`;
    for(const uid of due){
      try{
        const user = await admin.auth().getUser(uid);
        if(!user.email || user.disabled) continue;
        await transport.sendMail({ from: `"Alden Homes Hub" <${MAIL_USER.value()}>`, to: user.email, subject: `Reminder: note on ${house}`, text, html });
        sent++;
      } catch(err){ logger.error('Could not email a note reminder', { uid, error: String(err) }); }
    }
  }
  logger.info('Note reminders sent', { sent });
}

if(EMAIL_ON) exports.dailyFollowUp = onSchedule({ schedule: 'every day 07:00', timeZone: TIME_ZONE, secrets: [GMAIL_APP_PASSWORD] }, async ()=>{
  // reminders people set for themselves go out whatever else happens below
  try{ await sendNoteReminders(todayIso()); } catch(err){ logger.error('Note reminders failed', { error: String(err) }); }
  await flagLongWaits(await db.collection('build-schedules').get(), todayIso());
  const settings = await notifySettings();
  if(settings.paused){ logger.info('Emails are switched off on the Admin Settings page — nothing sent.'); return; }
  const { leadDays, reminderDays } = settings;
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
        const item = { houseId: doc.id, sched, t, was: movedFrom(t, subId) };
        if(!asked || asked.start !== t.start || asked.end !== t.end){
          (changed[subId] = changed[subId] || []).push(item);
        } else if(t.start <= horizon && daysBetween((asked.at || '').slice(0, 10) || today, today) >= reminderDays){
          (reminders[subId] = reminders[subId] || []).push(item);
        }
      });
    });
  });

  const a = await emailSubs(changed, 'changed', settings);
  const b = await emailSubs(reminders, 'reminder', settings);
  await recordAsked([...a.asked, ...b.asked]);
  logger.info('Daily follow-up finished', { changes: a.emailed.length, reminders: b.emailed.length, skipped: [...a.skipped, ...b.skipped], failed: [...a.failed, ...b.failed] });
});
