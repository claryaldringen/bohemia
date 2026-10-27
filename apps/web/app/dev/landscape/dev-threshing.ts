// VÝVOJOVÝ NÁSTROJ – ukázka humna na /dev/landscape (bez databáze a simulace; production-chains.md
// – Humno, Obilné jámy): u vsi stojí humno na louce, vedle obilná jáma. Žně – na prvním poli vsi
// se žne a pěší nosiči nesou snopy na humno; výmlat – páry mlatců s holemi, prohazovači
// s lopatou, nosič slámy na stoh, zrno na humně; jámy – nosiči nesou zrno z humna do otevřené
// jámy, u hrdla se kope a pečetí. Vývojová ves začíná bez domů a polí – bez obydlí nejsou postavy
// (`planVillagers`) a bez pole žně, proto si ukázka v prázdné vsi přinese vlastní domy a pole.
import { surfaceAt, tileCenterWorld, tileOfWorldPoint, type Landscape } from '@bohemia/game';
import type { SceneGrainPit } from '@/lib/grain-pit-view';
import type { LaborShare, SceneLabor, SceneThreshingFloor, SceneVillage } from '@/lib/village-view';

export type ThreshingDemoStage = 'harvest' | 'thresh' | 'pits';
export const THRESHING_DEMO_STAGES: Record<ThreshingDemoStage, string> = {
  harvest: 'žně – snopy na humno',
  thresh: 'výmlat a prohazování',
  pits: 'zrno do jam',
};

/** Další krok ukázky: vypnuto → žně → výmlat → jámy → vypnuto. */
export function nextThreshingDemo(stage: ThreshingDemoStage | null): ThreshingDemoStage | null {
  if (stage === null) return 'harvest';
  if (stage === 'harvest') return 'thresh';
  if (stage === 'thresh') return 'pits';
  return null;
}

export interface ThreshingDemo {
  stage: ThreshingDemoStage;
  threshingFloors: SceneThreshingFloor[];
  grainPits: SceneGrainPit[];
  /** Pole, na kterém se žne (nebo je po žni strniště); null – ves pole nemá. */
  fieldId: number | null;
  labor: SceneLabor;
  /** Obydlí ukázky u místa vsi – jen když vývojová ves nemá žádné hotové (bez nich nejsou lidé). */
  dwellings: SceneVillage['dwellings'];
  /** Pole ukázky vedle humna – jen když vývojová ves žádné pole nemá. */
  fields: SceneVillage['fields'];
  focus: { x: number; z: number };
}

/** Humno nejvýš tolik políček od vsi (osm směrů, od nejbližšího). */
const MAX_TILES = 3;
/** Obydlí ukázky v prázdné vsi (lidé v nich – `withDemoPersons`, dev-labor.ts). */
const DEMO_HOUSES = 6;
const NEIGHBOURS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
] as const;

/**
 * Ukázka humna ve vsi `base` (pole a obydlí vývojové vsi). Humno na nejbližší louce u vsi, kde
 * nestojí dům ani pole; null, když taková louka není.
 */
export function demoThreshing(
  l: Landscape,
  base: Pick<SceneVillage, 'fields' | 'dwellings'>,
  stage: ThreshingDemoStage,
  ids: { floor: number; pit: number; field: number; dwelling: number },
): ThreshingDemo | null {
  const meadow = (x: number, z: number): boolean => {
    const tile = tileOfWorldPoint(l, x, z);
    return tile !== null && surfaceAt(l, tile.x, tile.y) === 'meadow';
  };
  const half = l.cellSizeM / 2;
  const taken = (x: number, z: number): boolean =>
    base.dwellings.some((d) => Math.hypot(d.position.x - x, d.position.z - z) < l.cellSizeM) ||
    base.fields.some((f) =>
      f.parts.some((p) => Math.abs(p.x - x) < half + 2 && Math.abs(p.z - z) < half + 2),
    );
  let at: { x: number; z: number } | null = null;
  let floorTile = l.villageSite;
  for (let r = 1; r <= MAX_TILES && !at; r++) {
    for (const [dx, dy] of NEIGHBOURS) {
      const tile = { x: l.villageSite.x + dx * r, y: l.villageSite.y + dy * r };
      const c = tileCenterWorld(l, tile.x, tile.y);
      const corners = [
        [-5, -6],
        [5, -6],
        [5, 6],
        [-5, 6],
        [0, 0],
      ].every(([ox, oz]) => meadow(c.x + ox!, c.z + oz!));
      if (corners && !taken(c.x, c.z)) {
        at = c;
        floorTile = tile;
        break;
      }
    }
  }
  if (!at) return null;
  const position = { x: at.x, z: at.z, rotation: 0 };
  // jáma kus před humnem (vstup je před předkem mlatu, +z), na louce
  const pitAt = [
    { x: at.x - 6, z: at.z + 11 },
    { x: at.x + 6, z: at.z + 11 },
    { x: at.x - 9, z: at.z },
  ].find((p) => meadow(p.x, p.z)) ?? { x: at.x - 6, z: at.z + 11 };
  // prázdná ves: domy na místě vsi (řada čelem k humnu), pole na louce vedle humna
  const site = tileCenterWorld(l, l.villageSite.x, l.villageSite.y);
  const toFloor = Math.atan2(at.x - site.x, at.z - site.z);
  const dwellings: SceneVillage['dwellings'] = base.dwellings.some((d) => d.built)
    ? []
    : Array.from({ length: DEMO_HOUSES }, (_, k) => {
        const side = (k - (DEMO_HOUSES - 1) / 2) * 7;
        return {
          id: ids.dwelling + k,
          type: 'polozemnice' as const,
          position: {
            x: site.x + Math.cos(toFloor) * side,
            z: site.z - Math.sin(toFloor) * side,
            rotation: toFloor,
          },
          built: true,
          progress: 1,
          inhabited: true,
        };
      });
  const own = base.fields.find((f) => f.parts.length > 0);
  const ownField = own ? null : demoField(l, floorTile, ids.field);
  const field = own ?? ownField;
  const floor: SceneThreshingFloor = {
    id: ids.floor,
    position,
    built: true,
    progress: 1,
    straw: stage === 'harvest' ? 0.3 : stage === 'thresh' ? 0.6 : 1,
    ...(stage === 'thresh' ? { threshing: true as const } : {}),
    ...(stage === 'harvest' ? {} : { grainKg: stage === 'thresh' ? 300 : 500 }),
  };
  // lidé jako v domech ukázky (`demoPersons` – v domě muž, žena a dvě děti, v každém druhém
  // starší): víc práce, než je lidí, by mlatce nechalo bez prohazovačů
  const homes = base.dwellings.filter((d) => d.built).length || dwellings.length;
  const people = { children: 2 * homes, adults: 2 * homes, elders: Math.ceil(homes / 2) };
  const shares: LaborShare[] = [];
  if (stage === 'harvest' && field) {
    const target = { kind: 'field', id: field.id } as const;
    shares.push(
      { activity: 'harvest', target, manDays: 3.6 },
      { activity: 'carry', target, manDays: 3 },
    );
  }
  if (stage === 'thresh') {
    shares.push({
      activity: 'thresh',
      target: { kind: 'threshing-floor', id: ids.floor },
      manDays: Math.min(12, people.adults + people.elders - 2),
    });
  }
  const grainPits: SceneGrainPit[] = [];
  if (stage === 'pits') {
    grainPits.push({ id: ids.pit, x: pitAt.x, z: pitAt.z, fill: 0.4 });
    shares.push({
      activity: 'grain-pit',
      target: { kind: 'grain-pit', id: ids.pit, x: pitAt.x, z: pitAt.z },
      manDays: 5,
    });
  }
  shares.push({ activity: 'domestic', target: { kind: 'village' }, manDays: 2 });
  return {
    stage,
    threshingFloors: [floor],
    grainPits,
    fieldId: field?.id ?? null,
    dwellings,
    fields: ownField ? [ownField] : [],
    labor: {
      day: 0,
      month: stage === 'pits' ? 9 : 8,
      people,
      shares,
    },
    focus: { x: at.x, z: at.z + 4 },
  };
}

