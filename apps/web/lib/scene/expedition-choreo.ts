// Scéna sedlání, sesednutí, připojení k výpravě a návratu domů (expeditions.md – Ve scéně; journey.md
// – Sedlání, připojení a návrat). Výprava vyjíždí odkudkoli – nikdo „neodjíždí z dvorce“:
//  - osedlání – vesničan dojde k brance ohrady, koně vyjdou a jdou za ním po `leadPath` k jezdcům,
//    ti v `untilTick` nasednou (bez vesničana pro koně dojde jezdec sám);
//  - sesednutí – vesničan dojde k jezdcům, ti v `untilTick` sesednou, pak vede koně do ohrady;
//  - připojení – noví lidé jdou od své postavy vsi na své místo v hloučku (`CATCH_M_S`);
//  - návrat – hlouček u domova se rozejde: jezdci sesednou u dvorce a koně odvede nejbližší dospělý
//    doma (jinak jezdec sám), ostatní jdou ke vchodu svého obydlí.
// Jen podívaná – server o ničem z toho neví (jádro počítá s časem `untilTick`). Čas je výkonový (ms)
// a přichází parametrem – čistá logika bez Babylonu. Omezený pohyb scénář přeskočí.
import type { HorseWork, JourneyPhase, Pos } from '@bohemia/game';
import { TICK_MS } from '@bohemia/game';
import type { SceneVillage } from '../village-view';
import { STAND_M_S, WALK_M_S, unit, type ArmyAnimal } from './army';
import type { RiderPose, SceneJourney } from './journey-riders';
import type { LivestockPose } from './livestock-motion';
import { LEAD_M_S, leadPath, leadPose, type RideLead } from './riders';
import type { TrainingSpot } from './training-ground-layout';

/** Fáze výpravy ve scéně: sedlá, sesedá, noví lidé se připojují, jede, přijíždí domů. */
export type ExpeditionScenePhase = 'saddling' | 'unsaddling' | 'joining' | 'riding' | 'arriving';

/** Kůň jezdce vsi u kůlu dvorce: kde stojí (čelem ke kůlu) a cesta z ohrady (null – stojí u kůlu). */
export interface YardHorse {
  riderId: number;
  horseId: number;
  spot: TrainingSpot;
  lead: RideLead | null;
}

/** Místa vsi pro scénář výprav (villager-plan-lord.ts – `expeditionYard`). */
export interface ExpeditionYard {
  /** Vchod dvorce vojvody. */
  door: Pos;
  /** Brána dvorce; bez pozemku (zemnice) kůl na koně. */
  gate: Pos;
  /** Koně jezdců vsi u kůlu (příjezd). */
  horses: readonly YardHorse[];
  /** Kousek před brankou hotové ohrady, ve které kůň stojí; bez ohrady null. */
  gateOf(horseId: number): Pos | null;
  /** Kůň jezdce (id osoby) z ohrad vsi; bez koně null. */
  horseOf(personId: number): number | null;
  /** Vchod obydlí osoby; neznámá null. */
  entryOf(personId: number): Pos | null;
  /** Cesta z `a` do `b` po pěšinách včetně krajních bodů (jinak rovně). */
  leg(a: Pos, b: Pos): Pos[];
}

/** Postavy vsi pro scénáře (villagers.ts): kde jsou nakreslené a kdo je dospělý doma. */
export interface ChoreoPeople {
  figureAt(personId: number): Pos | null;
  adultNear(at: Pos, skip: ReadonlySet<number>): { id: number; at: Pos } | null;
}

/** Co scénář potřebuje vědět o scéně v okamžiku vzniku. */
export interface ChoreoContext {
  yard: ExpeditionYard;
  /** Výkonový čas (ms), od kterého scénář běží. */
  nowMs: number;
  /** Kde je postava vsi `personId` nakreslená; není vidět – null. */
  figureAt(personId: number): Pos | null;
  /** Muž výpravy `personId`, jak je teď nakreslený (hlouček); není – null. */
  riderAt(personId: number): RiderPose | null;
  /** Nejbližší dospělý doma (nepatří do `skip`) k bodu `at`; nikdo – null. */
  adultNear(at: Pos, skip: ReadonlySet<number>): { id: number; at: Pos } | null;
}

/**
 * Vlastní hlouček, který ze scény zmizel nejvýš tak daleko od domova (m), skončil doma – přijede
 * (návrh Clauda). Worker ukládá kontrolní bod po 10 s, krátký návrat tak scéna ve fázi `returning`
 * nemusí vidět. Skupina, která odjela přes okraj mapy, zmizí u okraje – daleko od vsi.
 */
