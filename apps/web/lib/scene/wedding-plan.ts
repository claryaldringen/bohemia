// Svatba ve scéně bez Babylonu (docs/design/kinship.md – Svatba ve scéně; Martin – GitHub issue #2:
// „Jako máme pohřeb, udělej i svatbu. Svatebčané půjdou na některé z posvátných míst v okolí, kde
// budou oddáni.“). Jen zobrazení: ze svatby ve vsi (`SceneWedding` – wedding-view.ts) místo obřadu
// (svatyně, modla, posvátný dub nebo dubový háj vsi do ≈ 600 m – blízké nejčastěji; bez nich
// ohniště na návsi před domem nevěsty), průvod od domu nevěsty po pěšinách – vpředu nevěsta
// s věncem a ženich, za nimi domácnosti obou a lidé z ostatních domácností; nevěsta nebo ženich
// z okolí přijde se svými lidmi od kraje mapy (po zemské stezce, když je) a obě skupiny dojdou
// naráz. U posvátného místa stojí svatebčané v podkově kolem páru, pár hledí k modle, ke kmeni
// dubu, do háje nebo do ohně, pak k sobě; po obřadu jde průvod do nového domova páru, ostatní se
// rozejdou domů a lidé z okolí odejdou ke kraji. Všechno je čistá funkce času (skutečný čas jako
// u ostatních postav – stejný okamžik = stejná póza): začátek je začátek herního dne svatby (okno
// dne z hodin světa), průvod jde skutečnou chůzí tempem pohřbu (`processionPace`).
import { SACRED_OAK_RADIUS_M, sacredEntrance } from '@bohemia/game';
import type { SceneWedding, SceneWeddingGuest } from '../wedding-view';
import type { SceneVillage } from '../village-view';
import {
  doorWaits,
  processionPace,
  routeOf,
  smooth,
  subPath,
  unit,
  type DayWindow,
  type Point,
} from './funeral-plan';
import { LIVESTOCK_EPOCH_MS } from './livestock-motion';
import { SHRINE_RING_M, shrineFiresWorld } from './sacred-layout';
import { hash01 } from './smoke-schedule';
import {
  alongRoute,
  walkSpeed,
  type PoseFn,
  type Route,
  type VillagerKind,
  type VillagerPose,
} from './villager-motion';

/** Posvátná místa dál než tolik metrů od domu nevěsty se nevybírají (návrh Clauda). */
export const WEDDING_SITE_RADIUS_M = 600;
/** Váha místa 1 ÷ (vzdálenost + NEAR)² – nejbližší nejčastěji, ale ne vždy (návrh Clauda). */
export const WEDDING_SITE_NEAR_M = 40;

/**
 * Časy obřadu (skutečný čas, s – návrh Clauda, kinship.md – Svatba ve scéně): průvod ze vsi se
 * schází u domu GATHER_S, kdo došel, jde na své místo v podkově po řadách (RING_START_S,
 * RING_STEP_S), obřad trvá RITES_S – od VOWS_SHARE pár hledí k sobě –, pak se po LEAVE_S
 * rozchází (svatebčané po jednom, LEAVE_STEP_S). Oheň (svatyně, náves) hoří od FIRE_BEFORE_S před
 * příchodem průvodu do FIRE_AFTER_S po obřadu.
 */
export const WEDDING_TIMING = {
  gatherS: 8,
  ringStartS: 1,
  ringStepS: 0.3,
  ritesS: 40,
  vowsShare: 0.6,
  leaveS: 3,
  leaveStepS: 0.5,
  fireBeforeS: 20,
  fireAfterS: 20,
} as const;

/** Průvod: pár v první řadě vedle sebe, za ním řady po dvou (m). */
const COLUMN = { firstM: 1.4, rowM: 1.15, sideM: 0.5 } as const;
/** Pár stojí vedle sebe (m od středu napříč). */
const COUPLE_SIDE_M = 0.45;
/** Čelo průvodu ze vsi vyjde kus od domu – kdo se na trasu nevejde, čeká u vchodu (m). */
const HEAD_START_M = 3;
/** Lidé z okolí zastaví kus před místem páru (m) – ženich nebo nevěsta dojde k páru. */
const OUTSIDE_STOP_M = 3;
/** Podkova kolem páru: poloměry řad (m), nejmenší rozestup (m), otevřená strana k místu (rad). */
const HORSESHOE_RADII_M = [2.6, 3.8, 5, 6.2, 7.4, 8.6] as const;
const HORSESHOE_SPACING_M = 1.15;
const HORSESHOE_OPEN = (Math.PI * 55) / 180;
/** Nejpomalejší chůze (m/s – dítě, starší) – do kdy jsou lidé svatby vidět, kdy začne obřad. */
const SLOWEST_M_S = 0.6;
/** Obřad začne nejpozději tolik sekund po příchodu (kdo nedošel, dojde během něj). */
const RING_WAIT_MAX_S = 30;

/** Svatyně: kde stojí pár (m před modlou), plocha uvnitř příkopu a vstup (m od středu). */
const SHRINE = { coupleM: 5.5, idolClearM: 2.8, platformM: SHRINE_RING_M.inner - 0.8, outM: 17 };
/** Modla: pár stojí tolik m před ní, průvod přichází zepředu (m). */
const IDOL = { coupleM: 3.2, clearM: 1.4, approachM: 7 };
/** Dub: pár stojí na kraji koruny (podle velikosti dubu), kmen (m). */
const OAK = { trunkClearM: 1.1, approachM: 4 };
/** Háj: pár stojí kus před krajem háje (m). */
const GROVE = { outsideM: 1.6, approachM: 4 };
/** Náves: ohniště kus před vchodem domu nevěsty, pár mezi ohněm a domem (m). */
const GREEN = { fireM: 7, coupleM: 1.9, fireClearM: 1.3 };

export type WeddingSiteKind = 'shrine' | 'idol' | 'oak' | 'grove' | 'green';

/** Posvátné místo vsi, kam se dá jít na svatbu – druh, id (stavba, dub, háj) a vzdálenost. */
export interface WeddingSiteCandidate {
  kind: Exclude<WeddingSiteKind, 'green'>;
  id: number;
  x: number;
  z: number;
  distanceM: number;
}

