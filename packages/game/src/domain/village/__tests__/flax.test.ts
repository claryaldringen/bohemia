import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import type { PartInput } from '../actions';
import { endOfSeason, expectedNetKg } from '../fields';
import { expectedFlaxKg, flaxNeedKg, harvestFlax, linenCoverage, linenUnhappiness } from '../flax';
import { happinessFactors } from '../happiness';
import { sowingTargets } from '../field-food';
import { expectedLegumeKg, legumeEnergy } from '../legumes';
import { ageGroup } from '../people';
import { NO_CRAFTS } from '../productivity';
import { FERTILITY, FLAX, YIELD_BASE_KG_PER_HA } from '../rules';
import { advanceVillage } from '../simulate';
import { withThreshingFloor } from './village-fixtures';
import { chooseCrops, orchardOnlyLoad, type CropChoiceInput } from '../sowing';
import type { FieldPart, VillageState } from '../types';
import {
  cropGrossPerHa,
  cropSeedPerHa,
  harvestKg,
  partWork,
  planCrops,
  planPartIds,
  type PartWork,
} from '../year-plan';

// Len (fields.md – Len, diet.md – Oděv; Martin 19. 10. 2026: „na částech pole musí být zasetý
// len“): plodina na dílech pole podle potřeby lnu na oděv; obilí má přednost; len vysiluje půdu;
// nedostatek ubere štěstí; starší vsi beze změny do dalšího plánu k 1. 9.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const DAY = at(601, 9, 1);

function part(id: number, over: Partial<FieldPart> = {}): FieldPart {
  return {
    id,
    fieldId: 1,
    areaM2: 225,
    distanceM: 100,
    naturalFertility: 70,
    fertilityShare: 1,
    bonusUntilDay: null,
    state: 'sown',
    sownYears: 1,
    fallowSinceDay: null,
    foundingCost: 0,
    foundingDone: 0,
    surface: 'meadow',
    ...over,
  };
}
const parts = (count: number): FieldPart[] => Array.from({ length: count }, (_, i) => part(i + 1));

const BIG = 1e6;
function input(over: Partial<CropChoiceInput>): CropChoiceInput {
  return {
    targetKg: BIG,
    startKg: 0,
    capacity: { autumnWinter: BIG, autumn: BIG, spring: BIG, july: BIG, august: BIG },
    load: orchardOnlyLoad(0),
    allowWinter: true,
    day: DAY,
    toolCoverage: NO_CRAFTS.tools,
    ...over,
  };
}

