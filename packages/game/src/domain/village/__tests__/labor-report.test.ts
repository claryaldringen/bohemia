import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import type { PartInput } from '../actions';
import { laborReport } from '../labor-report';
import { laborPerDay } from '../people';
import { HARVEST_WORK_PER_HA } from '../rules';
import { advanceVillage } from '../simulate';
import type { Construction, LaborShare, VillageState } from '../types';
import { withBuiltFirstDwelling } from './village-fixtures';

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const POSITION = { x: 0, z: 0, rotation: 0 };
const OUTLINE: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
];

const field = (count = 75): PartInput[] =>
  Array.from({ length: count }, (_, i) => ({
    areaM2: 225,
    distanceM: 50 + Math.round((50 * i) / (count - 1)),
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));

const found = (day: number): VillageState =>
  foundVillage({
    seed: 42,
    day,
    dwellingPosition: POSITION,
    firstField: { outline: OUTLINE, parts: field() },
  });

const total = (shares: readonly LaborShare[]): number => shares.reduce((s, x) => s + x.manDays, 0);
const capacity = (s: VillageState): number =>
  s.people.reduce((sum, p) => sum + laborPerDay(p, s.lastDay), 0);
const of = (shares: readonly LaborShare[], activity: LaborShare['activity']): LaborShare[] =>
  shares.filter((x) => x.activity === activity);

/** Ves s hotovou zemnicí (id domácnosti), bez polí a staveb – pro stavby s kácením. */
function bare(day: number): VillageState {
  const s = withBuiltFirstDwelling(found(day));
  s.parts = [];
  s.fields = [];
  s.constructions = [];
  s.plan = null;
  s.storesKg = 5000;
  return s;
}

function dwellingSite(day: number, wood: Construction['wood'], done = 0): Construction {
  const felling = wood ? wood.fell.reduce((sum, t) => sum + t.cost, 0) : 0;
  return {
    id: 90,
    kind: 'dwelling',
    startedDay: day - 5,
    cost: 60 + felling,
    done,
    dwellingType: 'zemnice',
    position: { x: 20, z: 20, rotation: 0 },
    dwellingId: null,
    fieldId: null,
    wood,
  };
}

describe('laborReport – rozdělení práce dne', () => {
  it('ves uložená před rozdělením práce ho nemá, po dopočtu dne ano', () => {
    const day = at(600, 10, 1);
    const s0 = found(day);
    delete s0.labor;
    expect(laborReport(s0)).toBeNull();
    const s = advanceVillage(s0, day + 1, null);
    expect(laborReport(s)?.day).toBe(day + 1);
  });

  it('rozdělí celou pracovní sílu dne – domácí práce, stavba první zemnice a zakládání pole', () => {
    const day = at(600, 10, 1);
    // první den ještě není hotový žádný díl – žádný plán, společná práce jde do staveb
    const s = advanceVillage(found(day), day, null);
    const labor = laborReport(s)!;
    expect(labor.day).toBe(day);
    // člověkodny na tisíciny – součet sedí se silou vsi
    expect(total(labor.shares)).toBeCloseTo(capacity(s), 2);
    const site = s.constructions.find((c) => c.kind === 'dwelling')!;
    const plot = s.constructions.find((c) => c.kind === 'field')!;
    expect(of(labor.shares, 'domestic')).toEqual([
      expect.objectContaining({ target: { kind: 'village' } }),
    ]);
    // zemnice nejdřív kácí své dřevo – bez vrstvy překážek (test) jde kácení bez polohy ke staveništi
    const atSite = labor.shares.filter((x) => x.target.kind === 'site' && x.target.id === site.id);
    expect(atSite.map((x) => x.activity)).toEqual(['fell']);
    expect(of(labor.shares, 'found-field')[0]?.target).toEqual({
      kind: 'field',
      id: plot.fieldId,
    });
    // společná práce šla rovným dílem do obou staveb (simulate.test – rovným dílem)
    expect(of(labor.shares, 'found-field')[0]!.manDays).toBeCloseTo(total(atSite), 2);
  });

  it('v létě se na poli plánu žne a odnáší podle sazeb, výmlat jde ke vsi', () => {
    const s = advanceVillage(found(at(600, 10, 1)), at(601, 7, 20), null);
    const labor = laborReport(s)!;
    const fieldId = s.fields[0]!.id;
    const reap = of(labor.shares, 'harvest');
    const carry = of(labor.shares, 'carry');
    expect(reap).toHaveLength(1);
    expect(reap[0]!.target).toEqual({ kind: 'field', id: fieldId });
    expect(carry[0]!.target).toEqual({ kind: 'field', id: fieldId });
    expect(reap[0]!.manDays / carry[0]!.manDays).toBeCloseTo(
      HARVEST_WORK_PER_HA.reap / HARVEST_WORK_PER_HA.carry,
      2,
    );
    const winter = laborReport(advanceVillage(s, at(601, 11, 10), null))!;
    expect(of(winter.shares, 'thresh')).toEqual([
      expect.objectContaining({ target: { kind: 'village' } }),
    ]);
    expect(of(winter.shares, 'harvest')).toEqual([]);
  });

  it('stavba obydlí nejdřív kácí – u stromů, které ještě stojí, v pořadí kácení', () => {
    const day = at(600, 10, 1);
    const s0 = bare(day);
    const fell = [101, 102, 103, 104].map((id) => ({ id, cost: 4 }));
    s0.constructions.push(dwellingSite(day, { trees: 4, fromPile: 0, fell, felled: 0 }));
    const labor = laborReport(advanceVillage(s0, day, null))!;
    expect(of(labor.shares, 'fell')).toEqual([
      expect.objectContaining({ target: { kind: 'trees', ids: [101, 102, 103] } }),
    ]);
    expect(of(labor.shares, 'build')).toEqual([]);
    expect(of(labor.shares, 'idle')).toEqual([]);
  });

  it('den, kdy kácení skončí: kácí se u posledního stromu a zbytek práce se staví', () => {
    const day = at(600, 10, 1);
    const s0 = bare(day);
    const fell = [101, 102].map((id) => ({ id, cost: 4 }));
    s0.constructions.push(dwellingSite(day, { trees: 2, fromPile: 0, fell, felled: 1 }, 7.75));
    const s = advanceVillage(s0, day, null);
    const labor = laborReport(s)!;
    const felling = of(labor.shares, 'fell');
    expect(felling).toEqual([
      { activity: 'fell', target: { kind: 'trees', ids: [102] }, manDays: 0.25 },
    ]);
    const common = s.commonLaborHistory.at(-1)!;
    expect(of(labor.shares, 'build')[0]?.manDays).toBeCloseTo(common - 0.25, 3);
    expect(of(labor.shares, 'build')[0]?.target).toEqual({ kind: 'site', id: 90 });
  });

  it('přestavba se staví u obydlí; bez staveb společná práce propadne (nečinní)', () => {
    const day = at(600, 10, 1);
    const s0 = bare(day);
    const idle = laborReport(advanceVillage(s0, day, null))!;
    expect(of(idle.shares, 'idle')).toHaveLength(1);
    expect(of(idle.shares, 'build')).toEqual([]);
    const dwellingId = s0.dwellings[0]!.id;
    s0.constructions.push({
      ...dwellingSite(day, undefined),
      kind: 'rebuild',
      position: null,
      dwellingId,
    });
    const rebuild = laborReport(advanceVillage(s0, day, null))!;
    expect(of(rebuild.shares, 'build')[0]?.target).toEqual({ kind: 'dwelling', id: dwellingId });
    expect(of(rebuild.shares, 'idle')).toEqual([]);
  });

  it('vymřelá ves nepracuje – rozdělení posledního dne se neukazuje', () => {
    const day = at(600, 10, 1);
    const s = advanceVillage(found(day), day + 1, null);
    expect(laborReport(s)).not.toBeNull();
    expect(laborReport({ ...s, extinctDay: day + 1 })).toBeNull();
  });

  it('po kouscích dá stejné rozdělení jako jedním voláním', () => {
    const start = found(at(600, 3, 15));
    const end = start.foundedDay + 150;
    const whole = advanceVillage(start, end, null);
    let chunked = start;
    for (const days of [1, 7, 30, 2, 200]) {
      chunked = advanceVillage(chunked, Math.min(end, chunked.lastDay + days), null);
    }
    expect(laborReport(chunked)).toEqual(laborReport(whole));
  });
});
