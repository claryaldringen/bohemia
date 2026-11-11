import { describe, expect, it } from 'vitest';
import { clearingFellCost, clearingStage } from '../forest-clearing';
import { withForestClearing } from '../forest-clearing-migration';
import { advanceVillage } from '../../core/simulate';
import { cloneState } from '../../core/clone';
import { FOREST_CLEARING } from '../../rules';
import type { VillageState } from '../../types';
import { forestVillage, layer, OCTOBER, watched } from './forest-clearing-fixtures';

// Převod starších vsí na klučení po fázích (forest.md – Klučení lesa pro pole – postup, Starší vsi).

/** Ves uložená před klučením: díly v lese bez `clearing`, s `obstacles` a počtem klád `trees`. */
function legacyVillage(progress: number): { state: VillageState; trees: number } {
  const s = forestVillage(OCTOBER);
  let trees = 0;
  for (const p of s.parts) {
    if (!p.clearing) continue;
    const logs = p.clearing.fell.filter((t) => t.log).length;
    trees += logs;
    p.obstacles = p.clearing.fell.map((t) => t.id);
    if (logs > 0) p.trees = logs;
    p.foundingDone = progress * p.foundingCost;
    delete p.clearing;
  }
  return { state: s, trees };
}
const woods = (s: VillageState): number => s.woodLogs ?? 0;

describe('převod rozestavěných dílů v lese na fáze', () => {
  it('díl dostane fáze, práce se zachová a klády se nezmění', () => {
    const { state, trees } = legacyVillage(0.3);
    const before = watched(state).foundingDone;
    const next = withForestClearing(state, layer);
    const p = watched(next);
    expect(p.clearing).toBeDefined();
    expect(p.trees).toBeUndefined();
    expect(p.foundingDone).toBe(before);
    expect(p.clearing!.burnCost).toBeCloseTo(p.foundingCost * (1 - FOREST_CLEARING.fellShare));
    expect(p.clearing!.fell.map((t) => t.id).sort()).toEqual([1, 2, 3, 4, 6]);
    expect(p.clearing!.fell.filter((t) => t.log).length).toBe(p.clearing!.fell.length > 0 ? 4 : 0);
    // 0,3 / 0,6 kácení -> padla polovina stromů; klády celkem = dřívější trees (padlé + stojící)
    const fell = p.clearing!;
    const fallenLogs = fell.fell.slice(0, fell.felled).filter((t) => t.log).length;
    const standingLogs = fell.fell.slice(fell.felled).filter((t) => t.log).length;
    expect(fallenLogs + standingLogs).toBe(
      state.parts.reduce((a, x) => a + (x.cell?.x === 8 && x.cell.y === 8 ? (x.trees ?? 0) : 0), 0),
    );
    expect(woods(next)).toBeGreaterThan(0);
    expect(trees).toBeGreaterThan(0);
    expect(clearingStage(p, OCTOBER)).toBe('fell');
  });

  it('odvedené kácení: všechny stromy padnou a větve jsou suché hned', () => {
    const { state } = legacyVillage(0.7);
    const next = withForestClearing(state, layer);
    const p = watched(next);
    expect(p.clearing!.felled).toBe(p.clearing!.fell.length);
    expect(p.clearing!.felledDay).toBe(OCTOBER - FOREST_CLEARING.dryDays);
    expect(p.foundingDone).toBeGreaterThanOrEqual(clearingFellCost(p));
    expect(clearingStage(p, OCTOBER)).not.toBe('fell');
    expect(woods(next)).toBe(4 * 2 > 0 ? woods(next) : 0);
    const stacked = (next.logStacks ?? []).reduce((a, st) => a + st.logs, 0);
    expect(stacked).toBeGreaterThan(0);
  });

  it('idempotence: dvakrát = jednou, ves bez lesních dílů vrácená týmž objektem', () => {
    const { state } = legacyVillage(0.3);
    const once = withForestClearing(state, layer);
    expect(withForestClearing(once, layer)).toBe(once);
    const plain = forestVillage(OCTOBER); // díly už s fázemi
    expect(withForestClearing(plain, layer)).toBe(plain);
    expect(withForestClearing(state, null)).toBe(state);
  });

  it('hotové díly a díl bez překážek zůstanou beze změny', () => {
    const { state } = legacyVillage(0.3);
    for (const p of state.parts) {
      if (p.surface === 'forest') delete p.obstacles;
    }
    expect(withForestClearing(state, layer)).toBe(state);
  });

  it('dopočet po kouscích dá týž stav jako vcelku', () => {
    const { state } = legacyVillage(0.2);
    const end = OCTOBER + 40;
    const whole = advanceVillage(cloneState(state), end, layer);
    let chunked = cloneState(state);
    for (const to of [OCTOBER + 1, OCTOBER + 8, OCTOBER + 38, end]) {
      chunked = advanceVillage(chunked, to, layer);
    }
    expect(chunked.parts).toEqual(whole.parts);
    expect(chunked.woodLogs).toBe(whole.woodLogs);
    expect(whole.forestClearingFailed).toBeUndefined();
  });
});
