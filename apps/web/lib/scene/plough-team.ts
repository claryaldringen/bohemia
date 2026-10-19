// Spřežení volů s rádlem a oráčem – rozestavění dílů a pohyb po brázdách jako čistá funkce
// času (bez Babylonu, jako villager-motion.ts). Ve vsi orá pruh u čela orby (plough-front.ts –
// oxen.md, Spřežení postupuje s orbou), na vývojové stránce /dev/buildings ukázka „Orání“.
//
// Kdo kde je: dva voli vedle sebe pod šíjovým jhem, od jha oj dozadu k hřídeli rádla, za
// rádlem oráč, který drží příčnou rukojeť (klip „plough“ – chůze s rukama na rukojeti
// a předklonem, tools/blender/plough-team.json), vedle levého vola honáček (chlapec, klip
// „lead“), který ho vede za provaz. Jho jede po dráze (řady přes čtverec pole a obraty na
// souvratích), rádlo za ním drží pevnou vzdálenost oje (bod dráhy se stejnou tětivou) a na
// souvrati ho oráč nadzvedne. Rozměry jsou skutečné (m) a celé spřežení se zvětší stejně jako
// postavy (FIGURE_SCALE).
import { FIGURE_SCALE } from './villager-plan';

/** Celé spřežení je stylizovaně zvětšené jako postavy a domácí zvířata. */
export const TEAM_SCALE = FIGURE_SCALE;
/** Rychlost spřežení (m/s) – pomalá chůze volů s rádlem. */
export const TEAM_SPEED_M_S = 0.7;

/**
 * Rozměry dílů ve skutečné velikosti (m). Rádlo, jho a oj z tools/blender/plough.py
 * (ARD_HITCH, ARD_GRIP, YOKE_SPAN, POLE_M – hlídá test), poloha šíje vola a rukou oráče
 * z výpisu tools/blender/people_from_0ad.py („report“ v plough-team.json). Osy jako model ve
 * scéně: x vpravo, y nahoru, z vpřed.
 */
export const TEAM_PARTS = {
  /** Osa vola od středu jha (do stran). */
  oxSpan: 0.45,
  /** Jho leží na šíji před kohoutkem: vpřed od počátku vola a výška spodku jha. */
  oxYokeZ: 0.74,
  yokeY: 1.19,
  /** Kde je u levého vola uvázaný vodicí provaz (u kořene rohů). */
  oxHead: { x: 0, y: 1.1, z: 1.05 },
  /** Konec hřídele rádla (sem vede oj) a střed příčné rukojeti – od počátku rádla. */
  ardHitch: { y: 0.78, z: 1.55 },
  ardGrip: { y: 1.0, z: -0.87 },
  /** Délka oje. */
  poleM: 1.3,
  /** Dlaně oráče v klipu „plough“ (střed mezi zápěstím a prsty) od jeho paty. */
  plowmanPalm: { y: 1.02, z: 0.31 },
  /** Honáček: stranou vlevo od středu jha a kousek vpředu, menší postava. */
  boy: { x: -1.15, z: 0.45, scale: 0.8 },
  /**
   * Dlaň honáčka s provazem v klipu „lead“ (od jeho paty, před zmenšením) – paže míří
   * k cíli „reach“ v plough-team.json natažená, dlaň je o kus níž a blíž.
   */
  boyHand: { x: 0.23, y: 1.06, z: 0.26 },
} as const;

/**
 * Rychlost chůze (m/s) při přehrání klipu rychlostí 1 a měřítku 1 – změřeno skriptem
 * (people_from_0ad.py vypíše u klipu „walk“ podle chodidla na zemi), ať nohy neklouzají.
 */
export const CLIP_WALK_M_S = { ox: 0.84, man: 0.86 } as const;

/** Poloměr obratu jha na souvrati (m, ve scéně). */
export const TURN_RADIUS_M = 1.9;
/** O kolik stupňů oráč nadzvedne rádlo na souvrati (radlice ven ze země). */
const LIFT_DEG = 9;
/** Jak daleko za okrajem pole (m) je rádlo už úplně nahoře – mezi tím se zvedá. */
const LIFT_RAMP_M = 1.2;

// --- dráha ---------------------------------------------------------------------------------

/** Rovný úsek dráhy z (x, z) ve směru (dx, dz). */
interface LineSegment {
  kind: 'line';
  length: number;
  x: number;
  z: number;
  dx: number;
  dz: number;
}

