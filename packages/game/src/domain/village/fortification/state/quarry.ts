import {
  obstacleKind,
  obstaclesNear,
  obstaclesOf,
  type Landscape,
  type ObstacleLayer,
} from '../../../landscape';
import { validateActionDay } from '../../core/actions';
import { obstacleStatus, outcropUnder } from '../../core/obstacles';
import { logArrivalPoint } from '../../forest/log-piles';
import { woodFellingCost } from '../../forest/wood';
import { checkFootprintFree } from '../../placement/placement-land';
import { freeShape, rectangleSamples } from '../../placement/placement-geometry';
import { checkStructureTerrain } from '../../placement/placement-sacred';
import type { PlacementVillage } from '../../placement/placement-types';
import { OUTCROP_RADIUS_M, WATER_FETCHING } from '../../rules';
import { STONE } from '../../rules/rules-stone';
import { quarryAreaFootprint } from './quarry-area';
import { addStone } from './stone';
import type { Construction, Position, Quarry, VillageState } from '../../types';

// Lom (fortifications.md – Hradby a obrana, Kámen; Martin 8. 11. 2026: „Kámen z pole je na to
// nevhodný. Musíme zavést lom.“). Lom je rovná plocha u skal (Lom jako plocha u skal; Martin
// 14. 11. 2026 – schváleno): hráč ji postaví na rovině do `STONE.quarryArea.rockReachM` od okraje
// skalního výchozu; lamači lámou bloky u nejbližšího výchozu a nosí je na plochu po
// `STONE.carry.blockKg`, kameník je tam přisekává a z plochy jde kámen na staveniště. Kámen se
// láme na zakázku – pro rozestavěnou hradbu (`fortifications.ts` – `fortStonePlan`), kostel, nebo do
// zásoby, když to hráč zadá (pro obchod a dávky). Návrh Clauda: u výchozu nejvýš jeden lom, stavba
// ≈ 20 čd bez dřeva; zásoba se veze k hromadě u cesty nejblíž dvorci. Starší lom stojí na výchozu
// a pracuje stejně – výchoz je pod ním, bloky se nenosí.

/** Proč lom sem nejde – texty pro kurzor a zašedlé tlačítko. */
export const QUARRY_NO_ROCKS = 'Na mapě sídla není skalní výchoz – lom nejde postavit.';
export const QUARRY_TOO_FAR = `Lom musí stát do ${STONE.quarryArea.rockReachM} m od skalního výchozu.`;
export const QUARRY_ON_ROCK = 'Lom je plocha vedle skal – na skalní výchoz nejde.';
export const QUARRY_TAKEN = 'U tohohle výchozu už lom je.';
export const QUARRY_MISSING = 'Ves nemá lom.';

/** Nejbližší skalní výchoz k ploše lomu – id, střed, poloměr a vzdálenost od okraje (m). */
export interface OutcropHit {
  id: number;
  x: number;
  z: number;
  radiusM: number;
  /** Vzdálenost bodu od okraje výchozu (m; uvnitř 0). */
  edgeM: number;
}

/** Dostavěné lomy vsi; starší ves bez lomů prázdné. */
export function villageQuarries(state: Pick<VillageState, 'quarries'>): readonly Quarry[] {
  return state.quarries ?? [];
}

/** Má vrstva překážek skalní výchoz – pro každou vrstvu jednou (kontrola běží při pohybu kurzoru). */
const outcropLayers = new WeakMap<ObstacleLayer, boolean>();

/** Je na mapě sídla aspoň jeden skalní výchoz? Bez něj lom nejde (zašedlé tlačítko). */
export function hasOutcrop(obstacles: ObstacleLayer): boolean {
  const known = outcropLayers.get(obstacles);
  if (known !== undefined) return known;
  let found = false;
  for (let i = 0; i < obstacles.count && !found; i++) {
    found = obstacleKind(obstacles, i) === 'outcrop';
  }
  outcropLayers.set(obstacles, found);
  return found;
}

