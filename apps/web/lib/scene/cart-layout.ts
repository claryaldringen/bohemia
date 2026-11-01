// Vůz se spřežením volů (docs/design/wagons.md) – trasa a póza vozu jako čistá funkce času (bez
// Babylonu, jako plough-team.ts). Zatím jen ukázka „Vozy“ na /dev/buildings; až herní jádro pošle
// vozy a jejich trasy, kreslí je stejný CartRenderer (cart-renderer.ts) – vstupem je trasa
// (lomená čára po zemi) a čas, výstupem kde je který díl.
//
// Kdo kde je: čtyřkolák táhnou dva voli pod šíjovým jhem, dvoukolák jeden vůl mezi ojemi oplení
// pod jednoduchým jhem (oxen.md – Potah), honák vlevo s vodicím provazem (stejně jako u rádla –
// composeDraft v plough-team.ts), za jhem vůz. Dvoukolák má oje pevně v korbě: náprava jede po
// trase za jhem (bod trasy ve vzdálenosti ojí), korba míří ke jhu a naklápí se tak, aby špičky
// ojí ležely pod jhem (vyšší jho = korba vzadu níž). Čtyřkolák má předek na čepu: přední náprava
// jede po trase za jhem, zadní za přední (rozvor), korba leží na obou nápravách (sklon a náklon
// podle terénu pod koly), předek se natáčí ke jhu a oj vede od špičky rozvory ke spodku jha. Kola
// se točí podle ujeté dráhy – vnější kolo v oblouku víc než vnitřní (dráha kola = dráha osy ±
// polovina rozchodu × změna směru). Rozměry jsou skutečné (m) a celé spřežení se zvětší stejně
// jako postavy (TEAM_SCALE).
import type { CartKind } from '@bohemia/game';
import { villagerSeconds } from './villager-motion';
import {
  TEAM_PARTS,
  TEAM_SCALE,
  TEAM_SPEED_M_S,
  composeDraft,
  pathAt,
  type FigurePose,
  type GroundFn,
  type PartFrame,
  type PathPoint,
  type PathSegment,
  type Segment3,
  type TeamLeader,
} from './plough-team';

/** Celý vůz se zvětší jako spřežení a postavy. */
export const CART_SCALE = TEAM_SCALE;
/** Rychlost vozu s voly (m/s) – ≈ 3 km/h (wagons.md – Rychlost). */
export const CART_SPEED_M_S = 0.85;

/** Druh vozu (wagons.md – Dva druhy vozů): dvoukolák, nebo čtyřkolák – stejně jako herní jádro. */
export type { CartKind };
/**
 * Náklad na korbě (wagons.md – Co vozí, Co vozy vozí): seno, snopy, klády, zboží (i uhlí, osivo
 * a věci stěhujících se – migration.md), sudy na vodu, bahenní ruda z rudiště (crafts.md – Uhlí
 * a ruda kováře), hlína z hliniště (crafts.md – Hlína hrnčíře) a koše jablek ze sadu (orchard.md –
 * Jablka vozem); prázdný vůz bez nákladu.
 */
export type CartCargo =
  'empty' | 'hay' | 'sheaves' | 'logs' | 'goods' | 'water' | 'ore' | 'clay' | 'apples';
export const CART_CARGOES: readonly CartCargo[] = [
  'empty',
  'hay',
  'sheaves',
  'logs',
  'goods',
  'water',
  'ore',
  'clay',
  'apples',
];

/**
 * Rozměry vozů ve skutečné velikosti (m) z tools/blender/wagons_from_0ad.py (WHEEL_R, YOKE_Y,
 * POLE2_TIP, POLE4_M a výpis „ROZMĚRY“ – hlídá test podle obalu dílů ve wagons.glb). Osy jako
 * model ve scéně: x vpravo, y nahoru, z vpřed.
 */
export const CART_PARTS = {
  /** Poloměr kola a výška středu náboje nad zemí (korba stojí na nápravách). */
  wheelR: 0.49,
  hubY: 0.4865,
  'two-wheel': {
    /** Náboje kol od středu nápravy do stran. */
    track: 0.5762,
    /**
     * Střed mezi špičkami ojí oplení od počátku korby – na zemi pod nápravou; dvoukolák táhne
     * jeden vůl mezi ojemi (oxen.md – Potah), oje jsou do stran o `shaftX`.
     */
    poleTip: { z: 2.9, y: TEAM_PARTS.yokeY },
    shaftX: 0.45,
    /** Korba od nápravy vpřed a vzad (kvůli stínu a obalu). */
    front: 0.99,
    back: 0.98,
    halfWidth: 0.49,
  },
  'four-wheel': {
    track: 0.7133,
    /** Rozvor – přední náprava je od počátku korby (uprostřed) o polovinu vpřed. */
    wheelbase: 1.5078,
    /** Špička rozvory (čep oje) od počátku předku – na zemi pod přední nápravou. */
    houndsTip: { z: 1.4729, y: 0.6566 },
    /** Délka oje v modelu (díl wagon4-pole – scéna ji natahuje ke jhu). */
    poleM: 1.5,
    /** Od přední nápravy ke jhu (v půdorysu) – korba vpředu ≈ 2 m za jhem, za zadky volů. */
    yokeReach: 2.95,
    front: 1.65,
    back: 1.53,
    halfWidth: 0.63,
  },
  /** Honák vede spřežení vlevo od levého vola (dospělý, ne chlapec jako u rádla). */
  drover: { x: -1.25, z: 0.3, scale: 1 } satisfies TeamLeader,
} as const;

/** Díly wagons.glb podle druhu vozu (předpona dílů a nákladu). */
export const CART_PREFIX: Record<CartKind, string> = {
  'two-wheel': 'wagon2',
  'four-wheel': 'wagon4',
};

// --- trasa ---------------------------------------------------------------------------------

/** Bod trasy: poloha, směr jízdy a úhel směru (rad, bez skoků – s každým kolem přibývá). */
export interface RoutePoint extends PathPoint {
  heading: number;
}

/**
 * Trasa vozu: rovné úseky a oblouky jako dráha spřežení (`pathAt` v plough-team.ts). Uzavřená
 * trasa se opakuje (vůz jezdí dokola), otevřená vede z prvního bodu do posledního.
 */
export interface CartRoute {
  segments: readonly PathSegment[];
  starts: readonly number[];
  length: number;
  closed: boolean;
  /** Úhel směru na začátku každého úseku (rad, bez skoků). */
  headings: readonly number[];
  /** O kolik se směr za celé kolo uzavřené trasy změní (±2π u obyčejné smyčky). */
  lapTurn: number;
}

