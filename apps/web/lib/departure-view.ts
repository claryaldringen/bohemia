import {
  DIRECTIONS,
  builtTrail,
  leavingCart,
  dateOfDayIndex,
  directionBetween,
  edgeDistanceM,
  lineMen,
  sonDeparturePreview,
  travelDays,
  villageCentre,
  type CartKind,
  type Direction8,
  type Landscape,
  type PendingDeparture,
  type VillageState,
} from '@bohemia/game';

// Odchod do nové vsi v pohledu na ves (migration.md – fáze 3 a 4): cesta na novou mapu po
// směrech, vlastní vsi na sousedních mapách, lidé na cestě, opuštěná ves. Čistý modul – smí i do prohlížeče (typy).

/** Odchod na novou mapu ve směru – dny cesty, nebo proč tím směrem nejde. */
export interface LeaveDirection {
  direction: Direction8;
  /** Dny cesty ke kraji mapy (1–3, po hotové stezce 1). */
  days: number;
  /** Proč tím směrem nejde (vlastní ves tam už je…), nebo null. */
  blocked: string | null;
}

/**
 * Odchod z vsi – kam to jde (na téže mapě vždy, na novou mapu po směrech) a jaký vůz s voly si
 * odcházející vezmou (migration.md – Vůz při odchodu): když odejde jen část vsi (`cart`), nebo
 * celá ves (`allCart`); bez vozu null.
 */
export interface VillageLeave {
  directions: LeaveDirection[];
  cart: CartKind | null;
  allCart: CartKind | null;
}

/**
 * Odchod mladšího syna po pohřbu (seniorate.md, bod 4): kolik dní zbývá na volbu směru, kdo a co
 * odejde (díl jako u odchodu syna – počty, obrys obydlí), směry a jména rodu pro panel jména.
 */
export interface PendingDepartureView {
  sonId: number;
  /** Kolik herních dní zbývá na volbu; potom vyrazí výprava sama. */
  daysLeft: number;
  /** Syn nemá jméno – panel jména před volbou směru. */
  needsName: boolean;
  /** Jména žijících mužů rodu (kostka nabízí jiná). */
  taken: string[];
  /** Obydlí k obrysu ve scéně. */
  dwellingIds: number[];
  people: number;
  foodKg: number;
  cart: CartKind | null;
  horse: boolean;
  directions: LeaveDirection[];
}

/**
 * Čekající odchod `pending` ve vsi `state` v den `day`; null, když syn ve vsi není nebo lhůta
 * uplynula (výprava vyráží sama). Díl počítá stejná funkce jako odchod (`sonDeparturePreview` s otcem).
 */
export function pendingDepartureView(
  state: VillageState,
  pending: PendingDeparture,
  day: number,
  leave: VillageLeave,
): PendingDepartureView | null {
  const daysLeft = pending.deadlineDay - day;
  const son = state.people.find((p) => p.id === pending.sonId);
  if (daysLeft <= 0 || !son || son.fatherId === undefined) return null;
  const preview = sonDeparturePreview(state, son.id, day, son.fatherId);
  if (!preview) return null;
  return {
    sonId: son.id,
    daysLeft,
    needsName: son.name === undefined,
    taken: lineMen(state).flatMap((p) => (p.name === undefined ? [] : [p.name])),
    dwellingIds: preview.outlineDwellingIds,
    people: preview.people,
    foodKg: preview.foodKg,
    cart: preview.cart,
    horse: preview.horse,
    directions: leave.directions,
  };
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
    cart: leavingCart(state, state.lastDay, false)?.cart.kind ?? null,
    allCart: leavingCart(state, state.lastDay, true)?.cart.kind ?? null,
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
