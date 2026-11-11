import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { packObstacles } from '../../../landscape';
import { foundPen, foundVillage } from '../../core/actions';
import { stockedPenIds } from '../../buildings/abandonment';
import { herdPlaces } from '../husbandry';
import { LIVESTOCK, winterTargets } from '../livestock';
import { PEN, oxenTraining, penBuildLabor, type OxenGoal, type PenInput } from '../oxen';
import {
  herdRoom,
  herdsOverRoom,
  homesteadRoom,
  penCapacity,
  penOccupancy,
  penSpecies,
  pensLimitHerds,
  touchingPens,
  withPenGrace,
  withPenSpecies,
} from '../pens';
import { penEntrance, penGateToward, penSquaresEntrance } from '../../paths/entrances';
import { penSquaresFromCells } from '../../placement/placement';
import { HOMESTEAD_HERD, PEN_FENCE, PEN_GRACE, PEN_PLACES_PER_SQUARE } from '../../rules';
import { advanceVillage } from '../../core/simulate';
import type { Pen, PenSpecies, VillageState } from '../../types';
import { block, makeLandscape } from '../../__tests__/placement-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Ohrady podle druhu (oxen.md – Ohrady podle druhu; Martin 19. 10. 2026: „Každý druh zvířete by
// měl mít vlastní ohradu, ať se nemíchají. Velikost ohrady by mělo jít určovat podobně, jako když
// se staví hřbitov. Velikost ohrady bude mít vliv na velikost stáda. Zároveň velikost ohrady bude
// omezená – má to být ohrada, ne výběh.“). Ruční krajina 16 × 16 políček po 15 m (louka).

const DAY = dayIndexOf({ year: 600, month: 3, day: 15 });
const EMPTY = packObstacles([], 16, 15);
const FAR = { x: -90, z: -90, rotation: 0 };
const landscape = makeLandscape();

function village(): VillageState {
  const s = withBuiltFirstDwelling(foundVillage({ seed: 5, day: DAY, dwellingPosition: FAR }));
  s.woodLogs = 100;
  s.storesKg = 50_000;
  return s;
}

/** Hotová ohrada druhu se čtverci (políčka krajiny po řádku od `x`, `y`). */
function pen(id: number, species: PenSpecies, x: number, y: number, squares = 1): Pen {
  const square = (i: number): { cell: { x: number; y: number }; x: number; z: number } => ({
    cell: { x: x + i, y },
    x: (x + i) * 15 - 112.5,
    z: y * 15 - 112.5,
  });
  return {
    id,
    species,
    ...square(0),
    ...(squares > 1
      ? { extraSquares: Array.from({ length: squares - 1 }, (_, i) => square(i + 1)) }
      : {}),
    builtDay: DAY - 100,
    team: null,
    training: null,
  };
}

/** Vstup `foundPen` z kontroly umístění (ruční krajina). */
function input(s: VillageState, cells: { x: number; y: number }[], species: PenSpecies): PenInput {
  const check = penSquaresFromCells(landscape, s, cells, species, EMPTY);
  expect(check.check.ok).toBe(true);
  return { species, squares: check.squares, takenLand: check.takenLand };
}

