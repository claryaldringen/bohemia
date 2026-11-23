import { length2 } from '../landscape/det-math';
import type { Random } from '../landscape/random';
import { HUNT_FIGHT, HUNT_QUARRY } from '../village/rules/rules-wildlife';
import type { HuntResult, QuarryKind } from '../village/types';
import { shotHit, spreadRadiusM, type ShotCandidate } from './aim';
import { alongEdge, hitDamage, NO_WALLS, paceAt } from './battle';
import { marchPath, marchReachable } from './march';
import { marchCellCenter, type MarchGrid, type Pos } from './march-grid';
import { lineClear } from './march-smooth';
import { dist2 } from './orders';
import { WAR } from './rules-war';
import { TICKS_PER_SECOND } from './ticks';

// Souboj se zvěří (hunting.md – Pravidla 4–7; plán 2026-11-22-hunting – Rozhodnutí 5, 7, 9):
// vyhnané zvíře a útočníci po taktech jako boj (4 za sekundu) s čísly a primitivy boje – tempo
// pochodu (`WAR.pace`), rána zblízka a šíp (`WAR.combat`, `hitDamage`, `spreadRadiusM`,
// `shotHit`), padlý či raněný (`WAR.downed`), krok po mřížce (`paceAt`, `alongEdge` bez stěn).
// `battleTick` se nepoužije – je svázaný s tažením, opevněním a skupinami. Pořadí taktu je pevné:
// zvíře (stav, pohyb, rána) → útočníci podle `personId` (pohyb všech, pak rány a šípy) → rány se
// použijí po všech (zvíře, pak lovci a koně) → konec. Stav je JSON, takt čte jen stav, pole
// a náhodu taktu – výsledek nezávisí na kouscích taktů. Jen det-math.

/**
 * Stav zvířete: `hidden` v lese (honci ještě nedošli), `stand`, `flee` (utíká – i vyběhnutí
 * z lesa), `spent` (uštvané stojí), `charge` (útočí), `dead`, `escape` (běží zpět do lesa), `gone`.
 */
export type QuarryState =
  'hidden' | 'stand' | 'flee' | 'spent' | 'charge' | 'dead' | 'escape' | 'gone';

/** Vyhnané zvíře (čísla druhu v `HUNT_QUARRY`). */
export interface Quarry {
  kind: QuarryKind;
  pos: Pos;
  /** Směr pohledu (jednotkový) – scéna. */
  heading: Pos;
  /** Kam běží po vyběhnutí z lesa (`releaseQuarry`); dál null. */
  goal: Pos | null;
  health: number;
  /** Sekundy útěku, které zvíře ještě vydrží (jelen, laň). */
  stamina: number;
  state: QuarryState;
  /** Takty do další rány (kanec, bachyně, vlk, medvěd – odstup `WAR.combat.meleeSeconds`). */
  cooldown: number;
  /** Na koho útočí (personId). */
  aim: number | null;
  /** Kolikrát bylo zasaženo – scéna pozná ránu. */
  hits: number;
  /** Dveře lesa – odsud vyběhlo, sem při útěku zmizí. */
  door: Pos;
}

/** Dovednosti lovce 0–100 – i herní hodiny výcviku po dovednostech. */
export interface HuntSkills {
  bow: number;
  combat: number;
  riding: number;
}

/** Útočník, kterého hráč (nebo správce) pošle na zvíře. */
export interface NewHunter {
  personId: number;
  pos: Pos;
  mounted: boolean;
  /** Síla v boji teď (na koni `strengthMounted`) a pěšky. */
  strength: number;
  footStrength: number;
  skills: HuntSkills;
  /** Muž rodu – nosí luk; padlý z něj zemře 1 : 3 (jako v boji), vesničan 1 : 1. */
  lineMan: boolean;
  health: number;
}

/** Útočník v souboji. */
export interface HuntFighter extends NewHunter {
  horseHealth: number | null;
  state: 'chase' | 'fight' | 'down';
  killed: boolean;
  cooldown: number;
  hits: number;
  /**
   * Herní hodiny výcviku z honby z koně, boje zblízka a střelby (Rozhodnutí 7) – syrové za celý
   * lov; strop `HUNT_FIGHT.maxHours` až ve výsledku (`fightResult`).
   */
  hours: HuntSkills;
  /** Kůň padl (kanec, bachyně, medvěd) – jezdec bojuje dál pěšky; ves koně ztratí. */
  horseLost?: true;
  /**
   * Hráč mu dal jiný rozkaz (`dropHunters`) – v souboji dál nejedná, zvíře si ho nevšímá; hodiny
   * výcviku a zranění mu zůstanou pro výsledek. Nový útok (`addHunters`) ho vrátí.
   */
  left?: true;
  /**
   * Objížďka neprůchodné buňky po mřížce (`marchPath`): body, kudy jde ke zvířeti, než na něj
   * vede přímka; chybí = jde rovně. Stav je JSON a nezávisí na dělení taktů.
   */
  route?: Pos[];
  /** Takt souboje, kdy muž naposled hledal objížďku (nejvýš jednou za `DETOUR_RETRY_TICKS`). */
  detourTick?: number;
}

