import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../../village/core/actions';
import { yearlyFieldNeed } from '../../village/fields/field-food';
import { craftCoverage } from '../../village/crafts/crafts';
import { ageGroup } from '../../village/people/people';
import { stewardOutlook } from '../../village/steward/steward-outlook';
import { leavingGroups } from '../../village/trade/market-people';
import {
  D,
  familyHome,
  slaveFamilyHome,
  sownPart,
} from '../../village/trade/__tests__/market-fixtures';
import type { Person, VillageState } from '../../village/types';
import { dwelling } from '../../village/__tests__/kin-fixtures';
import { withBuiltFirstDwelling } from '../../village/__tests__/village-fixtures';
import { noMacroGoods } from '../macro';
import { VASSALAGE } from '../rules-vassalage';
import { found } from '../../village/core/__tests__/simulate-fixtures';
import { peopleOffer, villageSpare } from '../spare';
import { houseSpare, transportLimit } from '../transport';

// Výhled „kolik můžu postrádat“ (vassalage.md – Dávky, Výhled; Doprava a cílová ves). Ves ve tvaru
// Vlkova – plný Vlkov z vývojové DB má 3 MB (díly po čtvercích), do fixtur se nehodí; zásoby, seno,
// klády a společná práce jsou z jeho kopie 6. 11. 2026 (4 345 kg obilí, 10 347 kg sena, 3 655 klád,
// 6,99 čd společné práce denně).

const NOV_1 = dayIndexOf({ year: 600, month: 11, day: 1 });
const TARGET = { x: 0, y: 0 };

function vlkov(): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 11, day: NOV_1, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.lastDay = NOV_1;
  s.storesKg = 4_345;
  s.hay = { kg: 10_347, mowing: null };
  s.woodLogs = 3_655;
  s.commonLaborYearly = 6.99;
  return s;
}

/** Vlkov se spřežením: jeden vycvičený vůl a dvoukolák (vůz s 1 volem – oxen.md, Potah). */
function withCart(s: VillageState): VillageState {
  s.pens = [
    {
      id: 900,
      species: 'team',
      cell: { x: 3, y: 4 },
      x: 50,
      z: 60,
      builtDay: NOV_1 - 800,
      oxen: [{ trainedDay: NOV_1 - 400 }],
    },
  ];
  s.carts = [{ id: 1, kind: 'two-wheel', builtDay: NOV_1 - 10 }];
  return s;
}

describe('výhled přebytku vsi (villageSpare)', () => {
  it('bohatá ves dá obilí nad dvě roční potřeby, ves v hladu nedá nic', () => {
    const s = vlkov();
    s.storesKg = 50_000;
    const rich = villageSpare(s, NOV_1).grainKg;
    expect(rich).toBeGreaterThan(0);
    expect(rich).toBeLessThan(50_000);
    s.hungry = true;
    expect(villageSpare(s, NOV_1).grainKg).toBe(0);
  });

  it('pojistka: jídlo na dvě roční potřeby (ves bez pole – bez osiva), klády celá hromada', () => {
    const s = vlkov();
    const spare = villageSpare(s, NOV_1);
    const reserve = VASSALAGE.reserveYears * yearlyFieldNeed(s, NOV_1);
    expect(spare.grainKg).toBe(Math.max(0, Math.floor(4_345 - reserve)));
    expect(spare.logs).toBe(3_655);
    // robota – společná práce za rok
    expect(spare.laborDays).toBe(Math.floor(6.99 * 365));
  });
});