/**
 * Místo obřadu: kde stojí pár (`couple` – střed podkovy svatebčanů), kam se pár dívá (`focus` –
 * modla, kmen dubu, háj, oheň), poslední body trasy průvodu před párem (`way` – u svatyně před
 * příkopem a přes něj, jinde zepředu), ohně obřadu (svatyně – ohniště u vstupu, náves –
 * ohniště), překážka, kam nikdo nestoupne (`obstacle` – modla, kmen, oheň), u svatyně její střed
 * (lidé stojí jen na ploše uvnitř příkopu) a u posvátného dubu kmen (věnec a pentle při obřadu).
 */
export interface WeddingSite {
  kind: WeddingSiteKind;
  id: number | null;
  couple: Point;
  focus: Point;
  way: Point[];
  fires: Point[];
  obstacle: { x: number; z: number; r: number } | null;
  shrine?: Point;
  oak?: { x: number; z: number; growth: number };
}

/** Časy svatby (ms). */
export interface WeddingTimeline {
  /** Začátek dne svatby – lidé z okolí vyjdou od kraje mapy. */
  startMs: number;
  /** Průvod ze vsi se schází u domu (lidé se objeví) a vyjde. */
  gatherMs: number;
  departMs: number;
  /** Čelo průvodu ze vsi a lidé z okolí u místa obřadu. */
  arriveMs: number;
  outsideArriveMs: number | null;
  /** Obřad: začátek, pár k sobě, konec. */
  ritesMs: number;
  vowsMs: number;
  endMs: number;
  /** Oheň obřadu (svatyně, náves) hoří od–do. */
  fireFromMs: number;
  fireUntilMs: number;
  /** Tempo průvodu ze vsi, lidí z okolí a průvodu do nového domova (m/s). */
  pace: number;
  outsidePace: number;
  homePace: number;
}

/** Skupina průvodu: trasa, odkud čelo vyjde a kde se zastaví, kdy vyjde a tempo. */
export interface WeddingParty {
  path: Route;
  headS: number;
  stopS: number;
  departMs: number;
  pace: number;
  /** Lidé z okolí: kdo ještě nevyšel (za krajem mapy), není vidět; ze vsi čeká u vchodu. */
  outside: boolean;
}

export type WeddingRole = 'bride' | 'groom' | 'guest' | 'companion';

/** Člověk svatby: role, ze které skupiny, vzhled, místo v průvodu, v podkově a cesta domů. */
export interface WeddingMember {
  key: string;
  role: WeddingRole;
  /** Člověk vsi (id z jádra); lidé z okolí a starší zápisy bez něj. */
  person?: number;
  party: 'village' | 'outside';
  sex: SceneWeddingGuest['sex'];
  child: boolean;
  elder: boolean;
  /** O kolik metrů jde za čelem své skupiny a napříč (m, + vlevo). */
  behind: number;
  side: number;
  /** Kde čeká u vchodu (ze vsi), než na něj v průvodu přijde řada. */
  wait: Point;
  /** Místo u páru: pár vedle sebe, svatebčané v podkově. */
  ring: Point;
  /** Cesta od místa v průvodu (po příchodu) k místu u páru. */
  toRing: Route;
  /** Cesta domů (nový domov, vlastní dům, ke kraji mapy) – na konci zmizí. */
  home: Route;
  /** Jde domů v průvodu páru (tempo průvodu), jinak vlastní chůzí. */
  procession: boolean;
  /** Lidé z okolí jdou zpátky ke kraji spolu – tempo skupiny (m/s); bez údaje vlastní chůzí. */
  groupPace?: number;
  ringMs: number;
  leaveMs: number;
}

/** Plán svatby ve scéně – místo, skupiny, časy a lidé. */
export interface WeddingPlan {
  key: string;
  wedding: SceneWedding;
  site: WeddingSite;
  village: WeddingParty;
  outside: WeddingParty | null;
  timeline: WeddingTimeline;
  members: WeddingMember[];
  /** Obdélník tras, podkovy a cest domů – obal pro ořez záběrem. */
  extent: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Do kdy jsou lidé svatby vidět (ms) – poslední doma nebo za krajem mapy. */
  figuresUntilMs: number;
}

/** Co plán svatby potřebuje od scény (villager-plan.ts – vchody, pěšiny, schůdná zem). */
export interface WeddingEnv {
  /** Okno herního dne; bez hodin null – svatba se nekreslí. */
  dayWindow(day: number): DayWindow | null;
  /** Kde se vychází z obydlí `id` (před vchodem, volné místo), nebo null (obydlí ve scéně není). */
  door(id: number): Point | null;
  /** Trasa po pěšinách a cestách z `a` do `b` (body [x, z]), nebo null – jde se rovně. */
  route(a: Point, b: Point): readonly (readonly [number, number])[] | null;
  /**
   * Smí tu stát člověk – schůdná zem mimo domy a pozemky (modla a svatyně se tu nepočítají – jejich
   * okolí hlídá místo obřadu).
   */
  standable(x: number, z: number): boolean;
  /** Stylizované zvětšení postav (FIGURE_SCALE) – rozestupy průvodu a podkovy. */
  figureScale: number;
  /** Seed vsi – výběr místa a los svatebčanů. */
  seed: number;
}

