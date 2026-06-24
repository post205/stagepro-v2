// StagePro studio — magic-link login shell (Task 0.6).
// Single-owner Supabase Auth (email OTP / magic link). Shell only:
// later tasks fill the authenticated <main> with the asset register.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const els = {
  noconfig: document.getElementById('noconfig'),
  auth:     document.getElementById('auth'),
  app:      document.getElementById('app'),
  form:     document.getElementById('loginForm'),
  email:    document.getElementById('email'),
  btn:      document.getElementById('loginBtn'),
  authMsg:  document.getElementById('authMsg'),
  userEmail:document.getElementById('userEmail'),
  signout:  document.getElementById('signout'),
  register: document.getElementById('register'),
  buyers:   document.getElementById('buyers'),
  interest: document.getElementById('interest'),
  interestCount: document.getElementById('interestCount'),
};

// --- asset register: pure render helpers (testable) ---------------------

// PH peso, no decimals (book values are large; cents are noise here).
const peso = (n) =>
  '₱' + Math.round(Number(n) || 0).toLocaleString('en-PH');

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));
}

// whole months between a past date string and now (floored, min 0)
function monthsSince(dateStr) {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  if (isNaN(d)) return 0;
  const now = new Date();
  let m = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (now.getDate() < d.getDate()) m -= 1;
  return Math.max(0, m);
}

// status descriptor for the Asset subline
function statusDescriptor(row) {
  if (row.status === 'idle') {
    return 'idle ' + monthsSince(row.idle_since) + ' mo';
  }
  return 'earning';
}

// today as a yyyy-mm-dd string (local), for date inputs / idle_since defaults
function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// normalize a form's raw values into a writable assets row.
// pure: takes a plain object of strings, returns { row, errors }.
// idle_since defaults to today when status flips to idle & left blank;
// it's cleared when status is in_service. disposition/asking_price are
// NOT touched here (handled by the per-row Keep/Sell flow).
function buildAssetWrite(input) {
  const errors = {};
  const name = String(input.name == null ? '' : input.name).trim();
  if (!name) errors.name = 'Name is required.';

  const qty = Math.trunc(Number(input.qty));
  if (!Number.isFinite(qty) || qty < 1) errors.qty = 'Quantity must be 1 or more.';

  const cost = Number(input.acquisition_cost);
  if (!Number.isFinite(cost) || cost < 0) errors.acquisition_cost = 'Cost must be 0 or more.';

  const salvageRaw = String(input.salvage_value == null ? '' : input.salvage_value).trim();
  const salvage = salvageRaw === '' ? 0 : Number(salvageRaw);
  if (!Number.isFinite(salvage) || salvage < 0) errors.salvage_value = 'Salvage must be 0 or more.';

  const lifeRaw = String(input.useful_life_months == null ? '' : input.useful_life_months).trim();
  const life = lifeRaw === '' ? 60 : Math.trunc(Number(lifeRaw));
  if (!Number.isFinite(life) || life < 1) errors.useful_life_months = 'Useful life must be 1+ months.';

  const acquired = String(input.acquired_on == null ? '' : input.acquired_on).trim();
  if (!acquired || isNaN(new Date(acquired))) errors.acquired_on = 'Pick a valid acquisition date.';

  const status = input.status === 'idle' ? 'idle' : 'in_service';
  let idleSince = String(input.idle_since == null ? '' : input.idle_since).trim() || null;
  if (status === 'idle') {
    if (!idleSince) idleSince = todayStr();
  } else {
    idleSince = null;
  }

  const row = {
    name,
    category: String(input.category == null ? '' : input.category).trim() || null,
    qty,
    acquisition_cost: cost,
    salvage_value: salvage,
    useful_life_months: life,
    acquired_on: acquired,
    status,
    idle_since: idleSince,
    notes: String(input.notes == null ? '' : input.notes).trim() || null,
  };

  return { row, errors, ok: Object.keys(errors).length === 0 };
}

// build a unique, filesystem-safe object path for a gear upload.
// pure: (assetId|null, fileName, now-ms) -> "<id|new>/<ts>-<safeName>"
function gearPath(assetId, fileName, ts) {
  const id = String(assetId || 'new').replace(/[^a-z0-9-]/gi, '') || 'new';
  const base = String(fileName || 'photo')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')   // collapse non-safe runs to a dash
    .replace(/^-+|-+$/g, '')        // trim leading/trailing dashes
    .slice(-60) || 'photo';
  return id + '/' + (ts || Date.now()) + '-' + base;
}

