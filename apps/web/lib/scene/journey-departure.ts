// Odjezd a příjezd výjezdu vojvody ve scéně vsi (lord-control.md – Ve scéně; journey.md – Scéna vsi
// – Odjezd a příjezd). Po vyslání jde každý jezdec z dvorce ke kůlu, jeho kůň tam dojde z ohrady
// jako před jízdou dne rodiny (riders.ts – `leadPath`, `leadPose`, `LEAD_M_S`, `LEAD_WAIT_S`),
// jezdec nasedne a vyjede branou dvorce; pěší jdou k bráně rovnou. Za branou každý dožene své místo
// ve skupině, kterou ukazuje server (journey-riders.ts – `JourneyGlide`) – svižněji, plynule, bez
// skoku. Návrat opačně: k bráně, u kůlu sesednout, kůň do ohrady u branky, muži do dvorce. Jen
// podívaná – server o odjezdu ani příjezdu neví. Čas je výkonový (ms jako `JourneyGlide`) a přichází
// parametrem – čistá logika bez Babylonu.
import type { JourneyPhase, Pos } from '@bohemia/game';
import type { SceneVillage } from '../village-view';
import { STAND_M_S, WALK_M_S, unit, type ArmyAnimal } from './army';
import type { RiderPose, SceneJourney } from './journey-riders';
import type { LivestockPose } from './livestock-motion';
import { RIDE_PACE } from './rider-route';
import { LEAD_M_S, LEAD_WAIT_S, leadPose, type RideLead } from './riders';
import type { TrainingSpot } from './training-ground-layout';

/** Výjezd ve scéně: odjíždí (z dvorce ke skupině), jede se skupinou, přijíždí (do dvorce). */
export type JourneyScenePhase = 'departing' | 'riding' | 'arriving';

/** Kůň jezdce vsi u kůlu: kde stojí (čelem ke kůlu) a cesta z ohrady (null – stojí u kůlu). */
export interface YardHorse {
  riderId: number;
  horseId: number;
  spot: TrainingSpot;
  lead: RideLead | null;
}

/** Místa dvorce pro odjezd a příjezd (villager-plan-lord.ts – `journeyYard`). */
export interface JourneyYard {
  /** Vchod dvorce – odtud muži vyjdou a sem vejdou. */
  door: Pos;
  /** Brána dvorce; bez pozemku (zemnice) kůl na koně. */
  gate: Pos;
  horses: readonly YardHorse[];
}

/**
 * Čerstvě vyslaný výjezd (m): skupina podle serveru stojí nejvýš tak daleko od domova výjezdu, odkud
 * ji jádro vysílá (`SceneJourney.home` – dvorec vsi), a jede ven – načtení stránky uprostřed výjezdu
 * odjezd nepřehraje.
 */
export const FRESH_M = 30;
/** Vracející se skupina tak blízko domova výjezdu (m) začne příjezd; jinak, až výjezd skončí. */
export const ARRIVE_M = 30;
/**
 * Vlastní výjezd, který ze scény zmizel nejvýš tak daleko od domova (m), skončil doma – přijede
 * (návrh Clauda). Worker ukládá kontrolní bod po 10 s (`WAR.campaign.checkpointTicks`), krátký návrat
 * tak scéna ve fázi `returning` vůbec nemusí uvidět. Skupina, která odjela přes okraj mapy, zmizí
 * u okraje – daleko od vsi.
 */
export const HOME_REACH_M = 150;
/** Za branou muži dohánějí skupinu a při návratu jedou k bráně (m/s – návrh Clauda). */
export const CATCH_M_S = { foot: 3, mounted: 4.5 } as const;
/** Nejkratší dohánění (s) – i blízké místo se dojde plynule. */
const CATCH_MIN_S = 1;
/** Muži vycházejí z dvorce po sobě (s). */
const DOOR_GAP_S = 0.8;
/** Jezdec stojí u koně vlevo (m – riders.ts `riderPose`). */
const BESIDE_M = 0.8;

