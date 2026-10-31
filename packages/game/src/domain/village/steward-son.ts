// Kroky 1 a 2 dne správce (steward.md – Rozhodovací pořadí, Jména synů a odchod syna): jména synů
// vojvody a odchod syna s dílem vsi do odchozí schránky, a příjezd vsi na cestě se správcem
// (steward.md – Kde správce běží). Novou ves ze schránky založí use-case
// `settleStewardDepartures` – doména nový záznam vsi udělat nemůže. Seed, jméno a cíl nové vsi se
// počítají deterministicky ze seedu vsi a dne – výsledek nezávisí na kouscích dopočtu.
import { dateOfDayIndex } from '../calendar';
import { tileCenterWorld, type Landscape, type ObstacleLayer } from '../landscape';
import { deriveSeed } from '../landscape/random';
import { craftCoverage } from './crafts';
import { flushWear } from './paths/wear';
import { settlersOf, edgeDistanceM, travelDays, villageCentre } from './departure';
import { currentLord, wivesOf } from './dynasty';
import { generatedLineName } from './dynasty-names';
import { averageRotationShare, fieldCapacity } from './field-capacity';
import { foundedState } from './founding';
import { suggestVillageName } from './names';
import { checkDwellingPlacement } from './placement-dwellings';
import { FIELD_LIMITS } from './rules-fields';
import { STEWARD } from './rules-steward';
import { departWithSon, leadingSons, sonShare } from './son-departure';
import { squareCenter } from './square-grid';
import {
  dwellingSiteValue,
  fieldCellValue,
  fieldCells,
  landValues,
  planCentre,
  takenTiles,
  villageTerritory,
} from './steward-land';
import { isStewardOn, pruneStewardBuilt } from './steward-state';
import { DIRECTIONS, builtTrail } from './trail';
import type {
  CraftCoverage,
  FieldPart,
  Person,
  Position,
  StewardDeparture,
  StewardDirection,
  VillageState,
} from './types';
import { freeVillageSite, villagePoints, type VillagePoint } from './villages-apart';
import { NEW_VILLAGE_MIN_DISTANCE_M } from './rules';

/**
 * Kroky 1 a 2 dne správce (mutuje stav): jména synů v každý den správce, odchod syna v den
 * `STEWARD.departureDate`. Jen zapnutý správce ve vsi s lidmi; odchod potřebuje krajinu a vrstvu
 * překážek (bez nich správce spí). Běží před ostatními kroky dne správce (`stewardDay`).
 */
export function stewardSonDay(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
): void {
  if (!isStewardOn(state) || state.people.length === 0) return;
  if (day % STEWARD.everyDays === 0) nameStewardSons(state, day);
  noteHunger(state);
  if (!isDepartureDate(day)) return;
  // jednou za rok (31. 8.) úklid značek zaniklých staveb
  pruneStewardBuilt(state);
  if (!landscape || !obstacles) return;
  stewardDeparture(state, day, landscape, obstacles);
  // rok hladu se počítá od jednoho dne odchodu k dalšímu; loňský zůstane na příští rok
  const steward = state.steward;
  if (!steward) return;
  if (steward.hungerPeak === undefined) delete steward.lastYearHunger;
  else steward.lastYearHunger = steward.hungerPeak;
  delete steward.hungerPeak;
}

/**
 * Nejvyšší nahromaděný hlad (`starvationDays`) od posledního dne odchodu (mutuje stav) – 31. 8.
 * je po žních a hlad z jara už mohl odeznít; zapisuje se jen, když roste.
 */
function noteHunger(state: VillageState): void {
  const hunger = state.starvationDays ?? 0;
  const steward = state.steward;
  if (steward && hunger > (steward.hungerPeak ?? 0)) steward.hungerPeak = hunger;
}

// --- 1. jména synů ---------------------------------------------------------------------

/**
 * Krok 1 (mutuje stav): syn vojvody bez jména – z doby před zapnutím správce – dostane vygenerované
 * jméno (`generatedLineName`, ze seedu vsi a dne; jméno, které nenosí žádný žijící muž rodu ve
 * vsi). Synové po pořadí id – druhý už vidí jméno prvního.
 */
export function nameStewardSons(state: VillageState, day: number): void {
  const lord = currentLord(state);
  if (!lord) return;
  const sons = state.people
    .filter((p) => p.sex === 'male' && p.line && p.fatherId === lord.id && p.name === undefined)
    .sort((a, b) => a.id - b.id);
  for (const son of sons) son.name = generatedLineName(state, day, son.id);
}

