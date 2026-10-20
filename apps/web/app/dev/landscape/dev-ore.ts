// VÝVOJOVÝ NÁSTROJ – ukázka rudiště na /dev/landscape (bez databáze a simulace; crafts.md – Uhlí
// a ruda kováře). U vsi stojí kovárna a uhlíř, kus od něj vypálený milíř u skácených buků; rudiště je buňka mokřiny
// (PATH_WETLAND) nejblíž kovárně jako v jádru (`chooseOreSite`), kolem něj jámy v různém stáří –
// od čerstvé s vodou po skoro zarostlou. Pěšky: kovář se synem (15 let) kopou u jámy, syn
// (11 let) nosí uhlí od milíře a kovář rudu v koši. S vozem: hromada rudy u jámy, vůz se sedlákem
// pro ni jede z ohrady (kovář s ním), syn dál nosí uhlí.
import {
  cartObstacleMask,
  cartRoutes,
  groundSpots,
  nearestSpot,
  PATH_WATER_SPOT,
  PATH_WETLAND,
  pathTerrainOf,
  pathWindowFor,
  tileCenterWorld,
  tileOfWorldPoint,
  walkGroundOf,
  type Landscape,
  type ObstacleLayer,
  type PathVillage,
} from '@bohemia/game';
import {
  simplifiedRoute,
  type SceneCart,
  type SceneLabor,
  type SceneOrePit,
  type SceneOreSite,
  type SceneVillage,
} from '@/lib/village-view';

/** Ukázka rudiště: pěšky, nebo s vozem. */
export type OreDemoStage = 'foot' | 'cart';
export const ORE_DEMO_STAGES: Record<OreDemoStage, string> = { foot: 'pěšky', cart: 'vůz' };

export interface OreDemo {
  stage: OreDemoStage;
  dwellings: SceneVillage['dwellings'];
  pens: NonNullable<SceneVillage['pens']>;
  oreSites: SceneOreSite[];
  orePits: SceneOrePit[];
  carts: SceneCart[];
  /** Vypálený milíř uhlíře – samostatná stavba (crafts.md – Milíř u skácených buků). */
  kilns: NonNullable<SceneVillage['kilns']>;
  labor: SceneLabor;
  focus: { x: number; z: number };
}

/** Rudiště nejvýš tak daleko od kovárny (m) – dál ukázka nedává smysl. */
const MAX_SITE_M = 420;
/** Jámy ukázky: stáří (zarůstání 0–1) a kolik rudy z nich vzešlo (kg). */
const PITS: readonly (readonly [number, number])[] = [
  [0, 60],
  [0.05, 30],
  [0.15, 120],
  [0.3, 400],
  [0.45, 200],
  [0.6, 90],
  [0.75, 300],
  [0.9, 150],
];

/**
 * Ukázka rudiště u vsi (`ids` – id kovárny, uhlíře, ohrady a vozu); bez mokřiny i vody do
 * MAX_SITE_M od kovárny null.
 */