describe('doprava a výhled rodu (transportLimit, houseSpare)', () => {
  it('vzdálený vazal (5 políček) odvede méně klád než blízký (1 políčko)', () => {
    const s = vlkov();
    const near = houseSpare([{ state: s, cell: { x: 1, y: 0 } }], TARGET, noMacroGoods());
    const far = houseSpare([{ state: s, cell: { x: 5, y: 3 } }], TARGET, noMacroGoods());
    expect(far.logs).toBeLessThan(near.logs);
    // 6,99 čd × 30 dní listopadu; tam a zpět 2 × 2 dny na políčko; kláda = 2 nosiči
    const labor = 6.99 * 30;
    const trip = (cells: number): number => 2 * cells * VASSALAGE.travelDaysPerCell;
    expect(near.logs).toBe(Math.floor(Math.floor(labor / trip(1)) / 2));
    expect(far.logs).toBe(Math.floor(Math.floor(labor / trip(5)) / 2));
    // přebytek klád je velký – výhled drží doprava
    expect(near.logs).toBe(transportLimit(s, NOV_1, 1).logs);
  });

  it('závazky jiným pánům výhled zmenší', () => {
    const s = vlkov();
    const villages = [{ state: s, cell: { x: 1, y: 0 } }];
    const free = houseSpare(villages, TARGET, noMacroGoods());
    const owed = { ...noMacroGoods(), logs: 10, hayKg: 100 };
    const bound = houseSpare(villages, TARGET, { ...owed, laborDays: 500 });
    expect(bound.logs).toBe(free.logs - 10);
    expect(bound.hayKg).toBe(Math.max(0, free.hayKg - 100));
    expect(bound.laborDays).toBe(free.laborDays - 500);
    // víc závazků, než ves dá – nula, ne záporně
    const all = houseSpare(villages, TARGET, { ...owed, logs: 10_000 });
    expect(all.logs).toBe(0);
  });

  it('vůz s volem zvětší dopravu obilí i klád', () => {
    const plain = transportLimit(vlkov(), NOV_1, 1);
    const cart = transportLimit(withCart(vlkov()), NOV_1, 1);
    expect(cart.grainKg).toBeGreaterThan(plain.grainKg);
    expect(cart.logs).toBeGreaterThan(plain.logs);
    // dobytek žene honák – vůz na něj nemá vliv
    expect(cart.cattle).toEqual(plain.cattle);
  });

  it('vymřelá ves nic nedá, cesta uvnitř políčka je nejkratší', () => {
    const s = vlkov();
    const home = transportLimit(s, NOV_1, 0);
    expect(home.logs).toBeGreaterThan(transportLimit(s, NOV_1, 1).logs);
    const dead = { ...vlkov(), extinctDay: NOV_1 - 1 };
    const out = houseSpare([{ state: dead, cell: TARGET }], TARGET, noMacroGoods());
    expect(out.logs).toBe(0);
    expect(out.laborDays).toBe(0);
  });

  it('funkce nemění vstupní stav', () => {
    const s = withCart(vlkov());
    const before = structuredClone(s);
    villageSpare(s, NOV_1);
    transportLimit(s, NOV_1, 3);
    houseSpare([{ state: s, cell: { x: 2, y: 2 } }], TARGET, noMacroGoods());
    expect(s).toEqual(before);
  });

  it('výhled po vytažení pojistky obilí beze změny', () => {
    const s = vlkov();
    s.storesKg = 50_000;
    const withField = found(NOV_1);
    withField.storesKg = 50_000;
    // pevná čísla ze změny „vytáhnout grainReserveKg“ – výsledek musí zůstat
    expect(villageSpare(s, NOV_1).grainKg).toBe(48_880);
    expect(villageSpare(withField, NOV_1)).toEqual({
      grainKg: 48_706,
      hayKg: 40,
      cattle: { cows: 0, youngOxen: 0, trainedOxen: 0 },
      horses: 0,
      logs: 0,
      stoneM3: 0,
      people: { families: 0, men: 0, women: 0 },
      laborDays: 0,
    });
  });
});