// --- 2. odchod syna --------------------------------------------------------------------

/**
 * Přelidnění (krok 2): lidí víc, než pole uživí podle dnešní půdy (`fieldCapacity`, zakládané díly
 * jako v oběhu – jako `fieldTarget`) × `STEWARD.crowdedShare`.
 */
export function stewardCrowded(state: VillageState, day: number, coverage: CraftCoverage): boolean {
  const parts = state.parts.map((p) =>
    p.state === 'founding' ? { ...p, state: 'fallow' as const } : p,
  );
  const capacity = fieldCapacity(
    { parts, people: state.people, fieldFood: state.fieldFood },
    day,
    coverage.pottery,
  );
  return state.people.length > (capacity?.people ?? 0) * STEWARD.crowdedShare;
}

/** Polohy obydlí a stavenišť vsi (m) – od nich se měří dosah pole. */
function housePoints(state: VillageState): VillagePoint[] {
  const points: VillagePoint[] = state.dwellings.map((d) => ({ x: d.position.x, z: d.position.z }));
  for (const c of state.constructions) {
    if (c.kind === 'dwelling' && c.position) points.push({ x: c.position.x, z: c.position.z });
  }
  return points;
}

/** Vzdálenost (m) bodu k nejbližšímu z `points` (bez bodů nekonečno). */
function nearestM(x: number, z: number, points: readonly VillagePoint[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const p of points) best = Math.min(best, (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z));
  return Math.sqrt(best);
}

/**
 * Je kam pole rozšířit (krok 2, Kdy není kam)? Na území vsi (`villageTerritory` – ne na území jiné
 * vsi) zbývá volné políčko (`takenTiles`) s úrodou, nejdál `FIELD_LIMITS.maxDistanceM` od
 * nejbližšího obydlí, jehož hodnota (`fieldCellValue` – kg čisté úrody na člověkoden založení
 * a polní práce, se záplavami, zvěří a počasím) je aspoň `STEWARD.minKgPerManDay`. Louka i les
 * (klučení) – napřed nová pole, až když není kam, odchod.
 */
export function stewardFieldRoom(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
): boolean {
  const houses = housePoints(state);
  if (houses.length === 0) return false;
  const cells = fieldCells(landscape, obstacles);
  const taken = takenTiles(state, day, landscape);
  const territory = villageTerritory(state, landscape);
  const size = landscape.size;
  for (let t = 0; t < size * size; t++) {
    if (territory[t] !== 1 || taken[t] || !(cells.kg[t]! > 0)) continue;
    const c = tileCenterWorld(landscape, t % size, Math.floor(t / size));
    const distanceM = nearestM(c.x, c.z, houses);
    if (distanceM > FIELD_LIMITS.maxDistanceM) continue;
    if (fieldCellValue(cells, t, distanceM) >= STEWARD.minKgPerManDay) return true;
  }
  return false;
}

/**
 * Kdo odejde (steward.md – Kdo odejde): ze synů, kteří smějí vést (`leadingSons` s `check.ok`),
 * nejstarší ženatý, jinak nejstarší způsobilý (i svobodný) – ženatý založí rod hned. Ves bez rodu
 * (`dynasty.lordId` null – jen testy a starší kalibrace) syna nemá. Nikdo – null (správce
 * počká, až syn dospěje – rozhodnutí na noc 30. → 31. 10. 2026, otázka 2).
 */
export function departingSon(state: VillageState, day: number): Person | null {
  const able = leadingSons(state, day)
    .filter((s) => s.check.ok)
    .map((s) => s.son);
  return able.find((son) => wivesOf(state, son).length > 0) ?? able[0] ?? null;
}

/** Body staveb všech vsí mapy (m): vlastní a ze snímku sousedů (`state.neighbours`). */
function mapPoints(state: VillageState, landscape: Landscape): VillagePoint[] {
  const points = villagePoints(state, (x, y, grid) => squareCenter(landscape, grid, { x, y }));
  const n = state.neighbours;
  if (!n) return points;
  for (const d of n.dwellings) points.push({ x: d.position.x, z: d.position.z });
  for (const b of n.sacredBuildings) points.push({ x: b.position.x, z: b.position.z });
  for (const f of n.threshingFloors ?? []) points.push({ x: f.position.x, z: f.position.z });
  for (const c of n.cells) points.push(tileCenterWorld(landscape, c.x, c.y));
  for (const s of n.squares ?? []) points.push(squareCenter(landscape, s.grid, s.cell));
  return points;
}

