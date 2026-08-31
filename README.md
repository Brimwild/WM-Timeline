# Expedition timeline — setup

A per-character campaign-time chart for a West Marches game. Data lives in a Google
Sheet your DMs already know how to edit. A static page reads it and draws the timeline.
No server, no database, no accounts.

Work through the six phases in order. Each ends with something you can look at, so you
always know whether the last step worked before starting the next one.

Total time: about an hour, most of it in phase 1 typing in your own expeditions.

---

## What's in this folder

| File | Edit it? |
|---|---|
| `index.html` | Yes — the config block near the top. That's the only edit you need. |
| `chart.js` | No, unless you're deliberately changing the chart. See CHART-SPEC.md. |
| `Code.gs` | No. Paste it into Apps Script; it builds and runs the sheet. |
| `reference.svg` | No. Generated. Committed on purpose. |
| `verify.mjs` | No. Runs in CI. Needs Node, which you don't need locally. |
| `CHART-SPEC.md` | Reference for the frozen geometry and the sheet schema. |
| `.github/workflows/verify.yml` | No. Runs the drift check on every push. |

No build step, no bundler, no dependencies. `index.html` and `chart.js` are plain
files a browser opens directly.

---

## Phase 0 — see it working before you change anything

Double-click `index.html`. That's it.

**Checkpoint:** the seven-character demo chart — Thorne through Nettle, days 30 to 80, a
red dashed box on Old Grask's row. The line under the title says the URLs aren't set yet,
which is correct; nothing is wired up.

Try the "who is free" box and the paging buttons under the chart.

If your browser blocks it (Chrome is occasionally strict about local files) or you'd
rather serve it, any of these work. On Windows, `python3` is not a command; it hits a
Microsoft Store stub. Use the interpreter you actually have:

```powershell
cd "C:\path\to\wm-timeline"
& "C:\Users\BretC\miniconda3\python.exe" -m http.server 8000
```

The `&` is PowerShell's call operator, needed because the path is quoted. Then open
`http://localhost:8000`. From an Anaconda Prompt rather than PowerShell, plain
`python -m http.server 8000` works.

You do not need Node. The drift check runs in GitHub Actions in phase 4.

---

## Phase 1 — build the sheet

Don't type the headers by hand. `Code.gs` builds the whole thing.

1. New Google Sheet.
2. **Extensions → Apps Script.** Delete the placeholder `function myFunction() {}`.
3. Paste all of `Code.gs`. Save (the disk icon).
4. Back on the sheet, reload the browser tab. A **West Marches** menu appears next to Help.
5. **West Marches → Set up sheet.** Approve the permission prompt the first time; it's
   your own script asking for access to your own spreadsheet.

**Checkpoint:** three tabs named `expeditions`, `roster`, `characters`, with bold frozen
headers, correct column widths, and dropdowns. `roster` column A only accepts expedition
ids that exist; column B suggests known characters. An expedition whose end day is before
its start day turns pink.

Running "Set up sheet" again is safe. It repairs headers and validation without touching
data, so run it after any change you're unsure about.

Now **West Marches → Add demo data** to load the same seven characters as
`reference.svg`. Old Grask has a deliberate conflict in there so you can see what a broken
timeline looks like. Try **West Marches → Check timeline conflicts** — it should find him.

Then clear the demo rows and log your three most recent real expeditions using
**West Marches → Log an expedition**. The dialog handles ids, picks an unused bar code,
converts duration to an end day, adds roster rows, and creates any character it hasn't
seen before.

It also enforces the one rule the whole system rests on: a character can only join an
expedition departing on or after their own current day. Characters who aren't back yet
grey out as you type a departure day, and submitting anyway gives you a named list and
the earliest legal date. You can override deliberately by pressing the button a second
time, which is the right behaviour — the tool should make the illegal case visible, not
impossible.

Two things worth knowing regardless:

- **Days are plain integers from campaign day 0.** Not dates. Storing them as dates makes
  every calculation miserable, especially with a homebrew calendar. The chart can display
  an in-world calendar later without changing what's stored.
- **There is no current-day column, and you should not add one.** It's derived as the
  highest `end_day` in a character's roster rows. A hand-maintained copy disagrees with
  the log within a month and people stop trusting the chart.

**Checkpoint:** three real expeditions logged, no conflicts reported.

---

## Phase 2 — publish the tabs

This is the step people get wrong, so read it carefully.

For **each** of the three tabs:

1. **File → Share → Publish to web**
2. In the first dropdown, select **the specific tab** — not "Entire document"
3. In the second dropdown, select **Comma-separated values (.csv)**
4. Click **Publish**, confirm
5. Copy the URL it gives you

A correct URL looks like this:

```
https://docs.google.com/spreadsheets/d/e/2PACX-1vT.../pub?gid=0&single=true&output=csv
```

Check for `/d/e/` in the path and `output=csv` at the end. If your URL contains `/edit`
or ends in `#gid=0`, you copied from the address bar instead of the publish dialog. Go
back to step 5.

Publishing is not the same as sharing. It makes that tab's contents readable as CSV by
anyone with the link, and adds the CORS headers a static page needs to read it without an
API key. Edit access is unchanged — people you haven't invited still can't write.

Because of that, don't put anything private in these tabs. Player phone numbers, secret
backstory, and unrevealed plot go in a different, unpublished sheet.

Now open `index.html` in a text editor. Near the top of the `<script>` block:

```js
var SHEETS = {
  expeditions: 'PASTE_EXPEDITIONS_CSV_URL',
  roster:      'PASTE_ROSTER_CSV_URL',
  characters:  'PASTE_CHARACTERS_CSV_URL'
};
```

Replace the three placeholders with your URLs, keeping the quotes.

### Option B — deploy the script as a web app

