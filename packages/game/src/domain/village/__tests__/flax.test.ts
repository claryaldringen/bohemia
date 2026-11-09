import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import type { PartInput } from '../actions';
import { endOfSeason, expectedNetKg } from '../fields';
import { expectedFlaxKg, flaxNeedKg, harvestFlax, linenCoverage, linenUnhappiness } from '../flax';
import { happinessFactors } from '../happiness';
import { sowingTargets } from '../field-food';

import { ageGroup } from '../people';
import { NO_CRAFTS } from '../productivity';
import { FERTILITY, FLAX, YIELD_BASE_KG_PER_HA } from '../rules';
import { advanceVillage } from '../simulate';
import { withThreshingFloor } from './village-fixtures';

import type { FieldPart, VillageState } from '../types';
import {
  cropGrossPerHa,
  cropSeedPerHa,
  harvestKg,
  partWork,
  seasonCrops,
  seasonPartIds,
  seasonCrop,
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

/** Otisk FNV-1a 32 bitů z JSON – pozná i nejmenší změnu výběru. */
function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return `${text.length}:${(h >>> 0).toString(16).padStart(8, '0')}`;
}

describe('len napřed – výběr s kapacitou (do Úlohy 5 pro páry k rádlům) a práce vsi k 2. 9.', () => {
  // Otisky jsou z doby před „Len napřed“ (20. 10. 2026) – výběr, ve kterém len pokryl potřebu,
  // se nesmí změnit. Spadne-li po záměrné změně pravidel osevu, vědomě se přepíše.

  it('plány vsi k 1. 9. tří let', () => {
    let state = found(at(600, 3, 1));
    const plans: Record<string, number[]>[] = [];
    for (const year of [601, 602, 603]) {
      state = advanceVillage(state, at(year, 9, 2), null);
      plans.push(
        Object.fromEntries(
          seasonCrops(state.season!).map(({ crop, work }) => [crop, work.partIds]),
        ),
      );
    }
    // ves bez stropu oseje všechny díly s prvním osevem už na podzim – 603 nezbude díl na len
    // (linen-short); otevřené pro Martina (fields.md – Osevní postup po dílech, bod 3, 9. 11. 2026)
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
    // brzdí jen energie (Martin, 25. 10. 2026): víc porodů, víc lidí na poli; a s nutnými díly den
    // po dni místo plánu k 1. 9. (fields.md – Osevní postup po dílech, 25. 10. 2026): 2. 9. je
    // v práci, co ves za dva dny přibrala podle potřeby úrody – bez kapacity plánu (dřív
    // 721:3d269733); a s postupem práce po dílech od čela (fields.md – Postup práce po dílech,
    // 25. 10. 2026): 2. 9. je v práci jen dávka, kterou ves za WORK_FRONT_DAYS stihne (dřív
    // 1018:b6da3f2c); a s díly nad potřebu po stavbách (fields.md – Osevní postup po dílech,
    // bod 3, 25. 10. 2026): ves bez staveb obdělá i díly nad potřebu – víc zásob, jiná potřeba
    // úrody (dřív 167:3d9cb32c); a se škodami zvěře na polích (wildlife.md – Škody, 26. 10. 2026):
    // od 1. 6. ubývá úroda dílů prasaty, jeleny a vranami, výhled jídla a plán osevu k 1. 9. to
    // zná – jiný výběr dílů (dřív 171:fcbccd0e)
    // a se šelmami na dobytku (wildlife.md – Vlci na dobytku, 26. 10. 2026): vlčí díl jen venku a
    // medvěd – jiná stáda, jiné bílkoviny a plán osevu (dřív 165:b78c12b3); a s opravou škod zvěře
    // (wildlife.md – Škody, 26. 10. 2026): násobek malé vsi se počítá jen z dosud nesklizených
    // dílů (po sklizni ozimu se škoda jaře na ha nezvyšuje), výhled jídla bere jen dosud nasbíranou
    // škodu, takže skutečná sklizeň a plán osevu k 1. 9. se mírně změnily (dřív 167:abb10b73)
    // a se psy dvorce a velkým lovem rodu (wildlife.md – Psi, Lov rodu, 26. 10. 2026): obilí psů se
    // sije z pole a pěší lovci chybí v práci vsi – jiný plán osevu k 1. 9. (dřív 168:48676c9e)
    // 26. 10. 2026 (W7 ryby a oka): vesničané chytají ryby z volné práce, takže se mění plány vsi; dřív f2f1018c
    // oprava po recenzi W7 (26. 10. 2026): roční kvóta ryb a zajíců a čerstvé maso mění práci vsi; dřív c856e421
    // 161:edeabe8e (26. 10. 2026, závěrečná oprava zvěře): chuť na bílkoviny bez loňské drobné zvěře – jiné ryby a jídlo; dřív 161:c9dee13e
    // 165:82576eb1 (27. 10. 2026, osivo ze zásob při setí – fields.md, Úroda, Osivo ze zásob):
    // setí bere osivo ze zásob, výhled zásob k sklizni odečte osivo, které na setí čeká, a ves ho
    // nejí – jiné zásoby k 1. 9. a jiný plán osevu; dřív 161:edeabe8e
    // 163:73d7b124 (27. 10. 2026, SEED_STORES.floorRation 0,6 → 0,75 – fields.md, Osivo ze zásob):
    // ves pod pojistkou seje osivo do roční potřeby jen nad příděl 0,75 – menší osev; dřív 165:82576eb1
    // 165:82576eb1 (31. 10. 2026, SEED_STORES.floorRation 0,75 → 0,5 – Martin: „osivo se nejí“): práh
    // 0,5 už plán osevu k 1. 9. nemění oproti stavu s prahem 0,6 – otisk je zpět na 165:82576eb1
    // 163:1fa9eda1 (2. 11. 2026, příprava jaře jen na díly s osivem – fields.md, Osivo ze zásob):
    // nová ves založená 1. 3. nekope jař, na kterou nemá osivo – výběr dílů se mění; dřív 165:82576eb1
    // 158:fbeb05f6 (6. 11. 2026, osev má přednost – fields.md, Osivo ze zásob): ves si nechá jen
    // přežívací zásobu do žní a ostatní zrno je osivo – jiné zásoby a osev; dřív 163:1fa9eda1
    // 162:a9a20af5 (6. 11. 2026, přežívací zásoba podle celé stravy, nezaseté osivo po okně zpět do
    // zásob, díly nad potřebu v okně setí před stavbami – fields.md, Osivo ze zásob a bod 3): jiné
    // zásoby k 1. 9. a jiný výběr dílů; dřív 158:fbeb05f6
    // 152:979c21c8 (9. 11. 2026, luštěniny z polí vyřazené – fields.md, Luštěniny, zrušeno; žně
    // i v srpnu): plán bez luštěnin, díly jaře místo nich; dřív 162:a9a20af5
    // 154:0b8371f9 (9. 11. 2026, osivo bez cíle osevu a setí týž den za orbou – fields.md, Osivo
    // bez cíle osevu): hromada osiva okna, díl smí začít i v poslední den okna; dřív 152:979c21c8
    // 123:ac9d7796 (9. 11. 2026, díly jedna fronta bez stropu – fields.md, Osevní postup po
    // dílech, bod 3): ves bere všechny díly na řadě, pletí mužů po stavbách; dřív 154:0b8371f9
    expect(fingerprint(plans)).toBe('123:ac9d7796');
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
    expect(s.season).not.toBeNull();
    expect(s.season!.flaxNeedKg).toBeUndefined();
    const after = advanceVillage(s, at(600, 8, 1), null);
    expect(after.linen).toBeUndefined();
    expect(after.chronicle.some((e) => e.kind === 'linen-short')).toBe(false);
  });

  it('plán bez lnu s potřebou: podíl 0, upozornění do kroniky', () => {
    const s = advanceVillage(found(at(600, 3, 1)), at(600, 7, 31), null);
    const copy = JSON.parse(JSON.stringify(s)) as VillageState;
    copy.season!.flaxNeedKg = 12;
    const event = harvestFlax(copy, copy.lastDay);
    expect(copy.linen).toBe(0);
    expect(event).toEqual({ day: copy.lastDay, kind: 'linen-short', kg: 0, neededKg: 12 });
  });
});