/** Úsek cesty muže: od–do (s od začátku), z bodu do bodu, na koni, skrytý (v dvorci). */
interface Leg {
  t0: number;
  t1: number;
  a: Pos;
  b: Pos;
  mounted: boolean;
  hidden?: true;
  /** Kam hledí, když stojí. */
  face?: Pos;
}

/**
 * Kůň bez jezdce: z ohrady ke kůlu do `until` s, pak nese jezdce (`back` false), nebo od sesednutí
 * `from` s do ohrady, kam vejde v `until` s (`back`).
 */
interface LedScript {
  horseId: number;
  lead: RideLead | null;
  spot: TrainingSpot;
  back: boolean;
  from: number;
  until: number;
}

/** Odjezd nebo příjezd jednoho muže výjezdu. */
export interface ManScript {
  key: string;
  personId: number | null;
  lord: boolean;
  wounded: boolean;
  /** Ve skupině na koni. */
  mounted: boolean;
  legs: Leg[];
  /** Konec úseků (s): odjezd – pak dohání skupinu; příjezd – pak je v dvorci. */
  end: number;
  horse: LedScript | null;
}

/** Cesta skládaná po úsecích. */
class Path {
  readonly legs: Leg[] = [];
  s = 0;
  constructor(public at: Pos) {}

  go(to: Pos, speed: number, mounted: boolean): void {
    const dur = Math.hypot(to.x - this.at.x, to.z - this.at.z) / speed;
    if (dur > 0) this.legs.push({ t0: this.s, t1: this.s + dur, a: this.at, b: to, mounted });
    this.s += dur;
    this.at = to;
  }

  wait(until: number, mounted: boolean, face: Pos, hidden = false): void {
    if (until <= this.s) return;
    const at = this.at;
    const leg: Leg = { t0: this.s, t1: until, a: at, b: at, mounted, face };
    this.legs.push(hidden ? { ...leg, hidden: true } : leg);
    this.s = until;
  }
}

const besideOf = (spot: TrainingSpot): Pos => ({
  x: spot.x - spot.headingZ * BESIDE_M,
  z: spot.z + spot.headingX * BESIDE_M,
});

const horsesOf = (yard: JourneyYard): Map<number, YardHorse> =>
  new Map(yard.horses.map((h) => [h.riderId, h]));

/**
 * Odjezd mužů výjezdu `j` z dvorce `yard` (s od začátku): vycházejí z vchodu po sobě; jezdec jde ke
 * svému koni u kůlu, kůň k němu dojde z ohrady (`LEAD_M_S`) a `LEAD_WAIT_S` stojí, jezdec nasedne
 * a jede krokem k bráně. Pěší jde k bráně rovnou. Jezdec, jehož kůň u kůlu není (ohrada ho nemá),
 * vyjede z vchodu rovnou na koni.
 */
export function departureScripts(j: SceneJourney, yard: JourneyYard): ManScript[] {
  const horseOf = horsesOf(yard);
  const out = unit(yard.gate.x - yard.door.x, yard.gate.z - yard.door.z);
  return j.men.map((m, i): ManScript => {
    const path = new Path(yard.door);
    path.wait(i * DOOR_GAP_S, false, out, true);
    const h = m.mounted && m.personId !== null ? (horseOf.get(m.personId) ?? null) : null;
    let horse: LedScript | null = null;
    if (h) {
      path.go(besideOf(h.spot), WALK_M_S, false);
      const ready = h.lead ? h.lead.length / LEAD_M_S : 0;
      path.wait(Math.max(ready + LEAD_WAIT_S, path.s), false, {
        x: h.spot.headingX,
        z: h.spot.headingZ,
      });
      horse = {
        horseId: h.horseId,
        lead: h.lead,
        spot: h.spot,
        back: false,
        from: 0,
        until: path.s,
      };
      // nasedne na koně u kůlu
      path.at = { x: h.spot.x, z: h.spot.z };
      path.go(yard.gate, RIDE_PACE.walk, true);
    } else {
      path.go(yard.gate, m.mounted ? RIDE_PACE.walk : WALK_M_S, m.mounted);
    }
    const { key, personId, lord, wounded, mounted } = m;
    return { key, personId, lord, wounded, mounted, legs: path.legs, end: path.s, horse };
  });
}