/** Souboj se zvířetem (JSON). */
export interface HuntFight {
  quarry: Quarry;
  hunters: HuntFighter[];
  tick: number;
  /** Poslední takt, kdy na zvíře šel útočník na nohou – útěk po `HUNT_FIGHT.idleS`. */
  activeTick: number;
  outcome: 'ongoing' | 'killed' | 'escaped';
  /** Kdo zvíře složil. */
  killer: number | null;
}

/** Pole souboje: mřížka pochodu (null = rovná louka) a herní hodiny taktu (výcvik). */
export interface HuntField {
  grid: MarchGrid | null;
  hoursPerTick: number;
}

/** Čísla druhu zvířete. */
type QuarryRules = (typeof HUNT_QUARRY)[QuarryKind];
/** Jelen a laň – utíkají a unavují se. */
type FlightRules = Extract<QuarryRules, { staminaS: number }>;
/** Kanec, bachyně, vlk a medvěd – brání se. */
type DefendRules = Extract<QuarryRules, { chargeM: number }>;

const C = WAR.combat;
const MELEE_TICKS = C.meleeSeconds * TICKS_PER_SECOND;
const BOW_TICKS = C.bowSeconds * TICKS_PER_SECOND;
const MELEE_M2 = C.meleeM * C.meleeM;
const BOW_MIN_M2 = C.bowMinM * C.bowMinM;
const BOW_MAX_M2 = C.bowMaxM * C.bowMaxM;
const IDLE_TICKS = HUNT_FIGHT.idleS * TICKS_PER_SECOND;
/** Objížďku hledá lovec nejvýš jednou za tolik taktů (jako v boji – výkon). */
const DETOUR_RETRY_TICKS = WAR.battle.detourRetryTicks;
/** Cíl kroku útěku – dost daleko, aby krok měl plnou délku. */
const FLEE_REACH_M = 1000;
const NO_FILLS = NO_WALLS.fills;
/**
 * Kanec a bachyně – rána zblízka jen nad branou umu (`HUNT_FIGHT.boarGate`; hunting.md – Pravidla
 * 4: „rána shora za krk“).
 */
const GATED: ReadonlySet<QuarryKind> = new Set<QuarryKind>(['boar', 'sow']);
/**
 * Kanec, bachyně a medvěd – zásah jezdce smí jít do koně (`HUNT_FIGHT.horseHitShare`; hunting.md –
 * Pravidla 6); vlk jde vždy po jezdci.
 */
const HORSE_HITTERS: ReadonlySet<QuarryKind> = new Set<QuarryKind>(['boar', 'sow', 'bear']);
/** Kandidát šípu – zvíře (ostatní kandidáti jsou lovci podle `personId`). */
const QUARRY_ID = 'quarry';
/** Viditelná plocha lovce pro šíp – stojící muž (`WAR.combat.aim`). */
const HUNTER_AREA_M2 = C.aim.visibleM2.standing;

/** Nový souboj: zvíře `kind` skryté v lese u dveří `door`, bez útočníků. */
export function newHuntFight(kind: QuarryKind, door: Pos, tick: number): HuntFight {
  const r = HUNT_QUARRY[kind];
  return {
    quarry: {
      kind,
      pos: { x: door.x, z: door.z },
      heading: { x: 1, z: 0 },
      goal: null,
      health: r.health,
      stamina: r.staminaS ?? 0,
      state: 'hidden',
      cooldown: 0,
      aim: null,
      hits: 0,
      door: { x: door.x, z: door.z },
    },
    hunters: [],
    tick,
    activeTick: tick,
    outcome: 'ongoing',
    killer: null,
  };
}

/**
 * Honci došli k lesu – skryté zvíře vyběhne k bodu `out` (Rozhodnutí 4: `HUNT_FIGHT.emergeM` m ke
 * dvorci). Odtud běží nečinnost (`idleS`) – honci k lesu jdou déle. Jinak nic.
 */
