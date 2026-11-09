import { CELL_SIZE_M, LANDSCAPE_SIZE } from '../landscape';
import { isLineMan } from '../village/dynasty';
import { refugeCapacity } from '../village/fortification/refuge';
import type { Fortification } from '../village/fortification/types';
import { fortOutlineOf } from '../village/fortification/convert';
import { isUnshod } from '../village/horse-shoeing-term';
import { isGrainHorse, villageHorses } from '../village/horses';
import { isTrained, oxenHome } from '../village/oxen';
import { ageYears, isAway, isInjured } from '../village/people';
import { DRAFT_OXEN } from '../village/rules';
import type { GridGeometry } from '../village/square-grid';
import type {
  Cart,
  DefenseStance,
  FlightMode,
  HerdSpecies,
  Person,
  RefugeePerson,
  VillageState,
} from '../village/types';
import type { GridCell } from '../village/world-grid';
import type { CampaignPlace } from './campaign-types';
import { fleeParty, nearestForest } from './flight';
import { marchSpeed, type GroupPace } from './march';
import type { MarchGrid, Pos } from './march-grid';
import { WAR } from './rules-war';
import { TICKS_PER_SECOND } from './ticks';
import { worldRoute } from './world-route';

// Hradiště, odhady času a volba správce při varování (war.md – Varování, poslové a útěk do
// hradiště; plán 2026-11-09 – Úloha 4, Otevřené 1, 2, 4, 6, 7). Čistá doména bez tažení: co ves
// zvolit může a proč ne, kam utéct, s čím a jak dlouho to potrvá. Obránce zná jen místo, kde
// vojsko viděli, ne jeho trasu (mlha války) – odhady jsou vzdušnou čarou. Jen det-math.

/** Strana mapy (m) – políčko mřížky světa. */
const MAP_M = LANDSCAPE_SIZE * CELL_SIZE_M;
/** Střed okrajové buňky mřížky pochodu od středu mapy (m) – tam skupina mapu opouští. */
const EDGE_M = MAP_M / 2 - WAR.march.cellM / 2;
const EPS = 1e-9;
const SPECIES: readonly HerdSpecies[] = ['sheep', 'goat', 'pig', 'cow'];

/** Hradiště pro útěk – ves s hotovým opevněním s plochou (útočiště). */
export interface RefugeHost {
  villageId: string;
  cell: GridCell;
  /** Střed útočiště na mapě hradiště (m) – cíl skupiny uprchlíků. */
  center: Pos;
  /** Plocha útočiště (m²). */
  capacityM2: number;
}

/**
 * Je opevnění hotové ke dni `day` – na každém úseku stojí dostavěný val nebo hradba (návrh Clauda;
 * průlom, zboření ani chátrání hradiště neruší – útočiště uvnitř zůstává)?
 */
function fortFinished(fort: Fortification, day: number): boolean {
  if (fort.segments.length === 0) return false;
  return fort.segments.every(
    (s) =>
      (s.builtDay !== null && s.builtDay <= day) ||
      (s.topBuiltDay !== undefined && s.topBuiltDay !== null && s.topBuiltDay <= day),
  );
}

/**
 * Kandidát `villageId` (stav `state`, mapa `geo` na políčku `cell`) je hradiště, má-li hotové
 * opevnění s plochou (Otevřené 1): útočiště = největší takové opevnění vsi (shoda – menší id),
 * střed = těžiště jeho obvodu. Jinak null.
 */
export function refugeHostOf(
  villageId: string,
  state: Pick<VillageState, 'fortifications'>,
  geo: GridGeometry,
  cell: GridCell,
  day: number,
): RefugeHost | null {
  let best: { fort: Fortification; capacity: number } | null = null;
  for (const fort of state.fortifications ?? []) {
    if (!fortFinished(fort, day)) continue;
    const capacity = refugeCapacity(geo, fort);
    if (capacity <= EPS) continue;
    if (
      !best ||
      capacity > best.capacity + EPS ||
      (Math.abs(capacity - best.capacity) <= EPS && fort.id < best.fort.id)
    ) {
      best = { fort, capacity };
    }
  }
  if (!best) return null;
  const outline = fortOutlineOf(geo, best.fort);
  if (!outline || outline.polyline.length === 0) return null;
  let x = 0;
  let z = 0;
  for (const [px, pz] of outline.polyline) {
    x += px;
    z += pz;
  }
  const n = outline.polyline.length;
  return {
    villageId,
    cell: { ...cell },
    center: { x: x / n, z: z / n },
    capacityM2: best.capacity,
  };
}

