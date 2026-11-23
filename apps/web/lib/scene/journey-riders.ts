// Jezdci výjezdu ve scéně vsi (lord-control.md – Ve scéně, Soused; journey.md – Scéna vsi): vlastní
// výjezd (`JourneyView`) i návštěvníci (`JourneyVisitor`) jako muži rodu ve vojsku – jezdci na
// koních vpředu, pěší za nimi (army.ts – `huddleSlots`). Mezi dvěma stavy ze serveru jde každý muž
// plynule ze své nakreslené polohy na nové místo v hloučku, ne jen střed skupiny – hlouček se při
// zatáčce neotočí skokem. Bez Babylonu; kreslí army-renderer.ts.
import { TICK_MS } from '@bohemia/game';
import type { HorseWork, JourneyPhase, JourneyView, JourneyVisitor, Pos } from '@bohemia/game';
import {
  ARMY_LOOKS,
  HUDDLE_SPACING_M,
  MARCH_GLIDE_M_S,
  RIDER_LIFT_M,
  STAND_M_S,
  TROT_M_S,
  WALK_M_S,
  glideMs,
  huddleSlots,
  unit,
  type ArmyAnimal,
  type ArmyFigure,
} from './army';
import { CHILD_FIGURE_SCALE } from './refugee-march';
import { FIGURE_HEIGHT_M, type Project } from './villager-pick';
import type { SceneVillage } from '../village-view';

/** Muž výjezdu pro scénu (jádro – `JourneyView.men`, `JourneyVisitor.men`). */
export interface SceneJourneyMan extends Pick<
  JourneyView['men'][number],
  'lord' | 'mounted' | 'wounded'
> {
  /** Klíč muže ve výjezdu – id osoby u vlastního výjezdu, pořadí u návštěvníka. */
  key: string;
  /** Osoba vsi – klik na vlastního muže ho vybere; návštěvník null. */
  personId: number | null;
  /**
   * Vzhled: `line` – muž rodu (jezdec), `man` / `woman` – vesničan a vesničanka, `child` – dítě
   * (menší postava jako u pochodu uprchlíků).
   */
  look: JourneyLook;
  /** Sesedl a vede koně za uzdu (jde pěšky, kůň vedle něj). */
  led: boolean;
}

/** Vzhled člověka výpravy ve scéně. */
export type JourneyLook = 'line' | 'man' | 'woman' | 'child';

/** Odstup vedeného koně od pěšího jezdce (m) – stranou, vpravo od směru chůze (návrh Clauda). */
export const LED_HORSE_SIDE_M = 1.2;

/** Výjezd na mapě vsi pro scénu – vlastní i cizí (návštěvník). */
export interface SceneJourney extends Pick<
  JourneyVisitor,
  'journeyId' | 'own' | 'leader' | 'house' | 'tick' | 'pos' | 'goal'
> {
  men: SceneJourneyMan[];
  /**
   * Domovská ves vlastní skupiny, není-li to ves scény (id lidí jsou jedinečná jen ve vsi – výběr
   * nese ves, `VillageTarget`); ves scény a cizí výprava – chybí.
   */
  villageId?: string;
  /**
   * Skupina výpravy, do které hlouček patří (praporek a výběr celé skupiny); `journeyId` je klíč
   * hloučku `${journeyId}:${groupId}`.
   */
  partyId?: number;
  /** Skupina stojí (dojela); null – nevíme (návštěvník – pozná se z posunu mezi stavy). */
  arrived: boolean | null;
  /** Fáze vlastního výjezdu; návštěvník null. */
  phase: JourneyPhase | null;
  /** Celé dny do návratu (panel osoby; hodiny ve scéně zrušeny) – jen vlastní skupina, která stojí na místě. */
  waitDaysLeft: JourneyView['waitDaysLeft'];
  /**
   * Odkud vlastní výjezd vyjel a kam se vrací (`JourneyView.homePos` – dvorec vsi); od něj se měří
   * odjezd a příjezd (expedition-choreo.ts). Návštěvník null.
   */
  home: Pos | null;
  /** Sedlání nebo sesednutí skupiny doma (scéna ho jen přehraje – expedition-choreo.ts); jinak chybí. */
  horseWork?: HorseWork;
  /**
   * Kde a v kterém taktu hlouček naposledy stál, než vyrazil po současném úseku (`groupSetOut` –
   * vlastní skupina, která jde); stojící hlouček a návštěvník – chybí.
   */
  setOut?: { tick: number; pos: Pos };
}