/**
 * Oblouk: střed (cx, cz), poloměr, počáteční úhel a znaménkový úhel otočení v rámci (u, v) –
 * bod = střed + u·r·cos θ + v·r·sin θ (kladné otočení míří od u k v).
 */
interface ArcSegment {
  kind: 'arc';
  length: number;
  cx: number;
  cz: number;
  radius: number;
  a0: number;
  sweep: number;
  ux: number;
  uz: number;
  vx: number;
  vz: number;
}

export type PathSegment = LineSegment | ArcSegment;

/** Uzavřená dráha jha: řady přes pole a obraty, po poslední řadě návrat po souvrati. */
export interface PloughPath {
  segments: readonly PathSegment[];
  /** Počátek každého úseku (m od začátku dráhy). */
  starts: readonly number[];
  length: number;
  /** Čtverec pole (střed, strana) a směr řad – podle něj se rádlo na souvrati zvedá. */
  field: PloughField;
}

export interface PloughField {
  /** Střed čtverce pole. */
  x: number;
  z: number;
  /** Strana čtverce (m). */
  size: number;
  /** Směr řad (jednotkový vektor) – první řada jde tímto směrem. */
  dirX: number;
  dirZ: number;
  /** Počet řad (sudý – po poslední řadě je spřežení zpět na straně, kde začalo). */
  rows: number;
  /**
   * Pruh čtverce, který spřežení orá: od–do napříč řadami (m od středu čtverce ve směru
   * `acrossX`, `acrossZ`; řady přibývají od `from` k `to`). Bez údaje celý čtverec.
   */
  from?: number;
  to?: number;
  /** Napříč řadami (jednotkový, kolmo na směr řad); bez údaje (−dirZ, dirX). */
  acrossX?: number;
  acrossZ?: number;
}

/** Bod dráhy: poloha a směr jízdy (jednotkový). */
export interface PathPoint {
  x: number;
  z: number;
  hx: number;
  hz: number;
}

/** Vzdálenost (m, ve scéně) mezi jhem a počátkem rádla na rovné řadě – v půdorysu. */
export function ardReach(): number {
  const p = TEAM_PARTS;
  const rise = p.yokeY - p.ardHitch.y;
  return (Math.sqrt(p.poleM * p.poleM - rise * rise) + p.ardHitch.z) * TEAM_SCALE;
}

/**
 * Dráha jha přes čtverec pole (nebo jeho pruh – `from`, `to`): `rows` řad střídavě tam a zpět
 * (řady jdou tak daleko za okraj, aby radlice dojela až k okraji – je o `ardReach` za jhem),
 * mezi nimi obrat na souvrati (půlkruh, nebo „kapka“ ze tří oblouků, když jsou řady blíž než
 * dva poloměry obratu) a po poslední řadě návrat po souvrati na začátek první řady.
 */
export function ploughPath(field: PloughField, turnRadius = TURN_RADIUS_M): PloughPath {
  const rows = Math.max(2, Math.round(field.rows / 2) * 2);
  const len = Math.hypot(field.dirX, field.dirZ) || 1;
  const dx = field.dirX / len;
  const dz = field.dirZ / len;
  // napříč řadami (řady přibývají tímto směrem)
  const across = Math.hypot(field.acrossX ?? 0, field.acrossZ ?? 0);
  const sx = across > 1e-9 ? field.acrossX! / across : -dz;
  const sz = across > 1e-9 ? field.acrossZ! / across : dx;
  const from = field.from ?? -field.size / 2;
  const to = field.to ?? field.size / 2;
  const spacing = (to - from) / rows;
  const reach = field.size / 2 + ardReach();
  const segments: PathSegment[] = [];
  const offset = (k: number): number => from + (k + 0.5) * spacing;
  for (let k = 0; k < rows; k++) {
    const dir = k % 2 === 0 ? 1 : -1;
    const o = offset(k);
    const ax = field.x + sx * o - dx * reach * dir;
    const az = field.z + sz * o - dz * reach * dir;
    segments.push({
      kind: 'line',
      length: 2 * reach,
      x: ax,
      z: az,
      dx: dx * dir,
      dz: dz * dir,
    });
    const endX = ax + dx * dir * 2 * reach;
    const endZ = az + dz * dir * 2 * reach;
    if (k < rows - 1) {
      uTurn(segments, endX, endZ, dx * dir, dz * dir, sx, sz, spacing, turnRadius);
    } else {
      // návrat po souvrati k první řadě (opačným směrem napříč)
      uTurn(segments, endX, endZ, dx * dir, dz * dir, -sx, -sz, (rows - 1) * spacing, turnRadius);
    }
  }
  const starts: number[] = [];
  let total = 0;
  for (const s of segments) {
    starts.push(total);
    total += s.length;
  }
  return { segments, starts, length: total, field: { ...field, rows } };
}