describe('kapacita ohrad', () => {
  it('místa podle hotových čtverců a druhu; spřežení stádo nedrží, stavba se nepočítá', () => {
    const s = village();
    const building = pen(5, 'goat', 1, 6);
    building.builtDay = null;
    const extended = pen(6, 'pig', 1, 8, 2);
    extended.extraSquares![0]!.constructionId = 77;
    s.pens = [
      pen(3, 'sheep', 1, 4, 2),
      building,
      extended,
      pen(7, 'cattle', 1, 10, 4),
      pen(8, 'team', 1, 12),
    ];
    expect(penCapacity(s)).toEqual({
      sheep: 2 * PEN_PLACES_PER_SQUARE.sheep,
      goat: 0,
      pig: PEN_PLACES_PER_SQUARE.pig,
      cow: 4 * PEN_PLACES_PER_SQUARE.cow,
    });
  });

  it('bez ohrady pár kusů u domu – 2 ovce, 1 koza, 1 prase na domácnost, krávy jen v ohradě', () => {
    const s = village();
    const households = new Set(s.people.map((p) => p.dwellingId)).size;
    expect(homesteadRoom(s)).toEqual({
      sheep: households * HOMESTEAD_HERD.sheep,
      goat: households * HOMESTEAD_HERD.goat,
      pig: households * HOMESTEAD_HERD.pig,
      cow: 0,
    });
    s.pens = [pen(3, 'sheep', 1, 4)];
    expect(herdRoom(s).sheep).toBe(PEN_PLACES_PER_SQUARE.sheep + households * 2);
  });

  it('stádo v noci napřed do ohrad svého druhu podle id, zbytek u domů; spřežení voli', () => {
    const s = village();
    s.pens = [pen(4, 'sheep', 1, 6), pen(3, 'sheep', 1, 4), pen(8, 'team', 1, 12)];
    s.pens[2]!.team = { readyDay: DAY - 10 };
    s.livestock!.herds = { sheep: 150, goat: 3, pig: 2, cow: 2 };
    const occupancy = penOccupancy(s);
    expect(occupancy.get(3)).toBe(PEN_PLACES_PER_SQUARE.sheep);
    expect(occupancy.get(4)).toBe(150 - PEN_PLACES_PER_SQUARE.sheep);
    expect(occupancy.get(8)).toBe(2);
    expect([...stockedPenIds(s)].sort()).toEqual([3, 4, 8]);
    // ohrada koz bez koz – zvířata svého druhu nemá
    s.pens.push(pen(9, 'goat', 1, 14));
    s.livestock!.herds.goat = 0;
    expect(stockedPenIds(s).has(9)).toBe(false);
  });
});

