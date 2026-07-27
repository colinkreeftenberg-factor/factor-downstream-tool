# Lane dashboard

Next.js replacement for the Google Sheets lane dashboard. No individual
Google sign-in — anyone with the link uses the shared service account to
read/write the sheets, same as how the Apps Script tool works today.

Reads/writes "Factor Extra Source" directly (create/update lanes), and
reads "Current Week" read-only to also show the DACH Logs lanes produced
by the existing WA Liste Apps Script sync — that script keeps running
exactly as it does today, untouched.

## What's here

- **Verden Lane Manager** — page title and heading
- **Two tabs**: "Lanes" (the dashboard) and "Email" (placeholder — "this
  module will be enabled later" — ready for when the email tool gets built)
- **Today** section: lanes whose Date falls on today
- **All lanes** section: everything, FACTOR_ + DACH together, deduplicated,
  **sorted by Date**
- **Summary stat strip** with the **"Check & notify Slack" button (with the
  Slack logo) on the far right of the same row**
- Auto-refreshes every 3 minutes, plus manual Refresh
- **Global search box only** — the old per-column filter row (dropdowns +
  text inputs under each header) was removed since the search box covers it
- **No more row background coloring.** Instead, each courier gets a named,
  soft-colored badge (`lib/carrierColors.js` — NordFrost, Wesemann, LIT,
  BlueWater, Wegner, Bremer, Girteka each have a fixed color; anyone else
  gets a neutral gray badge automatically)
- Flags — badges only: *Delayed* (planned vs actual dispatch discrepancy
  only), *Dispatching soon* (blue), *Missing info*, *Stale*
- CSV export, print daily sheet
- Click a Load Reference to open the detail popup — colored sections for
  Arrival/Dispatch/Trailer & driver/Bay & loaders/Condition/Loading, plus a
  **"Request Slack update" button** (Factor lanes only) for one-off "please
  update me" pings that aren't tied to any automated condition
- New lane form with Week/Day/Courier dropdowns
- FACTOR_ badge dark Carbon/white text, DACH neutral
- Factor brand palette, Plus Jakarta Sans, wordmark in header

## Notifications (Slack)

Three ways to trigger a Slack message now:
1. **"Check & notify Slack"** button in the stat strip — runs the three
   automated checks (missing reg, truck status, dispatching soon) on demand
2. **Cron**, every 5 minutes once deployed (respects dedup markers)
3. **"Request Slack update"** button in a lane's detail popup — a plain
   ad-hoc ping for that specific lane, no condition needed

All three need `SLACK_WEBHOOK_URL` set (see below) or they just show
"Not configured" instead of failing silently.

1. **Create a Slack Incoming Webhook** for whichever channel you want
   alerts in: [api.slack.com/messaging/webhooks](https://api.slack.com/messaging/webhooks)
   (self-serve Slack app setting, shouldn't need admin approval the way
   the OAuth client did). Paste the URL into `SLACK_WEBHOOK_URL` in
   `.env.local` (and in Vercel's env vars once deployed).
2. **Add three empty columns** to the Factor Extra Source sheet, exactly
   named: `Notified Missing Reg`, `Notified Truck Status`, `Notified
   Dispatch Soon`. These are dedup markers for the *cron* run only — the
   manual button ignores them on purpose, so clicking it always does a
   real check regardless of what's already been sent.

Set `CRON_SECRET` (any random string) in both `.env.local` and Vercel's
env vars so the cron endpoint can't be triggered by anyone who finds the
URL. The manual button's endpoint (`/api/notify-manual`) has no secret —
it's meant to be clickable by anyone using the dashboard.

If Slack isn't the right channel, the checks live in `lib/notify.js` and
`lib/dateUtils.js` — only `postToSlack()` would need to change.

## Not in here

- Email sending — dropped per your last steer, not needed
- Auto-archiving and the WA Liste German-file sync stay in Apps Script

## Setup

### 1. Service account

Reuse the one your error-monitoring dashboard already uses.

- Share the **Factor Extra Source** sheet with it as **Editor**
- Share the **Current Week** master sheet with it as **Viewer**
- Share whichever sheet has the **"links" tab** with it as **Viewer**
  (probably the same as Current Week — see assumption below)

### 2. Environment variables

```bash
cp .env.example .env.local
```

Fill in `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
from your service account's JSON key file. The sheet IDs are pre-filled
from your scripts.

### 3. Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000` — no sign-in screen, straight to the dashboard.

### 4. Deploy to Vercel

**Push to GitHub first** (Vercel deploys from a git repo):
```bash
git init
git add .
git commit -m "Initial lane dashboard"
```
Create a new repo on GitHub (via github.com, "New repository" — leave it
empty, no README), then:
```bash
git remote add origin https://github.com/YOUR_USERNAME/lane-dashboard.git
git branch -M main
git push -u origin main
```

**Import into Vercel:**
1. Go to [vercel.com](https://vercel.com), sign in (GitHub login is easiest)
2. "Add New" → "Project" → select the `lane-dashboard` repo
3. Framework preset should auto-detect as Next.js — leave defaults
4. Before clicking Deploy, expand **Environment Variables** and add every
   variable from your `.env.local` (paste them in one at a time, or use
   the "paste .env" bulk option if Vercel's UI offers it) — **except**
   `NEXTAUTH_URL` and anything OAuth-related, which no longer exist in
   this version
5. Click **Deploy**

**After the first deploy:**
- Vercel gives you a URL like `lane-dashboard-yourname.vercel.app` — that's
  the link to share with your Verden DC colleagues
- If you set `SLACK_WEBHOOK_URL` and `CRON_SECRET`, the cron job in
  `vercel.json` starts running automatically every 5 minutes
- **Check your Vercel plan's cron limits** — some plans restrict how
  frequently cron jobs can run (free/Hobby tiers have historically limited
  this to once a day rather than every 5 minutes). If the 5-minute
  schedule gets silently downgraded, the "Check & notify Slack" button
  still works on-demand regardless of plan, so that's the reliable
  fallback either way
- Any time you push a new commit to `main`, Vercel redeploys automatically

**No login gate, so:**
- Don't post the URL anywhere public
- Consider Vercel's Password Protection feature (Project Settings →
  Deployment Protection — available on paid plans) as a lightweight extra
  layer if you want one

## Making further changes

Since I don't retain files between separate conversations, the most
reliable way to get changes made later is: **zip the whole project folder
and upload the zip** (skip `node_modules` and your real `.env.local` — the
`.env.example` template is enough context, and you shouldn't upload your
actual secrets). That gives me your exact current state, including any
manual tweaks you've made (like the courier column letter, if you changed
it).

```bash
cd ~/Downloads/lane-dashboard
zip -r ../lane-dashboard-current.zip . -x "node_modules/*" -x ".env.local" -x ".next/*"
```
Upload the resulting `lane-dashboard-current.zip`.

If it's a small, self-contained tweak (adjust a color, change a label,
tweak a threshold), just describing it in plain language is usually
enough without any file — I can generally tell which file that lives in
from this project's structure. Useful ones to know by name if you want to
be specific:

| File | What it controls |
|---|---|
| `lib/columns.js` | Every field name/label, and the detail popup's section groupings |
| `lib/dateUtils.js` | Delayed/soon/missing-info/stale logic and thresholds |
| `components/LaneTable.jsx` | The summary table, filters, badges, carrier tinting |
| `components/LaneDetailModal.jsx` | The lane detail popup layout |
| `components/LaneForm.jsx` | New-lane form and quick single-field edit |
| `pages/index.js` | Overall page layout, stat strip, search, export/print buttons |
| `pages/api/lanes/index.js` | How lanes are read from Sheets (dedup, courier fallback) |
| `lib/notify.js` | Slack notification conditions and message text |
| `styles/globals.css` | Colors, fonts, spacing — the brand styling |

## Still-empty courier?

If Courier still shows blank for Factor lanes after this update, the
column-letter guess (`FACTOR_COURIER_COL=F`) is probably wrong for your
actual sheet. To find the real answer:

1. Open your browser's dev tools → Network tab, reload the dashboard,
   click the `lanes` request, and look at the `factorHeaders` array in the
   response — that's every real header on your Factor sheet, in order.
2. Count to whichever one holds the courier name, convert that position to
   a letter (A=1st, B=2nd, C=3rd...), and set `FACTOR_COURIER_COL` in
   `.env.local` to that letter.
3. If the header itself just needs a rename (e.g. it's actually called
   something like "Transport Company"), simpler still: add that exact
   string to `COURIER_HEADER_CANDIDATES` in `pages/api/lanes/index.js`.

## Things I guessed at — please verify

- **Column headers**: `lib/columns.js` has every field name in one place.
  I matched them to your exact wording (`Load Reference`, `Carrier`,
  `Time  Loaded (Finish time) ` with its odd double-space, etc.) but you
  should check this against your real sheet headers before trusting the
  data — Sheets matching is on literal header text.
- **"links" tab location**: I assumed it's in the master "Current Week"
  workbook. If it's actually in Factor Extra Source (or somewhere else),
  set `LINKS_SHEET_ID` in `.env.local` to the right sheet ID.
- **Courier column position**: you mentioned it's column C on Current Week
  and column F on "the data tab" — I've wired up that exact fallback in
  `pages/api/lanes/index.js`. If your Factor sheet's real tab is actually
  named "Data" rather than "Sheet1", update `FACTOR_EXTRA_SOURCE_TAB` in
  `.env.local` to match.
- **Dedup logic**: I'm matching Factor vs DACH Logs lanes purely on Load
  Reference being identical. If Factor lanes ever get renamed/reformatted
  once synced into Current Week, this match would miss and you'd see the
  duplicate again — let me know if that happens.

## Next steps

- Point this at your real sheets and see what breaks first — almost
  certainly a header name mismatch in `lib/columns.js`
- Brand styling once you can get me the actual colors/fonts
- If you ever do want email sending after all, the Gmail API + per-user
  OAuth approach we discussed earlier is still the right shape for it