/**
 * Nejbližší skalní výchoz k bodu `at`, jehož okraj je nejvýš `reachM` daleko (výchoz je kruh
 * `OUTCROP_RADIUS_M × velikost`); vzdálenost se měří od okraje, při shodě menší id. Výchoz se
 * neodstraňuje, stačí vrstva překážek. Žádný v dosahu – null.
 */
export function nearestOutcrop(
  obstacles: ObstacleLayer,
  at: { x: number; z: number },
  reachM: number = STONE.quarryArea.rockReachM,
): OutcropHit | null {
  // největší výchoz (velikost do 1,8) + rezerva
  const reach = reachM + OUTCROP_RADIUS_M * 2;
  let best: OutcropHit | null = null;
  for (const i of obstaclesNear(
    obstacles,
    at.x - reach,
    at.z - reach,
    at.x + reach,
    at.z + reach,
  )) {
    if (obstacleKind(obstacles, i) !== 'outcrop') continue;
    const radiusM = OUTCROP_RADIUS_M * obstacles.scale[i]!;
    const x = obstacles.x[i]!;
    const z = obstacles.z[i]!;
    const edgeM = Math.max(0, Math.hypot(x - at.x, z - at.z) - radiusM);
    if (edgeM > reachM) continue;
    const id = obstacles.id[i]!;
    if (!best || edgeM < best.edgeM || (edgeM === best.edgeM && id < best.id)) {
      best = { id, x, z, radiusM, edgeM };
    }
  }
  return best;
}

/** Bod na okraji výchozu `outcrop` nejblíž bodu `at` – tam lamači lámou (m, svět). */
export function rockPointToward(
  outcrop: Pick<OutcropHit, 'x' | 'z' | 'radiusM'>,
  at: { x: number; z: number },
): { x: number; z: number } {
  const dx = at.x - outcrop.x;
  const dz = at.z - outcrop.z;
  const d = Math.hypot(dx, dz);
  if (!(d > 0)) return { x: outcrop.x + outcrop.radiusM, z: outcrop.z };
  return { x: outcrop.x + (dx / d) * outcrop.radiusM, z: outcrop.z + (dz / d) * outcrop.radiusM };
}

/** Výsledek kontroly umístění lomu – výchoz, u kterého se bude lámat, a bod na jeho okraji. */
export interface QuarryCheck {
  ok: boolean;
  reason: string | null;
  outcrop: OutcropHit | null;
  rock: { x: number; z: number } | null;
}

/**
 * Jde plocha lomu na místo `position` (fortifications.md – Kámen, Lom jako plocha u skal)? Střed
 * nejvýš `STONE.quarryArea.rockReachM` od okraje skalního výchozu (bez výchozu na mapě
 * `QUARRY_NO_ROCKS`, dál `QUARRY_TOO_FAR`); u toho výchozu ještě lom nestojí ani se nestaví
 * (`QUARRY_TAKEN`); plocha na rovině (rozdíl výšek nejvýš `maxHeightDiffM`, ne ve vodě), ne na
 * výchozu (`QUARRY_ON_ROCK`) a nepřekrývá jiné stavby ani pole (`checkFootprintFree`). Překážky
 * na ploše zůstanou (jako u klád). Server i prohlížeč počítají totéž.
 */
