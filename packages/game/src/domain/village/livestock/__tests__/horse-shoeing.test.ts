import { describe, expect, it } from 'vitest';
import {
  finishShoeing,
  isUnshod,
  nextShoeingDay,
  planShoeing,
  shoeingDay,
  shoeingView,
} from '../horse-shoeing';
import { newWorkshop } from '../../crafts/crafts';
import { trainHorsesDay } from '../horse-riders';
import { lordRides } from '../../people/lord';
import { HORSE_SHOEING } from '../../rules';
import { advanceVillage } from '../../core/simulate';
import type { VillageState } from '../../types';
import { horse, horseVillage, LORD_ID, START } from '../../__tests__/horse-fixtures';
import { dwelling } from '../../__tests__/kin-fixtures';

// Kování jezdeckých koní (horses.md – Kování; Martin 26. 10. 2026): termín 60 dní, vlastní kovář
// (práce + hřivny), kovář z jiné vsi (platba z přebytku), nepodkutý kůň nejezdí.

const DUE = START + HORSE_SHOEING.everyDays;

/** Ves se dvěma jezdeckými koňmi a termínem kování od START. */
function stable(): VillageState {
  const s = horseVillage([horse(1, 8, 'male', 50), horse(2, 6, 'male', 10)]);
  planShoeing(s, START);
  return s;
}

/** Přidá obývanou kovárnu (jinak jen kovárna ve vsi) a hřivny do její zásoby. */
function withSmith(s: VillageState, bars: number): VillageState {
  s.dwellings.push({
    ...dwelling(60),
    position: { x: 40, z: 0, rotation: 0 },
    workshop: { ...newWorkshop('smith'), activity: 'producing' },
  });
  s.people.push({ id: 70, bornDay: START - 30 * 365, dwellingId: 60, sex: 'male' });
  s.crafts = { charcoalKg: 100, potteryKg: 0, ironBarsKg: bars };
  return s;
}

describe('termín kování', () => {
  it('první termín je 60 dní od prvního dne s jezdeckými koňmi, převod je idempotentní', () => {
    const s = horseVillage([horse(1, 8, 'male', 50)]);
    expect(s.shoeing).toBeUndefined();
    planShoeing(s, START);
    expect(nextShoeingDay(s)).toBe(DUE);
    planShoeing(s, START + 5);
    expect(s.shoeing).toEqual({ lastDay: START });
  });

  it('klisny a hříbata se nekují; bez jezdeckých koní termín zanikne', () => {
    const s = horseVillage([horse(1, 8, 'female'), horse(2, 2)]);
    expect(planShoeing(s, START)).toBeNull();
    expect(s.shoeing).toBeUndefined();
    const t = stable();
    t.pens![0]!.horses = [horse(3, 8, 'female')];
    planShoeing(t, START + 10);
    expect(t.shoeing).toBeUndefined();
  });

  it('před termínem se nekuje a kůň je podkutý', () => {
    const s = stable();
    expect(planShoeing(s, DUE - 1)).toBeNull();
    expect(isUnshod(s, DUE - 1)).toBe(false);
  });
});

describe('vlastní kovář', () => {
  it('kuje z práce vsi a hřiven kovárny, termín se posune', () => {
    const s = withSmith(stable(), 5);
    const plan = planShoeing(s, DUE)!;
    expect(plan.horses).toBe(2);
    expect(plan.manDays).toBeCloseTo(2 * HORSE_SHOEING.manDays, 9);
    // bez práce se nekuje a kůň je po termínu nepodkutý
    expect(finishShoeing(s, DUE, plan, 0)).toEqual([]);
    expect(isUnshod(s, DUE)).toBe(true);
    const events = finishShoeing(s, DUE, plan, plan.manDays);
    expect(events).toEqual([{ day: DUE, kind: 'horses-shod', horses: 2, own: true }]);
    expect(s.crafts!.ironBarsKg).toBeCloseTo(5 - 2 * HORSE_SHOEING.ironBarsKg, 9);
    expect(nextShoeingDay(s)).toBe(DUE + HORSE_SHOEING.everyDays);
    expect(isUnshod(s, DUE)).toBe(false);
  });

  it('bez dost hřiven kovář nekuje – kůň je po termínu nepodkutý', () => {
    const s = withSmith(stable(), 0.1);
    s.storesKg = 200_000;
    expect(planShoeing(s, DUE)).toBeNull();
    expect(isUnshod(s, DUE)).toBe(true);
  });

  it('ves bez kovárny kuje nikdo – 10 dní po termínu je kůň nepodkutý, zásoby zůstanou', () => {
    const s = stable();
    s.storesKg = 200_000;
    s.legumesKg = 500;
    for (let d = DUE; d < DUE + 10; d++) expect(planShoeing(s, d)).toBeNull();
    expect(isUnshod(s, DUE + 10)).toBe(true);
    expect(s.storesKg).toBe(200_000);
    expect(s.legumesKg).toBe(500);
  });
});