/** Kdo a co jde se skupinou uprchlíků (Otevřené 7) a jejím tempem. */
export interface FlightLoad {
  /** Všichni přítomní (id vzestupně). */
  people: RefugeePerson[];
  /** Zásoby, které nesou (kg obilí) – nejvýš zásoby vsi bez odloženého osiva a zapečetěných jam. */
  foodKg: number;
  herd: Record<HerdSpecies, number>;
  /** Vozy se spřežením (jen „se vším“). */
  carts: number;
  pace: GroupPace;
}

/** Vozy na výpravě nebo s platbou za kování – doma nejsou (jako `oxenAway`). */
function cartsAway(state: Pick<VillageState, 'trade' | 'dwellings'>): Set<number> {
  const away = new Set<number>();
  for (const e of state.trade?.expeditions ?? []) for (const id of e.carts ?? []) away.add(id);
  for (const d of state.dwellings) {
    const id = d.workshop?.ironTrip?.cartId;
    if (id !== undefined) away.add(id);
  }
  return away;
}

/**
 * Vozy se spřežením doma (návrh Clauda – vozy táhnou voli, wagons.md): vycvičení voli doma
 * (`oxenHome`) a vycvičení voli bez ohrady se rozdělí napřed na dvoukoláky (1 vůl), pak na
 * čtyřkoláky (2 voli), uvnitř podle id – co nejvíc vozů.
 */
export function teamedCarts(state: VillageState, day: number): Cart[] {
  let oxen =
    oxenHome(state, day) + (state.looseOxen ?? []).filter((ox) => isTrained(ox, day)).length;
  const away = cartsAway(state);
  const home = (state.carts ?? [])
    .filter((c) => !away.has(c.id))
    .sort((a, b) => DRAFT_OXEN[a.kind] - DRAFT_OXEN[b.kind] || a.id - b.id);
  const out: Cart[] = [];
  for (const cart of home) {
    if (oxen < DRAFT_OXEN[cart.kind]) continue;
    oxen -= DRAFT_OXEN[cart.kind];
    out.push(cart);
  }
  return out;
}

function noHerd(): Record<HerdSpecies, number> {
  return { sheep: 0, goat: 0, pig: 0, cow: 0 };
}

/**
 * Skupina uprchlíků vsi v den `day` podle volby (Otevřené 7): vždy všichni přítomní; „jen lidé“
 * bez zásob a dobytka; „Ukrýt v lese“ = `fleeParty` (dospělý 25 kg, dítě 10 kg, dobytek celý);
 * „se vším“ navíc každý vůz se spřežením `WAR.carryKg.cart`. Odložené osivo a zapečetěné jámy zůstávají ve vsi. Tempo:
 * pěší, ranění zpomalí; dobytek nebo vozy na tempo stáda (vůz se počítá jako kus stáda).
 */
export function flightLoad(state: VillageState, day: number, mode: FlightMode): FlightLoad {
  const present = state.people.filter((p) => !isAway(p, day)).sort((a, b) => a.id - b.id);
  const people: RefugeePerson[] = present.map((p) => ({
    id: p.id,
    bornDay: p.bornDay,
    man: p.sex === 'male' && ageYears(p.bornDay, day) >= WAR.army.minAge,
    line: isLineMan(p),
  }));
  const wounded = present.filter((p) => isInjured(p, day)).length;
  let foodKg = 0;
  let herd = noHerd();
  let carts = 0;
  if (mode !== 'people' && present.length > 0) {
    const party = fleeParty(state, day);
    carts = mode === 'all' ? teamedCarts(state, day).length : 0;
    const capacityKg =
      party.adults * WAR.flight.adultKg +
      party.children * WAR.flight.childKg +
      carts * WAR.carryKg.cart;
    // osivo a zapečetěné jámy zůstávají ve vsi (Otevřené 7 – `applyRefugeDepart` je neodečte)
    let sealedKg = 0;
    for (const pit of state.grainPits ?? []) if (pit.state === 'sealed') sealedKg += pit.grainKg;
    const availableKg = Math.max(0, state.storesKg - (state.reservedSeedKg ?? 0) - sealedKg);
    foodKg = Math.min(availableKg, capacityKg);
    herd = { ...party.livestock };
  }
  let heads = carts;
  for (const sp of SPECIES) heads += herd[sp];
  return {
    people,
    foodKg,
    herd,
    carts,
    pace: { onFoot: present.length - wounded, riders: 0, woundedOnFoot: wounded, herd: heads },
  };
}