export function checkQuarryPlacement(
  landscape: Landscape,
  village: PlacementVillage | null,
  position: Position,
  obstacles: ObstacleLayer = obstaclesOf(landscape),
): QuarryCheck {
  const fail = (reason: string, outcrop: OutcropHit | null = null): QuarryCheck => ({
    ok: false,
    reason,
    outcrop,
    rock: null,
  });
  if (![position.x, position.z, position.rotation].every(Number.isFinite)) {
    return fail('Neplatná poloha – lom.');
  }
  const outcrop = nearestOutcrop(obstacles, position);
  if (!outcrop) return fail(hasOutcrop(obstacles) ? QUARRY_TOO_FAR : QUARRY_NO_ROCKS);
  const taken =
    (village?.quarries ?? []).some((q) => q.outcropId === outcrop.id) ||
    (village?.constructions ?? []).some(
      (c) => c.quarryOutcrop === outcrop.id && c.position !== null,
    );
  if (taken) return fail(QUARRY_TAKEN, outcrop);
  const { sizeM, maxHeightDiffM } = STONE.quarryArea;
  const terrain = checkStructureTerrain(
    landscape,
    'Lom',
    maxHeightDiffM,
    rectangleSamples(sizeM, sizeM, position),
  );
  if (!terrain.ok) return fail(terrain.reason ?? QUARRY_ON_ROCK, outcrop);
  const footprint = quarryAreaFootprint(position);
  if (outcropUnder(obstacles, obstacleStatus(village?.obstacleChanges), footprint)) {
    return fail(QUARRY_ON_ROCK, outcrop);
  }
  const free = checkFootprintFree(landscape, village, [freeShape(footprint)]);
  if (!free.ok) return fail(free.reason ?? QUARRY_ON_ROCK, outcrop);
  return { ok: true, reason: null, outcrop, rock: rockPointToward(outcrop, position) };
}

/** Směry, ve kterých se hledá plocha lomu kolem výchozu (po 22,5°; `quarrySiteNear`). */
const SITE_DIRECTIONS = 16;
/** Krok vzdálenosti plochy od výchozu při hledání (m; návrh Clauda). */
const SITE_RING_STEP_M = 4;

/**
 * Místo plochy lomu u výchozu `outcrop` (pod jeho středem – poloměr z vrstvy) nejblíž bodu
 * `toward`, které projde `checkQuarryPlacement` (NPC rod – churches.md, Stavba): středy po kruzích
 * kolem výchozu od těsně vedle skály (půlka úhlopříčky plochy) do `STONE.quarryArea.rockReachM` od
 * okraje po `SITE_RING_STEP_M`, v `SITE_DIRECTIONS` směrech, natočení 0. Nic neprojde – null.
 */
export function quarrySiteNear(
  landscape: Landscape,
  village: PlacementVillage | null,
  obstacles: ObstacleLayer,
  outcrop: { x: number; z: number },
  toward: { x: number; z: number },
): { position: Position; check: QuarryCheck } | null {
  const { sizeM, rockReachM } = STONE.quarryArea;
  const radius = nearestOutcrop(obstacles, outcrop, 0)?.radiusM ?? OUTCROP_RADIUS_M;
  const from = radius + (sizeM / 2) * Math.SQRT2;
  const spots: { x: number; z: number; d: number; k: number }[] = [];
  for (let r = from; r <= radius + rockReachM; r += SITE_RING_STEP_M) {
    for (let i = 0; i < SITE_DIRECTIONS; i++) {
      const a = (2 * Math.PI * i) / SITE_DIRECTIONS;
      const x = outcrop.x + r * Math.cos(a);
      const z = outcrop.z + r * Math.sin(a);
      spots.push({ x, z, d: Math.hypot(x - toward.x, z - toward.z), k: spots.length });
    }
  }
  spots.sort((a, b) => a.d - b.d || a.k - b.k);
  for (const s of spots) {
    const position = { x: s.x, z: s.z, rotation: 0 };
    const check = checkQuarryPlacement(landscape, village, position, obstacles);
    if (check.ok) return { position, check };
  }
  return null;
}

/** Výsledek akce nad lomem – nový stav, nebo důvod česky. */
export type QuarryResult = { ok: true; state: VillageState } | { ok: false; reason: string };

/**
 * Hráč zahájí stavbu lomu – plochu se středem a natočením `position` (kontrola
 * `checkQuarryPlacement` nad `village`, bez údaje nad stavem vsi) – `STONE.quarryLaborManDays` ze
 * společné práce, bez dřeva. Stavba si pamatuje výchoz a bod na jeho okraji. Vstupní stav nemění.
 */
