import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage, startNewDwelling } from '../../core/actions';
import { isOvercrowded } from '../../buildings/dwellings';
import type { Settlers } from '../departure';
import {
  NO_DYNASTY,
  currentLord,
  isSecondaryWife,
  mainWifeOf,
  nameLineMan,
  wivesOf,
} from '../dynasty';
import { checkPersonName, normalizePersonName } from '../dynasty-names';
import { foundingLivestock } from '../../livestock/livestock';
import { familyTrains } from '../lord';
import { successorOf } from '../succession';
import { ageGroup, ageYears } from '../people';
import {
  BIRTH_SPACING,
  FOOD_NEED_KG_PER_YEAR,
  FOUNDERS_STORES,
  LORD,
  START_AGES,
  START_SEED_YEARS,
  START_STORES_MONTHS,
} from '../../rules';
import { advanceVillage } from '../../core/simulate';
import type { Person, VillageState } from '../../types';

// Zakladatelé rodu a jména na serveru (lord.md – Rod vojvody, Zakladatelé, Jména; Martin
// 24. 10. 2026: „Vesnici zakládá vojvoda a jeho rodina.“, „Vlastní text bez kontroly. Povolená
// jsou jen písmena.“).

const DAY = dayIndexOf({ year: 601, month: 3, day: 1 });
const AT = { x: 0, z: 0, rotation: 0 };
const found = (lord?: { name?: string }): VillageState =>
  foundVillage({ seed: 7, day: DAY, dwellingPosition: AT, ...(lord ? { lord } : {}) });
const byId = (s: VillageState, id: number): Person => s.people.find((p) => p.id === id)!;