/** Muž výjezdu nakreslený ve scéně – poloha, směr a rychlost. */
export interface RiderPose {
  journeyId: string;
  own: boolean;
  key: string;
  personId: number | null;
  /** Ves osoby `personId`, není-li to ves scény (`SceneJourney.villageId`). */
  villageId?: string;
  x: number;
  z: number;
  /** Kam hledí (jednotkový vektor). */
  hx: number;
  hz: number;
  mounted: boolean;
  lord: boolean;
  wounded: boolean;
  look: JourneyLook;
  /** Vede koně za uzdu. */
  led: boolean;
  /** Rychlost (m/s) – klip postavy a krok koně; 0 stojí. */
  speed: number;
}

/** Bod hloučku ve světě: střed, směr a místo (vpravo, vpřed) – jako pochod (army.ts). */
function placeIn(center: Pos, heading: Pos, slot: Pos): Pos {
  return {
    x: center.x + heading.z * slot.x + heading.x * slot.z,
    z: center.z - heading.x * slot.x + heading.z * slot.z,
  };
}

/** Pořadí v hloučku: vojvoda na koni, jezdci, pěší, ranění pěší. */
function rank(m: SceneJourneyMan): number {
  if (m.mounted) return m.lord ? 0 : 1;
  return m.wounded ? 3 : 2;
}

/**
 * Rozestavení mužů výjezdu kolem středu skupiny `j.pos` čelem ve směru `heading`: jezdci v hloučku
 * vpředu (vojvoda uprostřed), pěší za nimi, ranění vzadu – jako pochod vojska. Stejní muži = stejný
 * hlouček; stojí (`speed` 0) – pohyb dodá `ridersAt`.
 */
export function journeyFormation(j: SceneJourney, heading: Pos): RiderPose[] {
  const men = j.men
    .map((m, index) => ({ m, index }))
    .sort((a, b) => rank(a.m) - rank(b.m) || a.index - b.index);
  const riders = men.filter(({ m }) => m.mounted);
  const foot = men.filter(({ m }) => !m.mounted);
  const riderSlots = huddleSlots(riders.length, HUDDLE_SPACING_M.mounted);
  const footSlots = huddleSlots(foot.length, HUDDLE_SPACING_M.foot);
  // pěší za jezdci: střed pěších posunutý o poloměr hloučku jezdců dozadu
  const back = riders.length > 0 ? HUDDLE_SPACING_M.mounted * Math.sqrt(riders.length) + 1 : 0;
  const pose = (m: SceneJourneyMan, p: Pos): RiderPose => ({
    journeyId: j.journeyId,
    own: j.own,
    key: m.key,
    personId: m.personId,
    ...(j.villageId === undefined ? {} : { villageId: j.villageId }),
    x: p.x,
    z: p.z,
    hx: heading.x,
    hz: heading.z,
    mounted: m.mounted,
    lord: m.lord,
    wounded: m.wounded,
    look: m.look,
    led: m.led,
    speed: 0,
  });
  return [
    ...riders.map(({ m }, i) => pose(m, placeIn(j.pos, heading, riderSlots[i]!))),
    ...foot.map(({ m }, i) => {
      const slot = footSlots[i]!;
      return pose(m, placeIn(j.pos, heading, { x: slot.x, z: slot.z - back }));
    }),
  ];
}

const poseId = (p: Pick<RiderPose, 'journeyId' | 'key'>): string => `${p.journeyId}:${p.key}`;

/**
 * Muži v podílu `t` mezi nakreslenými `from` a novým rozestavením `to` (0 = `from`, 1 = `to`) za
 * `spanS` sekund: každý muž jde rovně ze své polohy na své nové místo a hledí, kam jde. Nový muž
 * a skok rychlejší než `MARCH_GLIDE_M_S` (jiná mapa) stojí rovnou v `to`. Jen zobrazení.
 */