interface Point {
  x: number;
  z: number;
}

/** Rozdíl úhlů b − a v rozsahu −π…π. */
function angleDelta(a: number, b: number): number {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * Trasa z lomené čáry: rohy se zaoblí obloukem o poloměru `turnRadius` (vůz se neotočí na
 * místě – dvoukolák menší oblouk, čtyřkolák větší, wagons.md), u krátkých úseků menším, aby se
 * oblouky vešly. Body blíž než 1 cm se sloučí.
 */
export function cartRoute(
  points: readonly Point[],
  options: { closed: boolean; turnRadius: number },
): CartRoute {
  const pts: Point[] = [];
  for (const p of points) {
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.z - last.z) > 0.01) pts.push({ x: p.x, z: p.z });
  }
  if (options.closed && pts.length > 2) {
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    if (Math.hypot(first.x - last.x, first.z - last.z) <= 0.01) pts.pop();
  }
  if (pts.length < 2) throw new Error('Trasa vozu potřebuje aspoň dva body.');
  const n = pts.length;
  const closed = options.closed && n > 2;
  const edgeCount = closed ? n : n - 1;
  const dirs: { x: number; z: number; len: number }[] = [];
  for (let i = 0; i < edgeCount; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    dirs.push({ x: (b.x - a.x) / len, z: (b.z - a.z) / len, len });
  }
  // zaoblení rohů: vrchol i mezi hranou i − 1 a i
  interface Corner {
    tin: number;
    tout: number;
    turn: number;
    radius: number;
  }
  const corners: (Corner | null)[] = pts.map(() => null);
  for (let i = 0; i < n; i++) {
    if (!closed && (i === 0 || i === n - 1)) continue;
    const din = dirs[(i - 1 + edgeCount) % edgeCount]!;
    const dout = dirs[i % edgeCount]!;
    const turn = angleDelta(Math.atan2(din.z, din.x), Math.atan2(dout.z, dout.x));
    if (Math.abs(turn) < 1e-6) continue;
    const half = Math.tan(Math.abs(turn) / 2);
    // tečna se musí vejít do poloviny kratšího ze sousedních úseků
    const room = Math.min(din.len, dout.len) / 2;
    const tangent = Math.min(options.turnRadius * half, room);
    corners[i] = { tin: tangent, tout: tangent, turn, radius: tangent / half };
  }
  const segments: PathSegment[] = [];
  const headings: number[] = [];
  let heading = Math.atan2(dirs[0]!.z, dirs[0]!.x);
  const startAt = (i: number): Point => {
    const c = corners[i];
    const p = pts[i]!;
    const d = dirs[i % edgeCount]!;
    return c ? { x: p.x + d.x * c.tout, z: p.z + d.z * c.tout } : p;
  };
  for (let e = 0; e < edgeCount; e++) {
    const d = dirs[e]!;
    const from = startAt(e);
    const endIndex = (e + 1) % n;
    const corner = corners[endIndex];
    const end = pts[endIndex]!;
    const to = corner ? { x: end.x - d.x * corner.tin, z: end.z - d.z * corner.tin } : end;
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    if (length > 1e-6) {
      segments.push({ kind: 'line', length, x: from.x, z: from.z, dx: d.x, dz: d.z });
      headings.push(heading);
    }
    if (corner) {
      const sign = Math.sign(corner.turn);
      // střed oblouku vlevo od směru (kladné otočení = doleva, proti směru hodinek v x–z)
      const cx = to.x - d.z * corner.radius * sign;
      const cz = to.z + d.x * corner.radius * sign;
      segments.push({
        kind: 'arc',
        length: Math.abs(corner.turn) * corner.radius,
        cx,
        cz,
        radius: corner.radius,
        a0: Math.atan2(to.z - cz, to.x - cx),
        sweep: corner.turn,
        ux: 1,
        uz: 0,
        vx: 0,
        vz: 1,
      });
      headings.push(heading);
      heading += corner.turn;
    } else if (e + 1 < edgeCount) {
      heading += angleDelta(heading, Math.atan2(dirs[e + 1]!.z, dirs[e + 1]!.x));
    }
  }
  const starts: number[] = [];
  let total = 0;
  for (const s of segments) {
    starts.push(total);
    total += s.length;
  }
  return {
    segments,
    starts,
    length: total,
    closed,
    headings,
    lapTurn: closed ? heading - headings[0]! : 0,
  };
}

/**
 * Bod trasy ve vzdálenosti `s` (m). Uzavřená trasa se opakuje (úhel směru s každým kolem
 * přibývá o `lapTurn`), otevřená trasa pokračuje před začátkem a za koncem rovně – vůz, který
 * teprve vyjel, má nápravy ještě za prvním bodem.
 */
export function routeAt(route: CartRoute, s: number, out: RoutePoint): RoutePoint {
  const L = route.length;
  if (!route.closed && (s < 0 || s > L)) {
    const atEnd = s > L;
    pathAt(route, atEnd ? L - 1e-9 : 0, out);
    const over = atEnd ? s - L : s;
    out.x += out.hx * over;
    out.z += out.hz * over;
    out.heading = headingAt(route, atEnd ? L - 1e-9 : 0);
    return out;
  }
  const laps = route.closed ? Math.floor(s / L) : 0;
  const local = s - laps * L;
  pathAt(route, local, out);
  out.heading = headingAt(route, local) + laps * route.lapTurn;
  return out;
}

/** Úhel směru v místě `s` jednoho kola trasy (0 ≤ s ≤ délka). */
function headingAt(route: CartRoute, s: number): number {
  let lo = 0;
  let hi = route.segments.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (route.starts[mid]! <= s) lo = mid;
    else hi = mid - 1;
  }
  const seg = route.segments[lo]!;
  const h = route.headings[lo]!;
  if (seg.kind === 'line') return h;
  return h + Math.sign(seg.sweep) * ((s - route.starts[lo]!) / seg.radius);
}

// --- póza vozu ------------------------------------------------------------------------------

/** Vůz na trase: druh, náklad a posun po trase (další vozy na téže trase jedou za sebou). */
export interface CartTrack {
  id?: number;
  kind: CartKind;
  cargo: CartCargo;
  route: CartRoute;
  offsetM: number;
}