/** Deterministická náhoda 0–1 z textu a čísla. */
function hashText(text: string, k: number): number {
  let h = 2166136261 ^ Math.imul(k | 0, 0x9e3779b1);
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * Posvátná místa vsi do WEDDING_SITE_RADIUS_M od `from` (dům nevěsty): stojící navštěvovaná modla
 * a svatyně (rozestavěné, opuštěné a padlé ne), živé posvátné duby (souše a padlé ne) a dubové
 * háje – od nejbližšího.
 */
export function weddingSiteCandidates(village: SceneVillage, from: Point): WeddingSiteCandidate[] {
  const sacred = village.sacred;
  if (!sacred) return [];
  const out: WeddingSiteCandidate[] = [];
  const add = (kind: WeddingSiteCandidate['kind'], id: number, x: number, z: number): void => {
    const d = distance(from, { x, z });
    if (d <= WEDDING_SITE_RADIUS_M) out.push({ kind, id, x, z, distanceM: d });
  };
  for (const b of sacred.buildings) {
    if (!b.built || b.abandoned) continue;
    add(b.kind, b.id, b.position.x, b.position.z);
  }
  for (const oak of sacred.oaks) if (!oak.snag) add('oak', oak.id, oak.x, oak.z);
  for (const grove of sacred.groves) add('grove', grove.id, grove.x, grove.z);
  const order: Record<WeddingSiteCandidate['kind'], number> = {
    shrine: 0,
    idol: 1,
    oak: 2,
    grove: 3,
  };
  return out.sort(
    (a, b) => a.distanceM - b.distanceM || order[a.kind] - order[b.kind] || a.id - b.id,
  );
}

/**
 * Které místo svatba vybere (kinship.md – Svatba ve scéně, návrh Clauda): los `roll` 0–1 s vahou
 * 1 ÷ (vzdálenost + WEDDING_SITE_NEAR_M)² – nejbližší nejčastěji, vzdálenější někdy. Bez
 * kandidátů null (náves).
 */
export function pickWeddingSite(
  candidates: readonly WeddingSiteCandidate[],
  roll: number,
): WeddingSiteCandidate | null {
  if (candidates.length === 0) return null;
  const weights = candidates.map((c) => 1 / (c.distanceM + WEDDING_SITE_NEAR_M) ** 2);
  const total = weights.reduce((sum, w) => sum + w, 0);
  let left = Math.min(0.999999, Math.max(0, roll)) * total;
  for (let i = 0; i < candidates.length; i++) {
    left -= weights[i]!;
    if (left < 0) return candidates[i]!;
  }
  return candidates[candidates.length - 1]!;
}

/** Bod ve vzdálenosti `m` od `p` ve směru `d`. */
function ahead(p: Point, d: Point, m: number): Point {
  return { x: p.x + d.x * m, z: p.z + d.z * m };
}

/**
 * Místo obřadu u kandidáta (nebo náves): u svatyně a modly k předku (`sacredEntrance`), u dubu ke
 * kmeni na kraj koruny ze strany od domu nevěsty, u háje k jeho kraji nejblíž domu; bez místa
 * ohniště na návsi před domem nevěsty (`door`, `house`) – na schůdném místě (`standable`).
 */
export function weddingSiteOf(
  candidate: WeddingSiteCandidate | null,
  village: SceneVillage,
  from: Point,
  door: Point,
  standable: (x: number, z: number) => boolean,
): WeddingSite {
  const sacred = village.sacred;
  if (candidate && (candidate.kind === 'shrine' || candidate.kind === 'idol')) {
    const building = sacred?.buildings.find((b) => b.id === candidate.id);
    if (building) {
      const center = { x: building.position.x, z: building.position.z };
      const e = sacredEntrance(building);
      const out = { x: e.outX, z: e.outZ };
      if (building.kind === 'shrine') {
        // ohniště ve výběžcích příkopu nejblíž vstupu (dvě – vlevo a vpravo od předku)
        const fires = shrineFiresWorld(building.position)
          .map(([x, z]) => ({ x, z }))
          .sort(
            (a, b) =>
              (b.x - center.x) * out.x +
              (b.z - center.z) * out.z -
              ((a.x - center.x) * out.x + (a.z - center.z) * out.z),
          )
          .slice(0, 2);
        return {
          kind: 'shrine',
          id: building.id,
          couple: ahead(center, out, SHRINE.coupleM),
          focus: center,
          way: [
            ahead(center, out, SHRINE.outM),
            { x: e.x, z: e.z },
            ahead(center, out, SHRINE.platformM - 0.5),
          ],
          fires,
          obstacle: { x: center.x, z: center.z, r: SHRINE.idolClearM },
          shrine: center,
        };
      }
      return {
        kind: 'idol',
        id: building.id,
        couple: ahead(center, out, IDOL.coupleM),
        focus: center,
        way: [ahead(center, out, IDOL.approachM)],
        fires: [],
        obstacle: { x: center.x, z: center.z, r: IDOL.clearM },
      };
    }
  }
  if (candidate?.kind === 'oak') {
    const oak = sacred?.oaks.find((o) => o.id === candidate.id);
    if (oak) {
      const growth = oak.growth ?? 1;
      const trunk = { x: oak.x, z: oak.z };
      const toHome = unit(from.x - trunk.x, from.z - trunk.z);
      const crown = SACRED_OAK_RADIUS_M * growth;
      return {
        kind: 'oak',
        id: oak.id,
        couple: ahead(trunk, toHome, crown),
        focus: trunk,
        way: [ahead(trunk, toHome, crown + OAK.approachM)],
        fires: [],
        obstacle: { x: trunk.x, z: trunk.z, r: OAK.trunkClearM * growth },
        oak: { x: trunk.x, z: trunk.z, growth },
      };
    }
  }
  if (candidate?.kind === 'grove') {
    const grove = sacred?.groves.find((g) => g.id === candidate.id);
    if (grove && grove.squares.length > 0) {
      // kraj háje nejblíž domu: nejbližší bod čtverců, kus za ním ven
      let edge: Point = { x: grove.x, z: grove.z };
      let best = Infinity;
      for (const q of grove.squares) {
        const half = q.size / 2;
        const p = {
          x: Math.min(q.x + half, Math.max(q.x - half, from.x)),
          z: Math.min(q.z + half, Math.max(q.z - half, from.z)),
        };
        const d = distance(p, from);
        if (d < best) {
          best = d;
          edge = p;
        }
      }
      const outward = unit(from.x - edge.x, from.z - edge.z);
      const inside = (p: Point): boolean =>
        grove.squares.some(
          (q) => Math.abs(p.x - q.x) < q.size / 2 && Math.abs(p.z - q.z) < q.size / 2,
        );
      let couple = ahead(edge, outward, GROVE.outsideM);
      for (let k = 0; k < 8 && inside(couple); k++) couple = ahead(couple, outward, 2);
      return {
        kind: 'grove',
        id: grove.id,
        couple,
        focus: edge,
        way: [ahead(couple, outward, GROVE.approachM)],
        fires: [],
        obstacle: null,
      };
    }
  }
  // náves: ohniště kus před vchodem domu nevěsty, na schůdném místě
  const outward = unit(door.x - from.x, door.z - from.z);
  let fire = ahead(door, outward, GREEN.fireM);
  for (const turn of [0, 0.5, -0.5, 1, -1, 1.5, -1.5]) {
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    const d = { x: outward.x * c - outward.z * s, z: outward.z * c + outward.x * s };
    const p = ahead(door, d, GREEN.fireM);
    const couple = along(p, door, GREEN.coupleM);
    if (
      standable(p.x, p.z) &&
      standable(...couple) &&
      !onField(village, p.x, p.z) &&
      !onField(village, ...couple)
    ) {
      fire = p;
      break;
    }
  }
  const back = unit(door.x - fire.x, door.z - fire.z);
  return {
    kind: 'green',
    id: null,
    couple: ahead(fire, back, GREEN.coupleM),
    focus: fire,
    way: [],
    fires: [fire],
    obstacle: { x: fire.x, z: fire.z, r: GREEN.fireClearM },
  };
}

/** Leží bod na dílu pole (i natočeném)? Ohniště na návsi se na pole nedává. */
function onField(village: SceneVillage, x: number, z: number): boolean {
  return village.fields.some((f) =>
    f.parts.some((q) => {
      const c = Math.cos(q.rotation ?? 0);
      const s = Math.sin(q.rotation ?? 0);
      const dx = x - q.x;
      const dz = z - q.z;
      const half = q.size / 2;
      return Math.abs(dx * c - dz * s) < half && Math.abs(dx * s + dz * c) < half;
    }),
  );
}

/** Bod `m` metrů od `a` směrem k `b` jako dvojice [x, z]. */
function along(a: Point, b: Point, m: number): [number, number] {
  const d = unit(b.x - a.x, b.z - a.z);
  return [a.x + d.x * m, a.z + d.z * m];
}

/**
 * Vložená zastávka, ať úsečka a–b obejde překážku `o` (modla, kmen, oheň) – nevede blíž než její
 * poloměr a kus navíc.
 */
function around(a: Point, b: Point, o: { x: number; z: number; r: number } | null): Point[] {
  if (!o) return [a, b];
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const u =
    len2 > 1e-9 ? Math.min(1, Math.max(0, ((o.x - a.x) * dx + (o.z - a.z) * dz) / len2)) : 0;
  const px = a.x + dx * u;
  const pz = a.z + dz * u;
  const clear = o.r + 0.6;
  if (Math.hypot(px - o.x, pz - o.z) >= clear) return [a, b];
  let n = unit(px - o.x, pz - o.z);
  if (Math.hypot(px - o.x, pz - o.z) < 1e-3) n = unit(-dz, dx);
  return [a, { x: o.x + n.x * (clear + 0.6), z: o.z + n.z * (clear + 0.6) }, b];
}

/**
 * Místa v podkově kolem páru (`center`, pár hledí ve směru `facing`) pro `count` lidí: řady od
 * nejbližší, v řadě po rozestupu `spacingM` od místa za párem střídavě do stran; strana k místu
 * obřadu (±HORSESHOE_OPEN od `facing`) zůstane volná. Místo musí být volné (`free`); kdo se
 * nevejde, stojí na posledním možném místě.
 */
export function horseshoeSpots(
  center: Point,
  facing: Point,
  count: number,
  spacingM: number,
  free: (x: number, z: number) => boolean,
): Point[] {
  const out: Point[] = [];
  const back = Math.atan2(-facing.z, -facing.x);
  const halfArc = Math.PI - HORSESHOE_OPEN;
  for (const radius of HORSESHOE_RADII_M) {
    if (out.length >= count) break;
    const r = radius * (spacingM / HORSESHOE_SPACING_M);
    const step = spacingM / r;
    const slots = Math.floor(halfArc / step);
    // za párem, pak střídavě vlevo a vpravo
    for (let k = 0; k <= 2 * slots && out.length < count; k++) {
      const offset = k === 0 ? 0 : Math.ceil(k / 2) * (k % 2 === 1 ? 1 : -1);
      const a = back + offset * step;
      const p = { x: center.x + Math.cos(a) * r, z: center.z + Math.sin(a) * r };
      if (free(p.x, p.z)) out.push(p);
    }
  }
  while (out.length < count) out.push(out[out.length - 1] ?? { ...center });
  return out;
}

/** Místa páru u místa obřadu: nevěsta vlevo, ženich vpravo (při pohledu k místu). */
function coupleSpots(site: WeddingSite): { bride: Point; groom: Point; facing: Point } {
  const facing = unit(site.focus.x - site.couple.x, site.focus.z - site.couple.z);
  // vlevo od směru (fx, fz) je (−fz, fx)
  const left = { x: -facing.z, z: facing.x };
  return {
    bride: ahead(site.couple, left, COUPLE_SIDE_M),
    groom: ahead(site.couple, left, -COUPLE_SIDE_M),
    facing,
  };
}

/** Kde stojí člověk skupiny po zastavení čela: na trase `behind` m za čelem, `side` vedle osy. */
function columnSpot(party: WeddingParty, behind: number, side: number, wait: Point): Point {
  const s = party.stopS - behind;
  if (s < 0) return wait;
  alongRoute(party.path, s, false, TMP_POSE);
  return { x: TMP_POSE.x - TMP_POSE.headingZ * side, z: TMP_POSE.z + TMP_POSE.headingX * side };
}

const TMP_POSE: VillagerPose = { x: 0, z: 0, headingX: 0, headingZ: 1, clip: 'idle', pace: 1 };

/** Body trasy po pěšinách z `a` do `b` bez krajních bodů. */
function inner(env: WeddingEnv, a: Point, b: Point): Point[] {
  const along = env.route(a, b);
  return along && along.length >= 2 ? along.slice(1, -1).map(([x, z]) => ({ x, z })) : [];
}

/** Obydlí ve scéně nejblíž bodu (obydlené napřed), nebo null. */
function nearestDwelling(village: SceneVillage, p: Point): number | null {
  const homes = village.dwellings.filter((d) => d.built && d.inhabited !== false);
  let best: number | null = null;
  let bestD = Infinity;
  for (const d of homes.length > 0 ? homes : village.dwellings) {
    const dist = Math.hypot(d.position.x - p.x, d.position.z - p.z);
    if (dist < bestD) {
      bestD = dist;
      best = d.id;
    }
  }
  return best;
}

/** Střed vsi – průměr obydlí. */
function villageMiddle(village: SceneVillage): Point {
  const n = Math.max(1, village.dwellings.length);
  return {
    x: village.dwellings.reduce((s, d) => s + d.position.x, 0) / n,
    z: village.dwellings.reduce((s, d) => s + d.position.z, 0) / n,
  };
}

/**
 * Trasa lidí z okolí od kraje mapy k místu obřadu: po hotové zemské stezce ve směru, odkud jdou
 * (od kraje ke dvorci, pak po pěšinách), jinak krajinou rovně.
 */
function outsidePoints(
  wedding: SceneWedding,
  village: SceneVillage,
  site: WeddingSite,
  env: WeddingEnv,
): Point[] | null {
  const spouse = wedding.bride.from === null ? wedding.bride : wedding.groom;
  const from = spouse.outside;
  if (!from || (wedding.bride.from !== null && wedding.groom.from !== null)) return null;
  const target = site.way[0] ?? site.couple;
  const trail = (village.trails ?? []).find(
    (t) => t.built && t.direction === from.direction && t.points.length >= 2,
  );
  const points: Point[] = [];
  if (trail) {
    const back = [...trail.points].reverse();
    points.push(...back.map((p) => ({ x: p.x, z: p.z })));
    points.push(...inner(env, back[back.length - 1]!, target));
  } else {
    points.push({ x: from.edge.x, z: from.edge.z });
  }
  points.push(...site.way, site.couple);
  return points;
}

/**
 * Plán svatby (kinship.md – Svatba ve scéně): místo obřadu (los ze seedu vsi a klíče svatby),
 * průvod ze vsi od vchodu domu nevěsty (nevěsta z okolí – od domu ženicha) po pěšinách, lidé
 * z okolí od kraje mapy, časy z okna dne svatby (obě skupiny dojdou naráz), místa v podkově
 * a cesty domů. Bez hodin světa nebo bez obydlí null.
 */
export function weddingPlan(
  wedding: SceneWedding,
  village: SceneVillage,
  env: WeddingEnv,
): WeddingPlan | null {
  const window = env.dayWindow(wedding.day);
  if (!window || village.dwellings.length === 0) return null;
  const scale = env.figureScale;
  const t = WEDDING_TIMING;
  const known = (id: number | null): id is number =>
    id !== null && village.dwellings.some((d) => d.id === id) && env.door(id) !== null;
  // dům, odkud průvod ze vsi vyjde: nevěsty, z okolí – ženicha (nový domov)
  const startId =
    wedding.bride.from ?? (wedding.groom.from !== null ? wedding.groom.from : wedding.home);
  const homeKnown = known(wedding.home);
  const reference = known(startId)
    ? village.dwellings.find((d) => d.id === startId)!.position
    : homeKnown
      ? village.dwellings.find((d) => d.id === wedding.home)!.position
      : villageMiddle(village);
  const from = { x: reference.x, z: reference.z };
  const candidate = pickWeddingSite(
    weddingSiteCandidates(village, from),
    hashText(wedding.key, env.seed),
  );
  // starší zápisy a zaniklé domy: průvod vyjde od obydlí nejblíž k místu obřadu
  const near = candidate ? nearestDwelling(village, candidate) : nearestDwelling(village, from);
  const doorId = known(startId) ? startId : near;
  const door = doorId === null ? null : env.door(doorId);
  if (!door || doorId === null) return null;
  const doorHouse = village.dwellings.find((d) => d.id === doorId)!.position;
  const site = weddingSiteOf(
    candidate,
    village,
    { x: doorHouse.x, z: doorHouse.z },
    door,
    env.standable,
  );
  const spots = coupleSpots(site);

  // průvod ze vsi: vchod → pěšiny → vstup k místu → pár
  const approach = site.way[0] ?? site.couple;
  const villagePoints: Point[] = [door, ...inner(env, door, approach), ...site.way];
  const last = villagePoints[villagePoints.length - 1]!;
  villagePoints.push(...around(last, site.couple, site.obstacle).slice(1));
  const villagePath = routeOf(villagePoints);
  const villageStop = villagePath.length;
  const villageHead = Math.min(HEAD_START_M, villageStop);
  const pace = processionPace(villageStop - villageHead);
  // lidé z okolí: od kraje mapy (po stezce) k místu obřadu
  const outsideRaw = outsidePoints(wedding, village, site, env);
  const outsidePath = outsideRaw ? routeOf(outsideRaw) : null;
  const outsideStop = outsidePath ? Math.max(0, outsidePath.length - OUTSIDE_STOP_M) : 0;
  const outsidePace = outsidePath ? processionPace(outsideStop) : pace;

  const startMs = window.startMs;
  const villageWalkMs = ((villageStop - villageHead) / pace) * 1000;
  const outsideArriveMs = outsidePath ? startMs + (outsideStop / outsidePace) * 1000 : null;
  const departMs = Math.max(
    startMs + t.gatherS * 1000,
    outsideArriveMs !== null ? outsideArriveMs - villageWalkMs : -Infinity,
  );
  const gatherMs = departMs - t.gatherS * 1000;
  const arriveMs = departMs + villageWalkMs;
  const villageParty: WeddingParty = {
    path: villagePath,
    headS: villageHead,
    stopS: villageStop,
    departMs,
    pace,
    outside: false,
  };
  const outsideParty: WeddingParty | null = outsidePath
    ? {
        path: outsidePath,
        headS: 0,
        stopS: outsideStop,
        departMs: startMs,
        pace: outsidePace,
        outside: true,
      }
    : null;

  // lidé: pár (ze vsi v první řadě, z okolí v čele svých lidí), svatebčané, lidé z okolí
  interface Who {
    role: WeddingRole;
    party: 'village' | 'outside';
    person?: number;
    sex: SceneWeddingGuest['sex'];
    age: number;
    home: number | null;
  }
  const brideOutside = wedding.bride.from === null;
  const groomOutside = wedding.groom.from === null;
  const bride: Who = {
    role: 'bride',
    party: brideOutside ? 'outside' : 'village',
    ...(wedding.bride.id !== undefined ? { person: wedding.bride.id } : {}),
    sex: 'female',
    age: wedding.bride.age,
    home: wedding.home,
  };
  const groom: Who = {
    role: 'groom',
    party: groomOutside ? 'outside' : 'village',
    ...(wedding.groom.id !== undefined ? { person: wedding.groom.id } : {}),
    sex: 'male',
    age: wedding.groom.age,
    home: wedding.home,
  };
  const guests: Who[] = wedding.guests.map((g) => ({
    role: 'guest',
    party: 'village',
    ...(g.id !== undefined ? { person: g.id } : {}),
    sex: g.sex,
    age: g.age,
    home: g.home,
  }));
  const companions: Who[] = outsideParty
    ? (wedding.companions ?? []).map((c) => ({
        role: 'companion',
        party: 'outside',
        sex: c.sex,
        age: c.age,
        home: null,
      }))
    : [];
  const villageWho = [
    ...(brideOutside ? [] : [bride]),
    ...(groomOutside ? [] : [groom]),
    ...guests,
  ];
  const outsideWho = outsideParty
    ? [...(brideOutside ? [bride] : []), ...(groomOutside ? [groom] : []), ...companions]
    : [];
  const all = [...villageWho, ...outsideWho];

  const facing = spots.facing;
  const shrine = site.shrine;
  const free = (x: number, z: number): boolean => {
    if (site.obstacle && Math.hypot(x - site.obstacle.x, z - site.obstacle.z) < site.obstacle.r) {
      return false;
    }
    if (shrine) {
      // u svatyně jen na ploše uvnitř příkopu (příkop a val ne)
      const r = Math.hypot(x - shrine.x, z - shrine.z);
      if (r > SHRINE.platformM && r < SHRINE.outM) return false;
      if (r <= SHRINE.platformM) return true;
    }
    return env.standable(x, z);
  };
  const ringGuests = all.filter((w) => w.role === 'guest' || w.role === 'companion');
  const ring = horseshoeSpots(
    site.couple,
    facing,
    ringGuests.length,
    HORSESHOE_SPACING_M * scale,
    free,
  );
  const ringOf = new Map<Who, Point>(ringGuests.map((w, i) => [w, ring[i]!]));
  ringOf.set(bride, spots.bride);
  ringOf.set(groom, spots.groom);
  const waits = doorWaits(door, villagePath, villageWho.length, scale, env);

  // cesty domů: od místa obřadu zpět vstupem (`way`), pak po pěšinách k domu
  const exitWay = [...site.way].reverse();
  const exit = exitWay[exitWay.length - 1] ?? site.couple;
  const homeDoorId = homeKnown ? wedding.home : doorId;
  const homeDoor = env.door(homeDoorId) ?? door;
  const homeWays = new Map<number, Point[]>();
  const wayTo = (id: number | null): Point[] => {
    const target = id === null ? null : known(id) ? id : homeDoorId;
    if (target === null) return [];
    const memo = homeWays.get(target);
    if (memo) return memo;
    const their = env.door(target) ?? homeDoor;
    const way = [...exitWay, ...inner(env, exit, their), their];
    homeWays.set(target, way);
    return way;
  };
  const outsideBack = outsideRaw ? [...outsideRaw].reverse().slice(1) : [];

  const members: WeddingMember[] = [];
  const rows = new Map<'village' | 'outside', number>([
    ['village', 0],
    ['outside', 0],
  ]);
  const placeIn = (
    party: 'village' | 'outside',
    who: Who,
  ): { behind: number; side: number; row: number } => {
    const isSpouse = who.role === 'bride' || who.role === 'groom';
    if (isSpouse) {
      // pár ze vsi v první řadě vedle sebe; z okolí v čele svých lidí
      const alone = party === 'outside' || brideOutside || groomOutside;
      return {
        behind: 0,
        side: alone ? 0 : (who.role === 'bride' ? 1 : -1) * COUPLE_SIDE_M,
        row: 0,
      };
    }
    const k = rows.get(party)!;
    rows.set(party, k + 1);
    const row = Math.floor(k / 2);
    return {
      behind: COLUMN.firstM + row * COLUMN.rowM * scale,
      side: (k % 2 === 0 ? 1 : -1) * COLUMN.sideM * scale,
      row: row + 1,
    };
  };
  // k místu u páru se jde po trase až za vstup (svatyně – přes příkop), pak rovně
  const wayLast = site.way[site.way.length - 1];
  const tailM = wayLast ? routeOf(around(wayLast, site.couple, site.obstacle)).length : 0;
  let villageIndex = 0;
  for (const who of all) {
    const party = who.party === 'outside' && outsideParty ? outsideParty : villageParty;
    const { behind, side, row } = placeIn(who.party, who);
    const edge = pointOf(party.path.points[0]!);
    const wait = who.party === 'village' ? (waits[villageIndex++] ?? door) : edge;
    const target = ringOf.get(who) ?? site.couple;
    const start = columnSpot(party, behind, side, wait);
    const s = party.stopS - behind;
    const entered = Math.max(0, party.path.length - tailM);
    const between = wayLast && s >= 0 && s < entered ? subPath(party.path, s, entered) : [start];
    const toRing = routeOf([
      start,
      ...between.slice(1),
      ...around(between[between.length - 1] ?? start, target, site.obstacle).slice(1),
    ]);
    const arrival = who.party === 'outside' ? (outsideArriveMs ?? arriveMs) : arriveMs;
    const ringMs = arrival + (t.ringStartS + row * t.ringStepS) * 1000;
    members.push({
      key: `${who.party}:${members.length}`,
      role: who.role,
      ...(who.person !== undefined ? { person: who.person } : {}),
      party: who.party,
      sex: who.sex,
      child: who.age < 14,
      elder: who.age >= 45,
      behind,
      side,
      wait,
      ring: target,
      toRing,
      home: routeOf([target]),
      procession: false,
      ringMs,
      leaveMs: 0,
    });
  }
  // obřad začne, až jsou všichni na místě (nejvýš RING_WAIT_MAX_S po příchodu)
  const firstArrival = Math.max(arriveMs, outsideArriveMs ?? arriveMs);
  const ready = Math.max(
    firstArrival,
    ...members.map((m) => m.ringMs + (m.toRing.length / SLOWEST_M_S) * 1000),
  );
  const ritesMs = Math.min(ready, firstArrival + RING_WAIT_MAX_S * 1000) + 1000;
  const vowsMs = ritesMs + t.ritesS * t.vowsShare * 1000;
  const endMs = ritesMs + t.ritesS * 1000;
  // po obřadu: pár a domácnost nového domova průvodem domů, ostatní domů, lidé z okolí ke kraji
  const homeWay = wayTo(wedding.home);
  const homePace = processionPace(routeOf([site.couple, ...homeWay]).length);
  let followers = 0;
  let leaving = 0;
  members.forEach((m, i) => {
    const who = all[i]!;
    let points: Point[];
    let leaveMs: number;
    let procession = false;
    if (who.role === 'bride' || who.role === 'groom') {
      points = [m.ring, ...homeWay];
      leaveMs = endMs + t.leaveS * 1000;
      procession = true;
    } else if (who.role === 'companion') {
      // lidé z okolí jdou zpátky spolu – po dvou za sebou tempem, jakým přišli
      points = [m.ring, ...outsideBack];
      leaveMs =
        endMs + (t.leaveS + 2 + Math.floor(leaving++ / 2) * (COLUMN.rowM / outsidePace)) * 1000;
      m.groupPace = outsidePace;
    } else if (who.home === wedding.home) {
      // domácnost nového domova jde za párem
      followers++;
      points = [m.ring, ...homeWay];
      leaveMs = endMs + (t.leaveS + 1 + followers * (COLUMN.rowM / homePace) * 0.5) * 1000;
      procession = true;
    } else {
      points = [m.ring, ...wayTo(who.home)];
      leaveMs =
        endMs + (t.leaveS + 2 + hashText(wedding.key, i) * members.length * t.leaveStepS) * 1000;
    }
    const exitPoints = around(points[0]!, points[1] ?? points[0]!, site.obstacle);
    m.home = routeOf([...exitPoints, ...points.slice(2)]);
    m.leaveMs = leaveMs;
    m.procession = procession;
  });
  const fireFromMs = Math.min(arriveMs, outsideArriveMs ?? arriveMs) - t.fireBeforeS * 1000;
  const fireUntilMs = endMs + t.fireAfterS * 1000;
  const timeline: WeddingTimeline = {
    startMs,
    gatherMs,
    departMs,
    arriveMs,
    outsideArriveMs,
    ritesMs,
    vowsMs,
    endMs,
    fireFromMs: site.fires.length > 0 ? Math.max(startMs, fireFromMs) : endMs,
    fireUntilMs: site.fires.length > 0 ? fireUntilMs : endMs,
    pace,
    outsidePace,
    homePace,
  };
  // obal: trasy, čekání u vchodu, podkova a cesty domů
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const add = (x: number, z: number): void => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  };
  for (const [x, z] of villagePath.points) add(x, z);
  for (const [x, z] of outsidePath?.points ?? []) add(x, z);
  for (const m of members) {
    add(m.wait.x, m.wait.z);
    add(m.ring.x, m.ring.z);
    for (const [x, z] of m.home.points) add(x, z);
  }
  const figuresUntilMs = Math.max(
    endMs,
    ...members.map(
      (m) =>
        m.leaveMs +
        (m.home.length / (m.procession ? homePace : (m.groupPace ?? SLOWEST_M_S))) * 1000 +
        1000,
    ),
  );
  return {
    key: wedding.key,
    wedding,
    site,
    village: villageParty,
    outside: outsideParty,
    timeline,
    members,
    extent: { minX, maxX, minZ, maxZ },
    figuresUntilMs,
  };
}