describe('ohrada po čtvercích jako hřbitov', () => {
  it('nová ohrada ze dvou čtverců: druh, přístřešek v prvním, cena a dřevo za čtverce', () => {
    const s = village();
    const next = foundPen(s, s.lastDay, input(s, block(4, 4, 2, 1), 'sheep'), EMPTY);
    expect(next.pens).toHaveLength(1);
    const p = next.pens![0]!;
    expect(p.species).toBe('sheep');
    expect(p.cell).toEqual({ x: 4, y: 4 });
    expect(p.extraSquares?.map((q) => q.cell)).toEqual([{ x: 5, y: 4 }]);
    expect(p.extraSquares![0]!.constructionId).toBeUndefined();
    // sdílená strana bez plotu: 2 × (6 − 4) stromů zbytku + 6 vnějších stran po stromu
    expect(next.woodLogs).toBe(100 - 2 * (PEN.trees - PEN_FENCE.trees) - 6);
    const c = next.constructions.find((x) => x.kind === 'pen')!;
    expect(c.penId).toBe(p.id);
    const built = advanceVillage(next, s.lastDay + 120, EMPTY);
    expect(built.pens![0]!.builtDay).not.toBeNull();
    expect(penCapacity(built).sheep).toBe(2 * PEN_PLACES_PER_SQUARE.sheep);
  });

  it('navazující čtverec téhož druhu ohradu rozšíří – po dostavění se počítá', () => {
    let s = village();
    s = foundPen(s, s.lastDay, input(s, block(4, 4, 1, 1), 'pig'), EMPTY);
    s = advanceVillage(s, s.lastDay + 120, EMPTY);
    const id = s.pens![0]!.id;
    expect(penCapacity(s).pig).toBe(PEN_PLACES_PER_SQUARE.pig);
    const check = penSquaresFromCells(landscape, s, block(4, 5, 1, 1), 'pig', EMPTY);
    expect(check.extendsPen).toBe(id);
    expect(check.totalSquares).toBe(2);
    const logsBefore = s.woodLogs;
    s = foundPen(s, s.lastDay, { species: 'pig', squares: check.squares }, EMPTY);
    // rozšíření platí plot jen na 3 nových stranách (oxen.md – Plot podle délky): 2 + 3 stromy
    expect(logsBefore! - s.woodLogs!).toBe(PEN.trees - PEN_FENCE.trees + 3);
    const construction = s.constructions.find((c) => c.kind === 'pen' && c.done === 0)!;
    expect(construction.cost).toBeCloseTo(penBuildLabor() * 0.875, 6);
    expect(s.pens).toHaveLength(1);
    const extension = s.pens![0]!.extraSquares![0]!;
    expect(extension.cell).toEqual({ x: 4, y: 5 });
    expect(extension.constructionId).toBeDefined();
    // do dostavění rozšíření jen první čtverec
    expect(penCapacity(s).pig).toBe(PEN_PLACES_PER_SQUARE.pig);
    s = advanceVillage(s, s.lastDay + 120, EMPTY);
    expect(s.pens![0]!.extraSquares![0]!.constructionId).toBeUndefined();
    expect(penCapacity(s).pig).toBe(2 * PEN_PLACES_PER_SQUARE.pig);
  });

  it('nejvýš 4 čtverce (ohrada, ne výběh), souvislé stranou, na dvě ohrady navázat nejde', () => {
    let s = village();
    expect(
      penSquaresFromCells(landscape, s, block(4, 4, 5, 1), 'goat', EMPTY).check.reason,
    ).toMatch(/nejvýš 4 čtverce/);
    expect(
      penSquaresFromCells(
        landscape,
        s,
        [
          { x: 4, y: 4 },
          { x: 6, y: 4 },
        ],
        'goat',
        EMPTY,
      ).check.reason,
    ).toMatch(/navazovat stranou/);
    s = foundPen(s, s.lastDay, input(s, block(4, 4, 3, 1), 'goat'), EMPTY);
    // ohrada má 3 čtverce – dva další by byly 5
    expect(
      penSquaresFromCells(landscape, s, block(4, 5, 2, 1), 'goat', EMPTY).check.reason,
    ).toMatch(/nejvýš 4 čtverce/);
    expect(penSquaresFromCells(landscape, s, block(4, 5, 1, 1), 'goat', EMPTY).check.ok).toBe(true);
    s = foundPen(s, s.lastDay, input(s, block(8, 4, 1, 1), 'goat'), EMPTY);
    // čtverec mezi dvěma ohradami koz
    const between = penSquaresFromCells(landscape, s, [{ x: 7, y: 4 }], 'goat', EMPTY);
    expect(between.check.reason).toMatch(/jen na jednu ohradu/);
    expect(() =>
      foundPen(
        s,
        s.lastDay,
        {
          species: 'goat',
          squares: [
            { cell: { x: 7, y: 4 }, x: 0, z: 0, obstacleCost: 0, obstacleIds: [], clearedTrees: 0 },
          ],
        },
        EMPTY,
      ),
    ).toThrow(/jednu ohradu/);
  });

  it('druhy se nemíchají – čtverec vedle ohrady jiného druhu je nová ohrada', () => {
    let s = village();
    s = foundPen(s, s.lastDay, input(s, block(4, 4, 1, 1), 'sheep'), EMPTY);
    const check = penSquaresFromCells(landscape, s, block(5, 4, 1, 1), 'goat', EMPTY);
    expect(check.check.ok).toBe(true);
    expect(check.extendsPen).toBeNull();
    s = foundPen(s, s.lastDay, { species: 'goat', squares: check.squares }, EMPTY);
    expect(s.pens!.map((p) => p.species)).toEqual(['sheep', 'goat']);
    expect(touchingPens(s.pens!, [{ x: 6, y: 4 }], 'sheep')).toEqual([]);
    expect(touchingPens(s.pens!, [{ x: 6, y: 4 }], 'goat').map((p) => p.id)).toEqual([
      s.pens![1]!.id,
    ]);
    // na čtverec ohrady jiného druhu ne
    expect(penSquaresFromCells(landscape, s, block(4, 4, 1, 1), 'goat', EMPTY).check.ok).toBe(
      false,
    );
  });
});