/**
 * Obrat o 180° do souběžné řady vzdálené `w` na stranu (nx, nz): když je řada dost daleko,
 * čtvrtkruh – rovně – čtvrtkruh, jinak „kapka“ (napřed kousek od řady, pak oblouk přes
 * 180° a zpět), aby poloměr nebyl menší než `radius`.
 */
function uTurn(
  out: PathSegment[],
  x: number,
  z: number,
  dx: number,
  dz: number,
  nx: number,
  nz: number,
  w: number,
  radius: number,
): void {
  const at = (u: number, v: number): [number, number] => [x + dx * u + nx * v, z + dz * u + nz * v];
  const arc = (cu: number, cv: number, r: number, a0: number, sweep: number): void => {
    const [cx, cz] = at(cu, cv);
    out.push({
      kind: 'arc',
      length: Math.abs(sweep) * r,
      cx,
      cz,
      radius: r,
      a0,
      sweep,
      ux: dx,
      uz: dz,
      vx: nx,
      vz: nz,
    });
  };
  if (w >= 2 * radius) {
    arc(0, radius, radius, -Math.PI / 2, Math.PI / 2);
    const straight = w - 2 * radius;
    if (straight > 1e-6) {
      const [sx, sz] = at(radius, radius);
      out.push({ kind: 'line', length: straight, x: sx, z: sz, dx: nx, dz: nz });
    }
    arc(0, w - radius, radius, 0, Math.PI / 2);
    return;
  }
  const r = radius;
  const x2 = Math.sqrt(4 * r * r - (w / 2 + r) ** 2);
  const phi = Math.atan2(w / 2 + r, x2);
  const alpha = Math.PI / 2 - phi;
  arc(0, -r, r, Math.PI / 2, -alpha);
  arc(x2, w / 2, r, phi + Math.PI, Math.PI + 2 * alpha);
  arc(0, w + r, r, -phi, -alpha);
}

/** Bod dráhy ve vzdálenosti `s` od začátku (dráha je uzavřená – `s` se opakuje). */
export function pathAt(path: PloughPath, s: number, out: PathPoint): PathPoint {
  const L = path.length;
  let d = ((s % L) + L) % L;
  // úseků je pár desítek – binární hledání podle počátků
  let lo = 0;
  let hi = path.segments.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (path.starts[mid]! <= d) lo = mid;
    else hi = mid - 1;
  }
  const seg = path.segments[lo]!;
  d -= path.starts[lo]!;
  if (seg.kind === 'line') {
    out.x = seg.x + seg.dx * d;
    out.z = seg.z + seg.dz * d;
    out.hx = seg.dx;
    out.hz = seg.dz;
    return out;
  }
  const sign = Math.sign(seg.sweep);
  const a = seg.a0 + (d / seg.radius) * sign;
  const c = Math.cos(a);
  const sn = Math.sin(a);
  out.x = seg.cx + (seg.ux * c + seg.vx * sn) * seg.radius;
  out.z = seg.cz + (seg.uz * c + seg.vz * sn) * seg.radius;
  out.hx = (-seg.ux * sn + seg.vx * c) * sign;
  out.hz = (-seg.uz * sn + seg.vz * c) * sign;
  return out;
}

// --- póza spřežení -------------------------------------------------------------------------

/** Postava nebo vůl: pata na zemi, směr pohledu, rychlost přehrávání klipu. */
export interface FigurePose {
  x: number;
  y: number;
  z: number;
  hx: number;
  hz: number;
  /** Rychlost přehrávání klipu chůze (1 = jak je zapečený). */
  pace: number;
}

/** Pevný díl: počátek a osy vpřed a nahoru (jednotkové; vpravo = nahoru × vpřed). */
export interface PartFrame {
  x: number;
  y: number;
  z: number;
  fx: number;
  fy: number;
  fz: number;
  ux: number;
  uy: number;
  uz: number;
}

