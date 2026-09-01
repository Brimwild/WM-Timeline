# WM-Timeline

A per-character campaign-time tracker for a West Marches game. Data lives in a Google
Sheet your DMs already know how to edit. A static page reads it and draws a timeline
showing where every character sits in campaign time.

**Live:** https://brimwild.github.io/WM-Timeline/


---

## Why build this?

With enough players, the problem most West Marches campaigns eventually run into is time tracking. Normal campaigns dont have this issue. Downtime is when people aren't adventuring, and when there is one adventuring party and one DM, time is obvious. But in West Marches, when there are multiple parties and DM's, and some characters are in some expeditions and some are in others- it quickly becomes complicated.

The only solution, as far as I can tell, is to just track it meticulously. If people dont move the calendar forward when the time happens, looking backwards quickly gets difficult. Without receipts, no one has any idea 'when' we are, DM's have to make it up, and, ultimately, no one takes any downtime.

Given that downtime is a crucial component of West Marches campaigns, I wanted to make it easier for players and DM's to track this. 

**Adventures and Players** Players have dates, 'when' they are, but events are also tracked. Color blocks on the X show us when they were. 

One rule prevents the first and contains the second:

> **Time only moves forward, and catching up is free.**
>
> A character may join any expedition departing on or after their own current day. The gap
> in between is downtime. They may never join one departing before it.

That's the whole invariant, and it's a single comparison. The sheet's logging dialog
enforces it at write time; the chart makes violations visible when they slip through
anyway.

## Reading the chart

- **Rows** are characters, sorted by current campaign day, descending.
- **Bars** are expeditions. Same colour and letter means the same expedition, so a party
  reads as a vertical stack of matching bars.
- **Whitespace** is downtime, which means availability. Scan a column to see who is free.
- **The right edge** is each character's current day. The staircase it forms is your drift
  readout — a long tail means someone is stranded in the past.
- **A red dashed box** is a timeline conflict. Two expeditions overlap for that character.
  It's a bug in the log, not in the chart.

## How it works

1. DMs log expeditions into a Google Sheet, normally through the sheet's own
   **West Marches → Log an expedition** dialog.
2. Three tabs are published to the web as CSV, or the Apps Script is deployed as a JSON
   endpoint.
3. `index.html` fetches that data, joins it, derives each character's current day, and
   detects conflicts.
4. `chart.js` renders the SVG. GitHub Pages serves the whole thing as static files.

Nothing is precomputed and nothing is cached on our side. Reload the page and you see the
sheet's current state.

---

## Files

### `index.html`
The page itself, and **the only file you normally edit**. Contains the config block with
your sheet URLs, a hand-rolled CSV parser, the fetch and error handling, the availability
panel, the conflict list, and the window paging buttons. Deliberately holds everything
that might reasonably change, so that `chart.js` doesn't have to.

Open it in a browser directly — no server needed.

### `chart.js`
**The frozen renderer.** Every coordinate, dimension and colour in the chart lives in the
`SPEC`, `RAMPS` and `CHROME` constants at the top of this file, and nowhere else. Also
holds `buildModel()`, which turns raw sheet rows into a sorted, conflict-annotated model,
and `renderChart()`, which turns that model into an SVG string.

Written as a classic script so it loads with a plain `<script src>` tag in the browser and
as a CommonJS module in Node, with no bundler in between. Don't edit it casually; see the
drift contract below.

### `reference.svg`
**The golden file.** The exact output of `renderChart()` for a fixed seven-character demo
dataset. Committed on purpose. It is the definition of what the chart is supposed to look
like, expressed as bytes rather than prose.

It intentionally has no embedded stylesheet — colours come from CSS variables the host page
supplies — so it looks unstyled if you open it on its own. That's expected. It exists to be
diffed, not admired.

### `verify.mjs`
**The drift check.** Re-renders the demo dataset and compares the result to
`reference.svg`. Byte-identical passes; anything else fails with a line-by-line diff
naming exactly what moved. Run `node verify.mjs` locally if you have Node, or let CI do it.

`node verify.mjs --write` regenerates `reference.svg` after a deliberate change.

