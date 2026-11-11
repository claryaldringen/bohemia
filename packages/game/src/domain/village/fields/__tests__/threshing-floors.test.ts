import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { packObstacles, type ObstaclePlacement } from '../../../landscape';
import { foundVillage, startThreshingFloor, type PartInput } from '../../core/actions';
import { BUILD_COSTS, buildAffordability } from '../../buildings/costs';
import { obstacleChangesAt } from '../../core/obstacles';
import {
  checkDwellingPlacement,
  checkSacredBuildingPlacement,
  checkThreshingFloorPlacement,
  fieldPartsFromCells,
  placementVillageOf,
  type PlacementVillage,
} from '../../placement/placement';
import { HUMNO } from '../../rules';
import { withoutBuiltOverRuins } from '../../buildings/ruins';
import { advanceVillage } from '../../core/simulate';
import {
  builtThreshingFloors,
  threshingFloorBuildLabor,
  threshingFloorFootprint,
} from '../threshing-floors';
import type { ChronicleEvent, Position, TileCell, VillageState } from '../../types';
import { block, makeLandscape } from '../../__tests__/placement-fixtures';

// Humno (production-chains.md – Humno): stavba hráče – mlatová plocha 8 × 10 m s přístřeškem,
// volně u kurzoru jako dílna. Ruční krajina 16 × 16 políček po 15 m se středem v počátku:
// políčko (8, 8) = svět 0–15 m. Dvě řady buků vpravo nahoře na dřevo, kámen a skalní výchoz.

const DAY = dayIndexOf({ year: 600, month: 4, day: 1 });
const HOME: Position = { x: -100, z: -20, rotation: 0 };
const CELL = 225;
const at = (x: number, z: number, rotation = 0): Position => ({ x, z, rotation });

const tree = (id: number, x: number, z: number): ObstaclePlacement => ({
  id,
  kind: 'tree',
  look: 'beech-1',
  x,
  z,
  rotation: 0,
  scale: 1,
});
const beeches: ObstaclePlacement[] = [];
for (let i = 0; i < 10; i++)
  beeches.push(tree(10 + i, 60 + 5 * i, -90), tree(30 + i, 60 + 5 * i, -95));
const layer = packObstacles(
  [
    ...beeches,
    { id: 500, kind: 'stone', look: 'stone-1', x: -60, z: 31, rotation: 0, scale: 1 },
    { id: 600, kind: 'outcrop', look: 'rock-boulder', x: 40, z: 60, rotation: 0, scale: 1 },
  ].sort((a, b) => a.id - b.id) as ObstaclePlacement[],
  16,
  15,
);
const landscape = makeLandscape();
const village = (): VillageState =>
  foundVillage({ seed: 3, day: DAY, dwellingPosition: HOME, obstacles: layer });

