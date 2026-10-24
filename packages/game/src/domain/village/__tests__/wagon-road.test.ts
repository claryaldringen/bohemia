import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import {
  packObstacles,
  transferPrecision,
  type Landscape,
  type ObstaclePlacement,
} from '../../landscape';
import { foundVillage } from '../actions';
import { cancelConstruction } from '../cancel-construction';
import { NO_OBSTACLE_CHANGES } from '../obstacles';
import { cartRoadSpeed, cartRoutes, type CartRoute } from '../paths/cart';
import {
  NO_TERRAIN_EDITS,
  editedHeight,
  groundHeightAt,
  naturalHeightAt,
  terrainEditsFrom,
  terrainEditsOf,
  withTerrainEdits,
} from '../paths/earthworks';
import type { PathVillage } from '../paths/network';
import { joinedRoadsOf, roadLengthM, roadsMonth, updateRoads } from '../paths/roads';
import { pathTerrainOf, pathWindowFor } from '../paths/terrain';
import { pathVillageOf } from '../paths/village';
import { roadPieceCost } from '../paths/walking';
import { roadWalkSpeed } from '../paths/walk-speed';
import { balanceEarth, profileEdits } from '../paths/wagon-route';
import { CART_SPEED, ROAD_WALK, WAGON_ROAD } from '../rules';
import { advanceVillage } from '../simulate';
import type { Road, RoadProfilePoint, VillageState } from '../types';
import {
  WAGON_BLOCKED,
  WAGON_BUILDING,
  WAGON_EXISTS,
  WAGON_LOOP,
  WAGON_NO_WOOD,
  WAGON_SACRED,
  WAGON_STEEP,
  fordArcsOf,
  planWagonRoad,
  startWagonRoad,
  wagonPlanInputOf,
  wagonChainStatus,
  type WagonPlanInput,
  type WagonRoadPlan,
} from '../wagon-road';
import { LANDSCAPE } from './paths-fixtures';
import { makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Vozová cesta (roads.md – Vozová cesta po staré cestě; Martin 22. 10. 2026, #6: „Vozová cesta:
// vznikne ze staré pěší cesty a vede po ní.“; 20. 10. 2026: „Pokud budou překážet svahy, vyhloubí
// se úvoz nebo udělá násep.“). Krajiny testu: louka 30 × 30 políček (450 m), svah po řádcích
// políček – `hill(sklon, od, do)`.

const DAY = dayIndexOf({ year: 600, month: 5, day: 1 });

function hill(slope: number, from: number, to: number): Landscape {
  return makeLandscape({
    size: 30,
    height: (_x, y) => Math.min(to, Math.max(from, y)) * 15 * slope,
  });
}

const FLAT = hill(0, 0, 0);
const GENTLE = hill(0.04, 0, 30);
const BUMP = hill(0.1, 12, 16);
const MID = hill(0.08, 12, 18);
const STEEP = hill(0.15, 8, 22);
const STEEPER = hill(0.25, 10, 18);

/** Stará cesta – vyšlapaná, konce na jihu a severu (z = ±180). */
function oldRoad(
  points: { x: number; z: number }[] = [
    { x: 0, z: -180 },
    { x: 0, z: 180 },
  ],
): Road {
  return { id: 1, points, bornDay: 0, grade: 'trodden', traffic: [], spots: [] };
}

function input(l: Landscape, road: Road = oldRoad()): WagonPlanInput {
  return {
    landscape: l,
    layer: null,
    changes: NO_OBSTACLE_CHANGES,
    village: { dwellings: [], fields: [] },
    roads: [road],
    earthworks: [],
    roadId: road.id,
    home: { x: 0, z: -220 },
  };
}

function plan(l: Landscape, road?: Road): Extract<WagonRoadPlan, { ok: true }> {
  const p = planWagonRoad(input(l, road));
  if (!p.ok) throw new Error(p.reason);
  return p;
}

/** Vzdálenost bodu od lomené čáry (m). */
function distanceToLine(line: readonly { x: number; z: number }[], p: { x: number; z: number }) {
  let best = Infinity;
  for (let k = 1; k < line.length; k++) {
    const a = line[k - 1]!;
    const b = line[k]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(p.x - a.x - dx * u, p.z - a.z - dz * u));
  }
  return best;
}

/** Terén jádra v bodech profilu (bilineárně z políček). */
function naturalOf(l: Landscape, profile: readonly RoadProfilePoint[]): number[] {
  return profile.map((p) => naturalHeightAt(l, p.x, p.z));
}

describe('trasa a profil vozové cesty', () => {
  const cases = [
    ['rovina', FLAT],
    ['mírný svah 4 %', GENTLE],
    ['krátký svah 10 %', BUMP],
    ['svah 8 %', MID],
  ] as const;

  for (const [name, l] of cases) {
    it(`${name}: sklon po úpravě nejvýš 6 %, úvoz a násep nejvýš 3 m, konce v terénu`, () => {
      const p = plan(l);
      const natural = naturalOf(l, p.profile);
      for (let k = 1; k < p.profile.length; k++) {
        const a = p.profile[k - 1]!;
        const b = p.profile[k]!;
        const d = Math.hypot(b.x - a.x, b.z - a.z);
        expect(Math.abs(b.y - a.y)).toBeLessThanOrEqual(WAGON_ROAD.maxGrade * d + 1e-9);
      }
      p.profile.forEach((q, k) => {
        expect(q.y - natural[k]!).toBeLessThanOrEqual(WAGON_ROAD.maxFillM + 0.011);
        expect(natural[k]! - q.y).toBeLessThanOrEqual(WAGON_ROAD.maxCutM + 0.011);
      });
      expect(p.maxGrade).toBeLessThanOrEqual(WAGON_ROAD.maxGrade + 1e-9);
      expect(p.maxCutM).toBeLessThanOrEqual(WAGON_ROAD.maxCutM);
      expect(p.maxFillM).toBeLessThanOrEqual(WAGON_ROAD.maxFillM);
      // konce v uzlech staré cesty, pláň tam v terénu
      expect(p.profile[0]).toMatchObject({ x: 0, z: -180 });
      expect(p.profile.at(-1)).toMatchObject({ x: 0, z: 180 });
      expect(Math.abs(p.profile[0]!.y - natural[0]!)).toBeLessThan(0.006);
      expect(Math.abs(p.profile.at(-1)!.y - natural.at(-1)!)).toBeLessThan(0.006);
    });
  }

  it('rovina a mírný svah: rovně jako stará cesta, bez zemních prací – jen zpevnění', () => {
    for (const l of [FLAT, GENTLE]) {
      const p = plan(l);
      expect(p.lengthM).toBeCloseTo(360, 0);
      expect(p.cutM3 + p.fillM3).toBeLessThan(5);
      expect(Math.abs(p.laborManDays - WAGON_ROAD.pavingPerM * 360)).toBeLessThan(2);
      expect(p.pieces.length).toBe(6);
      // vůz jede rychleji než po vyšlapané cestě (1,3 → 2,2)
      expect(p.minutesAfter).toBeLessThan(p.minutesBefore! * 0.7);
    }
  });

  it('rovná stará cesta: osa vozové cesty je osa staré cesty', () => {
    for (const l of [FLAT, GENTLE, BUMP, MID]) {
      const p = plan(l);
      expect(p.chain).toEqual([1]);
      expect(p.profile.every((q) => q.x === 0)).toBe(true);
      expect(p.lengthM).toBe(p.oldLengthM);
    }
  });

  it('velký svah, který ani úvoz a násep 3 m nesrovnají: cesta je pro vůz moc prudká', () => {
    for (const l of [STEEP, STEEPER]) {
      expect(planWagonRoad(input(l))).toEqual({ ok: false, reason: WAGON_STEEP });
    }
  });

  it('co nejpříměji: krátký prudký svah se srovná úvozem a náspem, trasa jde rovně', () => {
    const p = plan(BUMP);
    // rovně jako stará cesta (žádná oklika ani serpentina)
    expect(p.lengthM).toBeLessThan(365);
    const xs = p.profile.map((q) => q.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(5);
    expect(p.maxCutM).toBeGreaterThan(0.8);
    expect(p.maxFillM).toBeGreaterThan(0.8);
    expect(p.maxGrade).toBeLessThanOrEqual(WAGON_ROAD.maxGrade + 1e-9);
  });

  it('klikatá cesta po rovině: vozová vede po ní, nenarovná se (Martin 22. 10. 2026, #6)', () => {
    const bends = [
      { x: 0, z: -180 },
      { x: 60, z: -120 },
      { x: -60, z: -40 },
      { x: 60, z: 40 },
      { x: -60, z: 120 },
      { x: 0, z: 180 },
    ];
    const p = plan(FLAT, oldRoad(bends));
    expect(p.oldLengthM).toBeGreaterThan(600);
    expect(p.lengthM).toBeCloseTo(p.oldLengthM, 0);
    // každý bod profilu leží na staré ose (na cm) a všechny lomy staré osy jsou v profilu
    for (const q of p.profile) expect(distanceToLine(bends, q)).toBeLessThan(0.01);
    for (const b of bends) expect(p.profile).toContainEqual(expect.objectContaining(b));
    expect(p.cutM3 + p.fillM3).toBeLessThan(5);
  });

  it('stará cesta uličkou mezi ohradami: vozová vede uličkou 3 m (plot 1,5 m od okraje)', () => {
    // dvě ohrady vedle sebe (políčka se středy x = ±7,5), hranice x = 0 – po ní stará cesta
    const pen = (id: number, x: number): NonNullable<PathVillage['pens']>[number] => ({
      id,
      built: true,
      cell: { x: Math.round((x + 217.5) / 15), y: 15 },
      x,
      z: 7.5,
      size: 15,
    });
    const pens = [pen(1, -7.5), pen(2, 7.5)];
    const p = planWagonRoad({ ...input(FLAT), village: { dwellings: [], fields: [], pens } });
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.profile.every((q) => q.x === 0)).toBe(true);
    // přes ohradu (osa uvnitř plotu) ne
    const across = oldRoad([
      { x: -7.5, z: -180 },
      { x: -7.5, z: 180 },
    ]);
    expect(
      planWagonRoad({
        ...input(FLAT, across),
        village: { dwellings: [], fields: [], pens },
      }),
    ).toEqual({ ok: false, reason: WAGON_BLOCKED });
  });

  it('náhled v prohlížeči = plán serveru (krajina na cm, cesty jen s tím, co má scéna)', () => {
    const bent = oldRoad([
      { x: 0, z: -180 },
      { x: 45, z: 0 },
      { x: 0, z: 190 },
    ]);
    const server = planWagonRoad(input(BUMP, bent));
    const browser = planWagonRoad({
      ...input(transferPrecision(BUMP), bent),
      roads: [{ id: bent.id, points: bent.points, grade: bent.grade }],
    });
    expect(server.ok).toBe(true);
    expect(browser).toEqual(server);
  });

  it('krátký svah: úvoz a násep (nebo kousek šikmo) – hlína z úvozu jde do náspu', () => {
    const p = plan(BUMP);
    expect(p.cutM3 + p.fillM3).toBeGreaterThan(10);
    // z úvozu do náspu jde, co jde – nejvýš menší z obou
    expect(p.movedM3).toBeGreaterThan(0);
    expect(p.movedM3).toBeLessThanOrEqual(Math.min(p.cutM3, p.fillM3) + 1);
    // práce = zemní práce + zpevnění + kácení po úsecích
    const sum = p.pieces.reduce(
      (s, q) => s + q.earthManDays + q.pavingManDays + q.clearingManDays,
      0,
    );
    expect(p.laborManDays).toBeCloseTo(sum, 0);
    expect(p.pieces.reduce((s, q) => s + q.pavingManDays, 0)).toBeCloseTo(
      WAGON_ROAD.pavingPerM * p.lengthM,
      0,
    );
  });

  it('stejný vstup = stejný plán (deterministicky)', () => {
    expect(planWagonRoad(input(STEEP))).toEqual(planWagonRoad(input(STEEP)));
  });

  it('okruh a hotová vozová cesta se nenabízí', () => {
    const loop = oldRoad([
      { x: 0, z: 0 },
      { x: 50, z: 0 },
      { x: 50, z: 50 },
      { x: 0, z: 0 },
    ]);
    expect(planWagonRoad(input(FLAT, loop))).toEqual({ ok: false, reason: WAGON_LOOP });
    const wagon: Road = { ...oldRoad(), grade: 'wagon' };
    expect(wagonChainStatus([wagon], [], 1)).toEqual({ status: 'built', blocked: WAGON_EXISTS });
  });

  it('zemní práce patří jen své cestě – sousední cesta přes rozcestí jde upravit dál', () => {
    const road = (id: number, points: { x: number; z: number }[]): Road => ({
      ...oldRoad(points),
      id,
    });
    // rozcestí (0, 200): tři konce
    const roads = [
      road(1, [
        { x: 0, z: 0 },
        { x: 0, z: 200 },
      ]),
      road(2, [
        { x: 0, z: 200 },
        { x: 200, z: 200 },
      ]),
      road(3, [
        { x: 0, z: 200 },
        { x: -100, z: 300 },
      ]),
    ];
    const profile = [
      { x: 0, z: 0, y: 20 },
      { x: 3, z: 100, y: 21 },
      { x: 0, z: 200, y: 22 },
    ];
    const building = [{ profile, reachedM: 0, building: true }];
    expect(wagonChainStatus(roads, building, 1).blocked).toBe(WAGON_BUILDING);
    expect(wagonChainStatus(roads, building, 2)).toEqual({ status: 'none', blocked: null });
    // hotová – stará cesta je upravená pro vozy, i když vozová cesta je samostatná cesta
    const done = [{ profile, reachedM: 200 }];
    expect(wagonChainStatus(roads, done, 1)).toEqual({ status: 'built', blocked: WAGON_EXISTS });
    expect(wagonChainStatus(roads, done, 3)).toEqual({ status: 'none', blocked: null });
  });
});

describe('zemní práce – objemy, převoz hlíny, cena', () => {
  it('pláň o 1 m nad rovinou: objem náspu = (pláň + svahy 1 : 1) × délka', () => {
    const profile: RoadProfilePoint[] = [];
    for (let z = -60; z <= 60; z += 2) profile.push({ x: 0, z, y: 1 });
    const edits = profileEdits(profile, []);
    // uprostřed pláň, na kraji pláně ještě 1 m, za ní svah 1 : 1
    expect(editedHeight(edits, 0, 0, 0)).toBe(1);
    expect(editedHeight(edits, WAGON_ROAD.flatHalfM, 0, 0)).toBe(1);
    expect(editedHeight(edits, WAGON_ROAD.flatHalfM + 0.5, 0, 0)).toBeCloseTo(0.5, 9);
    expect(editedHeight(edits, WAGON_ROAD.flatHalfM + 2, 0, 0)).toBe(0);
    // úvoz: terén nad plání se odkope, svah 1 : 1
    expect(editedHeight(edits, 0, 0, 3)).toBe(1);
    expect(editedHeight(edits, WAGON_ROAD.flatHalfM + 1.5, 0, 3)).toBeCloseTo(2.5, 9);
    expect(editedHeight(edits, WAGON_ROAD.flatHalfM + 3, 0, 3)).toBe(3);
  });

  it('převoz: výkop do blízkého náspu, vzdálený násep z boku', () => {
    const cut = new Float64Array(100);
    const fill = new Float64Array(100);
    cut[0] = 100;
    fill[2] = 60;
    fill[99] = 60;
    const e = balanceEarth(cut, fill);
    expect(e.cutM3).toBe(100);
    expect(e.fillM3).toBe(120);
    // napřed nejbližší násep (10 m), zbytek 40 m³ do vzdáleného (495 m – dál než se vyplatí? ne)
    expect(e.movedM3).toBe(60);
    expect(e.borrowM3).toBe(60);
    const haul10 = WAGON_ROAD.haulPerM3.base + (WAGON_ROAD.haulPerM3.per100M * 10) / 100;
    const borrow = WAGON_ROAD.digPerM3 + WAGON_ROAD.haulPerM3.base + WAGON_ROAD.placePerM3;
    expect(e.labor[0]).toBeCloseTo(100 * WAGON_ROAD.digPerM3, 9);
    expect(e.labor[2]).toBeCloseTo(60 * (haul10 + WAGON_ROAD.placePerM3), 9);
    expect(e.labor[99]).toBeCloseTo(60 * borrow, 9);
  });
});

describe('rychlosti – vozová cesta', () => {
  it('vůz 2,2 i v mokřině, pěšky 1,7 i v mokřině, brod zůstává brodem', () => {
    expect(cartRoadSpeed('wagon', false, false)).toBe(CART_SPEED.road.wagon);
    expect(cartRoadSpeed('wagon', false, true)).toBe(CART_SPEED.road.wagon);
    expect(cartRoadSpeed('improved', false, true, 0, true)).toBe(CART_SPEED.wet);
    expect(CART_SPEED.road.wagon).toBe(2.2);
    expect(roadWalkSpeed('wagon', false)).toBe(1.7);
    expect(roadWalkSpeed('wagon', true)).toBe(ROAD_WALK.causewayWetSpeed);
    expect(roadWalkSpeed('improved', true, 0, true)).toBe(ROAD_WALK.wetSpeed);
    // stromy u cesty přidají i vozové cestě
    expect(cartRoadSpeed('wagon', false, false, 0.03)).toBeCloseTo(2.23, 9);
    const road = {
      points: [
        { x: 0, z: 0 },
        { x: 100, z: 0 },
      ],
      grade: 'wagon' as const,
      ground: { wet: [[10, 30]] as [number, number][], fords: [50] },
    };
    // lávka pro pěší vedle brodu: brod pěšího nezpomalí
    expect(roadPieceCost(road, 0, 100)).toBeCloseTo(100 / 1.7, 9);
  });

  it('lávka u vozové cesty: každý brod (souvislý běh bodů) jednou, v m od začátku', () => {
    const profile = [0, 10, 20, 30, 40, 50].map((x) => ({ x, z: 0, y: 0 }));
    expect(fordArcsOf(profile, [1, 2, 4])).toEqual([10, 40]);
    expect(fordArcsOf(profile, [])).toEqual([]);
  });
});

describe('výšky terénu jako herní data', () => {
  const profile: RoadProfilePoint[] = [
    { x: -20, z: 0, y: 2 },
    { x: 20, z: 0, y: 2.4 },
  ];

  it('pláň vyjde v navržené výšce pro jakýkoli původní terén (jádro i scéna)', () => {
    const edits = profileEdits(profile, []);
    for (const natural of [0, 1.3, 2.2, 5, -3]) {
      expect(editedHeight(edits, 0, 1, natural)).toBeCloseTo(2.2, 12);
      expect(editedHeight(edits, 10, -2.5, natural)).toBeCloseTo(2.3, 12);
    }
    // daleko od cesty terén beze změny
    expect(editedHeight(edits, 0, 40, 7)).toBe(7);
    expect(groundHeightAt(edits, FLAT, 0, 0)).toBeCloseTo(2.2, 12);
  });

  it('bez zemních prací týž terén (bit po bitu) a ves bez vozové cesty beze změny', () => {
    const terrain = pathTerrainOf(
      GENTLE,
      pathWindowFor(GENTLE, { minX: -50, minZ: -50, maxX: 50, maxZ: 50 }),
    );
    expect(withTerrainEdits(terrain, NO_TERRAIN_EDITS)).toBe(terrain);
    expect(terrainEditsFrom([])).toBe(NO_TERRAIN_EDITS);
    const s = withBuiltFirstDwelling(
      foundVillage({ seed: 3, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
    );
    expect(terrainEditsOf(s)).toBe(NO_TERRAIN_EDITS);
    expect('earthworks' in pathVillageOf(s, DAY, GENTLE)).toBe(false);
  });

  it('úvoz sníží terén pěšin a sklon cesty v něm je do 6 %', () => {
    const p = plan(BUMP);
    const edits = profileEdits(p.profile, p.fords);
    const terrain = pathTerrainOf(
      BUMP,
      pathWindowFor(BUMP, { minX: -200, minZ: -200, maxX: 200, maxZ: 200 }),
    );
    const edited = withTerrainEdits(terrain, edits);
    expect(edited).not.toBe(terrain);
    // buňky pod osou: výška pláně, sklon mezi buňkami po ose do 6 % (a kousek – buňky nejsou
    // přesně na ose)
    const cell = (x: number, z: number): number =>
      Math.round((z - edited.originZ) / edited.cellM) * edited.width +
      Math.round((x - edited.originX) / edited.cellM);
    for (const q of p.profile.filter((_, k) => k % 5 === 0)) {
      const c = cell(q.x, q.z);
      const cx = edited.originX + (c % edited.width) * edited.cellM;
      const cz = edited.originZ + Math.floor(c / edited.width) * edited.cellM;
      expect(edited.heights![c]).toBeCloseTo(editedHeight(edits, cx, cz, terrain.heights![c]!), 4);
    }
  });
});

describe('stavba vozové cesty ve vsi', () => {
  function village(l: Landscape, road: Road = oldRoad()): VillageState {
    const s = withBuiltFirstDwelling(
      foundVillage({ seed: 11, day: DAY, dwellingPosition: { x: 20, z: -190, rotation: 0 } }),
    );
    s.lastDay = DAY;
    s.roads = {
      nextId: 2,
      roads: [road],
      trees: [],
      labor: { from: DAY, days: 0, shares: [] },
    };
    void l;
    return s;
  }

  it('staví se po úsecích od vsi ven po staré ose, hotový úsek nahradí starou cestu', () => {
    // stará cesta oklikou – vozová vede po ní (Martin 22. 10. 2026, #6), souběžná nevznikne;
    // severní konec leží v pásu kraje mapy (kotva) – stará cesta tam nekončí jako pahýl
    const bent = oldRoad([
      { x: 0, z: -180 },
      { x: 45, z: 0 },
      { x: 0, z: 190 },
    ]);
    const s = startWagonRoad(village(BUMP, bent), DAY, 1, BUMP, null);
    const c = s.constructions.find((x) => x.earthwork !== undefined)!;
    expect(c.kind).toBe('road');
    const earthwork = s.roads!.earthworks![0]!;
    expect(earthwork.constructionId).toBe(c.id);
    expect(earthwork.pieces.reduce((sum, p) => sum + p.manDays, 0)).toBeCloseTo(c.cost, 1);
    // konec u vsi první
    expect(earthwork.profile[0]).toMatchObject({ x: 0, z: -180 });
    let later = s;
    const built: number[] = [];
    for (let i = 0; i < 400 && later.roads!.earthworks![0]!.constructionId !== undefined; i++) {
      later = advanceVillage(later, later.lastDay + 5, null, BUMP);
      built.push(later.roads!.earthworks![0]!.pieces.filter((p) => p.builtDay !== null).length);
      const wagon = later.roads!.roads.filter((r) => r.grade === 'wagon');
      // hotové úseky jsou cestou od vsi ven
      if (wagon.length > 0 && later.roads!.earthworks![0]!.constructionId !== undefined) {
        const reached = built.at(-1)!;
        const length = wagon.reduce((sum, r) => sum + roadLengthM(r), 0);
        expect(length).toBeCloseTo(earthwork.pieces[reached - 1]!.toM, -1);
      }
    }
    const done = later.roads!.earthworks![0]!;
    expect(done.constructionId).toBeUndefined();
    expect(done.pieces.every((p) => p.builtDay !== null)).toBe(true);
    // úseky přibývaly postupně
    expect(new Set(built).size).toBeGreaterThan(2);
    const wagon = later.roads!.roads.filter((r) => r.grade === 'wagon');
    expect(wagon.length).toBeGreaterThan(0);
    // po dokončení vede vozová cesta souvisle mezi konci staré cesty po její ose (i přes oklik)
    const ends = wagon.flatMap((r) => [r.points[0]!, r.points.at(-1)!]);
    expect(ends).toContainEqual({ x: 0, z: -180 });
    expect(ends).toContainEqual({ x: 0, z: 190 });
    expect(wagon.reduce((sum, r) => sum + roadLengthM(r), 0)).toBeCloseTo(roadLengthM(bent), -1);
    for (const r of wagon) {
      for (const q of r.points) expect(distanceToLine(bent.points, q)).toBeLessThan(0.05);
    }
    // stará cesta pod vozovou zmizela – žádná souběžná cesta
    expect(later.roads!.roads.filter((r) => r.grade !== 'wagon')).toEqual([]);
    // znovu nejde – cesta je upravená pro vozy
    expect(() => startWagonRoad(later, later.lastDay, wagon[0]!.id, BUMP, null)).toThrow(
      WAGON_EXISTS,
    );
    expect(later.chronicle.some((e) => e.kind === 'construction-finished')).toBe(true);
  });

  it('souběžná vyšlapaná cesta se k vozové sloučí, vozová cesta se nikdy nevyřízne', () => {
    const wagon: Road = {
      id: 1,
      points: [
        { x: 0, z: 0 },
        { x: 0, z: 200 },
      ],
      bornDay: 100,
      grade: 'wagon',
      traffic: [0],
      spots: [],
    };
    // copánek: vyšlapaná kratší cesta mezi stejnými konci, kousek vedle
    const trodden: Road = {
      id: 2,
      points: [
        { x: 0, z: 0 },
        { x: 6, z: 100 },
        { x: 0, z: 200 },
      ],
      bornDay: 0,
      grade: 'trodden',
      traffic: [9],
      spots: [],
    };
    const terrain = pathTerrainOf(
      FLAT,
      pathWindowFor(FLAT, { minX: -50, minZ: -50, maxX: 50, maxZ: 250 }),
    );
    const out = joinedRoadsOf([trodden, wagon], [], terrain);
    expect(out.some((r) => r.grade === 'wagon' && roadLengthM(r) > 199)).toBe(true);
    expect(out.some((r) => r.grade === 'trodden')).toBe(false);
  });
});

describe('stará cesta zůstane – nepoužívaná zaroste', () => {
  const NOV1 = (year: number): number => dayIndexOf({ year, month: 11, day: 1 });

  /** Ves čtyř obydlí kolem počátku (jako roads.test.ts) – k potoku z ∈ (75, 90) se chodí silně. */
  function village(): VillageState {
    const day = NOV1(600) - 30;
    const s = withBuiltFirstDwelling(
      foundVillage({ seed: 11, day: day - 400, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
    );
    const at = (id: number, x: number, z: number): VillageState['dwellings'][number] => ({
      id,
      type: 'zemnice',
      builtDay: day - 30 * 365,
      condition: 1,
      position: { x, z, rotation: 0 },
    });
    s.dwellings = [at(1, 0, 0), at(2, 18, -4), at(3, -18, -4), at(4, 0, -22)];
    s.people = [1, 2, 3, 4].flatMap((d) =>
      [30, 28, 22, 20].map((years, k) => ({
        id: d * 10 + k,
        bornDay: day - Math.ceil(years * 365.25),
        dwellingId: d,
      })),
    );
    s.nextId = 100;
    s.constructions = [];
    s.storesKg = 20_000;
    s.lastDay = day;
    return s;
  }

  it('lidé přejdou na vozovou cestu, klikatá stará cesta po pěti letech zaroste', () => {
    const s = village();
    updateRoads(s, NOV1(600), LANDSCAPE, null);
    const meander: Road = {
      id: 500,
      points: [
        { x: 0, z: 10 },
        { x: 40, z: 30 },
        { x: -40, z: 50 },
        { x: 0, z: 70 },
      ],
      bornDay: NOV1(580),
      grade: 'trodden',
      traffic: [],
      spots: [],
    };
    const wagon: Road = {
      id: 501,
      points: [
        { x: 0, z: 10 },
        { x: 0, z: 70 },
      ],
      bornDay: NOV1(599),
      grade: 'wagon',
      traffic: [],
      spots: [],
      swath: true,
    };
    s.roads!.roads.push(meander, wagon);
    s.roads!.wear ??= { day: NOV1(600), cells: '', labor: [] };
    // měsíčně bez provozu (paths.md – Zarůstání): vyšlapaná cesta zaroste za pět let (± měsíc)
    const first = (m: number): number =>
      dayIndexOf({ year: 600 + Math.floor((10 + m) / 12), month: 1 + ((10 + m) % 12), day: 1 });
    for (let m = 1; m <= 58; m++) roadsMonth(s, first(m), LANDSCAPE, null);
    expect(s.roads!.roads.some((r) => r.id === 500)).toBe(true);
    for (let m = 59; m <= 64; m++) roadsMonth(s, first(m), LANDSCAPE, null);
    expect(s.chronicle).toContainEqual(expect.objectContaining({ kind: 'road-overgrown' }));
    expect(s.roads!.roads.some((r) => r.id === 500 && r.points.some((p) => p.x > 30))).toBe(false);
    // vozová cesta stojí dál (nezarůstá)
    expect(s.roads!.roads.find((r) => r.id === 501)?.grade).toBe('wagon');
  }, 60_000);
});

describe('vozová síť a pěšiny s novými výškami', () => {
  it('šikmá vozová cesta přes osetý díl: vůz jede po ní (pás cesty, ne zoubky buněk)', () => {
    const diagonal = oldRoad([
      { x: -60, z: -60 },
      { x: 60, z: 60 },
    ]);
    const p = plan(FLAT, diagonal);
    const terrain = pathTerrainOf(
      FLAT,
      pathWindowFor(FLAT, { minX: -120, minZ: -120, maxX: 120, maxZ: 120 }),
    );
    // osetý blok 4 × 4 políčka kolem počátku – vůz po něm jen pomalu (CART_SPEED.sown)
    const centres = [-22.5, -7.5, 7.5, 22.5];
    const parts = centres.flatMap((x) =>
      centres.map((z) => ({
        cell: { x: Math.round((x + 217.5) / 15), y: Math.round((z + 217.5) / 15) },
        x,
        z,
        size: 15,
        stage: 'sown' as const,
      })),
    );
    const road = {
      id: 7,
      points: p.profile.map((q) => ({ x: q.x, z: q.z })),
      grade: 'wagon' as const,
    };
    const route = cartRoutes({
      village: { dwellings: [], fields: [{ id: 3, parts }], roads: [road] },
      terrain,
      kind: 'two-wheel',
      depots: [{ x: -60, z: -60 }],
      targets: [{ x: 60, z: 60, reachM: 5 }],
    }).routes[0]!;
    expect(route.reached).toBe(true);
    expect(route.points.filter((q) => distanceToLine(diagonal.points, q) > 3).length).toBe(0);
  });

  it('po úvozu vůz jede rovně po vozové cestě – bez úprav terénu je svah pro vůz moc strmý', () => {
    const l = hill(0.15, 12, 15);
    const p = plan(l);
    const terrain = pathTerrainOf(
      l,
      pathWindowFor(l, { minX: -220, minZ: -220, maxX: 220, maxZ: 220 }),
    );
    const road = {
      id: 7,
      points: p.profile.map((q) => ({ x: q.x, z: q.z })),
      grade: 'wagon' as const,
    };
    const earthworks = [{ profile: p.profile, fords: p.fords, reachedM: Infinity }];
    const route = (withEarthworks: boolean): CartRoute =>
      cartRoutes({
        village: {
          dwellings: [],
          fields: [],
          roads: [road],
          ...(withEarthworks ? { earthworks } : {}),
        },
        terrain,
        kind: 'two-wheel',
        depots: [{ x: 0, z: -180 }],
        targets: [{ x: 0, z: 180, reachM: 5 }],
      }).routes[0]!;
    const smooth = route(true);
    const rough = route(false);
    expect(smooth.reached).toBe(true);
    // po cestě s upraveným terénem – trasa jde po ose vozové cesty
    const axis = terrainEditsFrom(earthworks);
    const off = smooth.points.filter((q) => {
      const d = { arc: 0, d: 0 };
      editedHeight(axis, q.x, q.z, 0, d);
      return d.d > 4;
    });
    expect(off.length).toBeLessThan(3);
    // bez úprav terénu je svah 15 % nad mezí vozu – oklika, nebo nedojede
    if (rough.reached) expect(rough.cost).toBeGreaterThan(smooth.cost * 1.2);
  });
});

describe('narovnání kličky do svahu (Martin 22. 10. 2026, #6)', () => {
  // klička: cesta v údolí (x = 0) se na svahu 8 % vyhne do boku (45 m) a vrátí se
  const ZIGZAG = [
    { x: 0, z: -180 },
    { x: 0, z: -30 },
    { x: 45, z: 0 },
    { x: 0, z: 30 },
    { x: 0, z: 190 },
  ];
  /** Svah 8 % po řádcích 14–17 (převýšení 3,6 m – konce tětivy leží v rovině); dno údolí široké 3 políčka, strmé boky (klička po nich nejde). */
  const VALLEY = makeLandscape({
    size: 30,
    height: (x, y) =>
      Math.min(17, Math.max(14, y)) * 15 * 0.08 + Math.max(0, Math.abs(x - 15) - 1.5) * 15 * 0.8,
  });
  const SLOPE = hill(0.08, 14, 17);

  it('kde stará osa po bocích údolí nejde, klička se narovná tětivou a profil vyjde', () => {
    const p = plan(VALLEY, oldRoad(ZIGZAG));
    expect(p.bypassed).toHaveLength(1);
    expect(p.bypassed[0]!.some((q) => q.x > 40)).toBe(true);
    // osa už nekličkuje – celý profil leží v údolí
    for (const q of p.profile) expect(Math.abs(q.x)).toBeLessThan(5);
    expect(p.lengthM).toBeLessThan(p.oldLengthM);
    expect(p.maxCutM).toBeLessThanOrEqual(WAGON_ROAD.maxCutM);
    expect(p.maxFillM).toBeLessThanOrEqual(WAGON_ROAD.maxFillM);
  });

  it('kde je klička levnější než tětiva, zůstane osa po staré cestě (úvoz a násep)', () => {
    const p = plan(SLOPE, oldRoad(ZIGZAG));
    expect(p.bypassed).toEqual([]);
    expect(p.profile.some((q) => q.x > 40)).toBe(true);
  });

  it('klička po rovině se nenarovná (převýšení pod 3 m)', () => {
    const p = plan(FLAT, oldRoad(ZIGZAG));
    expect(p.bypassed).toEqual([]);
    expect(p.profile.some((q) => q.x > 40)).toBe(true);
  });

  it('náhled v prohlížeči = plán serveru i s narovnáním', () => {
    const road = oldRoad(ZIGZAG);
    const server = planWagonRoad(input(VALLEY, road));
    const browser = planWagonRoad({
      ...input(transferPrecision(VALLEY), road),
      roads: [{ id: road.id, points: road.points, grade: road.grade }],
    });
    expect(server.ok && server.bypassed.length).toBe(1);
    expect(browser).toEqual(server);
  });

  it('tětiva nevede přes posvátné duby: osa zůstane stará, plán nespadne na WAGON_SACRED', () => {
    const oaks: ObstaclePlacement[] = [];
    let id = 1;
    for (let x = -2; x <= 2; x += 2) {
      for (let z = -30; z <= 30; z += 5) {
        oaks.push({ id: id++, kind: 'tree', look: 'oak-1', x, z, rotation: 0, scale: 1 });
      }
    }
    const road = oldRoad(ZIGZAG);
    expect(plan(VALLEY, road).bypassed).toHaveLength(1);
    const through = planWagonRoad({ ...input(VALLEY, road), layer: packObstacles(oaks, 20, 15) });
    expect(through).not.toEqual({ ok: false, reason: WAGON_SACRED });
    if (through.ok) expect(through.bypassed).toEqual([]);
  });

  it('obejitý kus staré cesty po dostavění zaroste (opuštěný), vozová vede tětivou', () => {
    const state = withBuiltFirstDwelling(
      foundVillage({ seed: 11, day: DAY, dwellingPosition: { x: 20, z: -190, rotation: 0 } }),
    );
    state.lastDay = DAY;
    state.roads = {
      nextId: 2,
      roads: [oldRoad(ZIGZAG)],
      trees: [],
      labor: { from: DAY, days: 0, shares: [] },
    };
    let later = startWagonRoad(state, DAY, 1, VALLEY, null);
    expect(later.roads!.earthworks![0]!.bypassed).toHaveLength(1);
    for (let i = 0; i < 400 && later.roads!.earthworks![0]!.constructionId !== undefined; i++) {
      later = advanceVillage(later, later.lastDay + 5, null, VALLEY);
    }
    const roads = later.roads!.roads;
    const wagon = roads.filter((r) => r.grade === 'wagon');
    expect(wagon.length).toBeGreaterThan(0);
    for (const r of wagon) for (const q of r.points) expect(Math.abs(q.x)).toBeLessThan(5);
    // obejitý kus je opuštěný, nic jiného nezůstalo živé; opuštěný kus není ramenem křižovatky
    const rest = roads.filter((r) => r.grade !== 'wagon');
    expect(rest.length).toBeGreaterThan(0);
    expect(rest.every((r) => r.abandoned === true)).toBe(true);
  });
});

describe('obejitý kus – mezistav a zrušení stavby', () => {
  const ZIG = [
    { x: 0, z: -180 },
    { x: 0, z: -30 },
    { x: 45, z: 0 },
    { x: 0, z: 30 },
    { x: 0, z: 190 },
  ];
  const VALLEY = makeLandscape({
    size: 30,
    height: (x, y) =>
      Math.min(17, Math.max(14, y)) * 15 * 0.08 + Math.max(0, Math.abs(x - 15) - 1.5) * 15 * 0.8,
  });
  function started(): VillageState {
    const state = withBuiltFirstDwelling(
      foundVillage({ seed: 11, day: DAY, dwellingPosition: { x: 20, z: -190, rotation: 0 } }),
    );
    state.lastDay = DAY;
    state.roads = {
      nextId: 2,
      roads: [oldRoad(ZIG)],
      trees: [],
      labor: { from: DAY, days: 0, shares: [] },
    };
    return startWagonRoad(state, DAY, 1, VALLEY, null);
  }
  /** Postup stavby: dnů po 2, až je hotový první úsek, ale ještě ne celá cesta. */
  function midway(): VillageState {
    let s = started();
    for (let i = 0; i < 600; i++) {
      const pieces = s.roads!.earthworks![0]!.pieces;
      if (pieces.some((p) => p.builtDay !== null) && pieces.some((p) => p.builtDay === null)) {
        const reached = pieces.filter((p) => p.builtDay !== null).at(-1)!.toM;
        if (reached < 120) return s;
        break;
      }
      s = advanceVillage(s, s.lastDay + 2, null, VALLEY);
    }
    return s;
  }

  it('rozestavěná cesta stará zig-zag cestu neopustí, dokud ji nová trasa nepřekoná', () => {
    const s = midway();
    const pieces = s.roads!.earthworks![0]!.pieces;
    expect(pieces.some((p) => p.builtDay !== null)).toBe(true);
    expect(pieces.some((p) => p.builtDay === null)).toBe(true);
    expect(s.roads!.roads.some((r) => r.abandoned === true)).toBe(false);
  });

  it('zrušení stavby před obejitým kusem: stará cesta žije dál, bypassed se zahodí', () => {
    const s = midway();
    const c = s.constructions.find((x) => x.earthwork !== undefined)!;
    const next = cancelConstruction(s, s.lastDay, c.id);
    expect(next.roads!.earthworks![0]!.bypassed).toBeUndefined();
    expect(next.roads!.roads.some((r) => r.abandoned === true)).toBe(false);
  });
});

describe('vozová cesta – výjimky z recenze 11a', () => {
  /** Louka 450 m s mělkým potokem z ∈ (75, 90) – brod. */
  const FORD_LAND: Landscape = {
    ...makeLandscape({ size: 30, surface: (_x, y) => (y === 20 ? 'water' : 'meadow') }),
    stream: [0, 8, 15, 22, 30].map((x) => ({
      x,
      y: 20.5,
      halfWidthLeft: 0.08,
      halfWidthRight: 0.08,
      level: 0,
      shallow: true,
    })),
  };
  const oak = (id: number, x: number, z: number): ObstaclePlacement => ({
    id,
    kind: 'tree',
    look: 'oak-1',
    x,
    z,
    rotation: 0,
    scale: 1,
  });
  const beech = (id: number, x: number, z: number): ObstaclePlacement => ({
    ...oak(id, x, z),
    look: 'beech-1',
  });

  function villageAt(home: { x: number; z: number }, road: Road): VillageState {
    const s = withBuiltFirstDwelling(
      foundVillage({ seed: 11, day: DAY, dwellingPosition: { ...home, rotation: 0 } }),
    );
    s.lastDay = DAY;
    s.roads = {
      nextId: 2,
      roads: [road],
      trees: [],
      labor: { from: DAY, days: 0, shares: [] },
    };
    return s;
  }

  it('stavba těsně u konce osy (do 9 m, vchod) cestu neblokuje, uprostřed ano', () => {
    const at = (home: { x: number; z: number }): WagonRoadPlan =>
      planWagonRoad(wagonPlanInputOf(villageAt(home, oldRoad()), DAY, 1, FLAT, null));
    expect(at({ x: 6, z: -176 })).toMatchObject({ ok: true });
    expect(at({ x: 4, z: 0 })).toEqual({ ok: false, reason: WAGON_BLOCKED });
  });

  it('posvátný dub v cestě vozové cestě zabrání (kácet se nesmí)', () => {
    const placements: ObstaclePlacement[] = [];
    let id = 1;
    for (let x = -140; x <= -120; x += 5) {
      for (let z = 40; z <= 60; z += 5) placements.push(oak(id++, x, z));
    }
    const layer = packObstacles(placements, 20, 15);
    const through = oldRoad([
      { x: -30, z: 50 },
      { x: -150, z: 50 },
    ]);
    const base = { ...input(LANDSCAPE, through), layer, home: { x: -30, z: 50 } };
    expect(planWagonRoad(base)).toEqual({ ok: false, reason: WAGON_SACRED });
    // bez háje stejná cesta projde
    expect(planWagonRoad({ ...base, layer: null })).toMatchObject({ ok: true });
  });

  it('lávka pro pěší u brodu chce dřevo jako u upravené cesty: 4 stromy, kácení před zemními pracemi', () => {
    // potok z ∈ (75, 90) s brodem – cesta ho kříží
    const ford = oldRoad([
      { x: 0, z: 30 },
      { x: 0, z: 140 },
    ]);
    const trees = [1, 2, 3, 4, 5, 6].map((k) => beech(k, 25 + k * 4, 100));
    const layer = packObstacles(trees, 20, 15);
    const s = villageAt({ x: 20, z: 20 }, ford);
    const p = planWagonRoad(wagonPlanInputOf(s, DAY, 1, FORD_LAND, layer));
    if (!p.ok) throw new Error(p.reason);
    expect(p.footbridgeTrees).toBe(4);
    const started = startWagonRoad(s, DAY, 1, FORD_LAND, layer);
    const c = started.constructions.find((x) => x.earthwork !== undefined)!;
    expect(c.wood?.trees).toBe(4);
    expect(c.wood!.fromPile + c.wood!.fell.length).toBe(4);
    const felling = c.wood!.fell.reduce((sum, t) => sum + t.cost, 0);
    expect(felling).toBeGreaterThan(0);
    expect(c.cost).toBeCloseTo(p.laborManDays + felling, 1);
    expect(p.missingWood).toBe(0);
  });

  it('chybějící dřevo na lávku nese plán předem (missingWood), stavba se pojistkou zastaví', () => {
    const ford = oldRoad([
      { x: 0, z: 30 },
      { x: 0, z: 140 },
    ]);
    const layer = packObstacles([beech(1, 29, 100), beech(2, 33, 100)], 20, 15);
    const s = villageAt({ x: 20, z: 20 }, ford);
    const p = planWagonRoad(wagonPlanInputOf(s, DAY, 1, FORD_LAND, layer));
    if (!p.ok) throw new Error(p.reason);
    expect(p.footbridgeTrees).toBe(4);
    expect(p.missingWood).toBe(2);
    expect(() => startWagonRoad(s, DAY, 1, FORD_LAND, layer)).toThrow(WAGON_NO_WOOD);
  });
});