export function releaseQuarry(f: HuntFight, out: Pos, tick: number): void {
  const q = f.quarry;
  if (f.outcome !== 'ongoing' || q.state !== 'hidden') return;
  q.state = 'flee';
  q.goal = { x: out.x, z: out.z };
  face(q, out.x - q.pos.x, out.z - q.pos.z);
  f.activeTick = tick;
}

/**
 * Útočníci na zvíře (povel hráče). Kdo už útočí, nebo padl, se nepřidá znovu; odvolaný
 * (`dropHunters`) se vrátí s polohou, koněm a silou z `hunters` a s hodinami výcviku z dřívějška –
 * komu v souboji padl kůň (`horseLost`), ten se vrátí pěšky. Povel je činnost – posune `activeTick`.
 */
export function addHunters(f: HuntFight, hunters: readonly NewHunter[], tick: number): void {
  if (f.outcome !== 'ongoing') return;
  let joined = false;
  for (const h of hunters) {
    const i = f.hunters.findIndex((x) => x.personId === h.personId);
    const prev = f.hunters[i];
    if (!prev) {
      f.hunters.push({
        ...newHunter(h),
        horseHealth: h.mounted ? HUNT_FIGHT.horseHealth : null,
        state: 'chase',
        killed: false,
        cooldown: 0,
        hits: 0,
        hours: { bow: 0, combat: 0, riding: 0 },
      });
    } else if (prev.left && prev.state !== 'down') {
      // zraněný kůň zůstane zraněný; nový (nebo žádný dřív) má plné zdraví; padlý kůň se nevrátí
      const horse = prev.horseHealth !== null && prev.horseHealth > 0 ? prev.horseHealth : null;
      const back: HuntFighter = {
        ...prev,
        ...newHunter(h),
        horseHealth: h.mounted ? (horse ?? HUNT_FIGHT.horseHealth) : null,
        state: 'chase',
      };
      delete back.left;
      if (back.horseLost) unhorse(back);
      f.hunters[i] = back;
    } else {
      continue;
    }
    joined = true;
  }
  if (!joined) return;
  f.hunters.sort((a, b) => a.personId - b.personId);
  f.activeTick = Math.max(f.activeTick, tick);
}

/**
 * Hráč útočníkům dal jiný rozkaz – v souboji dál nejednají (`HuntFighter.left`); hodiny výcviku
 * a zranění jim zůstanou pro výsledek. Padlých se to netýká.
 */
export function dropHunters(f: HuntFight, personIds: readonly number[]): void {
  const ids = new Set(personIds);
  for (const h of f.hunters) {
    if (ids.has(h.personId) && h.state !== 'down') h.left = true;
  }
}

/**
 * Výsledek souboje pro ves (`applyHuntResult`; hunting.md – Pravidla 5–7): jména útočníků podle
 * `personId` (kdo zvíře složil, napřed; chybějící jméno se vynechá), výcvik každého s hodinami nad
 * nulou – strop `HUNT_FIGHT.maxHours` zkrátí všechny dovednosti stejným dílem (návrh Clauda),
 * padlí (`killed` → `dead`, jinak `wounded`) a padlí koně podle `horses` (kůň jezdce podle
 * `personId`). Bere všechny útočníky, i odvolané (`left`) – výcvik a zranění jim zůstanou. Stav
 * souboje nemění.
 */
export function fightResult(
  f: HuntFight,
  names: ReadonlyMap<number, string>,
  horses: ReadonlyMap<number, number>,
): HuntResult {
  const killer = f.hunters.filter((h) => h.personId === f.killer);
  const order = [...killer, ...f.hunters.filter((h) => h.personId !== f.killer)];
  const result: HuntResult = {
    quarry: f.quarry.kind,
    killed: f.outcome === 'killed',
    names: [],
    trained: [],
    casualties: [],
    horsesLost: [],
  };
  for (const h of order) {
    const name = names.get(h.personId);
    if (name !== undefined) result.names.push(name);
  }
  for (const h of f.hunters) {
    const hours = cappedHours(h.hours);
    if (hours) result.trained.push({ personId: h.personId, hours });
    if (h.state === 'down') {
      result.casualties.push({ personId: h.personId, outcome: h.killed ? 'dead' : 'wounded' });
    }
    const horse = h.horseLost ? horses.get(h.personId) : undefined;
    if (horse !== undefined) result.horsesLost.push(horse);
  }
  return result;
}

