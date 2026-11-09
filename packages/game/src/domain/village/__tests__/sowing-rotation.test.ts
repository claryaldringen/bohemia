import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage, type PartInput } from '../actions';
import { expectedNetKg, sowingGroup } from '../fields';
import { expectedFlaxKg } from '../flax';
import { sowingBlocks, villageHoldings } from '../holdings';
import {
  nextSowing,
  returnPart,
  rotateAfterSeason,
  sowParts,
  sowingCropToday,
  turnSelection,
  type SowingKind,
  type TurnOptions,
} from '../rotation';
import { FERTILITY } from '../rules';
import type { FieldPart, VillageState } from '../types';
import { createSeason, seasonCrop } from '../year-plan';

// Osevní postup po dílech (fields.md – Osevní postup po dílech a setí do konce okna, 25. 10. 2026):
// co na dílu poroste příště, plodina dne a výběr dílů na řadě – čisté funkce.

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

/** Díly v pořadí bloků přílohové soustavy (jako `turnSelection`). */
const blockOrder = (s: VillageState): number[] =>
  sowingBlocks(s.parts, villageHoldings(s))
    .flat()
    .map((p) => p.id);

const CALM: TurnOptions = { flaxNeedKg: 0, shortage: false };
const SEPT_1 = at(600, 9, 1);

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

  it('odpočatý díl 95 %: ozim, jař, 5 let úhoru – za 7 sezón zase první osev', () => {
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
    for (let year = 603; year <= 606; year++) season(p, null, year);
    expect(nextSowing(p)).toBe('late');
    season(p, null, 607);
    expect(nextSowing(p)).toBe('first');
  });

  it('čerstvý díl 100 %: ozim, jař a úhor 4 roky', () => {
    const p = part(1, { bonusUntilDay: at(602, 9, 1) });
    season(p, 'winter', 601);
    expect(p.bonusUntilDay).toBe(at(602, 9, 1));
    season(p, 'spring', 602);
    expect(p.bonusUntilDay).toBeNull();
    for (let year = 603; year <= 605; year++) season(p, null, year);
    expect(nextSowing(p)).toBe('late');
    season(p, null, 606);
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

  it('luštěniny po ozimu: úhor 2 roky; len po ozimu: úhor 6 let', () => {
    const legume = fallow(1, FERTILITY.fallowReady);
    season(legume, 'winter', 601);
    season(legume, 'legume', 602);
    expect(legume.state).toBe('fallow');
    expect(legume.fertilityShare).toBeCloseTo(0.86, 9);
    for (let year = 603; year <= 603; year++) season(legume, null, year);
    expect(nextSowing(legume)).toBe('late');
    season(legume, null, 604);
    expect(nextSowing(legume)).toBe('first');

    const flax = fallow(2, FERTILITY.fallowReady);
    season(flax, 'winter', 601);
    season(flax, 'flax', 602);
    expect(flax.state).toBe('fallow');
    for (let year = 603; year <= 607; year++) season(flax, null, year);
    expect(nextSowing(flax)).not.toBe('first');
    season(flax, null, 608);
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
    expect(lying.fallowBeforeSeason).toBeUndefined();
    expect(nextSowing(lying)).toBe('first');
  });
});

describe('plodina dne', () => {
  const kinds: SowingKind[] = ['first', 'winter', 'late', 'emergency'];
  // seje se týž den hned za orbou a motykou (fields.md – Práce; Martin 9. 11. 2026) – díl smí
  // začít i v poslední den okna
  it('první osev: ozim, dokud běží okno setí ozimu, pak jař v oknech kopání', () => {
    for (const kind of kinds) {
      expect(sowingCropToday(kind, at(600, 10, 30))).toBe('winter');
      expect(sowingCropToday(kind, at(600, 10, 31))).toBe('winter');
      expect(sowingCropToday(kind, at(600, 11, 1))).toBe('spring');
      expect(sowingCropToday(kind, at(601, 3, 1))).toBe('spring');
      expect(sowingCropToday(kind, at(601, 4, 30))).toBe('spring');
      expect(sowingCropToday(kind, at(601, 5, 1))).toBeNull();
    }
  });

  it('díl po ozimu jen jař; odpočívající nic', () => {
    expect(sowingCropToday('spring', at(600, 9, 1))).toBe('spring');
    expect(sowingCropToday('spring', at(600, 10, 29))).toBe('spring');
    expect(sowingCropToday('spring', at(600, 10, 30))).toBe('spring');
    expect(sowingCropToday('spring', at(600, 10, 31))).toBe('spring');
    expect(sowingCropToday('spring', at(600, 12, 15))).toBeNull();
    expect(sowingCropToday('spring', at(601, 3, 1))).toBe('spring');
    expect(sowingCropToday('spring', at(601, 4, 30))).toBe('spring');
    expect(sowingCropToday('spring', at(601, 5, 1))).toBeNull();
    expect(sowingCropToday('rest', at(600, 9, 1))).toBeNull();
    expect(sowingCropToday(null, at(600, 9, 1))).toBeNull();
  });
});