export const HOME_REACH_M = 150;
/** Vracející se hlouček tak blízko domova (m) začne příjezd. */
export const ARRIVE_M = 30;
/** Nový člověk dohání své místo v hloučku a návrat jde tempem (m/s – návrh Clauda). */
export const CATCH_M_S = { foot: 3, mounted: 4.5 } as const;
/** Nejkratší dohánění a nejkratší sedlání (s). */
const MIN_S = 1;
/** Nový člověk se musí v hloučku nakreslit nejpozději za tolik s, jinak se nepřipojuje. */
const PENDING_S = 3;
/** Scénář sedlání se začne, jen když příkaz padl nejvýš tak dávno (ms) – načtení stránky nic nepřehraje. */
const FRESH_MS = 3000;

/** Úsek cesty: od–do (s od začátku), z bodu do bodu, na koni, veden kůň, skrytý. */
interface Leg {
  t0: number;
  t1: number;
  a: Pos;
  b: Pos;
  mounted: boolean;
  led: boolean;
  hidden?: true;
  face?: Pos;
}

/**
 * Kůň bez jezdce na cestě mezi ohradou a jezdcem: z ohrady k jezdci (`back` false), nebo zpět
 * (`back` true), od `from` do `until` s od začátku scénáře (rovnoměrně – tempo se natahuje).
 * Mimo ten čas ho scénář nekreslí.
 */
export interface LedScript {
  horseId: number;
  lead: RideLead | null;
  spot: Pos;
  heading: Pos;
  back: boolean;
  from: number;
  until: number;
}

/** Člověk, který jde po úsecích: vesničan, jezdec, který jde pro koně, nebo návrat. */
export interface Actor {
  key: string;
  /** Osoba vsi – za vesničana se jeho postava vsi nekreslí; null – návštěvník. */
  personId: number | null;
  /** Sedlající jezdec se hlouček nahrazuje svým klíčem; vesničan přibývá. */
  replaces: boolean;
  lord: boolean;
  wounded: boolean;
  look: RiderPose['look'];
  /** Od kdy (s) se kreslí – dřív ho kreslí hlouček, nebo postava vsi. */
  from: number;
  legs: Leg[];
  end: number;
}

/** Nasednutí a sesednutí jezdce v hloučku: do `at` s stojí pěšky (`mounted` false), pak na koni. */
export interface Seat {
  at: number;
  mountedAfter: boolean;
}

/** Připojení člověka: od postavy vsi `from` dohání místo v hloučku; `off` se stahuje do `total` s. */
export interface Chase {
  key: string;
  personId: number | null;
  mounted: boolean;
  total: number;
  off: Pos;
  /** Kdy dohánění začalo (s od začátku scénáře). */
  start: number;
}

/** Scénář jednoho hloučku (sedlání, sesednutí, připojení, návrat). */
export interface ChoreoScript {
  kind: Exclude<ExpeditionScenePhase, 'riding'>;
  /** Klíč hloučku (`SceneJourney.journeyId`). */
  journeyKey: string;
  startMs: number;
  actors: Actor[];
  horses: LedScript[];
  /** Klíč jezdce → nasednutí / sesednutí. */
  seats: Map<string, Seat>;
  chases: Chase[];
  /** Noví lidé (klíč muže), kteří se teprve objeví v hloučku – dohánění začne, až se nakreslí. */
  pending: string[];
  /** Muži hloučku, které dosud kreslí scénář (příjezd – jejich hlouček zmizel, kreslí je jen on). */
  replaced: string[];
  /** Konec scénáře (s). */
  end: number;
}

/** Cesta skládaná po úsecích. */
class Path {
  readonly legs: Leg[] = [];
  s: number;
  constructor(
    public at: Pos,
    start = 0,
  ) {
    this.s = start;
  }

  go(to: Pos, speed: number, mounted = false, led = false): void {
    const dur = Math.hypot(to.x - this.at.x, to.z - this.at.z) / speed;
    if (dur > 0) {
      this.legs.push({ t0: this.s, t1: this.s + dur, a: this.at, b: to, mounted, led });
    }
    this.s += dur;
    this.at = to;
  }

  /** Po trase `points` (první bod = `at`), `dur` s, s délkou rozdělenou podle úseků. */
  follow(points: readonly Pos[], dur: number, led = false): void {
    let len = 0;
    for (let i = 1; i < points.length; i++) len += dist(points[i - 1]!, points[i]!);
    for (let i = 1; i < points.length; i++) {
      const d = dist(points[i - 1]!, points[i]!);
      const t = len > 0 ? (dur * d) / len : 0;
      if (t > 0) {
        this.legs.push({
          t0: this.s,
          t1: this.s + t,
          a: points[i - 1]!,
          b: points[i]!,
          mounted: false,
          led,
        });
      }
      this.s += t;
    }
    this.at = points[points.length - 1] ?? this.at;
  }

