// Ohrada s přístřeškem bez Babylonu (docs/design/oxen.md – staví ji hráč, ve vsi i na ukázce
// /dev/buildings): čtverec 15 × 15 m (i víc – níž) obehnaný pleteným plotem se zakulacenými rohy
// (woven-fence.ts – týž plot jako pozemek polozemnice a hřbitov) 1,5 m uvnitř čtverce (mezi dvěma
// ohradami ulička 3 m pro vůz – rules-buildings.ts), branka ze žerdí na straně ke
// vsi, v zadním rohu přístřešek na sloupech otevřený do ohrady, pod ním jesle se senem, vedle
// žlab a stoh sena. Všechno deterministicky z čtverce a směru ke vsi. Souřadnice světa scény
// v metrech (x, z); natočení jako `Position.rotation` (+z modelu míří do (sin r, cos r)).
// Natočená ohrada (fields.md – Natočené stavby, oxen.md): rozmístění se spočítá v „rovném
// prostoru“ kolem středu čtverce (svět otočený zpět o natočení ohrady) a otočí se do světa.
// Ohrada o víc čtvercích (oxen.md – Ohrady podle druhu, nejvýš 4): plot po obrysu všech čtverců
// odsazený dovnitř (zakulacené rohy, vnitřní roh tvaru L), branka z jádra (`penSquaresEntrance`),
// přístřešek, jesle, žlab a stoh v prvním čtverci u vnějšího plotu, místa pro zvířata ve všech.
import {
  PEN_FENCE_INSET_M,
  PEN_GATE,
  penSquaresEntrance,
  rotationCosSin,
  type HorseKind,
  type PenSpecies,
  type Position,
} from '@bohemia/game';
import { isRotatedSquare } from './field-cells';
import type { PlotSquare } from './homestead-layout';
import { valueNoise } from './livestock-motion';
import { hash01 } from './smoke-schedule';
import { smoothstep, type Point } from './village-layout';
import {
  WOVEN_CORNER_RADIUS_M,
  fenceStage,
  wovenFence,
  type FenceStage,
  type FenceStyle,
  type WovenFence,
} from './woven-fence';

/** Čtverec ohrady – střed a strana (m), jako políčko pole. */
export type PenSquare = PlotSquare;

/** Směr ve vodorovné rovině (nemusí být jednotkový). */
export interface Direction {
  x: number;
  z: number;
}

/**
 * Pletený plot ohrady: kůly po metru, devět větví 0,14–0,94 m (hustší a vyšší než polský plot
 * pozemku, o něco řidší než proutěný plot hřbitova – dobytek se o něj opírá) a branka 1,6 m.
 */
export const PEN_FENCE: FenceStyle = {
  postStep: PEN_GATE.postStep,
  rails: [0.14, 0.24, 0.34, 0.44, 0.54, 0.64, 0.74, 0.84, 0.94],
  gateWidth: PEN_GATE.gateWidth,
};

/**
 * Plot ohrady koní (horses.md – Ohrada koní): týž pletenec, ale vyšší (≈ 1,4 m) – nízký plot kůň
 * přeskočí. Větve po 0,10 m nad plotem ohrad (do 1,34 m).
 */
export const PEN_FENCE_HORSE: FenceStyle = {
  ...PEN_FENCE,
  rails: [...PEN_FENCE.rails, 1.04, 1.14, 1.24, 1.34],
};

/** Styl plotu ohrady podle druhu (koně vyšší, ostatní beze změny). */
export function penFenceStyle(species?: PenSpecies): FenceStyle {
  return species === 'horse' ? PEN_FENCE_HORSE : PEN_FENCE;
}

/**
 * Přístřešek v souřadnicích modelu (tools/blender/pen.py): střecha od středu do stran
 * `halfLength`, dopředu (otevřená strana, +z) `front`, dozadu `back` (m).
 */
export const SHELTER_M = { halfLength: 2.3, front: 1.75, back: 1.85 } as const;
/** Mezera mezi střechou přístřešku a zadním / bočním plotem (m) – roh je zakulacený. */
const SHELTER_GAP_M = { back: 0.45, side: 0.6 } as const;
/** Žlab (2 m podél své osy x, s podložkami 0,76 m napříč) – odstup od bočního plotu (m). */
const TROUGH_M = { halfLength: 1.0, halfWidth: 0.38, sideGap: 0.5, ahead: 0.5 } as const;
/** Jesle pod přístřeškem: od středu přístřešku dozadu ke zdi a stranou dovnitř ohrady (m). */
const RACK_OFFSET_M = { back: 1.18, inward: 0.8 } as const;
/** Stoh sena (kupka z models/fields/haystack.glb zmenšená na ≈ 1,8 m). */
export const PEN_HAYSTACK_SCALE = 0.5;

/**
 * Druh zvířete v ohradě: vůl ze spřežení (models/plough/ox.glb), kráva ze stáda vsi; ovce, koza
 * a prase na noc v ohradě svého druhu (oxen.md – Na noc v ohradě – kreslí je den a noc).
 */
export type PenAnimalKind = 'ox' | 'cow' | 'sheep' | 'goat' | 'pig' | 'horse' | 'foal';

export interface PenAnimal {
  kind: PenAnimalKind;
  x: number;
  z: number;
  /** Výchozí směr hlavy (rad, jako natočení modelu). */
  heading: number;
  /** Co dělá – pije u žlabu, žere z jeslí, pase se. */
  activity: 'drink' | 'hay' | 'graze';
  seed: number;
  /** Násobek velikosti – tele ve výcviku je menší (bez údaje 1). */
  scale?: number;
}

/** Místo pro zvíře v ohradě (bez druhu) – `penAnimalsFor` na ně rozestaví skutečná zvířata. */
export type PenSpot = Omit<PenAnimal, 'kind' | 'scale'>;

/**
 * Kolik zvířat v ohradě stojí: voli spřežení, telata ve výcviku a krávy (v zimě); ovce, kozy
 * a prasata na noc (oxen.md – Na noc v ohradě; bez údaje žádné).
 */