/**
 * Kolik lidí uživí budoucí území místa `site` (steward.md – Tady): volná políčka s úrodou nejdál
 * `FIELD_LIMITS.maxDistanceM` od místa, blíž jemu než středu kterékoli vsi mapy (`centres`),
 * s hodnotou aspoň `STEWARD.minKgPerManDay` – jako jedno pole v ustáleném oběhu (`fieldCapacity`
 * s lidmi mateřské vsi – stejná potřeba na člověka).
 */
function siteCapacity(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  site: VillagePoint,
  centres: readonly VillagePoint[],
  taken: Uint8Array,
  coverage: CraftCoverage,
): number {
  const cells = fieldCells(landscape, obstacles);
  const size = landscape.size;
  const reach = FIELD_LIMITS.maxDistanceM;
  const reachTiles = Math.ceil(reach / landscape.cellSizeM);
  const half = (size * landscape.cellSizeM) / 2;
  const sx = Math.floor((site.x + half) / landscape.cellSizeM);
  const sy = Math.floor((site.z + half) / landscape.cellSizeM);
  let count = 0;
  let fertility = 0;
  for (let y = Math.max(0, sy - reachTiles); y <= Math.min(size - 1, sy + reachTiles); y++) {
    for (let x = Math.max(0, sx - reachTiles); x <= Math.min(size - 1, sx + reachTiles); x++) {
      const t = y * size + x;
      if (taken[t] || !(cells.kg[t]! > 0)) continue;
      const c = tileCenterWorld(landscape, x, y);
      const own = (c.x - site.x) * (c.x - site.x) + (c.z - site.z) * (c.z - site.z);
      if (own > reach * reach) continue;
      if (centres.some((o) => (c.x - o.x) * (c.x - o.x) + (c.z - o.z) * (c.z - o.z) <= own)) {
        continue;
      }
      if (fieldCellValue(cells, t, Math.sqrt(own)) < STEWARD.minKgPerManDay) continue;
      count++;
      fertility += landscape.fertility[t]!;
    }
  }
  if (count === 0) return 0;
  const part: FieldPart = {
    id: -1,
    fieldId: -1,
    areaM2: count * landscape.cellSizeM * landscape.cellSizeM,
    distanceM: 0,
    naturalFertility: fertility / count,
    fertilityShare: averageRotationShare(),
    bonusUntilDay: null,
    state: 'fallow',
    sownYears: 0,
    fallowSinceDay: null,
    foundingCost: 0,
    foundingDone: 0,
    surface: 'meadow',
  };
  const capacity = fieldCapacity(
    { parts: [part], people: state.people, fieldFood: state.fieldFood },
    day,
    coverage.pottery,
  );
  return capacity?.people ?? 0;
}

/**
 * Místo první zemnice nové vsi na téže mapě (steward.md – Tady; návrh Clauda – upřesnění):
 * kandidáti na každém `STEWARD.hereStrideTiles`. políčku, nejméně `NEW_VILLAGE_MIN_DISTANCE_M` od
 * staveb všech vsí mapy, seřazení podle hodnoty domu (`dwellingSiteValue` – nižší cena je lepší,
 * při shodě index); prvních `STEWARD.hereTries` se ověří – první, jehož budoucí území uživí aspoň
 * `STEWARD.hereCapacity` × `people` lidí a kde zemnice projde kontrolou místa (les se nekluče).
 * Žádné – null (nová mapa).
 */
export function stewardHereSite(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  people: number,
  coverage: CraftCoverage,
): Position | null {
  const size = landscape.size;
  const points = mapPoints(state, landscape);
  const min2 = NEW_VILLAGE_MIN_DISTANCE_M * NEW_VILLAGE_MIN_DISTANCE_M;
  const values = landValues(landscape);
  const candidates: { tile: number; value: number }[] = [];
  const stride = STEWARD.hereStrideTiles;
  for (let y = 1; y < size - 1; y += stride) {
    for (let x = 1; x < size - 1; x += stride) {
      const tile = y * size + x;
      const value = dwellingSiteValue(landscape, values, tile, people);
      if (value === null) continue;
      const c = tileCenterWorld(landscape, x, y);
      if (points.some((p) => (p.x - c.x) * (p.x - c.x) + (p.z - c.z) * (p.z - c.z) < min2)) {
        continue;
      }
      candidates.push({ tile, value });
    }
  }
  candidates.sort((a, b) => a.value - b.value || a.tile - b.tile);
  const own = planCentre(state);
  const centres = [...(own ? [own] : []), ...(state.neighbours?.villages ?? [])];
  const taken = takenTiles(state, day, landscape);
  for (const { tile } of candidates.slice(0, STEWARD.hereTries)) {
    const c = tileCenterWorld(landscape, tile % size, Math.floor(tile / size));
    const fed = siteCapacity(state, day, landscape, obstacles, c, centres, taken, coverage);
    if (fed < STEWARD.hereCapacity * people) continue;
    const position: Position = { x: c.x, z: c.z, rotation: 0 };
    const check = checkDwellingPlacement(landscape, null, 'zemnice', position, obstacles, {
      clearForest: false,
    });
    if (check.ok) return position;
  }
  return null;
}