function pointOf(p: readonly [number, number]): Point {
  return { x: p[0], z: p[1] };
}

export type WeddingPhase =
  'before' | 'coming' | 'gathering' | 'procession' | 'ring' | 'rites' | 'vows' | 'home' | 'done';

/** Co se právě děje (ve skutečný okamžik `nowMs`). */
export function weddingPhase(plan: WeddingPlan, nowMs: number): WeddingPhase {
  const t = plan.timeline;
  if (nowMs < t.startMs) return 'before';
  if (nowMs < t.gatherMs) return 'coming';
  if (nowMs < t.departMs) return 'gathering';
  if (nowMs < Math.max(t.arriveMs, t.outsideArriveMs ?? t.arriveMs)) return 'procession';
  if (nowMs < t.ritesMs) return 'ring';
  if (nowMs < t.vowsMs) return 'rites';
  if (nowMs < t.endMs) return 'vows';
  if (nowMs < plan.figuresUntilMs) return 'home';
  return 'done';
}

/** Síla ohně obřadu 0–1 (rozhoří se, hoří, dohasíná) v okamžiku `nowMs`. */
export function weddingFire(plan: WeddingPlan, nowMs: number): number {
  const t = plan.timeline;
  if (plan.site.fires.length === 0 || nowMs < t.fireFromMs || nowMs >= t.fireUntilMs) return 0;
  const rise = smooth((nowMs - t.fireFromMs) / 8000);
  const fade = 1 - smooth((nowMs - (t.fireUntilMs - 12000)) / 12000);
  return Math.min(rise, fade);
}

