# StagePro — Handoff & Knowledge Transfer

Everything we learned working the StagePro deal, consolidated so the build can start from full context. Sources: owner meeting (2026-06-16), the Service Agreement we built (`post205-sign/sa/sp9k4mx2qv7w`, live at `sign.post205.com/sa/sp9k4mx2qv7w`), the rebuilt marketing site (this repo), and the original StagePro pitch decks (`~/Documents/new client projects/stagepro/`).

The SA is the single most important artifact: it doesn't just describe the product, it **demonstrates** it — a working, clickable back office in StagePro's look. When building any tier, open the SA and copy the flow that's already proven there.

---

## 1. Who StagePro is

- Philippine **event-production** company: staging, trusses, audio, lighting, LED video. Crew, logistics, full turnkey show, delivered anywhere in the country. Operating since 1998.
- Known and trusted for the production itself — planners and venues call them when the event has to land. **That reputation is real and intact.** The problem was never the work.
- Their site `stagepro.ph` went **dark when hosting lapsed**. Anyone searching them hit a dead link or nothing, and called a competitor. The front door was gone while the house was fine.

## 2. The owner's real pain (the wedge)

From the owner meeting on **2026-06-16** (he had not yet seen the SA):

His single biggest current struggle is **deferred / depreciating assets** — lights and sound equipment that lose value while sitting idle.

- Some gear he keeps in service because it still earns (e.g. LED screens) — those are fine.
- Certain simpler lighting/sound equipment is **idle and he needs to sell it off before it depreciates further.** Capital is quietly bleeding out the back.

