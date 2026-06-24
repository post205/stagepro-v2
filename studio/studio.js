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
};

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
    } else {
      show('auth');
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
