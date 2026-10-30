import { describe, expect, it } from 'vitest';
import { foundVillage } from '../actions';
import { departVillage, settlersOf, travellingVillage } from '../departure';
import { SON_NAME_MISSING } from '../dynasty-names';
import { looseHorsesDay } from '../horse-stock';
import { villageHorses } from '../horses';
import { familyTrains } from '../lord';
import { advanceVillage } from '../simulate';
import {
  LEAD_NOT_SON,
  LEAD_TOO_YOUNG,
  SON_RELOCATING,
  SUCCESSOR_STAYS,
  checkSonLeader,
  departWithSon,
  leadingSons,
  sonDeparturePreview,
  sonShare,
} from '../son-departure';
import type { Construction, Dwelling, Person, VillageState } from '../types';
import { horse, horsePen } from './horse-fixtures';
import { DAY, kin, trackedVillage, type KinSpec } from './kin-fixtures';

// Dělení vsi – syn vojvody zakládá novou ves (lord.md – Dělení vsi, #9 fáze 2): kdo vede, poměrná
// část vsi, odchod syna, vojvoda nové vsi a kůň syna.

const at = (id: number, x: number, z: number): Dwelling => ({
  id,
  type: 'zemnice',
  builtDay: 0,
  condition: 1,
  position: { x, z, rotation: 0 },
});

/** Domácnost `size` lidí v obydlí `home` (ids od `first`). */
const household = (first: number, size: number, home: number): KinSpec[] =>
  Array.from({ length: size }, (_, i) => ({
    id: first + i,
    age: 30 - i,
    sex: i % 2 === 0 ? 'male' : 'female',
    home,
  }));

/**
 * Vojvoda 10 s ženou 11 v dvorci 1 (0, 0) a tři ženatí synové: nástupce 20 (dům 2, s dítětem),
 * Bořivoj 30 (dům 3 na severu) a Dobromil 40 (dům 4 na jihu). U domu 3 dvě čtyřčlenné domácnosti
 * (5, 6), u domu 4 dvě (7, 8), daleko tři pětičlenné (9–11) – 40 lidí, 4 dílníci, díl 10 lidí.
 * V domácnosti 5 žije starý muž rodu 50 (bratr vojvody) – nejstarší muž rodu mezi osadníky.
 */
function lordVillage(): VillageState {
  const s = trackedVillage(
    [
      { id: 10, age: 60, sex: 'male', spouse: 11 },
      { id: 11, age: 55, sex: 'female', spouse: 10 },
      { id: 20, age: 30, sex: 'male', spouse: 21, father: 10, mother: 11, home: 2 },
      { id: 21, age: 28, sex: 'female', spouse: 20, home: 2 },
      { id: 22, age: 5, sex: 'female', father: 20, mother: 21, home: 2 },
      { id: 30, age: 28, sex: 'male', spouse: 31, father: 10, mother: 11, home: 3 },
      { id: 31, age: 25, sex: 'female', spouse: 30, home: 3 },
      { id: 40, age: 26, sex: 'male', spouse: 41, father: 10, mother: 11, home: 4 },
      { id: 41, age: 24, sex: 'female', spouse: 40, home: 4 },
      { id: 50, age: 58, sex: 'male', home: 5 },
      ...household(51, 3, 5),
      ...household(60, 4, 6),
      ...household(70, 4, 7),
      ...household(80, 4, 8),
      ...household(90, 5, 9),
      ...household(100, 5, 10),
      ...household(110, 5, 11),
    ],
    [
      at(1, 0, 0),
      at(2, 100, 0),
      at(3, 0, 100),
      at(4, 0, -100),
      at(5, 0, 130),
      at(6, 30, 130),
      at(7, 0, -130),
      at(8, 30, -130),
      at(9, 300, 300),
      at(10, -300, 300),
      at(11, 300, -300),
    ],
    { storesKg: 400, meatKg: 40 },
  );
  const names: Record<number, string> = { 20: 'Bořek', 30: 'Bořivoj', 40: 'Dobromil' };
  for (const p of s.people) {
    if (p.id === 20) p.mainWifeSon = true;
    if (names[p.id] !== undefined) p.name = names[p.id];
    if (p.id === 50) p.line = true;
  }
  return s;
}

const ids = (people: readonly Person[]): number[] => people.map((p) => p.id).sort((a, b) => a - b);

