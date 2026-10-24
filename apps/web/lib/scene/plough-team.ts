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
/**
 * Poloměr kulatého vnějšího rohu pole oraného rádlem (m – oxen.md, Kulaté rohy; Martin,
 * 19. 10. 2026: „spřežení se musí otočit, takže zorané pole nikdy nebude mít ostré rohy“): radlice
 * jede o dosah oje (≈ 3,3 m) za jhem a jho se otáčí po oblouku ≈ 1,9 m – do rohu blíž než ≈ 5 m
 * spřežení s radlicí v zemi nedojede. Stejný oblouk kreslí obtisk pole (field-renderer.ts) i dráha
 * spřežení (řady v rohu končí na oblouku).
 */
export const PLOUGH_CORNER_M = 5;
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
  /**
   * Kulaté rohy čtverce v osách řad: poloměr rohu podle čtvrti (podél řad −/+, napříč −/+ –
   * index `(podél > 0 ? 1 : 0) + (napříč > 0 ? 2 : 0)`), 0 = ostrý roh.
   */
  cornerRadii: readonly [number, number, number, number];
}

export interface PloughField {
  /** Střed čtverce pole. */
  x: number;
  z: number;
  /** Strana čtverce (m) – napříč řadami. */
  size: number;
  /**
   * Délka podél řad (m) – pás orby přes víc dílů (oxen.md – Co nejdelší brázda: brázda vede přes
   * celý pás); bez údaje čtverec (`size`).
   */
  length?: number;
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
  /**
   * Kulaté rohy čtverce (body rohů ve světě – vnější rohy pole oraného rádlem, oxen.md): řady
   * u nich končí na oblouku o poloměru `cornerRadius` (bez údaje PLOUGH_CORNER_M), rádlo se tam
   * zvedá. Bez údaje rohy ostré.
   */
  corners?: readonly { x: number; z: number }[];
  cornerRadius?: number;
  /**
   * Řady přerušené pevnou cestou (oxen.md – Brázdy končí na cestě): pro každou řadu (`rows` po
   * zaokrouhlení na sudý počet – `stintRowCount`) od–do podél řad (m od středu), kudy v této části
   * pruhu jede rádlo v zemi (osa řady); `fillLo`–`fillHi` – kam po projetí řady sahá brázda po celé
   * šířce řady (u šikmé cesty až k ní). null = řada tu není. Bez údaje celé řady.
   */
  rowRuns?: readonly ({ lo: number; hi: number; fillLo?: number; fillHi?: number } | null)[];
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
  const plan = stintRows(field, true, turnRadius);
  return { ...pathOf(plan.segments), field: plan.field, cornerRadii: plan.radii };
}

/** Počátky úseků a celková délka dráhy. */
function pathOf(segments: PathSegment[]): Pick<PloughPath, 'segments' | 'starts' | 'length'> {
  const starts: number[] = [];
  let total = 0;
  for (const s of segments) {
    starts.push(total);
    total += s.length;
  }
  return { segments, starts, length: total };
}

/**
 * Řada orby na pruhu: kde na dráze leží (úsek `segment` – rovná řada, po které jede jho), kudy
 * vede přes čtverec (podél řad `lo`–`hi` od středu, napříč `v`, šířka pásu `spacing`) a kam jede
 * (`dir` – podle směru řad +1 / −1); `startU` – kde na ní jho začíná (podél řad od středu).
 */
export interface PloughRow {
  segment: number;
  v: number;
  spacing: number;
  lo: number;
  hi: number;
  dir: 1 | -1;
  startU: number;
  /**
   * Kam sahá brázda po projetí řady (řada přerušená šikmou cestou – `PloughField.rowRuns`);
   * bez údaje `lo`–`hi`.
   */
  fillLo?: number;
  fillHi?: number;
}

/** Řady pruhu jako úseky dráhy (s obraty na souvrati), osy pruhu a poloměry rohů. */
interface StintRows {
  segments: PathSegment[];
  rows: PloughRow[];
  field: PloughField;
  radii: [number, number, number, number];
  /** Osy pruhu: podél řad (d) a napříč (s), jednotkové. */
  axes: { dx: number; dz: number; sx: number; sz: number };
}