/** Hodiny výcviku se stropem `maxHours` (stejným dílem); null = nic necvičil. */
function cappedHours(t: HuntSkills): HuntSkills | null {
  const sum = t.bow + t.combat + t.riding;
  if (sum <= 0) return null;
  const k = sum > HUNT_FIGHT.maxHours ? HUNT_FIGHT.maxHours / sum : 1;
  return { bow: t.bow * k, combat: t.combat * k, riding: t.riding * k };
}

/**
 * Jeden takt souboje (mění `f` na místě, `f.tick + 1`); po konci (`outcome` ≠ ongoing) nic.
 * Skryté zvíře čeká – takt jen přičte. Činnost (posune `activeTick`): útočník na nohou s povelem
 * se ke zvířeti přiblížil (nebo šel po objížďce), má je na dosah rány či střely, nebo zvíře před
 * lovci utíká (honba); kdo jen klouže podél překážky či přešlapuje, činný není (návrh Clauda –
 * lov bez postupu skončí, i když hráč nic nezadá). Po `idleS × TICKS_PER_SECOND` taktech bez něj zvíře běží k `door`
 * (`escape`) a u dveří zmizí (`gone`, `escaped`).
 */
export function huntFightTick(f: HuntFight, field: HuntField, rng: Random): void {
  if (f.outcome !== 'ongoing') return;
  f.tick++;
  const q = f.quarry;
  if (q.state === 'hidden') return;
  const hunters = f.hunters.filter(onFoot);
  const wounds: Wounds = new Map();
  const was = q.pos;
  quarryStep(q, hunters, field.grid, rng, wounds);
  // honba: zvíře před lovci utíká a opravdu se pohnulo (zaseklé v kapse nic neznamená); činností
  // je jen tehdy, když se k němu týž takt pohnul aspoň jeden lovec (viz `huntersStep`)
  const fleeing = q.state === 'flee' && q.goal === null && !samePos(q.pos, was);
  const blows =
    q.state === 'escape' || q.state === 'gone'
      ? []
      : huntersStep(f, hunters, field, rng, wounds, fleeing);
  applyBlows(f, blows);
  applyWounds(f, wounds, rng);
  settle(f);
}

// --- Zvíře ------------------------------------------------------------------------------------

/** Stav, krok a rána zvířete v taktu. */
function quarryStep(
  q: Quarry,
  hunters: readonly HuntFighter[],
  grid: MarchGrid | null,
  rng: Random,
  wounds: Wounds,
): void {
  const r = HUNT_QUARRY[q.kind];
  const perTick = r.paceMS / TICKS_PER_SECOND;
  if (q.cooldown > 0) q.cooldown--;
  if (q.state === 'escape') {
    // u dveří, nebo k nim neprojde (zaseknuté u překážky – návrh Clauda) → zmizí v lese
    if (!moveTo(q, q.door, perTick, grid) || samePos(q.pos, q.door)) q.state = 'gone';
    return;
  }
  if (r.staminaS !== null) {
    flightStep(q, r, hunters, grid, perTick);
    return;
  }
  defendStep(q, r, hunters, grid, perTick, rng, wounds);
}

/**
 * Kanec, bachyně, vlk a medvěd (hunting.md – Pravidla 4, 6: „se brání“, mohou lovce zranit nebo
 * zabít): útočník do `chargeM` → útok (`charge`) na nejbližšího – běží k němu a na dosah rány
 * udeří po odstupu `meleeSeconds`, zda rána padne, los 1 : 1 (`WAR.combat`), ubere
 * `hitDamage(síla zvířete)`. Zásah kance, bachyně a medvěda do jezdce jde losem `horseHitShare`
 * do koně. Nikdo blízko – vyběhne z lesa a stojí.
 */
function defendStep(
  q: Quarry,
  r: DefendRules,
  hunters: readonly HuntFighter[],
  grid: MarchGrid | null,
  perTick: number,
  rng: Random,
  wounds: Wounds,
): void {
  const near = nearestHunter(q.pos, hunters);
  if (!near || dist2(near.pos, q.pos) > r.chargeM * r.chargeM) {
    q.aim = null;
    if (q.goal) runOut(q, q.goal, perTick, grid);
    else q.state = 'stand';
    return;
  }
  q.goal = null;
  q.state = 'charge';
  q.aim = near.personId;
  if (dist2(near.pos, q.pos) > MELEE_M2) moveTo(q, near.pos, perTick, grid);
  else face(q, near.pos.x - q.pos.x, near.pos.z - q.pos.z);
  if (q.cooldown > 0 || dist2(near.pos, q.pos) > MELEE_M2) return;
  q.cooldown = MELEE_TICKS;
  if (rng.next() >= C.hitChance) return;
  const horse = near.mounted && HORSE_HITTERS.has(q.kind) && rng.next() < HUNT_FIGHT.horseHitShare;
  wound(wounds, near.personId, hitDamage(r.strength, false), horse);
}