describe('kdo vede odchod (checkSonLeader)', () => {
  it('syn vede; nástupce, syn bez jména, mladší 16 let a ne-syn ne', () => {
    const s = lordVillage();
    s.people.push({ ...kin({ id: 45, age: 12, sex: 'male', father: 10, mother: 11 }), line: true });
    expect(checkSonLeader(s, 30, DAY)).toEqual({ ok: true, reason: null });
    expect(checkSonLeader(s, 20, DAY).reason).toBe(SUCCESSOR_STAYS);
    expect(checkSonLeader(s, 45, DAY).reason).toBe(LEAD_TOO_YOUNG);
    expect(checkSonLeader(s, 50, DAY).reason).toBe(LEAD_NOT_SON);
    expect(checkSonLeader(s, 10, DAY).reason).toBe(LEAD_NOT_SON);
    delete s.people.find((p) => p.id === 40)!.name;
    expect(checkSonLeader(s, 40, DAY).reason).toBe(SON_NAME_MISSING);
    // řada synů v panelu: od nejstaršího, mladší 16 let chybí
    expect(leadingSons(s, DAY).map(({ son, check }) => [son.id, check.ok])).toEqual([
      [20, false],
      [30, true],
      [40, false],
    ]);
  });

  it('server odchod nevedeného syna odmítne', () => {
    expect(() => departWithSon(lordVillage(), DAY, 20)).toThrow(SUCCESSOR_STAYS);
  });
});

describe('poměrná část vsi (sonShare)', () => {
  it('díl 1 ÷ dílníků po celých domácnostech, bez dvorce a domácností ostatních synů', () => {
    const share = sonShare(lordVillage(), 30, DAY)!;
    expect(share.sharers).toBe(4);
    expect(share.target).toBe(10);
    expect(share.familyIds).toEqual([30, 31]);
    expect(share.dwellingIds).toEqual([5, 6]);
    expect(share.personIds).toHaveLength(10);
    expect(share.personIds).not.toContain(10);
    expect(share.personIds).not.toContain(20);
    expect(share.personIds).not.toContain(40);
  });

  it('dva synové po sobě berou stejný díl původní vsi', () => {
    const first = departWithSon(lordVillage(), DAY, 30, { villageName: 'Lhota' });
    expect(first.settlers.people).toHaveLength(10);
    expect(first.state.people).toHaveLength(30);
    const second = sonShare(first.state, 40, DAY)!;
    expect(second.sharers).toBe(3);
    expect(second.target).toBe(10);
    expect(second.dwellingIds).toEqual([7, 8]);
    expect(second.personIds).toHaveLength(10);
  });

  it('rodina syna odchází z dvorce, díl od nejbližších dvorci', () => {
    const s = lordVillage();
    for (const p of s.people) if (p.id === 30 || p.id === 31) p.dwellingId = 1;
    const share = sonShare(s, 30, DAY)!;
    // od dvorce (0, 0) stejně daleko 5 a 7 (130 m) – při shodě nižší id
    expect(share.dwellingIds).toEqual([5, 7]);
    const { state, settlers } = departWithSon(s, DAY, 30, { villageName: 'Lhota' });
    expect(ids(settlers.people)).toEqual(share.personIds);
    expect(ids(state.people.filter((p) => p.dwellingId === 1))).toEqual([10, 11]);
    expect(state.chronicle.at(-1)).toEqual({
      day: DAY,
      kind: 'son-left-village',
      name: 'Bořivoj',
      village: 'Lhota',
      households: 2,
      people: 10,
    });
    // jídlo podle lidí dílu (¼ vsi – unesou ho celé)
    expect(settlers.food.meatKg).toBeCloseTo(10, 6);
  });
});