/**
 * Řady pruhu tam a zpět s obraty na souvrati: `closed` – po poslední řadě návrat po souvrati
 * na začátek první (smyčka na dráze `ploughPath`), jinak konec na konci poslední řady (dráha
 * celé dnešní orby – `ploughRoute`). Řada jde od okraje k okraji (u kulatého rohu k oblouku), jho
 * o dosah rádla dál, ať radlice dojede až k okraji.
 */
function stintRows(field: PloughField, closed: boolean, turnRadius = TURN_RADIUS_M): StintRows {
  const rows = stintRowCount(field);
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
  const reach = ardReach();
  const segments: PathSegment[] = [];
  const plan: PloughRow[] = [];
  const offset = (k: number): number => from + (k + 0.5) * spacing;
  const radii = cornerRadii(field, dx, dz, sx, sz);
  // kde řada končí (podél řad od středu): u kulatého rohu na oblouku, jinak na okraji pásu; řada
  // přerušená cestou jen svůj kus (`rowRuns`) – na cestě se spřežení otočí jako na souvrati
  const halfU = (field.length ?? field.size) / 2;
  const all = Array.from(
    { length: rows },
    (_, k): { lo: number; hi: number; fillLo?: number; fillHi?: number } | null => {
      const base = rowExtent(offset(k), halfU, radii, field.size / 2);
      if (!field.rowRuns) return base;
      const run = field.rowRuns[k];
      if (!run) return null;
      const lo = Math.max(base.lo, run.lo);
      const hi = Math.min(base.hi, run.hi);
      if (hi - lo <= 1e-6) return null;
      return {
        lo,
        hi,
        ...(run.fillLo !== undefined
          ? { fillLo: Math.max(base.lo, Math.min(lo, run.fillLo)) }
          : {}),
        ...(run.fillHi !== undefined
          ? { fillHi: Math.min(base.hi, Math.max(hi, run.fillHi)) }
          : {}),
      };
    },
  );
  const active = all.flatMap((e, k) => (e ? [{ k, ...e }] : []));
  if (active.length === 0) {
    return { segments, rows: plan, field: { ...field, rows }, radii, axes: { dx, dz, sx, sz } };
  }
  // obrat mezi dvěma řadami na vzdálenější z jejich konců; návrat po souvrati za všemi řadami
  const back = Math.min(...active.map((e) => e.lo)) - reach;
  const far = Math.max(...active.map((e) => e.hi)) + reach;
  const plusTurn = (i: number): number => Math.max(active[i]!.hi, active[i + 1]!.hi) + reach;
  const minusTurn = (i: number): number => Math.min(active[i]!.lo, active[i + 1]!.lo) - reach;
  active.forEach((row, i) => {
    const dir = i % 2 === 0 ? 1 : -1;
    const o = offset(row.k);
    const last = i === active.length - 1;
    // začátek a konec řady (podél řad), řada jde ve směru `dir`
    const start =
      dir > 0 ? (i === 0 ? (closed ? back : row.lo - reach) : minusTurn(i - 1)) : plusTurn(i - 1);
    // lichý počet řad (cesta přerušila jen část řad) končí na protější straně
    const end =
      dir > 0
        ? last
          ? closed
            ? far
            : row.hi + reach
          : plusTurn(i)
        : last
          ? closed
            ? back
            : row.lo - reach
          : minusTurn(i);
    const ax = field.x + sx * o + dx * start;
    const az = field.z + sz * o + dz * start;
    plan.push({
      segment: segments.length,
      v: o,
      spacing,
      lo: row.lo,
      hi: row.hi,
      dir,
      startU: start,
      ...(row.fillLo !== undefined ? { fillLo: row.fillLo } : {}),
      ...(row.fillHi !== undefined ? { fillHi: row.fillHi } : {}),
    });
    segments.push({
      kind: 'line',
      length: Math.abs(end - start),
      x: ax,
      z: az,
      dx: dx * dir,
      dz: dz * dir,
    });
    const endX = field.x + sx * o + dx * end;
    const endZ = field.z + sz * o + dz * end;
    if (!last) {
      const gap = (active[i + 1]!.k - row.k) * spacing;
      uTurn(segments, endX, endZ, dx * dir, dz * dir, sx, sz, gap, turnRadius);
    } else if (closed) {
      // návrat po souvrati k první řadě (opačným směrem napříč)
      const width = (row.k - active[0]!.k) * spacing;
      if (dir < 0) {
        if (width > 1e-9) {
          uTurn(segments, endX, endZ, dx * dir, dz * dir, -sx, -sz, width, turnRadius);
        }
      } else {
        // lichý počet řad: na protější straně obrat o řadu za první řadu, zpět podél ní
        // (zvednuté rádlo) a obratem na začátek první řady
        uTurn(segments, endX, endZ, dx, dz, -sx, -sz, width + spacing, turnRadius);
        const lane = offset(active[0]!.k) - spacing;
        segments.push({
          kind: 'line',
          length: far - back,
          x: field.x + sx * lane + dx * far,
          z: field.z + sz * lane + dz * far,
          dx: -dx,
          dz: -dz,
        });
        const backX = field.x + sx * lane + dx * back;
        const backZ = field.z + sz * lane + dz * back;
        uTurn(segments, backX, backZ, -dx, -dz, sx, sz, spacing, turnRadius);
      }
    }
  });
  return { segments, rows: plan, field: { ...field, rows }, radii, axes: { dx, dz, sx, sz } };
}