export interface PenHerd {
  oxen: number;
  trainees: number;
  cows: number;
  sheep?: number;
  goats?: number;
  pigs?: number;
  /**
   * Koně ohrady koní (horses.md – Ohrada koní): klisny a jezdečtí koně mají každý své místo
   * (4 na čtverec), hříbě stojí u klisny bez vlastního místa. Ohrada koní se s jinými zvířaty
   * nemíchá – s koňmi se ostatní údaje ignorují.
   */
  horses?: readonly HorseKind[];
}

/** Tele ve výcviku je menší než vůl (návrh – jen vzhled). */
export const TRAINEE_SCALE = 0.8;

/** Rekvizity staveniště ohrady (díly „ohrada-…“ v pen-construction.glb). */
export type PenProp = 'timber' | 'rods' | 'straw';
export const PEN_PROPS: readonly PenProp[] = ['timber', 'rods', 'straw'];

export interface PenLayout {
  square: PenSquare;
  /** Strana ke vsi (jednotkový vektor podél osy): branka, otevřená strana přístřešku. */
  front: Direction;
  /** Na kterou stranu (jednotkový vektor kolmo k `front`) stojí přístřešek a žlab. */
  side: Direction;
  fence: WovenFence;
  /** Styl plotu – ohrada koní má vyšší (`penFenceStyle`). */
  fenceStyle: FenceStyle;
  /** Střed mezery branky a natočení dílu `gate` (žerdě podél osy x modelu). */
  gate: Position;
  shelter: Position;
  hayRack: Position;
  /** Žlab – osa x modelu podél boční strany ohrady. */
  trough: Position;
  haystack: Position;
  props: Record<PenProp, Position>;
  /**
   * Výchozí zvířata ukázky (dva voli a kráva) – ve vsi `penAnimalsFor` podle skutečného počtu.
   */
  animals: PenAnimal[];
  /** Místa pro zvířata v pořadí: u žlabu, u jeslí, na pastvě, pak dál po otevřené části. */
  spots: PenSpot[];
  /**
   * Obdélník plotu (osy kůlů na rovných stranách; u ohrady o víc čtvercích obal obrysu) –
   * u natočené ohrady v rovném prostoru kolem středu (`penToFlat`), jinak ve světě.
   */
  fenceRect: { minX: number; maxX: number; minZ: number; maxZ: number };
  /**
   * Obdélníky vnitřku po čtvercích v rovném prostoru – u vnějšího plotu po osu kůlů, ke
   * sousednímu čtverci po společnou stranu a přes ni most (sjednocení = vnitřek ohrady bez švů);
   * jeden čtverec = `fenceRect`.
   */
  fenceRects: { minX: number; maxX: number; minZ: number; maxZ: number }[];
  /** Obrys plotu (osy kůlů, rohy ostře) v rovném prostoru – uzavřený mnohoúhelník. */
  outline: Point[];
  /** Všechny čtverce ohrady ve světě – první (přístřešek) a další. */
  squares: PenSquare[];
  /** Natočení ohrady (rad, po 15° – fields.md, Natočené stavby); nenatočená ho nemá. */
  rotation?: number;
}

/** Směr od středu čtverce k cíli (nejbližší obydlí, střed vsi). */
export function penFacing(square: PenSquare, target: { x: number; z: number }): Direction {
  return { x: target.x - square.x, z: target.z - square.z };
}

function unit(d: Direction): Direction {
  const length = Math.hypot(d.x, d.z);
  return length > 1e-9 ? { x: d.x / length, z: d.z / length } : { x: 0, z: -1 };
}

/** Natočení modelu, jehož +z má mířit do `d`. */
function headingOf(d: Direction): number {
  return Math.atan2(d.x, d.z);
}

/** Natočení modelu, jehož osa +x má mířit do `d`. */
function alongX(d: Direction): number {
  return Math.atan2(-d.z, d.x);
}

/**
 * Ohrada na čtverci: branka na straně, kam míří `facing` (ke vsi / nejbližšímu obydlí), posunutá
 * po té straně k cíli – vchod z jádra (`penEntrance`, paths.md – Vchody: pěšina vede k ní);
 * přístřešek v zadním rohu na opačné straně, než kam se `facing` stáčí (při směru přesně podél
 * osy podle čtverce), otevřený dopředu; jesle pod ním u zadní stěny, žlab před přístřeškem podél
 * bočního plotu, stoh vedle přístřešku; dva voli (u žlabu a u jeslí) a kráva, která se pase.
 * Stejný čtverec a směr = stejná ohrada.
 */
export function penLayout(
  square: PenSquare,
  facing: Direction,
  extra: readonly { x: number; z: number }[] = [],
  species?: PenSpecies,
): PenLayout {
  const squares: PenSquare[] = [
    square,
    ...extra.map((q) => ({
      x: q.x,
      z: q.z,
      size: square.size,
      ...(square.rotation !== undefined ? { rotation: square.rotation } : {}),
    })),
  ];
  const gate = penSquaresEntrance(
    squares.map((q, i) => ({ ...q, cell: cellOf(square, q, i) })),
    { x: square.x + facing.x, z: square.z + facing.z },
  );
  if (square.rotation === undefined || !isRotatedSquare(square)) {
    return {
      ...flatPenLayout(square, facing, { x: gate.x, z: gate.z }, squares.slice(1), species),
      squares,
    };
  }
  // natočená ohrada: rozmístění v rovném prostoru, pak otočit do světa
  const turn = turner(square.x, square.z, square.rotation);
  const flat = flatPenLayout(
    { x: square.x, z: square.z, size: square.size },
    turn.toFlatDir(facing),
    turn.toFlat(gate.x, gate.z),
    squares.slice(1).map((q) => ({ ...turn.toFlat(q.x, q.z), size: q.size })),
    species,
  );
  return { ...turnedLayout(flat, square, square.rotation, turn), squares };
}