/** Kolo: rámec náboje (osa vpřed a nahoru se točí s kolem), pravá kola otočená o 180°. */
export interface CartPose {
  /** Voli – u dvoukoláku jen první (`team` 1 – oxen.md, Potah), druhý se nekreslí. */
  oxen: [FigurePose, FigurePose];
  /** Kolik volů vůz táhne (DRAFT_OXEN – dvoukolák 1, čtyřkolák 2). */
  team: 1 | 2;
  /** Honák (u vozu dospělý) – pole se jmenuje jako u rádla (composeDraft). */
  boy: FigurePose;
  yoke: PartFrame;
  rope: Segment3;
  /** Korba (i náklad – modelovaný v jejích souřadnicích). */
  body: PartFrame;
  /** Předek čtyřkoláku (natáčí se ke jhu); u dvoukoláku stejný jako korba. */
  front: PartFrame;
  /** Oj čtyřkoláku od špičky rozvory ke spodku jha (u dvoukoláku je v korbě). */
  pole: Segment3;
  /** Kola zleva doprava, u čtyřkoláku napřed přední (levé, pravé), pak zadní. */
  wheels: PartFrame[];
  /** Jede (false = stojí – otevřená trasa skončila, vůz nakládá / skládá, voli stojí). */
  moving: boolean;
  /** Zapřažený – s voly a honákem (vůz bez jízdy stojí u ohrady, voli jsou v ohradě). */
  hitched: boolean;
  /** Veze náklad (prázdný jede tam, plný zpátky). */
  loaded: boolean;
  /** Vůz teď není vidět (karavana výpravy za krajem mapy – caravan.ts). Bez údaje vidět. */
  hidden?: boolean;
  /**
   * Kde v jízdě vůz je (panel vozu a vozky – villagers.md, Výběr postavy): jede k cíli (`out`),
   * u cíle nakládá (`load`), jede zpátky (`back`), u ohrady skládá (`unload`), stojí u ohrady bez
   * volů (`parked`), je za krajem mapy (`away`), jezdí dokola (`loop` – ukázka). Bez údaje `loop`.
   */
  leg?: CartLeg;
}

/** Úsek jízdy vozu (`CartPose.leg`). */
/** Úsek jízdy vozu; `return` – od humna prázdný k ohradě (svoz snopů na humno). */
export type CartLeg = 'out' | 'load' | 'back' | 'unload' | 'return' | 'parked' | 'away' | 'loop';

function figure(): FigurePose {
  return { x: 0, y: 0, z: 0, hx: 0, hz: 1, pace: 1 };
}

function frame(): PartFrame {
  return { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 1, ux: 0, uy: 1, uz: 0 };
}

function segment(): Segment3 {
  return { ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0 };
}

export function createCartPose(): CartPose {
  return {
    oxen: [figure(), figure()],
    boy: figure(),
    yoke: frame(),
    rope: segment(),
    body: frame(),
    front: frame(),
    pole: segment(),
    wheels: [frame(), frame(), frame(), frame()],
    moving: true,
    hitched: true,
    loaded: true,
    team: 2,
  };
}

const FLAT: GroundFn = () => 0;

const TMP_YOKE: RoutePoint = { x: 0, z: 0, hx: 0, hz: 1, heading: 0 };
const TMP_A: RoutePoint = { x: 0, z: 0, hx: 0, hz: 1, heading: 0 };
const TMP_B: RoutePoint = { x: 0, z: 0, hx: 0, hz: 1, heading: 0 };

/**
 * Bod trasy za bodem `from` (v místě `s`), jehož vzdálenost v půdorysu od `from` je `chord`: na
 * rovném úseku přesně `chord` zpět, v oblouku blíž (náprava „nadbíhá“ do oblouku jako rádlo).
 * Vrátí místo na trase (m) a zapíše bod do `out`.
 */
function behind(route: CartRoute, s: number, from: Point, chord: number, out: RoutePoint): number {
  const step = chord / 8;
  let near = s;
  let far = s - step;
  let guard = 0;
  while (guard++ < 400) {
    routeAt(route, far, out);
    if (Math.hypot(out.x - from.x, out.z - from.z) >= chord) break;
    near = far;
    far -= step;
  }
  for (let i = 0; i < 24; i++) {
    const mid = (near + far) / 2;
    routeAt(route, mid, out);
    if (Math.hypot(out.x - from.x, out.z - from.z) >= chord) far = mid;
    else near = mid;
  }
  const at = (near + far) / 2;
  routeAt(route, at, out);
  return at;
}

/** Kde je vůz na trase v čase `t` (m od začátku; otevřená trasa končí v cíli). */
export function cartDistance(track: CartTrack, t: number): number {
  const s = t * CART_SPEED_M_S + track.offsetM;
  return track.route.closed ? s : Math.min(track.route.length, Math.max(0, s));
}

/**
 * Rámec vozu na dvou bodech nápravy (vlevo a vpravo na zemi) a bodu vpředu: osa nahoru kolmo na
 * nápravu i směr vpřed, osa vpřed kolmo na ni. Zapisuje osy do `out` (poloha zůstane).
 */
function axes(
  fx: number,
  fy: number,
  fz: number,
  lx: number,
  ly: number,
  lz: number,
  out: PartFrame,
): void {
  // nahoru = vlevo × vpřed (osy scény: x vpravo, y nahoru, z vpřed – levotočivé)
  let ux = ly * fz - lz * fy;
  let uy = lz * fx - lx * fz;
  let uz = lx * fy - ly * fx;
  if (uy < 0) {
    ux = -ux;
    uy = -uy;
    uz = -uz;
  }
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul;
  uy /= ul;
  uz /= ul;
  // vpřed bez složky nahoru
  const d = fx * ux + fy * uy + fz * uz;
  let gx = fx - ux * d;
  let gy = fy - uy * d;
  let gz = fz - uz * d;
  const gl = Math.hypot(gx, gy, gz) || 1;
  gx /= gl;
  gy /= gl;
  gz /= gl;
  out.fx = gx;
  out.fy = gy;
  out.fz = gz;
  out.ux = ux;
  out.uy = uy;
  out.uz = uz;
}

/** Osa vpravo rámce (nahoru × vpřed). */
function rightOf(f: PartFrame): [number, number, number] {
  return [f.uy * f.fz - f.uz * f.fy, f.uz * f.fx - f.ux * f.fz, f.ux * f.fy - f.uy * f.fx];
}

/**
 * Kolo na nápravě rámce `axle` (náboj `side` × rozchod do strany, ve výšce náboje nad počátkem),
 * natočené o `rolled` m ujeté dráhy; pravé kolo je model otočený o 180° (náboj ven).
 */