export function startQuarry(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  position: Position,
  village: PlacementVillage = state,
): QuarryResult {
  validateActionDay(state, day);
  const check = checkQuarryPlacement(landscape, village, position, obstacles);
  if (!check.ok || !check.outcrop || !check.rock) {
    return { ok: false, reason: check.reason ?? QUARRY_NO_ROCKS };
  }
  const next = structuredClone(state);
  next.constructions.push({
    id: next.nextId++,
    kind: 'quarry',
    startedDay: day,
    cost: STONE.quarryLaborManDays,
    done: 0,
    dwellingType: null,
    position: { x: position.x, z: position.z, rotation: position.rotation },
    dwellingId: null,
    fieldId: null,
    quarryOutcrop: check.outcrop.id,
    quarryRock: { ...check.rock },
  });
  return { ok: true, state: next };
}

/** Dostavěný lom (krok dokončení staveb) – přibude do `quarries`. Mutuje stav. */
export function finishQuarry(state: VillageState, c: Construction, day: number): void {
  if (c.quarryOutcrop === undefined || c.position === null) return;
  const outcropId = c.quarryOutcrop;
  if (villageQuarries(state).some((q) => q.outcropId === outcropId)) return;
  (state.quarries ??= []).push({
    outcropId,
    x: c.position.x,
    z: c.position.z,
    rotation: c.position.rotation,
    builtDay: day,
    ...(c.quarryRock ? { rock: { ...c.quarryRock } } : {}),
  });
}

/** Nejbližší dostavěný lom k místu `at` a vzdálenost k němu (m); při shodě menší id; bez lomu null. */
export function nearestQuarry(
  state: Pick<VillageState, 'quarries'>,
  at: { x: number; z: number },
): { quarry: Quarry; distanceM: number } | null {
  let best: Quarry | null = null;
  let bestD = Infinity;
  for (const q of villageQuarries(state)) {
    const d = (q.x - at.x) * (q.x - at.x) + (q.z - at.z) * (q.z - at.z);
    if (d < bestD || (d === bestD && best !== null && q.outcropId < best.outcropId)) {
      best = q;
      bestD = d;
    }
  }
  return best ? { quarry: best, distanceM: Math.sqrt(bestD) } : null;
}

/** Nošení 1 m³ kamene po `kg` na cestu na vzdušnou vzdálenost `distanceM` (čd). */
function carryPerM3(distanceM: number, kg: number): number {
  const { kgPerM3, loadS } = STONE.carry;
  const tripS = (2 * Math.max(0, distanceM)) / WATER_FETCHING.speedMps + loadS;
  return ((kgPerM3 / kg) * tripS) / (WATER_FETCHING.dayHours * 3600);
}

/**
 * Nošení 1 m³ kamene v nůších z lomu na vzdušnou vzdálenost `distanceM` (čd; fortifications.md –
 * Kámen, Nošení kamene a vůz): cesty po `STONE.carry.basketKg` tam i zpět tempem
 * `WATER_FETCHING.speedMps`, naložení a složení `STONE.carry.loadS`, den `WATER_FETCHING.dayHours`.
 */
export function stoneCarryManDaysPerM3(distanceM: number): number {
  return carryPerM3(distanceM, STONE.carry.basketKg);
}

/**
 * Nošení vylomených bloků 1 m³ od výchozu na plochu lomu na vzdálenost `distanceM` (čd; Lom jako
 * plocha u skal): jako nošení kamene, jen po `STONE.carry.blockKg` na cestu.
 */
export function blockCarryManDaysPerM3(distanceM: number): number {
  return carryPerM3(distanceM, STONE.carry.blockKg);
}

/**
 * Jak daleko se z lomu nosí bloky od výchozu na plochu (m) – od středu plochy k bodu lámání
 * (`Quarry.rock`); starší lom na výchozu undefined (bloky se nenosí).
 */
export function quarryRockM(quarry: Pick<Quarry, 'x' | 'z' | 'rock'>): number | undefined {
  const r = quarry.rock;
  return r ? Math.hypot(quarry.x - r.x, quarry.z - r.z) : undefined;
}

/**
 * Lámání 1 m³ a nošení bloků na plochu lomu (čd) – část práce, kterou vůz s kamenem nenahradí:
 * `STONE.quarryManDaysPerM3` a nošení bloků na `rockM` (`blockCarryManDaysPerM3`); lom na
 * výchozu (`rockM` undefined) jen lámání.
 */