/** Startovní pole s rezervou půdy – 4 ha dílů po 225 m², úrodnost 70. */
const bigField = (count = 180): PartInput[] =>
  Array.from({ length: count }, (_, i) => ({
    areaM2: 225,
    distanceM: 50 + Math.round((100 * i) / (count - 1)),
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));

// ves s humnem – mlátí hned po žni (production-chains.md – Humno)
const found = (day: number, fieldParts = 180): VillageState =>
  withThreshingFloor(
    foundVillage({
      seed: 7,
      day,
      dwellingPosition: { x: 0, z: 0, rotation: 0 },
      firstField: {
        outline: [
          [0, 0],
          [10, 0],
          [10, 10],
        ],
        parts: bigField(fieldParts),
      },
    }),
  );

describe('kolik lnu ves potřebuje a výnos', () => {
  it('potřeba podle věku – dospělý a starší 2 kg, dítě 1 kg třeného lnu za rok', () => {
    const s = found(at(600, 3, 1));
    const expected = s.people.reduce((sum, p) => sum + FLAX.kgPerYear[ageGroup(p, DAY)], 0);
    expect(flaxNeedKg(s, DAY)).toBeCloseTo(expected, 9);
    expect(FLAX.kgPerYear).toEqual({ child: 1, adult: 2, elder: 2 });
  });

  it('výnos 550 kg/ha při plné úrodnosti, s úrodností jako obilí; osivo z vlastní úrody', () => {
    expect(cropGrossPerHa('flax', 100)).toBeCloseTo(FLAX.fiberKgPerHa, 9);
    expect(cropGrossPerHa('flax', 70)).toBeCloseTo(
      (cropGrossPerHa('spring', 70) / YIELD_BASE_KG_PER_HA) * FLAX.fiberKgPerHa,
      9,
    );
    // při úrodnosti 70 ≈ 450 kg/ha – Skotsko 18. st. 440–550, Irsko 1892 429 (rešerše)
    expect(cropGrossPerHa('flax', 70)).toBeCloseTo(451, 0);
    expect(cropSeedPerHa('flax')).toBe(0);
    expect(expectedFlaxKg(part(1), DAY)).toBeCloseTo(cropGrossPerHa('flax', 70) * 0.0225, 9);
  });

  it('práce: příprava půdy a setí jako jař, pletí 40, trhání a odnos 55, nemlátí se', () => {
    const p = part(1, { areaM2: 10_000 });
    const flax = partWork(p, DAY, NO_CRAFTS.tools, false, 'flax');
    const grain = partWork(p, DAY, NO_CRAFTS.tools, false, 'spring');
    expect(flax.dig).toBeCloseTo(grain.dig, 9);
    expect(flax.sow).toBeCloseTo(grain.sow, 9);
    expect(flax.weed / grain.weed).toBeCloseTo(10 / 8, 9);
    // obilí: sklizeň 20 + odnos 10 (fields.md – Žně všemi rukama)
    expect(flax.harvest / grain.harvest).toBeCloseTo(55 / 30, 9);
    expect(flax.thresh).toBe(0);
  });

  it('osev lnu vyčerpá úrodnost 1,5× víc než obilí (len vysiluje půdu)', () => {
    const flax = part(1, { crop: 'flax', fertilityShare: 1 });
    const grain = part(2, { crop: 'spring', fertilityShare: 1 });
    endOfSeason(flax, DAY);
    endOfSeason(grain, DAY);
    expect(1 - flax.fertilityShare).toBeCloseTo(FLAX.sowDepletion, 9);
    expect(1 - grain.fertilityShare).toBeCloseTo(FERTILITY.sowDepletion, 9);
    expect(FLAX.sowDepletion / FERTILITY.sowDepletion).toBeCloseTo(1.5, 9);
  });
});

describe('plán osevu se lnem (chooseCrops)', () => {
  it('len dostane díly z konce výběru obilí, dokud nepokryje potřebu; obilí doplní energii', () => {
    const candidates = parts(200);
    const target = 15;
    const grainOnly = chooseCrops(candidates, input({ targetKg: 600 }));
    const both = chooseCrops(candidates, input({ targetKg: 600, flaxTargetKg: target }));
    expect(grainOnly.flax).toEqual([]);
    // len od konce výběru obilí (vysiluje půdu – delší příloh neleží domům v cestě)
    const lastGrain = Math.max(...[...grainOnly.winter, ...grainOnly.spring].map((p) => p.id));
    expect(both.flax[0]!.id).toBe(lastGrain);
    const flaxKg = both.flax.reduce((sum, p) => sum + expectedFlaxKg(p, DAY), 0);
    expect(flaxKg).toBeGreaterThanOrEqual(target - 1e-9);
    // o díl méně by nestačil – len jen na potřebu
    expect(flaxKg - expectedFlaxKg(both.flax.at(-1)!, DAY)).toBeLessThan(target);
    const grainKg = [...both.winter, ...both.spring].reduce(
      (sum, p) => sum + expectedNetKg(p, DAY),
      0,
    );
    expect(grainKg).toBeGreaterThanOrEqual(600 - 1e-9);
    const ids = [...both.winter, ...both.spring, ...both.legume, ...both.flax].map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('len před luštěninami – luštěniny od domu, len od konce výběru', () => {
    const candidates = parts(200);
    const r = chooseCrops(
      candidates,
      input({ targetKg: 600, flaxTargetKg: 15, legumeTargetKg: 60 }),
    );
    expect(r.flax.length).toBeGreaterThan(0);
    expect(r.legume.length).toBeGreaterThan(0);
    expect(r.legume.map((p) => p.id)).toEqual(
      candidates.slice(0, r.legume.length).map((p) => p.id),
    );
    expect(Math.min(...r.flax.map((p) => p.id))).toBeGreaterThan(
      Math.max(...r.legume.map((p) => p.id)),
    );
    const grainKg = [...r.winter, ...r.spring].reduce((sum, p) => sum + expectedNetKg(p, DAY), 0);
    const legumeKg = r.legume.reduce((sum, p) => sum + expectedLegumeKg(p, DAY), 0);
    expect(grainKg + legumeEnergy(legumeKg)).toBeGreaterThanOrEqual(600 - 1e-9);
  });

  it('střídání: díl, který měl len loni, dostane len až nakonec', () => {
    const candidates = parts(200);
    const first = chooseCrops(candidates, input({ targetKg: 600, flaxTargetKg: 5 }));
    const lastYear = new Set(first.flax.map((p) => p.id));
    for (const p of candidates) if (lastYear.has(p.id)) p.crop = 'flax';
    const next = chooseCrops(candidates, input({ targetKg: 600, flaxTargetKg: 5 }));
    expect(next.flax.length).toBeGreaterThan(0);
    expect(next.flax.some((p) => lastYear.has(p.id))).toBe(false);
  });

  it('když půda na doplnění obilí nestačí, len ubere obilí o své díly – i se zásobami pod pojistkou', () => {
    const candidates = parts(40);
    const all = candidates.reduce((sum, p) => sum + expectedNetKg(p, DAY), 0);
    // zásoby pod pojistkou (Len napřed – Martin 20. 10. 2026: „občas mi to píše chybí len na
    // oděv“): len dostane díly i tak, obilí přijde jen o ně
    const tight = chooseCrops(candidates, input({ targetKg: all, flaxTargetKg: 20 }));
    const flaxKg = tight.flax.reduce((sum, p) => sum + expectedFlaxKg(p, DAY), 0);
    expect(flaxKg).toBeGreaterThanOrEqual(20);
    expect(tight.winter.length + tight.spring.length + tight.flax.length).toBe(40);
    const grainKg = [...tight.winter, ...tight.spring].reduce(
      (sum, p) => sum + expectedNetKg(p, DAY),
      0,
    );
    const flaxAsGrain = tight.flax.reduce((sum, p) => sum + expectedNetKg(p, DAY), 0);
    expect(grainKg).toBeCloseTo(all - flaxAsGrain, 6);
    // len od konce výběru obilí
    expect(tight.flax.map((p) => p.id)).toEqual([40, 39]);
  });

  it('ves bez volné práce (červenec plný ozimu, srpen jaře) – len napřed, obilí po něm', () => {
    const candidates = parts(200);
    const winter = (p: FieldPart): PartWork => partWork(p, DAY, NO_CRAFTS.tools, false, 'winter');
    const flaxWork = (p: FieldPart): PartWork => partWork(p, DAY, NO_CRAFTS.tools, false, 'flax');
    const harvest = winter(candidates[0]!).harvest;
    const thresh = winter(candidates[0]!).thresh;
    // sklizeň ozimu na 30 dílů zaplní červenec, jař na 20 dílů a výmlat ozimu (hned po žni –
    // production-chains.md) srpen – volná práce nezbude
    const capacity = {
      autumnWinter: BIG,
      autumn: BIG,
      spring: BIG,
      july: 30 * harvest,
      august: 20 * harvest + 30 * thresh,
    };
    const grain = chooseCrops(candidates, input({ capacity }));
    expect(grain.winter).toHaveLength(30);
    expect(grain.spring).toHaveLength(20);
    // trhání lnu je pracnější než žeň ozimu – za obilím se len nevejde nikam (dřív žádný len)
    expect(flaxWork(candidates[0]!).harvest).toBeGreaterThan(harvest);
    const r = chooseCrops(candidates, input({ capacity, flaxTargetKg: 15 }));
    const flaxKg = r.flax.reduce((sum, p) => sum + expectedFlaxKg(p, DAY), 0);
    expect(flaxKg).toBeGreaterThanOrEqual(15);
    // jen na potřebu
    expect(flaxKg - expectedFlaxKg(r.flax.at(-1)!, DAY)).toBeLessThan(15);
    // len od konce výběru obilí
    expect(r.flax.map((p) => p.id)).toEqual([50, 49]);
    // obilí přijde jen o práci, kterou len vezme: červenec nese trhání lnu a zbytek ozim
    const july =
      r.winter.reduce((sum, p) => sum + winter(p).harvest, 0) +
      r.flax.reduce((sum, p) => sum + flaxWork(p).harvest, 0);
    expect(july).toBeLessThanOrEqual(capacity.july + 1e-9);
    const lost = Math.ceil((r.flax.length * flaxWork(candidates[0]!).harvest) / harvest - 1e-9);
    expect(r.winter).toHaveLength(30 - lost);
    // výmlat ozimu, o který len připravil, uvolní srpen jaři (žeň 30 – fields.md, Žně všemi rukama)
    expect(r.spring).toHaveLength(20 + Math.floor((lost * thresh) / harvest + 1e-9));
    const ids = [...r.winter, ...r.spring, ...r.flax].map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('práce: díl lnu, jehož práce se nevejde, přeskočí – zkusí bližší (méně chůze)', () => {
    // konec výběru obilí je daleko (chůze zdvojí práci) – trhání tam se do července nevejde
    const candidates = parts(60).map((p) => ({ ...p, distanceM: p.id <= 20 ? 100 : 1100 }));
    const winter = (p: FieldPart): PartWork => partWork(p, DAY, NO_CRAFTS.tools, false, 'winter');
    const flaxWork = (p: FieldPart): PartWork => partWork(p, DAY, NO_CRAFTS.tools, false, 'flax');
    // červenec pojme žeň ozimu na 2 blízké díly – víc volné práce nezbude
    const capacity = {
      autumnWinter: BIG,
      autumn: BIG,
      spring: BIG,
      july: 2 * winter(candidates[0]!).harvest,
      august: BIG,
    };
    const grain = chooseCrops(candidates, input({ targetKg: 500, capacity }));
    expect(grain.winter.map((p) => p.id)).toEqual([1, 2]);
    expect(grain.spring.at(-1)!.distanceM).toBe(1100);
    expect(flaxWork(candidates[59]!).harvest).toBeGreaterThan(capacity.july);
    // za obilím se len nevejde (výměna za ozim přidá červenci práci), napřed jen na blízký díl
    expect(winter(candidates[0]!).harvest + flaxWork(candidates[0]!).harvest).toBeGreaterThan(
      capacity.july,
    );
    const r = chooseCrops(candidates, input({ targetKg: 500, capacity, flaxTargetKg: 25 }));
    expect(r.flax.map((p) => p.id)).toEqual([20]);
    expect(r.winter).toEqual([]);
    const ids = [...r.winter, ...r.spring, ...r.flax].map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('práce: když se len nevejde na poslední díl (jař, červenec plný ozimu), zkusí ozim', () => {
    const candidates = parts(60);
    // podzim pojme ozim jen na 20 dílů – zbytek výběru je jař
    const autumn = (part: FieldPart): number => {
      const w = partWork(part, DAY, NO_CRAFTS.tools, false, 'winter');
      return w.reclaim + w.dig + w.sow;
    };
    const capacity = {
      autumnWinter: 20 * autumn(candidates[0]!),
      autumn: BIG,
      spring: BIG,
      july: BIG,
      august: BIG,
    };
    const grain = chooseCrops(candidates, input({ targetKg: 400, capacity }));
    expect(grain.spring.length).toBeGreaterThan(0);
    const july = grain.winter.reduce(
      (sum, p) => sum + partWork(p, DAY, NO_CRAFTS.tools, false, 'winter').harvest,
      0,
    );
    // v červenci zbude jen na výměnu dílu ozimu za len (trhání je pracnější o `swap`) – sklizeň
    // lnu jaře se nevejde, výměna za ozim ano
    const swap =
      partWork(candidates[0]!, DAY, NO_CRAFTS.tools, false, 'flax').harvest -
      partWork(candidates[0]!, DAY, NO_CRAFTS.tools, false, 'winter').harvest;
    const r = chooseCrops(
      candidates,
      input({
        targetKg: 400,
        flaxTargetKg: 5,
        capacity: { ...capacity, july: july + swap + 0.5 },
      }),
    );
    expect(r.flax.length).toBeGreaterThan(0);
    expect(grain.winter.map((p) => p.id)).toEqual(expect.arrayContaining(r.flax.map((p) => p.id)));
  });

  it('bez cíle lnu stejný výběr jako dřív (i s luštěninami)', () => {
    const candidates = parts(120);
    const a = chooseCrops(candidates, input({ targetKg: 500, legumeTargetKg: 40 }));
    const b = chooseCrops(
      candidates,
      input({ targetKg: 500, legumeTargetKg: 40, flaxTargetKg: 0 }),
    );
    expect(b).toEqual(a);
    expect(a.flax).toEqual([]);
  });
});

/** Otisk FNV-1a 32 bitů z JSON – pozná i nejmenší změnu výběru. */
function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return `${text.length}:${(h >>> 0).toString(16).padStart(8, '0')}`;
}

const cropIds = (r: ReturnType<typeof chooseCrops>): Record<string, number[]> => ({
  winter: r.winter.map((p) => p.id),
  spring: r.spring.map((p) => p.id),
  legume: r.legume.map((p) => p.id),
  flax: r.flax.map((p) => p.id),
});

describe('len napřed – ves, které len za obilím vycházel, má plán beze změny', () => {
  // Otisky jsou z doby před „Len napřed“ (20. 10. 2026) – výběr, ve kterém len pokryl potřebu,
  // se nesmí změnit. Spadne-li po záměrné změně pravidel osevu, vědomě se přepíše.
  it('výběr chooseCrops – len za obilím, s luštěninami, výměna za ozim', () => {
    const candidates = parts(200);
    const autumn = (p: FieldPart): number => {
      const w = partWork(p, DAY, NO_CRAFTS.tools, false, 'winter');
      return w.reclaim + w.dig + w.sow;
    };
    const capacity = {
      autumnWinter: 20 * autumn(candidates[0]!),
      autumn: BIG,
      spring: BIG,
      july: BIG,
      august: BIG,
    };
    const tightJuly = chooseCrops(candidates.slice(0, 60), input({ targetKg: 400, capacity }));
    const july = tightJuly.winter.reduce(
      (sum, p) => sum + partWork(p, DAY, NO_CRAFTS.tools, false, 'winter').harvest,
      0,
    );
    const runs = [
      chooseCrops(candidates, input({ targetKg: 600, flaxTargetKg: 15 })),
      chooseCrops(candidates, input({ targetKg: 600, flaxTargetKg: 15, legumeTargetKg: 60 })),
      chooseCrops(
        candidates.slice(0, 60),
        input({ targetKg: 400, flaxTargetKg: 5, capacity: { ...capacity, july: july + 0.5 } }),
      ),
    ].map(cropIds);
    // otisk se žní 30 místo 50 čd/ha (fields.md – Žně všemi rukama, 24. 10. 2026) – jiné kapacity
    expect(fingerprint(runs)).toBe('611:0ce711e5');
  });

  it('plány vsi k 1. 9. tří let', () => {
    let state = found(at(600, 3, 1));
    const plans: Record<string, number[]>[] = [];
    for (const year of [601, 602, 603]) {
      state = advanceVillage(state, at(year, 9, 2), null);
      plans.push(
        Object.fromEntries(planCrops(state.plan!).map(({ crop, work }) => [crop, work.partIds])),
      );
    }
    expect(state.chronicle.some((e) => e.kind === 'linen-short')).toBe(false);
    // přepsáno s výmlatem hned po žni (production-chains.md – Humno, 20. 10. 2026): ves s humnem
    // mlátí v srpnu a září – plán osevu odečte výmlat z podzimu a srpna, snopy jsou zásobou;
    // a s obilnými jámami (Obilné jámy, 20. 10. 2026): vymlácené zrno v zapečetěných jamách ubývá
    // méně (zásoby k 1. 9. jsou vyšší) a ukládání do jam bere na podzim práci před osevem navíc –
    // mění se výběr dílů, len dál bez nedostatku; a s nouzovým výmlatem přebytku nad kapacitu humna
    // (21. 10. 2026): výmlat, který humno nestihne, se mlátí nouzově (+30 % práce, bez kažení snopů)
    // – plán osevu ho počítá do podzimní práce; a s jarním vrácením přílohu pod jař (21. 10. 2026)
    // a se žněmi všemi rukama (fields.md – Žně všemi rukama, 24. 10. 2026): žeň 30 místo 50 čd/ha
    // a výrostci se staršími ve žních – červenec a srpen pojmou víc dílů, výběr se mění; a s co
    // největšími stády (oxen.md – Co nejvíc sena a co největší stáda, 24. 10. 2026): plán luštěnin
    // počítá celé stádo a seč všech luk bere volnou práci v červnu a červenci; a s porody, které
    // brzdí jen energie (Martin, 25. 10. 2026): víc porodů, víc lidí na poli
    expect(fingerprint(plans)).toBe('721:3d269733');
  });
});

describe('oděv ze lnu – trhání a štěstí', () => {
  it('ves bez zápisu má lnu dost; nedostatek ubere štěstí až 4', () => {
    expect(linenCoverage({})).toBe(1);
    expect(linenUnhappiness({})).toBe(0);
    expect(linenUnhappiness({ linen: 0 })).toBe(FLAX.unhappiness);
    expect(linenUnhappiness({ linen: 0.5 })).toBeCloseTo(2, 9);
  });

  it('plán starší vsi (bez potřeby lnu) při trhání oděv nezapíše', () => {
    const s = advanceVillage(found(at(600, 3, 1)), at(600, 7, 30), null);
    expect(s.plan).not.toBeNull();
    expect(s.plan!.flaxNeedKg).toBeUndefined();
    const after = advanceVillage(s, at(600, 8, 1), null);
    expect(after.linen).toBeUndefined();
    expect(after.chronicle.some((e) => e.kind === 'linen-short')).toBe(false);
  });

  it('plán bez lnu s potřebou: podíl 0, upozornění do kroniky', () => {
    const s = advanceVillage(found(at(600, 3, 1)), at(600, 7, 31), null);
    const copy = JSON.parse(JSON.stringify(s)) as VillageState;
    copy.plan!.flaxNeedKg = 12;
    const event = harvestFlax(copy, copy.lastDay);
    expect(copy.linen).toBe(0);
    expect(event).toEqual({ day: copy.lastDay, kind: 'linen-short', kg: 0, neededKg: 12 });
  });
});

describe('len v simulaci', () => {
  it('ves ho k 1. 9. zaseje na potřebu, 31. 7. vytrhá a oděv má celý', () => {
    // první plán po založení pole je jen jař (díly hotové během roku) – len až k 1. 9.
    const planned = advanceVillage(found(at(600, 3, 1)), at(601, 9, 2), null);
    const flax = planned.plan?.flax;
    expect(flax).toBeDefined();
    expect(planned.plan!.flaxNeedKg).toBeCloseTo(flaxNeedKg(planned, at(601, 9, 1)), 9);
    const byId = new Map(planned.parts.map((p) => [p.id, p]));
    expect(flax!.partIds.every((id) => byId.get(id)?.crop === 'flax')).toBe(true);
    expect(planPartIds(planned.plan!)).toEqual(expect.arrayContaining(flax!.partIds));
    const expected = flax!.partIds.reduce(
      (sum, id) => sum + expectedFlaxKg(byId.get(id)!, planned.lastDay),
      0,
    );
    expect(expected).toBeGreaterThanOrEqual(planned.plan!.flaxNeedKg! - 1e-9);
    const pulled = advanceVillage(planned, at(602, 8, 1), null);
    const work = pulled.plan!.flax!;
    expect(work.harvestedKg).toBeGreaterThan(0);
    expect(work.done.thresh).toBe(0);
    expect(pulled.linen).toBe(1);
    // len se nejí ani nejde do zásob
    expect(harvestKg(work, pulled.parts, pulled.lastDay, 'flax')).toBeCloseTo(work.harvestedKg!, 6);
    expect(happinessFactors(pulled, pulled.lastDay, 1).linen).toBe(0);
  });

  it('ves se zásobami pod pojistkou a malým polem ho k 1. 9. zaseje na potřebu (Len napřed)', () => {
    // pole na roční potřebu nestačí – obilí nemá z čeho len doplnit (dřív žádný len)
    const before = advanceVillage(found(at(600, 3, 1), 24), at(601, 8, 31), null);
    const poor = JSON.parse(JSON.stringify(before)) as VillageState;
    poor.storesKg = 0;
    poor.legumesKg = 0;
    const targets = sowingTargets(poor, at(601, 9, 1), 0, NO_CRAFTS.pottery);
    expect(targets.leftKg).toBeLessThan(targets.bufferKg);
    const all = poor.parts.reduce((sum, p) => sum + expectedNetKg(p, at(601, 9, 1)), 0);
    expect(all).toBeLessThan(targets.energyFloorKg);
    const planned = advanceVillage(poor, at(601, 9, 2), null);
    const flax = planned.plan?.flax;
    expect(flax).toBeDefined();
    const byId = new Map(planned.parts.map((p) => [p.id, p]));
    const expected = flax!.partIds.reduce(
      (sum, id) => sum + expectedFlaxKg(byId.get(id)!, planned.lastDay),
      0,
    );
    expect(expected).toBeGreaterThanOrEqual(planned.plan!.flaxNeedKg! - 1e-9);
    const pulled = advanceVillage(planned, at(602, 8, 1), null);
    expect(pulled.linen).toBe(1);
  });

  it('po kouscích s JSON mezi nimi dá stejný stav jako jedním voláním (3 roky)', () => {
    const start = found(at(600, 3, 1));
    const whole = advanceVillage(start, at(603, 3, 1), null);
    let chunked = start;
    for (const day of [at(600, 8, 31), at(601, 9, 1), at(602, 7, 31), at(603, 3, 1)]) {
      chunked = JSON.parse(JSON.stringify(advanceVillage(chunked, day, null))) as VillageState;
    }
    expect(chunked).toEqual(JSON.parse(JSON.stringify(whole)));
    expect(whole.linen).toBeDefined();
  });
});
