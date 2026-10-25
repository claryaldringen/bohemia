import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage, type PartInput } from '../actions';
import { expectedNetKg, sowingGroup } from '../fields';
import { expectedFlaxKg } from '../flax';
import { sowingBlocks, villageHoldings } from '../holdings';
import { expectedLegumeKg, legumeEnergy } from '../legumes';
import {
  neededSelection,
  nextSowing,
  returnPart,
  rotateAfterSeason,
  sowParts,
  sowingCropToday,
  type NeededTargets,
  type SowingKind,
} from '../rotation';
import { FERTILITY, FIELD_STORES } from '../rules';
import type { FieldPart, VillageState } from '../types';
import { createSeason, seasonCrop } from '../year-plan';

// Osevní postup po dílech (fields.md – Osevní postup po dílech a setí do konce okna, 25. 10. 2026):
// co na dílu poroste příště, plodina dne a výběr nutných dílů – čisté funkce, zatím nezapojené.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });

/** Samostatný díl 0,25 ha – čerstvě založený, pokud `over` neříká jinak. */
function part(id: number, over: Partial<FieldPart> = {}): FieldPart {
  return {
    id,
    fieldId: 1,
    areaM2: 2_500,
    distanceM: 50 + id,
    naturalFertility: 70,
    fertilityShare: 1,
    bonusUntilDay: null,
    state: 'ready',
    sownYears: 0,
    fallowSinceDay: null,
    foundingCost: 10,
    foundingDone: 10,
    surface: 'meadow',
    ...over,
  };
}

/** Odpočatý příloh (`share` přirozené úrodnosti). */
const fallow = (id: number, share: number): FieldPart =>
  part(id, { state: 'fallow', fertilityShare: share, fallowSinceDay: at(590, 9, 1) });

/** Projde díl hospodářským rokem: zaseje plodinu (nebo nic) a 1. 9. posune postup. */
function season(p: FieldPart, crop: 'winter' | 'spring' | 'legume' | 'flax' | null, year: number) {
  if (crop) sowParts([p], crop);
  rotateAfterSeason(p, at(year, 9, 1));
}

const POSITION = { x: 0, z: 0, rotation: 0 };
const OUTLINE: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
];