/** Počet řad pruhu – `rows` zaokrouhlený na sudý (po poslední řadě zpět na straně začátku). */
export function stintRowCount(field: Pick<PloughField, 'rows'>): number {
  return Math.max(2, Math.round(field.rows / 2) * 2);
}

/** Index čtvrti čtverce podle znamének podél a napříč řad (viz `PloughPath.cornerRadii`). */
function quadrant(u: number, v: number): number {
  return (u > 0 ? 1 : 0) + (v > 0 ? 2 : 0);
}

/** Poloměry rohů čtverce v osách řad (d – podél, s – napříč) z bodů kulatých rohů pole. */
function cornerRadii(
  field: PloughField,
  dx: number,
  dz: number,
  sx: number,
  sz: number,
): [number, number, number, number] {
  const radii: [number, number, number, number] = [0, 0, 0, 0];
  const radius = Math.min(field.size / 2, field.cornerRadius ?? PLOUGH_CORNER_M);
  const halfU = (field.length ?? field.size) / 2;
  for (const c of field.corners ?? []) {
    const u = (c.x - field.x) * dx + (c.z - field.z) * dz;
    const v = (c.x - field.x) * sx + (c.z - field.z) * sz;
    // jen skutečné rohy pásu (ne bod někde jinde)
    if (Math.abs(Math.abs(u) - halfU) > 0.05) continue;
    if (Math.abs(Math.abs(v) - field.size / 2) > 0.05) continue;
    radii[quadrant(u, v)] = radius;
  }
  return radii;
}

/**
 * Kde řada ve vzdálenosti `v` napříč (od středu) přes čtverec (pás – podél `half`, napříč
 * `halfV`) vede (podél řad, od středu): od okraje k okraji, u kulatého rohu jen k oblouku.
 */
export function rowExtent(
  v: number,
  half: number,
  radii: readonly [number, number, number, number],
  halfV = half,
): { lo: number; hi: number } {
  let lo = -half;
  let hi = half;
  for (const su of [-1, 1]) {
    const r = radii[quadrant(su, v)]!;
    const inner = Math.abs(v) - (halfV - r);
    if (r <= 0 || inner <= 0) continue;
    const cut = r - Math.sqrt(Math.max(0, r * r - inner * inner));
    if (su > 0) hi = Math.min(hi, half - cut);
    else lo = Math.max(lo, -half + cut);
  }
  return { lo, hi };
}

/**
 * Jak daleko je bod (podél `du`, napříč `dv` od středu čtverce) venku za okrajem čtverce (pásu –
 * podél `half`, napříč `halfV`) s kulatými rohy (m; uvnitř záporně, nebo 0 u ostrého čtverce jako
 * dřív – max po osách).
 */