/**
 * Příjezd mužů z míst `poses`, kde jsou nakreslení (s od začátku): k bráně dvorce (`CATCH_M_S`),
 * jezdec krokem ke kůlu a sesedne – kůň jde krokem do ohrady a u branky vejde – a muži vejdou
 * vchodem do dvorce.
 */
export function arrivalScripts(poses: readonly RiderPose[], yard: JourneyYard): ManScript[] {
  const horseOf = horsesOf(yard);
  return poses.map((p): ManScript => {
    const path = new Path({ x: p.x, z: p.z });
    path.go(yard.gate, p.mounted ? CATCH_M_S.mounted : CATCH_M_S.foot, p.mounted);
    const h = p.mounted && p.personId !== null ? (horseOf.get(p.personId) ?? null) : null;
    let horse: LedScript | null = null;
    if (h) {
      path.go({ x: h.spot.x, z: h.spot.z }, RIDE_PACE.walk, true);
      // sesedne – kůň jde do ohrady, jezdec ke vchodu
      const off = path.s;
      const until = off + (h.lead ? h.lead.length / LEAD_M_S : 0);
      horse = { horseId: h.horseId, lead: h.lead, spot: h.spot, back: true, from: off, until };
      path.at = besideOf(h.spot);
      path.go(yard.door, WALK_M_S, false);
    } else {
      path.go(yard.door, p.mounted ? RIDE_PACE.walk : WALK_M_S, p.mounted);
    }
    const { key, personId, lord, wounded, mounted } = p;
    return { key, personId, lord, wounded, mounted, legs: path.legs, end: path.s, horse };
  });
}

/** Muž na cestě skriptu: poloha, směr, na koni a rychlost (m/s). */
export interface LegPose {
  x: number;
  z: number;
  hx: number;
  hz: number;
  mounted: boolean;
  speed: number;
}

/** Muž skriptu v čase `s` (s); skrytý (v dvorci) nebo bez úseků – null. */
export function legPose(script: ManScript, s: number): LegPose | null {
  const legs = script.legs;
  const leg = legs.find((l) => s < l.t1) ?? legs[legs.length - 1];
  if (!leg || leg.hidden) return null;
  const span = leg.t1 - leg.t0;
  const f = span > 0 ? Math.min(1, Math.max(0, (s - leg.t0) / span)) : 1;
  const dx = leg.b.x - leg.a.x;
  const dz = leg.b.z - leg.a.z;
  const d = Math.hypot(dx, dz);
  const walks = d > 1e-3 && span > 0;
  const face = walks ? { x: dx / d, z: dz / d } : (leg.face ?? { x: 0, z: 1 });
  return {
    x: leg.a.x + dx * f,
    z: leg.a.z + dz * f,
    hx: face.x,
    hz: face.z,
    mounted: leg.mounted,
    speed: walks ? d / span : 0,
  };
}

const POSE: LivestockPose = { x: 0, z: 0, forwardX: 0, forwardZ: 1, stride: 0, head: 0 };

/** Kůň bez jezdce v čase `s` (s) – cestou z ohrady ke kůlu, u kůlu, nebo do ohrady; jinak null. */
export function ledHorseAt(
  h: LedScript,
  s: number,
): { x: number; z: number; hx: number; hz: number; speed: number } | null {
  const stand = (x: number, z: number): ReturnType<typeof ledHorseAt> => ({
    x,
    z,
    hx: h.spot.headingX,
    hz: h.spot.headingZ,
    speed: 0,
  });
  let d: number;
  if (!h.back) {
    if (s >= h.until) return null;
    if (!h.lead) return stand(h.spot.x, h.spot.z);
    d = Math.min(h.lead.length, Math.max(0, s) * LEAD_M_S);
  } else {
    if (s < h.from || s >= h.until || !h.lead) return null;
    d = Math.max(0, h.lead.length - (s - h.from) * LEAD_M_S);
  }
  const p = leadPose(h.lead, d, h.back, POSE);
  const walking = d > 0 && d < h.lead.length;
  return { x: p.x, z: p.z, hx: p.forwardX, hz: p.forwardZ, speed: walking ? LEAD_M_S : 0 };
}

