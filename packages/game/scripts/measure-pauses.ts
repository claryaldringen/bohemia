/**
 * Měření nejdelších úseků dopočtu bez přestávky (skok o rok): uložená ves se čte z vývojové DB
 * (jen čtení), počítá se v paměťovém repozitáři, nic se nezapisuje.
 *   npx tsx packages/game/scripts/measure-pauses.ts [--days 365] [--runs 3] [--no-pause]
 */
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { generateLandscapeAttempt } from '../src/domain/landscape';
import { updateVillage } from '../src/application/update-village';
import type { Pause } from '../src/application/villages';
import type { VillageState } from '../src/domain/village';
import { SingleVillageRepository } from './lib/memory-villages';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

const PSQL = '/opt/homebrew/opt/postgresql@17/bin/psql';
const row = execFileSync(
  PSQL,
  [
    '-U',
    'postgres',
    '-d',
    'bohemia',
    '-At',
    '-F',
    '\t',
    '-c',
    `select s.landscape_seed, s.layer_versions::text, v.state::text from village v join settlement s on s.id = v.settlement_id where v.id='3af7269a-5efd-4755-bb08-2dc45aa21ea5'`,
  ],
  { maxBuffer: 1 << 28, encoding: 'utf8' },
).trimEnd();
const [seed, versions, stateText] = row.split('\t') as [string, string, string];
const landscape = generateLandscapeAttempt(Number(seed), JSON.parse(versions));
const original = JSON.parse(stateText) as VillageState;
const days = Number(arg('days', '365'));
const runs = Number(arg('runs', '3'));
const usePauses = !process.argv.includes('--no-pause');

for (let run = 0; run < runs; run++) {
  const repo = new SingleVillageRepository('s', 'Vlkov', structuredClone(original));
  const gaps: { ms: number; from: string; to: string }[] = [];
  let last = performance.now();
  let lastLabel = 'start';
  let n = 0;
  const mark = (label: string): void => {
    const now = performance.now();
    gaps.push({ ms: now - last, from: lastLabel, to: label });
    last = now;
    lastLabel = label;
  };
  const pause: Pause = (day) => {
    n++;
    mark(day === undefined ? `krok#${n}` : `den ${day}`);
    return null;
  };
  const t0 = performance.now();
  const result = await updateVillage(
    repo,
    'village-1',
    original.lastDay + days,
    landscape,
    (state) => ({ ok: true, state }),
    usePauses ? pause : undefined,
  );
  mark('konec');
  const total = performance.now() - t0;
  gaps.sort((a, b) => b.ms - a.ms);
  console.log(`běh ${run + 1}: celkem ${total.toFixed(0)} ms, ok=${result.ok}, přestávek ${n}`);
  for (const g of gaps.slice(0, 5)) console.log(`  ${g.ms.toFixed(0)} ms  ${g.from} -> ${g.to}`);
}
