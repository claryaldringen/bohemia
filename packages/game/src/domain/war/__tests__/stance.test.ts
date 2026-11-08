import { describe, expect, it } from 'vitest';
import { kin, village } from '../../village/__tests__/kin-fixtures';
import type { Dwelling, Person, VillageState } from '../../village/types';
import { defenderRoster } from '../defenders';
import {
  fleeParty,
  isHarmlessArmy,
  isOverpowered,
  nearestForest,
  pitFound,
  returnDayAfter,
  stanceOf,
} from '../flight';
import { planDefense, type Sighted } from '../stance';
import { DAY, field, palisade } from './battle-fixtures';

// Postoje vsi, včasný útěk a skryté jámy (war.md – Obránci – postoje a útěk; fortifications.md –
// Postoje vsi s opevněním, Útočiště).

const house = (id: number, x: number, z = 0): Dwelling => ({
  id,
  type: 'zemnice',
  builtDay: 0,
  condition: 1,
  position: { x, z, rotation: 0 },
});

/** Muž 30 let doma v obydlí `home`. */
const man = (id: number, home: number): Person => kin({ id, age: 30, sex: 'male', home }, DAY);

const livestock = {
  herds: { sheep: 10, goat: 4, pig: 2, cow: 3 },
  young: { sheep: 2, goat: 0, pig: 0, cow: 1 },
};

/** Ves 5 mužů ve skupině domů východně od středu; 100 m od lesa na východě. */
function eastVillage(extra: Partial<VillageState> = {}): VillageState {
  const people = [1, 2, 3, 4, 5].map((id) => man(id, 1));
  return village(people, [house(1, 300)], { lastDay: DAY, storesKg: 1000, livestock, ...extra });
}

const forestEast = (tx: number): boolean => tx >= 85;
const foes = (n: number, pos = { x: -600, z: 0 }, mounted = false): Sighted[] =>
  Array.from({ length: n }, (_, i) => ({ pos: { x: pos.x, z: pos.z + i }, mounted }));

function plan(
  state: VillageState,
  stance: 'defend' | 'surrender' | 'flee',
  attackers: Sighted[],
  fort = false,
  forest = true,
  warned = false,
): ReturnType<typeof planDefense> {
  return planDefense({
    state,
    day: DAY,
    stance,
    defenders: defenderRoster(state, DAY),
    attackers,
    field: field(fort ? [palisade(true)] : [], forest ? forestEast : undefined),
    warned,
  });
}

describe('výchozí postoj a pomocné funkce', () => {
  it('bez nastavení platí útěk, jinak nastavený postoj', () => {
    expect(stanceOf(eastVillage())).toBe('flee');
    expect(stanceOf(eastVillage({ defense: { stance: 'surrender' } }))).toBe('surrender');
  });

  it('nejbližší les; bez lesa null', () => {
    const f = field([], forestEast);
    const at = nearestForest(f.grid, { x: 300, z: 0 });
    expect(at).not.toBeNull();
    expect(at!.x).toBeGreaterThan(200);
    expect(nearestForest(field().grid, { x: 0, z: 0 })).toBeNull();
  });

  it('jáma: do 1 herního dne ne, pak 30 % ze seedu', () => {
    expect(pitFound(7, 1, 0.5)).toBe(false);
    let hit = 0;
    for (let id = 0; id < 2000; id++) if (pitFound(7, id, 1)) hit++;
    expect(hit / 2000).toBeGreaterThan(0.26);
    expect(hit / 2000).toBeLessThan(0.34);
    expect(pitFound(7, 5, 3)).toBe(pitFound(7, 5, 1));
  });

  it('návrat 1 herní den po odchodu vojska', () => {
    expect(returnDayAfter(50)).toBe(51);
  });

  it('přesila 1,5× – jezdec za dva', () => {
    const riders = (n: number): { mounted: boolean }[] =>
      Array.from({ length: n }, () => ({ mounted: true }));
    expect(
      isOverpowered(
        foes(6).map((a) => ({ mounted: a.mounted })),
        4,
      ),
    ).toBe(false);
    expect(
      isOverpowered(
        foes(7).map((a) => ({ mounted: a.mounted })),
        4,
      ),
    ).toBe(true);
    expect(isOverpowered(riders(3), 4)).toBe(false);
    expect(isOverpowered(riders(4), 4)).toBe(true);
  });

  it('vlastní vojsko, pán a vazalové jsou neškodní, cizí rod ne', () => {
    const edges = [
      { lordHouseId: 'L', vassalHouseId: 'V' },
      { lordHouseId: 'V', vassalHouseId: 'W' },
    ];
    expect(isHarmlessArmy('V', 'V', edges)).toBe(true);
    expect(isHarmlessArmy('L', 'V', edges)).toBe(true);
    expect(isHarmlessArmy('V', 'L', edges)).toBe(true);
    expect(isHarmlessArmy('V', 'W', edges)).toBe(true);
    expect(isHarmlessArmy('X', 'V', edges)).toBe(false);
  });
});

