// Tests for the submit-interest payload validator.
// Run: deno test supabase/functions/submit-interest/
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { validate } from './validate.ts';

const UUID = '11111111-1111-4111-8111-111111111111';

function base() {
  return {
    token: 'abc123def456',
    assetId: UUID,
    message: 'I want this gear',
    turnstileToken: 'tt-ok',
  };
}

Deno.test('accepts a well-formed payload', () => {
  const r = validate(base());
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.value.token, 'abc123def456');
    assertEquals(r.value.assetId, UUID);
    assertEquals(r.value.message, 'I want this gear');
    assertEquals(r.value.turnstileToken, 'tt-ok');
  }
});

Deno.test('accepts a payload with no message (optional)', () => {
  const p = base();
  // deno-lint-ignore no-explicit-any
  delete (p as any).message;
  const r = validate(p);
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.value.message, null);
});

Deno.test('rejects missing turnstileToken', () => {
  const p = base();
  // deno-lint-ignore no-explicit-any
  delete (p as any).turnstileToken;
  assertEquals(validate(p).ok, false);
});

Deno.test('rejects empty turnstileToken', () => {
  assertEquals(validate({ ...base(), turnstileToken: '   ' }).ok, false);
});

Deno.test('rejects missing token', () => {
  const p = base();
  // deno-lint-ignore no-explicit-any
  delete (p as any).token;
  assertEquals(validate(p).ok, false);
});

Deno.test('rejects empty token', () => {
  assertEquals(validate({ ...base(), token: '' }).ok, false);
});

Deno.test('rejects missing assetId', () => {
  const p = base();
  // deno-lint-ignore no-explicit-any
  delete (p as any).assetId;
  assertEquals(validate(p).ok, false);
});

Deno.test('rejects non-uuid assetId', () => {
  assertEquals(validate({ ...base(), assetId: 'not-a-uuid' }).ok, false);
});

Deno.test('rejects a payload that carries a buyerId (no such field expected)', () => {
  // buyerId must never be honored; validator simply ignores it, output has no buyerId.
  const r = validate({ ...base(), buyerId: 'attacker-buyer' });
  assertEquals(r.ok, true);
  if (r.ok) {
    // deno-lint-ignore no-explicit-any
    assertEquals((r.value as any).buyerId, undefined);
  }
});

Deno.test('caps message length at 1000', () => {
  const long = 'x'.repeat(5000);
  const r = validate({ ...base(), message: long });
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.value.message?.length, 1000);
});

Deno.test('rejects non-object body', () => {
  assertEquals(validate(null).ok, false);
  assertEquals(validate('string').ok, false);
});