export function demoOre(
  l: Landscape,
  layer: ObstacleLayer,
  stage: OreDemoStage,
  ids: { smith: number; burner: number; pen: number; cart: number },
): OreDemo | null {
  const center = tileCenterWorld(l, l.villageSite.x, l.villageSite.y);
  const smithAt = { x: center.x + 12, z: center.z - 14 };
  const ground = walkGroundOf(l);
  const site =
    nearestSpot(groundSpots(ground, PATH_WETLAND), smithAt) ??
    nearestSpot(groundSpots(ground, PATH_WATER_SPOT), smithAt);
  if (!site || Math.hypot(site.x - smithAt.x, site.z - smithAt.z) > MAX_SITE_M) return null;
  const toSite = Math.atan2(site.x - smithAt.x, site.z - smithAt.z);
  const burnerAt = { x: smithAt.x - 34, z: smithAt.z + 6, rotation: 0.4 };
  // milíř u skácených buků ≈ 25 m za zemnicí uhlíře (crafts.md – Milíř u skácených buků)
  const kx = burnerAt.x - 20;
  const kz = burnerAt.z + 15;
  const kilns: OreDemo['kilns'] = [
    {
      id: ids.burner + 1,
      burnerId: ids.burner,
      x: kx,
      z: kz,
      stage: 'draw',
      progress: 0.4,
      charcoal: 0.6,
    },
  ];
  const dwellings: SceneVillage['dwellings'] = [
    {
      id: ids.smith,
      type: 'polozemnice',
      position: { ...smithAt, rotation: toSite },
      built: true,
      progress: 1,
      inhabited: true,
      craft: 'smith',
      working: true,
    },
    {
      id: ids.burner,
      type: 'zemnice',
      position: burnerAt,
      built: true,
      progress: 1,
      inhabited: true,
      craft: 'burner',
    },
  ];
  const penAt = { x: smithAt.x - 6, z: smithAt.z - 28 };
  const penCell = tileOfWorldPoint(l, penAt.x, penAt.z) ?? l.villageSite;
  const penCenter = tileCenterWorld(l, penCell.x, penCell.y);
  const pens: OreDemo['pens'] =
    stage === 'cart'
      ? [
          {
            id: ids.pen,
            cell: penCell,
            x: penCenter.x,
            z: penCenter.z,
            size: l.cellSizeM,
            built: true,
            progress: 1,
            oxen: 2,
            trainees: 0,
            cows: 0,
          },
        ]
      : [];
  const orePits = PITS.map(([overgrowth, kg], k): SceneOrePit => {
    const a = k * 2.4 + 0.5;
    const r = k === 0 ? 2.2 : 2.6 + k * 0.55;
    return {
      x: Math.round((site.x + Math.cos(a) * r) * 100) / 100,
      z: Math.round((site.z + Math.sin(a) * r) * 100) / 100,
      kg,
      overgrowth,
    };
  });
  const oreSites: SceneOreSite[] = [
    {
      dwellingId: ids.smith,
      x: site.x,
      z: site.z,
      heapKg: stage === 'cart' ? 400 : 35,
      digging: stage === 'foot',
    },
  ];
  const oreTarget = { kind: 'ore' as const, id: ids.smith, x: site.x, z: site.z };
  const kilnTarget = {
    kind: 'kiln' as const,
    id: ids.burner,
    kiln: ids.burner + 1,
    x: kx,
    z: kz,
    from: ids.smith,
  };
  const shares: SceneLabor['shares'] = [
    // syn 11 let nosí uhlí od milíře (pěšky i s vozem – vůz dnes jede pro rudu)
    { activity: 'fetch', target: kilnTarget, manDays: 0.25, ages: [11] },
    {
      activity: 'craft',
      target: { kind: 'kiln', id: ids.burner, kiln: ids.burner + 1, x: kx, z: kz },
      manDays: 1.2,
    },
    { activity: 'craft', target: { kind: 'dwelling', id: ids.smith }, manDays: 0.6 },
  ];
  const carts: SceneCart[] = [];
  if (stage === 'foot') {
    shares.push(
      { activity: 'ore', target: oreTarget, manDays: 1.4, ages: [36, 15] },
      { activity: 'fetch', target: oreTarget, manDays: 0.15, ages: [36] },
    );
  } else {
    const route = demoCartRoute(l, layer, dwellings, pens, site);
    shares.push(
      { activity: 'haul', target: oreTarget, manDays: 0.07, carts: 1, job: 'ore' },
      { activity: 'fetch', target: oreTarget, manDays: 0.07, ages: [36], carts: 1 },
    );
    carts.push({
      id: ids.cart,
      kind: 'two-wheel',
      x: penCenter.x,
      z: penCenter.z,
      condition: 1,
      job: { activity: 'haul', target: oreTarget, load: 'ore' },
      ...(route ? { route } : {}),
    });
  }
  return {
    stage,
    dwellings,
    pens,
    oreSites,
    orePits,
    carts,
    kilns,
    labor: {
      day: 0,
      month: 7,
      people: { children: 1, adults: 4, elders: 0 },
      shares,
    },
    focus: { x: (site.x + smithAt.x) / 2, z: (site.z + smithAt.z) / 2 },
  };
}

/** Trasa vozu z ohrady k rudišti vozovou sítí jádra (jako `oreCartDrive`); nedojede-li, null. */
function demoCartRoute(
  l: Landscape,
  layer: ObstacleLayer,
  dwellings: SceneVillage['dwellings'],
  pens: OreDemo['pens'],
  site: { x: number; z: number },
): { x: number; z: number }[] | null {
  const pen = pens[0];
  if (!pen) return null;
  const village: PathVillage = { dwellings, fields: [], pens };
  const margin = 120;
  const terrain = pathTerrainOf(
    l,
    pathWindowFor(l, {
      minX: Math.min(pen.x, site.x) - margin,
      minZ: Math.min(pen.z, site.z) - margin,
      maxX: Math.max(pen.x, site.x) + margin,
      maxZ: Math.max(pen.z, site.z) + margin,
    }),
  );
  const { routes } = cartRoutes({
    village,
    terrain,
    blocked: cartObstacleMask(terrain, layer),
    kind: 'two-wheel',
    depots: [{ x: pen.x, z: pen.z }],
    targets: [{ x: site.x, z: site.z, reachM: 12 }],
  });
  const route = routes[0];
  return route?.reached && route.points.length >= 2 ? simplifiedRoute(route.points) : null;
}