/**
 * Jelen a laň (hunting.md – Pravidla 4: „stačí je uštvat“): útočník do `alertM` a výdrž > 0 →
 * utíká od nejbližšího (výdrž −1 s za sekundu), jinak stojí a výdrž se vrací (`recoverPerS`).
 * Výdrž 0 → `spent` – stojí, dokud nenabere `spentUntil × staminaS`.
 */
function flightStep(
  q: Quarry,
  r: FlightRules,
  hunters: readonly HuntFighter[],
  grid: MarchGrid | null,
  perTick: number,
): void {
  const recover = r.recoverPerS / TICKS_PER_SECOND;
  if (q.state === 'spent') {
    q.stamina = Math.min(r.staminaS, q.stamina + recover);
    if (q.stamina < HUNT_FIGHT.spentUntil * r.staminaS) return;
    q.state = 'stand';
  }
  const near = nearestHunter(q.pos, hunters);
  if (near && dist2(near.pos, q.pos) <= r.alertM * r.alertM && q.stamina > 0) {
    q.goal = null;
    q.state = 'flee';
    let dx = q.pos.x - near.pos.x;
    let dz = q.pos.z - near.pos.z;
    const d = length2(dx, dz);
    // lovec přímo na zvířeti – dál po směru pohledu
    dx = d < 1e-9 ? q.heading.x : dx / d;
    dz = d < 1e-9 ? q.heading.z : dz / d;
    moveTo(q, { x: q.pos.x + dx * FLEE_REACH_M, z: q.pos.z + dz * FLEE_REACH_M }, perTick, grid);
    q.stamina = Math.max(0, q.stamina - 1 / TICKS_PER_SECOND);
    if (q.stamina === 0) q.state = 'spent';
    return;
  }
  if (q.goal) {
    runOut(q, q.goal, perTick, grid);
    return;
  }
  q.state = 'stand';
  q.stamina = Math.min(r.staminaS, q.stamina + recover);
}

/** Vyběhnutí z lesa k `goal` (bez únavy); u cíle, nebo když dál neprojde, stojí. */
function runOut(q: Quarry, goal: Pos, perTick: number, grid: MarchGrid | null): void {
  if (moveTo(q, goal, perTick, grid) && !samePos(q.pos, goal)) {
    q.state = 'flee';
    return;
  }
  q.goal = null;
  q.state = 'stand';
}

/** Krok zvířete k `to` a směr pohledu po kroku; vrací, zda se pohnulo. */
function moveTo(q: Quarry, to: Pos, perTick: number, grid: MarchGrid | null): boolean {
  const next = stepToward(q.pos, to, perTick, grid);
  if (!next) return false;
  face(q, next.x - q.pos.x, next.z - q.pos.z);
  q.pos = next;
  return true;
}

function face(q: Quarry, dx: number, dz: number): void {
  const d = length2(dx, dz);
  if (d < 1e-9) return;
  q.heading = { x: dx / d, z: dz / d };
}

// --- Útočníci ---------------------------------------------------------------------------------

/** Rána, která padla: kdo a kolik ubrala. */
interface Blow {
  personId: number;
  damage: number;
  /**
   * Šíp – kance a bachyni jen zraní (zdraví nejvýš na 1; nižší nezvedne, sraženého úderem
   * neoživí), smrtelná je rána úderem.
   */
  arrow?: true;
}

/** Útočník na nohou s povelem. */
function onFoot(h: HuntFighter): boolean {
  return h.state !== 'down' && h.left !== true;
}

function nearestHunter(p: Pos, hunters: readonly HuntFighter[]): HuntFighter | null {
  let best: HuntFighter | null = null;
  let bestD = Infinity;
  for (const h of hunters) {
    const d = dist2(h.pos, p);
    if (d < bestD) {
      bestD = d;
      best = h;
    }
  }
  return best;
}

/**
 * Útočníci v pořadí `personId`: napřed se pohnou všichni (šíp tak vidí lovce už na nových
 * místech – jako boj), pak rány. Krok ke zvířeti tempem pochodu (jezdec × `WAR.pace.riders`), na
 * dosah rány stojí. Rána zblízka po odstupu `meleeSeconds`, zda padne, los 1 : 1 (jeden
 * `rng.next()` na ránu); na kance a bachyni pod branou umu vždy mine (los se táhne i tak). Muž
 * rodu s lukem míří na zvíře v pásmu luku (20–60 m) a jde dál – zvíře lukem nedrží na odstup
 * (návrh Clauda) – a po odstupu `bowSeconds` vystřelí (`shoot`). Hodiny výcviku: takt na dosah
 * rány → boj, jinak takt, kdy je střela připravená (odstup 0) a zvíře v pásmu luku → luk, honba z koně → jízda.
 */