/** Odjezd nebo příjezd jednoho výjezdu ve scéně. */
interface Leave {
  journeyId: string;
  own: boolean;
  kind: 'departing' | 'arriving';
  startMs: number;
  men: ManScript[];
  /**
   * Dohánění za branou (klíč muže): délka (s) podle vzdálenosti od místa ve skupině, když začalo,
   * a tehdejší odstup od něj (m).
   */
  catchS: Map<string, { total: number; off: Pos }>;
}

/** Leží `pos` nejvýš `within` m od domova výjezdu `home` (bez domova – ne)? */
function near(pos: Pos, home: Pos | null, within = ARRIVE_M): boolean {
  return home !== null && Math.hypot(pos.x - home.x, pos.z - home.z) <= within;
}

/**
 * Odjezdy a příjezdy výjezdů ve scéně vsi: rozhodne, kdy začnou (`observe` – podle stavů ze serveru),
 * a kreslí muže místo stavů `JourneyGlide` (`at`). Omezený pohyb je přeskočí – muži stojí, kde je
 * ukáže server.
 */
export class JourneyLeave {
  private yard: JourneyYard | null = null;
  private leaves = new Map<string, Leave>();
  /**
   * Poslední fáze, poloha a domov vlastních výjezdů, které scéna viděla (pohled hráče – ne záznam
   * návštěvníka).
   */
  private seen = new Map<string, { phase: JourneyPhase; pos: Pos; home: Pos | null }>();
  /** Výjezdy v posledním seznamu a vlastní mezi nimi. */
  private listed = new Set<string>();
  private ownId: string | null = null;
  /** Muži výjezdů, jak byli naposled nakreslení – příjezd začne odtud. */
  private drawn = new Map<string, RiderPose[]>();

  /**
   * Místa dvorce (null – ves bez dvorce i cvičiště: bez odjezdu). Domov, od kterého se měří odjezd
   * a příjezd, nese každý výjezd ze serveru (`SceneJourney.home`) – scéna ho sama nepočítá.
   */
  setYard(yard: JourneyYard | null): void {
    this.yard = yard;
  }

  /** Odjíždí nebo přijíždí nějaký výjezd? */
  active(): boolean {
    return this.leaves.size > 0;
  }

  /**
   * Nové stavy výjezdů v čase `nowMs` (před `JourneyGlide.set`): čerstvě vyslaný vlastní výjezd
   * začne odjezd; vracející se skupina u vsi, nebo vlastní výjezd, který zmizel po návratu či
   * u vsi (`HOME_REACH_M`), příjezd. Omezený pohyb (`frozen`) nic nezačne. True – změna.
   */
  observe(list: readonly SceneJourney[], nowMs: number, frozen: boolean): boolean {
    let changed = false;
    const next = new Set(list.map((j) => j.journeyId));
    this.ownId = list.find((j) => j.own)?.journeyId ?? null;
    for (const j of list) {
      if (!j.own || j.phase === null) continue;
      const first = !this.seen.has(j.journeyId);
      this.seen.set(j.journeyId, { phase: j.phase, pos: j.pos, home: j.home });
      const kind = this.leaves.get(j.journeyId)?.kind;
      if (frozen || !this.yard) continue;
      if (first && this.fresh(j)) {
        this.start(j.journeyId, 'departing', departureScripts(j, this.yard), nowMs);
        changed = true;
      } else if (j.phase === 'returning' && kind !== 'arriving' && near(j.pos, j.home)) {
        changed = this.arrive(j.journeyId, nowMs) || changed;
      }
    }
    for (const id of this.listed) {
      if (next.has(id)) continue;
      // výjezd ve scéně skončil: odjezd nemá za kým, muži, kteří se vrátili, dojedou do dvorce
      const kind = this.leaves.get(id)?.kind;
      if (kind === 'departing') {
        this.leaves.delete(id);
        changed = true;
      }
      const last = this.seen.get(id);
      const home = last && (last.phase === 'returning' || near(last.pos, last.home, HOME_REACH_M));
      if (home && kind !== 'arriving' && !frozen) {
        changed = this.arrive(id, nowMs) || changed;
      }
    }
    this.listed = next;
    return changed;
  }