export function quarryBreakManDaysPerM3(rockM?: number): number {
  return STONE.quarryManDaysPerM3 + (rockM === undefined ? 0 : blockCarryManDaysPerM3(rockM));
}

/**
 * Lámání, nošení bloků na plochu (`rockM` – `quarryBreakManDaysPerM3`) a nošení 1 m³ z plochy
 * lomu v nůších na vzdálenost `distanceM` (čd; `stoneCarryManDaysPerM3`).
 */
export function quarryManDaysPerM3(distanceM: number, rockM?: number): number {
  return quarryBreakManDaysPerM3(rockM) + stoneCarryManDaysPerM3(distanceM);
}

// --- vůz s kamenem --------------------------------------------------------------------------

/**
 * Vůz s kamenem pro jednu stavbu na dnešek (wagons.md – Co vozy vozí, bod 5; fortifications.md –
 * Kámen, Nošení kamene a vůz): kolik kamene za den nejvýš uveze (m³), práce posádky na m³ (čd),
 * nošení v nůších na m³, které nahradí (čd), lámání a nošení bloků na plochu lomu na m³, které
 * vůz nenahradí (čd – `quarryBreakManDaysPerM3`), a náklad jedné jízdy (m³). Plán dne –
 * `planCartJobs`.
 */
export interface StoneCart {
  constructionId: number;
  outcropId: number;
  maxM3: number;
  crewPerM3: number;
  carryPerM3: number;
  breakPerM3: number;
  loadM3: number;
}

/**
 * Lámání pro stavbu za den (rozdělení práce dne – labor-report.ts): lom (id výchozu), lámání
 * a nošení v nůších (čd), práce posádky vozu (čd), kolik kamene vůz uvezl (m³) a za kolik jízd.
 */
export interface StoneDay {
  outcropId: number;
  manDays: number;
  crew: number;
  m3: number;
  trips: number;
}

/**
 * Postup stavby za práci `labor` (čd), z jejíhož postupu je podíl `share` lámání a nošení kamene,
 * s vozem `cart` (fortifications.md – Kámen, Nošení kamene a vůz): vůz uveze nejvýš to, co se
 * dnes nalámalo, a nejvýš `cart.maxM3`; posádka jde z této práce a co vůz uveze, se nenosí – postup
 * je práce + m³ vozem × (nošení − posádka). Vrátí postup (čd) a kolik vůz uvezl (m³).
 */
export function stoneCartProgress(
  labor: number,
  share: number,
  cart: StoneCart,
): { progress: number; m3: number } {
  const { breakPerM3: b, carryPerM3: c, crewPerM3: k } = cart;
  if (!(labor > 0) || share <= 0) return { progress: Math.max(0, labor), m3: 0 };
  const m3 = Math.min(cart.maxM3, (share * labor) / (b + c - share * (c - k)));
  return { progress: labor + m3 * (c - k), m3 };
}

/** Práce, za kterou stavba s vozem `cart` postoupí o `progress` čd (obrácená `stoneCartProgress`). */
export function stoneCartLabor(progress: number, share: number, cart: StoneCart): number {
  if (!(progress > 0)) return 0;
  const { breakPerM3: b, carryPerM3: c, crewPerM3: k } = cart;
  const m3 = Math.min(cart.maxM3, (share * progress) / (b + c));
  return Math.max(0, progress - m3 * (c - k));
}

/**
 * Lámání dne pro rozdělení práce: z postupu `progress` je podíl `share` lámání a nošení; vůz
 * uvezl `m3` – nošení toho se nedělalo, práce posádky se přičte zvlášť.
 */
export function stoneDayOf(
  outcropId: number,
  progress: number,
  share: number,
  m3: number,
  cart: StoneCart | undefined,
): StoneDay {
  const carted = cart ? m3 : 0;
  const crew = cart ? carted * cart.crewPerM3 : 0;
  const carry = cart ? carted * cart.carryPerM3 : 0;
  return {
    outcropId,
    manDays: Math.max(0, share * progress - carry),
    crew,
    m3: carted,
    trips: cart && cart.loadM3 > 0 ? carted / cart.loadM3 : 0,
  };
}

