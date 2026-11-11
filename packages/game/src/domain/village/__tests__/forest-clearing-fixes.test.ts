import { describe, expect, it } from 'vitest';
import { clearingFellCost, clearingStage, fellDueTrees } from '../forest-clearing';
import { giveWayToRoads } from '../land-taken';
import { advanceVillage } from '../simulate';
import { logsFromClearedTrees } from '../wood';
import { build } from '../simulate-build';
import type { VillageState } from '../types';
import { forestVillage, layer, OCTOBER, watched } from './forest-clearing-fixtures';

// Opravy klučení po recenzi: zmenšený a odebraný díl (land-taken) a pojistka schnutí.

const logsTotal = (s: VillageState): number => s.woodLogs ?? 0; // hromady u lesa jsou součástí woodLogs
/** Dopočet o `days` dní, aby část stromů padla. */
function advanced(days: number): VillageState {
  let s = forestVillage(OCTOBER);
  for (let d = OCTOBER + 1; d <= OCTOBER + days; d++) s = advanceVillage(s, d, layer);
  return s;
}
const land = (id: number, roadM2: number) => new Map([[id, { roadM2, cutM2: 0, cut: null }]]);

describe('zmenšený a odebraný díl v lese', () => {
  it('zmenšený díl zkrátí stojící stromy úměrně, padlé zůstanou', () => {
    const s = forestVillage(OCTOBER);
    const p = watched(s);
    const n = p.clearing!.fell.length;
    expect(n).toBeGreaterThanOrEqual(4);
    p.clearing!.felled = 1;
    giveWayToRoads(s, OCTOBER, land(p.id, 112.5), 225);
    const after = watched(s);
    expect(after.areaM2).toBeCloseTo(112.5);
    expect(after.clearing!.felled).toBe(1);
    expect(after.clearing!.fell.length).toBe(1 + Math.round((n - 1) * 0.5));
    expect(after.clearing!.fell.length).toBeLessThan(n);
  });

  it('odebraný díl: klády jen za nepokácené dospělé, záznamy pokácených zmizí', () => {
    const s = advanced(0);
    const p = watched(s);
    p.foundingDone = 0.7 * clearingFellCost(p);
    fellDueTrees(s, p, OCTOBER);
    expect(p.clearing!.felled).toBeGreaterThan(0);
    const ids = p.clearing!.fell.map((t) => t.id);
    const standing = p.clearing!.fell.slice(p.clearing!.felled).filter((t) => t.log).length;
    const before = logsTotal(s);
    expect((s.felledTrees ?? []).some((f) => ids.includes(f.id))).toBe(true);
    giveWayToRoads(s, OCTOBER + 2, land(p.id, 225), 225);
    expect(watched(s)).toBeUndefined();
    expect(logsTotal(s) - before).toBe(logsFromClearedTrees(standing));
    expect((s.felledTrees ?? []).some((f) => ids.includes(f.id))).toBe(false);
  });

  it('zmenšený díl: částečný burnCost úměrný ceně', () => {
    const s = forestVillage(OCTOBER);
    const p = watched(s);
    const ratio = p.clearing!.burnCost / p.foundingCost;
    giveWayToRoads(s, OCTOBER, land(p.id, 112.5), 225);
    const after = watched(s);
    expect(after.clearing!.burnCost / after.foundingCost).toBeCloseTo(ratio);
  });
});

describe('pojistka schnutí', () => {
  it('díl s nulovou prací kácení dostane felledDay a nezůstane ve fázi schnutí bez konce', () => {
    const s = forestVillage(OCTOBER);
    const p = watched(s);
    p.foundingCost = p.clearing!.burnCost; // práce kácení = 0
    p.foundingDone = 0;
    expect(p.clearing!.felledDay).toBeUndefined();
    s.constructions.find((c) => c.kind === 'field')!.cost = s.parts.reduce(
      (a, x) => a + x.foundingCost,
      0,
    );
    build(s, OCTOBER, 0);
    expect(watched(s).clearing!.felledDay).toBe(OCTOBER);
    expect(clearingStage(watched(s), OCTOBER + 1)).toBe('dry');
    fellDueTrees(s, watched(s), OCTOBER);
  });
});