  /**
   * Muži v čase `nowMs` – místo stavů `glide` (`JourneyGlide.at`) tam, kde výjezd odjíždí nebo
   * přijíždí – a koně bez jezdce mezi ohradou a kůlem; `moving` – někdo jde.
   */
  at(
    glide: readonly RiderPose[],
    nowMs: number,
    frozen: boolean,
  ): { poses: RiderPose[]; led: ArmyAnimal[]; moving: boolean } {
    if (frozen) this.leaves.clear();
    const byJourney = new Map<string, RiderPose[]>();
    for (const p of glide) {
      const list = byJourney.get(p.journeyId);
      if (list) list.push(p);
      else byJourney.set(p.journeyId, [p]);
    }
    const poses: RiderPose[] = [];
    const led: ArmyAnimal[] = [];
    for (const [id, list] of byJourney) if (!this.leaves.has(id)) poses.push(...list);
    for (const [id, leave] of this.leaves) {
      const s = (nowMs - leave.startMs) / 1000;
      const shown =
        leave.kind === 'departing'
          ? this.departing(leave, byJourney.get(id) ?? [], s, led)
          : this.arriving(leave, s, led);
      poses.push(...shown.poses);
      if (shown.done) this.leaves.delete(id);
    }
    this.drawn = new Map(
      [...byJourney.keys()].map((id) => [id, poses.filter((p) => p.journeyId === id)]),
    );
    const moving = poses.some((p) => p.speed > 0) || led.some((h) => h.speed > 0);
    return { poses, led, moving };
  }

  /** Fáze vlastního výjezdu ve scéně; žádný – null. */
  ownPhase(): JourneyScenePhase | null {
    for (const leave of this.leaves.values()) if (leave.own) return leave.kind;
    return this.ownId !== null ? 'riding' : null;
  }

  /**
   * Koně mužů, kteří odjíždějí nebo přijíždějí, ještě mimo ohradu (při příjezdu do vejití u branky)
   * – ohrada je nekreslí.
   */
  horsesOut(nowMs: number): number[] {
    const out: number[] = [];
    for (const leave of this.leaves.values()) {
      const s = (nowMs - leave.startMs) / 1000;
      for (const m of leave.men) {
        if (m.horse && (leave.kind === 'departing' || s < m.horse.until)) out.push(m.horse.horseId);
      }
    }
    return out;
  }

  /** Muži vsi, kteří přijíždějí – den rodiny je nekreslí, dokud příjezd neskončí. */
  menOut(): number[] {
    const out: number[] = [];
    for (const leave of this.leaves.values()) {
      if (leave.kind !== 'arriving') continue;
      for (const m of leave.men) if (m.personId !== null) out.push(m.personId);
    }
    return out;
  }

  private fresh(j: SceneJourney): boolean {
    return j.phase === 'out' && j.arrived === false && near(j.pos, j.home, FRESH_M);
  }

  private start(id: string, kind: Leave['kind'], men: ManScript[], nowMs: number): void {
    this.leaves.set(id, { journeyId: id, own: true, kind, startMs: nowMs, men, catchS: new Map() });
  }

  private arrive(id: string, nowMs: number): boolean {
    const poses = this.drawn.get(id) ?? [];
    if (!this.yard || poses.length === 0) return false;
    this.start(id, 'arriving', arrivalScripts(poses, this.yard), nowMs);
    return true;
  }

  private pose(leave: Leave, m: ManScript, p: LegPose): RiderPose {
    return {
      journeyId: leave.journeyId,
      own: leave.own,
      key: m.key,
      personId: m.personId,
      lord: m.lord,
      wounded: m.wounded,
      ...p,
    };
  }