describe('zakladatelé rodu', () => {
  it('ves zakládá vojvoda (42) s hlavní (38) a vedlejšími (35, 25, 20) manželkami a 4 syny', () => {
    const s = found({ name: 'Bořivoj' });
    expect(s.people.map((p) => ageYears(p.bornDay, DAY))).toEqual([
      42, 38, 35, 25, 20, 20, 18, 17, 16,
    ]);
    expect(s.people.map((p) => ageYears(p.bornDay, DAY))).toEqual([
      LORD.founders.lordAge,
      ...LORD.founders.wifeAges,
      ...LORD.founders.sons.map((son) => son.age),
    ]);
    expect(s.people.map((p) => p.sex)).toEqual([
      'male',
      ...Array<string>(4).fill('female'),
      ...Array<string>(4).fill('male'),
    ]);
    const lord = currentLord(s)!;
    expect(lord.id).toBe(2);
    expect(lord).toMatchObject({ line: true, name: 'Bořivoj', spouseId: 3 });
    expect(mainWifeOf(s, lord)?.id).toBe(3);
    expect(wivesOf(s, lord).map((w) => w.id)).toEqual([3, 4, 5, 6]);
    expect([3, 4, 5, 6].map((id) => isSecondaryWife(s, byId(s, id)))).toEqual([
      false,
      true,
      true,
      true,
    ]);
    // vojvoda a manželky – rodiče neznámí, manželky bez příznaku rodu
    for (const id of [2, 3, 4, 5, 6]) {
      expect(byId(s, id).fatherId).toBeUndefined();
      expect(byId(s, id).motherId).toBeUndefined();
    }
    expect(s.people.filter((p) => p.line).map((p) => p.id)).toEqual([2, 7, 8, 9, 10]);
    expect(s.dynasty).toEqual({ lordId: 2, lords: [{ id: 2, name: 'Bořivoj', fromDay: DAY }] });
  });

  it('4 dospělí synové vojvody (aspoň 16 let) – matkou hlavní a druhá manželka, jméno od rodu', () => {
    const s = found({ name: 'Bořivoj' });
    const sons = s.people.filter((p) => p.fatherId === 2);
    // Martin 15. 11. 2026: „aby měl vojvoda minimálně 4 dospělé (alespoň 16 let) syny“
    expect(sons.filter((p) => p.sex === 'male' && ageYears(p.bornDay, DAY) >= 16)).toHaveLength(4);
    expect(sons.map((p) => [p.id, p.motherId])).toEqual([
      [7, 3],
      [8, 3],
      [9, 4],
      [10, 4],
    ]);
    // muži rodu, syn hlavní manželky má přednost v nástupnictví (elitu mu dá denní pravidlo)
    for (const son of sons) expect(son).toMatchObject({ line: true, dwellingId: 1 });
    expect(sons.filter((p) => p.mainWifeSon).map((p) => p.id)).toEqual([7, 8]);
    expect(sons.some((p) => p.elite || p.spouseId !== undefined)).toBe(false);
    // jména vygenerovaná jako vnukům – různá, bez jména vojvody; hráč je smí jednou přepsat
    const names = sons.map((p) => p.name);
    expect(names.every((n) => n !== undefined && checkPersonName(n).ok)).toBe(true);
    expect(new Set([...names, 'Bořivoj']).size).toBe(5);
    expect(sons.every((p) => p.nameByHouse === true)).toBe(true);
    expect(found({ name: 'Bořivoj' }).people.map((p) => p.name)).toEqual(
      s.people.map((p) => p.name),
    );
    const renamed = nameLineMan(s, 7, 'Mrdomír', DAY);
    expect(renamed.ok && byId(renamed.state, 7).name).toBe('Mrdomír');
    // synové od 16 let – nástupce je nejstarší syn hlavní manželky, odchod smí vést ostatní
    expect(successorOf(s, 2)?.id).toBe(7);
    expect(sons.every((p) => ageYears(p.bornDay, DAY) >= LORD.leaveMinAge)).toBe(true);
  });

  it('jméno se znormalizuje; bez jména vojvoda na jméno čeká', () => {
    const named = found({ name: '  Bořivoj ' });
    expect(currentLord(named)?.name).toBe('Bořivoj');
    const waiting = found({});
    expect(currentLord(waiting)?.name).toBeUndefined();
    expect(waiting.dynasty).toEqual({ lordId: 2, lords: [{ id: 2, fromDay: DAY }] });
    expect(() => found({ name: 'Bořivoj II' })).toThrow(RangeError);
  });

  it('všichni na staveništi první zemnice, zásoby a stáda podle potřeby devíti lidí', () => {
    const s = found({ name: 'Bořivoj' });
    const zemnice = s.constructions[0]!;
    expect(zemnice).toMatchObject({ id: 11, kind: 'dwelling', dwellingId: 1 });
    expect(s.people.every((p) => p.dwellingId === 1)).toBe(true);
    expect(s.manorId).toBe(1);
    expect(s.nextId).toBe(12);
    const need = s.people.reduce((sum, p) => sum + FOOD_NEED_KG_PER_YEAR[ageGroup(p, DAY)], 0);
    // 9 dospělých × 180 kg (lord.md – Zakladatelé): 4 860 kg jídla a 3 240 kg osiva
    expect(need).toBe(9 * FOOD_NEED_KG_PER_YEAR.adult);
    expect(s.storesKg).toBeCloseTo(4_860 + 3_240, 6);
    expect(s.reservedSeedKg).toBeCloseTo(3_240, 6);
    // velká zásoba zakladatelů (FOUNDERS_STORES): jídlo na víc let a osivo jen na setí
    const seedKg = need * FOUNDERS_STORES.seedYears;
    expect(s.storesKg).toBeCloseTo(need * FOUNDERS_STORES.foodYears + seedKg, 6);
    expect(s.reservedSeedKg).toBeCloseTo(seedKg, 6);
    expect(s.reservedSeedUntilDay).toBe(DAY + Math.ceil(FOUNDERS_STORES.seedKeepYears * 365.25));
    // ves bez rodu beze změny – 18 měsíců jídla a osivo na první osev, bez rezervy
    const plain = found();
    const plainNeed = plain.people.reduce(
      (sum, p) => sum + FOOD_NEED_KG_PER_YEAR[ageGroup(p, DAY)],
      0,
    );
    expect(plain.storesKg).toBeCloseTo(
      (plainNeed * START_STORES_MONTHS) / 12 + plainNeed * START_SEED_YEARS,
      6,
    );
    expect(plain.reservedSeedKg).toBeUndefined();
    expect(plain.reservedSeedUntilDay).toBeUndefined();
    const { herds, young } = foundingLivestock({ people: s.people }, DAY);
    expect(s.livestock?.herds).toEqual(herds);
    expect(s.livestock?.young).toEqual(young);
  });

  it('všechny manželky porodí nejdřív za 9 měsíců, rodina zpočátku pracuje', () => {
    const s = found({ name: 'Bořivoj' });
    for (const id of [3, 4, 5, 6]) {
      expect(byId(s, id).nextBirthFrom).toBe(DAY + BIRTH_SPACING.afterWeddingDays);
    }
    expect(familyTrains(s, DAY)).toBe(false);
    const later = advanceVillage(s, DAY + BIRTH_SPACING.afterWeddingDays - 1, null);
    expect(later.chronicle.filter((e) => e.kind === 'birth' || e.kind === 'line-birth')).toEqual(
      [],
    );
    // po dostavění první zemnice bydlí všech devět v ní (9 ze 6 míst – dvorec je přeplněný)
    expect(later.dwellings.map((d) => d.id)).toContain(1);
    expect(later.people.filter((p) => p.dwellingId === 1)).toHaveLength(9);
    expect(isOvercrowded(later, 1, later.lastDay)).toBe(true);
  });

  it('z přeplněného dvorce odejde do dalšího obydlí druhá manželka se syny 17 a 16 let', () => {
    // bez dalšího obydlí zůstanou všichni v dvorci (lord.md – Manželky, Bydlení)
    const crowded = advanceVillage(found({ name: 'Bořivoj' }), DAY + 60, null);
    expect(crowded.dwellings.map((d) => d.id)).toEqual([1]);
    expect(crowded.people.filter((p) => p.dwellingId === 1)).toHaveLength(9);
    // vedlejší manželka s nejstarším synem, který by se mohl starat o dům, je rodinou k osídlení –
    // hráč smí stavět obydlí hned
    const building = startNewDwelling(
      crowded,
      DAY + 60,
      'zemnice',
      { x: 40, z: 0, rotation: 0 },
      0,
    );
    const settled = advanceVillage(building, DAY + 150, null);
    const home = settled.dwellings.find((d) => d.id !== 1)!;
    const at = (dwellingId: number): number[] =>
      settled.people.filter((p) => p.dwellingId === dwellingId).map((p) => p.id);
    expect(at(home.id)).toEqual(expect.arrayContaining([4, 9, 10]));
    // v dvorci vojvoda, hlavní manželka se syny 20 a 18 let a dvě mladší manželky – 6 ze 6 míst
    expect(at(1)).toEqual(expect.arrayContaining([2, 3, 5, 6, 7, 8]));
    expect(at(1).filter((id) => id <= 10)).toHaveLength(6);
  });

  it('první zemnici a pole staví 5 mužů – stojí dřív než s vojvodou bez synů (D24)', () => {
    const start = dayIndexOf({ year: 600, month: 3, day: 15 });
    // pole ≈ 1,7 ha – 75 dílů po 225 m² (jako simulate-fixtures)
    const parts = Array.from({ length: 75 }, (_, i) => ({
      areaM2: 225,
      distanceM: 50 + Math.round((50 * i) / 74),
      naturalFertility: 70,
      surface: 'meadow' as const,
      obstacleCost: 0,
    }));
    const founding = (sons: boolean): VillageState => {
      const s = foundVillage({
        seed: 7,
        day: start,
        dwellingPosition: AT,
        firstField: {
          outline: [
            [0, 0],
            [10, 0],
            [10, 10],
          ],
          parts,
        },
        lord: { name: 'Bořivoj' },
      });
      // zakladatelé do 15. 11. 2026 – vojvoda s manželkami, jediný muž
      if (!sons) s.people = s.people.filter((p) => p.fatherId === undefined);
      return s;
    };
    const withSons = advanceVillage(founding(true), start + 30, null);
    const alone = advanceVillage(founding(false), start + 30, null);
    // měření 15. 11. 2026: se syny zemnice 23. den a pole 47. den, vojvoda sám 97. a 212. den
    expect(withSons.dwellings.map((d) => d.id)).toEqual([1]);
    expect(alone.dwellings).toEqual([]);
    const field = (s: VillageState): boolean => s.constructions.some((c) => c.kind === 'field');
    expect(field(advanceVillage(withSons, start + 60, null))).toBe(false);
    expect(field(advanceVillage(alone, start + 60, null))).toBe(true);
  });

  it('bez vojvody založí ves bez rodu se dvěma páry jako dřív', () => {
    const s = found();
    expect(s.dynasty).toEqual(NO_DYNASTY);
    expect(s.people.map((p) => ageYears(p.bornDay, DAY))).toEqual([...START_AGES]);
    expect(s.people.some((p) => p.line)).toBe(false);
    // jména mají všichni od založení (population.md – Jména)
    expect(s.people.every((p) => p.name !== undefined)).toBe(true);
  });

  it('osadníci – vojvodou je nejstarší muž rodu mezi nimi, bez něj ves bez rodu', () => {
    const person = (id: number, age: number, extra: Partial<Person> = {}): Person => ({
      id,
      bornDay: DAY - Math.ceil(age * 365.25),
      dwellingId: 9,
      sex: 'male',
      ...extra,
    });
    const settlers = (people: Person[]): Settlers => ({
      people,
      ancestors: [],
      emigrants: [],
      food: { grainKg: 100, meatKg: 0, cheeseKg: 0, legumesKg: 0, applesKg: 0 },
      herds: { sheep: 0, goat: 0, pig: 0, cow: 0 },
      young: { sheep: 0, goat: 0, pig: 0, cow: 0 },
    });
    const foundBy = (people: Person[]): VillageState =>
      foundVillage({
        seed: 7,
        day: DAY,
        dwellingPosition: AT,
        settlers: settlers(people),
        lord: { name: 'Bořivoj' },
      });
    const withLine = foundBy([
      person(20, 50),
      person(21, 30, { line: true }),
      person(22, 40, { line: true, name: 'Ctibor' }),
      person(23, 45, { sex: 'female' }),
    ]);
    expect(withLine.dynasty).toEqual({
      lordId: 22,
      lords: [{ id: 22, name: 'Ctibor', fromDay: DAY }],
    });
    // zakladatelé výpravu nemění – jméno vojvody z `lord` se nepoužije
    expect(withLine.people.map((p) => p.id)).toEqual([20, 21, 22, 23]);
    // ves z výpravy nese vlastní náklad – zásoba zakladatelů jen první vsi
    expect(withLine.storesKg).toBe(100);
    expect(withLine.reservedSeedKg).toBeUndefined();
    expect(withLine.reservedSeedUntilDay).toBeUndefined();
    expect(foundBy([person(20, 50), person(23, 45, { sex: 'female' })]).dynasty).toEqual(
      NO_DYNASTY,
    );
  });
});