describe('stádo a místa na noc', () => {
  it('přes zimu jen tolik kusů, kolik se s jarními mláďaty vejde do ohrad a u domů', () => {
    const s = village();
    s.livestock!.land = { meadowHa: 1000, forestHa: 1000 };
    s.livestock!.herds = { sheep: 200, goat: 40, pig: 30, cow: 20 };
    const free = winterTargets(s, DAY, { oxen: 0, hayKg: Infinity });
    expect(free.sheep).toBeGreaterThan(150);
    const home = winterTargets(s, DAY, { oxen: 0, hayKg: Infinity, room: herdRoom(s) });
    const households = new Set(s.people.map((p) => p.dwellingId)).size;
    // bez ohrad pár kusů u domu – chovný pár zůstane vždy, krávy jen chovný pár
    expect(home.sheep).toBeCloseTo(
      Math.max(LIVESTOCK.breedingMin, (2 * households) / (1 + LIVESTOCK.growth.sheep)),
      9,
    );
    expect(home.pig).toBe(LIVESTOCK.breedingMin);
    expect(home.cow).toBe(LIVESTOCK.breedingMin);
    s.pens = [pen(3, 'sheep', 1, 4), pen(4, 'cattle', 1, 6)];
    const penned = winterTargets(s, DAY, { oxen: 0, hayKg: Infinity, room: herdRoom(s) });
    expect(penned.sheep).toBeCloseTo(
      (PEN_PLACES_PER_SQUARE.sheep + 2 * households) / (1 + LIVESTOCK.growth.sheep),
      9,
    );
    expect(penned.cow).toBeCloseTo(
      Math.min(free.cow, PEN_PLACES_PER_SQUARE.cow / (1 + LIVESTOCK.growth.cow)),
      9,
    );
  });

  it('ves bez ohrad: nadbytek jde na maso při porážce, chovný pár zůstane', () => {
    const s = village();
    s.lastDay = dayIndexOf({ year: 600, month: 10, day: 30 });
    // odklad uplynul (ves uložená dřív bez dne odkladu – platí hned)
    delete s.livestock!.pensFromDay;
    s.livestock!.land = { meadowHa: 1000, forestHa: 1000 };
    s.livestock!.herds = { sheep: 30, goat: 10, pig: 10, cow: 6 };
    s.hay = { kg: 50_000, mowing: null };
    const after = advanceVillage(s, dayIndexOf({ year: 600, month: 11, day: 1 }), null);
    const room = herdRoom(after);
    const herds = after.livestock!.herds;
    for (const species of ['sheep', 'goat', 'pig', 'cow'] as const) {
      expect(herds[species]).toBeLessThanOrEqual(
        Math.max(LIVESTOCK.breedingMin, room[species]) + 1e-6,
      );
    }
    expect(herds.cow).toBeCloseTo(LIVESTOCK.breedingMin, 6);
    expect(after.chronicle.some((e) => e.kind === 'slaughter')).toBe(true);
  });

  it('roční odklad: nová ves rok po založení stádo nekrátí, porážka po roce ano', () => {
    const s = village();
    // nová ves dostane odklad (oxen.md – Ohrady podle druhu, roční odklad)
    expect(s.livestock!.pensFromDay).toBe(DAY + PEN_GRACE.graceDays);
    expect(pensLimitHerds(s, DAY + 364)).toBe(false);
    expect(pensLimitHerds(s, DAY + 365)).toBe(true);
    s.livestock!.land = { meadowHa: 1000, forestHa: 1000 };
    s.livestock!.herds = { sheep: 30, goat: 10, pig: 10, cow: 6 };
    // upozornění platí i během odkladu – hráč ví, že má stavět
    expect(herdsOverRoom(s)).toEqual(['sheep', 'goat', 'pig', 'cow']);
    // den před porážkou: plné stádo, dost sena a pasáci uhlídali vše
    const eve = advanceVillage(s, dayIndexOf({ year: 600, month: 10, day: 31 }), null);
    const ready = (v: VillageState): VillageState => {
      v.livestock!.herds = { sheep: 30, goat: 10, pig: 10, cow: 6 };
      v.livestock!.young = { sheep: 0, goat: 0, pig: 0, cow: 0 };
      v.livestock!.herding = { needDays: 100, watchedDays: 100 };
      v.hay = { kg: 100_000, mowing: null };
      return v;
    };
    const day = dayIndexOf({ year: 600, month: 11, day: 1 });
    // 1. 11. 600 (necelý rok po založení) – místa stádo neomezí
    const grace = advanceVillage(ready(structuredClone(eve)), day, null);
    // táž ves bez odkladu – místa u domů a chovný pár
    const strict = structuredClone(eve);
    delete strict.livestock!.pensFromDay;
    const cut = advanceVillage(ready(strict), day, null);
    const room = herdRoom(cut);
    for (const species of ['sheep', 'goat', 'pig', 'cow'] as const) {
      expect(cut.livestock!.herds[species]).toBeLessThanOrEqual(
        Math.max(LIVESTOCK.breedingMin, room[species]) + 1e-6,
      );
    }
    expect(grace.livestock!.herds.sheep).toBeGreaterThan(cut.livestock!.herds.sheep + 1);
    // po roce odklad skončí – 1. 11. 601 už místa platí
    expect(pensLimitHerds(grace, dayIndexOf({ year: 601, month: 11, day: 1 }))).toBe(true);
  });

  it('krávy se bez ohrady skotu nevejdou – upozornění i pro skot', () => {
    const s = village();
    s.livestock!.herds = { sheep: 0, goat: 0, pig: 0, cow: 4 };
    // ohrada spřežení krávy nepojme
    s.pens = [pen(3, 'team', 1, 4)];
    expect(herdsOverRoom(s)).toEqual(['cow']);
    s.pens.push(pen(4, 'cattle', 1, 6));
    expect(herdsOverRoom(s)).toEqual([]);
    // chovný pár se vejde vždy
    s.pens = [];
    s.livestock!.herds.cow = 2;
    expect(herdsOverRoom(s)).toEqual([]);
  });
});