// the three capital-bleed stats — pure fn of rows
function computeStats(rows) {
  const num = (v) => Number(v) || 0;
  const sell = rows.filter((r) => r.suggested_disposition === 'sell');
  return {
    bookValue:     rows.reduce((s, r) => s + num(r.book_value), 0),
    flaggedToSell: sell.reduce((s, r) => s + num(r.book_value), 0),
    monthlyBleed:  sell.reduce((s, r) => s + num(r.monthly_depreciation), 0),
  };
}

// render the whole register (stat row + table) as an HTML string.
// Pure fn of the rows array — no DOM, no globals — so it's testable.
function renderRegister(rows) {
  const addBar =
    '<div class="reg-head">' +
      '<button type="button" class="btn-add" data-add>+ Add asset</button>' +
    '</div>';

  if (!rows || !rows.length) {
    return addBar + '<p class="empty muted">No assets yet. Add your first one.</p>';
  }
  const s = computeStats(rows);

  const stats =
    '<div class="stats">' +
      '<div class="stat">' +
        '<div class="stat-k">Asset book value</div>' +
        '<div class="stat-v">' + peso(s.bookValue) + '</div>' +
      '</div>' +
      '<div class="stat">' +
        '<div class="stat-k">Flagged to sell</div>' +
        '<div class="stat-v amber">' + peso(s.flaggedToSell) + '</div>' +
      '</div>' +
      '<div class="stat">' +
        '<div class="stat-k">Monthly bleed</div>' +
        '<div class="stat-v amber">≈ ' + peso(s.monthlyBleed) + '/mo</div>' +
        '<div class="stat-note">still depreciating</div>' +
      '</div>' +
    '</div>';

  const body = rows.map((r) => {
    const sell = r.suggested_disposition === 'sell';
    const overridden = r.disposition != null;
    const id = escapeHtml(r.id);
    // override note: show owner decision + asking price when a Sell override is set
    const askNote = (r.disposition === 'sell' && r.asking_price != null)
      ? '<span class="ask">asking ' + peso(r.asking_price) + '</span>' : '';
    const photo = (Array.isArray(r.photos) && r.photos.length) ? r.photos[0] : '';
    const thumb = photo
      ? '<img class="a-thumb" src="' + escapeHtml(photo) + '" alt="" loading="lazy">'
      : '';
    return (
      '<tr data-edit="' + id + '" tabindex="0" role="button" ' +
        'aria-label="Edit ' + escapeHtml(r.name) + '">' +
        '<td class="c-asset">' +
          '<div class="a-wrap">' + thumb + '<div>' +
            '<div class="a-name">' + escapeHtml(r.name) + '</div>' +
            '<div class="a-sub">' + (Number(r.qty) || 0) + ' owned · ' +
              escapeHtml(statusDescriptor(r)) + '</div>' +
          '</div></div>' +
        '</td>' +
        '<td class="c-book">' + peso(r.book_value) + '</td>' +
        '<td class="c-disp">' +
          '<div class="disp-wrap">' +
            '<span class="pill ' + (sell ? 'sell' : 'keep') +
              (overridden ? ' ov' : '') + '">' +
              (sell ? 'Sell' : 'Keep') +
              (overridden ? '<span class="ov-dot" title="owner override">●</span>' : '') +
            '</span>' + askNote +
            '<div class="disp-actions">' +
              '<button type="button" class="mini" data-keep="' + id + '">Keep</button>' +
              '<button type="button" class="mini" data-sell="' + id + '">Sell</button>' +
              (overridden
                ? '<button type="button" class="mini clear" data-clear="' + id + '">Auto</button>'
                : '') +
            '</div>' +
          '</div>' +
        '</td>' +
      '</tr>'
    );
  }).join('');

  const table =
    '<table class="reg-table">' +
      '<thead><tr>' +
        '<th class="c-asset">Asset</th>' +
        '<th class="c-book">Book value</th>' +
        '<th class="c-disp">Disposition</th>' +
      '</tr></thead>' +
      '<tbody>' + body + '</tbody>' +
    '</table>';

  return addBar + stats + table;
}

// --- buyers: pure render helpers (testable) -----------------------------

// Where a buyer's private board lives. Swap to the prod host on launch:
//   const BOARD_BASE = 'https://buyers.stagepro.ph';
// Otherwise derive the mount base from the studio's own URL — everything before
// "/studio" — so links are correct at the root (localhost:8888/r/<token>) AND
// under a subpath deploy (post205.com/stagepro/studio/ → post205.com/stagepro/r/<token>).
const BOARD_BASE = (function () {
  if (typeof window === 'undefined' || !window.location) return '';
  const m = window.location.pathname.match(/^(.*?)\/studio(?:\/|$)/);
  return window.location.origin + (m ? m[1] : '');
})();