describe('humno – umístění (volně jako dílna)', () => {
  it('na louce projde, kámen na půdorysu osadníci odstraní za práci', () => {
    const check = checkThreshingFloorPlacement(landscape, null, at(-60, 30), layer);
    expect(check.ok).toBe(true);
    expect(check.obstacleIds).toEqual([500]);
    expect(check.obstacleCost).toBeGreaterThan(0);
    expect(check.takenLand).toEqual([]);
  });

  it('půdorys je obdélník 8 × 10 m natočený jako obydlí', () => {
    const corners = threshingFloorFootprint(at(0, 0, Math.PI / 2));
    const xs = corners.map(([x]) => x);
    const zs = corners.map(([, z]) => z);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(HUMNO.sizeM.z, 9);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(HUMNO.sizeM.x, 9);
  });

  it('ne do vody, na skalní výchoz, na nerovnou zem ani ven z krajiny', () => {
    const water = makeLandscape({ surface: (x) => (x === 4 ? 'water' : 'meadow') });
    expect(checkThreshingFloorPlacement(water, null, at(-55, 0), layer).reason).toBe(
      'Humno nemůže stát ve vodě.',
    );
    expect(checkThreshingFloorPlacement(landscape, null, at(40, 58), layer).reason).toBe(
      'Stojí tu skalní výchoz – ten osadníci neodstraní.',
    );
    expect(checkThreshingFloorPlacement(landscape, null, at(117, 0), layer).reason).toBe(
      'Humno musí stát uvnitř krajiny sídla.',
    );
    // svah 2 m na políčko: přes šířku 8 m ≈ 1,07 m – víc než HUMNO.maxHeightDiffM
    const steep = makeLandscape({ height: (x) => x * 2 });
    expect(checkThreshingFloorPlacement(steep, null, at(-30, 0), layer).reason).toMatch(
      /^Země je tu příliš nerovná/,
    );
    const gentle = makeLandscape({ height: (x) => x * 1.5 });
    expect(checkThreshingFloorPlacement(gentle, null, at(-30, 0), layer).ok).toBe(true);
  });

  it('v lese projde – les se vyklučí za sazbu lesa i s pruhem pod korunami', () => {
    const forest = makeLandscape({ surface: (x) => (x >= 8 ? 'forest' : 'meadow') });
    const check = checkThreshingFloorPlacement(forest, null, at(60, -30), layer);
    expect(check.ok).toBe(true);
    // půdorys 8 × 10 m a pruh 4 m kolem dokola = 16 × 18 m lesa za 250 čd/ha (bez řemesel)
    expect(check.obstacleCost).toBeCloseTo((250 * 16 * 18) / 10_000, 6);
  });

  it('nepřekrývá jiné stavby a jiné stavby nepřekrývají humno', () => {
    const started = startThreshingFloor(village(), DAY, at(-60, 30), layer, {
      obstacleIds: [500],
      obstacleCost: 1,
    });
    const v = placementVillageOf(started, DAY);
    expect(checkThreshingFloorPlacement(landscape, v, at(-55, 34), layer).reason).toBe(
      'Překrývá se s humnem.',
    );
    expect(checkDwellingPlacement(landscape, v, 'zemnice', at(-60, 30)).reason).toBe(
      'Překrývá se s humnem.',
    );
    expect(checkSacredBuildingPlacement(landscape, v, 'idol', at(-60, 30), layer).reason).toBe(
      'Překrývá se s humnem.',
    );
    // humno (−64 … −56, 25 … 35) leží na políčku (3, 9)
    expect(fieldPartsFromCells(landscape, v, [{ x: 3, y: 9 }], [HOME]).check.reason).toBe(
      'Pole se překrývá s humnem.',
    );
    expect(checkThreshingFloorPlacement(landscape, v, at(HOME.x, HOME.z + 2), layer).reason).toBe(
      'Překrývá se s rozestavěným obydlím.',
    );
  });

  it('na poli projde – pole se o průnik zmenší (fields.md – Pole jako krajina)', () => {
    const field: PlacementVillage = {
      dwellings: [],
      constructions: [],
      parts: block(8, 8, 2, 1).map((cell) => ({ cell, fieldId: 7, areaM2: CELL })),
    };
    // humno x 11 … 19, z 2,5 … 12,5 – půl na políčku (8, 8), půl na (9, 8)
    const check = checkThreshingFloorPlacement(landscape, field, at(15, 7.5), layer);
    expect(check).toMatchObject({ ok: true, warning: 'Pole se zmenší' });
    expect(check.takenLand).toEqual([
      { cell: { x: 8, y: 8 }, areaM2: 40, cellAreaM2: CELL },
      { cell: { x: 9, y: 8 }, areaM2: 40, cellAreaM2: CELL },
    ]);
  });
});

