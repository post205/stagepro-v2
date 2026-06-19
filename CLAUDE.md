# StagePro — v2

The live build for **StagePro, Inc.** — a Philippine event-production company (staging, trusses, audio, lighting, LED video; nationwide; since 1998). This repo (`stagepro-v2`) is the **active** build. The older `stagepro-www` is superseded and will be deleted later — do not work in it.

> Full context, the product blueprint, pricing, and what we learned closing this deal: **read [`HANDOFF.md`](HANDOFF.md) before building.**

## What this is right now

A single-page, dark cinematic **marketing site** (`index.html`, vanilla HTML/CSS + Tailwind CDN). "Three Acts" interactive hero (Sound = real audio/analyser EQ, Light = cursor-driven chiaroscuro, Stage = build-reveal), five-systems grid, work gallery, industries, why-us, and a **form-chat** contact flow (conversational + persistent CTA dock/mobile bar). This is **Tier 1 — "Online Again"** of the product ladder.

The original `stagepro.ph` went dark when hosting lapsed. We rebuilt it free as the wedge. It's the site embedded live inside the Service Agreement.

## The product (where this is going)

A four-tier ladder, each tier including the one below. The Service Agreement at `sign.post205.com/sa/sp9k4mx2qv7w` is the **product spec** — it demos every tier as a working back office. Don't re-derive scope; mine the SA.

1. **Online Again** — this site. Free rebuild + ₱5,000/yr hosting.
2. **Proposals** — ₱120k + ₱5k/mo. Proposal/quote engine, e-sign, CSV records, self-serve CMS.
3. **Operations** — ₱260k + ₱12k/mo. Crew roster, scheduling, payouts.
4. **Command** — ₱480k + ₱22k/mo. Asset register + **private resale board** (the owner's real pain), CRM, dashboard.

Subdomain plan from the SA demo: `stagepro.ph` (site), `studio.stagepro.ph` (admin/back office), `buyers.stagepro.ph/r/<token>` (resale board).

## Brand

Dark. `ink #06080c` / `surface #10151e` / `brand #2e8bf0` (blue) / `brandc #7cc0ff` / `amber #f5b81f` / `mute #8b97a8`. Display type **Space Grotesk** (Monument-style). Monochrome restraint — let one accent and the imagery carry it. Logo assets in `assets/`.

## Stack & house rules

- POST205 stack: Claude Code + Netlify + Supabase + Xendit + Resend.
- **Secure public forms** (chat/booking): Turnstile + edge-function write + revoked anon INSERT. Never client-only guards. Pattern: `piandre-www/docs/SECURE-SUBMISSION.md`.
- **Found & Shareable** (SEO/AEO + OG) ships by default on every build.
- **Mobile**: 16px inputs, `overflow-x: clip`, `dvh`. Reference: `01bigfight`.
- PH copy uses **American spelling** (enroll, color). The current site has some British spellings ("labour") carried from the old copy — fix on next pass.

## Billing (first kickoff step when signed)

Ask registered name, TIN, EWT/2307 status before anything else. POST205 is **NON-VAT**, TIN **009-064-713-000**. When POST205 registers for VAT next year, fees stay the same — we absorb the 12%, not pass it on (this promise is in the SA).

## Status / still pending from StagePro

- Owner has **not yet been shown the SA**.
- Need from them: **real photos, business address, signatory name, real stat numbers** (site stats are placeholders).
- Repo deploys host-agnostic (relative asset paths, `netlify.toml`).