  wait(until: number, face: Pos, hidden = false): void {
    if (until <= this.s) return;
    const at = this.at;
    const leg: Leg = { t0: this.s, t1: until, a: at, b: at, mounted: false, led: false, face };
    this.legs.push(hidden ? { ...leg, hidden: true } : leg);
    this.s = until;
  }
}

const dist = (a: Pos, b: Pos): number => Math.hypot(a.x - b.x, a.z - b.z);

/** Délka lomené cesty `points` (m). */
function lengthOf(points: readonly Pos[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += dist(points[i - 1]!, points[i]!);
  return len;
}

/** Trasa z `a` do `b` po pěšinách; rovně, když ji pěšiny nedají. */
function route(ctx: ChoreoContext, a: Pos, b: Pos): Pos[] {
  const found = ctx.yard.leg(a, b);
  return found.length >= 2 ? [a, ...found.slice(1, -1), b] : [a, b];
}

/** Cesta koně z ohrady `gate` k bodu `end` (čelem po směru chůze). */
function leadTo(ctx: ChoreoContext, gate: Pos, end: Pos): RideLead | null {
  const heading = unit(end.x - gate.x, end.z - gate.z);
  return leadPath(gate, end, heading, (a, b) => ctx.yard.leg(a, b));
}

/** Nejkratší trasa skriptu o `dur` s; kratší než `MIN_S` se natáhne. */
const spanOf = (ms: number): number => Math.max(MIN_S, ms / 1000);

/** Vzhled vesničana ve scéně (pohlaví nemáme – muž). */
const GROOM_LOOK: RiderPose['look'] = 'man';

/**
 * Osedlání nebo sesednutí `work` (journey.md – Sedlání, připojení a návrat). Čas `untilTick` dává
 * `tickMs` (výkonový čas v ms) – cesta se natáhne nebo stáhne tak, aby příchod ke koním a k jezdcům
 * padl na `untilTick`.
 * - **sedlání:** vesničan od své postavy (`figureAt`, jinak vchod jeho obydlí) k brance ohrady, koně
 *   vyjdou a jdou za ním po `leadPath` k jezdcům, jezdci nasednou v `untilTick`; bez vesničana jde
 *   každý jezdec pro koně sám.
 * - **sesednutí:** vesničan k jezdcům, ti sesednou v `untilTick`, pak vede koně do ohrady (už jen
 *   podívaná) a vrátí se, odkud přišel.
 */
export function horseWorkScript(
  work: HorseWork,
  ctx: ChoreoContext,
  tickMs: (tick: number) => number,
  journeyKey = '',
): ChoreoScript {
  const saddle = work.kind === 'saddle';
  const total = spanOf(tickMs(work.untilTick) - ctx.nowMs);
  const script: ChoreoScript = {
    kind: saddle ? 'saddling' : 'unsaddling',
    journeyKey,
    startMs: ctx.nowMs,
    actors: [],
    horses: [],
    seats: new Map(),
    chases: [],
    pending: [],
    replaced: [],
    end: total,
  };
  // jezdci, které máme v hloučku, a jejich koně s cestou z ohrady
  const riders = work.riders.flatMap((id) => {
    const pose = ctx.riderAt(id);
    const horseId = ctx.yard.horseOf(id);
    const gate = horseId === null ? null : ctx.yard.gateOf(horseId);
    return pose && horseId !== null && gate ? [{ id, pose, horseId, gate }] : [];
  });
  for (const r of work.riders) {
    if (ctx.riderAt(r)) script.seats.set(String(r), { at: total, mountedAfter: saddle });
  }
  if (riders.length === 0) return script;
  const groom = work.groomId;
  const origin =
    groom === null ? null : (ctx.figureAt(groom) ?? ctx.yard.entryOf(groom) ?? riders[0]!.pose);
  if (groom !== null && origin) {
    const first = riders[0]!;
    const here: Pos = { x: first.pose.x, z: first.pose.z };
    const path = new Path(origin);
    let back = 0;
    if (saddle) {
      // k brance prvního koně, odtud s koňmi k jezdcům – celé do `untilTick`
      const toGate = route(ctx, origin, first.gate);
      const lead = leadTo(ctx, first.gate, here);
      const d1 = lengthOf(toGate);
      const d2 = lead?.length ?? 0;
      const speed = Math.max(0.01, d1 + d2) / total;
      const reach = Math.min(total, d1 / speed);
      path.follow(toGate, reach);
      if (lead) path.follow(lead.points, total - reach, true);
      path.wait(total, unit(here.x - first.gate.x, here.z - first.gate.z));
      for (const r of riders) {
        const l = leadTo(ctx, r.gate, { x: r.pose.x, z: r.pose.z });
        script.horses.push({
          horseId: r.horseId,
          lead: l,
          spot: { x: r.pose.x, z: r.pose.z },
          heading: { x: r.pose.hx, z: r.pose.hz },
          back: false,
          from: reach,
          until: total,
        });
      }
      back = total;
    } else {
      // k jezdcům do `untilTick`; sesednou, vesničan s koňmi do ohrady a domů
      const toRiders = route(ctx, origin, here);
      path.follow(toRiders, total);
      back = total;
      const walk = [] as number[];
      for (const r of riders) {
        const l = leadTo(ctx, r.gate, { x: r.pose.x, z: r.pose.z });
        const sec = (l?.length ?? 0) / LEAD_M_S;
        walk.push(sec);
        script.horses.push({
          horseId: r.horseId,
          lead: l,
          spot: { x: r.pose.x, z: r.pose.z },
          heading: { x: r.pose.hx, z: r.pose.hz },
          back: true,
          from: total,
          until: total + sec,
        });
      }
      const firstLead = script.horses[0]?.lead;
      if (firstLead) {
        path.follow([...firstLead.points].reverse(), walk[0] ?? 0, true);
      }
      path.follow(route(ctx, path.at, origin), dist(path.at, origin) / WALK_M_S);
      script.end = Math.max(path.s, ...script.horses.map((h) => h.until));
    }
    script.actors.push({
      key: `groom:${groom}`,
      personId: groom,
      replaces: false,
      lord: false,
      wounded: false,
      look: GROOM_LOOK,
      from: 0,
      legs: path.legs,
      end: Math.max(path.s, back),
    });
    return script;
  }
  // nikdo doma: každý jezdec jde pro koně (sedlání) nebo ho po sesednutí odvede (sesednutí) sám
  for (const r of riders) {
    const pos: Pos = { x: r.pose.x, z: r.pose.z };
    const lead = leadTo(ctx, r.gate, pos);
    const sec = (lead?.length ?? 0) / LEAD_M_S;
    const path = new Path(pos, saddle ? 0 : total);
    if (saddle) {
      // pěšky k brance a s koněm zpět; v `untilTick` nasedne
      const there = route(ctx, pos, r.gate);
      const d1 = lengthOf(there);
      const d2 = lead?.length ?? 0;
      const speed = Math.max(0.01, d1 + d2) / total;
      const reach = Math.min(total, d1 / speed);
      path.follow(there, reach);
      if (lead) path.follow(lead.points, total - reach, true);
      path.wait(total, r.pose);
      script.horses.push({
        horseId: r.horseId,
        lead,
        spot: pos,
        heading: { x: r.pose.hx, z: r.pose.hz },
        back: false,
        from: reach,
        until: total,
      });
    } else {
      if (lead) path.follow([...lead.points].reverse(), sec, true);
      script.horses.push({
        horseId: r.horseId,
        lead,
        spot: pos,
        heading: { x: r.pose.hx, z: r.pose.hz },
        back: true,
        from: total,
        until: total + sec,
      });
      script.end = Math.max(script.end, total + sec);
    }
    script.actors.push({
      key: String(r.id),
      personId: r.id,
      replaces: true,
      lord: r.pose.lord,
      wounded: r.pose.wounded,
      look: r.pose.look,
      from: saddle ? 0 : total,
      legs: path.legs,
      end: Math.max(path.s, total),
    });
    // pěšky pro koně a zpět – nasedá až na konci (u sesednutí už sesedl a jde)
    script.seats.delete(String(r.id));
  }
  return script;
}

/**
 * Připojení nových lidí `people` (jejich místa v hloučku): každý jde od místa, kde je jeho postava
 * vsi kreslená, na své místo tempem `CATCH_M_S` (jako dohánění skupiny) a bez skoku.
 */
export function joinScripts(people: readonly RiderPose[], ctx: ChoreoContext): Chase[] {
  return people.map((p): Chase => {
    const from =
      (p.personId === null ? null : (ctx.figureAt(p.personId) ?? ctx.yard.entryOf(p.personId))) ??
      ctx.yard.door;
    const off = { x: from.x - p.x, z: from.z - p.z };
    const pace = p.mounted ? CATCH_M_S.mounted : CATCH_M_S.foot;
    return {
      key: p.key,
      personId: p.personId,
      mounted: p.mounted,
      total: Math.max(MIN_S, Math.hypot(off.x, off.z) / pace),
      off,
      start: 0,
    };
  });
}

/** Postava připojujícího se člověka v čase `s` (s od začátku) – na místě `g`, odkud dohání. */
export function chasePose(chase: Chase, g: RiderPose, s: number): RiderPose {
  const e = s - chase.start;
  const u = e / chase.total;
  if (u >= 1) return g;
  const { off, total } = chase;
  // rychlost = skupina + stahování odstupu
  const vx = g.hx * g.speed - off.x / total;
  const vz = g.hz * g.speed - off.z / total;
  const speed = Math.hypot(vx, vz);
  const face = speed > STAND_M_S ? unit(vx, vz) : { x: g.hx, z: g.hz };
  return {
    ...g,
    x: g.x + off.x * (1 - Math.max(0, u)),
    z: g.z + off.z * (1 - Math.max(0, u)),
    hx: face.x,
    hz: face.z,
    speed,
  };
}

/**
 * Návrat hloučku `group` (muži, jak jsou nakreslení) domů: jezdci a vedení koně dojdou ke kůlu dvorce
 * a sesednou, koně odvede nejbližší dospělý doma k brance ohrady (jinak jezdec sám); ostatní jdou ke
 * vchodu svého obydlí a vejdou.
 */
export function arrivalScript(
  group: readonly RiderPose[],
  ctx: ChoreoContext,
  journeyKey = '',
): ChoreoScript {
  const script: ChoreoScript = {
    kind: 'arriving',
    journeyKey,
    startMs: ctx.nowMs,
    actors: [],
    horses: [],
    seats: new Map(),
    chases: [],
    pending: [],
    replaced: group.map((p) => p.key),
    end: 0,
  };
  const yard = ctx.yard;
  const taken = new Set<number>();
  for (const p of group) {
    const entry = (p.personId === null ? null : yard.entryOf(p.personId)) ?? yard.door;
    const pace = p.mounted ? CATCH_M_S.mounted : CATCH_M_S.foot;
    const path = new Path({ x: p.x, z: p.z });
    const horse =
      (p.mounted || p.led) && p.personId !== null
        ? (yard.horses.find((h) => h.riderId === p.personId) ?? null)
        : null;
    let helper: { id: number; at: Pos } | null = null;
    if (horse) {
      const spot: Pos = { x: horse.spot.x, z: horse.spot.z };
      const walk = route(ctx, path.at, spot);
      for (let i = 1; i < walk.length; i++) {
        path.go(walk[i]!, pace, p.mounted, !p.mounted && p.led);
      }
      const off = path.s;
      helper = ctx.adultNear(spot, taken);
      const lead = horse.lead;
      const leadSec = (lead?.length ?? 0) / LEAD_M_S;
      let from = off;
      if (helper) {
        taken.add(helper.id);
        // dospělý dojde ke kůlu (a nejdřív, než jezdec dojede, nečeká), odvede koně a vrátí se
        const toHorse = route(ctx, helper.at, spot);
        const there = lengthOf(toHorse) / WALK_M_S;
        from = Math.max(off, there);
        const hp = new Path(helper.at);
        hp.follow(toHorse, there);
        hp.wait(from, { x: horse.spot.headingX, z: horse.spot.headingZ });
        if (lead) hp.follow([...lead.points].reverse(), leadSec, true);
        hp.follow(route(ctx, hp.at, helper.at), dist(hp.at, helper.at) / WALK_M_S);
        script.actors.push({
          key: `groom:${helper.id}`,
          personId: helper.id,
          replaces: false,
          lord: false,
          wounded: false,
          look: GROOM_LOOK,
          from: 0,
          legs: hp.legs,
          end: hp.s,
        });
        script.end = Math.max(script.end, hp.s);
        // jezdec jde rovnou ke vchodu
        path.wait(off, { x: horse.spot.headingX, z: horse.spot.headingZ });
      } else if (lead) {
        // nikdo doma – jezdec odvede koně sám a pak jde ke vchodu
        path.follow([...lead.points].reverse(), leadSec, true);
        from = off;
      }
      script.horses.push({
        horseId: horse.horseId,
        lead,
        spot,
        heading: { x: horse.spot.headingX, z: horse.spot.headingZ },
        back: true,
        from,
        until: from + leadSec,
      });
      script.end = Math.max(script.end, from + leadSec);
    }
    const walk = route(ctx, path.at, entry);
    for (let i = 1; i < walk.length; i++) path.go(walk[i]!, WALK_M_S);
    script.actors.push({
      key: p.key,
      personId: p.personId,
      replaces: true,
      lord: p.lord,
      wounded: p.wounded,
      look: p.look,
      from: 0,
      legs: path.legs,
      end: path.s,
    });
    script.end = Math.max(script.end, path.s);
  }
  return script;
}

/** Člověk na cestě skriptu: poloha, směr, na koni, vedený kůň a rychlost (m/s). */
export interface LegPose {
  x: number;
  z: number;
  hx: number;
  hz: number;
  mounted: boolean;
  led: boolean;
  speed: number;
}

/** Člověk skriptu v čase `s` (s); skrytý nebo bez úseků – null. */
export function legPose(legs: readonly Leg[], s: number): LegPose | null {
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
    led: leg.led,
    speed: walks ? d / span : 0,
  };
}

