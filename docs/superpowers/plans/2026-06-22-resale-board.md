# StagePro Resale Board — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a standalone, working private resale board — an owner-facing asset register that flags idle depreciating gear to sell, plus per-buyer tokenized links that show a curated for-sale list with an Interest button — as a pre-signing closer seeded with StagePro's real idle gear.

**Architecture:** A dedicated `stagepro` Supabase project holds the data. This repo grows two new static surfaces beside the existing marketing site: an owner-authenticated admin (`/studio/`, Supabase Auth magic-link) for the asset register, and a public tokenized buyer view (`/r/`) that reads one buyer's curated list. The owner edits the register while logged in (writes gated by RLS on `auth.uid()`); the public buyer's only write — the Interest button — goes through a Turnstile-verified edge function with the service role, the canonical POST205 secure-submission pattern. Current book value is never stored; a SQL view derives it from cost/age so it's always live.

**Tech Stack:** Supabase (Postgres + Auth + Edge Functions/Deno), Netlify (static host + build), Resend (owner notification email), Cloudflare Turnstile (bot gate on the public Interest write), vanilla HTML/CSS/JS + Tailwind CDN (matches the existing site).

---

## Locked architecture decisions

These are decided with rationale; flag before executing if any is wrong.

1. **Dedicated `stagepro` Supabase project**, NOT the shared `supabase-post205` project (that one is POST205's own internal back office). Reason: SA ownership terms — client owns accounts/data on full payment; tenant isolation.
2. **Single repo, three surfaces, one Netlify deploy.** `/` (marketing, exists), `/studio/` (owner admin), `/r/` (buyer board). The `studio.stagepro.ph` / `buyers.stagepro.ph` subdomains from the SA are mapped at deploy via Netlify domain aliases + redirects — built path-based first, aliased later. Reason: lowest friction; relative-asset, host-agnostic deploy already in place.
3. **Owner auth = Supabase Auth magic-link**, single owner account. Reason: no password to manage; net-new (no prior POST205 admin surface to copy).
4. **Two write paths, by trust level.** Owner admin CRUD = authenticated client writes gated by RLS (`auth.uid() = owner`). Public buyer Interest = Turnstile + edge function + service role, mirroring `piandre-www` `submit-booking`. Reason: don't put Turnstile friction on the logged-in owner; do gate the one public write.
5. **Book value is derived, never stored.** A `v_assets` view computes current book value + monthly depreciation from `acquisition_cost`, `salvage_value`, `useful_life_months`, `acquired_on`, and current date (straight-line). Reason: always current, no cron to age values.

## Testing approach (adaptation)

These static + edge-function repos have **no JS test runner** (confirmed: piandre-www ships vanilla JS, no test harness). Forcing a framework is YAGNI. So:
- **Edge-function validation logic** (payload checks, token gate) → Deno unit tests (`deno test`), real red-green.
- **Postgres logic** (depreciation view, RLS, auto-flag) → SQL assertion queries run via the Supabase MCP / SQL editor, with stated expected rows.
- **HTML/JS surfaces** → explicit manual verification checklists + curl smoke tests against the deployed function. No fabricated unit tests for DOM glue.

Each task names its verification kind. Where it's "run this SQL / curl, expect X," that IS the test.

---

## File structure

**Create:**
- `db/0001_resale_schema.sql` — assets, buyers, buyer_assets, interests tables + `v_assets` view + RLS.
- `db/0002_resale_audit.sql` — assertion queries proving no anon read/write path (no cutover needed; `interests` is net-new, single-writer).
- `supabase/functions/submit-interest/index.ts` — Turnstile-verified buyer Interest write + owner email.
- `supabase/functions/_shared/cors.ts` — shared CORS/json helpers (extracted house style).
- `scripts/gen-env.mjs` — emit `env.js` from Netlify env (adapted from piandre-www).
- `studio/index.html` — owner admin: login + asset register table (Keep/Sell, book value, flag).
- `studio/studio.js` — admin logic: auth, CRUD, render register from `v_assets`.
- `studio/studio.css` — admin styling (StagePro dark brand tokens).
- `r/index.html` — buyer board: reads `?t=<token>`, renders curated Sell list + Interest button.
- `r/board.js` — board logic: load buyer list, submit Interest via edge function.
- `docs/RESALE.md` — runbook: project setup, env vars, deploy, data-load, cutover.

**Modify:**
- `netlify.toml` — add build command (`node scripts/gen-env.mjs`), redirects for `/studio` and `/r/:token`.
- `.gitignore` — ensure `env.js` ignored.

---

## PHASE 0 — Foundation

Outcome: a `stagepro` Supabase project exists, the schema is applied, the owner can log into an empty `/studio/` shell. Demoable: "I can log in; nothing in it yet."

### Task 0.1: Create the dedicated Supabase project (manual, Toffer)

**Files:** none (infra).

- [ ] **Step 1: Create project.** In the Supabase dashboard under the POST205 org, create a new project named `stagepro` (region: Singapore, closest to PH). NOT a branch of post205 — a separate project. Record its ref + URL.
- [ ] **Step 2: Capture keys.** From Project Settings → API, record the project URL, the anon (publishable) key, and keep the service-role key for function secrets only (never in git).
- [ ] **Step 3: Record in runbook.** Write the ref/URL into `docs/RESALE.md` (create it) under "Project."

Verification: `mcp__supabase-post205` is the wrong project for this work — confirm the new project ref differs before any migration is applied to it.

> NOTE FOR EXECUTOR: the connected Supabase MCP points at the post205 internal project. Do not apply these migrations there. Migrations target the new `stagepro` ref — via its own MCP connection, the Supabase CLI, or the dashboard SQL editor. If you cannot target the new ref, STOP and surface to Toffer.

### Task 0.2: Schema migration

**Files:**
- Create: `db/0001_resale_schema.sql`

- [ ] **Step 1: Write the migration.** Full SQL:

```sql
-- StagePro resale board — core schema. Apply to the `stagepro` project ONLY.
-- Single-owner model: every owner-write is gated by auth.uid() = the owner.

create extension if not exists "pgcrypto";

-- ── assets: the gear register ────────────────────────────────────────────────
create table public.assets (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,                      -- "Moving heads, Gen-1"
  category          text,                               -- lighting | audio | video | staging
  qty               int  not null default 1,
  acquisition_cost  numeric(12,2) not null,             -- per-lot total, PHP
  salvage_value     numeric(12,2) not null default 0,
  useful_life_months int not null default 60,           -- straight-line horizon
  acquired_on       date not null,
  status            text not null default 'in_service'  -- in_service | idle
                    check (status in ('in_service','idle')),
  idle_since        date,                                -- set when status -> idle
  disposition       text                                 -- keep | sell  (owner override)
                    check (disposition in ('keep','sell')),
  asking_price      numeric(12,2),                       -- set when listed to sell
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── buyers: who gets a private link ─────────────────────────────────────────
create table public.buyers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                            -- "Acme Rentals"
  contact     text,                                     -- email/phone for follow-up
  token       text not null unique
              default encode(gen_random_bytes(9), 'hex'),-- unguessable /r/<token>
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ── buyer_assets: which assets a given buyer may see (curated, per-buyer) ────
create table public.buyer_assets (
  buyer_id  uuid not null references public.buyers(id) on delete cascade,
  asset_id  uuid not null references public.assets(id) on delete cascade,
  primary key (buyer_id, asset_id)
);

-- ── interests: a buyer clicked "I'm interested" (the only public write) ──────
create table public.interests (
  id          uuid primary key default gen_random_uuid(),
  buyer_id    uuid not null references public.buyers(id) on delete cascade,
  asset_id    uuid not null references public.assets(id) on delete cascade,
  message     text,
  created_at  timestamptz not null default now()
);

-- updated_at touch
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger trg_assets_touch before update on public.assets
  for each row execute function public.touch_updated_at();
```

- [ ] **Step 2: Apply** to the `stagepro` project (CLI `supabase db push` or dashboard SQL editor — NOT the post205 MCP).
- [ ] **Step 3: Verify.** Run `select count(*) from assets;` → expect `0`. `\d assets` shows the columns above.
- [ ] **Step 4: Commit.** `git add db/0001_resale_schema.sql && git commit -m "feat(resale): core schema — assets, buyers, buyer_assets, interests"`

### Task 0.3: Derived book-value view + auto-flag

**Files:**
- Create: append to `db/0001_resale_schema.sql` (or `db/0001b_view.sql`)

- [ ] **Step 1: Write the view.** Straight-line current book value, monthly depreciation, and a suggested disposition. `security_invoker = true` (PG15+) makes the view respect the *querying* role's RLS — without it the view runs as its owner and bypasses the base-table RLS, leaking the whole register to anon. Partial months are floored (a 29-month-20-day asset reports 29); book value steps once per whole month — a deliberate simplification.

```sql
-- Current book value derived live from age. Straight-line to salvage_value.
-- security_invoker => the view obeys the caller's RLS, not the owner's.
create or replace view public.v_assets with (security_invoker = true) as
select
  a.*,
  -- whole months elapsed since acquisition
  greatest(0, (date_part('year',  age(current_date, a.acquired_on)) * 12
             + date_part('month', age(current_date, a.acquired_on)))::int) as age_months,
  -- monthly straight-line depreciation
  round((a.acquisition_cost - a.salvage_value) / nullif(a.useful_life_months,0), 2) as monthly_depreciation,
  -- current book value, floored at salvage
  greatest(
    a.salvage_value,
    round(a.acquisition_cost
      - (a.acquisition_cost - a.salvage_value)
        * least(1.0, (date_part('year',  age(current_date, a.acquired_on)) * 12
                    + date_part('month', age(current_date, a.acquired_on)))
                     / nullif(a.useful_life_months,0)), 2)
  ) as book_value,
  -- system suggestion: idle 3+ months and still above salvage => suggest sell
  case
    when a.disposition is not null then a.disposition          -- owner override wins
    when a.status = 'idle'
     and a.idle_since is not null
     and a.idle_since <= (current_date - interval '3 months')
    then 'sell'
    else 'keep'
  end as suggested_disposition
from public.assets a;
```

- [ ] **Step 2: Apply** to `stagepro`. Then `revoke select on public.v_assets from anon;` (belt-and-suspenders alongside `security_invoker`).
- [ ] **Step 3: Verify (SQL assertion).** Insert one fixture and check the math:

```sql
insert into assets (name, qty, acquisition_cost, salvage_value, useful_life_months, acquired_on, status, idle_since)
values ('TEST moving heads', 12, 240000, 0, 60, current_date - interval '30 months', 'idle', current_date - interval '6 months');
select name, age_months, monthly_depreciation, book_value, suggested_disposition from v_assets where name like 'TEST%';
-- EXPECT ~ age_months=30, monthly_depreciation=4000.00, book_value=120000.00, suggested_disposition='sell'
delete from assets where name like 'TEST%';
```

- [ ] **Step 3b: Verify (negative, SQL).** With the **anon** key/role: `select * from v_assets` → 0 rows / permission denied. This is the test that the register isn't readable through the view. Must pass before Phase 2.

- [ ] **Step 4: Commit.** `git commit -am "feat(resale): v_assets view — live book value + sell suggestion"`

### Task 0.4: RLS — owner writes, no public reads on register

**Files:**
- Create: append to migration `db/0001_resale_schema.sql`

- [ ] **Step 1: Write policies.** Owner = any authenticated user (single-owner project; lock to a specific uid in Step 3 hardening if desired):

```sql
alter table public.assets       enable row level security;
alter table public.buyers       enable row level security;
alter table public.buyer_assets enable row level security;
alter table public.interests    enable row level security;

-- Owner (authenticated) has full control of the register.
create policy owner_all_assets       on public.assets       for all to authenticated using (true) with check (true);
create policy owner_all_buyers       on public.buyers       for all to authenticated using (true) with check (true);
create policy owner_all_buyer_assets on public.buyer_assets for all to authenticated using (true) with check (true);
create policy owner_read_interests   on public.interests    for select to authenticated using (true);

-- Public (anon) can read NOTHING here directly. Buyer board reads go through a
-- SECURITY DEFINER function keyed by token (Task 2.1); interests are written
-- ONLY by the submit-interest edge function with the service role (bypasses RLS).
-- NO anon policy at all. Unlike the piandre shared-table case, `interests` is
-- net-new with a single writer (the edge fn), so there is never a legacy anon
-- writer to coordinate — and no open direct-REST hole during the demo window.
```

- [ ] **Step 2: Apply** to `stagepro`.
- [ ] **Step 3: Verify.** With the anon key: `select * from assets` → blocked; `insert into interests(...)` → **fails** (no anon policy — correct; the edge function is the only writer). Authenticated owner can read/write the register.
- [ ] **Step 4: Commit.** `git commit -am "feat(resale): RLS — owner-only register, interests written by edge fn only"`

### Task 0.5: Build wiring — env.js from Netlify

**Files:**
- Create: `scripts/gen-env.mjs` (adapt from `piandre-www/scripts/gen-env.mjs`)
- Modify: `netlify.toml`, `.gitignore`

- [ ] **Step 1: Adapt gen-env.mjs.** Emit `window.ENV` with `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and (when set) `TURNSTILE_SITEKEY`. Env var names: `STAGEPRO_SUPABASE_URL`, `STAGEPRO_SUPABASE_ANON_KEY`, `TURNSTILE_SITEKEY`. No-op when unset (keeps existing env.js).
- [ ] **Step 2: Wire netlify.toml.** Add:

```toml
[build]
  publish = "."
  command = "node scripts/gen-env.mjs"
```

- [ ] **Step 3: gitignore.** Confirm `env.js` is ignored; add `env.example` with the three var names.
- [ ] **Step 4: Verify.** `STAGEPRO_SUPABASE_URL=x STAGEPRO_SUPABASE_ANON_KEY=y node scripts/gen-env.mjs` writes `env.js` with `window.ENV`. Unset → no-op message.
- [ ] **Step 5: Commit.** `git commit -m "build(resale): gen-env.mjs + netlify build wiring"`

### Task 0.6: Owner login shell (`/studio/`)

**Files:**
- Create: `studio/index.html`, `studio/studio.js`, `studio/studio.css`

- [ ] **Step 1: Build the shell.** `studio/index.html` loads `env.js`, the Supabase JS client (CDN), `studio.css`, `studio.js`. Two states: (a) logged-out → email field + "Send magic link" (`supabase.auth.signInWithOtp`); (b) logged-in → empty "Asset register" container + sign-out. Brand tokens from CLAUDE.md (ink/surface/brand). Mobile: 16px inputs, `overflow-x: clip`.
- [ ] **Step 2: Auth gate.** On load, `supabase.auth.getSession()` → render the right state; `onAuthStateChange` re-renders. Add the studio email to Supabase Auth → URL allow-list for the magic-link redirect.
- [ ] **Step 3: Verify (manual).** Deploy preview (or `netlify dev`). Visit `/studio/`, request a link with the owner email, click it, land logged-in, see the empty register, sign out. Wrong email gets no access.
- [ ] **Step 4: Commit.** `git commit -m "feat(studio): magic-link login shell"`

**PHASE 0 CHECKPOINT:** owner logs into an empty register. Stop, review, demo.

---

## PHASE 1 — Asset register (owner-facing)

Outcome: owner sees every asset with live book value and a Keep/Sell flag; idle 3+ month gear surfaces itself to Sell; owner can add/edit/override. Demoable on its own — this alone is the "stop capital bleeding" picture.

### Task 1.1: Render the register from `v_assets`

**Files:** Modify `studio/studio.js`, `studio/studio.css`

- [ ] **Step 1:** Query `v_assets` ordered by `suggested_disposition desc, book_value desc`. Render the SA's three-column shape — Asset (name + "qty owned · idle N mo / earning") · Book value (₱) · Disposition (Keep/Sell pill, Sell = amber). Show the header stat row: Asset book value (Σ book_value), Flagged to sell (Σ book_value where suggested='sell'), monthly bleed (Σ monthly_depreciation where suggested='sell').
- [ ] **Step 2: Verify (manual).** Seed 5 rows matching the SA demo via SQL; confirm the table + stats match the SA's `₱2.84M / ₱174k flagged / ~₱9k/mo` shape (numbers will differ with real fixtures — assert the computation, not the exact figure).
- [ ] **Step 3: Commit.** `git commit -m "feat(studio): render asset register + bleed stats from v_assets"`

### Task 1.2: Add / edit asset

**Files:** Modify `studio/studio.js`, `studio/index.html`

- [ ] **Step 1:** Add-asset form (name, category, qty, acquisition_cost, salvage, useful_life_months, acquired_on, status, idle_since) → `supabase.from('assets').insert(...)`. Row click → edit (update). On status→idle, default `idle_since` to today.
- [ ] **Step 2: Verify (manual).** Add an idle item dated 30 months back; it appears flagged Sell with correct book value. Edit it back to in_service; flag clears.
- [ ] **Step 3: Commit.** `git commit -m "feat(studio): add/edit asset"`

### Task 1.3: Disposition override + asking price

**Files:** Modify `studio/studio.js`

- [ ] **Step 1:** Per-row Keep/Sell toggle writes `disposition` (override wins over suggestion per the view). When set to Sell, prompt for `asking_price`.
- [ ] **Step 2: Verify (manual).** Override an earning item to Sell → pill flips, asking price saved. Clear override → reverts to suggestion.
- [ ] **Step 3: Commit.** `git commit -m "feat(studio): disposition override + asking price"`

**PHASE 1 CHECKPOINT:** working register with live depreciation + Sell flags. Demoable as the standalone closer's first half. Stop, review.

---

## PHASE 2 — Private resale board (the buyer-facing closer)

Outcome: owner creates a buyer, picks which Sell assets that buyer sees, gets an unguessable `/r/<token>` link; the buyer opens it, sees a curated list + asking prices, clicks Interest; owner is emailed and sees it in studio.

### Task 2.1: Tokenized read function (buyer sees only their list)

**Files:** Modify `db/0001_resale_schema.sql`

- [ ] **Step 1:** `SECURITY DEFINER` function so the public can read one buyer's curated list by token without any anon SELECT on base tables:

```sql
create or replace function public.board_by_token(p_token text)
returns table (buyer_name text, asset_id uuid, name text, category text,
               qty int, asking_price numeric, book_value numeric)
language sql security definer set search_path = public as $$
  select b.name, a.id, a.name, a.category, a.qty, a.asking_price, va.book_value
  from buyers b
  join buyer_assets ba on ba.buyer_id = b.id
  join assets a on a.id = ba.asset_id
  join v_assets va on va.id = a.id
  where b.token = p_token and b.active
    and coalesce(a.disposition, 'keep') = 'sell';
$$;
grant execute on function public.board_by_token(text) to anon;
```

- [ ] **Step 2: Verify (SQL).** Create a buyer + link two Sell assets; `select * from board_by_token('<token>')` returns exactly those two. A bad token returns 0 rows. Keep-flagged assets never appear.
- [ ] **Step 3: Commit.** `git commit -m "feat(resale): board_by_token security-definer read"`

### Task 2.2: Buyer management in studio

**Files:** Modify `studio/studio.js`, `studio/index.html`

- [ ] **Step 1:** "Buyers" section — create buyer (name, contact), see their `/r/<token>` link (copyable), toggle which Sell assets they can view (`buyer_assets`), active toggle. Mirror the SA line "🔗 buyers.stagepro.ph/r/8fq2x · 3 buyers can view".
- [ ] **Step 2: Verify (manual).** Create a buyer, assign assets, copy the link. Deactivate → link should later 404/empty (verified in 2.3).
- [ ] **Step 3: Commit.** `git commit -m "feat(studio): buyer management + per-buyer asset curation"`

### Task 2.3: Buyer board page (`/r/`)

**Files:** Create `r/index.html`, `r/board.js`; modify `netlify.toml`

- [ ] **Step 1:** `/r/?t=<token>` (and pretty `/r/<token>` via a Netlify redirect to `?t=`). `board.js` calls `supabase.rpc('board_by_token', { p_token })`, renders the curated list (StagePro dark brand, gear name · qty · asking price) + an Interest button per item and a "I'm interested in these" overall CTA. Empty/invalid token → a neutral "This link isn't active" card.
- [ ] **Step 2: Netlify redirect.**

```toml
[[redirects]]
  from = "/r/:token"
  to   = "/r/index.html?t=:token"
  status = 200
```

- [ ] **Step 3: Verify (manual).** Open the real token link → see exactly the curated Sell items + prices. Open a junk token → "not active." Deactivated buyer → "not active."
- [ ] **Step 4: Commit.** `git commit -m "feat(board): tokenized buyer view"`

### Task 2.4: Interest write — Turnstile edge function (canonical secure pattern)

**Files:** Create `supabase/functions/_shared/cors.ts`, `supabase/functions/submit-interest/index.ts`

- [ ] **Step 1: Write a Deno test first** (`supabase/functions/submit-interest/validate.test.ts`) for the payload validator: rejects missing `turnstileToken`, missing/empty `token`, missing/!uuid `assetId`, caps `message` length; accepts a valid payload. Factor the validator into `validate.ts` so it's unit-testable without HTTP. **Note the trust boundary: the payload carries the buyer's `token`, NEVER a client-supplied `buyerId`.**
- [ ] **Step 2: Run it, expect FAIL.** `deno test supabase/functions/submit-interest/` → fails (no `validate.ts`).
- [ ] **Step 3: Implement** `validate.ts` + `index.ts`, mirroring `piandre-www` `submit-booking`: CORS/OPTIONS, verify Turnstile via siteverify (pass `remoteip`), validate, then **resolve the buyer server-side from the `token`** (`select id from buyers where token = $1 and active`) — reject if not found. Then **confirm `(resolved buyer_id, assetId)` is actually in `buyer_assets`** and the asset is `disposition = 'sell'` — reject otherwise. Only then insert into `interests` with the service role using the *resolved* `buyer_id`. Fire-and-forget a Resend email to the owner ("Acme Rentals is interested in Moving heads Gen-1"). Return `{ id }`. This closes the cross-buyer forge: a buyer can only ever express interest as themselves, in assets actually offered to them.
- [ ] **Step 4: Run the test, expect PASS.** `deno test supabase/functions/submit-interest/`.
- [ ] **Step 5: Deploy + secrets.** `supabase functions deploy submit-interest --project-ref <stagepro-ref>`; set `TURNSTILE_SECRET` (dev: `1x0000000000000000000000000000000AA`) and `RESEND_API_KEY` / `OWNER_NOTIFY_EMAIL`.
- [ ] **Step 6: Verify (curl smoke + negative forge test).** POST a valid payload (`{ token, assetId, message, turnstileToken }`) with the Turnstile test token → `{ id }`, a row in `interests` with the *resolved* buyer_id, an email to the owner. POST with no Turnstile token → `400`. **Forge test:** POST a valid buyer `token` but an `assetId` NOT in that buyer's `buyer_assets` → rejected (`400/403`), no row written. This is the C2 regression test.
- [ ] **Step 7: Commit.** `git commit -m "feat(resale): submit-interest edge function + owner email"`

### Task 2.5: Wire the board Interest button to the function

**Files:** Modify `r/board.js`, `r/index.html`

- [ ] **Step 1:** Add the invisible Turnstile widget (render-on-demand, per the secure-submission doc). The board already holds the buyer's `token` (from the URL). On Interest click: get Turnstile token → `supabase.functions.invoke('submit-interest', { body: { token, assetId, message, turnstileToken } })` → success state ("StagePro will reach out"). **No `buyerId` is ever sent from the client.** Feature-flagged on `window.ENV.TURNSTILE_SITEKEY` like piandre-www.
- [ ] **Step 2: Verify (manual, end-to-end).** Open a real buyer link, click Interest → owner gets the email + sees it in studio (Task 2.6). Confirm a direct anon `insert into interests` is **rejected** (no anon policy — the function is the only write path).
- [ ] **Step 3: Commit.** `git commit -m "feat(board): Interest button via secure submit-interest"`

### Task 2.6: Interest inbox in studio

**Files:** Modify `studio/studio.js`, `studio/index.html`

- [ ] **Step 1:** "Interest" section — list `interests` joined to buyer + asset, newest first, with buyer contact for follow-up.
- [ ] **Step 2: Verify (manual).** The Interest from 2.5 shows here.
- [ ] **Step 3: Commit.** `git commit -m "feat(studio): interest inbox"`

**PHASE 2 CHECKPOINT:** full closer works end-to-end on seed data. Stop, review, demo to Toffer.

---

## PHASE 3 — Hardening, data load, cutover

### Task 3.1: Secure-write audit (no cutover needed)

Unlike the piandre *shared-table* case, `interests` is net-new with a single writer (the edge function), so there is no anon policy to revoke and no multi-writer coordination — the hole was never opened (Task 0.4). This task is a final audit, not a cutover.

**Files:** Create `db/0002_resale_audit.sql` (the assertion queries, for the record)

- [ ] **Step 1: Assert no anon write path.** Query `pg_policies` + `role_table_grants` for `interests` → confirm anon/authenticated have NO INSERT policy and no table-level INSERT grant. The service role (function) is the only writer.
- [ ] **Step 2: Assert no anon read path on the register.** Confirm anon cannot `select` `assets` or `v_assets`; the only anon-reachable surface is `board_by_token` (execute-granted) and `submit-interest`.
- [ ] **Step 3: Commit.** `git commit -m "chore(resale): secure-write audit assertions"`

### Task 3.2: Real-data load (the close)

- [ ] **Step 1:** With the owner's real idle-gear list (name, qty, acquisition cost, acquired date, idle-since), insert real `assets` rows; delete seed fixtures.
- [ ] **Step 2:** Create the real first buyer(s), curate their Sell lists, generate the live `/r/<token>` link to hand over.
- [ ] **Step 3: Verify** the register stats now reflect his real capital-at-risk; the board shows real gear + asking prices.

> This task is the pre-signing closer's payload and depends on Toffer obtaining the real list from the owner — framed as "what are you sitting on," never "let's inventory your gear" (HANDOFF framing rule). The build (Phases 0–2) does NOT block on it; it runs on seed data and hot-swaps here.

### Task 3.3: Subdomain aliases + Found-and-shareable

- [ ] **Step 1:** Map `studio.stagepro.ph` and `buyers.stagepro.ph` (Netlify domain aliases + redirects) so URLs match the SA demo.
- [ ] **Step 2:** The buyer board must NOT be crawlable. A meta `noindex` alone won't stop a crawler that fetches the page, so layer it: (a) `<meta name="robots" content="noindex,nofollow">` on `/r/index.html`; (b) a Netlify header `X-Robots-Tag: noindex, nofollow` for `/r/*`; (c) a `robots.txt` `Disallow: /r/` that does NOT list any token. The marketing site keeps its normal Found-and-shareable OG/SEO.

```toml
[[headers]]
  for = "/r/*"
  [headers.values]
    X-Robots-Tag = "noindex, nofollow"
```

- [ ] **Step 3: Commit.**

---

## Open items for Toffer (decide before / during execution)

1. **Supabase project creation** (Task 0.1) is a manual account action — the connected MCP is the wrong (post205) project. Confirm you'll create `stagepro` or want me to walk it.
2. **Real Turnstile + Resend keys** for StagePro's domain (dev keys carry the build to the cutover).
3. **The owner's real idle-gear list** (Task 3.2) — the close's fuel; chase it in parallel with the build.
4. **noindex on `/r/`** assumed (private board). Confirm.
5. **Single-owner RLS** uses "any authenticated user." If StagePro staff get logins later, harden to a specific `auth.uid()` / role.

---

## Execution handoff

Recommended: **subagent-driven** (fresh subagent per task, review between). Phase boundaries are natural checkpoints. Phase 0 Task 0.1 (project creation) must be resolved by a human before any migration runs.