/**
 * Políčko čtverce ohrady v její mřížce vůči prvnímu čtverci (0, 0) – z polohy středu (natočená
 * ohrada v osách mřížky).
 */
function cellOf(
  first: PenSquare,
  q: { x: number; z: number },
  index: number,
): { x: number; y: number } {
  if (index === 0) return { x: 0, y: 0 };
  const [c, s] = first.rotation === undefined ? [1, 0] : rotationCosSin(first.rotation);
  const dx = q.x - first.x;
  const dz = q.z - first.z;
  return {
    x: Math.round((dx * c - dz * s) / first.size),
    y: Math.round((dx * s + dz * c) / first.size),
  };
}

/** Otáčení kolem středu ohrady – svět ↔ rovný prostor (jako rotation.y v Babylonu). */
interface Turner {
  toWorld(x: number, z: number): { x: number; z: number };
  toFlat(x: number, z: number): { x: number; z: number };
  toWorldDir(d: Direction): Direction;
  toFlatDir(d: Direction): Direction;
}

function turner(cx: number, cz: number, rotation: number): Turner {
  const [c, s] = rotationCosSin(rotation);
  const toWorldDir = (d: Direction): Direction => ({ x: d.x * c + d.z * s, z: -d.x * s + d.z * c });
  const toFlatDir = (d: Direction): Direction => ({ x: d.x * c - d.z * s, z: d.x * s + d.z * c });
  return {
    toWorldDir,
    toFlatDir,
    toWorld: (x, z) => {
      const d = toWorldDir({ x: x - cx, z: z - cz });
      return { x: cx + d.x, z: cz + d.z };
    },
    toFlat: (x, z) => {
      const d = toFlatDir({ x: x - cx, z: z - cz });
      return { x: cx + d.x, z: cz + d.z };
    },
  };
}

/** Rozmístění spočítané v rovném prostoru otočené do světa (natočení dílů + natočení ohrady). */
function turnedLayout(
  flat: PenLayout,
  square: PenSquare,
  rotation: number,
  turn: Turner,
): PenLayout {
  const place = <T extends { x: number; z: number }>(p: T): T => ({
    ...p,
    ...turn.toWorld(p.x, p.z),
  });
  const turnPosition = (p: Position): Position => ({
    ...place(p),
    rotation: p.rotation + rotation,
  });
  const turnSpot = <T extends PenSpot>(spot: T): T => ({
    ...place(spot),
    heading: spot.heading + rotation,
  });
  return {
    ...flat,
    square,
    front: turn.toWorldDir(flat.front),
    side: turn.toWorldDir(flat.side),
    fence: {
      runs: flat.fence.runs.map((run) => ({
        ...run,
        posts: run.posts.map((post) => {
          const out = turn.toWorldDir({ x: post.outX, z: post.outZ });
          return { ...place(post), outX: out.x, outZ: out.z };
        }),
      })),
    },
    gate: turnPosition(flat.gate),
    shelter: turnPosition(flat.shelter),
    hayRack: turnPosition(flat.hayRack),
    trough: turnPosition(flat.trough),
    haystack: turnPosition(flat.haystack),
    props: {
      timber: turnPosition(flat.props.timber),
      rods: turnPosition(flat.props.rods),
      straw: turnPosition(flat.props.straw),
    },
    animals: flat.animals.map(turnSpot),
    spots: flat.spots.map(turnSpot),
    rotation,
  };
}

/** Bod světa v rovném prostoru ohrady (nenatočená ohrada – svět sám). */
export function penToFlat(layout: PenLayout, x: number, z: number): { x: number; z: number } {
  if (layout.rotation === undefined) return { x, z };
  return turner(layout.square.x, layout.square.z, layout.rotation).toFlat(x, z);
}

/** Bod rovného prostoru ohrady ve světě (nenatočená ohrada – svět sám). */
function penToWorld(layout: PenLayout, x: number, z: number): { x: number; z: number } {
  if (layout.rotation === undefined) return { x, z };
  return turner(layout.square.x, layout.square.z, layout.rotation).toWorld(x, z);
}

/**
 * Ohrada v osách krajiny (i rovný prostor natočené ohrady); `gateAt` – střed branky z jádra,
 * `extras` – další čtverce (střed a strana, v témže prostoru).
 */