/** Úsečka (oj, provaz) z bodu a do bodu b. */
export interface Segment3 {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
}

export interface TeamPose {
  oxen: [FigurePose, FigurePose];
  plowman: FigurePose;
  boy: FigurePose;
  yoke: PartFrame;
  ard: PartFrame;
  pole: Segment3;
  rope: Segment3;
  /** Rádlo nadzvednuté na souvrati: 0 = radlice v zemi, 1 = nahoře. */
  lift: number;
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

export function createTeamPose(): TeamPose {
  return {
    oxen: [figure(), figure()],
    plowman: figure(),
    boy: figure(),
    yoke: frame(),
    ard: frame(),
    pole: segment(),
    rope: segment(),
    lift: 0,
  };
}

/** Výška země (m) – na vývojové stránce rovina 0. */
export type GroundFn = (x: number, z: number) => number;
const FLAT: GroundFn = () => 0;

/** Rychlosti přehrávání klipů chůze (stálé – na rovné řadě nohy neklouzají). */
export const TEAM_PACE = {
  ox: TEAM_SPEED_M_S / (CLIP_WALK_M_S.ox * TEAM_SCALE),
  plowman: TEAM_SPEED_M_S / (CLIP_WALK_M_S.man * TEAM_SCALE),
  boy: TEAM_SPEED_M_S / (CLIP_WALK_M_S.man * TEAM_SCALE * TEAM_PARTS.boy.scale),
} as const;

const TMP_YOKE: PathPoint = { x: 0, z: 0, hx: 0, hz: 1 };
const TMP_BACK: PathPoint = { x: 0, z: 0, hx: 0, hz: 1 };

/**
 * Bod dráhy za jhem (s menší vzdáleností), jehož vzdálenost v půdorysu od jha je `chord` –
 * na rovné řadě přesně `chord` zpět, v obratu blíž (rádlo „nadbíhá“ do oblouku).
 */
function pointBehind(
  path: PloughPath,
  s: number,
  yoke: PathPoint,
  chord: number,
  out: PathPoint,
): PathPoint {
  const step = chord / 8;
  let near = s;
  let far = s - step;
  let guard = 0;
  while (guard++ < 400) {
    pathAt(path, far, out);
    if (Math.hypot(out.x - yoke.x, out.z - yoke.z) >= chord) break;
    near = far;
    far -= step;
  }
  for (let i = 0; i < 24; i++) {
    const mid = (near + far) / 2;
    pathAt(path, mid, out);
    if (Math.hypot(out.x - yoke.x, out.z - yoke.z) >= chord) far = mid;
    else near = mid;
  }
  return pathAt(path, (near + far) / 2, out);
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Otočí vektor (x, y, z) kolem jednotkové osy k o úhel (Rodrigues) – zapíše do `out`. */
function rotate(
  x: number,
  y: number,
  z: number,
  kx: number,
  ky: number,
  kz: number,
  angle: number,
  out: [number, number, number],
): [number, number, number] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dot = kx * x + ky * y + kz * z;
  out[0] = x * c + (ky * z - kz * y) * s + kx * dot * (1 - c);
  out[1] = y * c + (kz * x - kx * z) * s + ky * dot * (1 - c);
  out[2] = z * c + (kx * y - ky * x) * s + kz * dot * (1 - c);
  return out;
}

const V1: [number, number, number] = [0, 0, 0];
const V2: [number, number, number] = [0, 0, 0];

/**
 * Póza celého spřežení v čase `t` (s): jho na dráze ve vzdálenosti `t · TEAM_SPEED_M_S`
 * (+ `offsetM` pro další spřežení na téže dráze), voli pod jhem, rádlo za ním na tětivě
 * oje, oráč u rukojeti, honáček u levého vola. Rádlo se při orbě drobně kymácí a na souvrati
 * zvedá. Stejný čas = stejná póza; zapisuje do `out`, nic nealokuje.
 */
export function teamPose(
  path: PloughPath,
  t: number,
  out: TeamPose,
  ground: GroundFn = FLAT,
  offsetM = 0,
): TeamPose {
  const s = t * TEAM_SPEED_M_S + offsetM;
  const yoke = pathAt(path, s, TMP_YOKE);
  // Rádlo: počátek na dráze za jhem, natočené ke jhu (oj a hřídel v jedné čáře).
  const back = pointBehind(path, s, yoke, ardReach(), TMP_BACK);
  // Na souvrati (radlice za okrajem pole) oráč rádlo nadzvedne.
  const f = path.field;
  const flen = Math.hypot(f.dirX, f.dirZ) || 1;
  const du = ((back.x - f.x) * f.dirX + (back.z - f.z) * f.dirZ) / flen;
  const dv = (-(back.x - f.x) * f.dirZ + (back.z - f.z) * f.dirX) / flen;
  const outside = Math.max(Math.abs(du), Math.abs(dv)) - f.size / 2;
  const lift = smoothstep(0, LIFT_RAMP_M, outside);
  return composePose(yoke, back, lift, t, TEAM_SPEED_M_S, out, ground);
}

/**
 * Spřežení podle polohy a směru jha, místa rádla (`back` – jeho počátek na zemi) a toho, jak je
 * rádlo nadzvednuté (`lift`): voli pod jhem, oj, oráč u rukojeti, honáček s provazem. `speed` je
 * rychlost chůze (m/s) – podle ní se přehrávají klipy chůze, ať nohy neklouzají.
 */
function composePose(
  yoke: PathPoint,
  back: PathPoint,
  lift: number,
  t: number,
  speed: number,
  out: TeamPose,
  ground: GroundFn,
): TeamPose {
  const p = TEAM_PARTS;
  const k = TEAM_SCALE;
  const tempo = speed / TEAM_SPEED_M_S;
  const fx = yoke.hx;
  const fz = yoke.hz;
  // vpravo od směru jízdy (osy scény: x vpravo, z vpřed)
  const rx = fz;
  const rz = -fx;

  // Voli: počátek o kus za jhem, do stran od středu.
  out.oxen.forEach((ox, i) => {
    const side = i === 0 ? -1 : 1;
    ox.x = yoke.x - fx * p.oxYokeZ * k + rx * side * p.oxSpan * k;
    ox.z = yoke.z - fz * p.oxYokeZ * k + rz * side * p.oxSpan * k;
    ox.y = ground(ox.x, ox.z);
    ox.hx = fx;
    ox.hz = fz;
    ox.pace = TEAM_PACE.ox * tempo;
  });

  // Jho: na šíjích volů, kymácí se s jejich krokem.
  const neckBob = 0.012 * Math.sin((2 * Math.PI * t) / 1.13);
  const yokeRoll = ((1.2 * Math.PI) / 180) * Math.sin((2 * Math.PI * t) / 2.26);
  const yokeGround = (out.oxen[0].y + out.oxen[1].y) / 2;
  const yf = out.yoke;
  yf.x = yoke.x;
  yf.z = yoke.z;
  yf.y = yokeGround + (p.yokeY + neckBob) * k;
  yf.fx = fx;
  yf.fy = 0;
  yf.fz = fz;
  rotate(0, 1, 0, fx, 0, fz, yokeRoll, V1);
  yf.ux = V1[0];
  yf.uy = V1[1];
  yf.uz = V1[2];

  // Rádlo: počátek za jhem, natočené ke jhu (oj a hřídel v jedné čáře).
  let ahx = yoke.x - back.x;
  let ahz = yoke.z - back.z;
  const al = Math.hypot(ahx, ahz) || 1;
  ahx /= al;
  ahz /= al;
  const arx = ahz;
  const arz = -ahx;
  const ardGround = ground(back.x, back.z);

  out.lift = lift;
  const plough = 1 - lift;
  // kymácení v brázdě (kameny, kořeny) – jen když radlice jede v zemi
  const pitch =
    ((LIFT_DEG * lift +
      plough *
        (1.3 * Math.sin(2 * Math.PI * 1.1 * t) + 0.5 * Math.sin(2 * Math.PI * 2.3 * t + 1))) *
      Math.PI) /
    180;
  const roll = (plough * 0.9 * Math.sin(2 * Math.PI * 0.7 * t + 2) * Math.PI) / 180;
  const heave = plough * 0.012 * Math.sin(2 * Math.PI * 1.7 * t);

  // Otočení kolem rukojeti (drží ji oráč): předek nahoru (pitch kolem osy vpravo), náklon
  // do strany (roll kolem osy vpřed).
  rotate(ahx, 0, ahz, arx, 0, arz, -pitch, V1); // vpřed
  rotate(0, 1, 0, arx, 0, arz, -pitch, V2); // nahoru
  rotate(V2[0], V2[1], V2[2], V1[0], V1[1], V1[2], roll, V2);
  const gx = back.x + ahx * p.ardGrip.z * k;
  const gy = ardGround + p.ardGrip.y * k + heave * k;
  const gz = back.z + ahz * p.ardGrip.z * k;
  // počátek rádla = rukojeť − (otočený) vektor od počátku k rukojeti
  const oF = p.ardGrip.z * k;
  const oU = p.ardGrip.y * k;
  const ard = out.ard;
  ard.x = gx - (V1[0] * oF + V2[0] * oU);
  ard.y = gy - (V1[1] * oF + V2[1] * oU);
  ard.z = gz - (V1[2] * oF + V2[2] * oU);
  ard.fx = V1[0];
  ard.fy = V1[1];
  ard.fz = V1[2];
  ard.ux = V2[0];
  ard.uy = V2[1];
  ard.uz = V2[2];

  // Oj: od konce hřídele ke spodku jha.
  const pole = out.pole;
  pole.ax = ard.x + (ard.fx * p.ardHitch.z + ard.ux * p.ardHitch.y) * k;
  pole.ay = ard.y + (ard.fy * p.ardHitch.z + ard.uy * p.ardHitch.y) * k;
  pole.az = ard.z + (ard.fz * p.ardHitch.z + ard.uz * p.ardHitch.y) * k;
  pole.bx = yf.x;
  pole.by = yf.y;
  pole.bz = yf.z;

  // Oráč: za rukojetí (nekymácí se s rádlem – drží ho v dlaních, kymácí se jeho kolem).
  const pl = out.plowman;
  const back2 = p.ardGrip.z - p.plowmanPalm.z;
  pl.x = back.x + ahx * back2 * k;
  pl.z = back.z + ahz * back2 * k;
  pl.y = ground(pl.x, pl.z);
  pl.hx = ahx;
  pl.hz = ahz;
  pl.pace = TEAM_PACE.plowman * tempo;

  // Honáček vlevo od levého vola, kousek vpředu; provaz z ruky k hlavě vola.
  const boy = out.boy;
  boy.x = yoke.x + rx * p.boy.x * k + fx * p.boy.z * k;
  boy.z = yoke.z + rz * p.boy.x * k + fz * p.boy.z * k;
  boy.y = ground(boy.x, boy.z);
  boy.hx = fx;
  boy.hz = fz;
  boy.pace = TEAM_PACE.boy * tempo;
  const bs = k * p.boy.scale;
  const rope = out.rope;
  rope.ax = boy.x + (rx * p.boyHand.x + fx * p.boyHand.z) * bs;
  rope.ay = boy.y + p.boyHand.y * bs;
  rope.az = boy.z + (rz * p.boyHand.x + fz * p.boyHand.z) * bs;
  const lead = out.oxen[0];
  rope.bx = lead.x + (rx * p.oxHead.x + fx * p.oxHead.z) * k;
  rope.by = lead.y + (p.oxHead.y + neckBob) * k;
  rope.bz = lead.z + (rz * p.oxHead.x + fz * p.oxHead.z) * k;
  return out;
}

// --- přechod na nové místo -----------------------------------------------------------------

/**
 * Rychlost spřežení při přechodu na nové místo orby (m/s) – voli bez tahu rádla jdou krokem
 * jako v klipu chůze (CLIP_WALK_M_S × TEAM_SCALE), rádlo nese oráč nadzvednuté.
 */
export const TRANSIT_SPEED_M_S = 1;
/**
 * Kdy spřežení na nové místo dojde (m): kratší posun se nepozná, delší by trval přes půl
 * herního dne – spřežení se pak objeví rovnou na novém místě (jako lidé – villagers.ts).
 */
export const TRANSIT_M = { min: 0.3, max: 60 } as const;
/** Na jak dlouhém kusu (m) se spřežení na začátku a konci přechodu natočí. */
const TRANSIT_TURN_M = 3;

/** Kde spřežení je: poloha a směr jha, jak je rádlo nadzvednuté. */
export interface TeamSpot {
  x: number;
  z: number;
  hx: number;
  hz: number;
  lift: number;
}

/**
 * Přechod na nové místo: od `startS` jde jho rovně z `from` do `to`, kam v `arriveS` dojde
 * (čas příchodu je dopočítaný, ať spřežení naváže na dráhu bez skoku), rádlo nadzvednuté.
 */
export interface TeamTransit {
  startS: number;
  arriveS: number;
  from: TeamSpot;
  to: TeamSpot;
}

/** Spřežení na dráze (`offsetM` – posun po dráze), případně s přechodem z dřívějšího místa. */
export interface TeamTrack {
  path: PloughPath;
  offsetM: number;
  transit: TeamTransit | null;
}

/** Spřežení na dráze bez přechodu. */
export function teamTrack(path: PloughPath, offsetM = 0): TeamTrack {
  return { path, offsetM, transit: null };
}

/** Kde spřežení v póze je (jho a rádlo) – odtud jde na nové místo. */
export function teamSpot(pose: TeamPose): TeamSpot {
  const len = Math.hypot(pose.yoke.fx, pose.yoke.fz) || 1;
  return {
    x: pose.yoke.x,
    z: pose.yoke.z,
    hx: pose.yoke.fx / len,
    hz: pose.yoke.fz / len,
    lift: pose.lift,
  };
}

const TRANSIT_PROBE = createTeamPose();

/**
 * Spřežení na dráze `path`, které v čase `startS` stojí jinde (`from`) a na dráhu dojde pěšky
 * (jako postavy – `walkThen` ve villager-motion.ts): jde rovně rychlostí `speed` tam, kde ho
 * dráha v čase příchodu čeká, a odtud orá dál. Čas příchodu se dopočítá (dráha se mezitím
 * posune – voli na ní jdou pomaleji než při přechodu, výpočet se ustálí); konec přechodu je
 * přesně bod dráhy, takže spřežení na ni naváže bez skoku. Posun kratší než `TRANSIT_M.min`
 * nebo delší než `TRANSIT_M.max` přechod nemá.
 */
export function transitTrack(
  path: PloughPath,
  from: TeamSpot,
  startS: number,
  offsetM = 0,
  speed = TRANSIT_SPEED_M_S,
): TeamTrack {
  const v = Math.max(0.1, speed);
  const at = TMP_YOKE;
  let arriveS = startS;
  for (let i = 0; i < 32; i++) {
    pathAt(path, arriveS * TEAM_SPEED_M_S + offsetM, at);
    const next = startS + Math.hypot(at.x - from.x, at.z - from.z) / v;
    if (Math.abs(next - arriveS) < 1e-6) {
      arriveS = next;
      break;
    }
    arriveS = next;
  }
  const pose = teamPose(path, arriveS, TRANSIT_PROBE, FLAT, offsetM);
  const to = teamSpot(pose);
  const length = Math.hypot(to.x - from.x, to.z - from.z);
  if (length < TRANSIT_M.min || length > TRANSIT_M.max || arriveS <= startS) {
    return teamTrack(path, offsetM);
  }
  return { path, offsetM, transit: { startS, arriveS, from: { ...from }, to } };
}

/** Úhel o kolik se natočit z `a` do `b` (nejkratší cestou, −π…π). */
function turnBetween(a: number, b: number): number {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

const TMP_TRANSIT_YOKE: PathPoint = { x: 0, z: 0, hx: 0, hz: 1 };
const TMP_TRANSIT_BACK: PathPoint = { x: 0, z: 0, hx: 0, hz: 1 };

/**
 * Póza spřežení na dráze v čase `t` (s) – během přechodu na rovné čáře k dráze: rádlo
 * nadzvednuté za jhem, na začátku a konci se spřežení plynule natočí (ze směru, kterým jelo,
 * do směru dráhy) a rádlo zvedne a zase spustí. Po příchodu `teamPose`. Čistá funkce času.
 */
export function trackPose(
  track: TeamTrack,
  t: number,
  out: TeamPose,
  ground: GroundFn = FLAT,
): TeamPose {
  const transit = track.transit;
  if (!transit || t >= transit.arriveS) {
    return teamPose(track.path, t, out, ground, track.offsetM);
  }
  const { from, to } = transit;
  const lx = to.x - from.x;
  const lz = to.z - from.z;
  const length = Math.hypot(lx, lz);
  const speed = length / (transit.arriveS - transit.startS);
  const d = Math.min(length, Math.max(0, (t - transit.startS) * speed));
  const yoke = TMP_TRANSIT_YOKE;
  yoke.x = from.x + (lx / length) * d;
  yoke.z = from.z + (lz / length) * d;
  // natočení: ze směru jízdy do čáry přechodu a před příchodem do směru dráhy
  const turn = Math.min(TRANSIT_TURN_M, length / 2);
  const line = Math.atan2(lz, lx);
  let angle = Math.atan2(from.hz, from.hx);
  angle += turnBetween(angle, line) * smoothstep(0, turn, d);
  angle += turnBetween(angle, Math.atan2(to.hz, to.hx)) * smoothstep(length - turn, length, d);
  yoke.hx = Math.cos(angle);
  yoke.hz = Math.sin(angle);
  // rádlo rovně za jhem; zvedne se hned na začátku a spustí až v cíli (jak ho čeká dráha)
  const reach = ardReach();
  const back = TMP_TRANSIT_BACK;
  back.x = yoke.x - yoke.hx * reach;
  back.z = yoke.z - yoke.hz * reach;
  back.hx = yoke.hx;
  back.hz = yoke.hz;
  const lift = Math.min(
    from.lift + (1 - from.lift) * smoothstep(0, LIFT_RAMP_M, d),
    to.lift + (1 - to.lift) * smoothstep(0, LIFT_RAMP_M, length - d),
  );
  return composePose(yoke, back, lift, t, speed, out, ground);
}

// --- matice instancí -----------------------------------------------------------------------

/**
 * Matice instance pevného dílu (16 čísel od `offset`, řádkově jako Babylon): osy vpravo,
 * nahoru a vpřed z rámce, měřítko `scale`.
 */
export function writePartMatrix(
  m: Float32Array,
  offset: number,
  f: PartFrame,
  scale: number,
): void {
  // vpravo = nahoru × vpřed
  const rx = f.uy * f.fz - f.uz * f.fy;
  const ry = f.uz * f.fx - f.ux * f.fz;
  const rz = f.ux * f.fy - f.uy * f.fx;
  m[offset] = rx * scale;
  m[offset + 1] = ry * scale;
  m[offset + 2] = rz * scale;
  m[offset + 3] = 0;
  m[offset + 4] = f.ux * scale;
  m[offset + 5] = f.uy * scale;
  m[offset + 6] = f.uz * scale;
  m[offset + 7] = 0;
  m[offset + 8] = f.fx * scale;
  m[offset + 9] = f.fy * scale;
  m[offset + 10] = f.fz * scale;
  m[offset + 11] = 0;
  m[offset + 12] = f.x;
  m[offset + 13] = f.y;
  m[offset + 14] = f.z;
  m[offset + 15] = 1;
}

const SEGMENT_FRAME = frame();

/**
 * Matice instance tyče modelované od počátku podél +z délky `modelLength`: natáhne ji z bodu a
 * do bodu b, průřez zvětší `thickness` (osa nahoru co nejblíž svislici).
 */
export function writeSegmentMatrix(
  m: Float32Array,
  offset: number,
  seg: Segment3,
  modelLength: number,
  thickness: number,
): void {
  let dx = seg.bx - seg.ax;
  let dy = seg.by - seg.ay;
  let dz = seg.bz - seg.az;
  const len = Math.hypot(dx, dy, dz) || 1e-6;
  dx /= len;
  dy /= len;
  dz /= len;
  // nahoru: svislice bez složky podél tyče
  let ux = -dy * dx;
  let uy = 1 - dy * dy;
  let uz = -dy * dz;
  const ul = Math.hypot(ux, uy, uz);
  if (ul < 1e-6) {
    ux = 1;
    uy = 0;
    uz = 0;
  } else {
    ux /= ul;
    uy /= ul;
    uz /= ul;
  }
  const f = SEGMENT_FRAME;
  f.x = seg.ax;
  f.y = seg.ay;
  f.z = seg.az;
  f.fx = dx;
  f.fy = dy;
  f.fz = dz;
  f.ux = ux;
  f.uy = uy;
  f.uz = uz;
  writePartMatrix(m, offset, f, thickness);
  const stretch = len / modelLength;
  m[offset + 8] = dx * stretch;
  m[offset + 9] = dy * stretch;
  m[offset + 10] = dz * stretch;
}
