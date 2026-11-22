import { length2 } from '../landscape/det-math';
import type { Random } from '../landscape/random';
import { HUNT_FIGHT, HUNT_QUARRY } from '../village/rules/rules-wildlife';
import type { QuarryKind } from '../village/types';
import { alongEdge, hitDamage, NO_WALLS, paceAt } from './battle';
import type { MarchGrid, Pos } from './march-grid';
import { dist2 } from './orders';
import { WAR } from './rules-war';
import { TICKS_PER_SECOND } from './ticks';

// Souboj se zvěří (hunting.md – Pravidla 4–7; plán 2026-11-22-hunting – Rozhodnutí 5, 7, 9):
// vyhnané zvíře a útočníci po taktech jako boj (4 za sekundu) s čísly a primitivy boje – tempo
// pochodu (`WAR.pace`), rána zblízka (`WAR.combat`, `hitDamage`), krok po mřížce (`paceAt`,
// `alongEdge` bez stěn). `battleTick` se nepoužije – je svázaný s tažením, opevněním a skupinami.
// Pořadí taktu je pevné: zvíře (stav, pohyb) → útočníci podle `personId` (pohyb, rány) → rány se
// použijí po všech → konec. Stav je JSON, takt čte jen stav, pole a náhodu taktu – výsledek
// nezávisí na kouscích taktů. Jen det-math.

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
  /** Herní hodiny výcviku z honby a boje (Rozhodnutí 7). */
  hours: HuntSkills;
  horseLost?: true;
  /**
   * Hráč mu dal jiný rozkaz (`dropHunters`) – v souboji dál nejedná, zvíře si ho nevšímá; hodiny
   * výcviku a zranění mu zůstanou pro výsledek. Nový útok (`addHunters`) ho vrátí.
   */
  left?: true;
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