function flatPenLayout(
  square: PenSquare,
  facing: Direction,
  gateAt: { x: number; z: number },
  extras: readonly { x: number; z: number; size: number }[] = [],
  species?: PenSpecies,
): PenLayout {
  const c = { x: square.x, z: square.z };
  const half = square.size / 2 - PEN_FENCE_INSET_M;
  const f0 = unit(facing);
  const axisFront: Direction =
    Math.abs(f0.x) >= Math.abs(f0.z)
      ? { x: Math.sign(f0.x) || 1, z: 0 }
      : { x: 0, z: Math.sign(f0.z) || 1 };
  const lateral: Direction = { x: -axisFront.z, z: axisFront.x };
  const turn = f0.x * lateral.x + f0.z * lateral.z;
  const sign =
    Math.abs(turn) > 0.05
      ? -Math.sign(turn)
      : hash01(Math.round(square.x * 10), Math.round(square.z * 10), 41) < 0.5
        ? 1
        : -1;
  const all = [{ x: square.x, z: square.z, size: square.size }, ...extras];
  // přístřešek zády a bokem k vnějšímu plotu prvního čtverce (u víc čtverců – oxen.md)
  const { front, side } = shelterAxes(all, f0, axisFront, {
    x: lateral.x * sign,
    z: lateral.z * sign,
  });
  const at = (ahead: number, aside: number): { x: number; z: number } => ({
    x: c.x + front.x * ahead + side.x * aside,
    z: c.z + front.z * ahead + side.z * aside,
  });

  const outline =
    extras.length === 0
      ? ([
          [c.x - half, c.z - half],
          [c.x + half, c.z - half],
          [c.x + half, c.z + half],
          [c.x - half, c.z + half],
        ] as Point[])
      : insetOutline(all, PEN_FENCE_INSET_M);
  const fenceRect = {
    minX: Math.min(...outline.map((p) => p[0])),
    maxX: Math.max(...outline.map((p) => p[0])),
    minZ: Math.min(...outline.map((p) => p[1])),
    maxZ: Math.max(...outline.map((p) => p[1])),
  };
  const fenceRects = extras.length === 0 ? [fenceRect] : innerRects(all, PEN_FENCE_INSET_M);
  const fenceStyle = penFenceStyle(species);
  const fence = wovenFence([{ points: outline, closed: true }], fenceStyle, { toward: gateAt });
  const run = fence.runs[0]!.posts;
  const a = run[0]!;
  const b = run[run.length - 1]!;
  const gate: Position = {
    x: (a.x + b.x) / 2,
    z: (a.z + b.z) / 2,
    rotation: alongX({ x: b.x - a.x, z: b.z - a.z }),
  };

  const facingRotation = headingOf(front);
  const shelterBack = half - SHELTER_GAP_M.back - SHELTER_M.back;
  const shelterAside = half - SHELTER_GAP_M.side - SHELTER_M.halfLength;
  const shelter = { ...at(-shelterBack, shelterAside), rotation: facingRotation };
  const hayRack = {
    ...at(-shelterBack - RACK_OFFSET_M.back, shelterAside - RACK_OFFSET_M.inward),
    rotation: facingRotation,
  };
  const troughAhead = -shelterBack + SHELTER_M.front + TROUGH_M.ahead + TROUGH_M.halfLength;
  const troughAside = half - TROUGH_M.sideGap - TROUGH_M.halfWidth;
  const trough = { ...at(troughAhead, troughAside), rotation: alongX(front) };
  const haystack = {
    ...at(-half + 1.6, shelterAside - SHELTER_M.halfLength - 1.5),
    rotation: hash01(Math.round(square.x), Math.round(square.z), 43) * Math.PI * 2,
  };
  // rekvizity staveniště uprostřed ohrady (kde nic nestojí), žerdě podél boku
  const props: Record<PenProp, Position> = {
    timber: { ...at(-0.5, -1.5), rotation: facingRotation + Math.PI / 2 },
    rods: { ...at(1.6, 1.4), rotation: facingRotation + 0.2 },
    straw: { ...at(0.3, -0.3), rotation: facingRotation - 0.3 },
  };

  const seed = Math.round(square.x * 7 + square.z * 13);
  // vůl pije u žlabu (hlava nad žlabem), druhý žere z jeslí, kráva se pase v otevřené části
  const drink = at(troughAhead + 0.3, troughAside - 1.5);
  const hay = at(-shelterBack + 0.9, shelterAside - RACK_OFFSET_M.inward);
  const graze = at(1.2, -2.6);
  const allSpots: PenSpot[] = [
    { ...drink, heading: headingOf(side), activity: 'drink', seed: seed + 1 },
    { ...hay, heading: headingOf({ x: -front.x, z: -front.z }), activity: 'hay', seed: seed + 2 },
    {
      ...graze,
      heading: facingRotation + 2.2 + hash01(seed, 3, 44),
      activity: 'graze',
      seed: seed + 3,
    },
    // další místa v otevřené části ohrady (mimo přístřešek, žlab, stoh a branku) – po ≥ 2,5 m
    ...EXTRA_SPOTS.map(([ahead, aside], k) => ({
      ...at(ahead, aside),
      heading: hash01(seed, k + 10, 45) * Math.PI * 2,
      activity: 'graze' as const,
      seed: seed + 4 + k,
    })),
  ];
  // místa v dalších čtvercích ohrady – mřížka 3 × 3 s odchylkou podle polohy
  extras.forEach((q, k) => {
    const qSeed = Math.round(q.x * 7 + q.z * 13);
    for (let i = 0; i < EXTRA_SQUARE_SPOTS.length; i++) {
      const [ox, oz] = EXTRA_SQUARE_SPOTS[i]!;
      allSpots.push({
        x: q.x + ox + (hash01(qSeed, i, 46) - 0.5) * 1.6,
        z: q.z + oz + (hash01(qSeed, i, 48) - 0.5) * 1.6,
        heading: hash01(qSeed, i + 10, 45) * Math.PI * 2,
        activity: 'graze',
        seed: seed + 100 * (k + 1) + i,
      });
    }
  });
  const spots = species === 'horse' ? allSpots.filter(horseSpotKept) : allSpots;
  const animals = penAnimalsFor(
    { spots },
    species === 'horse'
      ? { oxen: 0, trainees: 0, cows: 0, horses: ['mare', 'foal'] }
      : { oxen: 2, trainees: 0, cows: 1 },
  );
  return {
    square,
    squares: [square],
    outline,
    fenceRects,
    front,
    side,
    fence,
    fenceStyle,
    gate,
    shelter,
    hayRack,
    trough,
    haystack,
    props,
    animals,
    spots,
    fenceRect,
  };
}

/**
 * Místa ohrady koní: 4 na čtverec (horses.md – 4 koně na hotový čtverec). V prvním čtverci
 * u žlabu, u jeslí, na pastvě a jedno v otevřené části; v dalších čtvercích ve čtyřech rozích
 * mřížky 3 × 3.
 */
const HORSE_SQUARE_SPOTS = new Set([0, 2, 6, 8]);
function horseSpotKept(_: PenSpot, index: number): boolean {
  if (index < 4) return true;
  if (index < 3 + EXTRA_SPOTS.length) return false;
  return HORSE_SQUARE_SPOTS.has((index - 3 - EXTRA_SPOTS.length) % EXTRA_SQUARE_SPOTS.length);
}

/** Místa pro zvířata v dalších čtvercích ohrady (m od středu čtverce, po 4 m). */
const EXTRA_SQUARE_SPOTS: readonly (readonly [number, number])[] = [
  [-4, -4],
  [0, -4],
  [4, -4],
  [-4, 0],
  [0, 0],
  [4, 0],
  [-4, 4],
  [0, 4],
  [4, 4],
];