const POSE: LivestockPose = { x: 0, z: 0, forwardX: 0, forwardZ: 1, stride: 0, head: 0 };

/** Kůň bez jezdce v čase `s` (s) – cestou z ohrady k jezdci, nebo zpět; mimo svůj čas null. */
export function ledHorseAt(
  h: LedScript,
  s: number,
): { x: number; z: number; hx: number; hz: number; speed: number } | null {
  if (s < h.from || s >= h.until) return null;
  const span = Math.max(1e-3, h.until - h.from);
  if (!h.lead) return { x: h.spot.x, z: h.spot.z, hx: h.heading.x, hz: h.heading.z, speed: 0 };
  const f = (s - h.from) / span;
  const d = h.lead.length * (h.back ? 1 - f : f);
  const p = leadPose(h.lead, d, h.back, POSE);
  return { x: p.x, z: p.z, hx: p.forwardX, hz: p.forwardZ, speed: h.lead.length / span };
}

/** Člověk skriptu `a` jako postava výpravy v čase `s` (s); skrytý nebo mimo svůj čas – null. */
function actorPose(journeyKey: string, a: Actor, s: number): RiderPose | null {
  if (s < a.from || s >= a.end) return null;
  const p = legPose(a.legs, s);
  if (!p) return null;
  return {
    journeyId: journeyKey,
    own: true,
    key: a.key,
    personId: a.personId,
    lord: a.lord,
    wounded: a.wounded,
    look: a.look,
    ...p,
  };
}