export function outsideSquare(
  du: number,
  dv: number,
  half: number,
  radii: readonly [number, number, number, number],
  halfV = half,
): number {
  const r = radii[quadrant(du, dv)]!;
  if (r <= 0) return Math.max(Math.abs(du) - half, Math.abs(dv) - halfV);
  const qx = Math.abs(du) - (half - r);
  const qy = Math.abs(dv) - (halfV - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
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

/**
 * Bod dráhy ve vzdálenosti `s` od začátku (dráha je uzavřená – `s` se opakuje). Umí každou dráhu
 * z rovných úseků a oblouků – i trasu vozu (cart-layout.ts).
 */
export function pathAt(
  path: Pick<PloughPath, 'segments' | 'starts' | 'length'>,
  s: number,
  out: PathPoint,
): PathPoint {
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
  const fdx = f.dirX / flen;
  const fdz = f.dirZ / flen;
  const across = Math.hypot(f.acrossX ?? 0, f.acrossZ ?? 0);
  const fsx = across > 1e-9 ? f.acrossX! / across : -fdz;
  const fsz = across > 1e-9 ? f.acrossZ! / across : fdx;
  const du = (back.x - f.x) * fdx + (back.z - f.z) * fdz;
  const dv = (back.x - f.x) * fsx + (back.z - f.z) * fsz;
  // kulatý roh – rádlo se zvedá na oblouku (stejném, jaký kreslí obtisk pole)
  const outside = outsideSquare(du, dv, (f.length ?? f.size) / 2, path.cornerRadii, f.size / 2);
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
  // voli pod jhem, jho, honáček s provazem (společné s vozem – cart-layout.ts)
  composeDraft(yoke, t, tempo, out, ground);
  const yf = out.yoke;

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
  return out;
}

/** Kdo vede spřežení za provaz: poloha od středu jha (x vpravo, z vpřed, m) a měřítko postavy. */
export interface TeamLeader {
  x: number;
  z: number;
  scale: number;
}

/**
 * Část pózy, kterou má spřežení s rádlem i s vozem (cart-layout.ts): voli pod jhem, jho, honák
 * (`boy` – u rádla chlapec, u vozu dospělý) a vodicí provaz.
 */
export type DraftPose = Pick<TeamPose, 'oxen' | 'boy' | 'yoke' | 'rope'>;

/**
 * Voli pod jhem v bodě dráhy `yoke`, jho na jejich šíjích (kymácí se s krokem), honák vlevo od
 * levého vola a provaz z jeho ruky k hlavě vola. `tempo` = rychlost chůze ÷ TEAM_SPEED_M_S (podle
 * ní se přehrávají klipy chůze). `oxen` = 1 – jeden vůl pod jednoduchým jhem uprostřed (dvoukolák
 * – oxen.md, Potah); druhý vůl pózy pak stojí na jeho místě a kreslí se skrytý. Zapisuje do `out`,
 * nic nealokuje.
 */
export function composeDraft(
  yoke: PathPoint,
  t: number,
  tempo: number,
  out: DraftPose,
  ground: GroundFn = FLAT,
  leader: TeamLeader = TEAM_PARTS.boy,
  oxen: 1 | 2 = 2,
): DraftPose {
  const p = TEAM_PARTS;
  const k = TEAM_SCALE;
  const fx = yoke.hx;
  const fz = yoke.hz;
  // vpravo od směru jízdy (osy scény: x vpravo, z vpřed)
  const rx = fz;
  const rz = -fx;

  // Voli: počátek o kus za jhem, do stran od středu.
  out.oxen.forEach((ox, i) => {
    const side = oxen === 1 ? 0 : i === 0 ? -1 : 1;
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

  // Honák vlevo od levého vola, kousek vpředu; provaz z ruky k hlavě vola.
  const boy = out.boy;
  boy.x = yoke.x + rx * leader.x * k + fx * leader.z * k;
  boy.z = yoke.z + rz * leader.x * k + fz * leader.z * k;
  boy.y = ground(boy.x, boy.z);
  boy.hx = fx;
  boy.hz = fz;
  boy.pace = (TEAM_SPEED_M_S / (CLIP_WALK_M_S.man * TEAM_SCALE * leader.scale)) * tempo;
  const bs = k * leader.scale;
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

// --- celá dnešní orba za herní den (ladicí – oxen.md, Orba za herní den) --------------------

/** Pruh dnešní orby na trase: pole (pruh dílu), id pole a dílu. */
export interface RouteStint {
  fieldId: number;
  partId: number | null;
  field: PloughField;
}

/**
 * Trasa spřežení přes celou dnešní orbu: pruhy dílů v pořadí práce řadu po řadě s obraty na
 * souvrati, mezi pruhy (a od místa, kde spřežení stálo) přesun rovně se zvednutým rádlem.
 * Otevřená dráha (bez návratu) – na konci dne spřežení stojí na konci poslední řady.
 */
export interface PloughRoute extends Pick<PloughPath, 'segments' | 'starts' | 'length'> {
  stints: {
    stint: RouteStint;
    radii: readonly [number, number, number, number];
    axes: { dx: number; dz: number; sx: number; sz: number };
    /** Řady pruhu – `segment` je index úseku trasy. */
    rows: PloughRow[];
  }[];
  /** U každého úseku trasy index pruhu (−1 = přesun mezi pruhy). */
  segmentStint: number[];
}

/** Konec úseku dráhy – bod a směr jízdy. */
function segmentEnd(seg: PathSegment): PathPoint {
  const p: PathPoint = { x: 0, z: 0, hx: 0, hz: 1 };
  if (seg.kind === 'line') {
    return {
      x: seg.x + seg.dx * seg.length,
      z: seg.z + seg.dz * seg.length,
      hx: seg.dx,
      hz: seg.dz,
    };
  }
  const tmp: PloughPath = {
    ...pathOf([seg]),
    field: { x: 0, z: 0, size: 1, dirX: 1, dirZ: 0, rows: 2 },
    cornerRadii: [0, 0, 0, 0],
  };
  return pathAt(tmp, seg.length - 1e-9, p);
}

/**
 * Trasa přes pruhy `stints` v daném pořadí (`ploughRoute`), s přesunem od místa `from` (kde
 * spřežení právě je) k první řadě; bez `from` začíná na první řadě. Cesty dne `legs` (oxen.md –
 * Spřežení zůstane na poli): s `out` (výjezd z ohrady nebo přesun od předchozího bloku) jde
 * napřed na jeho začátek a po něm k první řadě, s `home` se po poslední řadě vrátí do ohrady;
 * bez nich spřežení zůstává na poli – trasa jsou jen pruhy dne. Den bez pruhů se `stand` – stojí
 * u čela orby.
 */
export function ploughRoute(
  stints: readonly RouteStint[],
  from: { x: number; z: number } | null = null,
  turnRadius = TURN_RADIUS_M,
  legs: PloughLegs | null = null,
): PloughRoute {
  const segments: PathSegment[] = [];
  const segmentStint: number[] = [];
  const planned: PloughRoute['stints'] = [];
  let at: { x: number; z: number } | null = from;
  const transit = (to: { x: number; z: number }): void => {
    if (!at) return;
    const lx = to.x - at.x;
    const lz = to.z - at.z;
    const length = Math.hypot(lx, lz);
    if (length < 1e-3) return;
    segments.push({ kind: 'line', length, x: at.x, z: at.z, dx: lx / length, dz: lz / length });
    segmentStint.push(-1);
  };
  const along = (road: readonly { x: number; z: number }[]): void => {
    for (const point of road) {
      transit(point);
      at = point;
    }
  };
  const out = legs?.out && legs.out.length >= 2 ? legs.out : null;
  const home = legs?.home && legs.home.length >= 2 ? legs.home : null;
  // z místa, kde spřežení je, na začátek cesty (ohrada nebo konec předchozího bloku), pak po ní
  if (out) along(out);
  stints.forEach((stint) => {
    const plan = stintRows(stint.field, false, turnRadius);
    const first = plan.segments[0];
    // pruh bez řady (celý pod cestou) se přeskočí
    if (!first) return;
    const index = planned.length;
    transit({ x: first.kind === 'line' ? first.x : 0, z: first.kind === 'line' ? first.z : 0 });
    const offset = segments.length;
    for (const seg of plan.segments) {
      segments.push(seg);
      segmentStint.push(index);
    }
    planned.push({
      stint: { ...stint, field: plan.field },
      radii: plan.radii,
      axes: plan.axes,
      rows: plan.rows.map((r) => ({ ...r, segment: r.segment + offset })),
    });
    at = segmentEnd(plan.segments[plan.segments.length - 1]!);
  });
  // v den návratu večer od konce bloku po cestě do ohrady
  if (home && stints.length > 0) along(home);
  // den bez orby – spřežení na poli stojí u čela orby (dojde tam, kde právě je)
  const stand = legs?.stand;
  if (stand && stints.length === 0) {
    transit(stand);
    if (segments.length === 0) {
      segments.push({ kind: 'line', length: 0.01, x: stand.x, z: stand.z, dx: 1, dz: 0 });
      segmentStint.push(-1);
    }
  }
  return { ...pathOf(segments), stints: planned, segmentStint };
}

/** Cesty spřežení dne (`ScenePloughLegs` – výjezd nebo přesun `out`, návrat `home`). */
export interface PloughLegs {
  out?: readonly { x: number; z: number }[];
  home?: readonly { x: number; z: number }[];
  stand?: { x: number; z: number };
}

/**
 * Spřežení na trase dne: trasa a skutečný čas, za který ji projede (od `startMs` do `endMs` – do
 * konce herního dne; ladicí zrychlení, oxen.md – Orba za herní den).
 */
export interface RouteTrack {
  route: PloughRoute;
  startMs: number;
  endMs: number;
}

/** Kolik metrů trasy má spřežení v okamžiku `nowMs` za sebou (0 před začátkem, celá po konci). */
export function routeDistance(track: RouteTrack, nowMs: number): number {
  const span = Math.max(1, track.endMs - track.startMs);
  const f = Math.min(1, Math.max(0, (nowMs - track.startMs) / span));
  return f * track.route.length;
}

/** Rychlost spřežení na trase (m/s) – zrychlená, ať projede celou dnešní orbu. */
export function routeSpeed(track: RouteTrack): number {
  return track.route.length / (Math.max(1, track.endMs - track.startMs) / 1000);
}

/** Bod trasy ve vzdálenosti `s` (bez obtočení – trasa je otevřená). */
function routeAt(route: PloughRoute, s: number, out: PathPoint): PathPoint {
  const path = route as unknown as PloughPath;
  return pathAt(path, Math.min(route.length - 1e-6, Math.max(0, s)), out);
}

const TMP_ROUTE_YOKE: PathPoint = { x: 0, z: 0, hx: 0, hz: 1 };
const TMP_ROUTE_BACK: PathPoint = { x: 0, z: 0, hx: 0, hz: 1 };

/**
 * Póza spřežení na trase dne v okamžiku `nowMs`: jho na trase, rádlo za ním na tětivě oje (na
 * začátku trasy rovně za jhem), na souvrati, mimo díl a při přesunu nadzvednuté. Klipy chůze
 * podle zrychlené rychlosti; po konci trasy spřežení stojí. Čistá funkce času.
 */
export function routePose(
  track: RouteTrack,
  nowMs: number,
  out: TeamPose,
  ground: GroundFn = FLAT,
): TeamPose {
  const route = track.route;
  const t = (nowMs / 1000) % 3600;
  if (route.length <= 0) return out;
  const s = routeDistance(track, nowMs);
  const moving = nowMs > track.startMs && nowMs < track.endMs;
  const yoke = routeAt(route, s, TMP_ROUTE_YOKE);
  const reach = ardReach();
  // rádlo: bod trasy za jhem ve vzdálenosti oje (hledá se zpět po trase, nejvýš na její začátek)
  const back = TMP_ROUTE_BACK;
  let backS = 0;
  const start = routeAt(route, 0, { x: 0, z: 0, hx: 0, hz: 1 });
  if (Math.hypot(start.x - yoke.x, start.z - yoke.z) < reach) {
    back.x = yoke.x - yoke.hx * reach;
    back.z = yoke.z - yoke.hz * reach;
    back.hx = yoke.hx;
    back.hz = yoke.hz;
  } else {
    let near = s;
    let far = Math.max(0, s - reach);
    let guard = 0;
    while (guard++ < 400 && far > 0) {
      routeAt(route, far, back);
      if (Math.hypot(back.x - yoke.x, back.z - yoke.z) >= reach) break;
      near = far;
      far = Math.max(0, far - reach / 8);
    }
    for (let i = 0; i < 24; i++) {
      const mid = (near + far) / 2;
      routeAt(route, mid, back);
      if (Math.hypot(back.x - yoke.x, back.z - yoke.z) >= reach) far = mid;
      else near = mid;
    }
    backS = (near + far) / 2;
    routeAt(route, backS, back);
  }
  // zvednutí rádla: při přesunu nahoře, na pruhu podle okraje dílu (i kulatého rohu)
  let index = 0;
  while (index < route.segments.length - 1 && route.starts[index + 1]! <= backS) index++;
  const stintIndex = route.segmentStint[index] ?? -1;
  let lift = 1;
  if (stintIndex >= 0) {
    const { stint, radii, axes } = route.stints[stintIndex]!;
    const f = stint.field;
    const du = (back.x - f.x) * axes.dx + (back.z - f.z) * axes.dz;
    const dv = (back.x - f.x) * axes.sx + (back.z - f.z) * axes.sz;
    lift = smoothstep(
      0,
      LIFT_RAMP_M,
      outsideSquare(du, dv, (f.length ?? f.size) / 2, radii, f.size / 2),
    );
  }
  return composePose(yoke, back, lift, t, moving ? routeSpeed(track) : 0, out, ground);
}

/**
 * Brázda za spřežením – pás řady, kudy radlice projela: díl (střed a osy pruhu – podél řad
 * `along`, napříč `across`), řada napříč `v` (šířka pásu `2 × half`) a úsek podél řad `from`–`to`
 * (od středu dílu).
 */
export interface FurrowBand {
  fieldId: number;
  partId: number | null;
  x: number;
  z: number;
  along: [number, number];
  across: [number, number];
  v: number;
  half: number;
  from: number;
  to: number;
}

/**
 * Co je v okamžiku `nowMs` zoráno (čistá funkce času): pás každé řady od okraje dílu, kde
 * radlice do řady vjela, po místo, kam dojela (radlice jede o dosah oje za jhem); hotové řady
 * celé, řady před spřežením nic. Na konci dne pásy pokryjí celý dnešní pruh každého dílu.
 */
export function routeFurrows(track: RouteTrack, nowMs: number): FurrowBand[] {
  const route = track.route;
  const s = routeDistance(track, nowMs);
  const reach = ardReach();
  const bands: FurrowBand[] = [];
  for (const { stint, axes, rows } of route.stints) {
    for (const row of rows) {
      const s0 = route.starts[row.segment]!;
      if (s <= s0) continue;
      const s1 = s0 + route.segments[row.segment]!.length;
      const yokeU = row.startU + row.dir * (Math.min(s, s1) - s0);
      const ardU = yokeU - row.dir * reach;
      let from = row.dir > 0 ? row.lo : Math.max(row.lo, ardU);
      let to = row.dir > 0 ? Math.min(row.hi, ardU) : row.hi;
      // projetá řada přerušená šikmou cestou: brázda po celé šířce řady až k cestě
      if (s >= s1) {
        from = Math.min(from, row.fillLo ?? from);
        to = Math.max(to, row.fillHi ?? to);
      }
      if (to - from <= 1e-6) continue;
      bands.push({
        fieldId: stint.fieldId,
        partId: stint.partId,
        x: stint.field.x,
        z: stint.field.z,
        along: [axes.dx, axes.dz],
        across: [axes.sx, axes.sz],
        v: row.v,
        half: row.spacing / 2,
        from,
        to,
      });
    }
  }
  return bands;
}