/** Je u čtverce se středem (x, z) soused ve směru `d` (o stranu dál)? */
function hasNeighbour(
  squares: readonly { x: number; z: number; size: number }[],
  q: { x: number; z: number; size: number },
  d: Direction,
): boolean {
  const nx = q.x + d.x * q.size;
  const nz = q.z + d.z * q.size;
  return squares.some((o) => Math.abs(o.x - nx) < 0.01 && Math.abs(o.z - nz) < 0.01);
}

/**
 * Natočení přístřešku v prvním čtverci (oxen.md – Ohrady podle druhu): přední strana ke vsi
 * a bok od směru ke vsi jako u jednoho čtverce (`front`, `side`); když by za přístřeškem nebo vedle
 * něj byl další čtverec (přístřešek by stál uprostřed ohrady), zkusí další směry – nejblíž ke vsi
 * první – tak, aby záda i bok přístřešku byly u vnějšího plotu.
 */
function shelterAxes(
  squares: readonly { x: number; z: number; size: number }[],
  f0: Direction,
  front: Direction,
  side: Direction,
): { front: Direction; side: Direction } {
  const first = squares[0]!;
  if (squares.length === 1) return { front, side };
  const ok = (f: Direction, s: Direction): boolean =>
    !hasNeighbour(squares, first, { x: -f.x, z: -f.z }) && !hasNeighbour(squares, first, s);
  if (ok(front, side)) return { front, side };
  const axes: Direction[] = [
    { x: 1, z: 0 },
    { x: -1, z: 0 },
    { x: 0, z: 1 },
    { x: 0, z: -1 },
  ];
  const ranked = [...axes].sort((a, b) => b.x * f0.x + b.z * f0.z - (a.x * f0.x + a.z * f0.z));
  for (const f of ranked) {
    const left: Direction = { x: -f.z, z: f.x };
    for (const s of [left, { x: -left.x, z: -left.z }]) {
      if (ok(f, s)) return { front: f, side: s };
    }
  }
  return { front, side };
}

/**
 * Obrys plotu po čtvercích odsazený `inset` dovnitř (proti směru hodinových ručiček, ohrazení
 * vlevo – jak chce woven-fence.ts): strany čtverců bez souseda spojené za sebou, rovné úseky
 * sloučené, vrcholy posunuté dovnitř o `inset` od obou stran (vnější i vnitřní roh).
 */