function huntersStep(
  f: HuntFight,
  hunters: readonly HuntFighter[],
  field: HuntField,
  rng: Random,
  wounds: Wounds,
  fleeing: boolean,
): Blow[] {
  const q = f.quarry;
  const walk = WAR.pace.metersPerSecond / TICKS_PER_SECOND;
  for (const h of hunters) {
    if (h.cooldown > 0) h.cooldown--;
    let moved = false;
    let progress = false;
    if (dist2(h.pos, q.pos) > MELEE_M2) {
      const step = walk * (h.mounted ? WAR.pace.riders : 1);
      const from = h.pos;
      [moved, progress] = approach(h, q.pos, f.tick, field.grid, step);
      // honba jen s pohybem lovce: jeho posun má kladnou složku ke zvířeti
      if (fleeing && moved && towards(from, h.pos, q.pos)) progress = true;
    }
    const d2 = dist2(h.pos, q.pos);
    const reach = d2 <= MELEE_M2;
    const aiming = !reach && bowReady(h, d2);
    h.state = reach ? 'fight' : 'chase';
    if (progress || reach || aiming) f.activeTick = f.tick;
    if (reach) train(h, 'combat', field.hoursPerTick);
    else if (aiming && h.cooldown === 0) train(h, 'bow', field.hoursPerTick);
    if (!reach && moved && h.mounted) train(h, 'riding', field.hoursPerTick);
  }
  const blows: Blow[] = [];
  for (const h of hunters) {
    if (h.cooldown > 0) continue;
    const d2 = dist2(h.pos, q.pos);
    if (d2 <= MELEE_M2) {
      h.cooldown = MELEE_TICKS;
      const lands = rng.next() < C.hitChance;
      if (lands && aboveGate(h, q.kind)) {
        blows.push({ personId: h.personId, damage: hitDamage(h.strength, false) });
      }
    } else if (bowReady(h, d2)) {
      h.cooldown = BOW_TICKS;
      shoot(h, q, hunters, d2, rng, blows, wounds);
    }
  }
  return blows;
}

/**
 * Rána zblízka na kance a bachyni padne jen nad branou umu (`HUNT_FIGHT.boarGate` – pěšky boj,
 * z koně boj i jízda); ostatní zvěř brána nechrání. Podle ní vybírá i správce (`npcHunters`).
 */
export function aboveGate(h: Pick<NewHunter, 'mounted' | 'skills'>, kind: QuarryKind): boolean {
  if (!GATED.has(kind)) return true;
  const g = HUNT_FIGHT.boarGate;
  if (!h.mounted) return h.skills.combat >= g.foot.combat;
  return h.skills.combat >= g.mounted.combat && h.skills.riding >= g.mounted.riding;
}

/**
 * Míří lukem: muž rodu (nosí luk) s dovedností luku nad nulou a zvíře v pásmu luku
 * (`bowMinM`–`bowMaxM`), mimo dosah rány zblízka.
 */
function bowReady(h: HuntFighter, d2: number): boolean {
  return h.lineMan && h.skills.bow > 0 && d2 > MELEE_M2 && d2 >= BOW_MIN_M2 && d2 <= BOW_MAX_M2;
}

/**
 * Výstřel na zvíře (war.md – Boj; fortifications.md – Střelba a viditelná plocha): kruh rozptylu
 * podle luku střelce a vzdálenosti (`spreadRadiusM`), v něm zvíře (`areaM2`) a ostatní lovci na
 * nohou (stojící muž); dva losy – zda šíp trefí a koho (`shotHit`). Zvíře i lovec ztratí
 * `hitDamage(síla střelce, luk)`.
 */
function shoot(
  h: HuntFighter,
  q: Quarry,
  hunters: readonly HuntFighter[],
  d2: number,
  rng: Random,
  blows: Blow[],
  wounds: Wounds,
): void {
  const radius = spreadRadiusM(h.skills.bow, Math.sqrt(d2));
  const r2 = radius * radius;
  const candidates: ShotCandidate[] = [
    { id: QUARRY_ID, side: 'defend', areaM2: HUNT_QUARRY[q.kind].areaM2 },
  ];
  for (const o of hunters) {
    if (o === h || dist2(o.pos, q.pos) > r2 + 1e-9) continue;
    candidates.push({ id: String(o.personId), side: 'attack', areaM2: HUNTER_AREA_M2 });
  }
  const roll = rng.next();
  const pick = rng.next();
  const hit = shotHit(candidates, radius, roll, pick);
  if (hit === null) return;
  const damage = hitDamage(h.strength, true);
  if (hit === QUARRY_ID) blows.push({ personId: h.personId, damage, arrow: true });
  else wound(wounds, Number(hit), damage, false);
}