describe('včasný útěk – co odnesou', () => {
  it('dospělý 25 kg, dítě 7–15 let 10 kg, mladší nic; dobytek celý', () => {
    const people = [
      man(1, 1),
      kin({ id: 2, age: 10, sex: 'female', home: 1 }, DAY),
      kin({ id: 3, age: 3, sex: 'male', home: 1 }, DAY),
    ];
    const p = fleeParty(village(people, [house(1, 0)], { storesKg: 1000, livestock }), DAY);
    expect(p).toMatchObject({ adults: 1, children: 1, infants: 1, carriedKg: 35 });
    expect(p.livestock).toEqual({ sheep: 12, goat: 4, pig: 2, cow: 4 });
  });

  it('nemá-li ves tolik zásob, odnesou jen, co mají', () => {
    const p = fleeParty(village([man(1, 1)], [house(1, 0)], { storesKg: 10 }), DAY);
    expect(p.carriedKg).toBe(10);
  });
});

describe('postoje bez opevnění', () => {
  it('raději utéct: skupina do lesa se zásobami a dobytkem, nikdo nebojuje', () => {
    const r = plan(eastVillage(), 'flee', foes(2));
    expect(r.fighters).toEqual([]);
    expect(r.shelter.forest).toEqual([1, 2, 3, 4, 5]);
    expect(r.shelter.carriedKg).toBe(125);
    expect(r.shelter.livestockForest).toEqual({ sheep: 12, goat: 4, pig: 2, cow: 4 });
  });

  it('bránit se: všichni bojují u domů, nikdo neodchází', () => {
    const r = plan(eastVillage(), 'defend', foes(30));
    expect(r.fighters.map((f) => f.personId)).toEqual([1, 2, 3, 4, 5]);
    expect(r.shelter.forest).toEqual([]);
    expect(r.shelter.surrendered).toEqual([]);
  });

  it('vzdát se při přesile: 7 proti 5 se brání, 8 se vzdá (5 × 1,5 = 7,5)', () => {
    expect(plan(eastVillage(), 'surrender', foes(7)).fighters).toHaveLength(5);
    const r = plan(eastVillage(), 'surrender', foes(8));
    expect(r.fighters).toEqual([]);
    expect(r.shelter.surrendered).toEqual([1, 2, 3, 4, 5]);
  });

  it('jezdec za dva: 4 jezdci + 4 pěší přesila, 3 + 4 ne', () => {
    const mix = (riders: number, foot: number): Sighted[] => [
      ...foes(riders, { x: -600, z: 0 }, true),
      ...foes(foot, { x: -600, z: 50 }),
    ];
    expect(plan(eastVillage(), 'surrender', mix(3, 1)).fighters).toHaveLength(5);
    expect(plan(eastVillage(), 'surrender', mix(4, 1)).fighters).toHaveLength(0);
  });

  it('bez lesa se útěk chová jako vzdání při přesile', () => {
    const little = plan(eastVillage(), 'flee', foes(5), false, false);
    expect(little.fighters).toHaveLength(5);
    const many = plan(eastVillage(), 'flee', foes(9), false, false);
    expect(many.shelter.surrendered).toHaveLength(5);
    expect(many.shelter.forest).toEqual([]);
  });

  it('poslední muž rodu se nevzdá – uteče do lesa', () => {
    const people = [
      { ...man(1, 1), line: true as const, arms: { combat: 50, bow: 50, riding: 0 } },
      man(2, 1),
    ];
    const s = village(people, [house(1, 300)], { lastDay: DAY });
    const r = plan(s, 'surrender', foes(20));
    expect(r.shelter.forest).toEqual([1]);
    expect(r.shelter.surrendered).toEqual([2]);
  });
});