function insetOutline(
  squares: readonly { x: number; z: number; size: number }[],
  inset: number,
): Point[] {
  const sides: [Point, Point][] = [];
  const dirs: Direction[] = [
    { x: 0, z: -1 },
    { x: 1, z: 0 },
    { x: 0, z: 1 },
    { x: -1, z: 0 },
  ];
  for (const q of squares) {
    const h = q.size / 2;
    const c: Point[] = [
      [q.x - h, q.z - h],
      [q.x + h, q.z - h],
      [q.x + h, q.z + h],
      [q.x - h, q.z + h],
    ];
    dirs.forEach((d, k) => {
      if (!hasNeighbour(squares, q, d)) sides.push([c[k]!, c[(k + 1) % 4]!]);
    });
  }
  const same = (a: Point, b: Point): boolean =>
    Math.abs(a[0] - b[0]) < 1e-3 && Math.abs(a[1] - b[1]) < 1e-3;
  const loop: Point[] = [sides[0]![0]];
  let current = sides[0]!;
  const used = new Set<number>([0]);
  while (loop.length <= sides.length) {
    const end = current[1];
    if (same(end, loop[0]!)) break;
    loop.push(end);
    const next = sides.findIndex((side, i) => !used.has(i) && same(side[0], end));
    if (next < 0) break;
    used.add(next);
    current = sides[next]!;
  }
  // rovné úseky jedním kusem
  const corners = loop.filter((p, i) => {
    const a = loop[(i - 1 + loop.length) % loop.length]!;
    const b = loop[(i + 1) % loop.length]!;
    return Math.abs((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) > 1e-6;
  });
  return corners.map((p, i) => {
    const a = corners[(i - 1 + corners.length) % corners.length]!;
    const b = corners[(i + 1) % corners.length]!;
    const d1 = unit({ x: p[0] - a[0], z: p[1] - a[1] });
    const d2 = unit({ x: b[0] - p[0], z: b[1] - p[1] });
    // dovnitř = vlevo od směru obou stran
    return [p[0] + inset * (-d1.z - d2.z), p[1] + inset * (d1.x + d2.x)];
  });
}

/**
 * Vnitřek ohrady po čtvercích (rovný prostor): každý čtverec u vnějšího plotu po osu kůlů,
 * k sousednímu čtverci až po společnou stranu, a přes každou společnou stranu „most“ od středu ke
 * středu (u plotu po osu kůlů) – sjednocení je vnitřek bez švů a bez rohu, který k ohradě nepatří.
 */
function innerRects(
  squares: readonly { x: number; z: number; size: number }[],
  inset: number,
): { minX: number; maxX: number; minZ: number; maxZ: number }[] {
  const rects: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
  for (const q of squares) {
    const h = q.size / 2;
    const reach = (d: Direction): number => (hasNeighbour(squares, q, d) ? h : h - inset);
    rects.push({
      minX: q.x - reach({ x: -1, z: 0 }),
      maxX: q.x + reach({ x: 1, z: 0 }),
      minZ: q.z - reach({ x: 0, z: -1 }),
      maxZ: q.z + reach({ x: 0, z: 1 }),
    });
    // most k sousedovi vpravo a nahoře (každá společná strana jednou)
    if (hasNeighbour(squares, q, { x: 1, z: 0 })) {
      rects.push({ minX: q.x, maxX: q.x + q.size, minZ: q.z - h + inset, maxZ: q.z + h - inset });
    }
    if (hasNeighbour(squares, q, { x: 0, z: 1 })) {
      rects.push({ minX: q.x - h + inset, maxX: q.x + h - inset, minZ: q.z, maxZ: q.z + q.size });
    }
  }
  return rects;
}

/**
 * Další místa pro zvířata (vpřed ke brance, stranou k přístřešku – m od středu ohrady): otevřená
 * část ohrady, kde nestojí přístřešek, žlab, stoh ani branka.
 */
const EXTRA_SPOTS: readonly (readonly [number, number])[] = [
  [-1.8, -3.8],
  [3.2, -0.8],
  [-3.4, -1.2],
  [3.6, -4.4],
  [0.4, -4.7],
  [-4.6, -4.2],
  [4.6, 2.2],
  [1.6, 2.6],
  [-1.0, 1.0],
];

/**
 * Skutečná zvířata ohrady na její místa (oxen.md): nejdřív voli spřežení (u žlabu a jeslí), pak
 * telata ve výcviku (menší voli), pak krávy (v zimě), ovce, kozy a prasata (na noc – oxen.md, Na
 * noc v ohradě) – kolik se jich vejde na místa ohrady (ve všech jejích čtvercích).
 */
export function penAnimalsFor(layout: Pick<PenLayout, 'spots'>, herd: PenHerd): PenAnimal[] {
  if (herd.horses) return horseAnimalsFor(layout.spots, herd.horses);
  const many = (n: number | undefined, kind: PenAnimalKind): { kind: PenAnimalKind }[] =>
    Array.from({ length: Math.max(0, Math.floor(n ?? 0)) }, () => ({ kind }));
  const kinds: { kind: PenAnimalKind; scale?: number }[] = [
    ...many(herd.oxen, 'ox'),
    ...Array.from({ length: Math.max(0, herd.trainees) }, () => ({
      kind: 'ox' as const,
      scale: TRAINEE_SCALE,
    })),
    ...many(herd.cows, 'cow'),
    // na noc v ohradě svého druhu (oxen.md – Na noc v ohradě)
    ...many(herd.sheep, 'sheep'),
    ...many(herd.goats, 'goat'),
    ...many(herd.pigs, 'pig'),
  ];
  return kinds.slice(0, layout.spots.length).map((animal, i) => ({
    ...layout.spots[i]!,
    kind: animal.kind,
    ...(animal.scale === undefined ? {} : { scale: animal.scale }),
  }));
}

/** Odstup hříběte od klisny (m) – stojí vedle ní, ne uvnitř. */
const FOAL_OFFSET_M = 1.35;

/**
 * Koně ohrady koní na její místa: klisny a jezdečtí koně po jednom na místo (v pořadí místa:
 * žlab, jesle, pastva…), hříbata bez vlastního místa vedle klisen (po jednom na klisnu, další
 * střídavě; bez dospělého koně vedle prvního místa). Víc koní než míst se nevejde.
 */
function horseAnimalsFor(spots: readonly PenSpot[], horses: readonly HorseKind[]): PenAnimal[] {
  const adults = horses
    .filter((h) => h !== 'foal')
    .slice(0, spots.length)
    .map((_, i) => ({ ...spots[i]!, kind: 'horse' as const }));
  const foalCount = horses.filter((h) => h === 'foal').length;
  // klisny napřed – hříbata patří k nim; bez klisny ke kterémukoli koni
  const mares = horses.filter((h) => h !== 'foal').flatMap((h, i) => (h === 'mare' ? [i] : []));
  const hosts = (mares.length > 0 ? mares : adults.map((_, i) => i)).filter(
    (i) => i < adults.length,
  );
  const foals: PenAnimal[] = [];
  for (let f = 0; f < foalCount; f++) {
    const host = hosts.length > 0 ? adults[hosts[f % hosts.length]!]! : null;
    const base = host ?? spots[0];
    if (!base) break;
    const side = f >= hosts.length && hosts.length > 0 ? -1 : 1;
    foals.push({
      ...base,
      kind: 'foal',
      x: base.x + Math.cos(base.heading) * FOAL_OFFSET_M * side,
      z: base.z - Math.sin(base.heading) * FOAL_OFFSET_M * side,
      heading: base.heading + 0.4 * side,
      seed: base.seed + 500 + f,
    });
  }
  return [...adults, ...foals];
}

/** Hotové díly v pen.glb (tools/blender/pen.py). */
export const PEN_MODEL_PARTS = ['shelter', 'hay-rack', 'trough', 'gate'] as const;

/**
 * Kde stojí díl ohrady – hotový z pen.glb i díl staveniště z pen-construction.glb (bez
 * předpony „ohrada-“): díly přístřešku u přístřešku, jesle a seno u jeslí, kmen a žlab u žlabu,
 * branka v mezeře plotu, rekvizity na svém místě.
 */
export function penPartPlace(layout: PenLayout, part: string): Position {
  if (part === 'hay-rack' || part === 'rack' || part === 'hay') return layout.hayRack;
  if (part === 'trough' || part === 'trough-log') return layout.trough;
  if (part === 'gate') return layout.gate;
  if (part === 'timber' || part === 'rods' || part === 'straw') return layout.props[part];
  return layout.shelter;
}

/** Bod uvnitř ohrady (s okrajem `margin` od os kůlů, m)? Ohrada o víc čtvercích po čtvercích. */
export function insidePen(layout: PenLayout, wx: number, wz: number, margin = 0): boolean {
  const { x, z } = penToFlat(layout, wx, wz);
  return layout.fenceRects.some(
    (r) => x > r.minX + margin && x < r.maxX - margin && z > r.minZ + margin && z < r.maxZ - margin,
  );
}

/**
 * Vyšlapané bláto uvnitř ohrady 0–1: všude ušlapaná zem ve skvrnách, souvislé bláto u žlabu,
 * v brance a před přístřeškem; k plotu měkce ubývá (plot má zakulacené rohy).
 */
export function penMudAt(layout: PenLayout, x: number, z: number): number {
  // vzdálenost od plotu v rovném prostoru (natočená ohrada), skvrny a místa ve světě; ohrada
  // o víc čtvercích – nejhlouběji v některém z obdélníků vnitřku (přes vnitřní hrany bez švů)
  const flat = penToFlat(layout, x, z);
  const corner = WOVEN_CORNER_RADIUS_M;
  let inside = -Infinity;
  for (const r of layout.fenceRects) {
    const edge = Math.min(flat.x - r.minX, r.maxX - flat.x, flat.z - r.minZ, r.maxZ - flat.z);
    // zakulacené rohy: vzdálenost od oblouku rohu (uprostřed stran rozhoduje `edge`)
    const cx = Math.min(Math.max(flat.x, r.minX + corner), r.maxX - corner);
    const cz = Math.min(Math.max(flat.z, r.minZ + corner), r.maxZ - corner);
    const round = corner - Math.hypot(flat.x - cx, flat.z - cz);
    inside = Math.max(inside, Math.min(edge, round));
  }
  if (inside <= 0) return 0;
  const near = (p: { x: number; z: number }, radius: number): number =>
    1 - smoothstep(radius * 0.4, radius, Math.hypot(x - p.x, z - p.z));
  const shelterFront = {
    x: layout.shelter.x + Math.sin(layout.shelter.rotation) * SHELTER_M.front,
    z: layout.shelter.z + Math.cos(layout.shelter.rotation) * SHELTER_M.front,
  };
  const spots = Math.max(
    near(layout.trough, 3.2),
    near(layout.gate, 3.4),
    near(shelterFront, 3.6),
    near(layout.shelter, 2.6),
  );
  // skvrny ušlapané země – hladký šum po ≈ 2,5 m (deterministický podle polohy)
  const trampled = 0.4 + 0.45 * noise2(x / 2.5, z / 2.5);
  return smoothstep(0, 0.9, inside) * Math.min(1, Math.max(trampled, spots));
}

/** Hladký 2D šum 0–1 (hodnoty v celých číslech mřížky, mezi nimi plynule). */
function noise2(x: number, z: number): number {
  const i = Math.floor(x);
  const j = Math.floor(z);
  const sx = smoothstep(0, 1, x - i);
  const sz = smoothstep(0, 1, z - j);
  const h = (a: number, b: number): number => hash01(a, b, 47);
  const top = h(i, j) + (h(i + 1, j) - h(i, j)) * sx;
  const bottom = h(i, j + 1) + (h(i + 1, j + 1) - h(i, j + 1)) * sx;
  return top + (bottom - top) * sz;
}

/** Obrys plochy bláta (uvnitř plotu, u natočené ohrady obdélník kolem ní) – mřížka obtisku. */
export function penMudBounds(layout: PenLayout): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  if (layout.rotation === undefined) return { ...layout.fenceRect };
  const corners = penStakingLine(layout);
  return {
    minX: Math.min(...corners.map((p) => p[0])),
    maxX: Math.max(...corners.map((p) => p[0])),
    minZ: Math.min(...corners.map((p) => p[1])),
    maxZ: Math.max(...corners.map((p) => p[1])),
  };
}