What he wants:
1. **Inventory tagged by depreciation profile** — "keep / in-service" (durable, earning) vs "sell / liquidate" (fast-depreciating, idle).
2. **Depreciation tracking over time** — declining book value, age, sell-by.
3. **A private resale surface** — share a for-sale list to *specific* businesses, not a public marketplace. Curated "here's what's available," via unguessable private per-buyer links (the same trust pattern as POST205's SA pages).

**Framing rule:** sell this as *"stop capital bleeding out of idle gear,"* never as "inventory tracking." It's his money-losing problem, not a generic feature. This is the sharpest reason he'll say yes.

**Open idea:** offer the **resale board as a standalone add-on** so his most urgent pain isn't gated behind the top ₱480k Command tier. Worth raising when he reacts to the SA.

## 3. The product — four-tier ladder

Each higher tier includes everything below it. Start anywhere, move up, pay only for what the next tier adds. Build paid half-to-commence, half-on-completion before deploy; monthly care begins at deployment.

### Tier 1 — Online Again · free rebuild + ₱5,000/year
The lowest-risk yes. **Already done** — this repo is it.
- Rebuilt marketing site in their brand, on `stagepro.ph`, with SSL + monitoring.
- Found & shareable (SEO/AEO + OG) so search and AI assistants point to them.
- Site updates quoted per request (simple ones cheap).

### Tier 2 — Proposals · ₱120,000 build + ₱5,000/month
The proposal engine — fully demoed in the SA, try it there.
- **Self-serve admin / CMS** — they edit their own site copy (hero, services) with live preview + publish. No developer, no waiting.
- **Quote engine** — add line items (rate × qty × days); computes subtotal, **12% VAT**, total live.
- **Sends itself** to the client by email.
- Client **signs digitally** (type name, binding under RA 8792) **or prints to sign**; no app, no account.
- **Status tracking** — sent → viewed → accepted; nothing slips.
- **Downloadable, BIR-ready sales records** (CSV: net / 12% VAT / total) for their accountant — positioned for the incoming VAT-able + digital-invoice rules.
- Plus: email newsletter, on-site reviews, referral link with attribution.

### Tier 3 — Operations · ₱260,000 build + ₱12,000/month
The people side.
- Crew roster (roles, rates, skills, contact).
- Schedule crew to events with **double-booking detection** (the SA demo catches a tech double-booked across two same-day events).
- Crew mark their own availability.
- Per-event timesheets (hours in/out).
- **Payouts computed** from hours × rates, ready to release.
- Per-gig contracts + call sheets, sent and signed.

### Tier 4 — Command · ₱480,000 build + ₱22,000/month
The whole business — and the tier that solves the owner's pain.
- **Asset register** — every light, speaker, screen carries its **book value as it depreciates**; idle losing-value gear **tags itself to sell**. (SA demo shows MTD revenue, asset book value, ₱-flagged-to-sell, and a Keep/Sell register.)
- **Private resale board** — for-sale assets shared by **unguessable private link** to specific buyers, never listed publicly; asking price + interest button. (SA demo: `buyers.stagepro.ph/r/8fq2x`.)
- Gear booked against events, with maintenance/service logs per item.
- Client **CRM** — every lead, quote, event in one history.
- **Dashboard** — revenue, utilization, what wins, what sits idle.
- **Role-based access** — who sees the money vs just the schedule.

## 4. Architecture cues (from the SA demo)

- `stagepro.ph` — public marketing site (this repo).
- `studio.stagepro.ph` — back office / admin (`/proposals/new`, `/proposals`, `/site/edit`, `/crew/schedule`, `/command`).
- `stagepro.ph/p/<client-slug>` — the client-facing proposal/sign view.
- `buyers.stagepro.ph/r/<token>` — private resale board per buyer.
- Stack: Supabase (shared-pattern), Netlify functions for writes, Resend for email, Xendit for payments. Same back office our accounting clients already run weekly — proven, not speculative.

## 5. Commercial terms (locked in the SA)

- Ownership: on full payment of a build, client owns code, content, accounts, domain. Everything exportable as CSV anytime.
- Data: client is Personal Information Controller, POST205 the Processor under RA 10173.
- E-signature valid under RA 8792. Governed by Philippine law.
- **POST205 is NON-VAT** (TIN 009-064-713-000). When POST205 registers for VAT next year, **fees stay the same — POST205 absorbs the 12%.** This is a written promise in the SA; honor it.
- Pricing floor reminder: ₱80,000 is the lowest-ever one-time build. (All paid tiers here are well above it.)

## 6. Copy & positioning lessons (what worked)

- Lead with their **existing strength** ("you're known for the production — that stays true"), then name what we add. Let them conclude the value; don't oversell.
- Keep the money case **subtle** — one idea per sentence, the artifact does the selling.
- The depreciation/resale story is the emotional hook — it names a loss nobody else is tracking.
- The SA's structure that landed: **Situation map → Tier 1 already live (proof) → full ladder demoed → investment → before/after → FAQ → agreement → e-sign.** Reuse this spine for future SAs.

## 7. Status & open items

- ✅ Tier 1 site rebuilt and live (this repo).
- ✅ SA built and deployed at `sign.post205.com/sa/sp9k4mx2qv7w`.
- ⏳ **Owner has not yet been shown the SA.** Next commercial step.
- ⏳ Pending from StagePro: **real photos, business address, signatory name, real stat numbers** (site stats are honest placeholders — there's a line on the site saying so).
- 🔜 On signing: kickoff step #1 = registered name, TIN, EWT/2307 status.
- 🗑️ `stagepro-www` (older build) to be deleted later — not yet.

## 8. Reference assets

- SA repo: `~/Documents/2026/Claude/Projects/post205-sign/sa/sp9k4mx2qv7w/index.html`
- Original pitch decks: `~/Documents/new client projects/stagepro/` (StagePro-Digital-Proposal.pdf, StagePro-Digital-Transformation.pdf, pitch.pdf, golden-circle.jpg)
- AIOS memory: `stagepro-asset-depreciation-resale`, `sa-as-pitch-flagship`, `secure-public-form-submissions`, `found-shareable-feature`, `billing-details-before-closing`.
