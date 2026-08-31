// chart.js - FROZEN RENDERER. See CHART-SPEC.md before editing anything below.
// Any change to SPEC or renderChart() must bump SPEC.version and regenerate reference.svg.
//
// Loads as a plain <script src="chart.js"> in the browser (works over file:// and http://)
// and as a CommonJS module in Node for the drift check. No build step, no bundler.

(function (root) {
'use strict';

const SPEC = {
  version: '1.0.0',

  // Canvas
  VIEW_W: 680,
  SAFE_L: 40,
  SAFE_R: 640,

  // Time axis
  GRID_X0: 130,
  GRID_X1: 590,
  WINDOW_DAYS: 50,
  TICK_EVERY: 5,

  // Vertical rhythm
  AXIS_BASELINE: 34,
  GRID_TOP: 44,
  ROW0_CENTER: 68,
  ROW_PITCH: 40,
  GRID_BOTTOM_PAD: 22,

  // Marks
  BAR_H: 20,
  BAR_RX: 4,
  SPLIT_BAR_H: 13,
  SPLIT_BAR_RX: 3,
  SPLIT_TOP_OFFSET: -16,
  SPLIT_BOT_OFFSET: 0,
  CODE_MIN_BAR_W: 30,

  // Conflict outline
  CONFLICT_PAD_X: 2,
  CONFLICT_TOP_OFFSET: -20,
  CONFLICT_H: 38,
  CONFLICT_SW: 1.5,
  CONFLICT_DASH: '3 2',

  // Right-hand current-day label
  DAY_LABEL_X: 598,

  // Query line
  QUERY_DASH: '4 3',
  QUERY_LABEL_DY: 16,

  // Legend
  LEGEND_TOP_DY: 32,
  LEGEND_ROW_PITCH: 20,
  LEGEND_SWATCH: 10,
  LEGEND_SWATCH_RX: 2,
  LEGEND_TEXT_DX: 16,
  LEGEND_TEXT_DY: 9,
  LEGEND_GAP: 20,
  LEGEND_CHAR_W: 6.6,

  BOTTOM_PAD: 24,

  // Ramp assignment order. Expeditions take these in ascending start_day order
  // unless the sheet supplies an explicit colour.
  RAMP_ORDER: ['teal', 'amber', 'purple', 'green', 'blue', 'pink', 'coral', 'gray'],
};

// Palette. Light: 50 fill / 600 stroke / 800 ink. Dark: 800 fill / 200 stroke / 100 ink.
const RAMPS = {
  teal:   { fill: ['#E1F5EE', '#085041'], stroke: ['#0F6E56', '#5DCAA5'], ink: ['#085041', '#9FE1CB'] },
  amber:  { fill: ['#FAEEDA', '#633806'], stroke: ['#854F0B', '#EF9F27'], ink: ['#633806', '#FAC775'] },
  purple: { fill: ['#EEEDFE', '#3C3489'], stroke: ['#534AB7', '#AFA9EC'], ink: ['#3C3489', '#CECBF6'] },
  green:  { fill: ['#EAF3DE', '#27500A'], stroke: ['#3B6D11', '#97C459'], ink: ['#27500A', '#C0DD97'] },
  blue:   { fill: ['#E6F1FB', '#0C447C'], stroke: ['#185FA5', '#85B7EB'], ink: ['#0C447C', '#B5D4F4'] },
  pink:   { fill: ['#FBEAF0', '#72243E'], stroke: ['#993556', '#ED93B1'], ink: ['#72243E', '#F4C0D1'] },
  coral:  { fill: ['#FAECE7', '#712B13'], stroke: ['#993C1D', '#F0997B'], ink: ['#712B13', '#F5C4B3'] },
  gray:   { fill: ['#F1EFE8', '#444441'], stroke: ['#5F5E5A', '#B4B2A9'], ink: ['#444441', '#D3D1C7'] },
};

const CHROME = {
  ink:      ['#0b0b0b', '#f0efec'],
  inkMuted: ['#52514e', '#c3c2b7'],
  hint:     ['#898781', '#898781'],
  grid:     ['#e1e0d9', '#2c2c2a'],
  conflict: ['#E24B4A', '#E24B4A'],
};

function paletteCSS() {
  const line = (n, v) => `--${n}:${v}`;
  const light = [], dark = [];
  for (const [name, r] of Object.entries(RAMPS)) {
    light.push(line(`f-${name}`, r.fill[0]), line(`s-${name}`, r.stroke[0]), line(`i-${name}`, r.ink[0]));
    dark.push(line(`f-${name}`, r.fill[1]), line(`s-${name}`, r.stroke[1]), line(`i-${name}`, r.ink[1]));
  }
  for (const [name, c] of Object.entries(CHROME)) {
    light.push(line(`c-${name}`, c[0]));
    dark.push(line(`c-${name}`, c[1]));
  }
  return `:root{${light.join(';')}}\n@media (prefers-color-scheme:dark){:root{${dark.join(';')}}}`;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------------------------------------------------------------------------
// Model building
// ---------------------------------------------------------------------------

function buildModel({ expeditions, roster, characters = [], queryDay = null }) {
  const exps = expeditions
    .map((e) => ({
      id: String(e.id).trim(),
      code: String(e.code || '').trim(),
      name: String(e.name || '').trim(),
      startDay: Number(e.start_day),
      endDay: Number(e.end_day),
      color: (e.color || '').trim() || null,
    }))
    .filter((e) => e.id && Number.isFinite(e.startDay) && Number.isFinite(e.endDay))
    .sort((a, b) => a.startDay - b.startDay || a.id.localeCompare(b.id));

  let ri = 0;
  for (const e of exps) {
    if (!e.color || !RAMPS[e.color]) e.color = SPEC.RAMP_ORDER[ri++ % SPEC.RAMP_ORDER.length];
  }
  const byId = new Map(exps.map((e) => [e.id, e]));

  const statusOf = new Map(
    characters.map((c) => [String(c.name).trim(), String(c.status || 'active').trim().toLowerCase()])
  );

  const rows = new Map();
  for (const r of roster) {
    const name = String(r.character || '').trim();
    const exp = byId.get(String(r.expedition_id || '').trim());
    if (!name || !exp) continue;
    if (!rows.has(name)) rows.set(name, []);
    rows.get(name).push(exp);
  }
  for (const c of characters) {
    const n = String(c.name).trim();
    if (n && !rows.has(n)) rows.set(n, []);
  }

  const conflicts = [];
  const chars = [];
  for (const [name, list] of rows) {
    list.sort((a, b) => a.startDay - b.startDay || a.id.localeCompare(b.id));
    const bad = new Set();
    for (let i = 0; i < list.length - 1; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const s = Math.max(list[i].startDay, list[j].startDay);
        const e = Math.min(list[i].endDay, list[j].endDay);
        if (s < e) {
          bad.add(list[i].id); bad.add(list[j].id);
          conflicts.push({ character: name, a: list[i], b: list[j], startDay: s, endDay: e });
        }
      }
    }
    chars.push({
      name,
      status: statusOf.get(name) || 'active',
      currentDay: list.length ? Math.max(...list.map((e) => e.endDay)) : 0,
      bars: list.map((e) => ({ ...e, conflict: bad.has(e.id) })),
    });
  }

  const rank = (s) => (s === 'active' ? 0 : 1);
  chars.sort(
    (a, b) => rank(a.status) - rank(b.status) || b.currentDay - a.currentDay || a.name.localeCompare(b.name)
  );

  const maxDay = Math.max(0, ...chars.map((c) => c.currentDay));
  const dayMax = Math.ceil(maxDay / SPEC.TICK_EVERY) * SPEC.TICK_EVERY || SPEC.WINDOW_DAYS;
  const dayMin = dayMax - SPEC.WINDOW_DAYS;

  return { characters: chars, expeditions: exps, conflicts, dayMin, dayMax, queryDay };
}

function freeOn(model, day) {
  return model.characters
    .filter((c) => c.status === 'active' && !c.bars.some((b) => day >= b.startDay && day < b.endDay))
    .filter((c) => c.currentDay <= day)
    .map((c) => c.name);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderChart(model) {
  const S = SPEC;
  const { characters: chars, expeditions: exps, dayMin, dayMax, queryDay } = model;
  const pxPerDay = (S.GRID_X1 - S.GRID_X0) / (dayMax - dayMin);
  const x = (d) => S.GRID_X0 + (d - dayMin) * pxPerDay;
  const rowY = (i) => S.ROW0_CENTER + i * S.ROW_PITCH;
  const gridBottom = rowY(Math.max(chars.length - 1, 0)) + S.GRID_BOTTOM_PAD;

  const legend = [];
  let lx = S.SAFE_L, lrow = 0;
  for (const e of exps) {
    const label = e.code ? `${e.code} · ${e.name}` : e.name;
    const w = S.LEGEND_TEXT_DX + label.length * S.LEGEND_CHAR_W;
    if (lx + w > S.SAFE_R && lx > S.SAFE_L) { lrow++; lx = S.SAFE_L; }
    legend.push({ x: Math.round(lx), row: lrow, label, color: e.color });
    lx += w + S.LEGEND_GAP;
  }
  const hasConflict = model.conflicts.length > 0;
  if (hasConflict) {
    const label = 'timeline conflict';
    const w = S.LEGEND_TEXT_DX + label.length * S.LEGEND_CHAR_W;
    if (lx + w > S.SAFE_R && lx > S.SAFE_L) { lrow++; lx = S.SAFE_L; }
    legend.push({ x: Math.round(lx), row: lrow, label, color: null });
  }
  const legendY = (r) => gridBottom + S.LEGEND_TOP_DY + r * S.LEGEND_ROW_PITCH;
  const viewH = legendY(lrow) + S.LEGEND_TEXT_DY + S.BOTTOM_PAD;

  const o = [];
  const desc =
    `Expedition timeline. ${chars.length} characters as rows, campaign days ${dayMin} to ${dayMax} ` +
    `across. Coloured bars are expeditions; matching colours stacked vertically went out together. ` +
    `Empty space is downtime. Each row ends at that character's current campaign day.` +
    (hasConflict ? ` ${model.conflicts.length} timeline conflict(s) outlined in red.` : '');

  o.push(`<svg width="100%" viewBox="0 0 ${S.VIEW_W} ${viewH}" role="img" xmlns="http://www.w3.org/2000/svg">`);
  o.push(`<title>Per-character expedition timeline</title>`);
  o.push(`<desc>${esc(desc)}</desc>`);

  o.push(`<text class="ts" x="${S.SAFE_L}" y="${S.AXIS_BASELINE}">campaign day</text>`);
  for (let d = dayMin; d <= dayMax; d += S.TICK_EVERY) {
    const px = Math.round(x(d));
    o.push(`<text class="ts" x="${px}" y="${S.AXIS_BASELINE}" text-anchor="middle">${d}</text>`);
    o.push(`<line x1="${px}" y1="${S.GRID_TOP}" x2="${px}" y2="${gridBottom}" class="gl"/>`);
  }

  chars.forEach((c, i) => {
    const cy = rowY(i);
    const dim = c.status !== 'active' ? ' dim' : '';
    o.push(`<text class="th${dim}" x="${S.SAFE_L}" y="${cy}" dominant-baseline="central">${esc(c.name)}</text>`);

    for (const b of c.bars) {
      const bx = Math.round(x(b.startDay));
      const bw = Math.round(x(b.endDay) - x(b.startDay));
      const split = b.conflict;
      const h = split ? S.SPLIT_BAR_H : S.BAR_H;
      const rx = split ? S.SPLIT_BAR_RX : S.BAR_RX;
      const isFirst = c.bars.filter((z) => z.conflict).indexOf(b) === 0;
      const by = split ? cy + (isFirst ? S.SPLIT_TOP_OFFSET : S.SPLIT_BOT_OFFSET) : cy - S.BAR_H / 2;
      o.push(`<g class="r-${b.color}${dim}">`);
      o.push(`<rect x="${bx}" y="${by}" width="${bw}" height="${h}" rx="${rx}"/>`);
      if (b.code && bw >= S.CODE_MIN_BAR_W) {
        o.push(
          `<text class="ts" x="${bx + Math.round(bw / 2)}" y="${by + Math.round(h / 2)}" ` +
          `text-anchor="middle" dominant-baseline="central">${esc(b.code)}</text>`
        );
      }
      o.push(`</g>`);
    }

    for (const k of model.conflicts.filter((z) => z.character === c.name)) {
      const ox = Math.round(x(k.startDay)) - S.CONFLICT_PAD_X;
      const ow = Math.round(x(k.endDay) - x(k.startDay)) + S.CONFLICT_PAD_X * 2;
      o.push(
        `<rect x="${ox}" y="${cy + S.CONFLICT_TOP_OFFSET}" width="${ow}" height="${S.CONFLICT_H}" ` +
        `rx="${S.BAR_RX}" class="conflict"/>`
      );
    }

    o.push(`<text class="ts${dim}" x="${S.DAY_LABEL_X}" y="${cy}" dominant-baseline="central">d${c.currentDay}</text>`);
  });

  if (queryDay !== null && queryDay >= dayMin && queryDay <= dayMax) {
    const qx = Math.round(x(queryDay));
    o.push(`<line x1="${qx}" y1="${S.GRID_TOP}" x2="${qx}" y2="${gridBottom}" class="query"/>`);
    o.push(
      `<text class="ts" x="${qx}" y="${gridBottom + S.QUERY_LABEL_DY}" text-anchor="middle">` +
      `who is free on d${queryDay}?</text>`
    );
  }

  for (const l of legend) {
    const sy = legendY(l.row);
    o.push(
      l.color
        ? `<g class="r-${l.color}"><rect x="${l.x}" y="${sy}" width="${S.LEGEND_SWATCH}" ` +
          `height="${S.LEGEND_SWATCH}" rx="${S.LEGEND_SWATCH_RX}"/></g>`
        : `<rect x="${l.x}" y="${sy}" width="${S.LEGEND_SWATCH}" height="${S.LEGEND_SWATCH}" ` +
          `rx="${S.LEGEND_SWATCH_RX}" class="conflict"/>`
    );
    o.push(
      `<text class="ts" x="${l.x + S.LEGEND_TEXT_DX}" y="${sy + S.LEGEND_TEXT_DY}">${esc(l.label)}</text>`
    );
  }

  o.push(`</svg>`);
  return o.join('\n');
}

function chartCSS() {
  const ramps = Object.keys(RAMPS)
    .map((n) => `.r-${n}>rect{fill:var(--f-${n});stroke:var(--s-${n});stroke-width:.5}.r-${n}>text{fill:var(--i-${n})}`)
    .join('\n');
  return `${paletteCSS()}
svg text{font-family:var(--wm-font)}
.t{font-size:14px;font-weight:400;fill:var(--c-ink)}
.th{font-size:14px;font-weight:500;fill:var(--c-ink)}
.ts{font-size:12px;font-weight:400;fill:var(--c-inkMuted)}
.dim{opacity:.45}
.gl{stroke:var(--c-grid);stroke-width:.5}
.query{stroke:var(--c-hint);stroke-width:1;stroke-dasharray:${SPEC.QUERY_DASH}}
.conflict{fill:none;stroke:var(--c-conflict);stroke-width:${SPEC.CONFLICT_SW};stroke-dasharray:${SPEC.CONFLICT_DASH}}
${ramps}`;
}

// ---------------------------------------------------------------------------
// Demo dataset — the golden-file input. Do not edit.
// ---------------------------------------------------------------------------

const DEMO = {
  expeditions: [
    { id: 'EXP-A', code: 'A', name: 'Ashen vale',    start_day: 32, end_day: 38 },
    { id: 'EXP-B', code: 'B', name: 'Hollow barrow', start_day: 35, end_day: 41 },
    { id: 'EXP-C', code: 'C', name: 'Ruins of Kell', start_day: 44, end_day: 51 },
    { id: 'EXP-D', code: 'D', name: 'Saltmire',      start_day: 47, end_day: 53 },
    { id: 'EXP-E', code: 'E', name: 'Deepwater run', start_day: 58, end_day: 66 },
    { id: 'EXP-F', code: 'F', name: 'Thornwatch',    start_day: 61, end_day: 64 },
    { id: 'EXP-G', code: 'G', name: 'Nightmarch',    start_day: 70, end_day: 78 },
  ],
  roster: [
    { expedition_id: 'EXP-A', character: 'Thorne' },
    { expedition_id: 'EXP-A', character: 'Vex' },
    { expedition_id: 'EXP-A', character: 'Mira' },
    { expedition_id: 'EXP-B', character: 'Bramble' },
    { expedition_id: 'EXP-B', character: 'Sorrel' },
    { expedition_id: 'EXP-B', character: 'Nettle' },
    { expedition_id: 'EXP-C', character: 'Thorne' },
    { expedition_id: 'EXP-C', character: 'Old Grask' },
    { expedition_id: 'EXP-C', character: 'Sorrel' },
    { expedition_id: 'EXP-D', character: 'Vex' },
    { expedition_id: 'EXP-D', character: 'Bramble' },
    { expedition_id: 'EXP-D', character: 'Old Grask' },
    { expedition_id: 'EXP-E', character: 'Thorne' },
    { expedition_id: 'EXP-E', character: 'Mira' },
    { expedition_id: 'EXP-F', character: 'Bramble' },
    { expedition_id: 'EXP-G', character: 'Thorne' },
    { expedition_id: 'EXP-G', character: 'Vex' },
  ],
  characters: [],
  queryDay: 62,
};

var API = { SPEC: SPEC, RAMPS: RAMPS, CHROME: CHROME, DEMO: DEMO,
            paletteCSS: paletteCSS, buildModel: buildModel, freeOn: freeOn,
            renderChart: renderChart, chartCSS: chartCSS };

root.WMChart = API;
if (typeof module === 'object' && module.exports) module.exports = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);
