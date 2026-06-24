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

/* ---------- Turnstile (invisible, render-on-demand) ---------- */
// Canonical POST205 pattern. Returns a one-shot token. The widget host
// (#cf-turnstile.hp) is off-screen and harmless when the flag is absent.
let _tsId = null;
export function getTurnstileToken() {
  return new Promise((res, rej) => {
    if (typeof turnstile === 'undefined') return rej(new Error('turnstile'));
    const c = document.getElementById('cf-turnstile');
    if (!c) return rej(new Error('turnstile'));
    if (_tsId === null) {
      _tsId = turnstile.render(c, {
        sitekey: window.ENV.TURNSTILE_SITEKEY,
        size: 'invisible',
        callback: res,
        'error-callback': () => rej(new Error('turnstile')),
      });
    } else {
      turnstile.reset(_tsId);
    }
    turnstile.execute(_tsId, { sitekey: window.ENV.TURNSTILE_SITEKEY });
  });
}

/* ---------- interest (real submission — Task 2.5) ---------- */
// Impure: gathers an optional message, runs the Turnstile gate (when the
// flag is set), and POSTs to the `submit-interest` edge function. The body
// carries the board TOKEN (resolves to the buyer server-side) and the
// assetId — NEVER a buyer id. Guards against double-submit; never leaks
// server detail on failure.
export async function onInterest(assetId, btn, ctx) {
  const { supabase, token } = ctx || {};
  if (!supabase || !token || !btn || btn.disabled) return;

  // Optional message — keep it simple, match the page's restraint.
  let message = '';
  if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
    const r = window.prompt(
      'Add a note for StagePro (optional) — quantity, timing, questions:',
      '',
    );
    if (r === null) return; // cancelled — don't submit
    message = r.trim();
  }

  // In-flight guard.
  const original = btn.textContent;
  btn.disabled = true;
  btn.classList.add('is-sending');
  btn.textContent = 'Sending…';
  setInterestError(btn, '');

  try {
    // Turnstile token — only when the feature flag is set. Without the flag
    // we send an empty token; prod rejects it, local dev flag is always on.
    let turnstileToken = '';
    if (window.ENV && window.ENV.TURNSTILE_SITEKEY) {
      turnstileToken = await getTurnstileToken();
    }

    const { data, error } = await supabase.functions.invoke('submit-interest', {
      body: { token, assetId, message, turnstileToken },
    });
    if (error || !data || !data.id) throw error || new Error('no-id');

    // Confirmed.
    btn.classList.remove('is-sending');
    btn.classList.add('is-done');
    btn.textContent = 'Noted — StagePro will reach out';
    btn.disabled = true;
  } catch (e) {
    // Gentle inline error; re-enable so they can retry. No detail leak.
    console.error('[board] interest failed:', e?.message || e);
    btn.classList.remove('is-sending');
    btn.disabled = false;
    btn.textContent = original;
    setInterestError(btn, 'Couldn’t send that just now — please try again.');
  }
}

// Small inline error line beneath a card's button.
function setInterestError(btn, msg) {
  const card = btn.closest('.gcard') || btn.parentElement;
  if (!card) return;
  let el = card.querySelector('.gint-err');
  if (!msg) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('p');
    el.className = 'gint-err';
    el.setAttribute('role', 'alert');
    btn.insertAdjacentElement('afterend', el);
  }
  el.textContent = msg;
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
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  try {
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
    if (btn && !btn.disabled) onInterest(btn.dataset.asset, btn, { supabase, token });
  });
  show('board');
}

// only auto-boot in the browser (lets the pure fns be imported in tests)
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  boot();
}