/**
 * Lámání ve stavbě, která ho má v práci (fortifications.md – Kámen): lom (id výchozu), kolik práce
 * jde napřed bez kamene (čd – kácení dřeva hradby) a podíl lámání a nošení ve zbytku (0–1).
 */
export interface StoneWork {
  outcropId: number;
  ahead: number;
  share: number;
}

/**
 * Lámání stavby `c` (kostel má vlastní – `churchWorkDay`): zakázka do zásoby je celá lámání
 * a nošení; stavba hradby s kamenem z lomu (`fortStone`) ho má v práci úseků – podíl jejich práce
 * (stejný pro všechny úseky – kámen i práce úseku rostou s délkou), kácení dřeva jde napřed.
 * Ostatní stavby (i hradba ze starší vsi) null.
 */
export function constructionStoneWork(c: Construction): StoneWork | null {
  if (c.kind === 'quarrying' && c.quarryOutcrop !== undefined) {
    return { outcropId: c.quarryOutcrop, ahead: 0, share: 1 };
  }
  const stone = c.fortStone;
  if (c.kind !== 'fortification' || !stone) return null;
  const segments = (c.fortSegments ?? []).reduce((sum, s) => sum + s.cost, 0);
  if (!(segments > 0)) return null;
  const share = Math.min(
    1,
    (stone.m3 * quarryManDaysPerM3(stone.distanceM, stone.rockM)) / segments,
  );
  return {
    outcropId: stone.outcropId,
    ahead: Math.max(0, woodFellingCost(c.wood) - c.done),
    share,
  };
}

/**
 * Lámání a nošení bloků na plochu lomu `quarry` na 1 m³ kamene stavby `c` (čd – část, kterou vůz
 * nenahradí): zásoba podle lomu, hradba podle `fortStone.rockM` (cena úseků je z doby zahájení).
 */
export function constructionStoneBreak(
  c: Construction,
  quarry: Pick<Quarry, 'x' | 'z' | 'rock'>,
): number {
  if (c.kind === 'quarrying') return quarryBreakManDaysPerM3(quarryRockM(quarry));
  return quarryBreakManDaysPerM3(c.fortStone?.rockM);
}

/**
 * Nošení 1 m³ kamene stavby `c` z plochy lomu v nůších (čd) – zásoba z ceny zakázky bez lámání
 * a nošení bloků (`breakPerM3`), hradba ze vzdálenosti.
 */
export function constructionStoneCarry(
  c: Construction,
  breakPerM3: number = STONE.quarryManDaysPerM3,
): number {
  if (c.kind === 'quarrying') {
    const m3 = c.stoneOrderM3 ?? 0;
    return m3 > 0 ? Math.max(0, c.cost / m3 - breakPerM3) : 0;
  }
  return c.fortStone ? stoneCarryManDaysPerM3(c.fortStone.distanceM) : 0;
}

/** Kolik práce stavba s lámáním `work` dnes vezme – s vozem `cart` lámání levněji. */
export function stoneWorkNeed(c: Construction, work: StoneWork, cart?: StoneCart): number {
  const rest = Math.max(0, c.cost - c.done);
  if (!cart) return rest;
  const ahead = Math.min(rest, work.ahead);
  return ahead + stoneCartLabor(rest - ahead, work.share, cart);
}

/**
 * Vloží práci `amount` do stavby s lámáním `work` (mutuje `c.done`; `completes` = dostala vše, co
 * jí chybělo): s vozem `cart` postoupí víc (`stoneCartProgress`). Vrátí lámání dne; bez něj null.
 */