/**
 * Hodiny výcviku (Rozhodnutí 7) – syrové za celý lov; strop `HUNT_FIGHT.maxHours` až ve výsledku
 * (`fightResult`), takže dělení mezi dovednosti odpovídá celému lovu, ne jeho konci.
 */
function train(h: HuntFighter, skill: keyof HuntSkills, hours: number): void {
  h.hours[skill] += hours;
}

/** Rány taktu po všech v pořadí útočníků; složil ho ten, jehož rána zdraví srazila na nulu. */
function applyBlows(f: HuntFight, blows: readonly Blow[]): void {
  const q = f.quarry;
  for (const b of blows) {
    const before = q.health;
    q.health -= b.damage;
    // „trefit se kanci shora přímo za krk“ umí jen úder přes bránu umu (návrh Clauda); šíp zdraví
    // nesrazí pod 1, ale ani nezvedne – prase, které týž takt srazil úder, neoživí
    if (b.arrow && GATED.has(q.kind) && before > 0) {
      q.health = Math.max(Math.min(1, before), q.health);
    }
    q.hits++;
    if (q.health <= 0 && f.killer === null) f.killer = b.personId;
  }
  if (q.health > 0) return;
  q.health = 0;
  q.state = 'dead';
  q.goal = null;
}

/** Rány lovcům v taktu podle `personId`: zdraví muže a koně a počet zásahů. */
type Wounds = Map<number, { man: number; horse: number; hits: number }>;

function wound(wounds: Wounds, personId: number, damage: number, horse: boolean): void {
  const w = wounds.get(personId) ?? { man: 0, horse: 0, hits: 0 };
  if (horse) w.horse += damage;
  else w.man += damage;
  w.hits++;
  wounds.set(personId, w);
}

/**
 * Rány lovcům po všech v pořadí `personId` (kdo padne, v tomto taktu ještě udeřil – jako boj):
 * kůň na nule padne (`horseLost`) a jezdec bojuje dál pěšky; muž na nule padne (`down`) – mrtvý,
 * nebo raněný losem jako v boji (`WAR.downed`: 1 : 1, muž rodu raněný 2 ze 3).
 */
function applyWounds(f: HuntFight, wounds: Wounds, rng: Random): void {
  if (wounds.size === 0) return;
  for (const h of f.hunters) {
    const w = wounds.get(h.personId);
    if (!w || h.state === 'down') continue;
    h.hits += w.hits;
    if (w.horse > 0 && h.horseHealth !== null) {
      h.horseHealth = Math.max(0, h.horseHealth - w.horse);
      if (h.horseHealth === 0) {
        h.horseLost = true;
        unhorse(h);
      }
    }
    if (w.man <= 0) continue;
    h.health -= w.man;
    if (h.health > 0) continue;
    h.health = 0;
    h.state = 'down';
    const killed = h.lineMan ? 1 - WAR.downed.lineWoundedShare : WAR.downed.killedShare;
    h.killed = rng.next() < killed;
  }
}

/** Jezdec bez koně (padl) – pěšky, síla pěšáka. */
function unhorse(h: HuntFighter): void {
  h.mounted = false;
  h.strength = h.footStrength;
  h.horseHealth = 0;
}

/** Konec taktu: zabité, zmizelé, nebo nečinnost → útěk do lesa. */
function settle(f: HuntFight): void {
  const q = f.quarry;
  if (q.state === 'dead') f.outcome = 'killed';
  else if (q.state === 'gone') f.outcome = 'escaped';
  else if (q.state !== 'escape' && f.tick - f.activeTick >= IDLE_TICKS) {
    q.state = 'escape';
    q.goal = null;
  }
}

// --- Pohyb ------------------------------------------------------------------------------------

/**
 * Krok lovce ke zvířeti na `to`. Vede-li přímka buňkou, kam boj nevstoupí (voda, les, sráz), jde po
 * objížďce (`route` z `marchPath`, jako `detour` v boji; hledá se nejvýš jednou za
 * `DETOUR_RETRY_TICKS`); jinak rovně (skluz podél kraje – `stepToward`). Vrací [pohnul se, postoupil]:
 * postup = přiblížil se, nebo šel po objížďce.
 */
