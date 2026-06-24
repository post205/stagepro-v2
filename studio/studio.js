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
  if (!rows || !rows.length) {
    return '<p class="empty muted">No assets yet.</p>';
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
    return (
      '<tr>' +
        '<td class="c-asset">' +
          '<div class="a-name">' + escapeHtml(r.name) + '</div>' +
          '<div class="a-sub">' + (Number(r.qty) || 0) + ' owned · ' +
            escapeHtml(statusDescriptor(r)) + '</div>' +
        '</td>' +
        '<td class="c-book">' + peso(r.book_value) + '</td>' +
        '<td class="c-disp">' +
          '<span class="pill ' + (sell ? 'sell' : 'keep') + '">' +
            (sell ? 'Sell' : 'Keep') + '</span>' +
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

  return stats + table;
}

// expose pure helpers for unit checks (no-op in normal browser use)
if (typeof window !== 'undefined') {
  window.__studio = { peso, monthsSince, statusDescriptor, computeStats, renderRegister };
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