export function ridersAt(
  from: readonly RiderPose[] | null,
  to: readonly RiderPose[],
  t: number,
  spanS: number,
): RiderPose[] {
  if (!from || !(t < 1) || spanS <= 0) return [...to];
  const k = Math.max(0, t);
  const before = new Map(from.map((p) => [poseId(p), p]));
  return to.map((p) => {
    const was = before.get(poseId(p));
    if (!was) return p;
    const dx = p.x - was.x;
    const dz = p.z - was.z;
    const d = Math.hypot(dx, dz);
    const speed = d / spanS;
    if (d < 0.05 || speed > MARCH_GLIDE_M_S) return p;
    const turns = speed > STAND_M_S;
    return {
      ...p,
      x: was.x + dx * k,
      z: was.z + dz * k,
      hx: turns ? dx / d : p.hx,
      hz: turns ? dz / d : p.hz,
      speed: turns ? speed : 0,
    };
  });
}

/** Stav k přehrání – rozestavení mužů v taktu `tick`. */
interface Sample {
  tick: number;
  poses: RiderPose[];
}

/** Plynulý pohyb jednoho výjezdu mezi stavy. */
interface Glide {
  journey: SceneJourney;
  heading: Pos;
  /** Stavy k přehrání: první = kde je hlouček nakreslený, dál stavy ze serveru (rostoucí takty). */
  track: Sample[];
  /** Přehrávání: takt `tick` v čase `ms` (výkonový), dál `rate` taktů za `TICK_MS`. */
  play: { tick: number; ms: number; rate: number };
  receivedAt: number;
  /** Hlouček se mezi posledními dvěma stavy posunul (jede); první stav – stojí. */
  moved: boolean;
}

/**
 * Přehrávání drží tolik taktů za posledním stavem ze serveru (D49 – stálé tempo): worker ukládá
 * jedoucí skupinu v kolech ≈ 1 s (déle, když má práci se vsemi), server pošle stav při každém uložení – zásoba
 * 2 s pohltí nepravidelné příchody stavů, takže muž nezastaví ani nedohání (návrh Clauda).
 */
export const PLAY_LAG_TICKS = 8;
/** O kolik přehrávání zrychlí či zpomalí, aby drželo zásobu (podíl) – tempo postavy nejvýš ± 6 %. */
export const PLAY_SLACK = 0.06;
/** Zásoba nad tolik taktů (po přestávce, ve skrytém panelu) se zahodí – hlouček skočí blíž. */
export const PLAY_BEHIND_MAX_TICKS = 40;

const samePos = (a: Pos | null, b: Pos | null): boolean =>
  a === b || (a !== null && b !== null && a.x === b.x && a.z === b.z);

const sameMen = (a: SceneJourney, b: SceneJourney): boolean =>
  a.men.length === b.men.length &&
  a.men.every((m, i) => {
    const o = b.men[i]!;
    return (
      m.key === o.key &&
      m.mounted === o.mounted &&
      m.wounded === o.wounded &&
      m.led === o.led &&
      m.look === o.look
    );
  });

/** Takt, který scéna v čase `nowMs` ukazuje – nejvýš poslední stav (pak hlouček stojí). */
function playTick(g: Glide, nowMs: number): number {
  const last = g.track[g.track.length - 1]!.tick;
  const run = (Math.max(0, nowMs - g.play.ms) / TICK_MS) * g.play.rate;
  return Math.min(last, g.play.tick + run);
}

/** Muži výjezdu v čase `nowMs` – mezi dvěma stavy podle taktu přehrávání (stálé tempo jádra). */
function posesAt(g: Glide, nowMs: number): RiderPose[] {
  const p = playTick(g, nowMs);
  const track = g.track;
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1]!;
    const b = track[i]!;
    if (p >= b.tick) continue;
    const span = b.tick - a.tick;
    return ridersAt(a.poses, b.poses, (p - a.tick) / span, (span * TICK_MS) / 1000 / g.play.rate);
  }
  return track[track.length - 1]!.poses;
}