describe('převod starých vsí a spřežení', () => {
  it('stará ohrada se spřežením nebo výcvikem = spřežení, jinak skot; jednou', () => {
    const s = village();
    const old = (p: Pen): Pen => {
      const { species: _species, ...rest } = p;
      void _species;
      return rest;
    };
    s.pens = [
      { ...old(pen(3, 'team', 1, 4)), team: { readyDay: DAY - 10 } },
      { ...old(pen(4, 'team', 1, 6)), training: { startDay: DAY - 10 } },
      old(pen(5, 'cattle', 1, 8)),
    ];
    expect(s.pens.map((p) => penSpecies(p))).toEqual(['team', 'team', 'cattle']);
    const migrated = withPenSpecies(s);
    expect(migrated.pens!.map((p) => p.species)).toEqual(['team', 'team', 'cattle']);
    // ohrada skotu zůstane skotem, i když by v ní později někdo cvičil
    expect(withPenSpecies(migrated)).toBe(migrated);
    // dopočet převede taky
    const advanced = advanceVillage(s, DAY + 1, null);
    expect(advanced.pens!.map((p) => p.species)).toEqual(['team', 'team', 'cattle']);
  });

  it('ves uložená dřív dostane při načtení roční odklad od dne převodu; jednou', () => {
    const s = village();
    delete s.livestock!.pensFromDay;
    const today = DAY + 40;
    const migrated = withPenGrace(s, today);
    expect(migrated.livestock!.pensFromDay).toBe(today + PEN_GRACE.graceDays);
    expect(withPenGrace(migrated, today + 500)).toBe(migrated);
    // bez dne převodu od posledního dopočteného dne
    expect(withPenGrace(s).livestock!.pensFromDay).toBe(s.lastDay + PEN_GRACE.graceDays);
  });

  it('výcvik volů jen v ohradě volů – s kravami se nemíchá', () => {
    const s = village();
    s.livestock!.herds.cow = 6;
    s.pens = [pen(3, 'cattle', 1, 4)];
    expect(oxenTraining(s, DAY, goal(2, 1), null)).toBe('Ves nemá ohradu volů.');
    s.pens.push(pen(4, 'team', 1, 6));
    expect(oxenTraining(s, DAY, goal(2, 1), null)).toEqual({ calves: 2, ards: 1 });
  });
});

