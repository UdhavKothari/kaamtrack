# KaamTrack

Surat textile owners send grey fabric to job workers for dyeing, printing and embroidery, then spend hours a day phoning to ask where each lot is. KaamTrack turns a photo of the paper challan into a tracked lot, and the job worker updates its status from a no-login link.

**The journey:** challan photo in → editable lot card → lot on the owner's board → job worker taps a status → board updates.

Live: https://kaamtrack-khaki.vercel.app

## What it does
- **Snap a challan.** The AI (`google/gemini-3.7-flash` through OpenRouter, pinned to Google) reads it into a lot card. Unclear fields are tagged, missing required fields turn red, and nothing is guessed. Staff always confirm before saving.
- **A WhatsApp number per lot**, required, remembered per job worker name. The browser never receives numbers except on an owner's own Edit screen.
- **Status links.** Each lot has a secret `/s/<token>` link: four buttons (Received, In process, Ready, Dispatched), no login, no app.
- **The board, phone first.** A tracking chart of every stage (lots and metres), compact cards that open with a tap, a Filter sheet (status and company / facility), search by facility, job worker or fabric quality, a Snap / Type bar at the bottom, and Dispatched lots tucked into an Archive after 7 days.
- **Company / facility and fabric quality** are fields on every lot. Quantity can be metres or **lots (1 lot = 1200 m)**; old "thaan" lots still show.
- **Remarks and voice notes.** On the status link a job worker can type a remark or record a voice note (Gujarati, Hindi or English). Gemini turns the voice note into text, a one-line English summary, a problem flag and any new date mentioned; it shows on the lot's card. It never changes the status or promised date by itself. Costs one AI call per voice note; limited to 20 notes per hour per IP.
- **Edit and delete** a lot (owner side). Edit keeps the link, status and history. Delete is permanent, with a confirm.
- **Challan photo kept** with the lot (a ~1100px JPEG, stored in Redis) so it can be checked against the paper.
- **Free WhatsApp links:** Send on WhatsApp (status link) and Nudge on WhatsApp (reminder text) open WhatsApp with the message typed in. No Meta account needed.
- **Sign in with Google** for the owner side. Admins are set in Vercel (`OWNER_EMAILS`); an admin adds or removes other Google accounts on the **Settings** page. Everyone shares the one board. Job worker links stay open, no account needed.
- **Optional WhatsApp automation** (off by default): a simulator and a Meta Cloud API path for replies and reminders. See [WhatsApp automation](#whatsapp-automation-optional-off-by-default).

## How it works
```
Phone browser ──► Next.js on Vercel
                    ├─ /api/extract ──► Gemini via OpenRouter (reads the photo)      lib/ai.ts
                    └─ /api/lots/*  ──► Upstash Redis (lots, photos, worker numbers)  lib/store.ts
```
Plain rules (validation, overdue, filters, phones, edit) live in `lib/lots.ts`, with tests in `tests/`. The AI does one job only: reading the challan.

## Run it
1. Copy `.env.example` to `.env.local` and fill it in. Never commit `.env.local`.
2. Database: in Vercel, add **Upstash Redis** to the project (Storage tab); copy its REST URL and token into `.env.local`.
3. `npm install`, then `npm run dev` and open http://localhost:3000.

## Checks
| Command | What it does |
|---|---|
| `npm test` | Rule tests (cleaning AI output, phones, overdue, filters, edit, passcode paths, reply logic, webhook signature). |
| `npx tsc --noEmit` | Type check (run `npx next typegen` first after adding routes). |
| `npm run smoke -- <url>` | Replays the live checks against a running copy (save, board, status tap, edit, nudge, photo, delete). Cleans up its own lots. With sign-in on, set `GOOGLE_CLIENT_SECRET` and `OWNER_EMAILS` in the shell (same values as Vercel) so the script can make its own session. |
| `npm run eval` | Runs the AI prompt on `test-challans/` against `expected.json` (accuracy and seconds per photo). |

GitHub Actions (`.github/workflows/ci.yml`) runs types, tests and a production build on every push.

## Settings (environment variables)
| Name | Needed? | What it is |
|---|---|---|
| `GEMINI_API_KEY` | one of these two | Reads challans and voice notes straight from Google's Gemini API (preferred: faster, no OpenRouter minimum balance). |
| `OPENROUTER_API_KEY` | one of these two | Used only when `GEMINI_API_KEY` is not set. OpenRouter refuses audio and files below a $0.50 balance. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | yes | Redis (added by Vercel's Upstash integration; `UPSTASH_REDIS_REST_*` also works). |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | yes on the live site | Google sign-in (a Web OAuth client in Google Cloud). Redirect URI: `https://<site>/api/auth/google/callback`. The secret also signs session cookies. |
| `OWNER_EMAILS` | yes on the live site | Comma-separated admin Google accounts. Admins always get in and manage the Settings list. Without all three, the live site refuses the owner side; local runs stay open. |
| `WHATSAPP_MODE` | no | `off` (default), `mock`, or `meta`. |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_TEMPLATE`, `WHATSAPP_LANG` | only for `meta` | Meta Cloud API. |
| `CRON_SECRET` | only for `meta`/`mock` | Lets Vercel's daily job (`vercel.json`) call `/api/cron/remind`. |

## Runbook
- **Rotate a key:** change it in Vercel → Settings → Environment Variables, then redeploy (env changes apply to new deployments only).
- **Who can sign in:** admins = `OWNER_EMAILS` in Vercel (redeploy after changing). Everyone else: Settings page, takes effect within a minute. Sign-in is at `/login`.
- **Preview deployments** are behind Vercel's login and use their own Redis keys (`kaamtrack-preview:*`), so testing never touches real lots.
- **Photo storage:** one small JPEG per lot, about 100-300 KB, in Redis. Upstash's free plan has 256 MB, so roughly a thousand lots. Delete a lot and its photo goes too.
- **Redis free limits:** 500k commands a month. The board reads once every 10 s per open tab while visible.
- **Old lots without a number** can't use Nudge; open them with Edit and add one.

## WhatsApp automation (optional, off by default)
Set `WHATSAPP_MODE=mock` to see a **simulated** conversation per lot (Send reminder now, the job worker's replies "1-4" or words like "ho gaya", the app's answers, delivery ticks) with nothing leaving the app. `/whatsapp` explains the whole flow.
For real WhatsApp: set `WHATSAPP_MODE=meta` with the Meta keys, point Meta's webhook at `/api/whatsapp/webhook`, and get the reminder text (`REMINDER_TEMPLATE` in `lib/lots.ts`) approved as a utility template. The test number only reaches up to 5 phones you add; utility templates are free inside the 24-hour window a job worker opens by messaging first.

## Not built yet
Return and shortage entry, a job worker scorecard, Gujarati/Hindi screens, ITC-04 export, several lots on one challan, multiple owners and roles.
