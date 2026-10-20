import { smoothstep } from './grid';
import type { Random } from './random';
import {
  heightAt,
  LOOP_CALM,
  SAMPLE_STEP,
  type ChannelSample,
  type StreamLoop,
  type StreamPlan,
} from './stream';
import type { Promontory } from './types';

// Skály u potoka – terén 2 (landscape.md – Skály u potoka; Martin, 20. 10. 2026). Čísla jsou
// návrh Clauda podle rešerše docs/design/research/2026-10-20-stream-rocks.md. Počítá jen server
// při generování terénu (výšky jdou do prohlížeče hotové), proto tu smí být Math.hypot apod.

/**
 * Ostrý ohyb: poloměr osy pod `radiusPerWidth` šířek koryta a stočení přes `minTurnDeg` – volný
 * meandr má poloměr 2–3 šířky (Leopold a Wolman), takhle ostře potok zahne jen o skálu.
 */
export const SHARP_BEND = { radiusPerWidth: 1.5, minTurnDeg: 50 } as const;
/**
 * Skalní ostroh na vnější straně ostrého ohybu (tam, kam by potok jinak tekl rovně): výška nad
 * hladinou (m) podle okolí – `minM` + `perRiseM` na metr, o který okolí převyšuje hladinu, nejvýš
 * `maxM`; střed `offset` políček za okrajem vody, poloměr temene a dozvuk (políčka), stěna
 * podél toku ± `wallHalf` políček.
 */
export const ROCK_SPUR = {
  minM: 4,
  maxM: 9,
  perRiseM: 0.5,
  offset: 1.3,
  radius: 1.6,
  fade: 3,
  wallHalf: 3.5,
} as const;
/**
 * Nárazový břeh oblouku: od zakřivení `curvature[0]` (rad na políčko – poloměr 10 políček) plně
 * od `curvature[1]` (≈ 3,3 políčka), oblouk stočený aspoň o `turnDeg[0]`, plně od `turnDeg[1]`.
 * Výška: v rovině `lowM` (hlinitý břeh 1–2 m), s výškou okolí `perRiseM` na metr nad `riseFromM`,
 * nejvýš `maxM` – skalní stěna v zaříznutém údolí.
 */
export const CUT_BANK = {
  curvature: [0.1, 0.3],
  turnDeg: [40, 80],
  lowM: 1.5,
  maxM: 8,
  perRiseM: 0.7,
  riseFromM: 1,
} as const;
/**
 * Stěna od okraje vody (políčka): čelo do `width`, nad ním terasa `top`, která do `fade` dozní
 * do okolního terénu; za terasou smí terén dál stoupat nejvýš `slope` m na políčko (jako svah
 * údolí – `VALLEY_SLOPE`).
 */
const WALL = { width: 1.1, top: 1, fade: 4, slope: 0.9, innerWiden: 1.2 } as const;
/**
 * Strana oblouku jako ve scéně (`innerBend` osy potoka): stočení na úseku ± `window` bodů
 * (≈ 40 m), plné při `full` rad. Na vnitřní straně (svah ostrožny) je stěna mírnější – svah.
 */
const BEND_SIDE = { window: 5, full: 1.2 } as const;
/** Okolí, podle kterého se měří výška břehu: body za okrajem vody (políčka). */
const RISE_PROBES = [2, 3.5, 5] as const;
/** Úsek toku (políčka), za kterým jde o jinou část potoka (šíje meandru). */
const OTHER_PART = 12;
/** Kam (políčka od okraje vody) úpravy terénu sahají. */
const REACH = 16;
/** Kolem místa pro vesnici skály nejsou (políčka); plně až od `to`. */
export const ROCK_FREE_SITE = { from: 24, to: 34 } as const;

/**
 * Ostrožna nad zaříznutým meandrem (smyčka Ω): poloměr osy smyčky, vzdálenost os ramen v šíji
 * (políčka), poloměr ohybů u paty smyčky, výška plochy nad hladinou (m); ostrožna nejméně
 * `siteDistance` od místa pro vesnici (střed) a `siteLoopDistance` (kterýkoli bod smyčky);
 * vyvýšené okolí (návrší, do kterého se meandr zařízl) sahá `uplandMargin` políček za šíji
 * a do `uplandFade` dozní. Ostrožna jen kde terén dovolí – průměrné okolí smyčky aspoň `hillMinM`
 * nad potokem (zvlněnější krajina).
 */