const goal = (oxen: number, ploughPairs: number): OxenGoal => ({
  oxen,
  ploughPairs,
  breedingCows: 1,
});

describe('branka ohrady o víc čtvercích (paths.md – Vchody)', () => {
  it('jeden čtverec jako dřív; dva čtverce – branka na plotu po obrysu nejblíž k obydlí', () => {
    const square = { cell: { x: 0, y: 0 }, x: 7.5, z: 7.5, size: 15 };
    const dwelling = { x: 40, z: -30 };
    expect(penSquaresEntrance([square], dwelling)).toEqual(
      penEntrance(square, { x: dwelling.x - square.x, z: dwelling.z - square.z }),
    );
    const two = [square, { cell: { x: 1, y: 0 }, x: 22.5, z: 7.5, size: 15 }];
    const gate = penSquaresEntrance(two, dwelling);
    // plot 1,5 m uvnitř čtverců, spodní strana (−z) ke vsi
    expect(gate.z).toBeCloseTo(1.5, 6);
    expect(gate.outZ).toBe(-1);
    expect(gate.x).toBeGreaterThan(15);
    expect(gate.x).toBeLessThan(28.5);
    // cíl branky od středu čtverců k nejbližšímu obydlí
    expect(penGateToward(two, [{ position: dwelling }])).toEqual(dwelling);
  });
});

describe('místa stáda pro panel ohrady (Martin 20. 10. 2026)', () => {
  it('ohrady druhu, kusy u domů a potřeba – nejméně dnešní stádo bez kusů u domů', () => {
    const s = village();
    s.livestock!.herds = { sheep: 150, goat: 3, pig: 2, cow: 2 };
    s.pens = [pen(1, 'sheep', 1, 6)];
    const before = JSON.stringify(s);
    const places = herdPlaces(s, DAY);
    const home = homesteadRoom(s);
    expect(places.sheep.pens).toBe(PEN_PLACES_PER_SQUARE.sheep);
    expect(places.sheep.home).toBe(home.sheep);
    // dnešní stádo bez kusů u domů a bez chovného páru s jarními mláďaty
    const free = Math.max(home.sheep, LIVESTOCK.breedingMin * (1 + LIVESTOCK.growth.sheep));
    expect(places.sheep.needed).toBeGreaterThanOrEqual(Math.floor(150 - free));
    // chovný pár koz s mláďaty zůstane vždy – ohrada koz netřeba
    expect(places.goat).toEqual({ pens: 0, home: home.goat, needed: 0 });
    // stav se nemění
    expect(JSON.stringify(s)).toBe(before);
  });

  it('potřeba počítá s jarními mláďaty stáda, které by si ves nechala bez omezení ohradami', () => {
    const s = village();
    s.livestock!.land = { meadowHa: 1000, forestHa: 1000 };
    s.livestock!.herds = { sheep: 40, goat: 0, pig: 0, cow: 0 };
    s.pens = [];
    const places = herdPlaces(s, DAY);
    // bez ohrady ovcí by stádo omezila místa u domů – potřeba je i tak podle stáda bez omezení
    expect(places.sheep.pens).toBe(0);
    expect(places.sheep.needed).toBeGreaterThan(40 - places.sheep.home);
  });

  it('ves bez dobytka nic nepotřebuje', () => {
    const s = village();
    delete s.livestock;
    const places = herdPlaces(s, DAY);
    expect(places.sheep.needed).toBe(0);
    expect(s.livestock).toBeUndefined();
  });
});
