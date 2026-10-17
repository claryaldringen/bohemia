import type { DwellingType, PartStage } from '@bohemia/game';
import type { VillageTarget } from './scene/village-picking';
import type { SceneVillage, VillageView } from './village-view';

// Co ukáže panel výběru (dole uprostřed, jako v 0 A.D.) o vybraném obydlí, poli, hřbitovu nebo
// sadu.
// Čistý modul – data z pohledu na ves a scény vsi.

export type SelectionDetails =
  | {
      kind: 'dwelling';
      id: number;
      type: DwellingType;
      occupants: number;
      capacity: number;
      /** Věk obyvatel v letech, od nejstaršího. */
      ages: number[];
      condition: number;
      ageYears: number;
      full: boolean;
      overcrowded: boolean;
      /** Obyvatelé obydlí přestavují (průběh 0–1 a nový typ), jinak null. */
      rebuild: { progress: number; type: DwellingType } | null;
    }
  | { kind: 'site'; id: number; type: DwellingType; progress: number }
  | {
      kind: 'field';
      id: number;
      areaM2: number;
      fertility: number;
      /** Díly podle stadia v pořadí PART_STAGE_ORDER (jen nenulová). */
      stages: { stage: PartStage; count: number }[];
      /** Zakládání pole (průběh 0–1), hotové null. */
      founding: number | null;
    }
  | {
      kind: 'cemetery';
      id: number;
      squares: number;
      capacity: number;
      graves: number;
      freeGraves: number;
      /** Odhad, za kolik let se zaplní; bez úmrtí null. Hygienu hráč nevidí (cemetery.md). */
      yearsLeft: number | null;
      /** Vytyčený a ohrazený – nehotový ukáže jen průběh založení. */
      built: boolean;
      /** Stavba – založení, u hotového rozšíření (průběh 0–1); bez stavby null. */
      building: number | null;
    }
  | {
      kind: 'orchard';
      id: number;
      areaM2: number;
      /** Stáří v celých letech od výsadby; nevysazený null. */
      ageYears: number | null;
      /** Úroda nejbližší sklizně (kg jablek). */
      expectedYieldKg: number;
      /** Výsadba (průběh 0–1); vysazený sad null. */
      planting: number | null;
    };

/** Pořadí stadií dílů v panelu pole – od zakládání po zarůstání. */
export const PART_STAGE_ORDER: readonly PartStage[] = [
  'founding',
  'ready',
  'sown',
  'young-fallow',
  'meadow',
  'young-growth',
  'shrub',
  'forest',
];

export const PART_STAGE_NAMES: Record<PartStage, string> = {
  founding: 'Zakládá se',
  ready: 'Připraveno k osevu',
  sown: 'Oseto',
  'young-fallow': 'Mladý příloh',
  meadow: 'Příloh – louka',
  'young-growth': 'Příloh – nálet',
  shrub: 'Příloh – křoviny',
  forest: 'Příloh – les',
};

/** Údaje o vybraném cíli, nebo null (nic nevybráno, cíl zanikl, ves ještě není). */
export function selectionDetails(
  view: VillageView | null,
  scene: SceneVillage,
  target: VillageTarget | null,
): SelectionDetails | null {
  if (!target) return null;
  if (target.kind === 'dwelling') {
    const dwelling = scene.dwellings.find((d) => d.id === target.id);
    if (!dwelling) return null;
    if (!dwelling.built) {
      return { kind: 'site', id: dwelling.id, type: dwelling.type, progress: dwelling.progress };
    }
    const household = view?.households.find((h) => h.dwellingId === target.id);
    if (!household) return null;
    const rebuild = view?.constructions.find(
      (c) => c.kind === 'rebuild' && c.dwellingId === target.id,
    );
    return {
      kind: 'dwelling',
      id: household.dwellingId,
      type: household.type,
      occupants: household.occupants,
      capacity: household.capacity,
      ages: household.ages,
      condition: household.condition,
      ageYears: household.ageYears,
      full: household.full,
      overcrowded: household.overcrowded,
      rebuild: rebuild
        ? { progress: rebuild.progress, type: rebuild.dwellingType ?? household.type }
        : null,
    };
  }
  if (target.kind === 'cemetery') {
    const cemetery = view?.cemeteries.find((c) => c.id === target.id);
    if (!cemetery) return null;
    return {
      kind: 'cemetery',
      id: cemetery.id,
      squares: cemetery.squares,
      capacity: cemetery.capacity,
      graves: cemetery.graves,
      freeGraves: cemetery.freeGraves,
      yearsLeft: cemetery.yearsLeft,
      built: cemetery.built,
      building: cemetery.built && cemetery.progress >= 1 ? null : cemetery.progress,
    };
  }
  if (target.kind === 'orchard') {
    const orchard = view?.orchards.find((o) => o.id === target.id);
    if (!orchard) return null;
    return {
      kind: 'orchard',
      id: orchard.id,
      areaM2: orchard.areaM2,
      ageYears: orchard.ageYears,
      expectedYieldKg: orchard.expectedYieldKg,
      planting: orchard.planting,
    };
  }
  const field = view?.fields.find((f) => f.id === target.id);
  if (!field) return null;
  const founding = view?.constructions.find((c) => c.kind === 'field' && c.fieldId === target.id);
  return {
    kind: 'field',
    id: field.id,
    areaM2: field.areaM2,
    fertility: field.fertility,
    stages: PART_STAGE_ORDER.flatMap((stage) => {
      const count = field.stages[stage] ?? 0;
      return count > 0 ? [{ stage, count }] : [];
    }),
    founding: founding ? founding.progress : null,
  };
}