/**
 * Pole ukázky ve vsi bez pole: dva sousední čtverce louky vedle humna (ne na místě vsi), zralé –
 * žně z něj udělají žeň a strniště (`withThreshingField`); null, když louka vedle není.
 */
function demoField(
  l: Landscape,
  floor: { x: number; y: number },
  id: number,
): SceneVillage['fields'][number] | null {
  const free = (x: number, y: number): boolean =>
    x >= 0 &&
    y >= 0 &&
    x < l.size &&
    y < l.size &&
    !(x === floor.x && y === floor.y) &&
    !(x === l.villageSite.x && y === l.villageSite.y) &&
    surfaceAt(l, x, y) === 'meadow';
  const square = (x: number, y: number): SceneVillage['fields'][number]['parts'][number] => {
    const c = tileCenterWorld(l, x, y);
    return { cell: { x, y }, x: c.x, z: c.z, size: l.cellSizeM, stage: 'sown', look: 'ripe' };
  };
  for (const [dx, dy] of NEIGHBOURS) {
    const a = { x: floor.x + dx, y: floor.y + dy };
    if (!free(a.x, a.y)) continue;
    const b = NEIGHBOURS.slice(0, 4)
      .map(([ex, ey]) => ({ x: a.x + ex, y: a.y + ey }))
      .find((c) => free(c.x, c.y));
    return { id, parts: b ? [square(a.x, a.y), square(b.x, b.y)] : [square(a.x, a.y)] };
  }
  return null;
}

/** Pole vsi s polem ukázky ve žni (žně) nebo po žni (strniště). */
export function withThreshingField(
  fields: SceneVillage['fields'],
  demo: ThreshingDemo,
): SceneVillage['fields'] {
  return fields.map((f) =>
    f.id !== demo.fieldId
      ? f
      : {
          ...f,
          parts: f.parts.map((p) =>
            demo.stage === 'harvest'
              ? { ...p, look: 'harvesting' as const, work: 0.5, before: 'ripe' as const }
              : { ...p, look: 'stubble' as const },
          ),
        },
  );
}

/** Vývojová ves s ukázkou humna (DevVillagePreview). */
export function withThreshingDemo(base: SceneVillage, demo: ThreshingDemo): SceneVillage {
  return {
    ...base,
    dwellings: [...base.dwellings, ...demo.dwellings],
    fields: withThreshingField([...base.fields, ...demo.fields], demo),
    threshingFloors: demo.threshingFloors,
    grainPits: demo.grainPits,
    labor: demo.labor,
  };
}

/**
 * Vývojová ves bez domů a pole ukázky `demo` – z ní se počítá další krok ukázky (jinak by další
 * krok vzal domy a pole ukázky za domy vsi a vlastní nepřinesl).
 */
export function withoutThreshingDemo(
  village: Pick<SceneVillage, 'fields' | 'dwellings'>,
  demo: ThreshingDemo | null,
): Pick<SceneVillage, 'fields' | 'dwellings'> {
  if (!demo) return village;
  const houses = new Set(demo.dwellings.map((d) => d.id));
  const fields = new Set(demo.fields.map((f) => f.id));
  return {
    dwellings: village.dwellings.filter((d) => !houses.has(d.id)),
    fields: village.fields.filter((f) => !fields.has(f.id)),
  };
}
