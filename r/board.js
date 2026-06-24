// StagePro — private buyer board (/r/<token>).
// Static page. One anon RPC: board_by_token. anon can read NOTHING else.
// Never reveals whether a token is real — bad/inactive token renders the same
// neutral "isn't active" screen as a buyer with nothing curated.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/* ---------- token ---------- */
// Primary: /r/?t=<token> (the Netlify rewrite turns /r/<token> into this).
// Tolerated: a path token at /r/<token> in case the rewrite isn't in front.
export function readToken(loc = window.location) {
  const qp = new URLSearchParams(loc.search).get('t');
  if (qp && qp.trim()) return qp.trim();
  const m = loc.pathname.match(/^\/r\/([^/?#]+)\/?$/);
  if (m && m[1] && m[1] !== 'index.html') return decodeURIComponent(m[1]);
  return '';
}

/* ---------- formatting ---------- */
export function peso(n) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return null;
  return '₱' + Number(n).toLocaleString('en-PH', { maximumFractionDigits: 0 });
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const GEAR_PH = `<div class="gph-ph" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.2"/>
  <path d="M3 17l4.5-4 3 2.6L15 11l6 5.5"/></svg></div>`;

/* ---------- pure render ---------- */
// Pure: rows -> HTML string for the grid. No DOM/network. Testable.
export function renderCards(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  return rows.map((r) => {
    const photos = Array.isArray(r.photos) ? r.photos.filter(Boolean) : [];
    const photo = photos.length
      ? `<img src="${esc(photos[0])}" alt="${esc(r.name)}" loading="lazy"
           onerror="this.remove()">`
      : '';
    const qty = r.qty != null ? `${r.qty} ${r.qty === 1 ? 'unit' : 'units'} available` : '';
    const ask = peso(r.asking_price);
    const priceHtml = ask
      ? `<span class="gprice">${ask}</span>`
      : `<span class="gprice inquiry">Price on inquiry</span>`;
    const book = peso(r.book_value);
    const bookHtml = book ? `<span class="gbook">Book value ${book}</span>` : '';
    const countBadge = r.qty != null ? `<span class="gcount">×${esc(r.qty)}</span>` : '';

    return `<article class="gcard" role="listitem">
      <div class="gphoto">${photo || GEAR_PH}${countBadge}</div>
      <div class="gbody">
        <p class="gcat">${esc(r.category || 'Equipment')}</p>
        <h2 class="gname">${esc(r.name)}</h2>
        <p class="gqty">${esc(qty)}</p>
        <div class="gprice-row">${priceHtml}${bookHtml}</div>
        <button type="button" class="gint" data-asset="${esc(r.asset_id)}">I’m interested</button>
      </div>
    </article>`;
  }).join('');
}

export function buyerTitle(rows) {
  const name = rows.find((r) => r && r.buyer_name)?.buyer_name;
  return name ? `Curated for ${name}` : 'Curated selection';
}

/* ---------- interest (STUB — backend wiring is Task 2.5) ---------- */
// TODO(task-2.5): POST interest to the edge function (Turnstile + edge write).
// For now: no-op that flips the button to a disabled "coming soon" state.
export function onInterest(assetId, btn) {
  // eslint-disable-next-line no-console
  console.log('[board] interest stub — assetId:', assetId, '(wiring lands in task 2.5)');
  if (btn) {
    btn.textContent = 'Noted — we’ll be in touch';
    btn.classList.add('is-stub');
    btn.disabled = true;
  }
}

/* ---------- boot ---------- */
function show(id) {
  ['noconfig', 'empty', 'board'].forEach((x) => {
    const el = document.getElementById(x);
    if (el) el.hidden = x !== id;
  });
}

async function boot() {
  const env = window.ENV;
  if (!env || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    console.error('[board] window.ENV missing — /env.js did not load.');
    show('noconfig');
    return;
  }

  const token = readToken();
  if (!token) { show('empty'); return; }

  let rows = [];
  try {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
    const { data, error } = await supabase.rpc('board_by_token', { p_token: token });
    if (error) throw error;
    rows = Array.isArray(data) ? data : [];
  } catch (e) {
    // Never leak: any failure looks like an inactive link.
    console.error('[board] load failed:', e?.message || e);
    show('empty');
    return;
  }

  if (rows.length === 0) { show('empty'); return; }

  document.getElementById('boardTitle').textContent = buyerTitle(rows);
  const grid = document.getElementById('grid');
  grid.innerHTML = renderCards(rows);
  grid.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.gint');
    if (btn && !btn.disabled) onInterest(btn.dataset.asset, btn);
  });
  show('board');
}

// only auto-boot in the browser (lets the pure fns be imported in tests)
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  boot();
}