/**
 * Výjezdy ve scéně mezi stavy ze serveru (D49 – stálé tempo): stavy se přehrávají podle svých taktů
 * se zpožděním `PLAY_LAG_TICKS` – muži jdou mezi nimi tempem jádra, i když stavy chodí nepravidelně
 * (dřív každý nový stav spustil nový posun z nakreslené polohy a muž střídavě dobíhal a stál).
 * Zpoždění drží přehrávání zrychlením či zpomalením nejvýš o `PLAY_SLACK`. Hlouček, který stál,
 * se rozjede hned s prvním stavem v pohybu (pohyb potrvá jako dřív – `glideMs`). Čas je výkonový
 * (ms) a přichází parametrem – čistá logika bez Babylonu.
 */
export class JourneyGlide {
  private glides = new Map<string, Glide>();

  /** Jsou ve scéně nějaké výjezdy? */
  active(): boolean {
    return this.glides.size > 0;
  }

  /** Výjezdy, které scéna kreslí (poslední stavy). */
  journeys(): SceneJourney[] {
    return [...this.glides.values()].map((g) => g.journey);
  }

  /** Nové stavy výjezdů v čase `nowMs`; `frozen` – omezený pohyb (bez plynulosti). True – změna. */
  set(list: readonly SceneJourney[], nowMs: number, frozen: boolean): boolean {
    const next = new Map<string, Glide>();
    let changed = list.length !== this.glides.size;
    for (const j of list) {
      const was = this.glides.get(j.journeyId);
      if (was && was.journey.tick === j.tick && sameMen(was.journey, j)) {
        // stejný stav – jen údaje bez polohy (jméno, dny čekání), pohyb běží dál
        next.set(j.journeyId, { ...was, journey: j });
        if (was.journey.waitDaysLeft !== j.waitDaysLeft || !samePos(was.journey.goal, j.goal)) {
          changed = true;
        }
        continue;
      }
      changed = true;
      const heading = headingOf(was?.journey ?? null, j, was?.heading ?? null);
      const to = journeyFormation(j, heading);
      next.set(
        j.journeyId,
        was && !frozen
          ? this.follow(was, j, heading, to, nowMs)
          : {
              journey: j,
              heading,
              track: [{ tick: j.tick, poses: to }],
              play: { tick: j.tick, ms: nowMs, rate: 1 },
              receivedAt: nowMs,
              moved: false,
            },
      );
    }
    this.glides = next;
    return changed;
  }

  /** Muži všech výjezdů v čase `nowMs`; `moving` – někdo jde (scéna kreslí v taktu animací). */
  at(nowMs: number, frozen: boolean): { poses: RiderPose[]; moving: boolean } {
    const poses: RiderPose[] = [];
    let moving = false;
    for (const g of this.glides.values()) {
      const shown = frozen ? g.track[g.track.length - 1]!.poses : posesAt(g, nowMs);
      poses.push(...shown);
      moving ||= shown.some((p) => p.speed > 0);
    }
    return { poses, moving };
  }