/**
 * Vytyčení ohrady při zadání stavby: kolíky a provázek po obrysu budoucího plotu (rohy
 * vytyčení zakulacené být nemusí; natočená ohrada natočeně). Uzavřená čára (první bod i na konci).
 */
export function penStakingLine(layout: PenLayout): Point[] {
  const corners: Point[] = [...layout.outline, layout.outline[0]!];
  if (layout.rotation === undefined) return corners;
  return corners.map(([x, z]): Point => {
    const p = penToWorld(layout, x, z);
    return [p.x, p.z];
  });
}

// --- Fáze stavby ---------------------------------------------------------------------------

export type PenPhaseId = 'layout' | 'posts' | 'weave' | 'frame' | 'wall' | 'thatch' | 'finish';

export interface PenPhase {
  id: PenPhaseId;
  /** Popis pro vývojovou lištu (česky). */
  label: string;
  from: number;
  to: number;
}

/** Fáze stavby ohrady (průběh 0–1, navazují na sebe). */
export const PEN_PHASES: readonly PenPhase[] = [
  { id: 'layout', label: 'vytyčení – kolíky a provázek', from: 0, to: 0.06 },
  { id: 'posts', label: 'kůly plotu po obvodu', from: 0.06, to: 0.26 },
  { id: 'weave', label: 'proplétání větví a branka ze žerdí', from: 0.26, to: 0.46 },
  { id: 'frame', label: 'přístřešek – sloupy, vaznice a krokve', from: 0.46, to: 0.6 },
  { id: 'wall', label: 'latě a pletená zadní stěna', from: 0.6, to: 0.68 },
  { id: 'thatch', label: 'došky po řadách zdola nahoru', from: 0.68, to: 0.88 },
  { id: 'finish', label: 'svázaný okraj, žlab, jesle a stoh sena', from: 0.88, to: 1 },
];

/** Řad došků přístřešku (tools/blender/pen.py – pultová střecha z atlasu obydlí). */
export const PEN_THATCH_COURSES = 9;
const PEN_RAFTERS = 5;

function phase(id: PenPhaseId): PenPhase {
  return PEN_PHASES.find((p) => p.id === id)!;
}

function ramp(p: number, from: number, to: number): number {
  return Math.min(1, Math.max(0, (p - from) / (to - from)));
}

/** Fáze podle průběhu (poslední zahrnuje i 1). */
export function penPhase(progress: number): PenPhase {
  const p = Math.min(1, Math.max(0, progress));
  return PEN_PHASES.find((ph) => p < ph.to) ?? PEN_PHASES[PEN_PHASES.length - 1]!;
}

interface PartRule {
  part: string;
  from: number;
  to?: number;
}

