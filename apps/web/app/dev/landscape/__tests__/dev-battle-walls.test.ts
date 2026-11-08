import { describe, expect, it } from 'vitest';
import { CURRENT_LAYER_VERSIONS, generateLandscape } from '@bohemia/game';
import type { SceneVillage } from '@/lib/village-view';
import { battleDemoWar, createBattleDemo, stepBattleDemo } from '../dev-battle';

// Ukázka útoku na hradbu (plán hradeb Úloha 21): na palisádě s ochozem stojí obránci, opřou se
// žebříky a u paty se nanosí otepi a zapálí.
describe('ukázka Bitva – útok na hradbu', () => {
  it('obránci na ochozu, žebříky a oheň u paty', () => {
    const l = generateLandscape(1, CURRENT_LAYER_VERSIONS);
    const demo = createBattleDemo(
      'walls',
      l,
      { dwellings: [] } as unknown as SceneVillage,
      200,
      0,
    )!;
    expect(demo.battle).not.toBeNull();
    expect(demo.walls.some((w) => w.kind === 'walkway')).toBe(true);
    let onWall = 0;
    let ladders = 0;
    let climbers = 0;
    let fire = 0;
    const phases = new Set<string>();
    for (let t = 0; t < 1200 && stepBattleDemo(demo, t * 250); t++) {
      const b = battleDemoWar(demo, t * 250).battle!;
      onWall = Math.max(onWall, b.fighters.filter((f) => f.onWall).length);
      ladders = Math.max(ladders, b.ladders.filter((x) => x.up).length);
      climbers = Math.max(climbers, b.fighters.filter((f) => f.state === 'climb').length);
      for (const x of b.breaches) phases.add(`${x.method}:${x.phase}`);
      if (b.breaches.some((x) => x.phase === 'burn')) fire++;
    }
    expect(onWall).toBeGreaterThan(0);
    expect(ladders).toBeGreaterThan(0);
    expect(climbers).toBeGreaterThan(0);
    expect(fire).toBeGreaterThan(0);
    expect(phases.has('burn:burn')).toBe(true);
  });
});