/** Věnec a pentle na posvátném dubu – jen při obřadu (od příchodu do konce obřadu). */
export function oakGarland(plan: WeddingPlan, nowMs: number): boolean {
  const t = plan.timeline;
  return plan.site.oak !== undefined && nowMs >= t.arriveMs - 2000 && nowMs < t.endMs + 4000;
}

/**
 * Kam se dívat na svatbu (vývojová ukázka): lidé z okolí na cestě, průvod ze vsi, pár u místa
 * obřadu a pak na cestě do nového domova.
 */
export function weddingFocus(plan: WeddingPlan, nowMs: number): Point {
  const t = plan.timeline;
  const at = (party: WeddingParty): Point => {
    alongRoute(party.path, headAt(party, nowMs), false, TMP_POSE);
    return { x: TMP_POSE.x, z: TMP_POSE.z };
  };
  if (plan.outside && nowMs < t.gatherMs) return at(plan.outside);
  if (nowMs < t.arriveMs) return at(plan.village);
  const bride = plan.members.find((m) => m.role === 'bride');
  if (nowMs < t.endMs || !bride || nowMs < bride.leaveMs) return { ...plan.site.couple };
  alongRoute(bride.home, ((nowMs - bride.leaveMs) / 1000) * t.homePace, false, TMP_POSE);
  return { x: TMP_POSE.x, z: TMP_POSE.z };
}