/** Kdy se který díl přístřešku, jeslí, žlabu a branky objeví (díly „ohrada-…“ bez předpony). */
export function penPartSchedule(): PartRule[] {
  const within = (id: PenPhaseId, t: number): number => {
    const ph = phase(id);
    return ph.from + (ph.to - ph.from) * t;
  };
  const series = (name: string, count: number, id: PenPhaseId, a: number, b: number): PartRule[] =>
    Array.from({ length: count }, (_, k) => ({
      part: `${name}-${k + 1}`,
      from: within(id, a + ((b - a) * k) / Math.max(1, count - 1)),
    }));
  return [
    { part: 'gate', from: within('weave', 0.9) },
    { part: 'posts', from: within('frame', 0.05) },
    { part: 'plates', from: within('frame', 0.35) },
    ...series('rafters', PEN_RAFTERS, 'frame', 0.5, 0.95),
    { part: 'laths', from: within('wall', 0.05) },
    { part: 'wattle-1', from: within('wall', 0.35) },
    { part: 'wattle-2', from: within('wall', 0.7) },
    ...series('thatch', PEN_THATCH_COURSES, 'thatch', 0.04, 0.92),
    { part: 'binding', from: within('finish', 0.04) },
    { part: 'trough-log', from: within('finish', 0.12), to: within('finish', 0.4) },
    { part: 'trough', from: within('finish', 0.4) },
    { part: 'rack', from: within('finish', 0.55) },
    { part: 'hay', from: within('finish', 0.75) },
  ];
}

/** Všechny díly staveniště ohrady (jména v pen-construction.glb bez předpony „ohrada-“). */
export function penConstructionParts(): string[] {
  return penPartSchedule().map((rule) => rule.part);
}

/** Co z ohrady stojí při průběhu stavby. */
export interface PenStage {
  phase: PenPhase;
  /** Hotová ohrada (průběh 1): díly z pen.glb, zvířata, bláto. */
  built: boolean;
  /** Kolíky a provázek vytyčení (do zatlučení posledního kůlu plotu). */
  staking: boolean;
  /** Plot – podíl zatlučených kůlů a upletených větví (zdola nahoru). */
  fence: { posts: number; rails: number };
  /** Díly z pen-construction.glb (bez předpony), které stojí. */
  parts: string[];
  /** Rekvizity a jejich velikost (hráň ubývá s kůly a sloupy, pruty s výpletem…). */
  props: { prop: PenProp; scale: number }[];
  /** Velikost stohu sena 0–1 (0 = žádný). */
  haystack: number;
  /** Krytí obtisku ušlapané země / bláta 0–1. */
  mud: number;
}

/**
 * Velikost stohu podle stupně zásoby sena 0–3 (`PenView.hay` – podíl plného stohu; návrh Clauda):
 * po svozu roste, přes zimu ubývá, bez sena stoh není.
 */
export const HAYSTACK_SIZES = [0, 0.5, 0.75, 1] as const;

/** Podíl plného stohu ohrady pro stupeň zásoby sena (bez údaje plný). */
export function haystackSize(hay: number | undefined): number {
  if (hay === undefined) return 1;
  return HAYSTACK_SIZES[Math.max(0, Math.min(3, Math.round(hay)))]!;
}

/** Ohrada při průběhu stavby `progress` (0–1). */
export function penStage(progress: number): PenStage {
  const p = Math.min(1, Math.max(0, progress));
  const posts = phase('posts');
  const weave = phase('weave');
  const frame = phase('frame');
  const wall = phase('wall');
  const thatch = phase('thatch');
  const finish = phase('finish');
  const parts = penPartSchedule()
    .filter((rule) => p >= rule.from && (rule.to === undefined || p < rule.to))
    .map((rule) => rule.part);
  const props: { prop: PenProp; scale: number }[] = [];
  const add = (prop: PenProp, visible: boolean, scale: number): void => {
    if (visible && scale > 0) props.push({ prop, scale });
  };
  add('timber', p >= phase('layout').to && p < frame.to, 1 - 0.65 * ramp(p, posts.from, frame.to));
  add('rods', p >= posts.to - 0.02 && p < wall.to, 1 - 0.6 * ramp(p, weave.from, wall.to));
  add('straw', p >= wall.from && p < thatch.to, 1 - 0.7 * ramp(p, thatch.from, thatch.to));
  const stackFrom = finish.from + (finish.to - finish.from) * 0.85;
  return {
    phase: penPhase(p),
    built: p >= 1,
    staking: p < posts.to,
    fence: { posts: ramp(p, posts.from, posts.to), rails: ramp(p, weave.from, weave.to - 0.02) },
    parts,
    props,
    haystack: p >= 1 ? 1 : p >= stackFrom ? 0.4 + 0.6 * ramp(p, stackFrom, 1) : 0,
    mud: p >= 1 ? 1 : 0.35 * ramp(p, 0.01, posts.to),
  };
}

/** Plot ohrady při průběhu stavby (kůly, pak větve zdola nahoru). */
export function penFenceStage(layout: PenLayout, stage: PenStage): FenceStage {
  return fenceStage(layout.fence, layout.fenceStyle, stage.fence);
}

// --- Zvířata (jen ozdoba) ------------------------------------------------------------------

/** Okamžitý stav zvířete v ohradě. */
export interface PenAnimalPose {
  x: number;
  z: number;
  /** Natočení (rad, jako model – +z míří do (sin, cos)). */
  heading: number;
  /** Hlava 0 = nahoře, 1 = dole (pije, žere, pase se) – jen kráva, vůl má klip idle. */
  head: number;
}

/**
 * Zvíře v ohradě v okamžiku `seconds` (skutečný čas): stojí na svém místě, pomalu se natáčí
 * (±0,3 rad během desítek sekund – stojící zvíře nekráčí, tak se ani nesune) a hlavu sklání
 * k vodě, senu nebo trávě a zase zvedá. Stejný okamžik = stejná póza.
 */
export function penAnimalPose(animal: PenAnimal, seconds: number): PenAnimalPose {
  const turn = 0.3 * valueNoise(animal.seed, seconds / 23, 0);
  const lift = valueNoise(animal.seed, seconds / 9, 1);
  const down = animal.activity === 'graze' ? 0.75 : 0.55;
  return {
    x: animal.x,
    z: animal.z,
    heading: animal.heading + turn,
    head: Math.min(1, Math.max(0, down - 0.6 * Math.max(0, lift))),
  };
}
