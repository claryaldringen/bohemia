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
import { foundVillage } from './actions';
import { settlersOf, edgeDistanceM, travelDays, villageCentre, type Settlers } from './departure';
import { currentLord, wivesOf } from './dynasty';
import { generatedLineName } from './dynasty-names';
import { foundedState } from './founding';
import { bufferFill } from './field-food';
import { suggestVillageName } from './names';
import { ageGroup, ageYears } from './people';
import { LEAVING } from './rules-buildings';
import { CARTS } from './rules-crafts';
import { FIELD_LIMITS, FOOD_NEED_KG_PER_YEAR, START_SEED_YEARS } from './rules-fields';
import { AGE } from './rules-people';
import { STEWARD } from './rules-steward';
import { fieldSowingTargets } from './simulate-plan';
import { departWithSon, leadingSons, sonDeparturePreview } from './son-departure';
import { fieldCellValue, fieldCells, takenTiles, villageTerritory } from './steward-land';
import {
  stewardFedPeople,
  stewardOutlook,
  stewardSoil,
  type StewardOutlook,
  type StewardSoil,
} from './steward-outlook';
import { isStewardOn, pruneStewardBuilt } from './steward-state';
import { DIRECTIONS, builtTrail } from './trail';
import type {
  CraftCoverage,
  Person,
  StewardDeparture,
  StewardDirection,
  VillageState,
} from './types';
import { freeVillageSite } from './village-site';

/** Bod ve světě (m). */
interface Point {
  x: number;
  z: number;
}

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

/** Místo zemnice nové vsi v odhadu `departureFed` – krajinu nové mapy doména ještě nezná. */
const COLONY_SITE = { x: 0, z: 0, rotation: 0 } as const;

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
 * Přelidnění (krok 2): lidí víc, než ves udrží (`stewardOutlook` – „Pole uživí“ při osevu trvalého
 * hrdla: půdy, nebo práce v oknech setí; zakládané díly jako v oběhu – jako `fieldTarget`)
 * × `STEWARD.crowdedShare`.
 */
export function stewardCrowded(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  outlook: StewardOutlook = stewardOutlook(state, day, coverage),
): boolean {
  return state.people.length > outlook.sustainablePeople * STEWARD.crowdedShare;
}

/** Polohy obydlí a stavenišť vsi (m) – od nich se měří dosah pole. */
function housePoints(state: VillageState): Point[] {
  const points: Point[] = state.dwellings.map((d) => ({ x: d.position.x, z: d.position.z }));
  for (const c of state.constructions) {
    if (c.kind === 'dwelling' && c.position) points.push({ x: c.position.x, z: c.position.z });
  }
  return points;
}

/** Vzdálenost (m) bodu k nejbližšímu z `points` (bez bodů nekonečno). */
function nearestM(x: number, z: number, points: readonly Point[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const p of points) best = Math.min(best, (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z));
  return Math.sqrt(best);
}

/**
 * Je kam pole rozšířit (krok 2, Kdy není kam)? Na území vsi (`villageTerritory`) zbývá volné políčko (`takenTiles`) s úrodou, nejdál `FIELD_LIMITS.maxDistanceM` od
 * nejbližšího obydlí, jehož hodnota (`fieldCellValue` – kg čisté úrody na člověkoden založení
 * a polní práce, se záplavami, zvěří a počasím) je aspoň `STEWARD.minKgPerManDay`. Louka i les
 * (klučení) – napřed nová pole, až když není kam, odchod. S výhledem vsi (`outlook`) je kam jen,
 * když trvalým hrdlem je půda – když brzdí práce, další pole nepomůžou (steward.md – Model
 * kapacity vsi).
 */
