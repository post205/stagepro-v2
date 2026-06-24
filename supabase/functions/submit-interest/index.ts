// ════════════════════════════════════════════════════════════════
// submit-interest — the ONLY write path for buyer "Interest" rows on
// the StagePro resale board (project psomepfrpftynjojsuwx).
// ----------------------------------------------------------------
// The buyer board (/r/<token>, public) lets a buyer click "I'm
// interested" on a curated Sell asset. That click goes through HERE.
//
// Security pattern (POST205 secure-submission):
//   1. CORS / OPTIONS preflight; POST only.
//   2. Validate payload server-side (./validate.ts).
//   3. Verify Cloudflare Turnstile (TURNSTILE_SECRET).
//   4. RESOLVE the buyer from the board TOKEN server-side — NEVER trust
//      a client-supplied buyer id (the payload has none).
//   5. AUTHORIZE the asset: it must be in THIS buyer's curated Sell set
//      (board_by_token). This closes the cross-buyer / non-offered-asset
//      forge. No match → no row written.
//   6. Insert into `interests` with the ELEVATED key (bypasses RLS;
//      anon has no INSERT policy).
//   7. Fire-and-forget owner email via Resend. Email never breaks the
//      insert; if RESEND_API_KEY is unset/placeholder it no-ops.
//
// Function secrets (set via `supabase secrets set ... --project-ref …`):
//   TURNSTILE_SECRET     Cloudflare Turnstile secret (dev always-pass:
//                        1x0000000000000000000000000000000AA)
//   STAGEPRO_SERVICE_KEY (optional override) An elevated key used as
//                        apikey+Bearer. EMPIRICAL FINDING (2026-06-24):
//                        on THIS project's PostgREST the NEW-format
//                        sb_secret_… key is REJECTED ("Invalid API key",
//                        401), while the legacy auto-injected
//                        SUPABASE_SERVICE_ROLE_KEY authorizes inserts
//                        (201). So we DO NOT set this and fall back to
//                        the legacy key below. Kept as an override hook
//                        in case the project's key enforcement changes.
//   OWNER_NOTIFY_EMAIL   Where the interest notification is sent.
//   RESEND_API_KEY       (optional) Resend key; unset → email skipped.
//
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are auto-injected. No key is
// ever hardcoded — all read from env.
// ════════════════════════════════════════════════════════════════

import { validate } from './validate.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// Prefer the explicit new-format secret key; fall back to the legacy
// auto-injected one only if the explicit one is unset.
const SERVICE_KEY =
  Deno.env.get('STAGEPRO_SERVICE_KEY') ||
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  '';
const TS_SECRET = Deno.env.get('TURNSTILE_SECRET') || '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const OWNER_NOTIFY_EMAIL = Deno.env.get('OWNER_NOTIFY_EMAIL') || '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/** Headers for a PostgREST/RPC call with the elevated (service) key. */
function svcHeaders(extra: Record<string, string> = {}) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

interface BoardRow {
  buyer_name: string;
  asset_id: string;
  name: string;
  category: string | null;
  qty: number;
  asking_price: number | null;
  book_value: number | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  if (!SERVICE_KEY || !SUPABASE_URL) {
    console.error('server misconfig: missing SERVICE_KEY or SUPABASE_URL');
    return json(500, { error: 'Server not configured' });
  }
  if (!TS_SECRET) {
    console.error('server misconfig: missing TURNSTILE_SECRET');
    return json(500, { error: 'Server not configured' });
  }

  // ── Parse + validate ────────────────────────────────────────
  let raw: unknown;
  try {
    raw = await req.json();
  } catch (_) {
    return json(400, { error: 'Invalid JSON' });
  }
  const v = validate(raw);
  if (!v.ok) return json(400, { error: v.error });
  const { token, assetId, message, turnstileToken } = v.value;

