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
    return (
      '<tr data-edit="' + id + '" tabindex="0" role="button" ' +
        'aria-label="Edit ' + escapeHtml(r.name) + '">' +
        '<td class="c-asset">' +
          '<div class="a-name">' + escapeHtml(r.name) + '</div>' +
          '<div class="a-sub">' + (Number(r.qty) || 0) + ' owned · ' +
            escapeHtml(statusDescriptor(r)) + '</div>' +
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

// expose pure helpers for unit checks (no-op in normal browser use)
if (typeof window !== 'undefined') {
  window.__studio = {
    peso, monthsSince, statusDescriptor, computeStats, renderRegister,
    buildAssetWrite, todayStr,
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
  };

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
    const f = modal.form;
    f.reset();
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