export const PROMONTORY = {
  radius: [5, 6.2],
  neck: [5.6, 6.4],
  hook: 2.5,
  heightM: [8, 12],
  siteDistance: 44,
  siteLoopDistance: 32,
  uplandMargin: 1.5,
  uplandFade: 9,
  hillMinM: 10,
} as const;

/** Naplánovaná ostrožna – smyčka potoka a její geometrie (políčka). */
export interface PromontoryPlan {
  readonly loop: StreamLoop;
  /** Střed smyčky (a ostrožny). */
  readonly center: { x: number; y: number };
  readonly radius: number;
  /** Bod trasy pod šíjí a směry: podél trasy a k ostrožně. */
  readonly origin: { x: number; y: number };
  readonly along: { x: number; y: number };
  readonly toward: { x: number; y: number };
  /** Vzdálenost šíje od trasy (políčka) a body nejbližšího přiblížení ramen. */
  readonly neckOffset: number;
  readonly neck: readonly [{ x: number; y: number }, { x: number; y: number }];
  readonly heightM: number;
  /** Poloměr plně vyvýšeného okolí kolem středu (políčka). */
  readonly uplandRadius: number;
  /** Jak moc okolí převyšuje potok (m) – podle toho se smyčka vybrala. */
  readonly hillM: number;
}

/**
 * Najde úsek potoka, kde se může zaříznout meandr s ostrožnou: dost rovná trasa ve zvlněné
 * krajině, daleko od místa pro vesnici, od okrajů mapy i od ostatních částí potoka. Náhoda
 * (velikost, šíje, výška) se losuje vždy stejně, výběr místa je deterministický.
 */
