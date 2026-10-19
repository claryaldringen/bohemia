// Vůz se spřežením volů (docs/design/wagons.md) – trasa a póza vozu jako čistá funkce času (bez
// Babylonu, jako plough-team.ts). Zatím jen ukázka „Vozy“ na /dev/buildings; až herní jádro pošle
// vozy a jejich trasy, kreslí je stejný CartRenderer (cart-renderer.ts) – vstupem je trasa
// (lomená čára po zemi) a čas, výstupem kde je který díl.
//
// Kdo kde je: dva voli pod šíjovým jhem a honák vlevo s vodicím provazem (stejně jako u rádla –
// composeDraft v plough-team.ts), za jhem vůz. Dvoukolák má oj pevně v korbě: náprava jede po
// trase za jhem (bod trasy ve vzdálenosti oje), korba míří ke jhu a naklápí se tak, aby špička
// oje ležela pod jhem (vyšší jho = korba vzadu níž). Čtyřkolák má předek na čepu: přední náprava
// jede po trase za jhem, zadní za přední (rozvor), korba leží na obou nápravách (sklon a náklon
// podle terénu pod koly), předek se natáčí ke jhu a oj vede od špičky rozvory ke spodku jha. Kola
// se točí podle ujeté dráhy – vnější kolo v oblouku víc než vnitřní (dráha kola = dráha osy ±
// polovina rozchodu × změna směru). Rozměry jsou skutečné (m) a celé spřežení se zvětší stejně
// jako postavy (TEAM_SCALE).
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

/** Druh vozu (wagons.md – Dva druhy vozů): dvoukolák, nebo čtyřkolák. */
export type CartKind = 'two' | 'four';
/** Náklad na korbě (wagons.md – Co vozí); prázdný vůz bez nákladu. */
export type CartCargo = 'empty' | 'hay' | 'sheaves' | 'logs' | 'goods';
export const CART_CARGOES: readonly CartCargo[] = ['empty', 'hay', 'sheaves', 'logs', 'goods'];

/**
 * Rozměry vozů ve skutečné velikosti (m) z tools/blender/wagons_from_0ad.py (WHEEL_R, YOKE_Y,
 * POLE2_TIP, POLE4_M a výpis „ROZMĚRY“ – hlídá test podle obalu dílů ve wagons.glb). Osy jako
 * model ve scéně: x vpravo, y nahoru, z vpřed.
 */
export const CART_PARTS = {
  /** Poloměr kola a výška středu náboje nad zemí (korba stojí na nápravách). */
  wheelR: 0.49,
  hubY: 0.4865,
  two: {
    /** Náboje kol od středu nápravy do stran. */
    track: 0.5762,
    /** Špička oje (střed jejího konce) od počátku korby – na zemi pod nápravou. */
    poleTip: { z: 2.9, y: TEAM_PARTS.yokeY },
    /** Korba od nápravy vpřed a vzad (kvůli stínu a obalu). */
    front: 0.99,
    back: 0.98,
    halfWidth: 0.49,
  },
  four: {
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
export const CART_PREFIX: Record<CartKind, string> = { two: 'wagon2', four: 'wagon4' };

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
  kind: CartKind;
  cargo: CartCargo;
  route: CartRoute;
  offsetM: number;
}

/** Kolo: rámec náboje (osa vpřed a nahoru se točí s kolem), pravá kola otočená o 180°. */
export interface CartPose {
  oxen: [FigurePose, FigurePose];
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
  /** Jede (false = otevřená trasa skončila, voli stojí). */
  moving: boolean;
}

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

const DRAFT_TEMPO = CART_SPEED_M_S / TEAM_SPEED_M_S;

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
  out.moving = !frozen && (route.closed || (s > 0 && s < route.length));
  const yoke = routeAt(route, s, TMP_YOKE);
  composeDraft(yoke, t, out.moving ? DRAFT_TEMPO : 0, out, ground, CART_PARTS.drover);
  if (track.kind === 'two') twoWheeler(route, s, out, ground);
  else fourWheeler(route, s, out, ground);
  return out;
}

/** Dvoukolák: náprava na trase za jhem, korba natočená a nakloněná tak, aby oj ležela pod jhem. */
function twoWheeler(route: CartRoute, s: number, out: CartPose, ground: GroundFn): void {
  const p = CART_PARTS;
  const k = CART_SCALE;
  const yf = out.yoke;
  // od středu nápravy ke špičce oje v modelu: vpřed a nahoru (pevná délka)
  const tipF = p.two.poleTip.z;
  const tipU = p.two.poleTip.y - p.hubY;
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
    gl = ground(a.x + lx * p.two.track * k, a.z + lz * p.two.track * k);
    gr = ground(a.x - lx * p.two.track * k, a.z - lz * p.two.track * k);
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
  const w = 2 * p.two.track * k;
  axes(fx * cp, sp, fz * cp, -fz * w, gl - gr, fx * w, body);
  // počátek korby: na „zemi“ pod středem nápravy v rámci korby
  body.x = a.x - body.ux * p.hubY * k;
  body.y = hubY - body.uy * p.hubY * k;
  body.z = a.z - body.uz * p.hubY * k;
  copyFrame(body, out.front);
  const turn = a.heading * p.two.track * k;
  wheel(body, 0, -1, p.two.track, sA - turn, out.wheels[0]!);
  wheel(body, 0, 1, p.two.track, sA + turn, out.wheels[1]!);
}

/**
 * Čtyřkolák: přední náprava na trase za jhem, zadní za ní (rozvor), korba na obou nápravách,
 * předek natočený ke jhu, oj od špičky rozvory ke spodku jha.
 */
function fourWheeler(route: CartRoute, s: number, out: CartPose, ground: GroundFn): void {
  const p = CART_PARTS;
  const q = p.four;
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

/** Počet kol vozu. */
export function cartWheelCount(kind: CartKind): number {
  return kind === 'two' ? 2 : 4;
}

/** Jak daleko vůz sahá za jhem (m, ve scéně) – kvůli obalu a stínu. */
export function cartLength(kind: CartKind): number {
  const p = CART_PARTS;
  const reach =
    kind === 'two'
      ? p.two.poleTip.z + p.two.back
      : p.four.yokeReach + p.four.wheelbase / 2 + p.four.back;
  return reach * CART_SCALE;
}