/** Kde je čelo skupiny – vzdálenost po trase v okamžiku `nowMs`. */
function headAt(party: WeddingParty, nowMs: number): number {
  if (nowMs <= party.departMs) return party.headS;
  return Math.min(party.stopS, party.headS + ((nowMs - party.departMs) / 1000) * party.pace);
}

/** Kdy je člověk svatby vidět poprvé (ms) – ze vsi při scházení, z okolí na kraji mapy. */
function visibleFromMs(plan: WeddingPlan, m: WeddingMember): number {
  return m.party === 'village' ? plan.timeline.gatherMs : plan.timeline.startMs;
}

/**
 * Póza člověka svatby `index` v čase `t` (s, villagerSeconds) – postava `kind` a měřítka `scale`
 * (rychlost chůze, ať nohy neklouzají). Před svatbou, za krajem mapy a doma po svatbě skrytý.
 */
export function weddingPose(
  plan: WeddingPlan,
  index: number,
  kind: VillagerKind,
  scale: number,
): PoseFn {
  const m = plan.members[index]!;
  const t = plan.timeline;
  const party = m.party === 'outside' && plan.outside ? plan.outside : plan.village;
  const walk = walkSpeed(kind, 'walk', scale);
  const own = walk * (m.child ? 0.85 : m.elder ? 0.8 : 0.95);
  const spouse = m.role === 'bride' || m.role === 'groom';
  const partner = spouse
    ? plan.members.find((o) => o.role === (m.role === 'bride' ? 'groom' : 'bride'))
    : undefined;
  const from = visibleFromMs(plan, m);
  return (time, _herds, o) => {
    const nowMs = time * 1000 + LIVESTOCK_EPOCH_MS;
    o.hidden = false;
    if (nowMs < from) {
      o.hidden = true;
      o.x = m.wait.x;
      o.z = m.wait.z;
      o.clip = 'idle';
      o.pace = 1;
      return o;
    }
    const face = (p: Point): void => {
      const d = unit(p.x - o.x, p.z - o.z);
      o.headingX = d.x;
      o.headingZ = d.z;
    };
    // po obřadu domů (pár a domácnost nového domova průvodem) – na konci cesty zmizí
    if (nowMs >= m.leaveMs) {
      const speed = m.procession ? t.homePace : (m.groupPace ?? own);
      const d = ((nowMs - m.leaveMs) / 1000) * speed;
      alongRoute(m.home, d, false, o);
      o.clip = 'walk';
      o.pace = Math.max(0.35, speed / walk);
      o.hidden = d >= m.home.length + 0.5;
      return o;
    }
    // u páru: na své místo, pak stojí – pár hledí k místu obřadu, pak k sobě; ostatní na pár
    if (nowMs >= m.ringMs) {
      const d = ((nowMs - m.ringMs) / 1000) * own;
      alongRoute(m.toRing, d, false, o);
      if (d >= m.toRing.length) {
        if (spouse) face(nowMs >= t.vowsMs && partner ? partner.ring : plan.site.focus);
        else face(plan.site.couple);
        o.clip = 'idle';
        o.pace = 1;
      } else {
        o.clip = 'walk';
        o.pace = own / walk;
      }
      return o;
    }
    // v průvodu: za čelem o `behind` metrů
    const head = headAt(party, nowMs);
    const s = head - m.behind;
    const moving = nowMs >= party.departMs && head < party.stopS;
    if (s < 0) {
      // z okolí: ještě za krajem mapy
      if (party.outside) {
        o.hidden = true;
        alongRoute(party.path, 0, false, o);
        o.clip = 'idle';
        o.pace = 1;
        return o;
      }
      // ze vsi: čeká u vchodu, než na něj přijde řada – pak k vchodu, kde se zařadí
      const door = party.path.points[0]!;
      const gapM = Math.hypot(m.wait.x - door[0], m.wait.z - door[1]);
      const d = unit(door[0] - m.wait.x, door[1] - m.wait.z);
      o.headingX = d.x;
      o.headingZ = d.z;
      if (s > -gapM && moving) {
        const u = 1 + s / Math.max(0.01, gapM);
        o.x = m.wait.x + (door[0] - m.wait.x) * u;
        o.z = m.wait.z + (door[1] - m.wait.z) * u;
        o.clip = 'walk';
        o.pace = Math.max(0.35, party.pace / walk);
        return o;
      }
      o.x = m.wait.x;
      o.z = m.wait.z;
      o.clip = 'idle';
      o.pace = 1;
      return o;
    }
    alongRoute(party.path, s, false, o);
    // vedle osy – vlevo od směru chůze
    o.x -= o.headingZ * m.side;
    o.z += o.headingX * m.side;
    o.clip = moving ? 'walk' : 'idle';
    o.pace = moving ? Math.max(0.35, party.pace / walk) : 1;
    return o;
  };
}