export function planPromontory(
  plan: StreamPlan,
  heights: Float32Array,
  size: number,
  site: { x: number; y: number },
  random: Random,
): PromontoryPlan | null {
  const radius = range(random, PROMONTORY.radius);
  const neckWidth = range(random, PROMONTORY.neck);
  const heightM = range(random, PROMONTORY.heightM);
  const hook = PROMONTORY.hook;
  // Geometrie Ω (osa u podél trasy, v k ostrožně): pata ramene ve vzdálenosti e od středu šíje,
  // ohyb paty o poloměru hook, velký oblouk kolem středu (0, c).
  const cosBeta = (neckWidth / 2 + hook) / (radius + hook);
  const beta = Math.acos(cosBeta);
  const e = (radius + hook) * cosBeta;
  const c = hook + (radius + hook) * Math.sin(beta);
  const half = Math.max(e, radius) + 3;
  const { base, along, amplitude } = plan;
  const total = along.at(-1)!;
  const uplandRadius = c + PROMONTORY.uplandMargin;

  let best: {
    score: number;
    s0: number;
    origin: { x: number; y: number };
    t: { x: number; y: number };
    n: { x: number; y: number };
    halfChord: number;
  } | null = null;
  for (let k = 0; k < base.length; k += 4) {
    const s0 = along[k]!;
    if (s0 - half - LOOP_CALM < 12 || s0 + half + LOOP_CALM > total - 12) continue;
    const a = pointAt(base, along, s0 - half);
    const b = pointAt(base, along, s0 + half);
    const chord = Math.hypot(b.x - a.x, b.y - a.y);
    if (chord < 2 * half * 0.9) continue;
    const t = { x: (b.x - a.x) / chord, y: (b.y - a.y) / chord };
    const origin = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    // Trasa v úseku skoro rovná – smyčka na ní navazuje bez zlomu.
    let straight = true;
    let level = Infinity;
    for (let j = 0; j < base.length; j++) {
      if (Math.abs(along[j]! - s0) > half) continue;
      const p = base[j]!;
      if (Math.abs(-(p.x - origin.x) * t.y + (p.y - origin.y) * t.x) > 1.5) straight = false;
      level = Math.min(level, heightAt(heights, size, p));
    }
    if (!straight) continue;
    for (const side of [1, -1]) {
      const n = { x: -t.y * side, y: t.x * side };
      const center = { x: origin.x + n.x * c, y: origin.y + n.y * c };
      const margin = radius + 5;
      if (
        center.x < margin ||
        center.y < margin ||
        center.x > size - 1 - margin ||
        center.y > size - 1 - margin
      ) {
        continue;
      }
      if (Math.hypot(center.x - site.x, center.y - site.y) < PROMONTORY.siteDistance) continue;
      if (Math.hypot(origin.x - site.x, origin.y - site.y) < PROMONTORY.siteLoopDistance) continue;
      // Ostatní části potoka (i s meandry) mimo vyvýšené okolí.
      let clear = true;
      for (let j = 0; j < base.length && clear; j++) {
        if (Math.abs(along[j]! - s0) <= half + LOOP_CALM + 2) continue;
        const p = base[j]!;
        if (Math.hypot(p.x - center.x, p.y - center.y) < uplandRadius + amplitude + 2) {
          clear = false;
        }
      }
      if (!clear) continue;
      const score = meanInDisk(heights, size, center, radius + 2) - level;
      if (!best || score > best.score) {
        best = { score, s0, origin, t, n, halfChord: chord / 2 };
      }
    }
  }
  if (!best || best.score < PROMONTORY.hillMinM) return null;

  const { origin, t, n, halfChord } = best;
  const world = (u: number, v: number): { x: number; y: number } => ({
    x: origin.x + t.x * u + n.x * v,
    y: origin.y + t.y * u + n.y * v,
  });
  const local: { u: number; v: number }[] = [];
  const step = 0.25;
  const straight = (u0: number, u1: number): void => {
    const count = Math.max(1, Math.ceil(Math.abs(u1 - u0) / step));
    for (let i = 0; i < count; i++) local.push({ u: u0 + ((u1 - u0) * i) / count, v: 0 });
  };
  const arc = (cu: number, cv: number, r: number, from: number, to: number): void => {
    const count = Math.max(2, Math.ceil((Math.abs(to - from) * r) / step));
    for (let i = 0; i < count; i++) {
      const angle = from + ((to - from) * i) / count;
      local.push({ u: cu + r * Math.cos(angle), v: cv + r * Math.sin(angle) });
    }
  };
  straight(-halfChord, -e);
  // Pata: ohyb k ostrožně (proti směru hodinových ručiček v osách u, v), velký oblouk kolem
  // ostrožny po směru, druhá pata zpět do směru trasy.
  arc(-e, hook, hook, -Math.PI / 2, beta);
  arc(0, c, radius, Math.PI + beta, -beta);
  arc(e, hook, hook, Math.PI - beta, (3 * Math.PI) / 2);
  straight(e, halfChord);
  local.push({ u: halfChord, v: 0 });
  return {
    loop: {
      from: best.s0 - half,
      to: best.s0 + half,
      points: local.map((p) => world(p.u, p.v)),
    },
    center: world(0, c),
    radius,
    origin,
    along: t,
    toward: n,
    neckOffset: hook,
    neck: [world(-e + hook, hook), world(e - hook, hook)],
    heightM,
    uplandRadius,
    hillM: best.score,
  };
}

/** Skalní ostroh v ostrém ohybu. */
interface RockSpur {
  x: number;
  y: number;
  top: number;
}

/** Výsledek úprav břehů: výšky stěn u bodů osy a ostrožny. */
export interface StreamRocks {
  /** Výška stěny nad hladinou (m) vlevo a vpravo u každého bodu osy. */
  bankLeft: Float32Array;
  bankRight: Float32Array;
  promontories: Promontory[];
}

/**
 * Skály u potoka nad vyhloubeným korytem (`heights` po `carveStream`, mění se na místě; `orig` =
 * terén před vyhloubením): v ostrém ohybu skalní ostroh, na vnější straně oblouků strmý nárazový
 * břeh nebo skalní stěna podle výšky okolí, u naplánované ostrožny zaříznutý meandr ve vyvýšeném
 * okolí. Vodní políčka, osa, šířky a hladina zůstanou; kolem místa pro vesnici beze změny.
 */