/** Vzdálenost dvou míst na světě vzdušnou čarou (m) – políčko = mapa 1920 m. */
function worldDistanceM(a: CampaignPlace, b: CampaignPlace): number {
  const dx = (b.cell.x - a.cell.x) * MAP_M + (b.pos.x - a.pos.x);
  const dz = (b.cell.y - a.cell.y) * MAP_M + (b.pos.z - a.pos.z);
  return Math.sqrt(dx * dx + dz * dz);
}

/** Takty na `metres` rychlostí `speed` (m/s skutečného času), nahoru. */
function ticksFor(metres: number, speed: number): number {
  if (metres <= EPS) return 0;
  return Math.ceil((metres / speed) * TICKS_PER_SECOND - EPS);
}

/**
 * Odhad cesty skupiny z `from` do `to` (Otevřené 2): vzdušná čára × `WAR.alarm.routeFactor` ÷
 * tempo skupiny (`marchSpeed` – stádo, ranění, sníh), v taktech nahoru.
 */
export function flightEtaTicks(
  from: CampaignPlace,
  to: CampaignPlace,
  pace: GroupPace,
  day: number,
): number {
  return ticksFor(worldDistanceM(from, to) * WAR.alarm.routeFactor, marchSpeed(pace, day));
}

/**
 * Odhad, za jak dlouho skupina z bodu `from` mapy `home` opustí mapu směrem k sousednímu políčku
 * trasy `toward` (Otevřené 2): k nejbližšímu bodu okraje v tom směru (úhlopříčně do rohu) × 1,3 ÷
 * tempo. Políčko `toward` = `home` – mapu neopouští (0).
 */
export function leaveMapTicks(
  from: Pos,
  toward: GridCell,
  home: GridCell,
  pace: GroupPace,
  day: number,
): number {
  const sx = Math.sign(toward.x - home.x);
  const sy = Math.sign(toward.y - home.y);
  if (sx === 0 && sy === 0) return 0;
  const ex = sx !== 0 ? sx * EDGE_M : from.x;
  const ez = sy !== 0 ? sy * EDGE_M : from.z;
  const dx = ex - from.x;
  const dz = ez - from.z;
  return ticksFor(Math.sqrt(dx * dx + dz * dz) * WAR.alarm.routeFactor, marchSpeed(pace, day));
}

/** Tempo pěšího vojska v den `day` (sníh v zimě). */
function armySpeed(day: number): number {
  return marchSpeed({ onFoot: 1, riders: 0, woundedOnFoot: 0, herd: 0 }, day);
}

/**
 * Za jak dlouho vojsko dojde do vsi (Otevřené 2): vzdušná čára od místa, kde ho viděli, ÷ tempo
 * pěších vojska – bez násobku cesty (obránce počítá s nejhorším).
 */
export function armyEtaTicks(seenAt: CampaignPlace, village: CampaignPlace, day: number): number {
  return ticksFor(worldDistanceM(seenAt, village), armySpeed(day));
}

/**
 * Rychlost posla (m/s, Otevřené 4): běh `WAR.alarm.runFactor` × pěší tempo vojska, na koni navíc
 * × `WAR.pace.riders`; v zimě sníh jako vojsko.
 */
export function messengerSpeed(mounted: boolean, day: number): number {
  const pace = mounted
    ? { onFoot: 0, riders: 1, woundedOnFoot: 0, herd: 0 }
    : { onFoot: 1, riders: 0, woundedOnFoot: 0, herd: 0 };
  return marchSpeed(pace, day) * WAR.alarm.runFactor;
}

/** Posel vsi: kdo běží a zda jede na koni. */
export interface MessengerPick {
  personId: number;
  mounted: boolean;
}

/**
 * Jede muž rodu `p` na koni (Martin 9. 11. 2026: „Může vyslat někoho z rodu, kdo jezdit umí“)? Umí
 * jezdit a má jezdeckého koně = jeho kůň (`Horse.riderId` – pár jezdec–kůň drží jen cvičící muži
 * rodu; horses.md – Výcvik koně a jezdec) je jezdecký (samec od 3 let) a ves není po termínu kování
 * (`isUnshod` – nepodkutí koně nejezdí).
 */
function ridesOwnHorse(state: VillageState, p: Person, day: number): boolean {
  if (!isLineMan(p) || isUnshod(state, day)) return false;
  const horses = [...villageHorses(state), ...(state.looseHorses ?? [])];
  return horses.some((h) => h.riderId === p.id && isGrainHorse(h, day));
}