/** Kde je `journeyKey` vzhledem k domovu (m) – hlouček u domova se připojuje i vrací. */
const near = (pos: Pos, home: Pos | null, within = ARRIVE_M): boolean =>
  home !== null && Math.hypot(pos.x - home.x, pos.z - home.z) <= within;

/** Co o hloučku víme z posledního seznamu. */
interface Seen {
  phase: JourneyPhase | null;
  pos: Pos;
  home: Pos | null;
  people: string[];
}

/**
 * Scénáře výprav ve scéně vsi: rozhodne, kdy začnou (`observe` – podle stavů ze serveru), a kreslí
 * lidi místo (nebo vedle) stavů `JourneyGlide` (`at`). Omezený pohyb je přeskočí – lidé stojí, kde je
 * ukáže server.
 */
export class ExpeditionLeave {
  private ctxFor: ((nowMs: number) => ChoreoContext | null) | null = null;
  private leaves: ChoreoScript[] = [];
  /** Hloučky vlastních výprav, jak je scéna naposled viděla – příjezd a nové lidi pozná z nich. */
  private seen = new Map<string, Seen>();
  /** Práce s koňmi, které už scéna viděla (klíč hloučku a čas příkazu). */
  private works = new Set<string>();
  /** Hloučky, které už přijely (druhý příjezd ne). */
  private arrived = new Set<string>();
  private listed = new Set<string>();
  /** Lidé vlastních výprav, které scéna viděla (nově příchozí se připojují). */
  private known = new Set<string>();
  private baseline = false;
  /** Muži hloučků, jak byli naposled nakreslení – příjezd začne odtud. */
  private drawn = new Map<string, RiderPose[]>();
  private ownId: string | null = null;
  private lastCtx: ChoreoContext | null = null;
  private groomAt: Pos | null = null;

