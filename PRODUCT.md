# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Owner** of a Surat textile business who sends grey fabric to 5–15 outside job workers for dyeing, printing and embroidery. Today they spend about 2 hours a day phoning job workers to ask for status. Their job is to know where every lot is, see which are late, and decide whom to chase.
- **Godown staff** who write the paper challan and photograph it at dispatch. They use budget Android phones in a noisy, bright godown, often one-handed while handling fabric.
- **Job workers** (dyeing, printing and embroidery units) who open a lot link from WhatsApp on their own Android phone and tap a status. Many read only basic English, and some barely read at all.

## Product Purpose
KaamTrack gives every fabric lot a record from dispatch to return, so status comes to the owner instead of the owner chasing it. The MVP proves one journey: challan photo in → editable lot card → tracked lot on the board → job worker taps a status from a no-login link → board updates. Success means the owner reads status on one board instead of phoning.

## Positioning
It starts from the paper challan the trade already writes, so nobody does extra data entry: a photo becomes the record. Job workers update with one tap from a WhatsApp link, with no app, login or training.

## Operating Context
- Paper challan books (lot, metres or thaan, job worker, process), handwritten in Gujarati, Hindi or English, with fields in any order.
- Goods leave by tempo. The owner coordinates over phone and WhatsApp, and Tally is used for accounting.
- The owner sends each lot link through a pre-filled WhatsApp message (`wa.me`). There is no WhatsApp Business API.
- The owner reviews the board each morning and decides whom to call, chase or replace.

## Capabilities and Constraints
- **AI reads challans.** One AI step reads the challan photo into four fields: job worker, process, quantity with unit (metres/thaan) and promised date. It uses `google/gemini-3.7-flash` via OpenRouter, pinned to Google infrastructure, with the key in env only. Everything else is plain rules.
- **Staff always confirm.** Unclear fields are flagged, missing required fields block saving, and staff can always type the lot in by hand.
- **Job worker statuses:** Received, In process, Ready, Dispatched. A new lot starts as Sent.
- **Overdue rule:** a lot is overdue when its promised date (India time) has passed and its status isn't Dispatched.
- **Storage:** lots live in a Google Sheet through n8n Cloud webhooks. Photos are not stored.
- **Stack:** Next.js on Vercel.
- **Out of scope for the MVP:** logins and roles, WhatsApp Business API and nudges, voice notes, wastage norms, Gujarati UI localisation, Tally/GST ITC-04.
- **Deadline:** the MVP demo is Thu 22 Oct 2026, 12:30 PM.

## Brand Commitments
The name is **KaamTrack**. The UI copy is English. No logo or visual identity exists yet.

## Evidence on Hand
- The scope doc "KaamTrack – MVP Scope" (21 Oct 2026). It cites the founder's estimate of 2 hours a day spent chasing, plus an Apify lead list of 154 Surat job work units.
- One founder quote about delays, QC issues and short returns.
- Synthetic test challans are in `test-challans/`. The 10 real challan photos are still to come.
- **Missing:** direct owner quotes and measured time savings. Don't invent customers, testimonials or metrics.

## Product Principles
1. **The paper challan is the source.** Capture from what already exists, and never add a step to dispatch.
2. **Never guess silently.** Unclear AI output is shown as unclear, and a human confirms before anything is saved.
3. **One tap for job workers.** No login, no install, no reading required to update a status.
4. **Status comes to the owner.** The board answers "what's late and with whom" at a glance.

## Accessibility & Inclusion
- Budget Android phones in bright light, used one-handed: large tap targets, high contrast, and no hover-only interactions.
- Job workers may barely read. Each status needs a distinct icon and colour as well as the word, so meaning never depends on text alone (or on colour alone).
