import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage, type PartInput } from '../../core/actions';
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
  withoutRotationNext,
  type SowingKind,
  type TurnOptions,
} from '../rotation';
import { FERTILITY } from '../../rules';
import type { FieldPart, VillageState } from '../../types';
import { createSeason, seasonCrop } from '../../core/year-plan';

// Přílohová soustava do roku 1100 (fields.md, Martin 10. 11. 2026) a setí do konce okna (Osevní
// postup po dílech, 25. 10. 2026): co je na dílu na řadě, plodina dne a výběr dílů – čisté funkce.

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

describe('přílohová soustava – díl se osévá rok po roku do 70 %', () => {
  it('stav dílu určí, co je na řadě', () => {
    expect(nextSowing(part(1))).toBe('first');
    expect(nextSowing(part(1, { sownYears: 1, fertilityShare: 0.83 }))).toBe('again');
    expect(nextSowing(fallow(1, FERTILITY.fallowReady))).toBe('first');
    expect(nextSowing(fallow(1, 0.8))).toBe('late');
    expect(nextSowing(fallow(1, 0.5))).toBe('emergency');
    expect(nextSowing(fallow(1, 0.3))).toBe('rest');
    expect(nextSowing(part(1, { state: 'sown', crop: 'winter' }))).toBeNull();
    expect(nextSowing(part(1, { state: 'founding', foundingDone: 0 }))).toBeNull();
  });

  it('díl v osevu je v pořadí jako osévaný díl, čerstvý jako připravený', () => {
    expect(sowingGroup(part(1, { sownYears: 1, fertilityShare: 0.83 }))).toBe(1);
    expect(sowingGroup(part(1))).toBe(2);
  });

  it('odpočatý díl 95 %: ozim po ozimu 3 roky (95 → 83 → 71 → 59 %), pak příloh 8 let', () => {
    const p = fallow(1, FERTILITY.fallowReady);
    season(p, 'winter', 601);
    expect(p).toMatchObject({ state: 'ready', sownYears: 1 });
    expect(p.crop).toBeUndefined();
    expect(p.fertilityShare).toBeCloseTo(0.83, 9);
    expect(nextSowing(p)).toBe('again');
    // žádný předepsaný sled – na podzim zase ozim
    expect(sowingCropToday(nextSowing(p), at(601, 9, 15))).toBe('winter');
    season(p, 'winter', 602);
    expect(p).toMatchObject({ state: 'ready', sownYears: 2 });
    expect(p.fertilityShare).toBeCloseTo(0.71, 9);
    expect(nextSowing(p)).toBe('again');
    season(p, 'winter', 603);
    expect(p).toMatchObject({ state: 'fallow', sownYears: 0, fallowSinceDay: at(603, 9, 1) });
    expect(p.crop).toBeUndefined();
    expect(p.fertilityShare).toBeCloseTo(0.59, 9);
    for (let year = 604; year <= 610; year++) season(p, null, year);
    expect(p.fertilityShare).toBeCloseTo(0.94, 9);
    expect(nextSowing(p)).toBe('late');
    season(p, null, 611);
    expect(nextSowing(p)).toBe('first');
  });

  it('čerstvý díl 100 %: 3 osevy s plodinou podle okna (100 → 88 → 76 → 64 %), příloh 7 let', () => {
    const p = part(1, { bonusUntilDay: at(602, 9, 1) });
    season(p, 'spring', 601);
    expect(p.bonusUntilDay).toBe(at(602, 9, 1));
    expect(nextSowing(p)).toBe('again');
    season(p, 'winter', 602);
    expect(nextSowing(p)).toBe('again');
    season(p, 'spring', 603);
    expect(p.state).toBe('fallow');
    expect(p.fertilityShare).toBeCloseTo(0.64, 9);
    expect(p.bonusUntilDay).toBeNull();
    for (let year = 604; year <= 609; year++) season(p, null, year);
    expect(nextSowing(p)).toBe('late');
    season(p, null, 610);
    expect(nextSowing(p)).toBe('first');
  });

  it('příloh 70–95 % po osevu pod 70 % jde zase do přílohu', () => {
    const p = part(1, { state: 'fallow', fertilityShare: 0.8, fallowSinceDay: at(590, 9, 1) });
    season(p, 'spring', 601);
    expect(p.state).toBe('fallow');
    expect(nextSowing(p)).toBe('emergency');
  });

  it('luštěniny i len se osévají dál, dokud úrodnost stačí; nouzový osev jde do přílohu', () => {
    const legume = fallow(1, FERTILITY.fallowReady);
    season(legume, 'winter', 601);
    season(legume, 'legume', 602);
    expect(legume).toMatchObject({ state: 'ready', sownYears: 2 });
    expect(legume.fertilityShare).toBeCloseTo(0.86, 9);

    const flax = fallow(2, FERTILITY.fallowReady);
    season(flax, 'flax', 601);
    expect(flax).toMatchObject({ state: 'ready', sownYears: 1, flaxYear: 601 });
    expect(flax.fertilityShare).toBeCloseTo(0.77, 9);
    season(flax, 'winter', 602);
    expect(flax.state).toBe('fallow');
    expect(flax.fertilityShare).toBeCloseTo(0.65, 9);

    const emergency = fallow(3, 0.6);
    season(emergency, 'winter', 601);
    expect(emergency.state).toBe('fallow');
    expect(emergency.fertilityShare).toBeCloseTo(0.48, 9);
  });

  it('díl v osevu, který se v sezóně neosel, čeká dál bez odpočinku', () => {
    const p = part(1, { sownYears: 1, fertilityShare: 0.83 });
    rotateAfterSeason(p, at(601, 9, 1));
    expect(p).toMatchObject({ state: 'ready', sownYears: 1, fertilityShare: 0.83 });
    sowParts([p], 'spring');
    expect(p).toMatchObject({ state: 'sown', crop: 'spring', sownYears: 1 });
    rotateAfterSeason(p, at(602, 9, 1));
    expect(p).toMatchObject({ state: 'ready', sownYears: 2 });
    expect(p.fertilityShare).toBeCloseTo(0.71, 9);
  });

  it('vyřazený díl se vrátí, jak byl – příloh ladem od dřív, díl v osevu na řadě', () => {
    const ready = part(1, { sownYears: 1, fertilityShare: 0.83 });
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
    expect(ready).toMatchObject({ state: 'ready', sownYears: 1 });
    expect(nextSowing(ready)).toBe('again');
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

describe('starší vsi s pevným sledem (`next`)', () => {
  /** Díl uložený s pevným sledem ozim → jař → úhor. */
  type Sequenced = FieldPart & { next?: 'spring' | 'winter' };
  const legacy = (): VillageState => {
    const s = village(4);
    s.lastDay = at(600, 10, 1);
    const [a, b, c] = s.parts as Sequenced[];
    Object.assign(a!, { sownYears: 1, fertilityShare: 0.83, next: 'spring' });
    Object.assign(b!, { sownYears: 1, fertilityShare: 0.65, next: 'winter' });
    Object.assign(c!, { state: 'sown', crop: 'spring', sownYears: 1, next: 'spring' });
    return s;
  };

  it('díl s `next` od 70 % zůstane v osevu, pod 70 % jde do přílohu, zasetý jen ztratí `next`', () => {
    const before = legacy();
    const after = withoutRotationNext(before);
    const [a, b, c, d] = after.parts as Sequenced[];
    for (const p of after.parts as Sequenced[]) expect(p.next).toBeUndefined();
    expect(a).toMatchObject({ state: 'ready', sownYears: 1, fertilityShare: 0.83 });
    expect(nextSowing(a!)).toBe('again');
    expect(b).toMatchObject({ state: 'fallow', sownYears: 0, fallowSinceDay: at(600, 10, 1) });
    expect(c).toMatchObject({ state: 'sown', crop: 'spring', sownYears: 1 });
    expect(d).toBe(before.parts[3]);
    // vstupní stav se nemění
    expect((before.parts[0] as Sequenced).next).toBe('spring');
  });

  it('převod je idempotentní – ves bez `next` se nemění', () => {
    const once = withoutRotationNext(legacy());
    expect(withoutRotationNext(once)).toBe(once);
    const fresh = village(2);
    expect(withoutRotationNext(fresh)).toBe(fresh);
  });
});

describe('plodina dne', () => {
  const kinds: SowingKind[] = ['first', 'again', 'late', 'emergency'];
  // seje se týž den hned za orbou a motykou (fields.md – Práce; Martin 9. 11. 2026) – díl smí
  // začít i v poslední den okna
  it('každý díl na řadě: ozim, dokud běží okno setí ozimu, pak jař v oknech kopání', () => {
    for (const kind of kinds) {
      expect(sowingCropToday(kind, at(600, 9, 1))).toBe('winter');
      expect(sowingCropToday(kind, at(600, 10, 30))).toBe('winter');
      expect(sowingCropToday(kind, at(600, 10, 31))).toBe('winter');
      expect(sowingCropToday(kind, at(600, 11, 1))).toBe('spring');
      expect(sowingCropToday(kind, at(601, 3, 1))).toBe('spring');
      expect(sowingCropToday(kind, at(601, 4, 30))).toBe('spring');
      expect(sowingCropToday(kind, at(601, 5, 1))).toBeNull();
    }
  });

  it('odpočívající díl nic', () => {
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

  it('len bere nejúrodnější díly na řadě (i první osev před díly v osevu) a jen do potřeby', () => {
    const s = village(8);
    const after = s.parts.slice(0, 4);
    const shares = [0.8, 0.95, 0.85, 0.9];
    after.forEach((p, i) => Object.assign(p, { sownYears: 1, fertilityShare: shares[i] }));
    const [a, b, c, d] = after;
    // na jaře při velké potřebě všechny díly, od nejúrodnějších: čerstvé díly (první osev) před díly v osevu
    const spring = turnSelection(s, at(601, 3, 10), { ...CALM, flaxNeedKg: 1e9 });
    const flaxIds = spring.filter((j) => j.crop === 'flax').map((j) => j.id);
    expect(flaxIds).toHaveLength(8);
    const fresh = s.parts.slice(4).map((p) => p.id);
    expect(new Set(flaxIds.slice(0, 4))).toEqual(new Set(fresh));
    expect(flaxIds.slice(4)).toEqual([b!.id, d!.id, c!.id, a!.id]);
    // po konci okna ozimu len jen do potřeby – dva nejúrodnější díly
    const november = at(600, 11, 5);
    const need =
      expectedFlaxKg(s.parts[4]!, november) + expectedFlaxKg(s.parts[5]!, november) - 0.01;
    const join = turnSelection(s, november, { ...CALM, flaxNeedKg: need });
    expect(join.filter((j) => j.crop === 'flax')).toHaveLength(2);
    expect(join.filter((j) => j.crop === 'spring')).toHaveLength(6);
  });

  it('na podzim si ves díly na příští len odloží před ozimem – nejúrodnější, jen do potřeby (Martin 10. 11. 2026)', () => {
    const s = village(8);
    s.parts
      .slice(0, 4)
      .forEach((p, i) =>
        Object.assign(p, { sownYears: 1, fertilityShare: [0.8, 0.95, 0.85, 0.9][i] }),
      );
    // čerstvé díly 4–7 mají nejvyšší úrodnost – nejmenší potřeba (jeden díl) odloží jen první z nich
    const one = turnSelection(s, SEPT_1, { ...CALM, flaxNeedKg: 1 });
    const spring = turnSelection(s, at(601, 3, 10), { ...CALM, flaxNeedKg: 1 });
    const reserved = spring.filter((j) => j.crop === 'flax').map((j) => j.id);
    expect(reserved).toHaveLength(1);
    expect(one.some((j) => j.crop !== 'winter')).toBe(false);
    expect(one.map((j) => j.id)).not.toContain(reserved[0]);
    expect(one).toHaveLength(7);
    // dvě potřeby = dva díly, bez potřeby se neodkládá nic
    const need = expectedFlaxKg(s.parts[4]!, SEPT_1) * 1.5;
    expect(turnSelection(s, SEPT_1, { ...CALM, flaxNeedKg: need })).toHaveLength(6);
    expect(turnSelection(s, SEPT_1, CALM)).toHaveLength(8);
    // díl, na kterém len před méně než 7 lety rostl, se neodloží (první z čerstvých vynechán)
    s.parts[4]!.flaxYear = 598;
    const skip = turnSelection(s, SEPT_1, { ...CALM, flaxNeedKg: 1 });
    expect(skip.map((j) => j.id)).toContain(s.parts[4]!.id);
    expect(skip).toHaveLength(7);
  });

  it('len na jaře: nejúrodnější díly na řadě bez ohledu na druh osevu, nouzový ne', () => {
    const s = village(7);
    const [a, b, c, d, e, f, g] = s.parts;
    Object.assign(a!, { sownYears: 1, fertilityShare: 0.75 });
    Object.assign(b!, { sownYears: 1, fertilityShare: 0.8 });
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
    expect(flax).toEqual([f!.id, g!.id, c!.id, d!.id, b!.id, a!.id]);
  });

  it('na díl se len vrátí nejdřív po 7 letech (Martin 9. 11. 2026: „6 nebo 7“ – návrh Clauda 7)', () => {
    const s = village(4);
    for (const p of s.parts) Object.assign(p, { sownYears: 1 });
    const [a, b] = s.parts;
    // díl a měl len v roce 595: v listopadu 601 (sklizeň 602 = 7 let) smí, na jaře 601 (6 let) ne
    a!.flaxYear = 595;
    // díl b měl len v roce 600 – smí až na sklizeň 607
    b!.flaxYear = 600;
    const flaxOf = (day: number): number[] =>
      turnSelection(s, day, { ...CALM, flaxNeedKg: 1e9 })
        .filter((j) => j.crop === 'flax')
        .map((j) => j.id);
    expect(flaxOf(at(601, 3, 10))).not.toContain(a!.id);
    expect(flaxOf(at(601, 11, 5))).toContain(a!.id);
    expect(flaxOf(at(606, 11, 5))).toContain(b!.id);
    expect(flaxOf(at(606, 4, 1))).not.toContain(b!.id);
    // díly bez paměti lnu (vsi uložené dřív) smí hned
    expect(flaxOf(at(601, 3, 10))).toContain(s.parts[2]!.id);
  });

  it('1. 9. si díl po osetém lnu zapamatuje rok – i nevytrhaný; jiná plodina ne', () => {
    const flax = part(1, { state: 'sown', crop: 'flax', sownYears: 1 });
    rotateAfterSeason(flax, at(602, 9, 1));
    expect(flax.flaxYear).toBe(602);
    // 100 → 82 % – osévá se dál
    expect(flax.state).toBe('ready');
    const spring = part(2, { state: 'sown', crop: 'spring', sownYears: 1, flaxYear: 590 });
    rotateAfterSeason(spring, at(602, 9, 1));
    expect(spring.flaxYear).toBe(590);
  });

  it('díly v osevu jsou na řadě před čerstvými – a na podzim dostanou zase ozim', () => {
    const s = village(8);
    const after = s.parts.slice(4).map((p) => p.id);
    for (const p of s.parts.slice(4)) Object.assign(p, { sownYears: 1, fertilityShare: 0.83 });
    const join = turnSelection(s, SEPT_1, CALM);
    // žádný předepsaný sled – ozim po ozimu, díly v osevu v pořadí bloků první
    expect(join.every((j) => j.crop === 'winter')).toBe(true);
    expect(
      join
        .slice(0, 4)
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