describe('checkPersonName', () => {
  it('jen písmena Unicode, 1–20 znaků, okrajové mezery se oříznou', () => {
    for (const ok of ['Mrdomír', 'Ярослав', 'Bořivoj', '  Bořivoj  ', 'Ž', 'a'.repeat(20)]) {
      expect(checkPersonName(ok)).toEqual({ ok: true, reason: null });
    }
    expect(normalizePersonName('  Bořivoj ')).toBe('Bořivoj');
    expect(checkPersonName('Bořivoj II').reason).toBe('Jen písmena.');
    expect(checkPersonName('Bo-ři').reason).toBe('Jen písmena.');
    expect(checkPersonName('Bořivoj1').reason).toBe('Jen písmena.');
    expect(checkPersonName('ř'.repeat(21)).reason).toBe('Nejvýš 20 písmen.');
    expect(checkPersonName('   ').reason).toBe('Vojvoda potřebuje jméno.');
  });

  it('neviditelná „písmena“ (výplně hangulu) neprojdou – samotná ani uvnitř jména', () => {
    for (const filler of ['\u115f', '\u1160', '\u3164', '\uffa0']) {
      expect(checkPersonName(filler).reason).toBe('Jen písmena.');
      expect(checkPersonName(`Bořivoj${filler}`).reason).toBe('Jen písmena.');
    }
  });
});

