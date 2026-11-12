import { obstacleKind, obstaclesNear, type ObstacleLayer } from '../../../landscape';
import { validateActionDay } from '../../core/actions';
import { logArrivalPoint } from '../../forest/log-piles';
import { woodFellingCost } from '../../forest/wood';
import { OUTCROP_RADIUS_M, WATER_FETCHING } from '../../rules';
import { STONE } from '../../rules/rules-stone';
import { addStone } from './stone';
import type { Construction, Position, Quarry, VillageState } from '../../types';

// Lom (fortifications.md – Hradby a obrana, Kámen; Martin 8. 11. 2026: „Kámen z pole je na to
// nevhodný. Musíme zavést lom.“): stavba jen na skalním výchozu mapy. Kámen se v něm láme na
// zakázku – pro rozestavěnou hradbu (`fortifications.ts` – `fortStonePlan`), nebo do zásoby, když
// to hráč zadá (pro obchod a dávky). Návrh Clauda: na výchozu nejvýš jeden lom, stavba ≈ 20 čd bez
// dřeva; zásoba se veze k hromadě u cesty nejblíž dvorci.

/** Proč lom sem nejde – texty pro kurzor. */
export const QUARRY_NO_OUTCROP = 'Lom jde jen na skalní výchoz.';
export const QUARRY_TAKEN = 'Na tomhle výchozu už lom je.';
export const QUARRY_MISSING = 'Ves nemá lom.';

/** Skalní výchoz pod bodem – id, střed a poloměr (m). */
export interface OutcropHit {
  id: number;
  x: number;
  z: number;
  radiusM: number;
}

/** Dostavěné lomy vsi; starší ves bez lomů prázdné. */
export function villageQuarries(state: Pick<VillageState, 'quarries'>): readonly Quarry[] {
  return state.quarries ?? [];
}

/**
 * Skalní výchoz pod bodem `at` (kruh `OUTCROP_RADIUS_M × velikost` + `STONE.pickSlackM`); víc
 * výchozů – nejbližší střed, při shodě menší id. Výchoz se neodstraňuje, stačí vrstva překážek.
 */
export function outcropAt(
  obstacles: ObstacleLayer,
  at: { x: number; z: number },
): OutcropHit | null {
  const reach = OUTCROP_RADIUS_M * 2 + STONE.pickSlackM;
  let best: OutcropHit | null = null;
  let bestD = Infinity;
  for (const i of obstaclesNear(
    obstacles,
    at.x - reach,
    at.z - reach,
    at.x + reach,
    at.z + reach,
  )) {
    if (obstacleKind(obstacles, i) !== 'outcrop') continue;
    const radiusM = OUTCROP_RADIUS_M * obstacles.scale[i]!;
    const dx = obstacles.x[i]! - at.x;
    const dz = obstacles.z[i]! - at.z;
    const d = dx * dx + dz * dz;
    const limit = radiusM + STONE.pickSlackM;
    if (d > limit * limit) continue;
    const id = obstacles.id[i]!;
    if (d < bestD || (d === bestD && best !== null && id < best.id)) {
      best = { id, x: obstacles.x[i]!, z: obstacles.z[i]!, radiusM };
      bestD = d;
    }
  }
  return best;
}

/** Ves, jak ji vidí kontrola umístění lomu – lomy a rozestavěné stavby. */
export interface QuarrySites {
  readonly quarries?: readonly { readonly outcropId: number }[];
  readonly constructions: readonly { readonly quarryOutcrop?: number; readonly kind?: string }[];
}

/** Výsledek kontroly umístění lomu – výchoz, na který lom padne. */
export interface QuarryCheck {
  ok: boolean;
  reason: string | null;
  outcrop: OutcropHit | null;
}

/**
 * Jde lom na místo `at`? Jen na skalní výchoz (`QUARRY_NO_OUTCROP`), na kterém ještě lom nestojí
 * ani se nestaví (`QUARRY_TAKEN`). Server i prohlížeč počítají totéž.
 */
export function checkQuarryPlacement(
  village: QuarrySites,
  obstacles: ObstacleLayer,
  at: { x: number; z: number },
): QuarryCheck {
  const outcrop = outcropAt(obstacles, at);
  if (!outcrop) return { ok: false, reason: QUARRY_NO_OUTCROP, outcrop: null };
  const taken =
    (village.quarries ?? []).some((q) => q.outcropId === outcrop.id) ||
    village.constructions.some((c) => c.kind === 'quarry' && c.quarryOutcrop === outcrop.id);
  if (taken) return { ok: false, reason: QUARRY_TAKEN, outcrop };
  return { ok: true, reason: null, outcrop };
}

/** Výsledek akce nad lomem – nový stav, nebo důvod česky. */
export type QuarryResult = { ok: true; state: VillageState } | { ok: false; reason: string };