  // ── 1. Verify Turnstile ─────────────────────────────────────
  const remoteip = (req.headers.get('x-forwarded-for') || '')
    .split(',')[0]
    .trim();
  try {
    const form = new FormData();
    form.append('secret', TS_SECRET);
    form.append('response', turnstileToken);
    if (remoteip) form.append('remoteip', remoteip);
    const verifyRes = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'POST', body: form },
    );
    const verify = await verifyRes.json();
    if (!verify.success) return json(400, { error: 'Verification failed' });
  } catch (_) {
    return json(400, { error: 'Verification error' });
  }

  // ── 2. Resolve buyer from token + authorize asset ───────────
  // board_by_token returns ONLY the active buyer's curated Sell assets.
  // It is the single source of truth for "is this asset offerable to
  // this token?" — one call resolves the buyer AND authorizes the asset.
  let rows: BoardRow[];
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/board_by_token`, {
      method: 'POST',
      headers: svcHeaders(),
      body: JSON.stringify({ p_token: token }),
    });
    if (!res.ok) {
      console.error('board_by_token failed', res.status, await res.text());
      return json(500, { error: 'Could not verify offer' });
    }
    rows = await res.json();
  } catch (err) {
    console.error('board_by_token error', err);
    return json(500, { error: 'Could not verify offer' });
  }

  // Empty → bad/inactive token. No offered asset matching assetId → forge.
  // Either way: neutral rejection, NO row written.
  if (!Array.isArray(rows) || rows.length === 0) {
    return json(403, { error: 'Not available' });
  }
  const match = rows.find((r) => r.asset_id === assetId);
  if (!match) {
    return json(403, { error: 'Not available' });
  }

  // We need the resolved buyer_id for the insert. board_by_token returns
  // buyer_name but not id; resolve the id from the token with the
  // elevated key (RLS-bypassing). The token already proved valid above.
  let buyerId: string | null = null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/buyers?select=id&active=eq.true&token=eq.${
        encodeURIComponent(token)
      }`,
      { headers: svcHeaders() },
    );
    if (res.ok) {
      const b = await res.json();
      buyerId = Array.isArray(b) && b[0] ? b[0].id : null;
    } else {
      console.error('buyer lookup failed', res.status, await res.text());
    }
  } catch (err) {
    console.error('buyer lookup error', err);
  }
  if (!buyerId) return json(403, { error: 'Not available' });

  // ── 3. Insert interest with the elevated key ────────────────
  let interestId: string | null = null;
  try {
    const ins = await fetch(`${SUPABASE_URL}/rest/v1/interests`, {
      method: 'POST',
      headers: svcHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify({ buyer_id: buyerId, asset_id: assetId, message }),
    });
    if (!ins.ok) {
      console.error('insert failed', ins.status, await ins.text());
      return json(500, { error: 'Could not save interest' });
    }
    const out = await ins.json();
    interestId = Array.isArray(out) && out[0] ? out[0].id : null;
  } catch (err) {
    console.error('insert error', err);
    return json(500, { error: 'Could not save interest' });
  }

  // ── 4. Owner notification email (fire-and-forget) ───────────
  // Never block or fail the insert on email. If Resend is not provisioned
  // (key unset or a placeholder), skip gracefully and log.
  const resendUsable =
    !!RESEND_API_KEY &&
    RESEND_API_KEY.startsWith('re_') &&
    !!OWNER_NOTIFY_EMAIL;
  if (resendUsable) {
    const subject =
      `StagePro: ${match.buyer_name} is interested in ${match.name}`;
    const lines = [
      `Buyer: ${match.buyer_name}`,
      `Asset: ${match.name}${match.category ? ` (${match.category})` : ''}`,
      `Qty: ${match.qty}`,
      match.asking_price != null ? `Asking: ₱${match.asking_price}` : '',
      `Message: ${message || '(none)'}`,
      '',
      `Interest id: ${interestId}`,
    ].filter(Boolean);
    try {
      // fire-and-forget — do not await the network round-trip's effect on the response
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'StagePro Resale <notify@post205.com>',
          to: [OWNER_NOTIFY_EMAIL],
          subject,
          text: lines.join('\n'),
        }),
      }).catch((e) => console.error('resend send error', e));
    } catch (e) {
      console.error('resend invoke error', e);
    }
  } else {
    console.log(
      'owner email skipped (RESEND_API_KEY unset/placeholder or no OWNER_NOTIFY_EMAIL)',
    );
  }

  return json(200, { id: interestId });
});