describe('postoje s opevněním (fortifications.md – Postoje vsi s opevněním)', () => {
  /** Ves u palisády: 5 mužů a žena v domě 40 m od středu. */
  const near = (): VillageState =>
    village(
      [
        ...[1, 2, 3, 4, 5].map((id) => man(id, 1)),
        kin({ id: 6, age: 25, sex: 'female', home: 1 }, DAY),
      ],
      [house(1, 70)],
      { lastDay: DAY, storesKg: 500, livestock },
    );

  it.each(['defend', 'surrender', 'flee'] as const)(
    'postoj %s: kdo stihne doběhnout, je v útočišti a muži se brání u středu',
    (stance) => {
      const r = plan(near(), stance, foes(3, { x: 0, z: -800 }), true);
      expect(r.shelter.refuge).toHaveLength(6);
      expect(r.shelter.forest).toEqual([]);
      expect(r.fighters.map((f) => f.personId)).toEqual([1, 2, 3, 4, 5]);
      for (const f of r.fighters) expect(Math.abs(f.pos.x) + Math.abs(f.pos.z)).toBeLessThan(40);
      expect(r.shelter.livestockRefuge.sheep).toBe(12);
    },
  );

  // násobek zrušen 8. 11. 2026 (dřív „vzdá se až nad 1,5 × 5 × 2 = 15“): za opevněním se skupina
  // nevzdá, dokud útočník nestojí uvnitř obvodu; pak přesila 1,5× jako u domů
  it('vzdát se za opevněním: 5 za palisádou se před 20 útočníky venku nevzdá, s útočníkem uvnitř ano', () => {
    const outside = foes(20, { x: 0, z: -800 });
    expect(plan(near(), 'surrender', outside, true).fighters).toHaveLength(5);
    expect(plan(near(), 'surrender', foes(200, { x: 0, z: -800 }), true).fighters).toHaveLength(5);
    // jeden z dvaceti už stojí uvnitř obvodu – posel ohlásil vojsko předem, všichni jsou v útočišti
    const inside = [...foes(19, { x: 0, z: -800 }), { pos: { x: 0, z: 10 }, mounted: false }];
    const r = plan(near(), 'surrender', inside, true, true, true);
    expect(r.shelter.refuge).toHaveLength(6);
    expect(r.shelter.surrendered).toEqual([1, 2, 3, 4, 5]);
    // 7 útočníků uvnitř není přesila nad 1,5 × 5
    const few = [...foes(6, { x: 0, z: -800 }), { pos: { x: 0, z: 10 }, mounted: false }];
    expect(plan(near(), 'surrender', few, true, true, true).fighters).toHaveLength(5);
  });

  it('kdo nestihne doběhnout před zavřením brány, jedná u domů podle postoje', () => {
    // útočníci už u brány, ves 300 m od středu
    const far = eastVillage();
    const attackers = foes(2, { x: 0, z: -60 });
    const defend = plan(far, 'defend', attackers, true);
    expect(defend.shelter.refuge).toEqual([]);
    expect(defend.fighters).toHaveLength(5);
    const flee = plan(far, 'flee', attackers, true);
    expect(flee.shelter.refuge).toEqual([]);
    expect(flee.shelter.forest).toEqual([1, 2, 3, 4, 5]);
  });

  it('posel ohlásil vojsko předem – do útočiště doběhnou všichni, i když jsou útočníci u brány', () => {
    // Ú6.7: posel z jiné vsi rodu spustí postoj dřív (war.md – Obránci, Kdy)
    const far = eastVillage();
    const attackers = foes(2, { x: 0, z: -60 });
    for (const stance of ['defend', 'flee'] as const) {
      const warned = plan(far, stance, attackers, true, true, true);
      expect(warned.shelter.refuge).toEqual([1, 2, 3, 4, 5]);
      expect(warned.shelter.forest).toEqual([]);
    }
  });

  it('kdo se nevejde, zůstane venku', () => {
    const crowd = Array.from({ length: 340 }, (_, i) =>
      kin({ id: i + 1, age: 30, sex: i % 2 ? 'female' : 'male', home: 1 }, DAY),
    );
    const s = village(crowd, [house(1, 70)], { lastDay: DAY });
    const r = plan(s, 'defend', foes(3, { x: 0, z: -800 }), true);
    expect(r.shelter.refuge.length).toBeGreaterThan(300);
    expect(r.shelter.refuge.length).toBeLessThan(340);
    const outside = 340 - r.shelter.refuge.length;
    // venku zůstali muži brání u domu – bojují všichni muži (170): uvnitř i venku
    expect(r.fighters.length).toBeGreaterThan(0);
    expect(outside).toBeGreaterThan(0);
  });
});