/**
 * Kolik lidí vsi ze svatby je vidět během okna dne `window` (počítají se místo pracujících postav)
 * – lidé z okolí ves nepočítá. Bez okna 0.
 */
export function weddingVillagersIn(plan: WeddingPlan, window: DayWindow | null): number {
  if (!window) return 0;
  return plan.members.filter((m) => {
    if (m.party !== 'village') return false;
    const until = m.leaveMs + (m.home.length / SLOWEST_M_S) * 1000;
    return visibleFromMs(plan, m) < window.endMs && until > window.startMs;
  }).length;
}

/** Jsou lidé svatby vidět během okna dne `window`? */
export function weddingActiveIn(plan: WeddingPlan, window: DayWindow | null): boolean {
  if (!window) return false;
  return plan.timeline.startMs < window.endMs && plan.figuresUntilMs > window.startMs;
}

/** Odstín oděvu svatebčanů je pestřejší (návrh Clauda) – los barvy z `seed` 0–1. */
export const WEDDING_CLOTH: readonly (readonly [number, number, number])[] = [
  [1.35, 0.55, 0.45], // mořena – červená
  [0.6, 0.75, 1.3], // boryt – modrá
  [1.3, 1.15, 0.5], // rezeda – žlutá
  [0.75, 1.15, 0.6], // zelená
  [1.25, 0.85, 0.55], // okrová
  [1.2, 1.15, 1.05], // bělený len
];

/** Oděv nevěsty – bělený len (návrh Clauda). */
export const BRIDE_CLOTH: readonly [number, number, number] = [1.4, 1.36, 1.25];

/** Oděv svatebčana podle losu 0–1. */
export function weddingCloth(roll: number): readonly [number, number, number] {
  const i = Math.min(WEDDING_CLOTH.length - 1, Math.floor(roll * WEDDING_CLOTH.length));
  return WEDDING_CLOTH[i]!;
}

/** Deterministická náhoda pro vzhled člověka svatby (oděv). */
export function weddingLookRoll(plan: WeddingPlan, index: number): number {
  return hash01(Math.floor(hashText(plan.key, 7) * 1_000_000), index, 61);
}