export function stewardFieldRoom(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  outlook?: StewardOutlook,
): boolean {
  if (outlook?.lasting === 'labor') return false;
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
 * Výprava syna podle náhledu odchodu (`sonDeparturePreview` – poměrná část vsi `sonShare`, jídlo,
 * osivo a vůz jako `departWithSon`; steward.md – Životaschopná výprava).
 */
export interface StewardExpedition {
  son: Person;
  /** Lidé dílu. */
  people: number;
  /** Dospělí dílu (14–44 let – plná práce). */
  adults: number;
  /** V dílu je pár: žena 16–44 let s manželem od 16 let. */
  pair: boolean;
  /** Jídlo a osivo ÷ co má výprava nést – rok jídla do žní a osivo, nejvýš kolik unesou. */
  load: number;
  /** Osivo ÷ osivo na první osev (půl roční potřeby, nejvýš kolik unesou pěšky). */
  seed: number;
  /** Díl splní podmínky výpravy (bez pojistky mateřské vsi – ta až s odchodem). */
  viable: boolean;
}

/**
 * Výprava syna `son` (steward.md – Životaschopná výprava; Martin 30. 10. 2026 – poměrná část vsi,
 * pravidlo dílu se nemění, správce volí jen kdy): díl má aspoň `STEWARD.expeditionAdults` dospělých,
 * pár v plodném věku a jídlo s osivem aspoň `STEWARD.expeditionLoad` toho, co má nést – rok jídla
 * do příštích žní (31. 8. je po žních) a osivo na první osev (`START_SEED_YEARS`), nejvýš kolik
 * unesou (`LEAVING`, vůz `CARTS.loadKg`); osivo zvlášť aspoň tento podíl půl roční potřeby nebo
 * osiva pěšky. Syn ve vsi nikde – null.
 */
export function stewardExpedition(
  state: VillageState,
  son: Person,
  day: number,
): StewardExpedition | null {
  const preview = sonDeparturePreview(state, son.id, day);
  if (!preview) return null;
  const ids = new Set(preview.share.personIds);
  const leavers = state.people.filter((p) => ids.has(p.id));
  const adults = leavers.filter((p) => ageGroup(p, day) === 'adult').length;
  const pair = leavers.some((p) => {
    if (p.sex !== 'female' || p.spouseId === undefined || !ids.has(p.spouseId)) return false;
    const age = ageYears(p.bornDay, day);
    const husband = leavers.find((h) => h.id === p.spouseId);
    return (
      age >= AGE.fertile &&
      age < AGE.elder &&
      husband !== undefined &&
      ageYears(husband.bornDay, day) >= AGE.fertile
    );
  });
  const need = leavers.reduce((sum, p) => sum + FOOD_NEED_KG_PER_YEAR[ageGroup(p, day)], 0);
  const carriers = leavers.filter((p) => ageYears(p.bornDay, day) >= LEAVING.carryFromAge).length;
  const cartKg = preview.cart ? CARTS.loadKg[preview.cart] : 0;
  const seedNeed = need * START_SEED_YEARS;
  const carry = carriers * (LEAVING.carryKgPerPerson + LEAVING.seedKgPerCarrier) + cartKg;
  const loadWant = Math.min(need + seedNeed, carry);
  const seedWant = Math.min(seedNeed, carriers * LEAVING.seedKgPerCarrier);
  const load = loadWant > 0 ? (preview.foodKg + preview.seedKg) / loadWant : 0;
  const seed = seedWant > 0 ? preview.seedKg / seedWant : 0;
  return {
    son,
    people: leavers.length,
    adults,
    pair,
    load,
    seed,
    viable:
      adults >= STEWARD.expeditionAdults &&
      pair &&
      load >= STEWARD.expeditionLoad &&
      seed >= STEWARD.expeditionLoad,
  };
}

/**
 * Kdo odejde (steward.md – Kdo odejde, Životaschopná výprava): ze synů, kteří smějí vést
 * (`leadingSons` s `check.ok`), jen ten, jehož díl je životaschopná výprava (`stewardExpedition`)
 * a po jehož odchodu má mateřská ves pojistku aspoň `STEWARD.departureMotherFill` a obě vsi
 * uživí vlastní prací aspoň `STEWARD.departureFeedShare` × své lidi (`departureFed`); z nich ten
 * s nejvíc dospělými, pak nejvíc lidmi, ženatý před svobodným, starší, nižší id. Nikdo – null
 * (správce počká, až syn dospěje, ožení se nebo ves doroste). Ves bez rodu syna nemá. Pojistku
 * po odchodu počítá na stavu z `departWithSon` – stejně jako odchod sám.
 */
export function departingSon(state: VillageState, day: number): Person | null {
  const married = (e: StewardExpedition): number => (wivesOf(state, e.son).length > 0 ? 1 : 0);
  const viable = leadingSons(state, day)
    .filter((s) => s.check.ok)
    .map((s) => stewardExpedition(state, s.son, day))
    .filter((e): e is StewardExpedition => e !== null && e.viable)
    .sort(
      (a, b) =>
        b.adults - a.adults ||
        b.people - a.people ||
        married(b) - married(a) ||
        a.son.bornDay - b.son.bornDay ||
        a.son.id - b.son.id,
    );
  for (const e of viable) {
    // akce běží na vsi dopočítané do dneška (`lastDay` uprostřed dopočtu drží den jeho začátku)
    const { state: after, settlers } = departWithSon({ ...state, lastDay: day }, day, e.son.id);
    const fill = bufferFill(fieldSowingTargets(after, day, craftCoverage(after, day)));
    if (fill < STEWARD.departureMotherFill) continue;
    const fed = departureFed(state, after, settlers, day);
    if (fed.mother >= STEWARD.departureFeedShare && fed.colony >= STEWARD.departureFeedShare) {
      return e.son;
    }
  }
  return null;
}

/** Kolikrát osev vlastní prací uživí lidi mateřské a nové vsi po odchodu (`departureFed`). */
export interface DepartureFed {
  mother: number;
  colony: number;
}

/**
 * Obě vsi po odchodu syna (steward.md – Životaschopná výprava; Martin 2. 11. 2026: „neměl by syn
 * odcházet, až když je ve zdrojové vesnici dost lidí, aby obě vesnice mohly bezpečně fungovat?
 * Inteligentní hráč by to tak udělal“): kolikrát osev vlastní prací (`stewardFedPeople`) uživí
 * lidi mateřské vsi (stav `after` z `departWithSon`; i podle osiva na příští osev – past osiva)
 * a nové vsi (osadníci – stav, jak ho založí `foundVillage`; jen podle práce – osivo výpravy hlídá
 * `stewardExpedition` a chybějící ves koupí u sousedů, fields.md – Osivo pro ves bez zásob). Nová
 * ves seje na úrodnosti mateřské vsi (sousední mapa) s odpočatou půdou a stravou mateřské vsi.
 * Mateřská ves bez polí – obojí 0 (úrodnost neznámá, sama nic neoseje).
 */
export function departureFed(
  state: VillageState,
  after: VillageState,
  settlers: Settlers,
  day: number,
): DepartureFed {
  const soil = stewardSoil(state, day);
  if (!soil) return { mother: 0, colony: 0 };
  const ratio = (village: VillageState, villageSoil: StewardSoil, seed: boolean): number =>
    village.people.length > 0
      ? stewardFedPeople(village, day, craftCoverage(village, day), villageSoil, seed) /
        village.people.length
      : 0;
  const colony = foundVillage({ seed: state.seed, day, dwellingPosition: COLONY_SITE, settlers });
  return {
    mother: ratio(after, stewardSoil(after, day) ?? soil, true),
    colony: ratio(colony, { ...soil, soil: 1 }, false),
  };
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
 * (`steward.lastYearHunger` – pole navíc rok nepomohla) –, a se synem, jehož díl je životaschopná
 * výprava (`departingSon` – jinak správce počká): syn odejde s dílem
 * vsi (`departWithSon`) a osadníci jdou do odchozí schránky `steward.departures` se seedem
 * (`deriveSeed(seed vsi, 'steward-son:' + den)`), jménem (`suggestVillageName`) a směry na novou
 * mapu – jedna ves, jedna mapa (Martin 1. 11. 2026). Jen jednou za rok (jeden den v roce).
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
  const outlook = stewardOutlook(state, day, coverage);
  const crowded = stewardCrowded(state, day, coverage, outlook);
  const hungry = (state.steward?.hungerPeak ?? 0) >= STEWARD.departureHungerDays;
  if (!crowded && !hungry) return false;
  // past osiva: ves hladoví, i když „Pole uživí“ stačí – další pole by zůstala neosetá, pomůže jen
  // méně lidí; hladověla-li už loni, pole navíc měla rok a nepomohla; jinak napřed nová pole, až
  // když není kam, odchod
  const lastYear = (state.steward?.lastYearHunger ?? 0) >= STEWARD.departureHungerDays;
  const trapped = hungry && (!crowded || lastYear);
  if (!trapped && stewardFieldRoom(state, day, landscape, obstacles, outlook)) return false;
  const son = departingSon(state, day);
  if (!son) return false;
  const seed = deriveSeed(state.seed, `steward-son:${day}`);
  const name = suggestVillageName(seed);
  const directions = stewardDirections(state, landscape);
  const direction = directions[0]?.direction;
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
  const dwelling = freeVillageSite(landscape, obstacles);
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