/**
 * Posel vsi (Otevřené 4; Martin 9. 11. 2026: „Posel jde pěšky“, „Kdo je poslem, volí hráč“).
 * `personId` = muž, kterého vybral hráč: zdravý přítomný muž od 16 let – vesničan nejvýš 44 let
 * jde pěšky, muž rodu jede na svém jezdeckém koni, umí-li jezdit (`ridesOwnHorse`), jinak pěšky;
 * jiný null. Bez volby (i za správce) nejmladší zdravý přítomný vesničan 16–44 let pěšky (návrh
 * Clauda – „nejzdatnější“ = nejmladší, shoda – menší id); bez takového nejmladší zdravý muž rodu
 * (návrh Clauda – nikdo jiný běžet nemůže; jede, umí-li); bez mužů null.
 */
export function messengerOf(
  state: VillageState,
  day: number,
  personId?: number,
): MessengerPick | null {
  const able = (p: Person): boolean =>
    p.sex === 'male' &&
    !isAway(p, day) &&
    !isInjured(p, day) &&
    ageYears(p.bornDay, day) >= WAR.army.minAge;
  const villager = (p: Person): boolean =>
    able(p) && !isLineMan(p) && ageYears(p.bornDay, day) <= WAR.army.villagerMaxAge;
  const pick = (p: Person): MessengerPick => ({
    personId: p.id,
    mounted: ridesOwnHorse(state, p, day),
  });
  if (personId !== undefined) {
    const p = state.people.find((x) => x.id === personId);
    if (!p || !(villager(p) || (able(p) && isLineMan(p)))) return null;
    return pick(p);
  }
  const youngest = (list: Person[]): Person | undefined =>
    [...list].sort((a, b) => b.bornDay - a.bornDay || a.id - b.id)[0];
  const runner =
    youngest(state.people.filter(villager)) ??
    youngest(state.people.filter((p) => able(p) && isLineMan(p)));
  return runner ? pick(runner) : null;
}

/** Proč volba nejde (texty – rozhraní, plán Ú12). */
export type AlarmBlock = 'no-hillfort' | 'too-late' | 'no-forest' | 'no-runner' | 'gone' | 'sent';

/** Jedna volba při varování: zda jde a odhady (takty). */
export interface AlarmOption {
  blocked: AlarmBlock | null;
  /** Za jak dlouho dojdou do cíle (hradiště, les) / posel do hradiště. */
  etaTicks?: number;
  /** Za jak dlouho skupina opustí mapu vsi (jen útěk do hradiště). */
  leaveTicks?: number;
  /** Za jak dlouho tu bude vojsko – od teď (0 = už je tu). */
  armyEtaTicks?: number;
}

export interface RefugeOptionsInput {
  /** Stav vsi v den rozhodnutí – bez lidí, zásob a dobytka, které tažení dnes už odvedlo. */
  state: VillageState;
  day: number;
  /** Ves na světě – políčko a střed vsi na mapě (m). */
  village: CampaignPlace;
  /** Mřížka pochodu mapy vsi (les pro „Ukrýt v lese“). */
  grid: MarchGrid;
  /** Kde vojsko viděli (`AlarmVillage.seenAt`). */
  seenAt: CampaignPlace;
  /** Kolik taktů uplynulo od spatření (teď − `seenTick`). */
  sinceSeenTicks: number;
  /** Kandidáti hradišť (`refugeHostOf`; pořadí nerozhoduje). */
  hosts: readonly RefugeHost[];
  /** Posel vsi už vyběhl. */
  messengerSent?: boolean;
  /** Posel, kterého vybral hráč (`messengerOf`); chybí – výchozí vesničan pěšky. */
  messengerId?: number;
  /** Lidé vsi už odešli skupinou tohoto tažení. */
  fled?: boolean;
}

export type RefugeOptions = Record<'messenger' | FlightMode, AlarmOption> & {
  /** Hradiště, kam by šli (a kam běží posel); null – pán hradiště nemá. */
  host: RefugeHost | null;
  /** Trasa po světě z políčka vsi do hradiště (včetně obou); bez hradiště []. */
  route: GridCell[];
};

/** Trasa uprchlíků a posla do hradiště po mřížce světa (stejná jako v tažení – `worldRoute`). */
export function refugeRoute(from: GridCell, to: GridCell): GridCell[] {
  return worldRoute(from, to, () => false);
}

const sameCell = (a: GridCell, b: GridCell): boolean => a.x === b.x && a.y === b.y;