export function investStoneWork(
  c: Construction,
  work: StoneWork,
  amount: number,
  completes: boolean,
  cart?: StoneCart,
): StoneDay | null {
  const rest = Math.max(0, c.cost - c.done);
  const ahead = Math.min(rest, work.ahead);
  const onStone = Math.max(0, amount - ahead);
  const carted = cart ? stoneCartProgress(onStone, work.share, cart) : { progress: onStone, m3: 0 };
  const progress = Math.max(0, Math.min(rest - ahead, carted.progress));
  if (completes) c.done = c.cost;
  else if (cart) c.done = Math.min(c.cost, c.done + Math.min(amount, ahead) + progress);
  else c.done = Math.min(c.cost, c.done + amount);
  if (progress <= 0 || work.share <= 0) return null;
  return stoneDayOf(work.outcropId, progress, work.share, carted.m3, cart);
}

/**
 * Práce zakázky „nalámat do zásoby“ `m3` v lomu `quarry` (čd): lámání, nošení bloků na plochu
 * (`quarryRockM`) a nošení z plochy k hromadě u cesty nejblíž dvorci (`logArrivalPoint`) – tam se
 * kámen složí.
 */
export function stockQuarryingManDays(state: VillageState, quarry: Quarry, m3: number): number {
  const to = logArrivalPoint(state);
  const d = Math.sqrt(
    (quarry.x - to.x) * (quarry.x - to.x) + (quarry.z - to.z) * (quarry.z - to.z),
  );
  return m3 * quarryManDaysPerM3(d, quarryRockM(quarry));
}

/**
 * Hráč zadá v lomu `outcropId` „nalámat do zásoby“ `m3` (celé m³ v `STONE.stockOrderM3`) – práce
 * jde ze společné práce vsi jako stavba, po dokončení leží kámen na hromadě u cesty u dvorce.
 * Vstupní stav nemění.
 */
export function orderQuarrying(
  state: VillageState,
  day: number,
  outcropId: number,
  m3: number,
): QuarryResult {
  validateActionDay(state, day);
  const quarry = villageQuarries(state).find((q) => q.outcropId === outcropId);
  if (!quarry) return { ok: false, reason: QUARRY_MISSING };
  const { min, max } = STONE.stockOrderM3;
  if (!Number.isInteger(m3) || m3 < min || m3 > max) {
    return { ok: false, reason: `Nalámat jde ${min} až ${max} m³ kamene.` };
  }
  const next = structuredClone(state);
  next.constructions.push({
    id: next.nextId++,
    kind: 'quarrying',
    startedDay: day,
    cost: stockQuarryingManDays(state, quarry, m3),
    done: 0,
    dwellingType: null,
    position: null,
    dwellingId: null,
    fieldId: null,
    quarryOutcrop: outcropId,
    stoneOrderM3: m3,
  });
  return { ok: true, state: next };
}

/** Kámen zakázky lámání, který už je nalámaný (m³) – podle odvedené práce. */
function quarriedSoFar(c: Construction): number {
  const m3 = c.stoneOrderM3 ?? 0;
  if (c.cost <= 0) return m3;
  return m3 * Math.min(1, Math.max(0, c.done / c.cost));
}

/** Dokončené lámání do zásoby – kámen na hromadu u cesty u dvorce. Mutuje stav. */
export function finishQuarrying(state: VillageState, c: Construction): void {
  addStone(state, c.stoneOrderM3 ?? 0, null);
}

/**
 * Zrušení stavby s kamenem (mutuje klon): lámání do zásoby složí na hromadu, co se už nalámalo
 * (návrh Clauda); hradba vrátí nezabudovaný kámen z hromad (`stoneFromPile` × nehotový podíl) –
 * nalámaný kámen nehotových úseků se nelámal (lámání je v práci úseků).
 */
export function returnConstructionStone(state: VillageState, c: Construction): void {
  if (c.kind === 'quarrying') {
    addStone(state, quarriedSoFar(c), null);
    return;
  }
  const fromPile = c.stoneFromPile ?? 0;
  if (fromPile <= 0) return;
  const progress = c.cost > 0 ? Math.min(1, Math.max(0, c.done / c.cost)) : 0;
  addStone(state, fromPile * (1 - progress), c.fortLogsAt ?? c.position ?? null);
}