### `.github/workflows/verify.yml`
Tells GitHub Actions to run `verify.mjs` on every push and pull request. `verify.mjs` is
the check; this file is the trigger. Without it the check exists but never runs.

### `Code.gs`
The Google Apps Script that runs inside the spreadsheet. Paste it into
**Extensions → Apps Script** and it adds a **West Marches** menu with four items:

- **Set up sheet** builds all three tabs with correct headers, frozen bold header rows,
  column widths, dropdown validation and conditional formatting. Idempotent, so re-running
  it repairs structure without touching data.
- **Log an expedition** opens a dialog that derives the id, picks an unused bar code,
  converts duration to an end day, writes the roster rows, and creates unknown characters.
  It enforces the forward-time invariant: characters who aren't back yet grey out as you
  type a departure day, and submitting anyway names them and gives you the earliest legal
  date.
- **Check timeline conflicts** reports overlaps in plain language.
- **Add demo data** loads the same seven characters as `reference.svg`, conflict included.

Also contains a `doGet()` you can deploy as a web app to serve the data as JSON, which
avoids Google's five-minute publish-to-web cache.

### `CHART-SPEC.md`
Reference documentation for the frozen chart: every geometry constant and what it means,
the derived formulas, the rounding and window rules, the colour ramps and how they're
assigned, and the full sheet schema. Read this before changing anything about how the
chart looks.

### `SETUP.md`
The step-by-step installation guide, phase 0 through 6, with checkpoints and
troubleshooting. Start here if you're standing this up from scratch.

### `package.json`
Marks the project as CommonJS and provides `npm run verify`. There are no dependencies and
never should be.

---

## The drift contract

The chart's design is settled, and the point of the setup below is that it stays settled.

1. All geometry and colour live in `SPEC` / `RAMPS` / `CHROME` in `chart.js`. No
   coordinate or hex value appears anywhere else in the codebase.
2. `reference.svg` is the committed output for a fixed input.
3. CI diffs them on every push.
4. To change the chart **on purpose**: edit `SPEC`, bump `SPEC.version`, run
   `node verify.mjs --write`, and commit the new `reference.svg` in the same commit as the
   spec change.

A `reference.svg` diff without a `SPEC.version` bump is drift by definition, and the build
goes red.

## The calendar

Ten months of 36 days; six weeks of six days each. Every month therefore opens on a
Selundag, and the 36-day lunar cycle tracks day-of-month exactly — new moon on the 1st,
full moon on the 19th, so the axis already tells you the phase.

Months run Croppceir, Gimmdur, Lathadur, Haerfest, Foradur (Year of Day), then Cwaludur,
Meargsyce, Aurildur, Hrimdu, Uhtadur (Year of Night). Weekdays run Selundag, Tyrsdag,
Keendag, Taldag, Tormdag, Savradag.

Campaign day 0 is Haerfest 27, a Keendag. That mapping lives in a single constant,
`CALENDAR.epochDayOfYear`, set to 135 (`3 * 36 + 27`). Correcting the campaign start date
means changing that one number; no sheet data moves.

The constant is declared in both `chart.js` and `Code.gs`, since neither can import the
other. `verify.mjs` extracts Code.gs's copy and compares the two, so the build fails if the
sheet and the chart ever disagree about what day it is.

## Editing the sheet

The sheet has three tabs: `expeditions`, `roster`, and `characters`.

### Logging a session

Use **West Marches → Log an expedition** in the sheet menu. Fill in the fields and check who went. Submit. Done.

If you prefer to type directly into the sheet:

**`expeditions`** — one row per expedition.

| Column | What to enter |
|---|---|
| `id` | Unique identifier. Use EXP-001, EXP-002, etc. in order. |
| `name` | Full expedition name. Shows in the legend. |
| `code` | Single letter. Shows on the bar in the chart. |
| `start_day` | Campaign day the party departed. Integer. |
| `end_day` | Campaign day the party returned. Integer. |
| `dm` | Who ran it. |

**`roster`** — one row per character per expedition. If four characters went on EXP-012, that's four rows.

| Column | What to enter |
|---|---|
| `expedition_id` | Must match an id in the expeditions tab exactly. |
| `character` | Character name. Must match the characters tab exactly. |