  /**
   * Nový stav `j` výjezdu, který scéna kreslí: přehrávání pokračuje odtud, kde je hlouček nakreslený
   * (první stav stopy), stavy mezi ním a novým zůstanou. Hlouček, který stál (poslední dva stavy na
   * stejném místě – Martin 18. 11. 2026: „zezačátku jde hrozně pomalu“): stojící stav po stojícím
   * (worker ho ukládá po 40 taktech) jen posune přehrávání na `PLAY_LAG_TICKS` za nový stav – dřív
   * ho scéna hrála jako 40 taktů dlouhý posun na místě a stojící hlouček kreslila až 10 s pozadu;
   * první stav v pohybu nese, kde a kdy hlouček naposledy stál (`setOut`) – do té doby stojí a pak
   * jde tempem jádra. Totéž po dojetí (stav dojetí se posunul, ale hlouček pak stojí). Bez údaje
   * (návštěvník) kdy se rozjel, nevíme – pohyb k novému stavu potrvá jako dřív (`glideMs`).
   */
  private follow(was: Glide, j: SceneJourney, heading: Pos, to: RiderPose[], nowMs: number): Glide {
    const p = playTick(was, nowMs);
    const drawn = posesAt(was, nowMs);
    const between = was.track.filter((s) => s.tick > p && s.tick < j.tick);
    // poslední stav, kde hlouček stál, než vyrazil (stál tam ještě v taktu `setOut.tick`)
    const stood =
      j.setOut !== undefined &&
      j.setOut.tick > was.journey.tick &&
      j.setOut.tick < j.tick &&
      samePos(was.journey.pos, j.setOut.pos)
        ? { tick: j.setOut.tick, poses: was.track[was.track.length - 1]!.poses }
        : null;
    // stojí dál (stojící bod po stojícím nebo po dojetí)
    const still = samePos(was.journey.pos, j.pos);
    let start = p;
    // hlouček stál: rozjede se o tolik později, aby měl zásobu `PLAY_LAG_TICKS` (obvykle ≈ 1 s);
    // i po dojetí – stav dojetí se posunul (`moved`), ale stojící bod po něm worker uloží až za 40
    // taktů a rozkaz přijde dřív (kontrola D94)
    let hold = 0;
    if ((!was.moved || still || stood !== null) && between.length === 0 && j.tick > p) {
      const lead =
        still || stood
          ? Math.min(stood?.tick ?? j.tick, j.tick - PLAY_LAG_TICKS)
          : j.tick - glideMs(j.tick - p, nowMs - was.receivedAt) / TICK_MS;
      start = Math.max(p, lead);
      hold = Math.max(0, PLAY_LAG_TICKS - (j.tick - start));
    }
    if (j.tick - start > PLAY_BEHIND_MAX_TICKS) start = j.tick - PLAY_LAG_TICKS;
    // stavy za novým začátkem (po zahozené zásobě začíná přehrávání dál)
    const ahead = [...between, ...(stood ? [stood] : [])].filter((s) => s.tick > start);
    const track: Sample[] =
      j.tick > start
        ? [
            ...(hold > 0 ? [{ tick: start - hold, poses: drawn }] : []),
            { tick: start, poses: drawn },
            ...ahead,
            { tick: j.tick, poses: to },
          ]
        : [{ tick: j.tick, poses: to }];
    start -= hold;
    const behind = j.tick - start;
    const rate =
      behind > PLAY_LAG_TICKS ? 1 + PLAY_SLACK : behind < PLAY_LAG_TICKS ? 1 - PLAY_SLACK : 1;
    return {
      journey: j,
      heading,
      track,
      play: { tick: Math.min(start, j.tick), ms: nowMs, rate },
      receivedAt: nowMs,
      moved: !samePos(was.journey.pos, j.pos),
    };
  }
}

/**
 * Směr skupiny: kam se posunula od minulého stavu, jinak k cíli na mapě, jinak jako dřív (sever).
 */
export function headingOf(prev: SceneJourney | null, next: SceneJourney, last: Pos | null): Pos {
  if (prev) {
    const dx = next.pos.x - prev.pos.x;
    const dz = next.pos.z - prev.pos.z;
    if (Math.hypot(dx, dz) > 0.05) return unit(dx, dz);
  }
  const goal = next.goal;
  if (goal && Math.hypot(goal.x - next.pos.x, goal.z - next.pos.z) > 1) {
    return unit(goal.x - next.pos.x, goal.z - next.pos.z);
  }
  return last ?? { x: 0, z: 1 };
}

/**
 * Postavy a koně mužů výjezdu – oděv mužů rodu, jezdci s koněm (army.ts – pochod); `led` – koně bez
 * jezdce cestou mezi ohradou a kůlem při odjezdu a příjezdu (expedition-choreo.ts).
 */