describe('náhled odchodu (sonDeparturePreview)', () => {
  const expectSame = (s: VillageState, sonId: number): void => {
    const preview = sonDeparturePreview(s, sonId, DAY)!;
    const { settlers } = departWithSon(s, DAY, sonId);
    expect(preview.people).toBe(settlers.people.length);
    const food = Object.values(settlers.food).reduce((a, b) => a + b, 0);
    expect(preview.foodKg).toBeCloseTo(food, 6);
    expect(preview.seedKg).toBeCloseTo(settlers.seedKg ?? 0, 6);
    expect(preview.cart).toBe(settlers.cart?.kind ?? null);
    expect(preview.horse).toBe(settlers.horse !== undefined);
  };

  it('shoduje se s odchodem, i když je díl jen rodina syna a s koněm', () => {
    const s = lordVillage();
    s.pens = [horsePen(90, [{ ...horse(500, 6, 'male', 50, DAY), riderId: 30 }])];
    expectSame(s, 30);
    // malá ves: rodina syna pokryje cíl – žádné další obydlí
    const small = lordVillage();
    small.people = small.people.filter((p) => p.id < 50);
    small.dwellings = small.dwellings.filter((d) => d.id <= 4);
    const share = sonShare(small, 30, DAY)!;
    expect(share.dwellingIds).toEqual([]);
    const preview = sonDeparturePreview(small, 30, DAY)!;
    expect(preview.people).toBe(share.personIds.length);
    expect(preview.outlineDwellingIds).toEqual([3]);
    expectSame(small, 30);
  });

  it('obrys nese i dům rodiny syna mimo dvorec, dvorec ne', () => {
    const s = lordVillage();
    for (const p of s.people) if (p.id === 30 || p.id === 31) p.dwellingId = 1;
    expect(sonDeparturePreview(s, 30, DAY)!.outlineDwellingIds).toEqual([5, 7]);
  });
});

describe('poměrná část vsi – hrany', () => {
  it('velká nejbližší domácnost díl nezablokuje – přeskočí se a přibere menší dál', () => {
    const s = lordVillage();
    // dítě syna 30 (rodina 3), do domu 5 (nejblíž domu 3) se nastěhují dvě pětičlenné domácnosti
    // → 14 lidí; 110 odpadne, ať je ves zase 40 lidí (cíl 10)
    s.people.push(kin({ id: 32, age: 3, sex: 'female', father: 30, mother: 31, home: 3 }));
    s.people = s.people.filter((p) => p.id !== 110);
    for (const p of s.people) if (p.dwellingId === 9 || p.dwellingId === 10) p.dwellingId = 5;
    const share = sonShare(s, 30, DAY)!;
    expect(share.target).toBe(10);
    // 3 + 14 = 17 je od cíle stejně daleko jako 3 – přeskočí se; pak 6 a 7 (3 + 4 + 4 = 11)
    expect(share.dwellingIds).toEqual([6, 7]);
    expect(share.personIds).toHaveLength(11);
    expect(share.personIds).not.toContain(90);
  });

  it('domácnost, která si staví nový dům, do dílu nepatří a syn z ní vést nesmí', () => {
    const s = lordVillage();
    s.constructions = [{ relocates: 6 } as unknown as Construction];
    expect(sonShare(s, 30, DAY)!.dwellingIds).not.toContain(6);
    expect(sonShare(s, 30, DAY)!.dwellingIds).toEqual([5, 7]);
    s.constructions = [{ relocates: 3 } as unknown as Construction];
    expect(checkSonLeader(s, 30, DAY).reason).toBe(SON_RELOCATING);
    expect(() => departWithSon(s, DAY, 30)).toThrow(SON_RELOCATING);
  });

  it('v domě syna bydlí i cizí – ti zůstanou, odejde jen rodina', () => {
    const s = lordVillage();
    // do domu 3 se k Bořivojovi nastěhuje cizí domácnost 120–122
    s.people.push(...household(120, 3, 3).map((k) => kin(k)));
    const { state, settlers } = departWithSon(s, DAY, 30, { villageName: 'Lhota' });
    expect(ids(settlers.people)).toContain(30);
    expect(ids(settlers.people)).toContain(31);
    expect(ids(settlers.people)).not.toContain(120);
    expect(ids(state.people.filter((p) => p.dwellingId === 3))).toEqual([120, 121, 122]);
  });
});