**`characters`** — add a row here when a new character is created, or to mark one retired or dead.

| Column | What to enter |
|---|---|
| `name` | Character name. |
| `player` | Player name. |
| `status` | `active`, `retired`, or `dead`. |
| `created_day` | Campaign day the character was introduced. |

### Day numbers

The sheet stores campaign days as plain integers. Day 0 is Haerfest 27. Count forward from there — if a party leaves 10 days after campaign start, `start_day` is 10. The chart converts everything to in-world dates automatically.

The chart updates within five minutes of any change to the sheet.

### Rules

- A character's current day is derived from their last `end_day`. Do not add a current-day column.
- `expedition_id` in roster and `character` in roster must match their source tabs exactly. Capitalisation counts.
- Never delete rows. Mark characters retired or dead in the `characters` tab instead.
The axis shows month names on an upper band and day-of-month below. Row labels and the
availability panel read `Mea 4`; the panels spell out `Selundag, 4 Meargsyce`.

## Data model

Two tables carry everything; the third is optional.

**`expeditions`** — `id`, `name`, `code`, `start_day`, `end_day`, `dm`, `real_date`, `color`
**`roster`** — `expedition_id`, `character` (one row per character per expedition)
**`characters`** — `name`, `player`, `status`, `created_day`

Three rules that matter:

- **Days are integers from campaign day 0**, not calendar dates. The in-world calendar is a
  display layer in `chart.js` and never touches the sheet.
- **There is no current-day column.** It's derived as `max(end_day)` across a character's
  roster rows. A hand-maintained copy disagrees with the log within a month, and then
  nobody trusts the chart.
- **Nothing is ever deleted.** Retired and dead characters keep their history and render
  faded, because "who was on the Kell expedition" is a question people ask about
  characters who no longer exist.

## Behaviour at scale

A campaign accumulates characters and expeditions forever. Nothing is ever deleted, so the
chart controls what it *draws* rather than what it stores.

**Time axis.** Fixed 54-day window (nine 6-day weeks), so px-per-day is constant at 8.52
whether you're on campaign day 40 or day 4,000. Paging and jump-to-day move the window; the
chart never compresses.

**Rows.** The default view shows only characters the visible window says something about:
anyone with an expedition intersecting it, or whose current day falls inside it. Retired
and dead characters are hidden unless you ask for them. Switch to "All active" or
"Everyone" in the dropdown, or type a name in the search box to pull one character up
regardless of filter. Measured on a simulated three-year campaign — 320 expeditions, 75
characters — this took the chart from 75 rows and 4,715px to 32 rows and 1,455px.

**Legend.** Lists only expeditions overlapping the visible window. The same simulation went
from 320 legend entries to 14.

**Colours.** Eight ramps assigned in rotation, but never handing the same ramp to two
expeditions whose day ranges overlap. Repetition across distant parts of the timeline is
fine and intended; two concurrent parties looking identical is not.

**Bar codes.** Recycled. A letter is free again once no expedition in the last 60 days is
using it, so A–Z never runs out.

**Availability queries** always search every active character, not just the drawn rows, so
filtering the view never hides someone who is free.

## Known constraints

- Published Google Sheets are cached for roughly five minutes. The web app deployment has
  no such delay.
- The repo is public, so the sheet URLs in `index.html` are visible. Published sheets are
  already publicly readable, but keep player contact details and unrevealed plot in a
  separate, unpublished sheet.
- Sheet validation covers 5,000 rows per tab, roughly 1,200 expeditions. Re-run
  **Set up sheet** with a larger range if you somehow exceed it.
- The view state lives in the URL (`?end=`, `?day=`, `?show=`), so a link to a specific
  window and departure day is shareable. Useful for "who's free for the day 340 run?".

## The part that actually decides whether this survives

Not the chart. Data capture. A DM who just finished a four-hour session at 1am will not
open a spreadsheet and fill in eight fields. If logging takes longer than about thirty
seconds, the sheet goes stale in two months and everyone stops trusting the chart.

That's why the logging dialog exists, why it derives everything it can, and why it's a
menu item in the sheet rather than a separate tool. Use it.
