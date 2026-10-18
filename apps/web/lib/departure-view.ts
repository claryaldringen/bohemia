import {
  DIRECTIONS,
  builtTrail,
  dateOfDayIndex,
  directionBetween,
  edgeDistanceM,
  travelDays,
  villageCentre,
  type Direction8,
  type Landscape,
  type VillageState,
} from '@bohemia/game';
import type { SceneSacred, SceneVillage } from './village-view';

// Odchod do nové vsi v pohledu na ves (migration.md – fáze 3 a 4): cesta na novou mapu po
// směrech, vlastní vsi na sousedních mapách, lidé na cestě, opuštěná ves a stavby jiných vsí
// téže mapy pro scénu. Čistý modul – smí i do prohlížeče (typy).

/** Odchod na novou mapu ve směru – dny cesty, nebo proč tím směrem nejde. */
export interface LeaveDirection {
  direction: Direction8;
  /** Dny cesty ke kraji mapy (1–3, po hotové stezce 1). */
  days: number;
  /** Proč tím směrem nejde (vlastní ves tam už je…), nebo null. */
  blocked: string | null;
}

/** Odchod z vsi – kam to jde (na téže mapě vždy, na novou mapu po směrech). */
export interface VillageLeave {
  directions: LeaveDirection[];
}

/** Lidé na cestě na novou mapu – směr, den příjezdu a jestli už dorazili. */
export interface VillageJourneyView {
  direction: Direction8;
  arrivalDay: number;
  /** Dorazili – hráč umisťuje první zemnici. */
  arrived: boolean;
  /** Kolik herních dní ještě jdou (0 = dorazili). */
  daysLeft: number;
}

/** Opuštěná ves – herní rok založení a odchodu a kolik let žila (jako u vymřelé). */
export interface VillageAbandonment {
  foundedYear: number;
  abandonedYear: number;
  years: number;
}

/**
 * Stavby jiné vsi na téže mapě pro scénu (migration.md – Vsi na téže mapě): jen pohled – obydlí,
 * díly polí, hřbitovy, sady, ohrady, zbytky jam a modly se svatyněmi; v prohlížeči se jiná ves
 * nesimuluje.
 */
export type SceneNeighbour = Pick<SceneVillage, 'dwellings' | 'fields'> &
  Partial<Pick<SceneVillage, 'cemeteries' | 'orchards' | 'pens' | 'ruins'>> & {
    sacredBuildings?: SceneSacred['buildings'];
  };

/** Stavby jiné vsi ze scény té vsi – bez lidí, zvířat, práce a cest. */
export function neighbourScene(scene: SceneVillage): SceneNeighbour {
  return {
    dwellings: scene.dwellings,
    fields: scene.fields,
    ...(scene.cemeteries ? { cemeteries: scene.cemeteries } : {}),
    ...(scene.orchards ? { orchards: scene.orchards } : {}),
    ...(scene.pens ? { pens: scene.pens } : {}),
    ...(scene.ruins ? { ruins: scene.ruins } : {}),
    ...(scene.sacred?.buildings.length ? { sacredBuildings: scene.sacred.buildings } : {}),
  };
}

/** Políčko mřížky sídla (null = sídlo bez polohy). */
interface PlacedSettlement {
  id: string;
  isSeat: boolean;
  worldCell: { x: number; y: number } | null;
}

/**
 * Vlastní vsi na sousedních mapách sídla `settlementId` po směrech (jméno první vsi té mapy) –
 * tím směrem se neodchází a neobchoduje (vlastní ves nahradí souseda bez simulace – migration.md).
 */
export function ownMapsAround(
  settlements: readonly PlacedSettlement[],
  villages: readonly { settlementId: string; name: string }[],
  settlementId: string,
): Partial<Record<Direction8, string>> {
  const from = settlements.find((s) => s.id === settlementId);
  const cell = from?.worldCell ?? (from?.isSeat ? { x: 0, y: 0 } : null);
  if (!cell) return {};
  const around: Partial<Record<Direction8, string>> = {};
  for (const s of settlements) {
    if (s.id === settlementId || s.worldCell === null) continue;
    const direction = directionBetween(cell, s.worldCell);
    if (direction === null) continue;
    const village = villages.find((v) => v.settlementId === s.id);
    if (village) around[direction] = village.name;
  }
  return around;
}

/** Tím směrem leží vlastní ves – odejít ani obchodovat tam zatím nejde. */
export function ownVillageThere(name: string): string {
  return `Tím směrem leží tvoje ves ${name}.`;
}

/**
 * Odchod na novou mapu po směrech: dny cesty od dvorce ke kraji mapy (`travelDays`), tím směrem,
 * kde už leží vlastní ves, ne; mapa bez polohy v mřížce (jen nesídelní) nikam.
 */
export function leaveOptions(
  state: VillageState,
  landscape: Landscape,
  ownMaps: Partial<Record<Direction8, string>>,
  mapsBlocked: string | null,
): VillageLeave {
  const centre = villageCentre(state);
  return {
    directions: DIRECTIONS.map((direction) => {
      const own = ownMaps[direction];
      return {
        direction,
        days: travelDays(
          edgeDistanceM(landscape, centre, direction),
          builtTrail(state, direction) !== null,
        ),
        blocked: mapsBlocked ?? (own === undefined ? null : ownVillageThere(own)),
      };
    }),
  };
}

/** Lidé na cestě v den `day`; ves, která stojí, null. */
export function journeyView(state: VillageState, day: number): VillageJourneyView | null {
  const journey = state.journey;
  if (!journey) return null;
  const daysLeft = Math.max(0, journey.arrivalDay - day);
  return {
    direction: journey.direction,
    arrivalDay: journey.arrivalDay,
    arrived: daysLeft === 0,
    daysLeft,
  };
}

const DAYS_PER_YEAR = 365.25;

/** Opuštěná ves – roky založení a odchodu; žijící ves null. */
export function villageAbandonment(state: VillageState): VillageAbandonment | null {
  const since = state.abandonedDay;
  if (since === undefined) return null;
  return {
    foundedYear: dateOfDayIndex(state.foundedDay).year,
    abandonedYear: dateOfDayIndex(since).year,
    years: Math.floor((since - state.foundedDay) / DAYS_PER_YEAR),
  };
}