/**
 * Směry na novou mapu (steward.md – Kam): napřed s hotovou zemskou stezkou (cesta 1 den), pak
 * nejkratší cesta ke kraji mapy (`edgeDistanceM`), při shodě pevné pořadí `DIRECTIONS`. Vlastní
 * vsi na sousedních mapách doména nezná – směr s vlastní vsí přeskočí use-case.
 */
export function stewardDirections(state: VillageState, landscape: Landscape): StewardDirection[] {
  const centre = villageCentre(state);
  return DIRECTIONS.map((direction, order) => {
    const trail = builtTrail(state, direction) !== null;
    const edge = edgeDistanceM(landscape, centre, direction);
    return { direction, travelDays: travelDays(edge, trail), trail, edge, order };
  })
    .sort((a, b) => Number(b.trail) - Number(a.trail) || a.edge - b.edge || a.order - b.order)
    .map(({ direction, travelDays: days }) => ({ direction, travelDays: days }));
}

/** Nahradí obsah stavu `target` stavem `source` (simulace mutuje tentýž objekt). */
function replaceState(target: VillageState, source: VillageState): void {
  const t = target as unknown as Record<string, unknown>;
  for (const key of Object.keys(t)) if (!(key in source)) delete t[key];
  Object.assign(target, source);
}

function isDepartureDate(day: number): boolean {
  const date = dateOfDayIndex(day);
  return date.month === STEWARD.departureDate.month && date.day === STEWARD.departureDate.day;
}

/**
 * Krok 2 (mutuje stav): v den `STEWARD.departureDate` ves přelidněná (`stewardCrowded`) bez místa
 * na nová pole (`stewardFieldRoom`), nebo ves, která od minulého dne odchodu hladověla aspoň
 * `STEWARD.departureHungerDays` (`steward.hungerPeak`) – bez místa na pole, nebo i s ním, když pole
 * podle „Pole uživí“ stačí (past osiva – steward.md, Hranice) nebo ves hladověla už loni
 * (`steward.lastYearHunger` – pole navíc rok nepomohla) –, a se synem, který smí vést
 * (`departingSon`): syn odejde s dílem
 * vsi (`departWithSon`) a osadníci jdou do odchozí schránky `steward.departures` se seedem
 * (`deriveSeed(seed vsi, 'steward-son:' + den)`), jménem (`suggestVillageName`) a cílem: místo na
 * téže mapě (`stewardHereSite`), jinak směry na novou mapu. Jen jednou za rok (jeden den v roce).
 * Vrací, zda syn odešel.
 */
export function stewardDeparture(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
): boolean {
  if (!isDepartureDate(day) || !isStewardOn(state) || state.people.length === 0) return false;
  const coverage = craftCoverage(state, day);
  const crowded = stewardCrowded(state, day, coverage);
  const hungry = (state.steward?.hungerPeak ?? 0) >= STEWARD.departureHungerDays;
  if (!crowded && !hungry) return false;
  // past osiva: ves hladoví, i když „Pole uživí“ stačí – další pole by zůstala neosetá, pomůže jen
  // méně lidí; hladověla-li už loni, pole navíc měla rok a nepomohla; jinak napřed nová pole, až
  // když není kam, odchod
  const lastYear = (state.steward?.lastYearHunger ?? 0) >= STEWARD.departureHungerDays;
  const trapped = hungry && (!crowded || lastYear);
  if (!trapped && stewardFieldRoom(state, day, landscape, obstacles)) return false;
  const son = departingSon(state, day);
  if (!son) return false;
  const share = sonShare(state, son.id, day);
  if (!share) return false;
  const seed = deriveSeed(state.seed, `steward-son:${day}`);
  const name = suggestVillageName(seed);
  const people = share.personIds.length;
  const dwelling = stewardHereSite(state, day, landscape, obstacles, people, coverage);
  const directions = stewardDirections(state, landscape);
  const direction = dwelling ? undefined : directions[0]?.direction;
  // odchod stav klonuje – vyšlapanost cest napřed do stavu (jako `startStewardBuild`); akce běží
  // na vsi dopočítané do dneška (`lastDay` uprostřed dopočtu drží den jeho začátku)
  if (state.roads?.wear) flushWear(state.roads.wear);
  const lastDay = state.lastDay;
  const departed = departWithSon({ ...state, lastDay: day }, day, son.id, {
    ...(direction ? { direction } : {}),
    villageName: name,
  });
  replaceState(state, departed.state);
  state.lastDay = lastDay;
  const record: StewardDeparture = {
    id: day,
    sonId: son.id,
    seed,
    name,
    ...(dwelling ? { dwelling } : {}),
    directions,
    settlers: departed.settlers,
  };
  if (state.steward) {
    state.steward.departures = [...(state.steward.departures ?? []), record];
    // menší ves, uvolněné domy – plán mateřské vsi se přepočítá (steward.md – Odchod syna)
    state.steward.replan = true;
  }
  return true;
}