describe('výběr dílů na řadě – bez stropu', () => {
  it('všechny díly na řadě v pořadí bloků – na podzim ozim, po říjnu jař, mimo okna nic', () => {
    const s = village(8);
    const order = blockOrder(s);
    expect(turnSelection(s, SEPT_1, CALM)).toEqual(order.map((id) => ({ id, crop: 'winter' })));
    // po 30. 10. první osev už jen jař
    const late = turnSelection(s, at(600, 11, 5), CALM);
    expect(late.map((j) => j.crop)).toEqual(order.map(() => 'spring'));
    // mimo okna nic
    expect(turnSelection(s, at(600, 12, 15), CALM)).toEqual([]);
  });

  it('díly letošní práce znovu nepřibudou', () => {
    const s = village(8);
    const order = blockOrder(s);
    const parts = order.map((id) => s.parts.find((p) => p.id === id)!);
    s.season = createSeason({ winter: parts.slice(0, 3), spring: [] }, SEPT_1, 1);
    sowParts(parts.slice(0, 3), 'winter');
    expect(turnSelection(s, SEPT_1, CALM).map((j) => j.id)).toEqual(order.slice(3));
  });

  it('díl po jaři prvním osevem (`next: winter`): ozim do konce okna setí ozimu, pak záložní jař', () => {
    const s = village(8);
    const after = s.parts.slice(5);
    for (const p of after) Object.assign(p, { next: 'winter', sownYears: 1, fertilityShare: 0.83 });
    const ids = after.map((p) => p.id);
    // díly po prvním osevu jsou v pořadí bloků před čerstvými
    expect(blockOrder(s).slice(0, 3).sort()).toEqual([...ids].sort());
    const autumn = turnSelection(s, SEPT_1, CALM).filter((j) => ids.includes(j.id));
    expect(autumn.map((j) => j.id).sort()).toEqual([...ids].sort());
    expect(autumn.every((j) => j.crop === 'winter')).toBe(true);
    const late = turnSelection(s, at(600, 11, 5), CALM).filter((j) => ids.includes(j.id));
    expect(late.map((j) => j.id).sort()).toEqual([...ids].sort());
    expect(late.every((j) => j.crop === 'spring')).toBe(true);
  });

  it('luštěniny výběr dílů nepřidělí nikdy – na jaře, na podzim ani při nedostatku (Martin 9. 11. 2026)', () => {
    const s = village(8);
    for (const p of s.parts.slice(0, 4)) Object.assign(p, { next: 'spring', sownYears: 1 });
    for (const day of [SEPT_1, at(600, 11, 5), at(601, 3, 10), at(601, 4, 29), at(601, 4, 30)]) {
      for (const options of [
        { flaxNeedKg: 1e9, shortage: true },
        { flaxNeedKg: 0, shortage: true },
        { flaxNeedKg: 1e9, shortage: false },
      ]) {
        expect(turnSelection(s, day, options).map((j) => j.crop)).not.toContain('legume');
      }
    }
  });

  it('len zpět na poli – jen v den, kdy může začít jař, a jen do potřeby na oděv (Martin 9. 11. 2026 večer)', () => {
    const s = village(8);
    const flax = { ...CALM, flaxNeedKg: 1e9 };
    // mimo okna kopání jaře nic
    expect(turnSelection(s, at(600, 12, 15), flax)).toEqual([]);
    expect(turnSelection(s, at(601, 5, 1), flax)).toEqual([]);
    // na jaře čerstvé díly (ozim jim skončil) – všechny len při velké potřebě
    const all = turnSelection(s, at(601, 4, 30), flax);
    expect(new Set(all.map((j) => j.crop))).toEqual(new Set(['flax']));
    const one = turnSelection(s, at(601, 4, 30), { ...CALM, flaxNeedKg: 1 });
    expect(one.filter((j) => j.crop === 'flax')).toHaveLength(1);
    expect(one.filter((j) => j.crop === 'spring')).toHaveLength(7);
    // bez potřeby (plán bez zápisu) len ne
    expect(turnSelection(s, at(601, 4, 30), CALM).map((j) => j.crop)).not.toContain('flax');
  });

  it('len bere napřed nejúrodnější díly po ozimu, pak první osev, a jen do potřeby', () => {
    const s = village(8);
    const after = s.parts.slice(0, 4);
    const shares = [0.8, 0.95, 0.85, 0.9];
    after.forEach((p, i) =>
      Object.assign(p, { next: 'spring', sownYears: 1, fertilityShare: shares[i] }),
    );
    const [a, b, c, d] = after;
    // v září: díl po ozimu s nejlepší úrodností první, pak další podle úrodnosti
    const need = expectedFlaxKg(b!, SEPT_1) + expectedFlaxKg(d!, SEPT_1) - 0.01;
    const join = turnSelection(s, SEPT_1, { ...CALM, flaxNeedKg: need });
    expect(join.filter((j) => j.crop === 'flax')).toEqual([
      { id: b!.id, crop: 'flax' },
      { id: d!.id, crop: 'flax' },
    ]);
    // ostatní díly po ozimu jař, čerstvé díly ozim (len čerstvé díly na podzim nebere)
    expect(
      join
        .filter((j) => j.crop === 'spring')
        .map((j) => j.id)
        .sort(),
    ).toEqual([a!.id, c!.id].sort());
    expect(join.filter((j) => j.crop === 'winter')).toHaveLength(4);
    // na jaře, když díly po ozimu nestačí, i čerstvé díly (ozim jim skončil)
    const spring = turnSelection(s, at(601, 3, 10), { ...CALM, flaxNeedKg: 1e9 });
    const flaxIds = spring.filter((j) => j.crop === 'flax').map((j) => j.id);
    expect(flaxIds.slice(0, 4)).toEqual([b!.id, d!.id, c!.id, a!.id]);
    expect(flaxIds).toHaveLength(8);
  });

  it('len na jaře: napřed díly druhého osevu (i po jaři), pak první osev a příloh 70–95 %, nouzový ne', () => {
    const s = village(7);
    const [a, b, c, d, e, f, g] = s.parts;
    // a, b – po jaři prvním osevem čekají na ozim (okno ozimu skončilo – jař), nižší úrodnost
    Object.assign(a!, { next: 'winter', sownYears: 1, fertilityShare: 0.75 });
    Object.assign(b!, { next: 'winter', sownYears: 1, fertilityShare: 0.8 });
    // c, d – příloh 70–95 %; e – nouzový příloh 40–70 %
    for (const [p, share] of [
      [c!, 0.9],
      [d!, 0.85],
      [e!, 0.5],
    ] as const) {
      Object.assign(p, { state: 'fallow', fertilityShare: share, fallowSinceDay: 0 });
    }
    // f, g – čerstvé díly (první osev, plná úrodnost)
    const flax = turnSelection(s, at(601, 3, 10), { ...CALM, flaxNeedKg: 1e9 })
      .filter((j) => j.crop === 'flax')
      .map((j) => j.id);
    expect(flax).toEqual([b!.id, a!.id, f!.id, g!.id, c!.id, d!.id]);
  });

  it('na díl se len vrátí nejdřív po 7 letech (Martin 9. 11. 2026: „6 nebo 7“ – návrh Clauda 7)', () => {
    const s = village(4);
    for (const p of s.parts) Object.assign(p, { next: 'spring', sownYears: 1 });
    const [a, b] = s.parts;
    // díl a měl len v roce 595: na podzim 601 (sklizeň 602 = 7 let) smí, na jaře 601 (6 let) ne
    a!.flaxYear = 595;
    // díl b měl len v roce 600 – smí až na sklizeň 607
    b!.flaxYear = 600;
    const flaxOf = (day: number): number[] =>
      turnSelection(s, day, { ...CALM, flaxNeedKg: 1e9 })
        .filter((j) => j.crop === 'flax')
        .map((j) => j.id);
    expect(flaxOf(at(601, 3, 10))).not.toContain(a!.id);
    expect(flaxOf(at(601, 9, 1))).toContain(a!.id);
    expect(flaxOf(at(606, 9, 1))).toContain(b!.id);
    expect(flaxOf(at(606, 4, 1))).not.toContain(b!.id);
    // díly bez paměti lnu (vsi uložené dřív) smí hned
    expect(flaxOf(at(601, 3, 10))).toContain(s.parts[2]!.id);
  });

  it('1. 9. si díl po osetém lnu zapamatuje rok – i nevytrhaný; jiná plodina ne', () => {
    const flax = part(1, { state: 'sown', crop: 'flax', sownYears: 1 });
    rotateAfterSeason(flax, at(602, 9, 1));
    expect(flax.flaxYear).toBe(602);
    expect(flax.state).toBe('fallow');
    const spring = part(2, { state: 'sown', crop: 'spring', sownYears: 1, flaxYear: 590 });
    rotateAfterSeason(spring, at(602, 9, 1));
    expect(spring.flaxYear).toBe(590);
  });

  it('díly po ozimu jsou na řadě před čerstvými – s jaří', () => {
    const s = village(8);
    const after = s.parts.slice(4).map((p) => p.id);
    for (const p of s.parts.slice(4)) Object.assign(p, { next: 'spring', sownYears: 1 });
    const join = turnSelection(s, SEPT_1, CALM);
    // ozim čerstvých dílů v dávce před jaří, jař po ozimu v pořadí bloků za ním
    expect(
      join
        .filter((j) => j.crop === 'spring')
        .map((j) => j.id)
        .sort(),
    ).toEqual([...after].sort());
    expect(blockOrder(s).slice(0, 4).sort()).toEqual([...after].sort());
  });

  it('příloh 70–95 % až po oseté řadě v okně setí, nouzový jen při nedostatku (návrh Clauda)', () => {
    const s = village(6);
    const [a, b, c, d, e, f] = s.parts;
    Object.assign(a!, { state: 'fallow', fertilityShare: 0.6, fallowSinceDay: at(595, 9, 1) });
    Object.assign(b!, { state: 'fallow', fertilityShare: 0.8, fallowSinceDay: at(595, 9, 1) });
    Object.assign(c!, { state: 'fallow', fertilityShare: 0.3, fallowSinceDay: at(595, 9, 1) });
    for (const p of [d, e, f]) Object.assign(p!, { state: 'fallow', fertilityShare: 0.97 });
    expect(expectedNetKg(a!, SEPT_1)).toBeGreaterThan(0);
    const regular = [d!.id, e!.id, f!.id];
    // díly na řadě čekají – příloh 70–95 % ne
    const first = turnSelection(s, SEPT_1, CALM);
    expect(first.map((j) => j.id).sort()).toEqual([...regular].sort());
    // řada je v letošní práci, ale nezasetá – příloh 70–95 % dál čeká
    const parts = [d!, e!, f!];
    s.season = createSeason({ winter: parts, spring: [] }, SEPT_1, 1);
    sowParts(parts, 'winter');
    expect(turnSelection(s, SEPT_1, CALM)).toEqual([]);
    // řada zasetá – v okně setí přibude příloh 70–95 %, nouzový ne
    const winter = seasonCrop(s.season, 'winter')!;
    winter.done.sow = winter.required.sow;
    expect(turnSelection(s, SEPT_1, CALM)).toEqual([{ id: b!.id, crop: 'winter' }]);
    // po okně setí ozimu (listopad) ne
    expect(turnSelection(s, at(600, 11, 5), CALM)).toEqual([]);
    // skutečný nedostatek – přílohy 70–95 % i nouzové s kladnou úrodou hned
    s.season = null;
    for (const p of parts) {
      p.state = 'fallow';
      delete p.crop;
    }
    const hungry = turnSelection(s, SEPT_1, { ...CALM, shortage: true });
    const ids = hungry.map((j) => j.id);
    expect(ids).toHaveLength(5);
    expect(ids.slice(3)).toEqual([b!.id, a!.id]);
    expect(ids).not.toContain(c!.id);
  });

  it('stejný vstup dá stejný výsledek – nezávisle na pořadí dílů ve stavu', () => {
    const s = village(10);
    for (const p of s.parts.slice(0, 3)) Object.assign(p, { next: 'spring', sownYears: 1 });
    Object.assign(s.parts[9]!, { state: 'fallow', fertilityShare: 0.6, fallowSinceDay: 0 });
    const options: TurnOptions = { flaxNeedKg: 0, shortage: true };
    const once = turnSelection(s, SEPT_1, options);
    expect(turnSelection(s, SEPT_1, options)).toEqual(once);
    const shuffled = { ...s, parts: [...s.parts].reverse() };
    expect(turnSelection(shuffled, SEPT_1, options)).toEqual(once);
    expect(once.length).toBeGreaterThan(0);
  });
});