function wheel(
  axle: PartFrame,
  forwardM: number,
  side: -1 | 1,
  track: number,
  rolled: number,
  out: PartFrame,
): void {
  const k = CART_SCALE;
  const [rx, ry, rz] = rightOf(axle);
  out.x = axle.x + (axle.fx * forwardM + axle.ux * CART_PARTS.hubY + rx * side * track) * k;
  out.y = axle.y + (axle.fy * forwardM + axle.uy * CART_PARTS.hubY + ry * side * track) * k;
  out.z = axle.z + (axle.fz * forwardM + axle.uz * CART_PARTS.hubY + rz * side * track) * k;
  // valení vpřed: vršek kola jde dopředu (nahoru → vpřed, vpřed → dolů)
  const a = rolled / (CART_PARTS.wheelR * k);
  const c = Math.cos(a);
  const s = Math.sin(a);
  out.ux = axle.ux * c + axle.fx * s;
  out.uy = axle.uy * c + axle.fy * s;
  out.uz = axle.uz * c + axle.fz * s;
  const flip = side > 0 ? -1 : 1;
  out.fx = (axle.fx * c - axle.ux * s) * flip;
  out.fy = (axle.fy * c - axle.uy * s) * flip;
  out.fz = (axle.fz * c - axle.uz * s) * flip;
}

/**
 * Póza vozu se spřežením v čase `t` (s): jho na trase ve vzdálenosti `cartDistance`, voli,
 * honák a vůz za nimi, kola natočená podle ujeté dráhy, korba podle terénu pod koly. Stejný čas =
 * stejná póza; zapisuje do `out`, nic nealokuje. `frozen` = omezený pohyb (nohy stojí).
 */
export function cartPose(
  track: CartTrack,
  t: number,
  out: CartPose,
  ground: GroundFn = FLAT,
  frozen = false,
): CartPose {
  const route = track.route;
  const s = cartDistance(track, t);
  const moving = !frozen && (route.closed || (s > 0 && s < route.length));
  out.loaded = track.cargo !== 'empty';
  return poseOnRoute(track.kind, route, s, t, moving ? CART_SPEED_M_S : 0, out, ground);
}

/**
 * Vůz se spřežením ve vzdálenosti `s` na trase (jho tam), v čase `t` (s – krok volů a kymácení
 * jha), jedoucí rychlostí `speed` (m/s; 0 = stojí – voli bez kroku). Zapisuje do `out`.
 */
export function poseOnRoute(
  kind: CartKind,
  route: CartRoute,
  s: number,
  t: number,
  speed: number,
  out: CartPose,
  ground: GroundFn = FLAT,
): CartPose {
  out.moving = speed > 0;
  out.hitched = true;
  out.team = cartTeam(kind);
  const yoke = routeAt(route, s, TMP_YOKE);
  composeDraft(yoke, t, speed / TEAM_SPEED_M_S, out, ground, CART_PARTS.drover, out.team);
  if (kind === 'two-wheel') twoWheeler(route, s, out, ground);
  else fourWheeler(route, s, out, ground);
  return out;
}

/** Dvoukolák: náprava na trase za jhem, korba natočená a nakloněná tak, aby oj ležela pod jhem. */
function twoWheeler(route: CartRoute, s: number, out: CartPose, ground: GroundFn): void {
  const p = CART_PARTS;
  const k = CART_SCALE;
  const yf = out.yoke;
  // od středu nápravy ke špičce oje v modelu: vpřed a nahoru (pevná délka)
  const tipF = p['two-wheel'].poleTip.z;
  const tipU = p['two-wheel'].poleTip.y - p.hubY;
  const reach = Math.hypot(tipF, tipU) * k;
  const angle0 = Math.atan2(tipU, tipF);
  // vzdálenost v půdorysu závisí na převýšení jha nad nápravou – dvakrát dopočítat
  let chord = tipF * k;
  let sA = s;
  let hubY = 0;
  let gl = 0;
  let gr = 0;
  const a = TMP_A;
  const hx = (): number => yf.x - a.x;
  const hz = (): number => yf.z - a.z;
  for (let i = 0; i < 2; i++) {
    sA = behind(route, s, yf, chord, a);
    const len = Math.hypot(hx(), hz()) || 1;
    // levé kolo vlevo od směru ke jhu (vlevo = (−hz, hx))
    const lx = -hz() / len;
    const lz = hx() / len;
    gl = ground(a.x + lx * p['two-wheel'].track * k, a.z + lz * p['two-wheel'].track * k);
    gr = ground(a.x - lx * p['two-wheel'].track * k, a.z - lz * p['two-wheel'].track * k);
    hubY = (gl + gr) / 2 + p.hubY * k;
    const rise = yf.y - hubY;
    chord = Math.sqrt(Math.max(0.01, reach * reach - rise * rise));
  }
  const len = Math.hypot(hx(), hz()) || 1;
  const fx = hx() / len;
  const fz = hz() / len;
  // sklon korby: úhel od náboje ke jhu minus úhel oje v modelu
  const pitch = Math.atan2(yf.y - hubY, Math.hypot(hx(), hz())) - angle0;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const body = out.body;
  const w = 2 * p['two-wheel'].track * k;
  axes(fx * cp, sp, fz * cp, -fz * w, gl - gr, fx * w, body);
  // počátek korby: na „zemi“ pod středem nápravy v rámci korby
  body.x = a.x - body.ux * p.hubY * k;
  body.y = hubY - body.uy * p.hubY * k;
  body.z = a.z - body.uz * p.hubY * k;
  copyFrame(body, out.front);
  const turn = a.heading * p['two-wheel'].track * k;
  wheel(body, 0, -1, p['two-wheel'].track, sA - turn, out.wheels[0]!);
  wheel(body, 0, 1, p['two-wheel'].track, sA + turn, out.wheels[1]!);
}

/**
 * Čtyřkolák: přední náprava na trase za jhem, zadní za ní (rozvor), korba na obou nápravách,
 * předek natočený ke jhu, oj od špičky rozvory ke spodku jha.
 */