describe('lidé na trhu a otroci z nabídky (peopleOffer – markets.md, Rozhodnutí plánu 5, bod 8)', () => {
  /** Otroci z nabídky `slaveFamilyHome` – muž 90 a žena 91 (25 a 24 let). */
  const RESERVED: ReadonlySet<number> = new Set([90, 91]);

  const outlookOf = (s: VillageState): ReturnType<typeof stewardOutlook> =>
    stewardOutlook(s, D, craftCoverage(s, D));

  /** Rozpočet lidí bez rezervace: dospělí × díl práce nad půdu, dolů. */
  function budgetOf(s: VillageState): number {
    const o = outlookOf(s);
    const share = o.landHa > 0 && o.laborHa > o.landHa ? 1 - o.landHa / o.laborHa : 0;
    const adults = s.people.filter((p) => ageGroup(p, D) === 'adult').length;
    return Math.floor(adults * share + 1e-9);
  }

  /**
   * `familyHome` a domy 600–603, v každém dva svobodní téhož pohlaví (muži v sudých, 700–707 od 22
   * a 21 let), otroci z nabídky svobodní muži 700 a 701 v domě 600; `parts` osetých dílů.
   */
  function singlesHome(parts: number): VillageState {
    const s = familyHome();
    s.fields = [{ id: 1 }];
    s.parts = Array.from({ length: parts }, (_, i) => sownPart(100 + i));
    s.pens = (s.pens ?? []).filter((p) => p.team === undefined || p.team === null);
    const bornDay = (age: number): number => D - Math.ceil((age + 0.5) * 365.25);
    for (let i = 0; i < 4; i++) {
      const dwellingId = 600 + i;
      const sex: Person['sex'] = i % 2 === 0 ? 'male' : 'female';
      s.dwellings.push({
        ...dwelling(dwellingId),
        position: { x: 100 + 12 * i, z: 30, rotation: 0 },
      });
      s.people.push(
        {
          id: 700 + 2 * i,
          bornDay: bornDay(22 + i),
          dwellingId,
          sex,
          ...(i === 0 ? { slave: true } : {}),
        },
        {
          id: 701 + 2 * i,
          bornDay: bornDay(21 + i),
          dwellingId,
          sex,
          ...(i === 0 ? { slave: true } : {}),
        },
      );
    }
    return s;
  }

  it('bez rezervace jako dnes; s rezervací jsou rodiny, muži a ženy bez otroků z nabídky', () => {
    const s = slaveFamilyHome(1);
    const o = outlookOf(s);
    expect(peopleOffer(s, D, o)).toEqual({ families: 1, men: 1, women: 0 });
    expect(peopleOffer(s, D, o, new Set())).toEqual({ families: 1, men: 1, women: 0 });
    // muž nabídky bez rezervace je otrok 90
    const men = leavingGroups(s, D, { families: 1, men: 1 }).men;
    expect(men.map((g) => g.people.map((p) => p.id))).toEqual([[90]]);
    expect(peopleOffer(s, D, o, RESERVED)).toEqual({ families: 1, men: 0, women: 0 });
  });

  it('rozpočet je o dospělé otroky z nabídky menší: rozpočet 3 – rodina a muž, s rezervací nic', () => {
    const s = slaveFamilyHome(150);
    expect(budgetOf(s)).toBe(3);
    const o = outlookOf(s);
    expect(peopleOffer(s, D, o)).toEqual({ families: 1, men: 1, women: 0 });
    // rozpočet 1 – rodina (2 dospělí) se nevejde, jiný svobodný muž není
    expect(peopleOffer(s, D, o, RESERVED)).toEqual({ families: 0, men: 0, women: 0 });
  });

  it('zranění otroci z nabídky (práce 0) rozpočet zmenší i tam, kde by práce vsi rodinu unesla', () => {
    // dospělí jsou v rozpočtu i zranění – bez odečtu by rodina odešla (bez jejích dvou dospělých
    // práce stačí), s odečtem je rozpočet 1
    const s = slaveFamilyHome(120);
    for (const p of s.people) if (RESERVED.has(p.id)) p.injuredUntilDay = D + 30;
    expect(budgetOf(s)).toBe(3);
    const o = outlookOf(s);
    expect(peopleOffer(s, D, o)).toEqual({ families: 1, men: 1, women: 0 });
    expect(peopleOffer(s, D, o, RESERVED)).toEqual({ families: 0, men: 0, women: 0 });
  });

  it('ves, které práce na půdu stačí jen s otroky z nabídky, nabídne o to méně (keepLabor bez nich)', () => {
    const s = singlesHome(238);
    expect(budgetOf(s)).toBe(4);
    const o = outlookOf(s);
    expect(peopleOffer(s, D, o)).toEqual({ families: 1, men: 1, women: 0 });
    // rozpočet 4 − 2 = 2 by rodinu 62–65 unesl, ale bez rodiny i otroků 700 a 701 je půdy víc než práce
    const family = new Set([62, 63, 64, 65]);
    const without = (ids: ReadonlySet<number>): VillageState => ({
      ...s,
      people: s.people.filter((p) => !ids.has(p.id)),
    });
    const afterFamily = outlookOf(without(family));
    expect(afterFamily.landHa).toBeLessThanOrEqual(afterFamily.laborHa);
    const afterBoth = outlookOf(without(new Set([...family, 700, 701])));
    expect(afterBoth.landHa).toBeGreaterThan(afterBoth.laborHa);
    expect(peopleOffer(s, D, o, new Set([700, 701]))).toEqual({ families: 0, men: 0, women: 0 });
  });
});
