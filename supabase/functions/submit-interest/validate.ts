// Server-side payload validator for submit-interest.
// CRITICAL: the payload carries a board `token` (resolves to a buyer server-side)
// and an `assetId`. It MUST NOT carry/honor any client-supplied buyer id — the
// buyer is resolved from the token in index.ts, never trusted from the client.

export const MESSAGE_MAX = 1000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface InterestPayload {
  token: string;
  assetId: string;
  message: string | null;
  turnstileToken: string;
}

export type ValidateResult =
  | { ok: true; value: InterestPayload }
  | { ok: false; error: string };

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export function validate(body: unknown): ValidateResult {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'Invalid body' };
  }
  const b = body as Record<string, unknown>;

  const turnstileToken = str(b.turnstileToken);
  if (!turnstileToken) return { ok: false, error: 'Missing verification token' };

  const token = str(b.token);
  if (!token) return { ok: false, error: 'Missing token' };

  const assetId = str(b.assetId);
  if (!assetId || !UUID_RE.test(assetId)) {
    return { ok: false, error: 'Valid assetId required' };
  }

  // message is optional; cap its length. Empty -> null.
  const rawMsg = str(b.message);
  const message = rawMsg ? rawMsg.slice(0, MESSAGE_MAX) : null;

  // NOTE: any client-supplied buyerId is intentionally dropped here.
  return { ok: true, value: { token, assetId, message, turnstileToken } };
}
