import type { Landscape } from '../landscape';
import { giveWayToRoads } from './land-taken';
import { fieldFrame, roadLand, type PartRoadLand, type RoadLandField } from './paths/road-land';
import type { GridGeometry } from './square-grid';
import type { VillageState } from './types';

// Cesta ubírá poli plochu (roads.md a fields.md – Cesta přes pole; Martin, 19. 10. 2026: „Ano má.
// Ono to stejně ve výsledku bude tak, že pokud oráč narazí na cestu, tak spřežení otočí. Nebude
// pak moci vzniknout takový růžek…“). Krok dne: když se od posledního výpočtu změnily pevné cesty
// (vznik a zarůstání 1. 11., vylepšení, zemská stezka) nebo čtverce polí (založení, sloučení,
// odebrání), díly dostanou plochu bez toho, co jim cesty berou (`roadLand`, `giveWayToRoads`).
// Jen s krajinou (bez ní nejsou cesty – kalibrace beze změny).

/** Pole vsi pro výpočet – díly se čtvercem po polích, rám podle mřížky pole. */
export function roadLandFields(
  state: Pick<VillageState, 'fields' | 'parts'>,
  geo: GridGeometry,
): RoadLandField[] {
  return state.fields.map((field) => ({
    frame: fieldFrame(geo, field.grid),
    squares: state.parts.flatMap((p) =>
      p.fieldId === field.id && p.cell ? [{ id: p.id, cell: p.cell }] : [],
    ),
  }));
}

/** Co pevné cesty berou dílům polí vsi (`roadLand` podle id dílu). */
export function villageRoadLand(
  state: Pick<VillageState, 'fields' | 'parts' | 'roads'>,
  geo: GridGeometry,
): Map<number, PartRoadLand> {
  return roadLand(roadLandFields(state, geo), state.roads?.roads ?? []);
}

/** FNV-1a nad celými čísly. */
function mix(hash: number, value: number): number {
  let h = hash;
  let v = value | 0;
  for (let k = 0; k < 4; k++) {
    h = Math.imul(h ^ (v & 0xff), 16777619);
    v >>>= 8;
  }
  return h;
}

/**
 * Otisk vstupů výpočtu – osy, stupně a vozové pevných cest, čtverce dílů po polích a mřížky polí
 * (levný – počítá se každý den).
 */
export function roadLandKey(state: Pick<VillageState, 'fields' | 'parts' | 'roads'>): number {
  let h = 2166136261;
  for (const road of state.roads?.roads ?? []) {
    h = mix(h, road.grade === 'trodden' ? 1 : road.grade === 'improved' ? 2 : 3);
    h = mix(h, road.cart ? 1 : 0);
    h = mix(h, road.points.length);
    for (const p of road.points) {
      h = mix(h, Math.round(p.x * 100));
      h = mix(h, Math.round(p.z * 100));
    }
  }
  h = mix(h, -1);
  for (const field of state.fields) {
    h = mix(h, field.id);
    if (field.grid) {
      h = mix(h, Math.round(field.grid.x * 1000));
      h = mix(h, Math.round(field.grid.z * 1000));
      h = mix(h, Math.round(field.grid.rotation * 1e6));
    }
  }
  h = mix(h, -2);
  for (const p of state.parts) {
    if (!p.cell) continue;
    h = mix(h, p.id);
    h = mix(h, p.fieldId);
    h = mix(h, p.cell.x);
    h = mix(h, p.cell.y);
  }
  return h >>> 0;
}

/** Nejvýš tolik přepočtů za den – odebraný díl změní tvar pole a tím i oddělené kousky. */
const MAX_ROUNDS = 4;

/**
 * Plocha dílů pod pevnými cestami (mutuje stav): jen když se změnil otisk cest a polí
 * (`roadLandKey`). Ves bez cest a bez dílů pod cestou se nemění (ani otisk se neukládá).
 */
export function roadFieldsDay(state: VillageState, day: number, landscape: Landscape): void {
  const hasRoads = (state.roads?.roads.length ?? 0) > 0;
  if (!hasRoads && !state.parts.some((p) => p.roadM2 !== undefined)) return;
  const cellAreaM2 = landscape.cellSizeM * landscape.cellSizeM;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (state.roadLandKey === roadLandKey(state)) return;
    const parts = state.parts.length;
    giveWayToRoads(state, day, villageRoadLand(state, landscape), cellAreaM2);
    // díl zmizel – tvar pole se změnil, oddělené kousky se spočítají znovu
    if (state.parts.length === parts) break;
  }
  state.roadLandKey = roadLandKey(state);
}