describe('nameLineMan', () => {
  /**
   * Ves rodu bez jména vojvody; syn 12 hlavní manželky čeká na jméno, vnuk 13 už jméno má, 14 je
   * dcera (id za zakladateli a stavbou zemnice 11).
   */
  function withSons(): VillageState {
    const s = found({});
    s.people.push(
      {
        id: 12,
        bornDay: DAY - 400,
        dwellingId: 1,
        sex: 'male',
        fatherId: 2,
        motherId: 3,
        line: true,
        mainWifeSon: true,
      },
      { id: 13, bornDay: DAY - 10, dwellingId: 1, sex: 'male', line: true, name: 'Radim' },
      { id: 14, bornDay: DAY - 300, dwellingId: 1, sex: 'female', fatherId: 2, motherId: 4 },
    );
    s.nextId = 15;
    return s;
  }

  it('pojmenuje žijícího muže rodu bez jména – trvale, s kronikou', () => {
    const s = withSons();
    const named = nameLineMan(s, 12, ' Mrdomír ', DAY + 1);
    expect(named.ok).toBe(true);
    if (!named.ok) return;
    expect(byId(named.state, 12).name).toBe('Mrdomír');
    expect(named.state.chronicle.at(-1)).toEqual({
      day: DAY + 1,
      kind: 'line-named',
      name: 'Mrdomír',
      who: 'son',
    });
    // vstupní stav se nemění, záznam vojvodů jen u vojvody
    expect(byId(s, 12).name).toBeUndefined();
    expect(named.state.dynasty).toEqual(s.dynasty);
    expect(nameLineMan(named.state, 12, 'Bořivoj', DAY + 2)).toEqual({
      ok: false,
      reason: 'Jméno už má – nejde ho změnit.',
    });
  });

  it('vojvodovi doplní jméno i do záznamu vojvodů', () => {
    const named = nameLineMan(withSons(), 2, 'Bořivoj', DAY);
    expect(named.ok && named.state.dynasty).toEqual({
      lordId: 2,
      lords: [{ id: 2, name: 'Bořivoj', fromDay: DAY }],
    });
  });

  it('odmítne ženu, muže mimo rod, zemřelého, pojmenovaného a neplatné jméno', () => {
    const s = withSons();
    const notLine = { ok: false, reason: 'Jméno dává vojvoda jen mužům rodu.' };
    expect(nameLineMan(s, 14, 'Mrdomír', DAY)).toEqual(notLine);
    expect(nameLineMan(s, 3, 'Mrdomír', DAY)).toEqual(notLine);
    expect(nameLineMan(s, 99, 'Mrdomír', DAY)).toEqual(notLine);
    expect(nameLineMan(s, 13, 'Mrdomír', DAY)).toEqual({
      ok: false,
      reason: 'Jméno už má – nejde ho změnit.',
    });
    expect(nameLineMan(s, 12, 'Bo-ři', DAY)).toEqual({ ok: false, reason: 'Jen písmena.' });
    expect(nameLineMan(s, 12, ' ', DAY)).toEqual({ ok: false, reason: 'Syn potřebuje jméno.' });
  });
});
