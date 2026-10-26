// VÝVOJOVÝ NÁSTROJ – ukázka humna na /dev/landscape (bez databáze a simulace; production-chains.md
// – Humno, Obilné jámy): u vsi stojí humno na louce, vedle obilná jáma. Žně – na prvním poli vsi
// se žne a pěší nosiči nesou snopy na humno; výmlat – páry mlatců s holemi, prohazovači
// s lopatou, nosič slámy na stoh, zrno na humně; jámy – nosiči nesou zrno z humna do otevřené
// jámy, u hrdla se kope a pečetí.
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
  focus: { x: number; z: number };
}

/** Humno nejvýš tolik políček od vsi (osm směrů, od nejbližšího). */
const MAX_TILES = 3;

/**
 * Ukázka humna ve vsi `base` (pole a obydlí vývojové vsi). Humno na nejbližší louce u vsi, kde
 * nestojí dům ani pole; null, když taková louka není.
 */
export function demoThreshing(
  l: Landscape,
  base: Pick<SceneVillage, 'fields' | 'dwellings'>,
  stage: ThreshingDemoStage,
  ids: { floor: number; pit: number },
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
  for (let r = 1; r <= MAX_TILES && !at; r++) {
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ] as const) {
      const c = tileCenterWorld(l, l.villageSite.x + dx * r, l.villageSite.y + dy * r);
      const corners = [
        [-5, -6],
        [5, -6],
        [5, 6],
        [-5, 6],
        [0, 0],
      ].every(([ox, oz]) => meadow(c.x + ox!, c.z + oz!));
      if (corners && !taken(c.x, c.z)) {
        at = c;
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
  const field = base.fields.find((f) => f.parts.length > 0) ?? null;
  const floor: SceneThreshingFloor = {
    id: ids.floor,
    position,
    built: true,
    progress: 1,
    straw: stage === 'harvest' ? 0.3 : stage === 'thresh' ? 0.6 : 1,
    ...(stage === 'thresh' ? { threshing: true as const } : {}),
    ...(stage === 'harvest' ? {} : { grainKg: stage === 'thresh' ? 300 : 500 }),
  };
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
      manDays: 12,
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
    labor: {
      day: 0,
      month: stage === 'pits' ? 9 : 8,
      people: { children: 4, adults: 16, elders: 2 },
      shares,
    },
    focus: { x: at.x, z: at.z + 4 },
  };
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