function fourWheeler(route: CartRoute, s: number, out: CartPose, ground: GroundFn): void {
  const p = CART_PARTS;
  const q = p['four-wheel'];
  const k = CART_SCALE;
  const yf = out.yoke;
  const f = TMP_A;
  const r = TMP_B;
  const sF = behind(route, s, yf, q.yokeReach * k, f);
  const sR = behind(route, sF, f, q.wheelbase * k, r);
  let fx = f.x - r.x;
  let fz = f.z - r.z;
  const len = Math.hypot(fx, fz) || 1;
  fx /= len;
  fz /= len;
  const t = q.track * k;
  // vlevo = (−fz, fx)
  const gfl = ground(f.x - fz * t, f.z + fx * t);
  const gfr = ground(f.x + fz * t, f.z - fx * t);
  const grl = ground(r.x - fz * t, r.z + fx * t);
  const grr = ground(r.x + fz * t, r.z - fx * t);
  const hubF = (gfl + gfr) / 2 + p.hubY * k;
  const hubR = (grl + grr) / 2 + p.hubY * k;
  const body = out.body;
  axes(
    f.x - r.x,
    hubF - hubR,
    f.z - r.z,
    -fz * 2 * t,
    (gfl - gfr + grl - grr) / 2,
    fx * 2 * t,
    body,
  );
  body.x = (f.x + r.x) / 2 - body.ux * p.hubY * k;
  body.y = (hubF + hubR) / 2 - body.uy * p.hubY * k;
  body.z = (f.z + r.z) / 2 - body.uz * p.hubY * k;
  // předek: čep nad přední nápravou, natočený ke jhu (v rovině korby)
  const front = out.front;
  const half = (q.wheelbase / 2) * k;
  front.x = body.x + body.fx * half;
  front.y = body.y + body.fy * half;
  front.z = body.z + body.fz * half;
  const pinX = front.x + body.ux * p.hubY * k;
  const pinY = front.y + body.uy * p.hubY * k;
  const pinZ = front.z + body.uz * p.hubY * k;
  let dx = yf.x - pinX;
  let dy = yf.y - pinY;
  let dz = yf.z - pinZ;
  const along = dx * body.ux + dy * body.uy + dz * body.uz;
  dx -= body.ux * along;
  dy -= body.uy * along;
  dz -= body.uz * along;
  const dl = Math.hypot(dx, dy, dz) || 1;
  front.fx = dx / dl;
  front.fy = dy / dl;
  front.fz = dz / dl;
  front.ux = body.ux;
  front.uy = body.uy;
  front.uz = body.uz;
  // oj od špičky rozvory ke spodku jha
  const pole = out.pole;
  pole.ax = front.x + (front.fx * q.houndsTip.z + front.ux * q.houndsTip.y) * k;
  pole.ay = front.y + (front.fy * q.houndsTip.z + front.uy * q.houndsTip.y) * k;
  pole.az = front.z + (front.fz * q.houndsTip.z + front.uz * q.houndsTip.y) * k;
  pole.bx = yf.x;
  pole.by = yf.y;
  pole.bz = yf.z;
  const turnF = f.heading * t;
  const turnR = r.heading * t;
  wheel(front, 0, -1, q.track, sF - turnF, out.wheels[0]!);
  wheel(front, 0, 1, q.track, sF + turnF, out.wheels[1]!);
  wheel(body, -q.wheelbase / 2, -1, q.track, sR - turnR, out.wheels[2]!);
  wheel(body, -q.wheelbase / 2, 1, q.track, sR + turnR, out.wheels[3]!);
}

function copyFrame(from: PartFrame, to: PartFrame): void {
  to.x = from.x;
  to.y = from.y;
  to.z = from.z;
  to.fx = from.fx;
  to.fy = from.fy;
  to.fz = from.fz;
  to.ux = from.ux;
  to.uy = from.uy;
  to.uz = from.uz;
}

/** Kolik volů vůz táhne (oxen.md – Potah: dvoukolák jeden, čtyřkolák pár). */
export function cartTeam(kind: CartKind): 1 | 2 {
  return kind === 'two-wheel' ? 1 : 2;
}

/** Počet kol vozu. */
export function cartWheelCount(kind: CartKind): number {
  return kind === 'two-wheel' ? 2 : 4;
}

/** Jak daleko vůz sahá za jhem (m, ve scéně) – kvůli obalu a stínu. */
export function cartLength(kind: CartKind): number {
  const p = CART_PARTS;
  const reach =
    kind === 'two-wheel'
      ? p['two-wheel'].poleTip.z + p['two-wheel'].back
      : p['four-wheel'].yokeReach + p['four-wheel'].wheelbase / 2 + p['four-wheel'].back;
  return reach * CART_SCALE;
}

// --- svoz: jízdy tam a zpět (wagons.md – fáze 3) --------------------------------------------

/**
 * Obratiště vozu (m): vůz se neotočí na místě – za cílem a u ohrady objede smyčku (dvoukolák
 * menší, čtyřkolák širší oblouk – vozová síť, CART_ROUTES.turnSteps).
 */
export const CART_TURN_M: Record<CartKind, number> = { 'two-wheel': 3.5, 'four-wheel': 6 };

/**
 * Jízda tam a zpět jako uzavřená trasa: od ohrady po ose k cíli, smyčka obratiště za cílem, po
 * ose zpět a smyčka u ohrady (`route` začíná u ohrady čelem k cíli). `farM` = kde na trase vůz
 * u cíle stojí a nakládá (uprostřed smyčky za cílem).
 */
export interface ShuttleRoute {
  route: CartRoute;
  farM: number;
  /**
   * Svoz snopů na humno (`shuttleRoute` s `via`): kde na trase vůz u humna stojí a skládá – od
   * cíle k němu jede plný, odtud prázdný k ohradě. Bez údaje skládá u ohrady.
   */
  dropM?: number;
}

/**
 * Smyčka obratiště za koncem `end` osy jedoucí směrem `dir` (jednotkový): kus doprava, velkým
 * obloukem doleva přes osu a zpět na konec – vůz se vrací čelem vzad. Body bez konce osy.
 */
function turnLoop(
  end: Point,
  dir: Point,
  radius: number,
  aheadFactor = 3,
  sideSign = 1,
): { points: Point[]; middle: Point } {
  // vpravo od směru (osy scény: x vpravo, z vpřed)
  const rx = dir.z * sideSign;
  const rz = -dir.x * sideSign;
  const ahead = aheadFactor * radius;
  const side = 2 * radius;
  const middle = { x: end.x + dir.x * ahead, z: end.z + dir.z * ahead };
  return {
    points: [
      { x: middle.x + rx * side, z: middle.z + rz * side },
      middle,
      { x: middle.x - rx * side, z: middle.z - rz * side },
    ],
    middle,
  };
}

/** Pořadí zkoušených obratišť: nejdřív výchozí, pak zrcadlově, pak kratší (násobek poloměru). */
const TURN_VARIANTS: readonly (readonly [number, number])[] = [
  [3, 1],
  [3, -1],
  [1.5, 1],
  [1.5, -1],
  [0.5, 1],
  [0.5, -1],
];