describe('nová ves syna', () => {
  it('vojvodou je syn (ne nejstarší muž rodu), i po cestě na novou mapu', () => {
    const { settlers } = departWithSon(lordVillage(), DAY, 30, { direction: 'N' });
    expect(settlers.lordId).toBe(30);
    expect(ids(settlers.people)).toContain(50);
    const here = foundVillage({
      seed: 3,
      day: DAY,
      dwellingPosition: { x: 0, z: 0, rotation: 0 },
      settlers,
    });
    expect(here.dynasty).toEqual({
      lordId: 30,
      lords: [{ id: 30, name: 'Bořivoj', fromDay: DAY }],
    });
    expect(here.chronicle).toContainEqual({ day: DAY, kind: 'lord', name: 'Bořivoj' });
    const travelling = travellingVillage(settlers, 9, DAY, {
      direction: 'N',
      departedDay: DAY,
      arrivalDay: DAY + 2,
    });
    expect(travelling.journey?.lordId).toBe(30);
    const later = advanceVillage(travelling, DAY + 2, null);
    const arrived = foundVillage({
      seed: 9,
      day: DAY + 2,
      dwellingPosition: { x: 0, z: 0, rotation: 0 },
      settlers: settlersOf(later),
    });
    expect(arrived.dynasty?.lordId).toBe(30);
  });

  it('kůň syna jde s ním, v nové vsi čeká bez ohrady a s první ohradou koní do ní přejde', () => {
    const s = lordVillage();
    const mount = { ...horse(500, 6, 'male', 50, DAY), riderId: 30 };
    s.pens = [horsePen(90, [mount, horse(501, 8, 'female', 0, DAY)])];
    const { state, settlers } = departWithSon(s, DAY, 30);
    expect(settlers.horse).toMatchObject({ id: 500, riderId: 30, training: 50 });
    expect(villageHorses(state).map((h) => h.id)).toEqual([501]);
    const founded = foundVillage({
      seed: 3,
      day: DAY,
      dwellingPosition: { x: 0, z: 0, rotation: 0 },
      settlers,
    });
    expect(founded.looseHorses).toHaveLength(1);
    expect(founded.looseHorses![0]).toMatchObject({ riderId: 30, training: 50 });
    expect(villageHorses(founded)).toHaveLength(0);
    // na cestě drží koně ves na cestě
    const travelling = travellingVillage(settlers, 9, DAY, {
      direction: 'N',
      departedDay: DAY,
      arrivalDay: DAY + 2,
    });
    expect(settlersOf(travelling).horse).toMatchObject({ riderId: 30, training: 50 });
    // první ohrada koní
    const withPen: VillageState = { ...founded, pens: [{ ...horsePen(7, [], 1) }] };
    const events = looseHorsesDay(withPen, DAY + 1);
    expect(events).toEqual([{ day: DAY + 1, kind: 'horses-arrived', penId: 7, horses: 1 }]);
    expect(withPen.looseHorses).toBeUndefined();
    expect(villageHorses(withPen)).toHaveLength(1);
  });

  it('synové nového vojvody cvičí až od 4 dospělých mimo rodinu', () => {
    const { settlers } = departWithSon(lordVillage(), DAY, 30, { villageName: 'Lhota' });
    const founded = foundVillage({
      seed: 3,
      day: DAY,
      dwellingPosition: { x: 0, z: 0, rotation: 0 },
      settlers,
    });
    // rodina vojvody 30 = on a žena 31; ostatní dospělí osadníci jsou mimo rodinu (muž rodu 50 cvičí s ní)
    expect(familyTrains(founded, DAY)).toBe(true);
    const withOutsiders = (n: number): VillageState => {
      const outsiders = founded.people.filter((p) => p.id > 50).slice(0, n);
      return {
        ...founded,
        people: founded.people.filter((p) => p.id === 30 || p.id === 31 || outsiders.includes(p)),
      };
    };
    expect(familyTrains(withOutsiders(3), DAY)).toBe(false);
    expect(familyTrains(withOutsiders(4), DAY)).toBe(true);
  });

  it('kůň vojvody jde s ním při odchodu celé vsi s dvorcem', () => {
    const s = lordVillage();
    s.pens = [
      horsePen(90, [
        { ...horse(500, 6, 'male', 70, DAY), riderId: 10 },
        horse(501, 8, 'female', 0, DAY),
      ]),
    ];
    const all = s.dwellings.map((d) => d.id);
    const { settlers, state } = departVillage(s, DAY, all);
    expect(settlers.lordId).toBe(10);
    expect(settlers.horse).toMatchObject({ id: 500, riderId: 10, training: 70 });
    expect(villageHorses(state).map((h) => h.id)).not.toContain(500);
  });

  it('výsledek nezávisí na kouscích dopočtu', () => {
    const s = lordVillage();
    s.pens = [horsePen(90, [{ ...horse(500, 6, 'male', 50, DAY), riderId: 30 }])];
    const { settlers } = departWithSon(s, DAY, 30);
    const founded = foundVillage({
      seed: 3,
      day: DAY,
      dwellingPosition: { x: 0, z: 0, rotation: 0 },
      settlers,
    });
    const whole = advanceVillage(founded, DAY + 40, null);
    const pieces = advanceVillage(advanceVillage(founded, DAY + 13, null), DAY + 40, null);
    expect(pieces).toEqual(whole);
    expect(whole.dynasty?.lordId).toBe(30);
  });
});
