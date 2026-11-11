import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
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
  it('ves zakládá vojvoda (25) s hlavní (22) a vedlejšími (20, 18, 16) manželkami', () => {
    const s = found({ name: 'Bořivoj' });
    expect(s.people.map((p) => ageYears(p.bornDay, DAY))).toEqual([
      LORD.founders.lordAge,
      ...LORD.founders.wifeAges,
    ]);
    expect(s.people.map((p) => p.sex)).toEqual(['male', 'female', 'female', 'female', 'female']);
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
    // rodiče neznámí, manželky bez příznaku rodu, žádné děti
    for (const p of s.people) {
      expect(p.fatherId).toBeUndefined();
      expect(p.motherId).toBeUndefined();
    }
    expect(s.people.filter((p) => p.line).map((p) => p.id)).toEqual([2]);
    expect(s.dynasty).toEqual({ lordId: 2, lords: [{ id: 2, name: 'Bořivoj', fromDay: DAY }] });
  });

  it('jméno se znormalizuje; bez jména vojvoda na jméno čeká', () => {
    const named = found({ name: '  Bořivoj ' });
    expect(currentLord(named)?.name).toBe('Bořivoj');
    const waiting = found({});
    expect(currentLord(waiting)?.name).toBeUndefined();
    expect(waiting.dynasty).toEqual({ lordId: 2, lords: [{ id: 2, fromDay: DAY }] });
    expect(() => found({ name: 'Bořivoj II' })).toThrow(RangeError);
  });

  it('všichni na staveništi první zemnice, zásoby a stáda podle potřeby pěti lidí', () => {
    const s = found({ name: 'Bořivoj' });
    const zemnice = s.constructions[0]!;
    expect(zemnice).toMatchObject({ id: 7, kind: 'dwelling', dwellingId: 1 });
    expect(s.people.every((p) => p.dwellingId === 1)).toBe(true);
    expect(s.manorId).toBe(1);
    expect(s.nextId).toBe(8);
    const need = s.people.reduce((sum, p) => sum + FOOD_NEED_KG_PER_YEAR[ageGroup(p, DAY)], 0);
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
    // po dostavění první zemnice bydlí všech pět v ní (5 ze 6 míst – dvorec není přeplněný)
    expect(later.dwellings.map((d) => d.id)).toContain(1);
    expect(later.people.filter((p) => p.dwellingId === 1)).toHaveLength(5);
  });

  it('bez vojvody založí ves bez rodu se dvěma páry jako dřív', () => {
    const s = found();
    expect(s.dynasty).toEqual(NO_DYNASTY);
    expect(s.people.map((p) => ageYears(p.bornDay, DAY))).toEqual([...START_AGES]);
    expect(s.people.some((p) => p.line || p.name !== undefined)).toBe(false);
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
  /** Ves rodu bez jména vojvody; syn 8 hlavní manželky čeká na jméno, vnuk 9 už jméno má. */
  function withSons(): VillageState {
    const s = found({});
    s.people.push(
      {
        id: 8,
        bornDay: DAY - 400,
        dwellingId: 1,
        sex: 'male',
        fatherId: 2,
        motherId: 3,
        line: true,
        mainWifeSon: true,
      },
      { id: 9, bornDay: DAY - 10, dwellingId: 1, sex: 'male', line: true, name: 'Radim' },
      { id: 10, bornDay: DAY - 300, dwellingId: 1, sex: 'female', fatherId: 2, motherId: 4 },
    );
    s.nextId = 11;
    return s;
  }

  it('pojmenuje žijícího muže rodu bez jména – trvale, s kronikou', () => {
    const s = withSons();
    const named = nameLineMan(s, 8, ' Mrdomír ', DAY + 1);
    expect(named.ok).toBe(true);
    if (!named.ok) return;
    expect(byId(named.state, 8).name).toBe('Mrdomír');
    expect(named.state.chronicle.at(-1)).toEqual({
      day: DAY + 1,
      kind: 'line-named',
      name: 'Mrdomír',
      who: 'son',
    });
    // vstupní stav se nemění, záznam vojvodů jen u vojvody
    expect(byId(s, 8).name).toBeUndefined();
    expect(named.state.dynasty).toEqual(s.dynasty);
    expect(nameLineMan(named.state, 8, 'Bořivoj', DAY + 2)).toEqual({
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
    expect(nameLineMan(s, 10, 'Mrdomír', DAY)).toEqual(notLine);
    expect(nameLineMan(s, 3, 'Mrdomír', DAY)).toEqual(notLine);
    expect(nameLineMan(s, 99, 'Mrdomír', DAY)).toEqual(notLine);
    expect(nameLineMan(s, 9, 'Mrdomír', DAY)).toEqual({
      ok: false,
      reason: 'Jméno už má – nejde ho změnit.',
    });
    expect(nameLineMan(s, 8, 'Bo-ři', DAY)).toEqual({ ok: false, reason: 'Jen písmena.' });
    expect(nameLineMan(s, 8, ' ', DAY)).toEqual({ ok: false, reason: 'Syn potřebuje jméno.' });
  });
});
