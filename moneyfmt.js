/* ============================================================
   Commas in money boxes (owner, 2026-10-26: "any time there are dollar amounts… add commas").
   A browser number box can't show commas, so every money box (MONEY_BOXES below) is turned into a text box that shows 297,900 and
   reads back as 297900: its .value hands the page the plain number (commas, $ and spaces taken out), so the pages' own code keeps
   working unchanged. The commas go in when the box is drawn, when the page sets a value, and when you click out of the box.
   Pulled in by one <script src="moneyfmt.js"> in the <head> of each page that has money boxes.
   ============================================================ */
(function(){
  // which boxes are money (the same list for every page; an id that isn't on a page simply never matches)
  const MONEY_BOXES = [
    '[data-money]',
    // Selections: house / lot / base price, allowances, back-end prices, typed tile price, lot premium, custom items
    '#nBase', '#nLotPrice', '#baseIn', '#lotIn', '[data-allow]', '[data-allowdef]', '[data-optp]', '[data-ceilp]', '[data-over]',
    '[data-basep]', '[data-rate]', '[data-lotprem]', '#cuPrice', '#cuCost', '[data-cuprice]', '[data-cucost]', '#coPrice', '#coCost',
    // Admin Settings: overhead per house; a home's change order item prices
    '#overhead', 'input.price[data-f="price"]',
  ].join(',');
  const isMoney = el=>el instanceof HTMLInputElement && el.matches(MONEY_BOXES);
  const plain = v=>String(v == null ? '' : v).replace(/[,$\s]/g, '');
  // 297900 -> "297,900"; keeps a minus sign and up to two typed decimals; anything that isn't a number is left alone
  function withCommas(v){
    const s = plain(v);
    const m = s.match(/^(-?)(\d*)(\.\d*)?$/);
    if(!m || (!m[2] && !m[3])) return s;
    return m[1] + (m[2] ? Number(m[2]).toLocaleString('en-US') : '0') + (m[3] ? m[3].slice(0, 3) : '');
  }
  const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  Object.defineProperty(HTMLInputElement.prototype, 'value', {
    configurable: true, enumerable: desc.enumerable,
    get(){ const v = desc.get.call(this); return isMoney(this) ? plain(v) : v; },
    set(v){ desc.set.call(this, isMoney(this) ? withCommas(v) : v); },
  });
  // a number box can't hold commas: money boxes become text boxes (with the number keypad on phones)
  function fix(el){
    if(!isMoney(el) || el.dataset.moneyOk) return;
    el.dataset.moneyOk = '1';
    if(el.type === 'number'){ el.type = 'text'; el.inputMode = 'decimal'; }
    const raw = desc.get.call(el);
    if(raw) desc.set.call(el, withCommas(raw));
  }
  const scan = root=>{ if(root.querySelectorAll) root.querySelectorAll('input').forEach(fix); if(root instanceof HTMLInputElement) fix(root); };
  new MutationObserver(list=>list.forEach(m=>m.addedNodes.forEach(scan))).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', ()=>scan(document));
  // commas back in after typing, once you leave the box
  document.addEventListener('focusout', e=>{ const el = e.target; if(isMoney(el)){ const raw = desc.get.call(el); desc.set.call(el, withCommas(raw)); } }, true);
})();