  /** Vesničan, který právě vede koně; žádný – null. */
  groom(): Pos | null {
    return this.groomAt;
  }

  /** Muž výpravy `personId` (vlastní výprava), jak byl naposled nakreslený; není – null. */
  drawnPose(personId: number): RiderPose | null {
    for (const list of this.drawn.values()) {
      const found = list.find((p) => p.personId === personId);
      if (found) return found;
    }
    return null;
  }

  /** Zdroj kontextu scénáře (null – bez dvorce nic nezačne); místa vsi a postavy dodá scéna. */
  setContext(source: ((nowMs: number) => ChoreoContext | null) | null): void {
    this.ctxFor = source;
  }

  /** Probíhá nějaký scénář? */
  active(): boolean {
    return this.leaves.length > 0;
  }

  /**
   * Nové stavy hloučků v čase `nowMs` (před `JourneyGlide.set`): nová práce s koňmi → sedlání nebo
   * sesednutí, noví lidé u domova → připojení, hlouček, který u domova zmizel nebo se vrací →
   * příjezd. Načtení stránky uprostřed nic nepřehraje, omezený pohyb (`frozen`) nic nezačne.
   * True – změna.
   */
  observe(list: readonly SceneJourney[], nowMs: number, frozen: boolean): boolean {
    let changed = false;
    const own = list.filter((j) => j.own && j.phase !== null);
    this.ownId = own[0]?.journeyId ?? null;
    const ctx = this.ctxFor?.(nowMs) ?? null;
    this.lastCtx = ctx;
    const play = this.baseline && !frozen && ctx !== null;
    const present = new Set(own.flatMap((j) => j.men.map((m) => m.key)));
    for (const j of own) {
      const men = j.men.map((m) => m.key);
      this.seen.set(j.journeyId, { phase: j.phase, pos: j.pos, home: j.home, people: men });
      const work = j.horseWork;
      if (work) {
        const key = `${j.journeyId}:${work.fromTick}`;
        if (!this.works.has(key)) {
          this.works.add(key);
          const tickMs = (tick: number): number => nowMs + (tick - j.tick) * TICK_MS;
          const fresh = nowMs - tickMs(work.fromTick) <= FRESH_MS;
          if (
            play &&
            ctx &&
            fresh &&
            tickMs(work.untilTick) > nowMs &&
            near(j.pos, j.home, HOME_REACH_M)
          ) {
            const script = horseWorkScript(work, ctx, tickMs, j.journeyId);
            if (script.actors.length > 0 || script.horses.length > 0 || script.seats.size > 0) {
              this.leaves.push(script);
              changed = true;
            }
          }
        }
      }
      // noví lidé u domova se připojí od své postavy vsi (jakmile je hlouček nakreslí)
      const arrivals = j.men.filter((m) => !this.known.has(m.key) && m.personId !== null);
      if (play && arrivals.length > 0 && near(j.pos, j.home, HOME_REACH_M)) {
        this.leaves.push({
          kind: 'joining',
          journeyKey: j.journeyId,
          startMs: nowMs,
          actors: [],
          horses: [],
          seats: new Map(),
          chases: [],
          pending: arrivals.map((m) => m.key),
          replaced: [],
          end: PENDING_S,
        });
        changed = true;
      }
      if (
        play &&
        ctx &&
        j.phase === 'returning' &&
        !this.arrived.has(j.journeyId) &&
        near(j.pos, j.home)
      ) {
        changed = this.arrive(j.journeyId, nowMs, ctx) || changed;
      }
    }
    for (const j of own) for (const m of j.men) this.known.add(m.key);
    const next = new Set(list.map((j) => j.journeyId));
    for (const id of this.listed) {
      if (next.has(id)) continue;
      const last = this.seen.get(id);
      const home = last && (last.phase === 'returning' || near(last.pos, last.home, HOME_REACH_M));
      if (home && play && ctx && !this.arrived.has(id)) {
        changed = this.arrive(id, nowMs, ctx, present) || changed;
      }
    }
    this.listed = next;
    if (list.length > 0 || this.baseline) this.baseline = true;
    // první seznam jen zaznamená, co je (načtení stránky nic nepřehraje)
    if (!this.baseline) return false;
    return changed;
  }