/**
 * Co ves při varování může (plán – Úloha 4): hradiště = kandidát do `WAR.alarm.refugeMaxCells`
 * políček s plochou a nejkratším odhadem cesty, shoda – menší id (Otevřené 1). Útěk do hradiště
 * „stihnou“, když skupina opustí mapu dřív, než vojsko dojde do vsi, a trasa nevede přes políčko,
 * kde vojsko viděli (Otevřené 2). Les blokuje mapa bez lesa; posla už běžící posel, chybějící
 * hradiště a ves bez muže; všechny útěky ves, jejíž lidé už odešli.
 */
export function refugeOptions(input: RefugeOptionsInput): RefugeOptions {
  const { state, day, village, seenAt } = input;
  const peopleLoad = flightLoad(state, day, 'people');
  let host: RefugeHost | null = null;
  let hostEta = Infinity;
  for (const h of input.hosts) {
    const cells = Math.max(
      Math.abs(h.cell.x - village.cell.x),
      Math.abs(h.cell.y - village.cell.y),
    );
    if (cells > WAR.alarm.refugeMaxCells || h.capacityM2 <= EPS) continue;
    const eta = flightEtaTicks(village, { cell: h.cell, pos: h.center }, peopleLoad.pace, day);
    if (eta < hostEta || (eta === hostEta && host !== null && h.villageId < host.villageId)) {
      host = h;
      hostEta = eta;
    }
  }
  const route = host ? refugeRoute(village.cell, host.cell) : [];
  const armyEta = Math.max(0, armyEtaTicks(seenAt, village, day) - input.sinceSeenTicks);
  const throughArmy = route.slice(1).some((c) => sameCell(c, seenAt.cell));
  const gone = input.fled === true || state.refuge !== undefined || peopleLoad.people.length === 0;

  const toHost = (mode: 'people' | 'all'): AlarmOption => {
    if (gone) return { blocked: 'gone' };
    if (!host) return { blocked: 'no-hillfort' };
    const pace = flightLoad(state, day, mode).pace;
    const etaTicks = flightEtaTicks(village, { cell: host.cell, pos: host.center }, pace, day);
    const next = route[1] ?? village.cell;
    const leaveTicks = leaveMapTicks(village.pos, next, village.cell, pace, day);
    const late = throughArmy || leaveTicks >= armyEta;
    return { blocked: late ? 'too-late' : null, etaTicks, leaveTicks, armyEtaTicks: armyEta };
  };

  let forest: AlarmOption;
  if (gone) forest = { blocked: 'gone' };
  else {
    const spot = nearestForest(input.grid, village.pos);
    if (!spot) forest = { blocked: 'no-forest' };
    else {
      const pace = flightLoad(state, day, 'forest').pace;
      const etaTicks = flightEtaTicks(village, { cell: village.cell, pos: spot }, pace, day);
      forest = { blocked: null, etaTicks, armyEtaTicks: armyEta };
    }
  }

  let messenger: AlarmOption;
  const runner = messengerOf(state, day, input.messengerId);
  if (input.messengerSent === true) messenger = { blocked: 'sent' };
  else if (!host) messenger = { blocked: 'no-hillfort' };
  else if (!runner) messenger = { blocked: 'no-runner' };
  else {
    const metres =
      worldDistanceM(village, { cell: host.cell, pos: host.center }) * WAR.alarm.routeFactor;
    messenger = {
      blocked: null,
      etaTicks: ticksFor(metres, messengerSpeed(runner.mounted, day)),
      armyEtaTicks: armyEta,
    };
  }

  return { messenger, forest, people: toHost('people'), all: toHost('all'), host, route };
}

/**
 * Volba správce a NPC (Otevřené 6; war.md – Správce za nepřítomného hráče): posel vždy, jde-li;
 * útěk jen s postojem „raději utéct“ a bez vlastního útočiště – „se vším“, stihnou-li to, jinak
 * „jen lidé“, jinak les; bez lesa nic (platí postoj při boji). `defend` / `surrender` je hráčova
 * volba dopředu a platí.
 */
export function stewardAlarmChoice(
  options: Pick<RefugeOptions, 'messenger' | FlightMode>,
  stance: DefenseStance,
  ownRefuge: boolean,
): { messenger: boolean; flee: FlightMode | null } {
  const messenger = options.messenger.blocked === null;
  if (stance !== 'flee' || ownRefuge) return { messenger, flee: null };
  const order: readonly FlightMode[] = ['all', 'people', 'forest'];
  const flee = order.find((mode) => options[mode].blocked === null) ?? null;
  return { messenger, flee };
}
