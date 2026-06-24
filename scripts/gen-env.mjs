// Build step. Write env.js from environment variables so the Supabase keys
// never live in git. NO-OP if the required vars aren't set — local dev keeps
// an existing env.js, and the build never crashes on a missing var.
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join } from 'path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const URL_ = process.env.STAGEPRO_SUPABASE_URL;
const KEY = process.env.STAGEPRO_SUPABASE_ANON_KEY;
const TURNSTILE = process.env.TURNSTILE_SITEKEY;

if (!URL_ || !KEY) {
  console.log(
    'gen-env: STAGEPRO_SUPABASE_URL / STAGEPRO_SUPABASE_ANON_KEY not set — ' +
      'skipping env.js generation (keeping any existing file).'
  );
  process.exit(0);
}

const turnstileLine = TURNSTILE
  ? `\n  TURNSTILE_SITEKEY: ${JSON.stringify(TURNSTILE)},`
  : '';

const body = `// Generated at build from env vars. Do not edit. The anon key is the
// PUBLIC Supabase publishable key — safe in the browser; Row Level Security
// gates every table.
window.ENV = {
  SUPABASE_URL: ${JSON.stringify(URL_)},
  SUPABASE_ANON_KEY: ${JSON.stringify(KEY)},${turnstileLine}
};
`;

writeFileSync(join(ROOT, 'env.js'), body);
console.log('gen-env: wrote env.js');