/** Kolik vzorků (po ≈ 1 m) smyčky včetně příjezdu z konce osy neleží na souši. */
function wetSamples(
  end: Point,
  loop: { points: Point[] },
  walkable: (x: number, z: number) => boolean,
): number {
  const line = [end, ...loop.points, end];
  let wet = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z)));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      if (!walkable(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) wet++;
    }
  }
  return wet;
}

/**
 * Obratiště za koncem osy, které leží celé na souši (`walkable`): výchozí smyčka, jinak
 * zrcadlová, jinak kratší; když žádná nevyhoví, ta s nejméně vzorky mimo souš. Bez `walkable`
 * výchozí.
 */
function dryTurnLoop(
  end: Point,
  dir: Point,
  radius: number,
  walkable?: (x: number, z: number) => boolean,
): { points: Point[]; middle: Point } {
  if (!walkable) return turnLoop(end, dir, radius);
  let best = turnLoop(end, dir, radius);
  let bestWet = Infinity;
  for (const [ahead, side] of TURN_VARIANTS) {
    const loop = turnLoop(end, dir, radius, ahead, side);
    const wet = wetSamples(end, loop, walkable);
    if (wet === 0) return loop;
    if (wet < bestWet) {
      best = loop;
      bestWet = wet;
    }
  }
  return best;
}

function unit2(x: number, z: number): Point {
  const l = Math.hypot(x, z) || 1;
  return { x: x / l, z: z / l };
}

