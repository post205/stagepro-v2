// Tests for the buyer board client (r/board.js).
// Run: deno test r/board.test.js
// board.js is an ES module that auto-boots ONLY in a browser
// (it guards on `typeof window !== 'undefined' && typeof document`).
// Under Deno neither is defined, so importing it is side-effect-free
// and we can exercise the pure render helpers + the Turnstile wiring.
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { renderCards, peso, getTurnstileToken } from './board.js';

const ASSET = '11111111-1111-4111-8111-111111111111';

Deno.test('peso formats PH currency, null on non-numeric', () => {
  assertEquals(peso(1000), '₱1,000');
  assertEquals(peso(null), null);
  assertEquals(peso('abc'), null);
});

Deno.test('renderCards emits the asset id on the interest button', () => {
  const html = renderCards([
    { asset_id: ASSET, name: 'Moving heads', category: 'Lighting', qty: 4,
      asking_price: 50000, book_value: 80000, photos: [] },
  ]);
  // the click handler reads data-asset; it must carry the asset id, never a buyer id
  assertStringIncludes(html, `data-asset="${ASSET}"`);
  assertStringIncludes(html, 'I’m interested');
  assert(!html.includes('buyer_id'));
});

Deno.test('renderCards is pure on empty/garbage input', () => {
  assertEquals(renderCards([]), '');
  assertEquals(renderCards(null), '');
});

Deno.test('getTurnstileToken rejects when the Turnstile script is absent', async () => {
  // No global `turnstile`, no document → contract is to reject (caller
  // catches and shows a gentle inline error). Never throws synchronously.
  let rejected = false;
  try {
    await getTurnstileToken();
  } catch (e) {
    rejected = true;
    assertEquals(e instanceof Error, true);
  }
  assert(rejected, 'expected getTurnstileToken to reject without turnstile');
});