function approach(
  h: HuntFighter,
  to: Pos,
  tick: number,
  grid: MarchGrid | null,
  step: number,
): [boolean, boolean] {
  let target = to;
  let routed = false;
  if (grid) {
    const open = (c: number): boolean => paceAt(grid, marchCellCenter(grid, c), NO_FILLS) > 0;
    if (lineClear(grid, h.pos, to, open)) delete h.route;
    else {
      while (h.route && h.route.length > 0 && dist2(h.pos, h.route[0]!) <= 1) h.route.shift();
      if (!h.route || h.route.length === 0) {
        delete h.route;
        const around = detourPoints(h, to, tick, grid);
        if (around) h.route = around;
      }
      if (h.route && h.route.length > 0) {
        target = h.route[0]!;
        routed = true;
      }
    }
  }
  const before = dist2(h.pos, to);
  const next = stepToward(h.pos, target, step, grid);
  if (!next) {
    delete h.route;
    return [false, false];
  }
  h.pos = next;
  return [true, routed || dist2(next, to) < before];
}

/** Má posun z `from` do `to` kladnou složku ve směru ke zvířeti na `target`? */
function towards(from: Pos, to: Pos, target: Pos): boolean {
  return (to.x - from.x) * (target.x - from.x) + (to.z - from.z) * (target.z - from.z) > 0;
}

/**
 * Vnitřní body trasy `marchPath` od lovce k `to` ; null = nehledá se (odstup
 * `DETOUR_RETRY_TICKS`), zvíře je v uzavřené kapse (nedosažitelné) nebo je trasa přímá.
 */
function detourPoints(h: HuntFighter, to: Pos, tick: number, grid: MarchGrid): Pos[] | null {
  if (h.detourTick !== undefined && tick - h.detourTick < DETOUR_RETRY_TICKS) return null;
  h.detourTick = tick;
  // zvíře v uzavřené kapse (cíl nedosažitelný) – lovec k nejbližšímu místu nechodí, jen stojí
  if (!marchReachable(grid, h.pos, to)) return null;
  const path = marchPath(grid, h.pos, to);
  if (!path) return null;
  const points = path.points.slice(1, -1);
  return points.length === 0 ? null : points.map((p) => ({ x: p.x, z: p.z }));
}

/**
 * Krok z `from` k `to` délkou `perTick` m × tempo buňky (`paceAt`; v neprůchodné × 1), bez mřížky
 * rovná louka; na dosah kroku přímo do `to`. Krok do buňky s tempem 0 sklouzne podél jejího kraje
 * (`alongEdge`), z mapy ven nevede. Null = nepohne se.
 */
function stepToward(from: Pos, to: Pos, perTick: number, grid: MarchGrid | null): Pos | null {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const d = length2(dx, dz);
  if (d < 1e-9) return null;
  const here = grid ? paceAt(grid, from, NO_FILLS) : 1;
  const step = perTick * (here > 0 ? here : 1);
  let q =
    step >= d ? { x: to.x, z: to.z } : { x: from.x + (dx / d) * step, z: from.z + (dz / d) * step };
  if (!grid) return q;
  q = onMap(grid, q);
  if (paceAt(grid, q, NO_FILLS) <= 0) {
    const slid = alongEdge(from, q, grid, NO_WALLS);
    if (!slid) return null;
    q = slid;
  }
  return samePos(q, from) ? null : q;
}

/** Bod sevřený do mapy mřížky (středy krajních buněk). */
function onMap(grid: MarchGrid, p: Pos): Pos {
  const maxX = grid.originX + (grid.width - 1) * grid.cellM;
  const maxZ = grid.originZ + (grid.height - 1) * grid.cellM;
  const x = Math.min(maxX, Math.max(grid.originX, p.x));
  const z = Math.min(maxZ, Math.max(grid.originZ, p.z));
  return x === p.x && z === p.z ? p : { x, z };
}

function samePos(a: Pos, b: Pos): boolean {
  return a.x === b.x && a.z === b.z;
}

/** Kopie údajů nového útočníka (stav souboje nesdílí objekty volajícího). */
function newHunter(h: NewHunter): NewHunter {
  return {
    personId: h.personId,
    pos: { x: h.pos.x, z: h.pos.z },
    mounted: h.mounted,
    strength: h.strength,
    footStrength: h.footStrength,
    skills: { bow: h.skills.bow, combat: h.skills.combat, riding: h.skills.riding },
    lineMan: h.lineMan,
    health: h.health,
  };
}