describe('len v simulaci', () => {
  it('ves ho k 1. 9. zaseje na potřebu, 31. 7. vytrhá a oděv má celý', () => {
    // první plán po založení pole je jen jař (díly hotové během roku) – len až k 1. 9.
    const planned = advanceVillage(found(at(600, 3, 1)), at(601, 9, 2), null);
    const flax = seasonCrop(planned.season, 'flax');
    expect(flax).toBeDefined();
    expect(planned.season!.flaxNeedKg).toBeCloseTo(flaxNeedKg(planned, at(601, 9, 1)), 9);
    const byId = new Map(planned.parts.map((p) => [p.id, p]));
    expect(flax!.partIds.every((id) => byId.get(id)?.crop === 'flax')).toBe(true);
    expect(seasonPartIds(planned.season!)).toEqual(expect.arrayContaining(flax!.partIds));
    const expected = flax!.partIds.reduce(
      (sum, id) => sum + expectedFlaxKg(byId.get(id)!, planned.lastDay),
      0,
    );
    expect(expected).toBeGreaterThanOrEqual(planned.season!.flaxNeedKg! - 1e-9);
    const pulled = advanceVillage(planned, at(602, 8, 1), null);
    const work = seasonCrop(pulled.season!, 'flax')!;
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
    const flax = seasonCrop(planned.season, 'flax');
    expect(flax).toBeDefined();
    const byId = new Map(planned.parts.map((p) => [p.id, p]));
    const expected = flax!.partIds.reduce(
      (sum, id) => sum + expectedFlaxKg(byId.get(id)!, planned.lastDay),
      0,
    );
    expect(expected).toBeGreaterThanOrEqual(planned.season!.flaxNeedKg! - 1e-9);
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