/** Ves s polem `count` dílů 0,25 ha od domu ven, bez plánu a staveb – díly upraví test. */
function village(count: number): VillageState {
  const parts: PartInput[] = Array.from({ length: count }, (_, i) => ({
    areaM2: 2_500,
    distanceM: 40 + 10 * i,
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));
  const s = foundVillage({
    seed: 7,
    day: at(600, 6, 1),
    dwellingPosition: POSITION,
    firstField: { outline: OUTLINE, parts },
  });
  s.constructions = [];
  s.season = null;
  for (const p of s.parts) {
    p.foundingDone = p.foundingCost;
    p.state = 'ready';
  }
  return s;
}

/** Díly v pořadí bloků přílohové soustavy (jako `neededSelection`). */
const blockOrder = (s: VillageState): number[] =>
  sowingBlocks(s.parts, villageHoldings(s))
    .flat()
    .map((p) => p.id);

// bez rezervy (`energyFloorKg` 0) jdou luštěniny před obilím – pořadí obilí do rezervy hlídá
// test „obilí do roční potřeby před luštěninami“
const NO_NEED: NeededTargets = {
  harvestKg: 0,
  energyFloorKg: 0,
  legumeKg: 0,
  flaxNeedKg: 0,
  needKg: 1_000,
};
const SEPT_1 = at(600, 9, 1);

/** Očekávaná čistá úroda dílů (kg) – o kousek méně, ať poslední díl ještě přibude. */
const netOf = (s: VillageState, ids: number[], day = SEPT_1): number =>
  ids.reduce(
    (sum, id) =>
      sum +
      expectedNetKg(
        s.parts.find((p) => p.id === id)!,
        day,
      ),
    0,
  ) - 1;

describe('postup dílu – co poroste příště', () => {
  it('stav dílu určí, co je na řadě', () => {
    expect(nextSowing(part(1))).toBe('first');
    expect(nextSowing(part(1, { next: 'spring' }))).toBe('spring');
    expect(nextSowing(part(1, { next: 'winter' }))).toBe('winter');
    expect(nextSowing(fallow(1, FERTILITY.fallowReady))).toBe('first');
    expect(nextSowing(fallow(1, 0.8))).toBe('late');
    expect(nextSowing(fallow(1, 0.5))).toBe('emergency');
    expect(nextSowing(fallow(1, 0.3))).toBe('rest');
    expect(nextSowing(part(1, { state: 'sown', crop: 'winter' }))).toBeNull();
    expect(nextSowing(part(1, { state: 'founding', foundingDone: 0 }))).toBeNull();
  });

  it('díl po ozimu i po jaři je v pořadí jako osévaný díl, čerstvý jako připravený', () => {
    expect(sowingGroup(part(1, { next: 'spring' }))).toBe(1);
    expect(sowingGroup(part(1, { next: 'winter' }))).toBe(1);
    expect(sowingGroup(part(1))).toBe(2);
  });

  it('odpočatý díl 95 %: ozim, jař, 10 let úhoru – za 12 sezón zase první osev', () => {
    const p = fallow(1, FERTILITY.fallowReady);
    season(p, 'winter', 601);
    expect(p).toMatchObject({ state: 'ready', next: 'spring', sownYears: 1 });
    expect(p.crop).toBeUndefined();
    expect(p.fertilityShare).toBeCloseTo(0.83, 9);
    season(p, 'spring', 602);
    expect(p).toMatchObject({ state: 'fallow', sownYears: 0, fallowSinceDay: at(602, 9, 1) });
    expect(p.next).toBeUndefined();
    expect(p.crop).toBeUndefined();
    expect(p.fertilityShare).toBeCloseTo(0.71, 9);
    for (let year = 603; year <= 611; year++) season(p, null, year);
    expect(nextSowing(p)).toBe('late');
    season(p, null, 612);
    expect(nextSowing(p)).toBe('first');
  });

  it('čerstvý díl 100 %: ozim, jař a úhor 8 let', () => {
    const p = part(1, { bonusUntilDay: at(602, 9, 1) });
    season(p, 'winter', 601);
    expect(p.bonusUntilDay).toBe(at(602, 9, 1));
    season(p, 'spring', 602);
    expect(p.bonusUntilDay).toBeNull();
    for (let year = 603; year <= 609; year++) season(p, null, year);
    expect(nextSowing(p)).toBe('late');
    season(p, null, 610);
    expect(nextSowing(p)).toBe('first');
  });

  it('jař jako první osev (ozim nestihla) dostane příště ozim, pak úhor (Martin 25. 10. 2026)', () => {
    const p = fallow(1, FERTILITY.fallowReady);
    season(p, 'spring', 601);
    expect(p).toMatchObject({ state: 'ready', next: 'winter', sownYears: 1 });
    expect(nextSowing(p)).toBe('winter');
    season(p, 'winter', 602);
    expect(p).toMatchObject({ state: 'fallow', sownYears: 0 });
    expect(p.fertilityShare).toBeCloseTo(0.71, 9);
  });

  it('starší díl, který po jaři prvním osevem nesmí dál (pod 70 %), jde do úhoru', () => {
    const p = part(1, { state: 'fallow', fertilityShare: 0.8, fallowSinceDay: at(590, 9, 1) });
    season(p, 'spring', 601);
    expect(p.state).toBe('fallow');
    expect(nextSowing(p)).toBe('emergency');
  });

  it('luštěniny po ozimu: úhor 4 roky; len po ozimu: úhor 12 let', () => {
    const legume = fallow(1, FERTILITY.fallowReady);
    season(legume, 'winter', 601);
    season(legume, 'legume', 602);
    expect(legume.state).toBe('fallow');
    expect(legume.fertilityShare).toBeCloseTo(0.86, 9);
    for (let year = 603; year <= 605; year++) season(legume, null, year);
    expect(nextSowing(legume)).toBe('late');
    season(legume, null, 606);
    expect(nextSowing(legume)).toBe('first');

    const flax = fallow(2, FERTILITY.fallowReady);
    season(flax, 'winter', 601);
    season(flax, 'flax', 602);
    expect(flax.state).toBe('fallow');
    for (let year = 603; year <= 613; year++) season(flax, null, year);
    expect(nextSowing(flax)).not.toBe('first');
    season(flax, null, 614);
    expect(nextSowing(flax)).toBe('first');
  });

  it('luštěniny ani len jako první osev nemají druhý osev; nouzový osev jde do úhoru', () => {
    const legume = fallow(1, FERTILITY.fallowReady);
    season(legume, 'legume', 601);
    expect(legume.state).toBe('fallow');
    const emergency = fallow(2, 0.6);
    season(emergency, 'winter', 601);
    expect(emergency.state).toBe('fallow');
    expect(emergency.fertilityShare).toBeCloseTo(0.48, 9);
  });

  it('díl na řadě, který se v sezóně neosel, čeká dál; `next` zmizí až s koncem sezóny', () => {
    const p = part(1, { next: 'spring', sownYears: 1, fertilityShare: 0.83 });
    rotateAfterSeason(p, at(601, 9, 1));
    expect(p).toMatchObject({ state: 'ready', next: 'spring', fertilityShare: 0.83 });
    sowParts([p], 'spring');
    expect(p).toMatchObject({ state: 'sown', crop: 'spring', next: 'spring' });
    rotateAfterSeason(p, at(602, 9, 1));
    expect(p.next).toBeUndefined();
    expect(p.state).toBe('fallow');
  });

  it('vyřazený díl se vrátí, jak byl – příloh ladem od dřív, hotový díl na řadě', () => {
    const ready = part(1, { next: 'spring', sownYears: 1, fertilityShare: 0.83 });
    const lying = part(2, {
      state: 'fallow',
      fallowSinceDay: at(590, 9, 1),
      overgrowthYears: 3,
      fertilityShare: 0.97,
    });
    sowParts([ready, lying], 'spring');
    expect(lying).toMatchObject({ state: 'sown', fallowSinceDay: null });
    returnPart(ready, at(600, 9, 1));
    returnPart(lying, at(600, 9, 1));
    expect(ready).toMatchObject({ state: 'ready', next: 'spring', sownYears: 1 });
    expect(ready.crop).toBeUndefined();
    expect(lying).toMatchObject({
      state: 'fallow',
      fallowSinceDay: at(590, 9, 1),
      overgrowthYears: 3,
      sownYears: 0,
    });
    expect(lying.crop).toBeUndefined();
    expect(lying.fallowBeforePlan).toBeUndefined();
    expect(nextSowing(lying)).toBe('first');
  });
});

describe('plodina dne', () => {
  const kinds: SowingKind[] = ['first', 'winter', 'late', 'emergency'];
  it('první osev: ozim, dokud po dnešku zbývá den setí ozimu, pak jař v oknech kopání', () => {
    for (const kind of kinds) {
      expect(sowingCropToday(kind, at(600, 10, 29))).toBe('winter');
      expect(sowingCropToday(kind, at(600, 10, 30))).toBe('winter');
      expect(sowingCropToday(kind, at(600, 10, 31))).toBe('spring');
      expect(sowingCropToday(kind, at(601, 3, 1))).toBe('spring');
      expect(sowingCropToday(kind, at(601, 4, 29))).toBe('spring');
      expect(sowingCropToday(kind, at(601, 4, 30))).toBeNull();
    }
  });

  it('díl po ozimu jen jař; odpočívající nic', () => {
    expect(sowingCropToday('spring', at(600, 9, 1))).toBe('spring');
    expect(sowingCropToday('spring', at(600, 10, 29))).toBe('spring');
    expect(sowingCropToday('spring', at(600, 10, 30))).toBe('spring');
    expect(sowingCropToday('spring', at(600, 10, 31))).toBe('spring');
    expect(sowingCropToday('spring', at(600, 12, 15))).toBeNull();
    expect(sowingCropToday('spring', at(601, 3, 1))).toBe('spring');
    expect(sowingCropToday('spring', at(601, 4, 29))).toBe('spring');
    expect(sowingCropToday('spring', at(601, 4, 30))).toBeNull();
    expect(sowingCropToday('rest', at(600, 9, 1))).toBeNull();
    expect(sowingCropToday(null, at(600, 9, 1))).toBeNull();
  });
});

describe('výběr nutných dílů', () => {
  it('bez potřeby nic nepřibude', () => {
    expect(neededSelection(village(6), SEPT_1, NO_NEED)).toEqual({ join: [], release: [] });
  });

  it('obilí v pořadí bloků, dokud očekávaná úroda nepokryje potřebu – na podzim ozim', () => {
    const s = village(8);
    const order = blockOrder(s);
    const harvestKg = netOf(s, order.slice(0, 3));
    const { join, release } = neededSelection(s, SEPT_1, { ...NO_NEED, harvestKg });
    expect(join).toEqual(order.slice(0, 3).map((id) => ({ id, crop: 'winter' })));
    expect(release).toEqual([]);
    // po 30. 10. první osev už jen jař
    const late = neededSelection(s, at(600, 11, 5), { ...NO_NEED, harvestKg });
    expect(late.join.map((j) => j.crop)).toEqual(['spring', 'spring', 'spring']);
    // mimo okna nic
    expect(neededSelection(s, at(600, 12, 15), { ...NO_NEED, harvestKg }).join).toEqual([]);
  });

  it('díl po jaři prvním osevem (`next: winter`): ozim do konce okna setí ozimu, pak záložní jař', () => {
    const s = village(8);
    const order = blockOrder(s);
    const after = s.parts.slice(5);
    for (const p of after) Object.assign(p, { next: 'winter', sownYears: 1, fertilityShare: 0.83 });
    const ids = after.map((p) => p.id);
    // díly po prvním osevu jsou v pořadí bloků před čerstvými
    expect(blockOrder(s).slice(0, 3).sort()).toEqual([...ids].sort());
    expect(order).toHaveLength(8);
    const harvestKg = netOf(s, ids);
    const autumn = neededSelection(s, SEPT_1, { ...NO_NEED, harvestKg }).join;
    expect(autumn.map((j) => j.id).sort()).toEqual([...ids].sort());
    expect(autumn.every((j) => j.crop === 'winter')).toBe(true);
    const late = neededSelection(s, at(600, 11, 5), { ...NO_NEED, harvestKg }).join;
    expect(late.map((j) => j.id).sort()).toEqual([...ids].sort());
    expect(late.every((j) => j.crop === 'spring')).toBe(true);
    // len ani luštěniny díl po jaři neberou – jsou místo jaře, ne místo ozimu
    const side = neededSelection(s, at(601, 3, 10), { ...NO_NEED, legumeKg: 1e9, flaxNeedKg: 1e9 });
    expect(side.join.filter((j) => ids.includes(j.id))).toEqual([]);
  });

  it('len a luštěniny jen v den, kdy může začít jař', () => {
    const s = village(8);
    const targets = { ...NO_NEED, legumeKg: 1e9, flaxNeedKg: 1e9 };
    expect(neededSelection(s, at(600, 12, 15), targets).join).toEqual([]);
    expect(neededSelection(s, at(601, 4, 30), targets).join).toEqual([]);
    const crops = new Set(
      neededSelection(s, at(601, 4, 29), { ...targets, flaxNeedKg: 1 }).join.map((j) => j.crop),
    );
    expect(crops).toEqual(new Set(['legume', 'flax']));
  });

  it('díly po ozimu jsou na řadě před čerstvými – s jaří', () => {
    const s = village(8);
    const after = s.parts.slice(4).map((p) => p.id);
    for (const p of s.parts.slice(4)) Object.assign(p, { next: 'spring', sownYears: 1 });
    const { join } = neededSelection(s, SEPT_1, { ...NO_NEED, harvestKg: netOf(s, after) });
    expect(join.map((j) => j.id).sort()).toEqual([...after].sort());
    expect(join.every((j) => j.crop === 'spring')).toBe(true);
  });

  it('len od konce, luštěniny od domu – napřed díly po ozimu, pak první osev', () => {
    const s = village(8);
    const after = s.parts.slice(0, 4);
    for (const p of after) Object.assign(p, { next: 'spring', sownYears: 1 });
    const order = blockOrder(s).filter((id) => after.some((p) => p.id === id));
    const byId = (id: number): FieldPart => s.parts.find((p) => p.id === id)!;
    const targets: NeededTargets = {
      ...NO_NEED,
      flaxNeedKg: expectedFlaxKg(byId(order.at(-1)!), SEPT_1) - 0.01,
      legumeKg: expectedLegumeKg(byId(order[0]!), SEPT_1) - 0.01,
    };
    const { join } = neededSelection(s, SEPT_1, targets);
    expect(join).toContainEqual({ id: order.at(-1)!, crop: 'flax' });
    expect(join).toContainEqual({ id: order[0]!, crop: 'legume' });
    expect(join.filter((j) => j.crop === 'flax')).toHaveLength(1);
    expect(join.filter((j) => j.crop === 'legume')).toHaveLength(1);

    // bez dílů po ozimu vezmou luštěniny díl prvního osevu nejblíž domu (ten pak není ozim)
    const fresh = village(8);
    const first = blockOrder(fresh)[0]!;
    const legumeKg =
      expectedLegumeKg(
        fresh.parts.find((p) => p.id === first)!,
        SEPT_1,
      ) - 0.01;
    expect(neededSelection(fresh, SEPT_1, { ...NO_NEED, legumeKg }).join).toEqual([
      { id: first, crop: 'legume' },
    ]);
  });

  it('obilí do roční potřeby před luštěninami – hladová ves luštěniny nevezme (obilí má přednost)', () => {
    const s = village(8);
    const order = blockOrder(s);
    const legumeKg =
      expectedLegumeKg(
        s.parts.find((p) => p.id === order[0])!,
        SEPT_1,
      ) - 0.01;
    // roční potřeba bez rezervy pokryje celé pole – na luštěniny díl nezbude
    const hungry = neededSelection(s, SEPT_1, {
      ...NO_NEED,
      legumeKg,
      harvestKg: 1e9,
      energyFloorKg: 1e9,
    });
    expect(hungry.join.map((j) => j.crop)).not.toContain('legume');
    expect(hungry.join.map((j) => j.id)).toEqual(order);
    // potřebu bez rezervy kryjí dva díly – luštěniny až za nimi, pak obilí do rezervy
    const floorKg = netOf(s, order.slice(0, 2));
    const fed = neededSelection(s, SEPT_1, {
      ...NO_NEED,
      legumeKg,
      harvestKg: floorKg + netOf(s, order.slice(3, 4)) + legumeEnergy(legumeKg),
      energyFloorKg: floorKg,
    });
    expect(fed.join).toEqual([
      { id: order[0]!, crop: 'winter' },
      { id: order[1]!, crop: 'winter' },
      { id: order[2]!, crop: 'legume' },
      { id: order[3]!, crop: 'winter' },
    ]);
  });

  it('luštěniny se počítají do energie – obilí doplní jen zbytek', () => {
    const s = village(8);
    const order = blockOrder(s);
    const legume = s.parts.find((p) => p.id === order[0])!;
    const legumeKg = expectedLegumeKg(legume, SEPT_1) - 0.01;
    const harvestKg = legumeEnergy(legumeKg) + netOf(s, order.slice(1, 3));
    const { join } = neededSelection(s, SEPT_1, { ...NO_NEED, legumeKg, harvestKg });
    expect(join).toEqual([
      { id: order[0]!, crop: 'legume' },
      { id: order[1]!, crop: 'winter' },
      { id: order[2]!, crop: 'winter' },
    ]);
  });

  it('přílohy 70–95 % a nouzové přílohy jen při nedostatku', () => {
    const s = village(6);
    const [a, b, c, d, e, f] = s.parts;
    Object.assign(a!, { state: 'fallow', fertilityShare: 0.6, fallowSinceDay: at(595, 9, 1) });
    Object.assign(b!, { state: 'fallow', fertilityShare: 0.8, fallowSinceDay: at(595, 9, 1) });
    Object.assign(c!, { state: 'fallow', fertilityShare: 0.3, fallowSinceDay: at(595, 9, 1) });
    for (const p of [d, e, f]) Object.assign(p!, { state: 'fallow', fertilityShare: 0.97 });
    expect(expectedNetKg(a!, SEPT_1)).toBeGreaterThan(0);
    const regular = [d!.id, e!.id, f!.id];
    const enough = neededSelection(s, SEPT_1, { ...NO_NEED, harvestKg: netOf(s, regular) });
    expect(enough.join.map((j) => j.id).sort()).toEqual([...regular].sort());
    const hungry = neededSelection(s, SEPT_1, { ...NO_NEED, harvestKg: 1e9 });
    const ids = hungry.join.map((j) => j.id);
    expect(ids).toHaveLength(5);
    expect(ids.slice(3)).toEqual([b!.id, a!.id]);
    expect(ids).not.toContain(c!.id);
  });

  it('nezačaté nutné díly, které ves už nepotřebuje, uvolní – nejdál od domu první', () => {
    const s = village(8);
    const order = blockOrder(s);
    const parts = order.map((id) => s.parts.find((p) => p.id === id)!);
    s.season = createSeason({ winter: parts.slice(0, 6), spring: [] }, SEPT_1, 1);
    sowParts(parts.slice(0, 6), 'winter');
    const needKg = 1_000;
    // potřeba klesla na 3 díly – uvolní 3 nejvzdálenější
    const harvestKg = netOf(s, order.slice(0, 3));
    const { join, release } = neededSelection(s, SEPT_1, { ...NO_NEED, harvestKg, needKg });
    expect(join).toEqual([]);
    const byDistance = parts.slice(0, 6).sort((x, y) => y.distanceM - x.distanceM);
    expect(release).toEqual(byDistance.slice(0, 3).map((p) => p.id));
    // přebytek v toleranci (desetina roční potřeby z pole) díly nechá
    const margin = FIELD_STORES.trimMarginYears * needKg;
    const near = netOf(s, order.slice(0, 6)) + 1 - margin;
    expect(neededSelection(s, SEPT_1, { ...NO_NEED, harvestKg: near, needKg }).release).toEqual([]);
    // díl, na kterém začala práce, zůstane nutný
    const winter = seasonCrop(s.season, 'winter')!;
    winter.done.sow = winter.required.sow;
    expect(neededSelection(s, SEPT_1, { ...NO_NEED, harvestKg, needKg }).release).toEqual([]);
  });

  it('stejný vstup dá stejný výsledek – nezávisle na pořadí dílů ve stavu', () => {
    const s = village(10);
    for (const p of s.parts.slice(0, 3)) Object.assign(p, { next: 'spring', sownYears: 1 });
    Object.assign(s.parts[9]!, { state: 'fallow', fertilityShare: 0.6, fallowSinceDay: 0 });
    const targets: NeededTargets = {
      harvestKg: 1e9,
      energyFloorKg: 0,
      legumeKg: 5,
      flaxNeedKg: 2,
      needKg: 1_000,
    };
    const once = neededSelection(s, SEPT_1, targets);
    expect(neededSelection(s, SEPT_1, targets)).toEqual(once);
    const shuffled = { ...s, parts: [...s.parts].reverse() };
    expect(neededSelection(shuffled, SEPT_1, targets)).toEqual(once);
    expect(once.join.length).toBeGreaterThan(0);
  });
});