// --- schránka --------------------------------------------------------------------------

/** Záznamy schránky, pro které ještě nevznikla ves. */
export function pendingStewardDepartures(state: VillageState): StewardDeparture[] {
  return (state.steward?.departures ?? []).filter(
    (d) => d.villageId === undefined && d.settlers && (d.attempts ?? 0) < STEWARD.departureAttempts,
  );
}

/** Nezdařené vybavení záznamu `id` se započítá (`attempts`); neznámý či vybavený záznam – týž stav. */
export function failStewardDeparture(state: VillageState, id: number): VillageState {
  const departures = state.steward?.departures;
  const record = departures?.find((d) => d.id === id);
  if (!state.steward || !departures || !record || record.villageId !== undefined) return state;
  return {
    ...state,
    steward: {
      ...state.steward,
      departures: departures.map((d) =>
        d.id === id ? { ...d, attempts: (d.attempts ?? 0) + 1 } : d,
      ),
    },
  };
}

/**
 * Záznam `id` schránky je vybavený – ves `villageId` vznikla; osadníci ze záznamu zmizí. Vstupní
 * stav nemění; už vybavený (nebo neznámý) záznam – týž objekt.
 */
export function settleStewardDeparture(
  state: VillageState,
  id: number,
  villageId: string,
): VillageState {
  const departures = state.steward?.departures;
  const record = departures?.find((d) => d.id === id);
  if (!state.steward || !departures || !record || record.villageId !== undefined) return state;
  return {
    ...state,
    steward: {
      ...state.steward,
      departures: departures.map((d) => {
        if (d.id !== id) return d;
        const rest = { ...d };
        delete rest.settlers;
        return { ...rest, villageId };
      }),
    },
  };
}

/** Klíč založení vsi ze záznamu `id` schránky vsi `villageId` (`VillageState.origin`). */
export function stewardDepartureOrigin(villageId: string, id: number): string {
  return `steward-son:${villageId}:${id}`;
}

// --- příjezd vsi na cestě se správcem --------------------------------------------------

/**
 * Ves na cestě se správcem dorazila do dne `toDay` (steward.md – Kde správce běží): správce sám
 * umístí první zemnici – nejbližší volné místo k místu vsi nové krajiny (`freeVillageSite`) – a ves
 * se založí z osadníků (`settlersOf` → `foundedState`) v den příjezdu; kronika cesty zůstane před
 * založením. Zdrojem pravdy je přepínač vsi na cestě (`steward.on`) – hráč ho může cestou zapnout i vypnout. Jinak (správce vypnutý, nedorazila, bez místa) null – ves
 * čeká na hráče.
 */
export function stewardArrival(
  state: VillageState,
  toDay: number,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
): VillageState | null {
  const journey = state.journey;
  if (!journey || !isStewardOn(state) || !landscape || !obstacles) return null;
  const day = Math.max(journey.arrivalDay, state.lastDay);
  if (day > toDay) return null;
  const dwelling = freeVillageSite(landscape, [], obstacles);
  if (!dwelling) return null;
  const founded = foundedState(
    state.seed,
    { landscape, obstacles, today: day, dwelling, settlers: settlersOf(state) },
    undefined,
    state.weatherSeed ?? null,
  );
  if (!founded.ok) return null;
  return {
    ...founded.state,
    chronicle: [...state.chronicle, ...founded.state.chronicle],
    ...(state.origin === undefined ? {} : { origin: state.origin }),
  };
}