export function sculptStreamRocks(
  heights: Float32Array,
  orig: Float32Array,
  water: Uint8Array,
  samples: readonly ChannelSample[],
  levels: readonly number[],
  size: number,
  site: { x: number; y: number },
  promontory: PromontoryPlan | null,
  random: Random,
): StreamRocks {
  const n = samples.length;
  const carved = heights.slice();
  const wantLeft = new Float64Array(n);
  const wantRight = new Float64Array(n);
  const phase = random.next() * Math.PI * 2;
  const siteFree = (x: number, y: number): number =>
    smoothstep(
      (Math.hypot(x - site.x, y - site.y) - ROCK_FREE_SITE.from) /
        (ROCK_FREE_SITE.to - ROCK_FREE_SITE.from),
    );

  // Vyvýšené okolí ostrožny – návrší, do kterého se meandr zařízl.
  let top = -Infinity;
  if (promontory) {
    let level = Infinity;
    samples.forEach((p, k) => {
      if (Math.hypot(p.x - promontory.center.x, p.y - promontory.center.y) <= promontory.radius + 2)
        level = Math.min(level, levels[k]!);
    });
    top = level + promontory.heightM;
  }
  /**
   * Výška vyvýšeného okolí v bodě (−∞ mimo něj): původní terén srovnaný do výšky plochy
   * ostrožny, dál od ní plynule zpět k původnímu terénu.
   */
  const uplandAt = (x: number, y: number, ground: number): number => {
    if (!promontory) return -Infinity;
    const d = Math.hypot(x - promontory.center.x, y - promontory.center.y);
    const w = 1 - smoothstep((d - promontory.uplandRadius) / PROMONTORY.uplandFade);
    return w > 0 ? ground + (top - ground) * w : -Infinity;
  };
  const upland = new Float64Array(size * size).fill(-Infinity);
  for (let i = 0; i < upland.length; i++) {
    upland[i] = uplandAt(i % size, Math.floor(i / size), orig[i]!);
  }
  const nearPromontory = (p: { x: number; y: number }): boolean =>
    promontory !== null &&
    Math.hypot(p.x - promontory.center.x, p.y - promontory.center.y) <
      promontory.uplandRadius + PROMONTORY.uplandFade;

  const side = (k: number, s: number): { x: number; y: number; half: number } => {
    const p = samples[k]!;
    // Levá strana leží ve směru (−ty, tx).
    return { x: -p.ty * s, y: p.tx * s, half: s > 0 ? p.left : p.right };
  };
  const rise = (k: number, s: number): number => {
    const p = samples[k]!;
    const d = side(k, s);
    let sum = 0;
    for (const probe of RISE_PROBES) {
      sum += heightAt(orig, size, {
        x: p.x + d.x * (d.half + probe),
        y: p.y + d.y * (d.half + probe),
      });
    }
    return sum / RISE_PROBES.length - levels[k]!;
  };
  const want = (k: number, s: number, value: number): void => {
    const list = s > 0 ? wantLeft : wantRight;
    list[k] = Math.max(list[k]!, value);
  };

  // Strana oblouku: kladná = vnitřní strana (podle stočení toku na ≈ 40 m).
  const bendTurn = samples.map((_, k) => {
    const a = samples[Math.max(0, k - BEND_SIDE.window)]!;
    const b = samples[Math.min(n - 1, k + BEND_SIDE.window)]!;
    return wrapAngle(Math.atan2(b.ty, b.tx) - Math.atan2(a.ty, a.tx));
  });
  const wallWidth = (k: number, s: number): number =>
    WALL.width *
    (1 + WALL.innerWiden * Math.min(1, Math.max(0, (bendTurn[k]! / BEND_SIDE.full) * s)));

  // Zakřivení osy (rad na políčko, kladné doleva) a jeho vyhlazení.
  const angle = samples.map((p) => Math.atan2(p.ty, p.tx));
  const curvature = samples.map((_, k) => {
    if (k < 2 || k >= n - 2) return 0;
    return wrapAngle(angle[k + 2]! - angle[k - 2]!) / (4 * SAMPLE_STEP);
  });
  const smooth = curvature.map((_, k) => {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, k - 2); j <= Math.min(n - 1, k + 2); j++) {
      sum += curvature[j]!;
      count++;
    }
    return sum / count;
  });

  // Nárazový břeh: vnější strana oblouků, výška podle okolí a síly oblouku.
  const [c0, c1] = CUT_BANK.curvature;
  const [t0, t1] = CUT_BANK.turnDeg.map((deg) => (deg * Math.PI) / 180) as [number, number];
  for (let k = 0; k < n;) {
    if (Math.abs(smooth[k]!) < c0) {
      k++;
      continue;
    }
    const sign = Math.sign(smooth[k]!);
    let j = k;
    let turn = 0;
    while (j < n && Math.sign(smooth[j]!) === sign && Math.abs(smooth[j]!) >= c0) {
      turn += Math.abs(smooth[j]!) * SAMPLE_STEP;
      j++;
    }
    if (turn >= t0) {
      const arcShare = smoothstep((turn - t0) / (t1 - t0));
      for (let m = k; m < j; m++) {
        if (nearPromontory(samples[m]!)) continue;
        const outer = -sign;
        const strength = smoothstep((Math.abs(smooth[m]!) - c0) / (c1 - c0)) * arcShare;
        const height = Math.min(
          CUT_BANK.maxM,
          CUT_BANK.lowM + CUT_BANK.perRiseM * Math.max(0, rise(m, outer) - CUT_BANK.riseFromM),
        );
        // Výška se podél toku mírně mění (vrstvy skály, sesuvy).
        const vary = 0.85 + 0.3 * (0.5 + 0.5 * Math.sin(samples[m]!.s / 7 + phase));
        want(m, outer, strength * height * vary);
      }
    }
    k = j;
  }

  // Skalní ostroh: ostrý ohyb (poloměr pod 1,5 šířky koryta, stočení přes 50°).
  const spurs: RockSpur[] = [];
  const minTurn = (SHARP_BEND.minTurnDeg * Math.PI) / 180;
  const sharp = (k: number): boolean =>
    Math.abs(curvature[k]!) * SHARP_BEND.radiusPerWidth * (samples[k]!.left + samples[k]!.right) >
    1;
  for (let k = 0; k < n;) {
    if (!sharp(k)) {
      k++;
      continue;
    }
    const sign = Math.sign(curvature[k]!);
    let j = k;
    let turn = 0;
    let apex = k;
    while (j < n && Math.sign(curvature[j]!) === sign && sharp(j)) {
      turn += Math.abs(curvature[j]!) * SAMPLE_STEP;
      if (Math.abs(curvature[j]!) > Math.abs(curvature[apex]!)) apex = j;
      j++;
    }
    const p = samples[apex]!;
    if (turn >= minTurn && !nearPromontory(p) && siteFree(p.x, p.y) > 0) {
      const outer = -sign;
      const d = side(apex, outer);
      const height =
        Math.min(
          ROCK_SPUR.maxM,
          ROCK_SPUR.minM + ROCK_SPUR.perRiseM * Math.max(0, rise(apex, outer) - 1),
        ) *
        (0.9 + 0.2 * random.next());
      spurs.push({
        x: p.x + d.x * (d.half + ROCK_SPUR.offset),
        y: p.y + d.y * (d.half + ROCK_SPUR.offset),
        top: levels[apex]! + height,
      });
      for (let m = 0; m < n; m++) {
        const apart = Math.abs(samples[m]!.s - p.s);
        if (apart < ROCK_SPUR.wallHalf)
          want(m, outer, height * (1 - smoothstep(apart / ROCK_SPUR.wallHalf)));
      }
    }
    k = j;
  }
  const knob = new Float64Array(size * size).fill(-Infinity);
  for (const spur of spurs) {
    const reach = Math.ceil(ROCK_SPUR.radius + ROCK_SPUR.fade);
    for (
      let y = Math.max(0, Math.floor(spur.y) - reach);
      y <= Math.min(size - 1, Math.ceil(spur.y) + reach);
      y++
    ) {
      for (
        let x = Math.max(0, Math.floor(spur.x) - reach);
        x <= Math.min(size - 1, Math.ceil(spur.x) + reach);
        x++
      ) {
        const i = y * size + x;
        const d = Math.hypot(x - spur.x, y - spur.y);
        const inner = ROCK_SPUR.radius * 0.5;
        const w = 1 - smoothstep((d - inner) / (ROCK_SPUR.radius + ROCK_SPUR.fade - inner));
        if (w > 0) knob[i] = Math.max(knob[i]!, orig[i]! + Math.max(0, spur.top - orig[i]!) * w);
      }
    }
  }

  // Stěny zaříznutého meandru – obě strany toku ve vyvýšeném okolí.
  if (promontory) {
    for (let k = 0; k < n; k++) {
      const p = samples[k]!;
      for (const s of [1, -1]) {
        const d = side(k, s);
        const probe = d.half + wallWidth(k, s) + WALL.top / 2;
        const x = p.x + d.x * probe;
        const y = p.y + d.y * probe;
        const value = uplandAt(x, y, heightAt(orig, size, { x, y }));
        if (Number.isFinite(value)) want(k, s, value - levels[k]!);
      }
    }
  }

  // Výšky stěn podél toku plynule (vyhlazení ± 1 políčko) a mimo okolí vesnice.
  const bankWant = (list: Float64Array): Float64Array =>
    list.map((_, k) => {
      let sum = 0;
      let count = 0;
      for (let j = Math.max(0, k - 2); j <= Math.min(n - 1, k + 2); j++) {
        sum += list[j]!;
        count++;
      }
      const p = samples[k]!;
      return (sum / count) * siteFree(p.x, p.y);
    });
  const hLeft = bankWant(wantLeft);
  const hRight = bankWant(wantRight);

  // Nejbližší bod osy (podle vzdálenosti od okraje vody) a nejbližší z jiné části toku.
  const total = size * size;
  const first = new Int32Array(total).fill(-1);
  const firstD = new Float64Array(total).fill(Infinity);
  const firstSide = new Int8Array(total);
  const second = new Int32Array(total).fill(-1);
  const secondD = new Float64Array(total).fill(Infinity);
  const secondSide = new Int8Array(total);
  const visit = (fn: (i: number, k: number, d: number, s: number) => void): void => {
    samples.forEach((p, k) => {
      const reach = Math.ceil(Math.max(p.left, p.right) + REACH);
      for (
        let y = Math.max(0, Math.floor(p.y) - reach);
        y <= Math.min(size - 1, Math.ceil(p.y) + reach);
        y++
      ) {
        for (
          let x = Math.max(0, Math.floor(p.x) - reach);
          x <= Math.min(size - 1, Math.ceil(p.x) + reach);
          x++
        ) {
          const dx = x - p.x;
          const dy = y - p.y;
          const lateral = -dx * p.ty + dy * p.tx;
          const s = lateral >= 0 ? 1 : -1;
          const d = Math.hypot(dx, dy) - (s > 0 ? p.left : p.right);
          if (d <= REACH) fn(y * size + x, k, d, s);
        }
      }
    });
  };
  visit((i, k, d, s) => {
    if (d < firstD[i]!) {
      firstD[i] = d;
      first[i] = k;
      firstSide[i] = s;
    }
  });
  visit((i, k, d, s) => {
    const own = first[i]!;
    if (own < 0 || Math.abs(samples[k]!.s - samples[own]!.s) <= OTHER_PART) return;
    if (d < secondD[i]!) {
      secondD[i] = d;
      second[i] = k;
      secondSide[i] = s;
    }
  });

  /** Terén u stěny části toku (bod k, strana s, vzdálenost d od okraje vody), nikdy pod korytem. */
  const shapeAt = (i: number, k: number, d: number, s: number): number => {
    const h = s > 0 ? hLeft[k]! : hRight[k]!;
    const extra = Math.max(upland[i]!, knob[i]!);
    if (h <= 0 && !Number.isFinite(extra)) return carved[i]!;
    const level = levels[k]!;
    const width = wallWidth(k, s);
    const cap = level + h * smoothstep(d / width) + WALL.slope * Math.max(0, d - width - WALL.top);
    const terrace = level + h * (1 - smoothstep((d - width - WALL.top) / WALL.fade));
    // Za stěnou původní terén (ve vyvýšeném okolí ostrožny srovnaný do výšky plochy).
    const ground = Number.isFinite(upland[i]!) ? upland[i]! : orig[i]!;
    const envelope = Math.max(h > 0 ? ground : -Infinity, terrace, extra);
    return Math.max(carved[i]!, Math.min(cap, envelope));
  };
  for (let i = 0; i < total; i++) {
    if (water[i] || first[i]! < 0) continue;
    const d1 = Math.max(0, firstD[i]!);
    let value = shapeAt(i, first[i]!, firstD[i]!, firstSide[i]!);
    if (second[i]! >= 0) {
      const d2 = Math.max(0, secondD[i]!);
      const w1 = 1 / (d1 + 0.35) ** 4;
      const w2 = 1 / (d2 + 0.35) ** 4;
      value = (value * w1 + shapeAt(i, second[i]!, secondD[i]!, secondSide[i]!) * w2) / (w1 + w2);
    }
    const free = siteFree(i % size, Math.floor(i / size));
    heights[i] = carved[i]! + (value - carved[i]!) * free;
  }

  // Skutečná výška stěny u každého bodu osy – podle upraveného terénu za čelem stěny.
  const actual = (list: Float64Array, s: number): Float32Array =>
    Float32Array.from(list, (h, k) => {
      if (h <= 0.3) return 0;
      const p = samples[k]!;
      const d = side(k, s);
      const probe = d.half + wallWidth(k, s) + WALL.top / 2;
      const there = heightAt(heights, size, { x: p.x + d.x * probe, y: p.y + d.y * probe });
      const height = Math.min(h, there - levels[k]!);
      return height > 0.3 ? height : 0;
    });
  const bankLeft = actual(hLeft, 1);
  const bankRight = actual(hRight, -1);

  const promontories = promontory ? [describePromontory(heights, size, promontory, top)] : [];
  return { bankLeft, bankRight, promontories };
}