export function journeyFigures(
  poses: readonly RiderPose[],
  led: readonly ArmyAnimal[] = [],
): {
  figures: ArmyFigure[];
  animals: ArmyAnimal[];
} {
  const figures: ArmyFigure[] = [];
  const animals: ArmyAnimal[] = [...led];
  for (const p of poses) {
    const id = poseId(p);
    const moving = p.speed > STAND_M_S;
    if (p.mounted) {
      animals.push({
        key: `jh${id}`,
        species: 'horse',
        x: p.x,
        z: p.z,
        hx: p.hx,
        hz: p.hz,
        speed: moving ? p.speed : 0,
      });
    }
    if (p.led) {
      // vedený kůň – vedle pěšího jezdce, stejný směr a krok
      animals.push({
        key: `jl${id}`,
        species: 'horse',
        x: p.x + p.hz * LED_HORSE_SIDE_M,
        z: p.z - p.hx * LED_HORSE_SIDE_M,
        hx: p.hx,
        hz: p.hz,
        speed: moving ? p.speed : 0,
      });
    }
    figures.push({
      key: `j${id}`,
      // jezdec je muž (jízdní klipy má jen `man.glb`); pěší vesničanka je `woman.glb`
      kind: !p.mounted && p.look === 'woman' ? 'woman' : 'man',
      x: p.x,
      z: p.z,
      hx: p.hx,
      hz: p.hz,
      clip: p.mounted
        ? moving
          ? p.speed > TROT_M_S
            ? 'ride-trot'
            : 'ride'
          : 'ride-idle'
        : moving
          ? 'walk'
          : 'idle',
      pace: !p.mounted && moving ? Math.min(2, Math.max(0.5, p.speed / WALK_M_S)) : 1,
      lift: p.mounted ? RIDER_LIFT_M : 0,
      lying: false,
      side: p.mounted ? 'attack' : 'folk',
      look: p.mounted ? ARMY_LOOKS.line : ARMY_LOOKS.folk,
      ...(p.look === 'child' ? { scale: CHILD_FIGURE_SCALE } : {}),
    });
  }
  return { figures, animals };
}

/**
 * Vybraný muž vlastního výjezdu (osoba `personId` vsi `villageId`, chybí – ves scény), jak je
 * nakreslený – výběr jde s jezdcem jako jednotka v 0 A.D. (lord-control.md – Co hráč vidí). Muž,
 * který ve scéně není, nebo nic – null.
 */
export function selectedRider(
  poses: readonly RiderPose[],
  personId: number | null,
  villageId?: string,
): RiderPose | null {
  if (personId === null) return null;
  return poses.find((p) => p.own && p.personId === personId && p.villageId === villageId) ?? null;
}

/** Klik do tolika CSS px od průmětu muže výjezdu (od nohou po hlavu) ho vybere. */
export const JOURNEY_PICK_PX = 16;

/**
 * Muž výjezdu pod kurzorem (x, y) – nejbližší průmět od země po hlavu (jezdec i s koněm) nejvýš
 * `maxPx` od kurzoru; nic – null.
 */
export function pickRider(
  poses: readonly RiderPose[],
  x: number,
  y: number,
  project: Project,
  groundHeight: (x: number, z: number) => number,
  maxPx = JOURNEY_PICK_PX,
): { pose: RiderPose; distance: number } | null {
  let best: RiderPose | null = null;
  let bestD = maxPx;
  for (const p of poses) {
    const gy = groundHeight(p.x, p.z);
    const foot = project(p.x, gy, p.z);
    const head = project(
      p.x,
      gy +
        FIGURE_HEIGHT_M * (p.look === 'child' ? CHILD_FIGURE_SCALE : 1) +
        (p.mounted ? RIDER_LIFT_M : 0),
      p.z,
    );
    if (!foot || !head) continue;
    const d = segmentDistance(x, y, foot, head);
    if (d <= bestD) {
      bestD = d;
      best = p;
    }
  }
  return best ? { pose: best, distance: bestD } : null;
}

function segmentDistance(
  x: number,
  y: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2)) : 0;
  return Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t));
}

/**
 * Koně vlastní vsi, které mají členové výjezdu u sebe (`Horse.riderId` – jezdec na koni i ten, kdo
 * koně vede) – ohrada je nekreslí, jsou s lidmi pryč.
 */
export function journeyHorseIds(
  village: Partial<Pick<SceneVillage, 'pens'>> | null,
  journeys: readonly SceneJourney[],
): Set<number> {
  const riders = new Set<number>();
  for (const j of journeys) {
    for (const m of j.men) if ((m.mounted || m.led) && m.personId !== null) riders.add(m.personId);
  }
  const out = new Set<number>();
  if (riders.size === 0) return out;
  for (const pen of village?.pens ?? []) {
    for (const horse of pen.horses ?? []) {
      if (horse.riderId !== undefined && riders.has(horse.riderId)) out.add(horse.id);
    }
  }
  return out;
}