  /**
   * Postavy v čase `nowMs`: stavy `glide` (`JourneyGlide.at`) s úpravami scénářů – jezdci nasedají
   * a sesedají, noví lidé dohánějí místo, vesničané vedou koně, hlouček u domova se rozchází – a koně
   * bez jezdce mezi ohradou a jezdcem; `moving` – někdo jde.
   */
  at(
    glide: readonly RiderPose[],
    nowMs: number,
    frozen: boolean,
  ): { poses: RiderPose[]; led: ArmyAnimal[]; moving: boolean } {
    if (frozen) this.leaves = [];
    let poses = [...glide];
    const led: ArmyAnimal[] = [];
    const keep: ChoreoScript[] = [];
    for (const leave of this.leaves) {
      const s = (nowMs - leave.startMs) / 1000;
      if (s >= leave.end) continue;
      keep.push(leave);
      poses = this.apply(leave, s, poses, led);
    }
    this.leaves = keep;
    this.groomAt = null;
    for (const leave of keep) {
      const s = (nowMs - leave.startMs) / 1000;
      for (const a of leave.actors) {
        const p = a.replaces ? null : actorPose(leave.journeyKey, a, s);
        if (p) this.groomAt = { x: p.x, z: p.z };
      }
    }
    this.drawn = new Map();
    for (const p of glide) {
      const list = this.drawn.get(p.journeyId);
      if (list) list.push(p);
      else this.drawn.set(p.journeyId, [p]);
    }
    const moving = poses.some((p) => p.speed > 0) || led.some((h) => h.speed > 0);
    return { poses, led, moving };
  }