const MELEE_TICKS = WAR.combat.meleeSeconds * TICKS_PER_SECOND;
const MELEE_M2 = WAR.combat.meleeM * WAR.combat.meleeM;
const IDLE_TICKS = HUNT_FIGHT.idleS * TICKS_PER_SECOND;
/** Zdraví koně jezdce na začátku lovu – jako muž (`WAR.combat.health`). */
const HORSE_HEALTH = WAR.combat.health;
/** Cíl kroku útěku – dost daleko, aby krok měl plnou délku. */
const FLEE_REACH_M = 1000;
const NO_FILLS = NO_WALLS.fills;

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
 * (`dropHunters`) se vrátí s polohou, koněm a silou z `hunters` a s hodinami výcviku z dřívějška.
 * Povel je činnost – posune `activeTick`.
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
        horseHealth: h.mounted ? HORSE_HEALTH : null,
        state: 'chase',
        killed: false,
        cooldown: 0,
        hits: 0,
        hours: { bow: 0, combat: 0, riding: 0 },
      });
    } else if (prev.left && prev.state !== 'down') {
      // zraněný kůň zůstane zraněný; nový (nebo žádný dřív) má plné zdraví
      const horse = prev.horseHealth !== null && prev.horseHealth > 0 ? prev.horseHealth : null;
      const back: HuntFighter = {
        ...prev,
        ...newHunter(h),
        horseHealth: h.mounted ? (horse ?? HORSE_HEALTH) : null,
        state: 'chase',
      };
      delete back.left;
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
 * Jeden takt souboje (mění `f` na místě, `f.tick + 1`); po konci (`outcome` ≠ ongoing) nic.
 * Skryté zvíře čeká – takt jen přičte. Útočník na nohou s povelem, který se ten takt pohnul,
 * nebo má zvíře na dosah rány, posune `activeTick` (lovec zaseknutý u překážky jen stojí – návrh
 * Clauda); po `idleS × TICKS_PER_SECOND` taktech bez něj zvíře běží k `door` (`escape`) a u dveří
 * zmizí (`gone`, `escaped`).
 */
export function huntFightTick(f: HuntFight, field: HuntField, rng: Random): void {
  if (f.outcome !== 'ongoing') return;
  f.tick++;
  const q = f.quarry;
  if (q.state === 'hidden') return;
  const hunters = f.hunters.filter(onFoot);
  quarryStep(q, hunters, field.grid);
  const blows =
    q.state === 'escape' || q.state === 'gone' ? [] : huntersStep(f, hunters, field, rng);
  applyBlows(f, blows);
  settle(f);
}

// --- Zvíře ------------------------------------------------------------------------------------

/** Stav a krok zvířete v taktu. */
function quarryStep(q: Quarry, hunters: readonly HuntFighter[], grid: MarchGrid | null): void {
  const r = HUNT_QUARRY[q.kind];
  const perTick = r.paceMS / TICKS_PER_SECOND;
  if (q.state === 'escape') {
    // u dveří, nebo k nim neprojde (zaseknuté u překážky – návrh Clauda) → zmizí v lese
    if (!moveTo(q, q.door, perTick, grid) || samePos(q.pos, q.door)) q.state = 'gone';
    return;
  }
  if (r.staminaS !== null) {
    flightStep(q, r, hunters, grid, perTick);
    return;
  }
  // kanec, bachyně, vlk a medvěd zatím jen vyběhnou a stojí
  if (q.goal) runOut(q, q.goal, perTick, grid);
  else q.state = 'stand';
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
 * Útočníci v pořadí `personId`: krok ke zvířeti tempem pochodu (jezdec × `WAR.pace.riders`), na
 * dosah rány stojí; rána zblízka po odstupu `meleeSeconds`, zda padne, los 1 : 1 (jeden
 * `rng.next()` na ránu). Hodiny výcviku: takt na dosah rány → boj, honba z koně → jízda.
 */
function huntersStep(
  f: HuntFight,
  hunters: readonly HuntFighter[],
  field: HuntField,
  rng: Random,
): Blow[] {
  const q = f.quarry;
  const walk = WAR.pace.metersPerSecond / TICKS_PER_SECOND;
  const blows: Blow[] = [];
  for (const h of hunters) {
    if (h.cooldown > 0) h.cooldown--;
    let moved = false;
    if (dist2(h.pos, q.pos) > MELEE_M2) {
      const next = stepToward(h.pos, q.pos, walk * (h.mounted ? WAR.pace.riders : 1), field.grid);
      if (next) {
        h.pos = next;
        moved = true;
      }
    }
    const reach = dist2(h.pos, q.pos) <= MELEE_M2;
    h.state = reach ? 'fight' : 'chase';
    if (moved || reach) f.activeTick = f.tick;
    if (reach) train(h, 'combat', field.hoursPerTick);
    else if (moved && h.mounted) train(h, 'riding', field.hoursPerTick);
    if (!reach || h.cooldown > 0) continue;
    h.cooldown = MELEE_TICKS;
    if (rng.next() < WAR.combat.hitChance) {
      blows.push({ personId: h.personId, damage: hitDamage(h.strength, false) });
    }
  }
  return blows;
}

/**
 * Hodiny výcviku (Rozhodnutí 7): součet nejvýš `HUNT_FIGHT.maxHours` – přetečení zkrátí všechny
 * dovednosti stejným dílem, takže jezdec cvičí jízdu i boj, i když honba sama 6 h přesáhne
 * (návrh Clauda).
 */
function train(h: HuntFighter, skill: keyof HuntSkills, hours: number): void {
  const t = h.hours;
  t[skill] += hours;
  const sum = t.bow + t.combat + t.riding;
  if (sum <= HUNT_FIGHT.maxHours) return;
  const k = HUNT_FIGHT.maxHours / sum;
  t.bow *= k;
  t.combat *= k;
  t.riding *= k;
}

/** Rány taktu po všech v pořadí útočníků; složil ho ten, jehož rána zdraví srazila na nulu. */
function applyBlows(f: HuntFight, blows: readonly Blow[]): void {
  const q = f.quarry;
  for (const b of blows) {
    q.health -= b.damage;
    q.hits++;
    if (q.health <= 0 && f.killer === null) f.killer = b.personId;
  }
  if (q.health > 0) return;
  q.health = 0;
  q.state = 'dead';
  q.goal = null;
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
