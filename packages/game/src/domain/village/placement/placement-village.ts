// Ves pro kontrolu umístění na serveru (placementVillageOf) a pomocné funkce z ní.

import { type Landscape } from '../../landscape';
import { type Position, type VillageState } from '../types';
import { type Walk, roadWalk, walkGroundOf } from '../paths/walking';
import { ableTeams } from '../livestock/oxen';
import { craftCoverage } from '../crafts/crafts';
import { obstacleChangesAt } from '../core/obstacles';
import { reservedTrees } from '../forest/wood';
import { sacredBuildingPlots } from '../people/sacred';
import { rodBaptized } from '../people/faith';
import { villageCemeteries } from '../buildings/cemetery';
import { cemeteryMayGo } from '../people/desecration';
import { type PlacementVillage } from './placement-types';

/**
 * Ves pro kontrolu umístění na serveru – stav vsi se změnami překážek v den `day` a stromy
 * vyhrazenými stavbami.
 */
export function placementVillageOf(state: VillageState, day: number): PlacementVillage {
  return {
    ...state,
    obstacleChanges: obstacleChangesAt(state, day),
    reservedTrees: [...reservedTrees(state)],
    sacredBuildings: sacredBuildingPlots(state),
    toolCoverage: craftCoverage(state, day).tools,
    ploughTeam: ableTeams(state, day) > 0,
    walkRoads: state.roads?.roads ?? [],
    kilns: activeKilnPoints(state),
    // humna i rozestavěná (production-chains.md – Humno) – zabírají půdorys; obilné jámy kontrola
    // umístění nezná – hráč zavřenou jámu nevidí, stavba ji smí zabrat (Obilné jámy)
    ...(state.threshingFloors
      ? { threshingFloors: state.threshingFloors.map((f) => ({ position: f.position })) }
      : {}),
    // kostely i rozestavěné (churches.md – Stavba) – zabírají hřbitůvek
    ...churchPlots(state),
  };
}

/** Kostely a staveniště kostelů vsi pro kontrolu umístění; ves bez kostela nic. */
function churchPlots(state: VillageState): Pick<PlacementVillage, 'churches'> {
  const churches = [
    ...(state.churches ?? []).map((c) => ({ type: c.type, dims: c.dims, position: c.position })),
    ...state.constructions.flatMap((c) =>
      c.church && c.position && !(state.churches ?? []).some((k) => k.id === c.id)
        ? [{ type: c.church.type, dims: c.church.dims, position: c.position }]
        : [],
    ),
  ];
  return churches.length > 0 ? { churches } : {};
}

/**
 * Ves pro kontrolu umístění stavby nebo pole hráče (`applyBuildIntent` hráče): jako
 * `placementVillageOf`, ve vsi pokřtěného rodu navíc posvátná místa nebrání (`sacredFree` –
 * christianity.md, Co křest rodu umožní) a hřbitov, který smí zmizet (`cemeteryMayGo`), v ní není –
 * stavba nebo pole přes něj ho zaorá. Správce, vesničané a převody berou `placementVillageOf`.
 */
export function playerPlacementVillage(state: VillageState, day: number): PlacementVillage {
  const village = placementVillageOf(state, day);
  if (!rodBaptized(state)) return village;
  const cemeteries = villageCemeteries(state).filter((c) => !cemeteryMayGo(state, c, day));
  return { ...village, sacredFree: true, cemeteries };
}

/** Středy milířů uhlířů vsi (crafts.md – Milíř u skácených buků); milíř bez polohy se nepočítá. */
function activeKilnPoints(state: VillageState): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (const d of state.dwellings) {
    const w = d.workshop;
    if (w?.craft !== 'burner') continue;
    for (const k of [...(w.kilns ?? []), ...(w.kiln ? [w.kiln] : [])]) {
      if (k.site) out.push({ x: k.site.x, z: k.site.z });
    }
  }
  return out;
}

/**
 * Chůze ke stromům ke kácení po pevných cestách vsi s půdou krajiny (roads.md) – stejná na
 * serveru (`villageRoadWalk`) i u kurzoru v prohlížeči.
 */
export function placementWalk(landscape: Landscape, village: PlacementVillage | null): Walk {
  return roadWalk(village?.walkRoads ?? [], walkGroundOf(landscape));
}

/** Polohy obydlí vsi včetně rozestavěných – od nich se měří vzdálenost dílů pole. */
export function villageDwellingPositions(village: PlacementVillage | null): Position[] {
  if (village === null) return [];
  const built = village.dwellings.map((d) => d.position);
  const planned = village.constructions.flatMap((c) =>
    c.dwellingType !== null && c.position !== null ? [c.position] : [],
  );
  return [...built, ...planned];
}