// the buyer's private board URL: "<base>/r/<token>"
function buyerLink(token, base) {
  const b = String(base == null ? BOARD_BASE : base).replace(/\/+$/, '');
  return b + '/r/' + encodeURIComponent(String(token || ''));
}

// normalize a new-buyer form into a writable buyers row + errors.
// pure: token/active/created_at are DB defaults — not set here.
function buildBuyerWrite(input) {
  const errors = {};
  const name = String(input.name == null ? '' : input.name).trim();
  if (!name) errors.name = 'Name is required.';
  const contact = String(input.contact == null ? '' : input.contact).trim() || null;
  return { row: { name, contact }, errors, ok: Object.keys(errors).length === 0 };
}

// render the buyer list as an HTML string. Pure fn of (buyers[], links map).
// `links[buyer.id]` = count of curated assets for that buyer.
function renderBuyers(buyers, counts) {
  const head =
    '<div class="buyers-head">' +
      '<button type="button" class="btn-add" data-buyer-add>+ Add buyer</button>' +
    '</div>';

  if (!buyers || !buyers.length) {
    return head + '<p class="empty muted">No buyers yet. Add one to share a private board.</p>';
  }
  const c = counts || {};

  const cards = buyers.map((b) => {
    const id = escapeHtml(b.id);
    const n = c[b.id] || 0;
    const link = buyerLink(b.token);
    const contact = b.contact
      ? '<div class="buyer-contact">' + escapeHtml(b.contact) + '</div>' : '';
    const checked = b.active ? ' checked' : '';
    return (
      '<div class="buyer-card' + (b.active ? '' : ' off') + '">' +
        '<div class="buyer-top">' +
          '<div>' +
            '<div class="buyer-name">' + escapeHtml(b.name) + '</div>' + contact +
          '</div>' +
          '<div class="buyer-meta">' +
            '<span class="buyer-count"><b>' + n + '</b> asset' + (n === 1 ? '' : 's') +
              ' to view</span>' +
            '<label class="toggle">' +
              '<input type="checkbox" data-buyer-active="' + id + '"' + checked + '>' +
              '<span class="track"></span>' +
              '<span>' + (b.active ? 'Active' : 'Off') + '</span>' +
            '</label>' +
          '</div>' +
        '</div>' +
        '<div class="buyer-link">' +
          '<code title="' + escapeHtml(link) + '">' + escapeHtml(link) + '</code>' +
          '<button type="button" class="copy-btn" data-copy="' + escapeHtml(link) + '">Copy</button>' +
        '</div>' +
        '<div class="buyer-actions">' +
          '<button type="button" class="mini" data-curate="' + id + '">Curate gear</button>' +
        '</div>' +
      '</div>'
    );
  }).join('');

  return head + cards;
}

// --- interest inbox: pure render helpers (testable) ---------------------

