import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../../village/core/actions';
import { yearlyFieldNeed } from '../../village/fields/field-food';
import type { VillageState } from '../../village/types';
import { withBuiltFirstDwelling } from '../../village/__tests__/village-fixtures';
import { noMacroGoods } from '../macro';
import { VASSALAGE } from '../rules-vassalage';
import { villageSpare } from '../spare';
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
});
