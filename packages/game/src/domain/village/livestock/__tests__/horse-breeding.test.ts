import { describe, expect, it } from 'vitest';
import {
  horseBirths,
  horsesDay,
  horsesOverRoom,
  horsesWanted,
  retireHorses,
} from '../horse-breeding';
import { horsesForSale } from '../../trade/horse-trade';
import { villageHorses } from '../horses';
import { HORSES } from '../../rules';
import { advanceVillage } from '../../core/simulate';
import type { ChronicleEvent, VillageState } from '../../types';
import { at, horse, horseVillage, START } from '../../__tests__/horse-fixtures';

// Chov koní (horses.md – Chov): hříbata 1. 5. každý druhý rok s hřebcem, kolik koní ves chce,
// 1. 11. na maso koně od 20 let a koně navíc (nejdřív nejstarší).

const kinds = (events: ChronicleEvent[], kind: ChronicleEvent['kind']): ChronicleEvent[] =>
  events.filter((e) => e.kind === kind);

describe('hříbata 1. 5. (horses.md – Chov)', () => {
  it('s hřebcem rodí klisna každý druhý rok, pohlaví ze seedu', () => {
    // klisny 2 a 4 mají stejnou paritu id – rodí obě ve stejném roce
    const s = horseVillage([horse(1, 8), horse(2, 6, 'female'), horse(4, 7, 'female')], 3);
    const born: number[] = [];
    for (const year of [601, 602, 603, 604]) {
      const events = horseBirths(s, at(year, 5, 1));
      born.push(events.reduce((sum, e) => sum + (e.kind === 'foal-born' ? e.foals : 0), 0));
    }
    expect(born).toEqual([0, 2, 0, 0]); // poptávka je pokrytá, 604 už nerodí
    const foals = villageHorses(s).filter((h) => h.id >= 1000);
    expect(foals).toHaveLength(2);
    expect(foals.every((h) => h.training === 0)).toBe(true);
    expect(new Set(foals.map((h) => h.id)).size).toBe(2);
    expect(s.nextId).toBe(1002);
  });

  it('bez jezdeckého koně od 3 let klisny nerodí', () => {
    const MAY = at(602, 5, 1);
    const s = horseVillage(
      [horse(1, 2, 'male', 0, MAY), horse(2, 6, 'female'), horse(4, 7, 'female')],
      3,
    );
    expect(horseBirths(s, MAY)).toEqual([]);
    expect(villageHorses(s)).toHaveLength(3);
  });

  it('hříbě potřebuje místo v ohradě', () => {
    const s = horseVillage(
      [horse(1, 8), horse(2, 6, 'female'), horse(4, 7, 'female'), horse(5, 2, 'female')],
      1,
    );
    expect(horseBirths(s, at(602, 5, 1))).toEqual([]);
  });

  it('den chovu – jen 1. 5. a 1. 11., ves bez koní nic', () => {
    const s = horseVillage([horse(1, 8), horse(2, 6, 'female')], 2);
    expect(horsesDay(s, at(602, 5, 2))).toEqual([]);
    expect(kinds(horsesDay(s, at(602, 5, 1)), 'foal-born')).toHaveLength(1);
    const bare = horseVillage();
    expect(horsesDay(bare, at(602, 5, 1))).toEqual([]);
    expect(bare.pens?.some((p) => p.species === 'horse') ?? false).toBe(false);
  });
});

describe('kolik koní ves chce (horses.md – Chov)', () => {
  it('jezdec na muže rodiny od 10 let, klisny 1 + 1 na 3 jezdce, hříbata na chybějící hřebečky', () => {
    // jezdci: vojvoda 40, syn 17, syn 11 – za 3 roky tři jezdci a dva koně, kteří ještě slouží
    const s = horseVillage([horse(1, 4), horse(2, 5), horse(3, 18)], 2);
    expect(horsesWanted(s, START)).toEqual({ riding: 3, mares: 2, foals: 1 });
  });

  it('strop jsou místa v ohradách koní', () => {
    const s = horseVillage([horse(1, 4)], 1);
    expect(horsesWanted(s, START)).toEqual({ riding: 3, mares: 1, foals: 0 });
  });
});

describe('koně se nevejdou do ohrady (horses.md – Chov)', () => {
  it('ves chce víc koní, než je míst; s dost místy ne; bez ohrady koní nikdy', () => {
    // tři jezdci a dvě klisny = 5 koní
    expect(horsesOverRoom(horseVillage([horse(1, 4)], 1), START)).toBe(true);
    expect(horsesOverRoom(horseVillage([horse(1, 4)], 2), START)).toBe(false);
    expect(horsesOverRoom(horseVillage(), START)).toBe(false);
  });

  it('stejná poptávka jako horsesWanted: ořezané místy, klisna bez jezdců drží jednoho koně', () => {
    // tři jezdci + dvě klisny = 5 proti 4 místům – wanted je ořezané na místa, přesto nevejde
    const full = horseVillage([horse(1, 4)], 1);
    const wanted = horsesWanted(full, START);
    expect(wanted.riding + wanted.mares).toBe(4);
    expect(horsesOverRoom(full, START)).toBe(true);
    // bez jezdců, ale s klisnou: aspoň jeden jezdecký kůň + klisna se vejdou
    const mareOnly = horseVillage([horse(2, 6, 'female')], 1);
    const none = { trainees: [] };
    expect(horsesWanted(mareOnly, START, none)).toMatchObject({ riding: 1, mares: 1 });
    expect(horsesOverRoom(mareOnly, START, none)).toBe(false);
  });
});