// Friendly timestamp for an interest: relative for the last week, then an
// absolute PH date. Pure fn of (iso string, now Date) — `now` injectable
// so it's deterministic in tests.
function interestWhen(iso, now) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const ref = now instanceof Date ? now : new Date();
  const secs = Math.floor((ref - d) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return mins + ' min' + (mins === 1 ? '' : 's') + ' ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + ' hr' + (hrs === 1 ? '' : 's') + ' ago';
  const days = Math.floor(hrs / 24);
  if (days < 7) return days + ' day' + (days === 1 ? '' : 's') + ' ago';
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

// render the interest inbox as an HTML string. Pure fn of the rows array
// (PostgREST embedded select: each row has buyers{} + assets{} joined).
// No DOM, no globals — testable. Newest-first ordering is the caller's job.
function renderInterest(rows, now) {
  if (!rows || !rows.length) {
    return '<p class="empty muted">No interest yet. When a buyer taps “I’m interested” on their board, it lands here.</p>';
  }
  return rows.map((r) => {
    const a = r.assets || {};
    const b = r.buyers || {};
    const cat = a.category
      ? '<span class="int-cat">' + escapeHtml(a.category) + '</span>' : '';
    const contact = b.contact
      ? '<a class="int-contact" href="' + escapeHtml(contactHref(b.contact)) + '">' +
          escapeHtml(b.contact) + '</a>'
      : '<span class="int-contact muted">no contact on file</span>';
    const msg = (r.message && String(r.message).trim())
      ? escapeHtml(r.message) : '<span class="muted">—</span>';
    return (
      '<div class="int-card">' +
        '<div class="int-top">' +
          '<div class="int-asset">' + escapeHtml(a.name || 'Unknown asset') + cat + '</div>' +
          '<time class="int-when" datetime="' + escapeHtml(r.created_at || '') + '">' +
            escapeHtml(interestWhen(r.created_at, now)) + '</time>' +
        '</div>' +
        '<div class="int-buyer">' +
          '<span class="int-name">' + escapeHtml(b.name || 'Unknown buyer') + '</span>' +
          contact +
        '</div>' +
        '<div class="int-msg">' + msg + '</div>' +
      '</div>'
    );
  }).join('');
}

// best-effort actionable href for a buyer contact: mailto: for emails,
// tel: for anything that looks like a phone, else a bare tel:.
function contactHref(contact) {
  const c = String(contact || '').trim();
  if (/@/.test(c)) return 'mailto:' + c;
  return 'tel:' + c.replace(/[^\d+]/g, '');
}

// expose pure helpers for unit checks (no-op in normal browser use)
if (typeof window !== 'undefined') {
  window.__studio = {
    peso, monthsSince, statusDescriptor, computeStats, renderRegister,
    buildAssetWrite, todayStr, gearPath,
    buyerLink, buildBuyerWrite, renderBuyers, BOARD_BASE,
    interestWhen, renderInterest, contactHref,
  };
}

function show(which) {
  els.noconfig.hidden = which !== 'noconfig';
  els.auth.hidden     = which !== 'auth';
  els.app.hidden      = which !== 'app';
}

// --- config guard ------------------------------------------------------
const env = window.ENV;
if (!env || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
  console.error('[studio] window.ENV missing or incomplete — /env.js did not load.');
  show('noconfig');
} else {
  boot(env);
}

function boot(env) {
  let supabase;
  try {
    supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
    console.debug('[studio] Supabase client initialized:', env.SUPABASE_URL);
  } catch (e) {
    console.error('[studio] failed to init Supabase client:', e);
    show('noconfig');
    return;
  }

  // current studio URL, sans query/hash, for the magic-link redirect target
  const redirectTo = window.location.origin + window.location.pathname;

  function render(session) {
    if (session && session.user) {
      els.userEmail.textContent = session.user.email || '';
      show('app');
      loadRegister();
      loadBuyers();
      loadInterest();
    } else {
      show('auth');
    }
  }

  // fetch v_assets (RLS: authenticated/owner only) and paint the register
  async function loadRegister() {
    if (!els.register) return;
    try {
      const { data, error } = await supabase
        .from('v_assets')
        .select('*')
        .order('suggested_disposition', { ascending: false }) // 'sell' > 'keep'
        .order('book_value', { ascending: false });
      if (error) {
        console.error('[studio] v_assets query error:', error);
        els.register.innerHTML =
          '<p class="empty err">Could not load the register. ' +
          escapeHtml(error.message || '') + '</p>';
        return;
      }
      els.register.innerHTML = renderRegister(data || []);
    } catch (e) {
      console.error('[studio] loadRegister threw:', e);
      els.register.innerHTML =
        '<p class="empty err">Network error loading the register.</p>';
    }
  }

  // --- add / edit modal + disposition writes ---------------------------
  const modal = {
    root:    document.getElementById('assetModal'),
    form:    document.getElementById('assetForm'),
    title:   document.getElementById('assetModalTitle'),
    submit:  document.getElementById('assetSubmit'),
    msg:     document.getElementById('assetFormMsg'),
    status:  document.getElementById('f-status'),
    idle:    document.getElementById('f-idle'),
    idleWrap:document.getElementById('f-idle-wrap'),
    fileInput:document.getElementById('f-photos'),
    thumbs:  document.getElementById('photoThumbs'),
    addLabel:document.getElementById('photoAddLabel'),
    photoMsg:document.getElementById('photoMsg'),
  };

  // working copy of the open asset's photo URLs (ordered). Mutated by
  // upload/remove; written into the row on submit.
  let modalPhotos = [];

  function setPhotoMsg(text, kind) {
    if (!modal.photoMsg) return;
    modal.photoMsg.textContent = text || '';
    modal.photoMsg.style.color = kind === 'ok' ? 'var(--brandc)' : '';
  }

  function renderThumbs() {
    if (!modal.thumbs) return;
    modal.thumbs.innerHTML = modalPhotos.map((url, i) =>
      '<div class="photo-thumb">' +
        '<img src="' + escapeHtml(url) + '" alt="">' +
        '<button type="button" class="photo-thumb-x" data-rmphoto="' + i + '" ' +
          'aria-label="Remove photo">×</button>' +
      '</div>'
    ).join('');
  }

  // upload selected files to the gear bucket, append public URLs to modalPhotos
  async function handlePhotoFiles(files) {
    if (!files || !files.length) return;
    const assetId = String(modal.form.elements.id.value || '').trim() || null;
    modal.addLabel.classList.add('busy');
    setPhotoMsg('Uploading…', '');
    let uploaded = 0;
    for (const file of files) {
      if (!file.type || !file.type.startsWith('image/')) {
        setPhotoMsg('Skipped a non-image file.', 'err');
        continue;
      }
      const path = gearPath(assetId, file.name);
      try {
        const { error } = await supabase.storage.from('gear')
          .upload(path, file, { contentType: file.type, upsert: false });
        if (error) {
          console.error('[studio] photo upload error:', error);
          setPhotoMsg(error.message || 'Upload failed.', 'err');
          continue;
        }
        const { data } = supabase.storage.from('gear').getPublicUrl(path);
        if (data && data.publicUrl) { modalPhotos.push(data.publicUrl); uploaded++; }
      } catch (err) {
        console.error('[studio] photo upload threw:', err);
        setPhotoMsg('Network error during upload.', 'err');
      }
    }
    modal.addLabel.classList.remove('busy');
    modal.fileInput.value = '';
    renderThumbs();
    if (uploaded) setPhotoMsg(uploaded + ' photo' + (uploaded > 1 ? 's' : '') + ' added.', 'ok');
  }

  if (modal.fileInput) {
    modal.fileInput.addEventListener('change', (e) => {
      handlePhotoFiles(Array.from(e.target.files || []));
    });
  }

  // remove a photo: drop from the array and best-effort delete the object.
  if (modal.thumbs) {
    modal.thumbs.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-rmphoto]');
      if (!btn) return;
      const i = Number(btn.getAttribute('data-rmphoto'));
      const url = modalPhotos[i];
      modalPhotos.splice(i, 1);
      renderThumbs();
      setPhotoMsg('', '');
      // best-effort: strip the object (URL form: .../object/public/gear/<path>)
      const m = url && url.match(/\/object\/public\/gear\/(.+)$/);
      if (m) {
        supabase.storage.from('gear').remove([decodeURIComponent(m[1])])
          .catch((err) => console.warn('[studio] photo object remove failed:', err));
      }
    });
  }

  function setFormMsg(text, kind) {
    if (!modal.msg) return;
    modal.msg.textContent = text || '';
    modal.msg.className = 'msg' + (kind ? ' ' + kind : '');
  }

  function clearFieldErrors() {
    modal.form.querySelectorAll('.ferr').forEach((e) => { e.textContent = ''; });
    modal.form.querySelectorAll('.field.invalid').forEach((e) => e.classList.remove('invalid'));
  }

  function showFieldErrors(errors) {
    Object.keys(errors).forEach((k) => {
      const el = modal.form.querySelector('[data-err="' + k + '"]');
      if (el) {
        el.textContent = errors[k];
        const f = el.closest('.field');
        if (f) f.classList.add('invalid');
      }
    });
  }

  // reflect idle_since field visibility off the status select
  function syncIdleField() {
    const idle = modal.status.value === 'idle';
    modal.idleWrap.hidden = !idle;
    if (idle && !modal.idle.value) modal.idle.value = todayStr();
  }
  if (modal.status) modal.status.addEventListener('change', syncIdleField);

  function openModal(row) {
    clearFieldErrors();
    setFormMsg('', '');
    setPhotoMsg('', '');
    const f = modal.form;
    f.reset();
    modalPhotos = (row && Array.isArray(row.photos)) ? row.photos.slice() : [];
    renderThumbs();
    if (row) {
      modal.title.textContent = 'Edit asset';
      f.elements.id.value = row.id;
      f.elements.name.value = row.name || '';
      f.elements.category.value = row.category || '';
      f.elements.qty.value = row.qty != null ? row.qty : 1;
      f.elements.acquisition_cost.value = row.acquisition_cost != null ? row.acquisition_cost : '';
      f.elements.salvage_value.value = row.salvage_value != null ? row.salvage_value : 0;
      f.elements.useful_life_months.value = row.useful_life_months != null ? row.useful_life_months : 60;
      f.elements.acquired_on.value = row.acquired_on || '';
      f.elements.status.value = row.status === 'idle' ? 'idle' : 'in_service';
      f.elements.idle_since.value = row.idle_since || '';
      f.elements.notes.value = row.notes || '';
    } else {
      modal.title.textContent = 'Add asset';
      f.elements.id.value = '';
      f.elements.qty.value = 1;
      f.elements.salvage_value.value = 0;
      f.elements.useful_life_months.value = 60;
      f.elements.acquired_on.value = todayStr();
      f.elements.status.value = 'in_service';
    }
    syncIdleField();
    modal.root.hidden = false;
    document.body.classList.add('modal-open');
    f.elements.name.focus();
  }

  function closeModal() {
    modal.root.hidden = true;
    document.body.classList.remove('modal-open');
  }

  // close affordances (backdrop, Close/Cancel buttons, Esc)
  modal.root.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.root.hidden) closeModal();
  });

  // submit → validate (pure) → insert or update → reload
  modal.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldErrors();
    setFormMsg('', '');
    const fd = new FormData(modal.form);
    const input = Object.fromEntries(fd.entries());
    const { row, errors, ok } = buildAssetWrite(input);
    if (!ok) {
      showFieldErrors(errors);
      setFormMsg('Fix the highlighted fields.', 'err');
      return;
    }
    row.photos = modalPhotos.slice();
    modal.submit.disabled = true;
    setFormMsg('Saving…', '');
    const id = String(input.id || '').trim();
    try {
      const q = id
        ? supabase.from('assets').update(row).eq('id', id)
        : supabase.from('assets').insert(row);
      const { error } = await q;
      if (error) {
        console.error('[studio] asset write error:', error);
        setFormMsg(error.message || 'Could not save. Try again.', 'err');
        return;
      }
      closeModal();
      await loadRegister();
    } catch (err) {
      console.error('[studio] asset write threw:', err);
      setFormMsg('Network error. Try again.', 'err');
    } finally {
      modal.submit.disabled = false;
    }
  });

  // write a disposition override (or clear it), then reload
  async function writeDisposition(id, patch) {
    if (!id) return;
    try {
      const { error } = await supabase.from('assets').update(patch).eq('id', id);
      if (error) {
        console.error('[studio] disposition write error:', error);
        alert('Could not update disposition: ' + (error.message || 'unknown error'));
        return;
      }
      await loadRegister();
    } catch (err) {
      console.error('[studio] disposition write threw:', err);
      alert('Network error updating disposition.');
    }
  }

  // delegated clicks on the register: add, edit, keep/sell/clear
  if (els.register) {
    els.register.addEventListener('click', (e) => {
      if (e.target.closest('[data-add]')) { openModal(null); return; }

      const keepBtn = e.target.closest('[data-keep]');
      if (keepBtn) {
        e.stopPropagation();
        writeDisposition(keepBtn.getAttribute('data-keep'), { disposition: 'keep', asking_price: null });
        return;
      }
      const sellBtn = e.target.closest('[data-sell]');
      if (sellBtn) {
        e.stopPropagation();
        const raw = window.prompt('Asking price (₱) for this asset:', '');
        if (raw == null) return; // cancelled
        const price = Number(String(raw).replace(/[, ]/g, ''));
        if (!Number.isFinite(price) || price < 0) {
          alert('Enter a valid asking price (0 or more).');
          return;
        }
        writeDisposition(sellBtn.getAttribute('data-sell'), { disposition: 'sell', asking_price: price });
        return;
      }
      const clearBtn = e.target.closest('[data-clear]');
      if (clearBtn) {
        e.stopPropagation();
        writeDisposition(clearBtn.getAttribute('data-clear'), { disposition: null, asking_price: null });
        return;
      }

      // otherwise: a row click → edit that asset
      const tr = e.target.closest('tr[data-edit]');
      if (tr) editById(tr.getAttribute('data-edit'));
    });
    // keyboard: Enter/Space on a focused row opens edit
    els.register.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const tr = e.target.closest('tr[data-edit]');
      if (tr) { e.preventDefault(); editById(tr.getAttribute('data-edit')); }
    });
  }

  // open the edit modal for a given id (fetch the base row, not the view)
  async function editById(id) {
    if (!id) return;
    try {
      const { data, error } = await supabase
        .from('assets').select('*').eq('id', id).single();
      if (error || !data) {
        console.error('[studio] load asset for edit failed:', error);
        alert('Could not load that asset.');
        return;
      }
      openModal(data);
    } catch (err) {
      console.error('[studio] editById threw:', err);
      alert('Network error loading that asset.');
    }
  }

  // --- buyers: list, create, active toggle, copy, curate ----------------

  // fetch buyers + per-buyer curated-asset counts, then paint.
  async function loadBuyers() {
    if (!els.buyers) return;
    try {
      const [bRes, laRes] = await Promise.all([
        supabase.from('buyers').select('*').order('created_at', { ascending: true }),
        supabase.from('buyer_assets').select('buyer_id'),
      ]);
      if (bRes.error) {
        console.error('[studio] buyers query error:', bRes.error);
        els.buyers.innerHTML =
          '<p class="empty err">Could not load buyers. ' +
          escapeHtml(bRes.error.message || '') + '</p>';
        return;
      }
      const counts = {};
      (laRes.data || []).forEach((r) => {
        counts[r.buyer_id] = (counts[r.buyer_id] || 0) + 1;
      });
      els.buyers.innerHTML = renderBuyers(bRes.data || [], counts);
    } catch (e) {
      console.error('[studio] loadBuyers threw:', e);
      els.buyers.innerHTML = '<p class="empty err">Network error loading buyers.</p>';
    }
  }

  // --- interest inbox: which buyers want which gear --------------------

  // fetch interests with buyer + asset joined (newest first) and paint.
  // RLS: only the authenticated owner can SELECT interests; anon is blocked.
  async function loadInterest() {
    if (!els.interest) return;
    try {
      const { data, error } = await supabase
        .from('interests')
        .select('id, message, created_at, buyers(name, contact), assets(name, category)')
        .order('created_at', { ascending: false });
      if (error) {
        console.error('[studio] interests query error:', error);
        els.interest.innerHTML =
          '<p class="empty err">Could not load interest. ' +
          escapeHtml(error.message || '') + '</p>';
        return;
      }
      const rows = data || [];
      if (els.interestCount) {
        els.interestCount.textContent = rows.length ? String(rows.length) : '';
        els.interestCount.hidden = !rows.length;
      }
      els.interest.innerHTML = renderInterest(rows);
    } catch (e) {
      console.error('[studio] loadInterest threw:', e);
      els.interest.innerHTML = '<p class="empty err">Network error loading interest.</p>';
    }
  }

  // create a buyer via a quick prompt flow (name required, contact optional).
  async function addBuyer() {
    const name = window.prompt('Buyer name (company or person):', '');
    if (name == null) return; // cancelled
    const contact = window.prompt('Contact (phone / email) — optional:', '') || '';
    const { row, ok } = buildBuyerWrite({ name, contact });
    if (!ok) { alert('Name is required.'); return; }
    try {
      const { error } = await supabase.from('buyers').insert(row); // token auto-gen
      if (error) {
        console.error('[studio] buyer insert error:', error);
        alert('Could not create buyer: ' + (error.message || 'unknown error'));
        return;
      }
      await loadBuyers();
    } catch (e) {
      console.error('[studio] addBuyer threw:', e);
      alert('Network error creating buyer.');
    }
  }

  // flip buyers.active; an inactive buyer's link returns nothing.
  async function setBuyerActive(id, active) {
    try {
      const { error } = await supabase.from('buyers').update({ active }).eq('id', id);
      if (error) {
        console.error('[studio] buyer active write error:', error);
        alert('Could not update buyer: ' + (error.message || 'unknown error'));
      }
      await loadBuyers();
    } catch (e) {
      console.error('[studio] setBuyerActive threw:', e);
      alert('Network error updating buyer.');
      await loadBuyers();
    }
  }

  // copy a private link to the clipboard, with a transient "Copied" state.
  async function copyLink(btn, text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      // fallback for non-secure contexts
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (_) {}
      document.body.removeChild(ta);
    }
    const prev = btn.textContent;
    btn.textContent = 'Copied'; btn.classList.add('done');
    setTimeout(() => { btn.textContent = prev; btn.classList.remove('done'); }, 1400);
  }

  // delegated clicks on the buyers list
  if (els.buyers) {
    els.buyers.addEventListener('click', (e) => {
      if (e.target.closest('[data-buyer-add]')) { addBuyer(); return; }
      const copyBtn = e.target.closest('[data-copy]');
      if (copyBtn) { copyLink(copyBtn, copyBtn.getAttribute('data-copy')); return; }
      const curBtn = e.target.closest('[data-curate]');
      if (curBtn) { openCurate(curBtn.getAttribute('data-curate')); return; }
    });
    els.buyers.addEventListener('change', (e) => {
      const t = e.target.closest('[data-buyer-active]');
      if (t) setBuyerActive(t.getAttribute('data-buyer-active'), t.checked);
    });
  }

  // --- curate-assets modal ---------------------------------------------
  const curate = {
    root:  document.getElementById('curateModal'),
    list:  document.getElementById('curateList'),
    title: document.getElementById('curateModalTitle'),
  };
  let curateBuyerId = null;

  function closeCurate() {
    if (!curate.root) return;
    curate.root.hidden = true;
    document.body.classList.remove('modal-open');
    curateBuyerId = null;
    loadBuyers(); // refresh counts after editing
  }

  if (curate.root) {
    curate.root.addEventListener('click', (e) => {
      if (e.target.closest('[data-curate-close]')) closeCurate();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !curate.root.hidden) closeCurate();
    });
    // delegated checkbox writes
    curate.list.addEventListener('change', (e) => {
      const cb = e.target.closest('[data-asset]');
      if (cb) toggleBuyerAsset(cb.getAttribute('data-asset'), cb.checked, cb);
    });
  }

  // open the curate modal for a buyer: show Sell-flagged assets + which are linked.
  async function openCurate(buyerId) {
    if (!buyerId || !curate.root) return;
    curateBuyerId = buyerId;
    curate.list.innerHTML = '<p class="muted">Loading…</p>';
    curate.root.hidden = false;
    document.body.classList.add('modal-open');
    try {
      const [aRes, lRes] = await Promise.all([
        supabase.from('v_assets').select('*')
          .eq('suggested_disposition', 'sell')
          .order('book_value', { ascending: false }),
        supabase.from('buyer_assets').select('asset_id').eq('buyer_id', buyerId),
      ]);
      if (aRes.error || lRes.error) {
        console.error('[studio] curate load error:', aRes.error || lRes.error);
        curate.list.innerHTML = '<p class="empty err">Could not load gear.</p>';
        return;
      }
      const linked = new Set((lRes.data || []).map((r) => r.asset_id));
      const rows = aRes.data || [];
      if (!rows.length) {
        curate.list.innerHTML =
          '<p class="empty muted">No Sell-flagged gear yet. Flag assets as Sell in the register first.</p>';
        return;
      }
      curate.list.innerHTML = rows.map((r) => {
        const id = escapeHtml(r.id);
        const ask = (r.disposition === 'sell' && r.asking_price != null)
          ? '<span class="cr-ask">asking ' + peso(r.asking_price) + '</span>' : '';
        return (
          '<label class="curate-row">' +
            '<input type="checkbox" data-asset="' + id + '"' +
              (linked.has(r.id) ? ' checked' : '') + '>' +
            '<div>' +
              '<div class="cr-name">' + escapeHtml(r.name) + '</div>' +
              '<div class="cr-sub">' + peso(r.book_value) + ' book · ' +
                (Number(r.qty) || 0) + ' owned</div>' +
            '</div>' + ask +
          '</label>'
        );
      }).join('');
    } catch (e) {
      console.error('[studio] openCurate threw:', e);
      curate.list.innerHTML = '<p class="empty err">Network error loading gear.</p>';
    }
  }

  // check → insert a buyer_assets row; uncheck → delete it.
  async function toggleBuyerAsset(assetId, on, cb) {
    if (!curateBuyerId || !assetId) return;
    cb.disabled = true;
    try {
      const q = on
        ? supabase.from('buyer_assets').insert({ buyer_id: curateBuyerId, asset_id: assetId })
        : supabase.from('buyer_assets').delete()
            .eq('buyer_id', curateBuyerId).eq('asset_id', assetId);
      const { error } = await q;
      if (error) {
        console.error('[studio] buyer_assets write error:', error);
        alert('Could not save that change: ' + (error.message || 'unknown error'));
        cb.checked = !on; // revert UI
      }
    } catch (e) {
      console.error('[studio] toggleBuyerAsset threw:', e);
      alert('Network error saving that change.');
      cb.checked = !on;
    } finally {
      cb.disabled = false;
    }
  }

  function setMsg(text, kind) {
    els.authMsg.textContent = text || '';
    els.authMsg.className = 'msg' + (kind ? ' ' + kind : '');
  }

  // login submit
  els.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = els.email.value.trim();
    if (!email) { setMsg('Enter your email.', 'err'); return; }
    els.btn.disabled = true;
    setMsg('Sending…', '');
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) {
        setMsg(error.message || 'Could not send the link. Try again.', 'err');
      } else {
        setMsg('Check your email — we sent a sign-in link to ' + email + '.', 'ok');
      }
    } catch (err) {
      console.error('[studio] signInWithOtp threw:', err);
      setMsg('Network error. Check your connection and try again.', 'err');
    } finally {
      els.btn.disabled = false;
    }
  });

  // sign out
  els.signout.addEventListener('click', async () => {
    els.signout.disabled = true;
    try { await supabase.auth.signOut(); }
    catch (e) { console.error('[studio] signOut error:', e); }
    finally { els.signout.disabled = false; }
  });

  // initial gate + react to magic-link redirect landing / logout
  supabase.auth.getSession().then(({ data }) => render(data.session));
  supabase.auth.onAuthStateChange((_event, session) => {
    setMsg('', '');
    render(session);
  });
}