Skip the three CSV URLs entirely and get one URL with no cache delay.

In the Apps Script editor: **Deploy → New deployment → gear icon → Web app.** Execute as
**Me**, who has access **Anyone**. Deploy, then copy the `/exec` URL.

In `index.html`, set `WEB_APP_URL` to that URL. When it's set, the three CSV URLs are
ignored.

The trade-off: publish-to-web is two clicks per tab and lags five minutes.
The web app updates instantly but requires a redeployment (**Deploy → Manage deployments
→ edit → New version**) whenever you change `Code.gs`. Changing sheet *data* never needs a
redeployment. Start with option A; move to B if the cache annoys people.

---

## Phase 3 — see your own data

Save `index.html` and refresh it in the browser.

**Checkpoint:** your characters, your expeditions. The line under the title mentions the
five-minute cache. The footer shows how many expeditions and characters loaded.

If the counts are wrong or the chart is empty, jump to troubleshooting below.

Compare against the same page with `?demo=1` on the end of the URL, which always renders
the reference dataset. If demo looks right and yours doesn't, the problem is in the sheet, not the code.

---

## Phase 4 — put it online

GitHub Pages. Free, and the included workflow will run the drift check for you.

1. Create a new **public** repository, e.g. `wm-timeline`. Pages on a private repo needs
   a paid plan.
2. Push every file in this folder to the repository root, with `index.html` at the top
   level, not inside a subfolder.
3. In the repo: **Settings → Pages**. Under Source pick **Deploy from a branch**, then
   branch `main`, folder `/ (root)`. Save.
4. Wait about a minute. Watch the **Actions** tab if you're impatient — Pages deploys as
   a workflow now, so a failure shows up there rather than silently doing nothing.

**Checkpoint:** `https://<your-username>.github.io/wm-timeline/` shows your chart.

Post that URL in your Discord. It works on phones, which is where DMs will actually check
it. Every push to `main` redeploys with no build step.

If you'd rather not use git at all, drag this folder onto Netlify Drop and you'll have a
URL in about ten seconds. You lose the automatic drift check.

---

## Phase 5 — backfill

Now that it works, enter the rest of your campaign history. Sort your expedition log by
date and work forward, since `id` ordering doesn't matter but getting `start_day` right
does.

Expect the chart to surface conflicts you didn't know about. Overlapping bars mean a
character was recorded in two places at once, which is a real bug in the log rather than a
bug in the chart. The panel below the chart names each one in plain language. Fix them by
adjusting the day range that's wrong, or by deciding one of the two expeditions happened
later than you thought.

**Checkpoint:** no red boxes. The staircase on the right edge tells you who's drifted
behind and needs to be pulled into the next expedition.

---

## Phase 6 — make logging actually happen

This is the phase that decides whether the project survives. The chart is not the hard
part; keeping the sheet current is.

A DM who just finished a four-hour session at 1am will not open a spreadsheet and fill in
eight fields. If logging takes longer than about thirty seconds, the sheet goes stale in
two months and everyone stops trusting the chart.

So:

- Use **West Marches → Log an expedition** rather than typing into cells. It's four
  fields and a set of checkboxes, and it can't produce a malformed row.
- Pin the sheet link in your DM channel. The dialog works in the Sheets mobile app.
- Make it the last step of the session, before anyone leaves the call.
- Pick one person who checks the conflict panel weekly. It takes fifteen seconds and
  catches errors while people still remember what happened.

---

## Troubleshooting

**`python3` is not recognized (Windows)**
Windows routes `python3` to a Microsoft Store stub. You don't need Python at all now —
just double-click `index.html`. If you want a server anyway, call your interpreter by full
path: `& "C:\Users\BretC\miniconda3\python.exe" -m http.server 8000`. Also check you're
in the project folder, not whichever one your terminal opened in.

**The West Marches menu doesn't appear**
Reload the spreadsheet tab. `onOpen` only runs when the sheet loads. If it's still missing,
open Apps Script and check the file saved.

**"Authorization required" when running a menu item**
First run only. Choose your account, click Advanced, then "Go to (unsafe)". It says unsafe
because the script is unpublished, not because it does anything unusual — you can read
every line of it.

**"Could not read the sheet: 404"**
The tab isn't published, or you pasted the `/edit` URL. Redo phase 2 and check for
`/d/e/` and `output=csv`.

**Chart renders but is empty**
Your `roster` rows reference expedition ids that don't exist in `expeditions`. Check for
typos and trailing spaces in `expedition_id`.

**A character is missing**
They have no `roster` rows. Add them to the `characters` tab to show an empty row, or
give them an expedition.

**Edits to the sheet don't appear**
Google caches published output for roughly five minutes. Wait, then hard-refresh. If that
delay bothers people, switch to the web app deployment in phase 2 option B, which has no
cache.

**Web app returns old data after editing Code.gs**
Deployments are pinned to a version. **Deploy → Manage deployments → edit → New version.**
Changing sheet data never needs this; changing script code always does.

**Old expeditions have scrolled off the chart**
The window shows 50 days. Use the paging buttons under the chart to walk backward, or
"Jump to latest" to return.

**Bar codes have run out of letters**
After 26 expeditions the dialog switches to two-character codes, which still fit. Reusing
a letter is also fine; colour and position disambiguate.

**Days on the axis look wrong**
The window is pinned to 50 days ending at the furthest-ahead character, rounded up to the
next multiple of 5. That's deliberate — it keeps the scale constant forever. If you need a
different span, change `WINDOW_DAYS` in `chart.js` and follow the version-bump procedure
in CHART-SPEC.md.

**`node verify.mjs` fails after you changed something**
That's it working. If the change was intentional, bump `SPEC.version` in `chart.js`, run
`node verify.mjs --write`, and commit both files together. If it wasn't, revert.
