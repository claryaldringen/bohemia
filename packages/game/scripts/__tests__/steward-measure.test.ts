import { describe, expect, it } from 'vitest';
import { SOWERS } from '../../src/domain/village/rules';
import {
  formatCompare,
  formatRows,
  hardFailures,
  isRestedIdle,
  overheadTarget,
  landscapeGroups,
  runDynasty,
  summarize,
  threadClock,
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
    expect(statuses['Vzdálenost dílů m']).toBe('info');
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

  it('kritéria plánu úloh: využití oběhu, založení, malé odchody a vsi, chůze bez A', () => {
    const steward = result({
      restedIdleShare: 0.3,
      fieldOverhead: 0.4,
      labor: { founding: 100, reclaim: 300, field: 1000 },
      foundedHa: 2,
      departureSizes: [1, 6],
      tinyVillages: 1,
      sownWalkM: 300,
    });
    const rows = summarize([steward]);
    const status = (prefix: string): string | undefined =>
      rows.find((r) => r.name.startsWith(prefix))?.status;
    expect(status('Využití oběhu')).toBe('MIMO');
    // založení + vracení jen info; vracení 30 % nad mez oběhu motykou (≈ 19 %)
    expect(status('Založení + vracení')).toBe('info');
    expect(rows.find((r) => r.name.startsWith('Založení + vracení'))?.measured).toBe(
      '40 % (založení 10 %, 50 čd na ha polí)',
    );
    expect(status('Vracení přílohu')).toBe('MIMO');
    expect(status('Odchody synů o ≤ 2')).toBe('MIMO');
    expect(status('Vsi rodu o ≤ 2')).toBe('MIMO');
    expect(hardFailures(rows).map((r) => r.name)).toEqual(['Vsi rodu o ≤ 2 lidech kdykoli (B)']);
    expect(status('Chůze vážená osevem')).toBe('MIMO');
    expect(status('Vzdálenost dílů')).toBe('info');
    // odpočatá půda ladem 10 % = využití 0,9 (rezerva polí 1,1 dá ≈ 0,91)
    const good = summarize([
      result({
        restedIdleShare: 0.1,
        fieldOverhead: 0.3,
        // vracení 15 % pod mez oběhu motykou (≈ 19 % – 3 osevy, přílohová soustava 10. 11. 2026)
        labor: { founding: 100, reclaim: 150, field: 1000 },
        departureSizes: [6],
        tinyVillages: 0,
      }),
    ]);
    expect(good.find((r) => r.name.startsWith('Využití oběhu'))?.status).toBe('OK');
    expect(good.find((r) => r.name.startsWith('Vracení přílohu'))?.status).toBe('OK');
    expect(hardFailures(good)).toEqual([]);
    expect(good.find((r) => r.name.startsWith('Odchody synů o'))?.measured).toContain('0 z 1');
  });

  it('odpočatá půda ladem: díl hotový k osevu a odpočatý příloh, ne osetý ani odpočívající díl', () => {
    expect(isRestedIdle({ state: 'ready', fertilityShare: 1 })).toBe(true);
    expect(isRestedIdle({ state: 'fallow', fertilityShare: 0.95 })).toBe(true);
    // příloh na 0,91 (4 roky ze 5) ještě odpočívá – osev by ho vyčerpal pod 70 %
    expect(isRestedIdle({ state: 'fallow', fertilityShare: 0.91 })).toBe(false);
    expect(isRestedIdle({ state: 'sown', fertilityShare: 1 })).toBe(false);
  });

  it('výčet po vsích jde po seedech vzestupně, ne v pořadí kontrolního bodu', () => {
    const rows = summarize([
      result({ seed: 28, sownShare: 0.3, restedIdleShare: 0.3 }),
      result({ seed: 3, sownShare: 0.1, restedIdleShare: 0.1 }),
      result({ seed: 17, sownShare: 0.2, restedIdleShare: 0.2 }),
    ]);
    // využití = 1 − odpočatá půda ladem: seed 3 → 0,90, 17 → 0,80, 28 → 0,70
    expect(rows.find((r) => r.name.startsWith('Využití oběhu'))?.measured).toContain(
      '(0,90 0,80 0,70)',
    );
    // osev ÷ ustálený oběh = podíl × ROTATION_FACTOR (3,4) – jen info, s orbou bývá nad 1
    const sown = rows.find((r) => r.name.startsWith('Osev ÷ osev ustáleného'));
    expect(sown?.measured).toContain('(0,34 0,68 1,02)');
    expect(sown?.status).toBe('info');
  });

  it('cíl založení + vracení: vracení přílohu oběhu (1 ze 3 let osevu) a zakládání při růstu', () => {
    // bez nástrojů: vracení louky 100 ÷ 3 = 33,3 čd na osetý ha (přílohová soustava – 3 osevy,
    // 10. 11. 2026; dřív 100 ÷ 2) z polní práce 178,7 čd (setí motykou 3,3 místo 10 čd/ha –
    // rozsévač za spřežením, 9. 11. 2026; zprůměrovaná žeň 23 místo 30 čd/ha – fields.md, Práce,
    // 10. 11. 2026)
    const reclaim = 100 / 3;
    const fieldWork = 142 + reclaim + 1 / SOWERS.hoeHaPerDay;
    expect(overheadTarget(0)).toBeCloseTo(reclaim / fieldWork, 6);
    // růst 5 % za rok: zakládání 0,05 × 3,4 × 100 = 17 čd navíc
    expect(overheadTarget(0.05)).toBeCloseTo((reclaim + 17) / fieldWork, 6);
  });

  it('starší kontrolní bod bez nových kritérií: pomlčka, ne chyba', () => {
    const rows = summarize([result({})]);
    expect(rows.find((r) => r.name.startsWith('Využití oběhu'))?.status).toBe('–');
    expect(rows.find((r) => r.name.startsWith('Vsi rodu o ≤ 2'))?.status).toBe('–');
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
  it('hodiny měří čas CPU vlákna – čekání se nepočítá', async () => {
    const start = threadClock();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(threadClock() - start).toBeLessThan(40);
    let x = 0;
    const busy = threadClock();
    for (let i = 0; i < 2e7; i++) x += i;
    expect(x).toBeGreaterThan(0);
    expect(threadClock() - busy).toBeGreaterThan(0);
  });

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