/**
 * Hráč zahájí stavbu lomu u bodu `position` (střed padne na střed výchozu, natočení zůstane) –
 * `STONE.quarryLaborManDays` ze společné práce, bez dřeva. Vstupní stav nemění.
 */
export function startQuarry(
  state: VillageState,
  day: number,
  obstacles: ObstacleLayer,
  position: Position,
): QuarryResult {
  validateActionDay(state, day);
  const check = checkQuarryPlacement(state, obstacles, position);
  if (!check.ok || !check.outcrop) return { ok: false, reason: check.reason ?? QUARRY_NO_OUTCROP };
  const next = structuredClone(state);
  next.constructions.push({
    id: next.nextId++,
    kind: 'quarry',
    startedDay: day,
    cost: STONE.quarryLaborManDays,
    done: 0,
    dwellingType: null,
    position: { x: check.outcrop.x, z: check.outcrop.z, rotation: position.rotation },
    dwellingId: null,
    fieldId: null,
    quarryOutcrop: check.outcrop.id,
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

/**
 * Nošení 1 m³ kamene v nůších z lomu na vzdušnou vzdálenost `distanceM` (čd; fortifications.md –
 * Kámen, Nošení kamene a vůz): cesty po `STONE.carry.basketKg` tam i zpět tempem
 * `WATER_FETCHING.speedMps`, naložení a složení `STONE.carry.loadS`, den `WATER_FETCHING.dayHours`.
 */
export function stoneCarryManDaysPerM3(distanceM: number): number {
  const { basketKg, kgPerM3, loadS } = STONE.carry;
  const tripS = (2 * Math.max(0, distanceM)) / WATER_FETCHING.speedMps + loadS;
  return ((kgPerM3 / basketKg) * tripS) / (WATER_FETCHING.dayHours * 3600);
}

/**
 * Lámání a nošení 1 m³ z lomu na vzdálenost `distanceM` (čd): `STONE.quarryManDaysPerM3`
 * a nošení v nůších (`stoneCarryManDaysPerM3`).
 */
export function quarryManDaysPerM3(distanceM: number): number {
  return STONE.quarryManDaysPerM3 + stoneCarryManDaysPerM3(distanceM);
}

// --- vůz s kamenem --------------------------------------------------------------------------

/**
 * Vůz s kamenem pro jednu stavbu na dnešek (wagons.md – Co vozy vozí, bod 5; fortifications.md –
 * Kámen, Nošení kamene a vůz): kolik kamene za den nejvýš uveze (m³), práce posádky na m³ (čd),
 * nošení v nůších na m³, které nahradí (čd), a náklad jedné jízdy (m³). Plán dne – `planCartJobs`.
 */
export interface StoneCart {
  constructionId: number;
  outcropId: number;
  maxM3: number;
  crewPerM3: number;
  carryPerM3: number;
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
  const b = STONE.quarryManDaysPerM3;
  const { carryPerM3: c, crewPerM3: k } = cart;
  if (!(labor > 0) || share <= 0) return { progress: Math.max(0, labor), m3: 0 };
  const m3 = Math.min(cart.maxM3, (share * labor) / (b + c - share * (c - k)));
  return { progress: labor + m3 * (c - k), m3 };
}

/** Práce, za kterou stavba s vozem `cart` postoupí o `progress` čd (obrácená `stoneCartProgress`). */
export function stoneCartLabor(progress: number, share: number, cart: StoneCart): number {
  if (!(progress > 0)) return 0;
  const { carryPerM3: c, crewPerM3: k } = cart;
  const m3 = Math.min(cart.maxM3, (share * progress) / (STONE.quarryManDaysPerM3 + c));
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
  const share = Math.min(1, (stone.m3 * quarryManDaysPerM3(stone.distanceM)) / segments);
  return {
    outcropId: stone.outcropId,
    ahead: Math.max(0, woodFellingCost(c.wood) - c.done),
    share,
  };
}

/** Nošení 1 m³ kamene stavby `c` v nůších (čd) – zásoba z ceny zakázky, hradba ze vzdálenosti. */
export function constructionStoneCarry(c: Construction): number {
  if (c.kind === 'quarrying') {
    const m3 = c.stoneOrderM3 ?? 0;
    return m3 > 0 ? Math.max(0, c.cost / m3 - STONE.quarryManDaysPerM3) : 0;
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
 * Práce zakázky „nalámat do zásoby“ `m3` v lomu `quarry` (čd): lámání a nošení k hromadě u cesty
 * nejblíž dvorci (`logArrivalPoint`) – tam se kámen složí.
 */
export function stockQuarryingManDays(state: VillageState, quarry: Quarry, m3: number): number {
  const to = logArrivalPoint(state);
  const d = Math.sqrt(
    (quarry.x - to.x) * (quarry.x - to.x) + (quarry.z - to.z) * (quarry.z - to.z),
  );
  return m3 * quarryManDaysPerM3(d);
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
