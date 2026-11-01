import { describe, expect, it } from 'vitest';
import {
  formatCompare,
  formatRows,
  landscapeGroups,
  runDynasty,
  summarize,
  villageTasks,
  type DynastyResult,
} from '../lib/steward-measure';

function result(over: Partial<DynastyResult>): DynastyResult {
  return {
    group: 'lesnatá',
    seed: 1,
    strategy: 'steward',
    years: 10,
    snapshots: [
      { year: 5, people: 10 },
      { year: 10, people: 20 },
    ],
    villages: 1,
    departures: 0,
    hungerDeaths: 0,
    hungerBeginnings: 0,
    hungryDays: 0,
    bufferAvg: 0.95,
    bufferMin: 0.6,
    fertilityShare: 0.9,
    fieldHa: 10,
    walkM: 100,
    steadyPeoplePerHa: 2,
    ms: { total: 1000, steward: 20, maxStewardDay: 50 },
    ...over,
  };
}

describe('měření správce – skupiny krajin', () => {
  it('jsou deterministické, disjunktní a mají pět skupin', () => {
    const first = landscapeGroups(10, 2);
    expect(landscapeGroups(10, 2)).toEqual(first);
    expect(first).toHaveLength(5);
    const seeds = first.flatMap((g) => g.seeds);
    expect(seeds).toHaveLength(10);
    expect(new Set(seeds).size).toBe(10);
  });

  it('malý vzorek skupiny nenaplní', () => {
    expect(() => landscapeGroups(4, 1)).toThrow(RangeError);
  });

  it('úlohy střídají skupiny a respektují počet', () => {
    const tasks = villageTasks(
      [
        { name: 'a', seeds: [1, 2] },
        { name: 'b', seeds: [3, 4] },
      ],
      3,
    );
    expect(tasks).toEqual([
      { group: 'a', seed: 1 },
      { group: 'b', seed: 3 },
      { group: 'a', seed: 2 },
    ]);
  });
});

describe('měření správce – tabulka', () => {
  const player = result({
    strategy: 'player',
    snapshots: [
      { year: 5, people: 10 },
      { year: 10, people: 16 },
    ],
    walkM: 150,
    hungerDeaths: 3,
  });

  it('kritéria splněna: samé OK', () => {
    const rows = summarize([player, result({})]);
    const statuses = Object.fromEntries(rows.map((r) => [r.name.split(' (')[0], r.status]));
    expect(statuses['Lidé rodu za 10 let']).toBe('OK');
    expect(statuses['Úmrtí hladem na rod']).toBe('OK');
    expect(statuses['Čas správce z dopočtu / nejdražší den']).toBe('OK');
    expect(statuses['Vzdálenost dílů m']).toBe('OK');
    expect(rows.find((r) => r.name.startsWith('Lidí na ha'))?.measured).toContain('100 %');
  });

  it('kritéria porušena: MIMO', () => {
    // krátký běh (10 let) – cíle rychlého měření (≤ 5 úmrtí, pojistka ≥ 0,6)
    const bad = result({
      hungerDeaths: 6,
      bufferAvg: 0.5,
      bufferMin: 0.2,
      fertilityShare: 0.5,
      ms: { total: 1000, steward: 100, maxStewardDay: 300 },
      snapshots: [
        { year: 5, people: 10 },
        { year: 10, people: 17 },
      ],
    });
    const rows = summarize([player, bad]);
    const status = (prefix: string): string | undefined =>
      rows.find((r) => r.name.startsWith(prefix))?.status;
    expect(status('Lidé rodu za 10')).toBe('MIMO');
    expect(status('Úmrtí hladem')).toBe('MIMO');
    expect(status('Pojistka')).toBe('MIMO');
    expect(status('Úrodnost')).toBe('MIMO');
    expect(status('Čas správce')).toBe('MIMO');
  });

  it('kritéria plánu úloh: podíl osevu, založení, malé odchody, chůze bez A', () => {
    const steward = result({
      sownShare: 0.3,
      fieldOverhead: 0.4,
      departureSizes: [1, 6],
      sownWalkM: 300,
    });
    const rows = summarize([steward]);
    const status = (prefix: string): string | undefined =>
      rows.find((r) => r.name.startsWith(prefix))?.status;
    expect(status('Podíl osevu')).toBe('MIMO');
    expect(status('Založení + vracení')).toBe('MIMO');
    expect(status('Odchody synů o ≤ 2')).toBe('MIMO');
    expect(status('Chůze vážená osevem')).toBe('MIMO');
    expect(status('Vzdálenost dílů')).toBe('OK');
    const good = summarize([result({ sownShare: 0.5, fieldOverhead: 0.1, departureSizes: [6] })]);
    expect(good.find((r) => r.name.startsWith('Podíl osevu'))?.status).toBe('OK');
    expect(good.find((r) => r.name.startsWith('Odchody synů o'))?.measured).toContain('0 z 1');
  });

  it('starší kontrolní bod bez nových kritérií: pomlčka, ne chyba', () => {
    const rows = summarize([result({})]);
    expect(rows.find((r) => r.name.startsWith('Podíl osevu'))?.status).toBe('–');
    expect(rows.find((r) => r.name.startsWith('Chůze vážená'))?.status).toBe('–');
  });

  it('tabulka před → po spáruje řádky podle jména', () => {
    const text = formatCompare(summarize([result({ walkM: 300 })]), summarize([result({})]));
    expect(text).toMatch(/Vzdálenost dílů m \(A \/ B\).*– \/ 300 {2}→ {2}– \/ 100/);
  });

  it('formátuje zarovnané řádky', () => {
    const lines = formatRows(summarize([player, result({})])).split('\n');
    expect(lines.length).toBeGreaterThan(8);
    expect(lines.every((l) => /(OK|MIMO|info|–)$/.test(l))).toBe(true);
  });
});

describe('měření správce – běh', () => {
  it('rok rodu je s pevnými hodinami opakovatelný a nese snímky jen do délky běhu', () => {
    const [group] = landscapeGroups(5, 1);
    const seed = group?.seeds[0] ?? 0;
    const run = (): DynastyResult =>
      runDynasty({ group: 'x', seed, strategy: 'steward', years: 1, clock: () => 0 });
    const first = run();
    expect(run()).toEqual(first);
    expect(first.snapshots).toEqual([]);
    expect(first.villages).toBe(1);
    expect(first.departureSizes).toEqual([]);
    expect(first.villageYears).toBeCloseTo(1, 1);
  }, 120_000);
});