  /** Fáze vlastní výpravy ve scéně: sedlá, sesedá, připojuje se, jede, přijíždí; žádná – null. */
  ownPhase(): ExpeditionScenePhase | null {
    const order: ExpeditionScenePhase[] = ['arriving', 'saddling', 'unsaddling', 'joining'];
    for (const kind of order) if (this.leaves.some((l) => l.kind === kind)) return kind;
    return this.ownId !== null ? 'riding' : null;
  }

  /**
   * Koně, které scénář vede mimo ohradu (od vyjití z ohrady nebo od sesednutí do vejití do ní) –
   * ohrada je nekreslí.
   */
  horsesOut(nowMs: number): number[] {
    const out: number[] = [];
    for (const leave of this.leaves) {
      const s = (nowMs - leave.startMs) / 1000;
      for (const h of leave.horses) {
        const outside = h.back ? s < h.until : s >= h.from;
        if (outside) out.push(h.horseId);
      }
    }
    return out;
  }

  /**
   * Lidé vsi, které scénář kreslí místo postavy vsi: vesničané s koňmi, noví lidé na cestě do hloučku
   * a lidé na cestě domů; `arriving` jsou ti z příjezdu (den rodiny je nekreslí, dokud příjezd neskončí).
   */
  menOut(): { arriving: number[]; hidden: number[] } {
    const arriving: number[] = [];
    const hidden: number[] = [];
    for (const leave of this.leaves) {
      for (const a of leave.actors) if (a.personId !== null) hidden.push(a.personId);
      for (const c of leave.chases) if (c.personId !== null) hidden.push(c.personId);
      for (const k of leave.pending) hidden.push(Number(k));
      if (leave.kind === 'arriving') {
        for (const a of leave.actors)
          if (a.replaces && a.personId !== null) arriving.push(a.personId);
      }
    }
    return { arriving, hidden: [...new Set([...hidden, ...arriving])] };
  }

  /** Použije scénář `leave` v čase `s` na postavy `poses`; koně bez jezdce přidá do `led`. */
  private apply(
    leave: ChoreoScript,
    s: number,
    poses: RiderPose[],
    led: ArmyAnimal[],
  ): RiderPose[] {
    let out = poses;
    if (leave.kind === 'arriving') {
      const gone = new Set(leave.replaced);
      out = out.filter((p) => !(p.journeyId === leave.journeyKey && gone.has(p.key)));
    }
    this.startChases(leave, s, out);
    const actors = new Map<string, RiderPose>();
    for (const a of leave.actors) {
      const p = actorPose(leave.journeyKey, a, s);
      if (p) actors.set(a.key, p);
    }
    out = out.flatMap((p) => {
      if (p.journeyId !== leave.journeyKey) return [p];
      const mine = actors.get(p.key);
      if (mine) {
        actors.delete(p.key);
        return [mine];
      }
      const seat = leave.seats.get(p.key);
      if (seat) return [{ ...p, mounted: s >= seat.at ? seat.mountedAfter : !seat.mountedAfter }];
      const chase = leave.chases.find((c) => c.key === p.key);
      if (chase) return [chasePose(chase, p, s)];
      return [p];
    });
    out = [...out, ...actors.values()];
    for (const h of leave.horses) {
      const at = ledHorseAt(h, s);
      if (at) led.push({ key: `el${leave.journeyKey}:${h.horseId}`, species: 'horse', ...at });
    }
    return out;
  }

  /** Nový člověk, který se v hloučku nakreslil, začne dohánět své místo od své postavy vsi. */
  private startChases(leave: ChoreoScript, s: number, poses: readonly RiderPose[]): void {
    if (leave.pending.length === 0) return;
    const ctx = this.lastCtx;
    if (!ctx) return;
    for (const p of poses) {
      if (p.journeyId !== leave.journeyKey || !leave.pending.includes(p.key)) continue;
      leave.pending = leave.pending.filter((k) => k !== p.key);
      for (const c of joinScripts([p], ctx)) {
        leave.chases.push({ ...c, start: s });
        leave.end = Math.max(leave.end, s + c.total);
      }
    }
    // nikdo se nenakreslil – scénář skončí s lhůtou
    if (leave.pending.length === 0 && leave.chases.length === 0) leave.end = 0;
  }

  private arrive(
    id: string,
    nowMs: number,
    ctx: ChoreoContext,
    present: ReadonlySet<string> = new Set(),
  ): boolean {
    const group = (this.drawn.get(id) ?? []).filter((p) => !present.has(p.key));
    if (group.length === 0) return false;
    this.arrived.add(id);
    this.leaves.push(arrivalScript(group, ctx, id));
    return true;
  }
}

/**
 * Ves bez mužů `ids` v dni rodiny (příjezd – muži jdou do dvorce): jako muži na výpravě
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