describe('koně na maso 1. 11. (horses.md – Chov)', () => {
  const NOV = at(601, 11, 1);

  it('koně od 20 let dosloužili a jdou na maso', () => {
    const s = horseVillage(
      [horse(1, 21, 'male', 100, NOV), horse(2, 6, 'male', 0, NOV), horse(4, 10, 'female', 0, NOV)],
      2,
    );
    const meat = s.meatKg ?? 0;
    const events = retireHorses(s, NOV);
    expect(events).toEqual([
      { day: NOV, kind: 'horse-retired', penId: 90, horses: 1, reason: 'age' },
    ]);
    expect(villageHorses(s).map((h) => h.id)).toEqual([2, 4]);
    expect((s.meatKg ?? 0) - meat).toBe(HORSES.meatKg);
  });

  it('koně navíc jdou nejdřív nejstarší, hříbata zůstávají', () => {
    const riding = [4, 5, 6, 7, 8].map((age, i) => horse(i + 1, age, 'male', 0, NOV));
    const mares = [5, 6, 9].map((age, i) => horse(i + 11, age, 'female', 0, NOV));
    const foals = [horse(21, 2, 'male', 0, NOV), horse(22, 1, 'female', 0, NOV)];
    const s = horseVillage([...riding, ...mares, ...foals], 4);
    const meat = s.meatKg ?? 0;
    const events = retireHorses(s, NOV);
    expect(events).toEqual([
      { day: NOV, kind: 'horse-retired', penId: 90, horses: 3, reason: 'surplus' },
    ]);
    // 3 jezdci – pryč koně 8 a 7 let; 2 klisny – pryč klisna 9 let
    expect(villageHorses(s).map((h) => h.id)).toEqual([1, 2, 3, 11, 12, 21, 22]);
    expect((s.meatKg ?? 0) - meat).toBe(3 * HORSES.meatKg);
  });
});

describe('hřebce držet vždy (Martin 31. 10. 2026)', () => {
  const NOV = at(601, 11, 1);
  const none = { trainees: [] };

  it('bez jezdců i bez klisny ves chce hřebce a 1. 11. ho nepošle na maso', () => {
    const s = horseVillage([horse(1, 5, 'male', 20, NOV), horse(2, 8, 'male', 60, NOV)], 2);
    expect(horsesWanted(s, NOV, none)).toMatchObject({ riding: 1 });
    retireHorses(s, NOV, none);
    // zůstane nejlépe vycvičený
    expect(villageHorses(s).map((h) => h.id)).toEqual([2]);
    // jediný hřebec zůstane
    expect(retireHorses(s, NOV, none)).toEqual([]);
    expect(villageHorses(s).map((h) => h.id)).toEqual([2]);
  });

  it('jediného volného hřebce ves neprodá ani bez klisny', () => {
    const s = horseVillage([horse(1, 5, 'male', 0, NOV)], 2);
    expect(horsesForSale(s, 'ridingHorses', NOV)).toBe(0);
  });
});

describe('čekající kůň stárne (horses.md – Chov)', () => {
  const NOV = at(601, 11, 1);

  it('bez ohrady 1. 11. doslouží jako v ohradě, mladší čeká dál', () => {
    const s = horseVillage();
    s.looseHorses = [horse(1, 21, 'male', 0, NOV), horse(2, 6, 'male', 0, NOV)];
    const meat = s.meatKg ?? 0;
    horsesDay(s, at(601, 10, 31));
    expect(s.looseHorses).toHaveLength(2);
    horsesDay(s, NOV);
    expect(s.looseHorses.map((h) => h.id)).toEqual([2]);
    expect((s.meatKg ?? 0) - meat).toBe(HORSES.meatKg);
    s.looseHorses = [horse(3, 25, 'female', 0, NOV)];
    horsesDay(s, NOV);
    expect(s.looseHorses).toBeUndefined();
  });
});

describe('chov den po dni', () => {
  const horses = (): VillageState => {
    const s = horseVillage(
      [horse(1, 8, 'male', 30), horse(3, 6, 'female'), horse(5, 7, 'female'), horse(7, 21)],
      3,
    );
    // seno na zimu i pro koně – osadníci přivezli jen seno stáda na dny se sněhem (diet.md – Zima
    // bez sena)
    s.hay = { kg: 5_000, mowing: null };
    return s;
  };
  const TO = at(601, 11, 5);

  it('dopočet po kouscích dá stejný stav', () => {
    const whole = advanceVillage(horses(), TO, null);
    let chunked = horses();
    for (let day = START + 37; day < TO; day += 37) chunked = advanceVillage(chunked, day, null);
    chunked = advanceVillage(chunked, TO, null);
    expect(chunked).toEqual(whole);
    // hříbata 1. 5. 601 (klisny 3 a 5 – lichá id v lichém roce), kůň 21 let 1. 11. na maso
    expect(kinds(whole.chronicle, 'foal-born')).toEqual([
      { day: at(601, 5, 1), kind: 'foal-born', penId: 90, foals: 2 },
    ]);
    expect(kinds(whole.chronicle, 'horse-retired')).toEqual([
      { day: at(601, 11, 1), kind: 'horse-retired', penId: 90, horses: 1, reason: 'age' },
    ]);
    // hřebec jezdí pod vojvodou – výcvik roste
    const stallion = villageHorses(whole).find((h) => h.id === 1)!;
    expect(stallion.riderId).toBe(10);
    expect(stallion.training).toBeGreaterThan(32);
  });
});
