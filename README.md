# KaamTrack

Surat textile owners send grey fabric to job workers for dyeing, printing and embroidery, then spend hours a day phoning to ask where each lot is. KaamTrack turns a photo of the paper challan into a tracked lot, and the job worker updates its status from a no-login link.

**MVP journey:** challan photo in → editable lot card → lot on the owner's board → job worker taps a status → board updates.

## How it works
```
Phone browser ──► Next.js on Vercel
                    ├─ /api/extract ──► Gemini via OpenRouter (reads the photo, returns 4 fields)   lib/ai.ts
                    └─ /api/lots    ──► Upstash Redis (one hash: token -> lot)                       lib/store.ts
```
- **AI does one job:** reading the challan photo (`lib/ai.ts`, `google/gemini-3.7-flash` through OpenRouter, pinned to Google). Everything else is plain rules in `lib/lots.ts`: checking fields, overdue, days out, the 4 allowed statuses and link tokens.
- **Staff always confirm.** Unclear fields are tagged, missing required fields turn red, and Save stays blocked until they're filled.
- **Status links** (`/s/<token>`) use a random 16-character token. No login and no app to install.
- **The WhatsApp message** is a `wa.me` link with the text pre-filled. No WhatsApp Business API.
- **Storage:** an earlier version saved lots to Google Sheets through n8n. That was replaced by Redis because the hosted n8n couldn't reach Google reliably. The old workflow is in git history.

## Run it
1. Copy `.env.example` to `.env.local` and fill in the values. Never commit `.env.local`.
2. Create the database: in Vercel, open your project → Storage → add **Upstash Redis**. Copy its REST URL and token into `.env.local`.
3. Run these:
   - `npm install`
   - `npm run dev`, then open http://localhost:3000

## Checks
- `npm test`: rule checks (cleaning AI output, required fields, overdue, statuses).
- `npm run eval`: runs the AI prompt on every photo in `test-challans/` against `expected.json`, printing field accuracy and seconds per photo.

## Out of scope for the MVP
WhatsApp Business API and auto nudges, voice notes, wastage norms, logins and roles, Gujarati UI, Tally/GST ITC-04.