  /** Odjezd: skript do brány, pak dohánění místa ve skupině; všichni ji dohnali – `done`. */
  private departing(
    leave: Leave,
    glide: readonly RiderPose[],
    s: number,
    led: ArmyAnimal[],
  ): { poses: RiderPose[]; done: boolean } {
    const poses: RiderPose[] = [];
    let done = true;
    const target = new Map(glide.map((p) => [p.key, p]));
    for (const m of leave.men) {
      this.led(leave, m, s, led);
      if (s < m.end) {
        done = false;
        const p = legPose(m, s);
        if (p) poses.push(this.pose(leave, m, p));
        continue;
      }
      const g = target.get(m.key);
      if (!g) continue;
      const p = this.catchUp(leave, m, g, s - m.end);
      if (p !== g) done = false;
      poses.push(p);
    }
    // muži skupiny, kteří v odjezdu nejsou (přibyli) – rovnou podle serveru
    const scripted = new Set(leave.men.map((m) => m.key));
    for (const g of glide) if (!scripted.has(g.key)) poses.push(g);
    return { poses, done };
  }

  /**
   * Za branou muž dohání své místo ve skupině `g`: jede se skupinou a odstup od místa, jaký měl,
   * když dohánění začalo, rovnoměrně stahuje tempem `CATCH_M_S` – svižněji než skupina, plynule,
   * na konci přesně v `g`. Dohnal – vrátí `g`.
   */
  private catchUp(leave: Leave, m: ManScript, g: RiderPose, e: number): RiderPose {
    let chase = leave.catchS.get(m.key);
    if (!chase) {
      const gate = m.legs[m.legs.length - 1]?.b ?? this.yard?.gate ?? g;
      const off = { x: gate.x - g.x, z: gate.z - g.z };
      const pace = m.mounted ? CATCH_M_S.mounted : CATCH_M_S.foot;
      chase = { total: Math.max(CATCH_MIN_S, Math.hypot(off.x, off.z) / pace), off };
      leave.catchS.set(m.key, chase);
    }
    const { total, off } = chase;
    const u = e / total;
    if (u >= 1) return g;
    // rychlost = skupina + stahování odstupu
    const vx = g.hx * g.speed - off.x / total;
    const vz = g.hz * g.speed - off.z / total;
    const speed = Math.hypot(vx, vz);
    const face = speed > STAND_M_S ? unit(vx, vz) : { x: g.hx, z: g.hz };
    const x = g.x + off.x * (1 - u);
    const z = g.z + off.z * (1 - u);
    return { ...g, x, z, hx: face.x, hz: face.z, speed };
  }

  /** Příjezd: skripty až do dvorce a koně do ohrady; skončí, až výjezd ve scéně není. */
  private arriving(
    leave: Leave,
    s: number,
    led: ArmyAnimal[],
  ): { poses: RiderPose[]; done: boolean } {
    const poses: RiderPose[] = [];
    let done = !this.listed.has(leave.journeyId);
    for (const m of leave.men) {
      this.led(leave, m, s, led);
      if (m.horse && s < m.horse.until) done = false;
      if (s >= m.end) continue;
      done = false;
      const p = legPose(m, s);
      if (p) poses.push(this.pose(leave, m, p));
    }
    return { poses, done };
  }

  private led(leave: Leave, m: ManScript, s: number, out: ArmyAnimal[]): void {
    const h = m.horse ? ledHorseAt(m.horse, s) : null;
    if (h) out.push({ key: `jl${leave.journeyId}:${m.key}`, species: 'horse', ...h });
  }
}

/**
 * Ves bez mužů `ids` v dni rodiny (příjezd – muži jdou do dvorce): jako muži na výjezdu
 * (village-view-scene.ts – `sceneLord`) se nekreslí na dvorku, na cvičišti, na jízdě ani u manželky.
 */
export function withoutMen(village: SceneVillage, ids: ReadonlySet<number>): SceneVillage {
  const labor = village.labor;
  const lord = labor?.lord;
  if (ids.size === 0 || !labor || !lord) return village;
  const { riders, escort, visit, ...rest } = lord;
  const riding = riders?.filter((r) => !ids.has(r.id));
  return {
    ...village,
    labor: {
      ...labor,
      lord: {
        ...rest,
        trainees: lord.trainees.filter((t) => !ids.has(t.id)),
        ...(riding && riding.length > 0 ? { riders: riding } : {}),
        ...(escort && !ids.has(escort.id) ? { escort } : {}),
        ...(visit && !ids.has(visit.lordId) ? { visit } : {}),
      },
    },
  };
}
