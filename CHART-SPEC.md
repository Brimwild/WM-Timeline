# Chart spec v1.2.0 — frozen

The chart is defined by the `SPEC` and `RAMPS` constants in `chart.js`, not by this
document. This document explains them. If the two ever disagree, `chart.js` wins.

## Anti-drift contract

1. All geometry and colour live in `SPEC` / `RAMPS` / `CHROME` at the top of `chart.js`.
   No coordinate or hex value appears anywhere else in the codebase.
2. `reference.svg` is the exact output of `renderChart(buildModel(DEMO))`. It is committed.
3. `node verify.mjs` regenerates and diffs. Any difference fails with a line-by-line report.
4. To change the chart on purpose: edit `SPEC`, bump `SPEC.version`, run
   `node verify.mjs --write`, and commit the new `reference.svg` in the same commit as the
   spec change. A `reference.svg` diff with no `SPEC.version` bump is drift.
5. `DEMO` is the golden input and must never be edited. Add test cases as new fixtures.

Wire step 3 into CI so drift cannot merge:

```yaml
# .github/workflows/verify.yml
name: verify chart
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: node verify.mjs
```

## Geometry

All units are SVG user units. `viewBox` width is fixed at 680 so units map 1:1 to CSS
pixels at full width; `width="100%"` scales the whole thing on narrow screens.

| Constant | Value | Meaning |
|---|---|---|
| `VIEW_W` | 680 | viewBox width, fixed |
| `SAFE_L` / `SAFE_R` | 40 / 640 | content bounds |
| `GRID_X0` / `GRID_X1` | 130 / 590 | time axis start and end |
| `WINDOW_DAYS` | 54 | days visible (9 weeks); fixes px-per-day at 8.52 |
| `TICK_EVERY` | 6 | one tick per 6-day week |
| `MONTH_BASELINE` | 26 | month-band text baseline |
| `AXIS_BASELINE` | 44 | day-of-month text baseline |
| `GRID_TOP` | 54 | top of vertical gridlines |
| `ROW0_CENTER` | 78 | vertical centre of first character row |
| `ROW_PITCH` | 40 | distance between row centres |
| `GRID_BOTTOM_PAD` | 22 | below last row centre to grid bottom |
| `BAR_H` / `BAR_RX` | 20 / 4 | normal expedition bar |
| `SPLIT_BAR_H` / `SPLIT_BAR_RX` | 13 / 3 | bars in a conflicted row, stacked |
| `CODE_MIN_BAR_W` | 30 | bars narrower than this omit their letter |
| `DAY_LABEL_X` | 598 | right-hand current-day label |

Derived, never hardcoded:

```
pxPerDay   = (GRID_X1 - GRID_X0) / (dayMax - dayMin)     // 9.2 at the default window
x(day)     = GRID_X0 + (day - dayMin) * pxPerDay
rowY(i)    = ROW0_CENTER + i * ROW_PITCH
gridBottom = rowY(n - 1) + GRID_BOTTOM_PAD
viewH      = legendY(lastRow) + LEGEND_TEXT_DY + BOTTOM_PAD
```

**Rounding rule.** Bar `x` is `round(x(start))`. Bar `width` is
`round(x(end) - x(start))`, not `round(x(end)) - round(x(start))`. The two differ by a
pixel on some bars, and this is exactly the kind of thing that drifts silently.

**Window rule.** `dayMax` is the highest current day rounded forward to the next day that
opens a week. `dayMin` is `dayMax - 54`. Because 54 is exactly nine 6-day weeks, both edges
land on week boundaries, every tick is a week start, and month boundaries always coincide
with a tick. px/day is a constant 8.52 regardless of campaign length.

## Calendar

The sheet stores integer campaign days and knows nothing about the calendar. All in-world
formatting happens at render time through the `CALENDAR` object in `chart.js`:

- Ten months of 36 days, six 6-day weeks each, so every month opens on a Selundag.
- `epochDayOfYear` maps campaign day 0 to a day-of-year. Haerfest 27 is `3 * 36 + 27 = 135`.
  **This is the only value to change if the campaign start date is ever corrected**, and
  nothing in the sheet moves when it does.