describe('kování dne pro scénu', () => {
  it('vlastní kovář: koně ohrady, bez cesty; jiný den nic', () => {
    const s = withSmith(stable(), 5);
    const plan = planShoeing(s, DUE)!;
    s.chronicle.push(...finishShoeing(s, DUE, plan, plan.manDays));
    const day = shoeingDay(s, DUE, null)!;
    expect(day.own).toBe(true);
    expect(day.route).toBeNull();
    expect(day.horses.map((h) => h.horseId)).toEqual([1, 2]);
    expect(shoeingDay(s, DUE + 1, null)).toBeNull();
    expect(shoeingDay(s, DUE - 1, null)).toBeNull();
  });

  it('záznam cizího kováře ze starší kroniky se dál přečte', () => {
    const s = stable();
    s.chronicle.push({ day: DUE, kind: 'horses-shod', horses: 2, own: false, direction: 'N' });
    const day = shoeingDay(s, DUE, null)!;
    expect(day.own).toBe(false);
    expect(day.horses.map((h) => h.horseId)).toEqual([1, 2]);
  });
});

describe('rezerva hřiven', () => {
  it('kovárna kuje nástroje jen z hřiven nad rezervou na kování koní', () => {
    const s = withSmith(stable(), 0.7);
    s.toolEquipmentKg = 0;
    const after = advanceVillage(s, START + 30, null);
    // rezerva = 2 koně × 0,5 kg; hřivny se nespotřebují na nástroje pod ni
    expect(after.crafts!.ironBarsKg!).toBeGreaterThanOrEqual(2 * HORSE_SHOEING.ironBarsKg - 1e-9);
  });
});

describe('panel kování', () => {
  it('termín a zdroj vlastního kováře', () => {
    const s = withSmith(stable(), 5);
    expect(shoeingView(s, START + 10)).toMatchObject({
      daysLeft: 50,
      unshod: false,
      source: 'own',
    });
  });

  it('bez kováře zdroj none, po termínu nepodkutý', () => {
    const s = stable();
    expect(shoeingView(s, DUE + 3)).toMatchObject({ source: 'none', unshod: true });
  });
});

describe('panel starší vsi', () => {
  it('ves bez uloženého termínu ukáže první termín od dneška', () => {
    const s = horseVillage([horse(1, 8, 'male', 50)]);
    expect(s.shoeing).toBeUndefined();
    expect(shoeingView(s, START)).toMatchObject({
      daysLeft: HORSE_SHOEING.everyDays,
      unshod: false,
    });
    expect(s.shoeing).toBeUndefined();
  });
});

describe('nepodkutý kůň', () => {
  it('nejezdí a výcvik stojí, po podkutí pokračuje', () => {
    const s = stable();
    s.horsesCaredToday = 1;
    s.horsesFed = true;
    s.pens![0]!.horses![0]!.riderId = LORD_ID;
    const riding = new Map([[LORD_ID, 1]]);
    const training = (): number => s.pens![0]!.horses![0]!.training;
    const t0 = training();
    trainHorsesDay(s, DUE - 1, riding);
    const t1 = training();
    expect(t1).toBeGreaterThan(t0);
    // termín prošel a kovat nebylo jak
    trainHorsesDay(s, DUE, riding);
    expect(training()).toBe(t1);
    expect(lordRides(s, DUE)).toBeNull();
    // po podkutí pokračuje
    s.shoeing!.lastDay = DUE;
    trainHorsesDay(s, DUE + 1, riding);
    expect(training()).toBeGreaterThan(t1);
  });
});

describe('determinismus', () => {
  it('dopočet vcelku je stejný jako po dnech', () => {
    const make = (): VillageState => {
      const s = withSmith(stable(), 50);
      s.storesKg = 30_000;
      return s;
    };
    const target = DUE + 5;
    const whole = advanceVillage(make(), target, null);
    let stepped = make();
    for (let d = START + 13; d < target; d += 13) stepped = advanceVillage(stepped, d, null);
    stepped = advanceVillage(stepped, target, null);
    expect(stepped.shoeing).toEqual(whole.shoeing);
    expect(stepped.storesKg).toBeCloseTo(whole.storesKg, 6);
    expect(stepped.pens![0]!.horses).toEqual(whole.pens![0]!.horses);
    expect(whole.shoeing?.lastDay).toBe(DUE);
  });
});
