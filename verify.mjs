// verify.mjs — run `node verify.mjs` to check the renderer against the golden file.
// Run `node verify.mjs --write` to regenerate it after a deliberate, version-bumped change.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildModel, renderChart, DEMO, SPEC } = require('./chart.js');

const REF = new URL('./reference.svg', import.meta.url);
const generated = renderChart(buildModel(DEMO)) + '\n';

if (process.argv.includes('--write')) {
  writeFileSync(REF, generated);
  console.log(`wrote reference.svg from SPEC v${SPEC.version}`);
  process.exit(0);
}

if (!existsSync(REF)) {
  console.error('reference.svg missing. Run: node verify.mjs --write');
  process.exit(1);
}

const expected = readFileSync(REF, 'utf8');
if (generated === expected) {
  console.log(`chart matches reference.svg (SPEC v${SPEC.version})`);
  process.exit(0);
}

const g = generated.split('\n');
const e = expected.split('\n');
console.error('CHART DRIFT DETECTED\n');
for (let i = 0; i < Math.max(g.length, e.length); i++) {
  if (g[i] !== e[i]) {
    console.error(`line ${i + 1}`);
    console.error(`  reference: ${e[i] ?? '(end of file)'}`);
    console.error(`  generated: ${g[i] ?? '(end of file)'}`);
  }
}
console.error('\nIf this change was intentional: bump SPEC.version, then run node verify.mjs --write');
process.exit(1);