/** Obrys plochy ostrožny (32 paprsků od středu), šíje a plocha z upraveného terénu. */
function describePromontory(
  heights: Float32Array,
  size: number,
  plan: PromontoryPlan,
  top: number,
): Promontory {
  const edge = top - 2;
  const { center, origin, toward, along } = plan;
  const offset = (p: { x: number; y: number }): number =>
    (p.x - origin.x) * toward.x + (p.y - origin.y) * toward.y;
  const high = (p: { x: number; y: number }): boolean => heightAt(heights, size, p) >= edge;
  const outline: { x: number; y: number }[] = [];
  const RAYS = 32;
  for (let j = 0; j < RAYS; j++) {
    const a = (2 * Math.PI * j) / RAYS;
    let r = 0;
    for (; r < plan.radius + 1; r += 0.1) {
      const p = { x: center.x + Math.cos(a) * (r + 0.1), y: center.y + Math.sin(a) * (r + 0.1) };
      if (!high(p) || offset(p) < plan.neckOffset) break;
    }
    outline.push({ x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r });
  }
  let area = 0;
  outline.forEach((p, j) => {
    const q = outline[(j + 1) % outline.length]!;
    area += p.x * q.y - q.x * p.y;
  });
  // Šíje: po přímce mezi rameny od jejího středu na obě strany, dokud je terén nahoře.
  const mid = {
    x: (plan.neck[0].x + plan.neck[1].x) / 2,
    y: (plan.neck[0].y + plan.neck[1].y) / 2,
  };
  const walk = (dir: number): { x: number; y: number } => {
    let u = 0;
    while (u < 10) {
      const p = { x: mid.x + along.x * dir * (u + 0.1), y: mid.y + along.y * dir * (u + 0.1) };
      if (!high(p)) break;
      u += 0.1;
    }
    return { x: mid.x + along.x * dir * u, y: mid.y + along.y * dir * u };
  };
  return {
    outline,
    neck: [walk(-1), walk(1)],
    center: { x: center.x, y: center.y },
    heightM: plan.heightM,
    areaHa: (Math.abs(area) / 2) * 0.0225,
  };
}

function pointAt(
  points: readonly { x: number; y: number }[],
  along: readonly number[],
  s: number,
): { x: number; y: number } {
  let k = 0;
  while (k < along.length - 2 && along[k + 1]! < s) k++;
  const length = along[k + 1]! - along[k]!;
  const t = length > 0 ? Math.min(1, Math.max(0, (s - along[k]!) / length)) : 0;
  const a = points[k]!;
  const b = points[k + 1]!;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function meanInDisk(
  heights: Float32Array,
  size: number,
  center: { x: number; y: number },
  radius: number,
): number {
  let sum = 0;
  let count = 0;
  for (
    let y = Math.max(0, Math.floor(center.y - radius));
    y <= Math.min(size - 1, Math.ceil(center.y + radius));
    y++
  ) {
    for (
      let x = Math.max(0, Math.floor(center.x - radius));
      x <= Math.min(size - 1, Math.ceil(center.x + radius));
      x++
    ) {
      if (Math.hypot(x - center.x, y - center.y) > radius) continue;
      sum += heights[y * size + x]!;
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function range(random: Random, [min, max]: readonly [number, number]): number {
  return min + random.next() * (max - min);
}