/** Kde je bod trasy nejblíž bodu `p` (m od začátku, po kroku `step`). */
export function nearestOnRoute(route: CartRoute, p: Point, step = 0.25, from = 0): number {
  const at: RoutePoint = { x: 0, z: 0, hx: 0, hz: 1, heading: 0 };
  let best = from;
  let bestD = Infinity;
  for (let s = from; s <= route.length; s += step) {
    routeAt(route, s, at);
    const d = (at.x - p.x) ** 2 + (at.z - p.z) ** 2;
    if (d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

/**
 * Jízda tam a zpět po ose `points` (od ohrady k cíli – trasa vozové sítě, SceneCart.route) se
 * smyčkami obratišť za cílem a u ohrady; rohy osy zaoblené obloukem vozu (CART_TURN_M).
 * Obratiště se podle `walkable` (souš) nepokládá do vody ani na neprůjezdný terén.
 */
export function shuttleRoute(
  points: readonly Point[],
  kind: CartKind,
  walkable?: (x: number, z: number) => boolean,
  via?: { points: readonly Point[]; drop: Point },
): ShuttleRoute {
  const axis = points.filter(
    (p, i) => i === 0 || Math.hypot(p.x - points[i - 1]!.x, p.z - points[i - 1]!.z) > 0.01,
  );
  if (axis.length < 2) throw new Error('Jízda vozu potřebuje aspoň dva body osy.');
  const radius = CART_TURN_M[kind];
  const n = axis.length;
  const end = axis[n - 1]!;
  const far = dryTurnLoop(
    end,
    unit2(end.x - axis[n - 2]!.x, end.z - axis[n - 2]!.z),
    radius,
    walkable,
  );
  const start = axis[0]!;
  const home = dryTurnLoop(
    start,
    unit2(start.x - axis[1]!.x, start.z - axis[1]!.z),
    radius,
    walkable,
  );
  if (via && via.points.length >= 2) {
    // svoz snopů na humno (villagers.md – Fáze činností): od cíle plný k humnu (`drop`), odtud
    // prázdný k ohradě
    const drop = via.drop;
    const route = cartRoute([...axis, ...far.points, ...via.points.slice(1), ...home.points], {
      closed: true,
      turnRadius: radius,
    });
    const farM = nearestOnRoute(route, far.middle);
    // humno až za cílem (osa od ohrady k poli může vést kolem humna)
    return { route, farM, dropM: nearestOnRoute(route, drop, 0.25, farM) };
  }
  const back = [...axis].reverse();
  const route = cartRoute([...axis, ...far.points, ...back, ...home.points], {
    closed: true,
    turnRadius: radius,
  });
  return { route, farM: nearestOnRoute(route, far.middle) };
}

/** Jak dlouho vůz stojí u cíle (nakládá) a u ohrady (skládá) – s. */
export const CART_STOP_S = { fast: 3, real: 20 } as const;
/**
 * Ladicí zrychlení svozu (s orbou za herní den – PLOUGH_DAY_DEBUG): jízd za herní den tolik, kolik
 * se jich vejde při této rychlosti (m/s), nejvýš CARTS.loadsPerCartDay – a aspoň jedna (dlouhá
 * trasa se pak jede rychleji).
 */
export const CART_FAST_M_S = 4;

/** Kdy vůz jezdí: okno herního dne (ladicí – jízdy dne se do něj vejdou), nebo pořád dokola. */
export interface CartSchedule {
  /**
   * Okno herního dne (skutečný čas, ms) – vůz za den udělá `trips` jízd (CART_FAST_M_S, nejvýš
   * `maxTrips`); null = jezdí dokola skutečným tempem (CART_SPEED_M_S), jako nosiči na stezce.
   */
  window: { startMs: number; endMs: number } | null;
  /** Nejvýš jízd za herní den (CARTS.loadsPerCartDay). */
  maxTrips: number;
  /** Posun fáze 0–1 (víc vozů na téže trase jede za sebou). */
  phase: number;
}

/** Kde vůz na jízdě je: místo na trase, rychlost (0 = stojí), jestli veze náklad. */
export interface ShuttleState {
  s: number;
  speed: number;
  loaded: boolean;
}

/**
 * Vůz na jízdě tam a zpět v okamžiku `nowMs` (čistá funkce skutečného času): od ohrady prázdný
 * k cíli, tam stojí (nakládá – náklad se objeví v půlce), plný zpátky a u ohrady stojí (skládá).
 * S oknem dne jízdy rovnoměrně přes den (kolik se jich vejde – CART_FAST_M_S; mimo okno se den
 * opakuje – den končí i začíná u ohrady); bez okna dokola tempem volů. Zapisuje do `out`.
 */
export function shuttleAt(
  shuttle: ShuttleRoute,
  schedule: CartSchedule,
  nowMs: number,
  out: ShuttleState,
): ShuttleState {
  const L = shuttle.route.length;
  const far = shuttle.farM;
  const fast = schedule.window !== null;
  const stop = fast ? CART_STOP_S.fast : CART_STOP_S.real;
  // u humna třetí zastávka (skládá snopy – `dropM`)
  const drop = shuttle.dropM;
  const stops = drop === undefined ? 2 : 3;
  let speed = CART_SPEED_M_S;
  let cycle = L / speed + stops * stop;
  let time: number;
  if (schedule.window) {
    const dayS = Math.max(1, (schedule.window.endMs - schedule.window.startMs) / 1000);
    const trips = Math.min(
      Math.max(1, schedule.maxTrips),
      Math.max(1, Math.floor(dayS / (L / CART_FAST_M_S + stops * stop))),
    );
    cycle = dayS / trips;
    speed = Math.max(CART_SPEED_M_S, L / Math.max(1, cycle - stops * stop));
    // den se opakuje: poslední jízda končí u ohrady a další den (nová trasa) začíná u ohrady –
    // i když nová data přijdou až chvíli po začátku dne, vůz neskáče
    const inDay = ((((nowMs - schedule.window.startMs) / 1000) % dayS) + dayS) % dayS;
    time = (((inDay + schedule.phase * cycle) % cycle) + cycle) % cycle;
  } else {
    time = (((villagerSeconds(nowMs) + schedule.phase * cycle) % cycle) + cycle) % cycle;
  }
  const outS = far / speed;
  if (drop !== undefined) return viaAt(far, drop, L, speed, stop, time, out);
  const backS = (L - far) / speed;
  if (time < outS) {
    out.s = time * speed;
    out.speed = speed;
    out.loaded = false;
  } else if (time < outS + stop) {
    out.s = far;
    out.speed = 0;
    out.loaded = time >= outS + stop / 2;
  } else if (time < outS + stop + backS) {
    out.s = far + (time - outS - stop) * speed;
    out.speed = speed;
    out.loaded = true;
  } else {
    out.s = L;
    out.speed = 0;
    out.loaded = time < outS + stop + backS + stop / 2;
  }
  return out;
}

/**
 * Jízda přes humno v čase cyklu `time`: prázdný k cíli, nakládá, plný k humnu (`drop`), skládá
 * (náklad zmizí v půlce), prázdný k ohradě a tam chvíli stojí.
 */
function viaAt(
  far: number,
  drop: number,
  L: number,
  speed: number,
  stop: number,
  time: number,
  out: ShuttleState,
): ShuttleState {
  const t1 = far / speed;
  const t2 = t1 + stop;
  const t3 = t2 + (drop - far) / speed;
  const t4 = t3 + stop;
  const t5 = t4 + (L - drop) / speed;
  if (time < t1) [out.s, out.speed, out.loaded] = [time * speed, speed, false];
  else if (time < t2) [out.s, out.speed, out.loaded] = [far, 0, time >= t1 + stop / 2];
  else if (time < t3) [out.s, out.speed, out.loaded] = [far + (time - t2) * speed, speed, true];
  else if (time < t4) [out.s, out.speed, out.loaded] = [drop, 0, time < t3 + stop / 2];
  else if (time < t5) [out.s, out.speed, out.loaded] = [drop + (time - t4) * speed, speed, false];
  else [out.s, out.speed, out.loaded] = [L, 0, false];
  return out;
}

// --- stojící vůz u ohrady ------------------------------------------------------------------

/** Kde vůz stojí: místo (střed korby na zemi) a směr, kam míří oj (jednotkový). */
export interface CartSpot {
  x: number;
  z: number;
  hx: number;
  hz: number;
}

/**
 * Nezapřažený vůz (stojí u ohrady): dvoukolák skloněný dopředu na špičku oje, čtyřkolák rovně
 * s ojí na zemi před sebou; kola stojí. Bez volů a honáka (`hitched` false).
 */
export function parkedCartPose(
  kind: CartKind,
  spot: CartSpot,
  out: CartPose,
  ground: GroundFn = FLAT,
): CartPose {
  const p = CART_PARTS;
  const k = CART_SCALE;
  out.moving = false;
  out.hitched = false;
  out.loaded = false;
  const h = unit2(spot.hx, spot.hz);
  const body = out.body;
  if (kind === 'two-wheel') {
    // náprava v místě, špička oje na zemi před ní
    const q = p['two-wheel'];
    const gl = ground(spot.x - h.z * q.track * k, spot.z + h.x * q.track * k);
    const gr = ground(spot.x + h.z * q.track * k, spot.z - h.x * q.track * k);
    const hub = (gl + gr) / 2 + p.hubY * k;
    const tipF = q.poleTip.z;
    const tipU = q.poleTip.y - p.hubY;
    const reach = Math.hypot(tipF, tipU) * k;
    const tipX = spot.x + h.x * tipF * k;
    const tipZ = spot.z + h.z * tipF * k;
    const drop = ground(tipX, tipZ) + 0.05 * k - hub;
    const pitch = Math.asin(Math.max(-1, Math.min(1, drop / reach))) - Math.atan2(tipU, tipF);
    const w = 2 * q.track * k;
    axes(
      h.x * Math.cos(pitch),
      Math.sin(pitch),
      h.z * Math.cos(pitch),
      -h.z * w,
      gl - gr,
      h.x * w,
      body,
    );
    body.x = spot.x - body.ux * p.hubY * k;
    body.y = hub - body.uy * p.hubY * k;
    body.z = spot.z - body.uz * p.hubY * k;
    copyFrame(body, out.front);
    wheel(body, 0, -1, q.track, 0, out.wheels[0]!);
    wheel(body, 0, 1, q.track, 0, out.wheels[1]!);
    return out;
  }
  const q = p['four-wheel'];
  const half = (q.wheelbase / 2) * k;
  const fx = spot.x + h.x * half;
  const fz = spot.z + h.z * half;
  const rx = spot.x - h.x * half;
  const rz = spot.z - h.z * half;
  const t = q.track * k;
  const gfl = ground(fx - h.z * t, fz + h.x * t);
  const gfr = ground(fx + h.z * t, fz - h.x * t);
  const grl = ground(rx - h.z * t, rz + h.x * t);
  const grr = ground(rx + h.z * t, rz - h.x * t);
  const hubF = (gfl + gfr) / 2 + p.hubY * k;
  const hubR = (grl + grr) / 2 + p.hubY * k;
  axes(fx - rx, hubF - hubR, fz - rz, -h.z * 2 * t, (gfl - gfr + grl - grr) / 2, h.x * 2 * t, body);
  body.x = spot.x - body.ux * p.hubY * k;
  body.y = (hubF + hubR) / 2 - body.uy * p.hubY * k;
  body.z = spot.z - body.uz * p.hubY * k;
  const front = out.front;
  copyFrame(body, front);
  front.x = body.x + body.fx * half;
  front.y = body.y + body.fy * half;
  front.z = body.z + body.fz * half;
  // oj ze špičky rozvory dolů na zem před vozem
  const pole = out.pole;
  pole.ax = front.x + (front.fx * q.houndsTip.z + front.ux * q.houndsTip.y) * k;
  pole.ay = front.y + (front.fy * q.houndsTip.z + front.uy * q.houndsTip.y) * k;
  pole.az = front.z + (front.fz * q.houndsTip.z + front.uz * q.houndsTip.y) * k;
  const horizontal = Math.sqrt(Math.max(0.01, (q.poleM * k) ** 2 - (q.houndsTip.y * k) ** 2));
  pole.bx = pole.ax + h.x * horizontal;
  pole.bz = pole.az + h.z * horizontal;
  pole.by = ground(pole.bx, pole.bz) + 0.05 * k;
  wheel(front, 0, -1, q.track, 0, out.wheels[0]!);
  wheel(front, 0, 1, q.track, 0, out.wheels[1]!);
  wheel(body, -q.wheelbase / 2, -1, q.track, 0, out.wheels[2]!);
  wheel(body, -q.wheelbase / 2, 1, q.track, 0, out.wheels[3]!);
  return out;
}

// --- vůz ve scéně: na trase, na jízdě tam a zpět, nebo stojící ------------------------------

/**
 * Vůz na jízdě tam a zpět (svoz, výprava) – náklad veze zpátky (`loadedBothWays` – i tam,
 * `loadedOut` – jen tam: osivo na pole, wagons.md – Co vozy vozí).
 */
export interface CartShuttle {
  /** Id vozu ve vsi (`SceneCart.id`) – výběr vozu; ukázky bez id. */
  id?: number;
  kind: CartKind;
  cargo: CartCargo;
  shuttle: ShuttleRoute;
  schedule: CartSchedule;
  loadedBothWays?: boolean;
  loadedOut?: boolean;
}

/** Vůz stojící u ohrady bez volů. */
export interface CartParked {
  id?: number;
  kind: CartKind;
  parked: CartSpot;
}

/**
 * Vůz v karavaně výpravy (trade.md – Ve scéně, caravan.ts): trasa tam (od ohrady na stezku a po ní
 * ke kraji mapy) a zpět (obráceně) a kde na nich v okamžiku je – podle postupu výpravy.
 */
export interface CartCaravan {
  id?: number;
  kind: CartKind;
  cargo: CartCargo;
  routes: { out: CartRoute; back: CartRoute };
  at: (nowMs: number) => { leg: 'out' | 'back'; s: number; speed: number; visible: boolean };
}

/** Co vůz ve scéně dělá: jede dokola po trase (ukázka), tam a zpět, v karavaně, nebo stojí. */
export type CartPlan = CartTrack | CartShuttle | CartParked | CartCaravan;

/** Čas (s), ve kterém stojí vozy dokola po trase při omezeném pohybu. */
export const CART_FROZEN_T = 23;

const TMP_SHUTTLE: ShuttleState = { s: 0, speed: 0, loaded: false };

/**
 * Póza vozu podle plánu v okamžiku `nowMs` (skutečný čas): dokola po trase, tam a zpět
 * (`shuttleAt`), nebo stojící. `frozen` = omezený pohyb – vůz na jízdě stojí u cíle naložený,
 * vůz dokola v čase CART_FROZEN_T. Zapisuje do `out`, nic nealokuje.
 */
export function cartPlanPose(
  plan: CartPlan,
  nowMs: number,
  out: CartPose,
  ground: GroundFn = FLAT,
  frozen = false,
): CartPose {
  out.hidden = false;
  if ('parked' in plan) {
    out.leg = 'parked';
    return parkedCartPose(plan.kind, plan.parked, out, ground);
  }
  const t = villagerSeconds(nowMs);
  if ('routes' in plan) {
    const at = plan.at(nowMs);
    poseOnRoute(plan.kind, plan.routes[at.leg], at.s, t, frozen ? 0 : at.speed, out, ground);
    out.loaded = plan.cargo !== 'empty';
    out.hidden = !at.visible;
    // karavana: tam a zpátky po stezce, před odchodem a po návratu stojí u ohrady
    const stands = frozen || at.speed <= 0;
    out.leg = !at.visible ? 'away' : stands ? (at.leg === 'out' ? 'load' : 'unload') : at.leg;
    return out;
  }
  if ('shuttle' in plan) {
    const at = frozen
      ? { s: plan.shuttle.farM, speed: 0, loaded: true }
      : shuttleAt(plan.shuttle, plan.schedule, nowMs, TMP_SHUTTLE);
    poseOnRoute(plan.kind, plan.shuttle.route, at.s, t, at.speed, out, ground);
    // osivo (`loadedOut`): naložené od ohrady, u cíle se složí, zpátky prázdný
    const loaded = plan.loadedOut === true ? !at.loaded || frozen : at.loaded;
    out.loaded = plan.cargo !== 'empty' && (loaded || plan.loadedBothWays === true);
    out.leg = shuttleLeg(plan.shuttle, at);
    return out;
  }
  out.leg = 'loop';
  return cartPose(plan, frozen ? CART_FROZEN_T : t, out, ground, frozen);
}

/** Úsek jízdy tam a zpět: k cíli, u cíle (nakládá), zpátky, u ohrady (skládá). */
export function shuttleLeg(shuttle: ShuttleRoute, at: { s: number; speed: number }): CartLeg {
  const drop = shuttle.dropM;
  if (at.speed > 0) {
    if (at.s < shuttle.farM) return 'out';
    // od humna prázdný k ohradě
    return drop !== undefined && at.s >= drop ? 'return' : 'back';
  }
  if (drop !== undefined) {
    if (Math.abs(at.s - drop) < 1e-6) return 'unload';
    return at.s < shuttle.route.length - 1e-6 ? 'load' : 'return';
  }
  return at.s < shuttle.route.length - 1e-6 ? 'load' : 'unload';
}

/** Trasa, po které plán jede (kvůli obalu); stojící vůz žádnou. */
export function cartPlanRoute(plan: CartPlan): CartRoute | null {
  if ('parked' in plan) return null;
  if ('routes' in plan) return plan.routes.out;
  return 'shuttle' in plan ? plan.shuttle.route : plan.route;
}