- `fromDay(n)` returns year, month, day-of-month, weekday, and moon age. Because the lunar
  cycle is 36 days beginning new on the 1st, moon age equals day-of-month minus one, so the
  axis already tells you the phase. Full moon is the 19th.
- `formatDay(n)` gives the compact `Hae 27` used in tight labels; `formatLong(n)` gives
  `Keendag, 27 Haerfest` for prose.
- Setting `CALENDAR.enabled = false` reverts every label to plain `d27` day numbers.

The axis renders in two tiers: month names on the upper band, day-of-month on the lower.
A month label drops to a three-letter abbreviation below 80px of visible span and is
omitted entirely below 40px, so a month clipped at the window edge never overflows.

## Colour

Eight ramps. Each has a light triple (fill 50, stroke 600, ink 800) and a dark triple
(fill 800, stroke 200, ink 100), emitted as CSS custom properties with a
`prefers-color-scheme` switch. The SVG references variables only, so one stylesheet
covers both modes with no re-render.

Ramps are assigned in the order `teal, amber, purple, green, blue, pink, coral, gray` by
ascending `start_day`. A `color` column in the expeditions sheet overrides this. The
assignment is stable: because it is keyed on start day, adding an expedition never
recolours the ones before it.

Colour never carries meaning alone. Every bar wide enough shows its letter code, and the
legend pairs each swatch with `code · name`.

## Rows

Sorted by status (active first), then current day descending, then name ascending. The
descending sort is what produces the staircase on the right edge, which is the drift
readout. Retired and dead characters keep their history and render at 45% opacity at the
bottom.

## Conflicts

A conflict is two expeditions on one character whose day ranges intersect
(`max(startA, startB) < min(endA, endB)`). Both bars drop to half height and stack, and a
red dashed outline covers the overlapping span. End day and start day being equal is not
a conflict; a character returning on day 51 may leave again on day 51.

## Typography

Two sizes only. 14px weight 500 for character names, 12px weight 400 for everything
else. Set `--wm-font` in the host page to change the family.

---

# Sheet schema

Three tabs. Header row exactly as written; the parser lowercases and underscores headers,
so `Start Day` and `start_day` both work.

**`expeditions`**

| id | name | code | start_day | end_day | dm | real_date | color |
|---|---|---|---|---|---|---|---|
| EXP-A | Ashen vale | A | 32 | 38 | Kira | 2026-03-14 | |

`id` and the two day columns are required. `code` is the letter on the bar. `color` is
optional and takes a ramp name. `dm` and `real_date` are never rendered; keep them anyway,
because "when did the Kell thing actually happen" is a question you will be asked.

**`roster`** — one row per character per expedition. This is the join table.

| expedition_id | character |
|---|---|
| EXP-A | Thorne |
| EXP-A | Vex |

**`characters`** — optional. Only needed to mark someone retired or dead, or to show a
character who has not been on an expedition yet.

| name | player | status | created_day |
|---|---|---|---|
| Thorne | Ana | active | 30 |

Never store a current-day column. It is derived as `max(end_day)` across a character's
roster rows. A hand-maintained copy will disagree with the log inside a month.

## Publishing the tabs

For each tab: **File → Share → Publish to web → select the tab → Comma-separated values
(.csv) → Publish.** Paste the three URLs into the `SHEETS` block in `index.html`.

Publishing is separate from sharing. A published CSV is readable by anyone with the link
and serves permissive CORS headers, which is what lets a static page read it with no API
key and no login. Anyone you have not given edit access to still cannot write.

Google caches published output for roughly five minutes. A DM who logs a session and
immediately refreshes will not see it. This is worth saying out loud once so nobody
files it as a bug.

## Running locally

ES modules are blocked over `file://`. Serve the folder:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`. Add `?demo=1` to render the golden dataset regardless
of what the sheet contains — useful for eyeballing the reference chart, and for checking
whether a rendering problem is the chart or the data.
