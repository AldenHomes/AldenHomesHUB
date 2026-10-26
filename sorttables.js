/* ============================================================
   Click a column heading to sort a table by it (owner, 2026-10-26: "any time there are headers with lines under it… click a header
   title and sort the data by that title"). Click again to reverse; a third time puts the table back in its own order.
   Works on any table with a <thead> on the pages that pull this file in (one <script src="sorttables.js"> before </body>), except:
     - tables marked data-nosort or class "task-table" (schedules and templates, where the order IS the schedule)
     - headings that already sort themselves (th[data-key]) or are marked data-nosort
   Numbers ($1,400 · + $350 · − $2,000 credit · 12.5%) sort as numbers, dates as dates, the rest A–Z; blanks and "—" go last.
   A "Total" row stays at the bottom, and a row that belongs to the one above it (an opened cost code's invoices, a sale breakdown —
   a single cell spanning the table) moves with it. The page redraws its tables often, so the chosen sort is remembered per table
   (by its headings) and put back on each redraw.
   ============================================================ */
(function(){
  const saved = {};          // table signature -> { col, dir }  (dir 1 = up, -1 = down)
  const sig = t=>location.pathname + '|' + [...t.tHead.rows[0].cells].map(c=>c.textContent.trim()).join('|');
  const skipTable = t=>!t.tHead || !t.tHead.rows.length || !t.tBodies.length || t.matches('[data-nosort], .task-table') || !!t.tHead.querySelector('th[data-key]');   // th[data-key] = the page sorts this table itself
  const skipTh = th=>th.hasAttribute('data-key') || th.hasAttribute('data-nosort') || !th.textContent.trim();
  // a cell's value for sorting: a number when it reads as one, a date when it is one, else lower-case text; '' = blank
  function keyOf(cell){
    if(!cell) return { b: true };
    const raw = (cell.getAttribute('data-sort-value') || cell.textContent || '').trim();
    if(!raw || /^[—–-]+$/.test(raw)) return { b: true };
    let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/) || raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if(m){ const d = raw[4] === '-' ? new Date(+m[1], m[2] - 1, +m[3]) : new Date((+m[3] < 100 ? 2000 + +m[3] : +m[3]), m[1] - 1, +m[2]); if(!isNaN(d)) return { n: d.getTime() }; }
    const num = raw.replace(/,/g, '').match(/^([+−–-]\s*)?\$?\s*(-?\d+(\.\d+)?)\s*(%|k)?\b/i);
    if(num){ let v = parseFloat(num[2]); if(num[1] && /[−–-]/.test(num[1])) v = -v; if(/credit/i.test(raw)) v = -Math.abs(v); if(num[4] && num[4].toLowerCase() === 'k') v *= 1000; return { n: v }; }
    return { s: raw.toLowerCase() };
  }
  const cmp = (a, b)=>a.b && b.b ? 0 : a.b ? 1 : b.b ? -1 : a.n != null && b.n != null ? a.n - b.n : a.n != null ? -1 : b.n != null ? 1 : a.s.localeCompare(b.s, undefined, { numeric: true });
  const isTotal = tr=>tr.classList.contains('tot') || /^total$/i.test([...tr.cells].slice(0, 2).map(c=>c.textContent.trim()).filter(Boolean)[0] || '');
  const isAttached = (tr, n)=>tr.classList.contains('code-lines') || (tr.cells.length === 1 && tr.cells[0].colSpan > 1 && n > 1);
  function apply(t){
    const st = saved[sig(t)], body = t.tBodies[0];
    // remember the page's own order (again whenever the page has redrawn the rows), so "back to normal" is possible
    const now = [...body.rows];
    if(!t._sortOrig || now.some(r=>!t._sortOrig.includes(r))) t._sortOrig = now;
    const ncols = t.tHead.rows[0].cells.length;
    // rows grouped with any rows attached to them; total rows kept apart
    const groups = [], totals = [];
    let pos = 0;
    t._sortOrig.forEach(tr=>{ if(tr.parentNode !== body) return;
      if(isTotal(tr)) totals.push(tr); else if(isAttached(tr, ncols) && groups.length) groups[groups.length - 1].rows.push(tr); else groups.push({ rows:[tr], i: pos++ }); });
    if(st) groups.sort((a, b)=>cmp(keyOf(a.rows[0].cells[st.col]), keyOf(b.rows[0].cells[st.col])) * st.dir || a.i - b.i);
    groups.forEach(g=>g.rows.forEach(r=>body.appendChild(r))); totals.forEach(r=>body.appendChild(r));
    [...t.tHead.rows[0].cells].forEach((c, i)=>{ c.classList.toggle('sort-up', !!st && st.col === i && st.dir === 1); c.classList.toggle('sort-down', !!st && st.col === i && st.dir === -1); });
    t._sortSig = st ? st.col + ':' + st.dir : ''; t._sortLast = [...body.rows];
  }
  document.addEventListener('click', e=>{
    const th = e.target.closest('thead th'); if(!th) return;
    const t = th.closest('table'); if(!t || skipTable(t) || skipTh(th) || th.closest('thead') !== t.tHead) return;
    const col = [...th.parentNode.cells].indexOf(th), k = sig(t), cur = saved[k];
    saved[k] = !cur || cur.col !== col ? { col, dir: 1 } : cur.dir === 1 ? { col, dir: -1 } : null;
    if(!saved[k]) delete saved[k];
    apply(t);
  });
  // a redrawn table gets its sort back
  const reapply = ()=>document.querySelectorAll('table').forEach(t=>{ if(skipTable(t)) return; const st = saved[sig(t)];
    const rows = [...t.tBodies[0].rows], last = t._sortLast || [];
    if(st && (t._sortSig !== st.col + ':' + st.dir || rows.length !== last.length || rows.some((r, i)=>r !== last[i]))) apply(t); });
  let queued = false;
  new MutationObserver(()=>{ if(queued) return; queued = true; requestAnimationFrame(()=>{ queued = false; reapply(); }); })
    .observe(document.documentElement, { childList: true, subtree: true });
  const css = document.createElement('style');
  css.textContent = `table:not([data-nosort]):not(.task-table) > thead th:not([data-key]):not([data-nosort]){cursor:pointer; user-select:none;}
    table:not([data-nosort]):not(.task-table) > thead th:not([data-key]):not([data-nosort]):hover{text-decoration:underline;}
    th.sort-up::after{content:" \\25B2"; font-size:.8em;} th.sort-down::after{content:" \\25BC"; font-size:.8em;}`;
  document.head.appendChild(css);
})();