describe('humno – stavba ze společné práce', () => {
  it('dřevo předem jako u ostatních, humno hned zabírá místo a po dostavění je hotové', () => {
    const s = village();
    expect(BUILD_COSTS['threshing-floor'].upfront).toEqual({ wood: HUMNO.trees });
    expect(buildAffordability(s, 'threshing-floor', layer).affordable).toBe(true);
    const position = at(-60, 30, 0.5);
    const check = checkThreshingFloorPlacement(
      landscape,
      placementVillageOf(s, DAY),
      position,
      layer,
    );
    expect(check.ok).toBe(true);
    const started = startThreshingFloor(s, DAY, position, layer, {
      obstacleCost: check.obstacleCost,
      obstacleIds: check.obstacleIds,
      clearedTrees: check.clearedTrees,
    });
    const c = started.constructions.at(-1)!;
    expect(c).toMatchObject({ kind: 'threshing-floor', position, dwellingType: null });
    expect(c.wood!.trees).toBe(HUMNO.trees);
    const felling = c.wood!.fell.reduce((sum, t) => sum + t.cost, 0);
    expect(c.cost).toBeCloseTo(threshingFloorBuildLabor() + check.obstacleCost + felling, 9);
    expect(started.threshingFloors).toEqual([{ id: c.id, position, builtDay: null }]);
    expect(builtThreshingFloors(started)).toEqual([]);
    expect(obstacleChangesAt(started, DAY).removed).toContain(500);
    // vstupní stav se nemění
    expect(s.threshingFloors).toBeUndefined();

    const built = advanceVillage(started, DAY + 400, layer);
    const floor = built.threshingFloors?.[0];
    expect(floor).toMatchObject({ id: c.id, position });
    expect(floor?.builtDay).toBeGreaterThan(DAY);
    expect(builtThreshingFloors(built)).toEqual([floor]);
    expect(built.constructions.some((x) => x.kind === 'threshing-floor')).toBe(false);
    expect(built.chronicle).toContainEqual(
      expect.objectContaining({
        kind: 'construction-finished',
        constructionKind: 'threshing-floor',
        day: floor?.builtDay,
      }),
    );
    // vyhrazené stromy jsou skácené – zbyly pařezy
    const stumps = obstacleChangesAt(built, built.lastDay).stumps;
    for (const t of c.wood!.fell) expect(stumps).toContain(t.id);
  });

  it('humno je jen mlat – bez dřeva a stromů, 20 člověkodní', () => {
    const bare = packObstacles([], 16, 15);
    const s = foundVillage({ seed: 3, day: DAY, dwellingPosition: HOME, obstacles: bare });
    expect(HUMNO.trees).toBe(0);
    expect(buildAffordability(s, 'threshing-floor', bare)).toEqual({
      affordable: true,
      missing: {},
    });
    const built = startThreshingFloor(s, DAY, at(-60, 30), bare);
    const c = built.constructions.at(-1)!;
    expect(c.wood).toMatchObject({ trees: 0, fell: [] });
    expect(c.cost).toBe(HUMNO.laborManDays);
    expect(HUMNO.laborManDays).toBe(20);
  });

  it('na poli – díl se zmenší o průnik a kronika ví, že ustoupil humnu', () => {
    const parts: PartInput[] = block(2, 0, 4, 3).map((cell: TileCell, i) => ({
      areaM2: CELL,
      distanceM: 60 + 12 * i,
      naturalFertility: 70,
      surface: 'meadow',
      obstacleCost: 0,
      cell,
    }));
    const s = foundVillage({
      seed: 5,
      day: DAY,
      dwellingPosition: HOME,
      firstField: { parts },
      obstacles: layer,
    });
    // políčko (3, 1) = svět x −75 … −60, z −105 … −90; humno celé uvnitř
    const position = at(-67.5, -97.5);
    const check = checkThreshingFloorPlacement(
      landscape,
      placementVillageOf(s, DAY),
      position,
      layer,
    );
    expect(check.takenLand).toEqual([{ cell: { x: 3, y: 1 }, areaM2: 80, cellAreaM2: CELL }]);
    const started = startThreshingFloor(s, DAY, position, layer, {
      obstacleCost: check.obstacleCost,
      takenLand: check.takenLand,
    });
    const part = started.parts.find((p) => p.cell?.x === 3 && p.cell.y === 1);
    expect(part?.areaM2).toBeCloseTo(CELL - 80, 9);
    const taken = started.chronicle.filter(
      (e): e is Extract<ChronicleEvent, { kind: 'land-taken' }> => e.kind === 'land-taken',
    );
    expect(taken.map((e) => e.by)).toEqual(['threshing-floor']);
  });

  it('zbytek jámy pod humnem zmizí (population.md – Po zániku)', () => {
    const ruined: VillageState = {
      ...village(),
      ruins: [{ id: 99, type: 'zemnice', position: at(-60, 30), day: DAY - 100 }],
    };
    const started = startThreshingFloor(ruined, DAY, at(-60, 30), layer);
    expect(withoutBuiltOverRuins(started, landscape).ruins).toBeUndefined();
    expect(withoutBuiltOverRuins(ruined, landscape).ruins).toHaveLength(1);
  });

  it('ves bez humna se dopočítá beze změny – humno nevznikne samo', () => {
    const later = advanceVillage(village(), DAY + 60, layer);
    expect(later.threshingFloors).toBeUndefined();
  });
});
