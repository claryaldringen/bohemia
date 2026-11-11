import {
  crossingLayers,
  gatePartAt,
  gatePartView,
  gatePincerStands,
  gateTowerStands,
  hasGateParts,
  pincerArmKind,
  layerBuilt,
  pincerBandInM,
  segmentRampart,
  segmentWall,
  wallLineInM,
} from '../village/fortification';
import type { FortSegmentShape } from '../village/fortification';
import { FORTIFICATIONS } from '../village/rules/rules-fortifications';
import type { WallKind } from '../village/types';
import type { BattleBreakout, BattleFort, BattleState, Fighter } from './battle';
import { onLadder, outward } from './ladders';
import type { Pos } from './march-grid';
import { canAttack, dist2, nearest, returnTo, type FighterPlan, type PlanContext } from './orders';
import { WAR } from './rules-war';
import { TICKS_PER_SECOND } from './ticks';

// Obránci na hradbě (fortifications.md – Obrana bez násobku 2, 3, 6; Střelba a viditelná plocha;
// Martin 8. 11. 2026): když ves spatří vojsko, muži v opevnění obsadí napřed brány (po 2), pak
// rovnoměrně obvod – jeden obránce brání ≈ 5 m; neobsazený úsek je jen překážka. Obránce pak jde
// k nejbližšímu žebříku nebo místu prolamování, kde je obránců míň než útočníků – za hradbou plným
// tempem, po ochozu polovičním. Kdo koho přes hradbu zasáhne, určuje druh hradby (plot z obou
// stran, palisáda bez ochozu nikdo, z ochozu a koruny dolů ano, zespodu jen střela na kryté).
// Z ochozu se hází do 15 m. Bitva (`battle.ts`) jen volá; jen det-math.

const D = FORTIFICATIONS.defense;
/** Obránce brání 2,5 m na každou stranu (polovina 5 m obsazení). */
const REACH_M = D.perDefenderM / 2;
/** Kdo stojí víc než půl metru před čarou hradby, je venku – úsek neobsazuje. */
const OUTSIDE_M = 0.5;
/** Stanoviště leží na hradbě, je-li do tolika metrů od čáry víc než `postInsideM`. */
const POST_SLACK_M = 0.25;
/** Cesta vede po ochozu, leží-li její střed do tolika metrů od čáry hradby; jinak přes nádvoří. */
const ALONG_M = 2;

/** Rána podle vzdálenosti: zblízka (i kameny k patě), luk, hod z ochozu. */
export type StrikeKind = 'melee' | 'bow' | 'throw';

/** Hradba s korunou, na které se stojí – palisáda s ochozem, roštová a komorová hradba. */
export function hasCrown(kind: WallKind | null): boolean {
  return kind === 'walkway' || kind === 'crib' || kind === 'chamber';
}

/**
 * Stojící hradba v místě `alongM` m od začátku čáry úseku `segment` (díl s branou podle kusu
 * u polohy – `gatePartAt`), nebo null (mezera, průlom, nedostavěná, holý val).
 */
export function wallKindAt(
  bf: BattleFort,
  segment: number,
  alongM: number,
  day: number,
): WallKind | null {
  const seg = bf.fort.segments.find((s) => s.index === segment);
  if (!seg) return null;
  const gate = bf.fort.gates.find((g) => g.segment === segment);
  const view =
    gate && hasGateParts(seg) ? gatePartView(seg, gatePartAt(gate.offsetM, alongM)) : seg;
  return crossingLayers(bf.fort, view, day, false).wall?.kind ?? null;
}

// --- Klešťová brána a věž (plán hradeb Ú19) -----------------------------------------------------

/**
 * Klešťová brána na bojišti (fortifications.md – Hradby a obrana, Brány): osa brány na čáře úseku
 * (bitva bere úsek jako úsečku – `battle.ts`), ulička `alleyWidthM` mezi rameny od čáry hradby po
 * vrata `endM` m dovnitř (vnitřní okraj pásu + `alleyLengthM`), ramena s ochozem široká jako pás
 * palisády s ochozem. Návrh Clauda: ramena stojí, dokud stojí díl s branou, i prolomený (vlastní
 * stěny s ochozem); zbořený či zchátralý díl je vezme s sebou.
 */
export interface BattlePincer {
  segment: number;
  /** Střed brány na čáře úseku. */
  mx: number;
  mz: number;
  /** Jednotkový směr podél čáry úseku a dovnitř opevnění. */
  ux: number;
  uz: number;
  nx: number;
  nz: number;
  /** Vrata na vnitřním konci uličky – m od čáry hradby. */
  endM: number;
  /** Druh ramen (`pincerArmKind`) – vždy s ochozem. */
  kind: WallKind;
  /** Stojí věž nad vraty (`gateTowerStands`). */
  tower: boolean;
}

const pincerCache = new WeakMap<BattleFort, { day: number; list: BattlePincer[] }>();

/** Stojící klešťové brány opevnění ke dni `day` (jednou za den a opevnění bojiště). */
export function battlePincers(bf: BattleFort, day: number): BattlePincer[] {
  const cached = pincerCache.get(bf);
  if (cached && cached.day === day) return cached.list;
  const list: BattlePincer[] = [];
  for (const gate of bf.fort.gates) {
    if (!gatePincerStands(gate, day)) continue;
    const shape = bf.shapes.find((s) => s.index === gate.segment);
    const seg = bf.fort.segments.find((s) => s.index === gate.segment);
    const band = pincerBandInM(bf.fort, gate.segment);
    if (!shape || !seg || band === null) continue;
    const l = shape.line;
    const t = Math.min(l.length, Math.max(0, gate.offsetM));
    const n = outward(bf, l);
    list.push({
      segment: gate.segment,
      mx: l.x + l.dx * t,
      mz: l.z + l.dz * t,
      ux: l.dx,
      uz: l.dz,
      nx: -n.x,
      nz: -n.z,
      // pás od křivky, čára úseku na bojišti je čára hradby (u valu na křivce koruna valu)
      endM: band - wallLineInM(bf.fort) + FORTIFICATIONS.pincerGate.alleyLengthM,
      kind: pincerArmKind(segmentWall(bf.fort, seg)?.kind ?? 'palisade'),
      tower: gateTowerStands(gate, day),
    });
  }
  pincerCache.set(bf, { day, list });
  return list;
}

/** Bod `along` m podél brány a `inM` m dovnitř od čáry hradby. */
export function pincerPoint(p: BattlePincer, along: number, inM: number): Pos {
  return { x: p.mx + p.ux * along + p.nx * inM, z: p.mz + p.uz * along + p.nz * inM };
}

/** Souřadnice bodu v ose brány: podél a dovnitř (m). */
function pincerLocal(p: BattlePincer, at: Pos): { along: number; inM: number } {
  const dx = at.x - p.mx;
  const dz = at.z - p.mz;
  return { along: dx * p.ux + dz * p.uz, inM: dx * p.nx + dz * p.nz };
}

const ALLEY_HALF_M = FORTIFICATIONS.pincerGate.alleyWidthM / 2;
const ARM_M = FORTIFICATIONS.bandM.walkway;
/** Plošina věže nad vraty sahá od vrat tolik metrů dovnitř (stanoviště 1 m za vraty). */
const TOWER_DEPTH_M = D.postInsideM + POST_SLACK_M;

/** Stojí bod na rameni klešťové brány (na ochozu)? */
function onArm(p: BattlePincer, at: Pos): boolean {
  const { along, inM } = pincerLocal(p, at);
  const side = Math.abs(along);
  return side >= ALLEY_HALF_M && side <= ALLEY_HALF_M + ARM_M && inM >= 0 && inM <= p.endM;
}

/** Stojí bod na věži nad vraty? */
function onTower(p: BattlePincer, at: Pos): boolean {
  if (!p.tower) return false;
  const { along, inM } = pincerLocal(p, at);
  return Math.abs(along) <= ALLEY_HALF_M && inM >= p.endM && inM <= p.endM + TOWER_DEPTH_M;
}

/** Leží bod v uličce klešťové brány (mezi rameny, před vraty)? */
function inAlley(p: BattlePincer, at: Pos): boolean {
  const { along, inM } = pincerLocal(p, at);
  return Math.abs(along) < ALLEY_HALF_M && inM >= 0 && inM < p.endM;
}

/** Stojí bod `at` na věži nad branou některého opevnění? */
export function towerAt(forts: readonly BattleFort[], at: Pos, day: number): boolean {
  for (const bf of forts) {
    for (const p of battlePincers(bf, day)) if (onTower(p, at)) return true;
  }
  return false;
}

/**
 * Dohled a dostřel muže (fortifications.md – Hradby a obrana, Brány; návrh Clauda): obránce na
 * ochozu věže nad branou vidí `tower.sightM` (250 m) a lukem dostřelí `tower.bowMaxM` (80 m),
 * jinak dohled v otevřené krajině `WAR.sight.openM` a luk `WAR.combat.bowMaxM`.
 */
export function towerReach(
  f: Fighter,
  field: { readonly forts: readonly BattleFort[]; readonly day: number },
): { sightM: number; bowMaxM: number } {
  if (f.side === 'defend' && f.onWall && towerAt(field.forts, f.pos, field.day)) {
    return { sightM: FORTIFICATIONS.tower.sightM, bowMaxM: FORTIFICATIONS.tower.bowMaxM };
  }
  if (f.side === 'defend' && crestAt(field.forts, f.pos)) {
    return { sightM: WAR.sight.openM + CREST.sightM, bowMaxM: WAR.combat.bowMaxM + CREST.bowM };
  }
  return { sightM: WAR.sight.openM, bowMaxM: WAR.combat.bowMaxM };
}

const CREST = D.crest;
/**
 * Opevnění bojiště (jeho tvar úseků) → poloha → stojí na koruně valu (`crestAt`). Poloha muže je
 * pokaždé nový objekt (nemění se na místě) a val se v boji nemění – stačí jednou na polohu.
 */
const crestCache = new WeakMap<readonly FortSegmentShape[], WeakMap<Pos, boolean>>();

/** Stojí bod `at` na koruně valu opevnění `bf` (`crestAt`)? */
function crestOn(bf: BattleFort, at: Pos): boolean {
  let byPos = crestCache.get(bf.shapes);
  if (!byPos) {
    byPos = new WeakMap();
    crestCache.set(bf.shapes, byPos);
  }
  const cached = byPos.get(at);
  if (cached !== undefined) return cached;
  const near = D.postInsideM + POST_SLACK_M;
  const hit = nearestPiece(ringOf(bf), at);
  const seg = hit ? bf.fort.segments.find((s) => s.index === hit.piece.segment) : undefined;
  const layer = seg && seg.demolishedDay === undefined ? segmentRampart(bf.fort, seg) : null;
  let out = false;
  if (hit && seg && hit.d2 <= near * near && layerBuilt(layer)) {
    // ne před hradbou (pata žebříku je vně, na vnějším svahu valu)
    const q = inward(hit.piece, hit.t, 0);
    const before = (at.x - q.x) * hit.piece.nx + (at.z - q.z) * hit.piece.nz > OUTSIDE_M;
    const gate = bf.fort.gates.find((g) => g.segment === seg.index);
    const along = hit.piece.along + hit.t;
    const passage =
      gate !== undefined && Math.abs(along - gate.offsetM) <= FORTIFICATIONS.gate.widthM / 2;
    out = !before && !passage;
  }
  byPos.set(at, out);
  return out;
}

/**
 * Stojí bod `at` na koruně valu pod hradbou (fortifications.md – Hradby a obrana, Druhy – Pás
 * s valem; Martin 9. 11. 2026: „Pokud se jedná o palisádu nebo polský plot, má stát na koruně
 * valu“)? Do 1,25 m za čarou hradby dílu s hotovým nezbořeným valem (čára hradby je na koruně –
 * `wallLineInM`), ne víc než 0,5 m před ní, mimo průchod valem v bráně. Obránce tam stojí
 * o korunu výš – dál dohlédne, dostřelí a dohodí (`FORTIFICATIONS.defense.crest`).
 */
export function crestAt(forts: readonly BattleFort[], at: Pos): boolean {
  return forts.some((bf) => bf.shapes.length > 0 && crestOn(bf, at));
}

/**
 * Stanoviště klešťové brány (návrh Clauda): na věži `tower.defenders` (4) 1 m za vraty rovnoměrně
 * přes šířku uličky; místo 2 obránců brány ramena – na každém jeden na 5 m ochozu jako na hradbě
 * (Martin 9. 11. 2026: „Ramena jsou součástí brány. Obránce jak říkáš“), nejméně jeden, rovnoměrně
 * po délce ramene od čáry hradby po vrata, 1 m od uličky. Pořadí po dvojicích (levé, pravé rameno)
 * od středu uličky za pásem – při málo mužích stojí první dvojice tam, odkud zasahují útočníky
 * v uličce z obou stran.
 */
function pincerPosts(p: BattlePincer): { tower: Pos[]; arms: Pos[] } {
  const tower: Pos[] = [];
  if (p.tower) {
    const k = FORTIFICATIONS.tower.defenders;
    const w = FORTIFICATIONS.pincerGate.alleyWidthM;
    for (let i = 0; i < k; i++) {
      tower.push(pincerPoint(p, -ALLEY_HALF_M + (w * (i + 0.5)) / k, p.endM + D.postInsideM));
    }
  }
  const mid = p.endM - FORTIFICATIONS.pincerGate.alleyLengthM / 2;
  const side = ALLEY_HALF_M + D.postInsideM;
  const k = Math.max(1, Math.floor(p.endM / D.perDefenderM + 1e-9));
  const at = Array.from({ length: k }, (_, i) => (p.endM * (i + 0.5)) / k).sort(
    (a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b,
  );
  return { tower, arms: at.flatMap((m) => [pincerPoint(p, -side, m), pincerPoint(p, side, m)]) };
}

/**
 * Stanoviště obránců na věžích nad branami opevnění ke dni `day` – v `wallPosts` jdou první
 * (obsadí je napřed muži rodu – `planDefense`).
 */
export function towerPosts(forts: readonly BattleFort[], day: number): Pos[] {
  return forts.flatMap((bf) => battlePincers(bf, day).flatMap((p) => pincerPosts(p).tower));
}

// --- Obvod jako stěny bitvy ---------------------------------------------------------------------

/** Kus obvodu – čára úseku, nebo tětiva rohu k dalšímu úseku (jako stěny v `battle.ts`). */
interface Piece {
  segment: number;
  ax: number;
  az: number;
  /** Jednotkový směr a délka. */
  ux: number;
  uz: number;
  len: number;
  /** Začátek na obvodu (m). */
  s: number;
  /** Kde na čáře úseku kus začíná (tětiva rohu leží za koncem čáry). */
  along: number;
  /** Vnější normála. */
  nx: number;
  nz: number;
}

/** Obvod opevnění a jeho délka. */
interface Ring {
  pieces: Piece[];
  lengthM: number;
}

const ringCache = new WeakMap<readonly FortSegmentShape[], Ring>();

function ringOf(bf: BattleFort): Ring {
  const cached = ringCache.get(bf.shapes);
  if (cached) return cached;
  const pieces: Piece[] = [];
  let s = 0;
  const add = (segment: number, a: Pos, e: Pos, along: number): void => {
    const dx = e.x - a.x;
    const dz = e.z - a.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len <= 1e-6) return;
    const ux = dx / len;
    const uz = dz / len;
    const n = outward(bf, { x: a.x, z: a.z, dx: ux, dz: uz, length: len });
    pieces.push({ segment, ax: a.x, az: a.z, ux, uz, len, s, along, nx: n.x, nz: n.z });
    s += len;
  };
  bf.shapes.forEach((shape, k) => {
    const l = shape.line;
    const end = { x: l.x + l.dx * l.length, z: l.z + l.dz * l.length };
    add(shape.index, { x: l.x, z: l.z }, end, 0);
    const next = bf.shapes[(k + 1) % bf.shapes.length];
    if (shape.arc && next) add(shape.index, end, { x: next.line.x, z: next.line.z }, l.length);
  });
  const ring = { pieces, lengthM: s };
  ringCache.set(bf.shapes, ring);
  return ring;
}

/** Kus obvodu nejblíž bodu `p` a průmět na něj (m od začátku kusu). */
function nearestPiece(ring: Ring, p: Pos): { piece: Piece; t: number; d2: number } | null {
  let best: { piece: Piece; t: number; d2: number } | null = null;
  for (const piece of ring.pieces) {
    const raw = (p.x - piece.ax) * piece.ux + (p.z - piece.az) * piece.uz;
    const t = Math.min(piece.len, Math.max(0, raw));
    const d2 = dist2(p, { x: piece.ax + piece.ux * t, z: piece.az + piece.uz * t });
    if (!best || d2 < best.d2) best = { piece, t, d2 };
  }
  return best;
}

/** Bod `t` m na kusu posunutý o `inside` m dovnitř. */
function inward(piece: Piece, t: number, inside: number): Pos {
  return {
    x: piece.ax + piece.ux * t - piece.nx * inside,
    z: piece.az + piece.uz * t - piece.nz * inside,
  };
}

/** Stanoviště v místě `s` m po obvodu – 1 m za čarou hradby. */
function postAt(ring: Ring, s: number): Pos {
  const at = ((s % ring.lengthM) + ring.lengthM) % ring.lengthM;
  let piece = ring.pieces[ring.pieces.length - 1]!;
  for (const p of ring.pieces) {
    if (at < p.s + p.len) {
      piece = p;
      break;
    }
  }
  return inward(piece, Math.min(piece.len, at - piece.s), D.postInsideM);
}

/** Rozdělí `k` podle vah zbytkovou metodou (při shodě zbytku dřívější). */
function largestRemainder(weights: readonly number[], k: number): number[] {
  const total = weights.reduce((a, w) => a + w, 0);
  if (k <= 0 || total <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (k * w) / total);
  const out = exact.map((x) => Math.floor(x + 1e-9));
  let left = k - out.reduce((a, x) => a + x, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - out[i]! }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const o of order) {
    if (left <= 0) break;
    out[o.i]!++;
    left--;
  }
  return out;
}

/**
 * Místa `k` obránců po obvodu délky `lengthM` (m po obvodu): bez bran rovnoměrně, s branami
 * v mezerách mezi branami podle délky mezery – v mezeře rovnoměrně, brány jsou kotvy.
 */
function spread(lengthM: number, anchors: readonly number[], k: number): number[] {
  if (k <= 0) return [];
  if (anchors.length === 0) return Array.from({ length: k }, (_, i) => (lengthM * (i + 0.5)) / k);
  const sorted = [...anchors].sort((a, b) => a - b);
  const gaps = sorted.map((a, i) => ({
    from: a,
    len: (i + 1 < sorted.length ? sorted[i + 1]! : sorted[0]! + lengthM) - a,
  }));
  const counts = largestRemainder(
    gaps.map((g) => g.len),
    k,
  );
  const out: number[] = [];
  gaps.forEach((g, i) => {
    const n = counts[i]!;
    for (let j = 1; j <= n; j++) out.push(g.from + (g.len * j) / (n + 1));
  });
  return out;
}

/** Brány opevnění jako místa po obvodu (m od začátku obvodu) s dílem brány. */
function gateStations(bf: BattleFort, ring: Ring): { s: number; segment: number }[] {
  const out: { s: number; segment: number }[] = [];
  for (const g of bf.fort.gates) {
    const piece = ring.pieces.find((p) => p.segment === g.segment && p.along === 0);
    if (piece) out.push({ s: piece.s + g.offsetM, segment: g.segment });
  }
  return out;
}

/**
 * Stanoviště `men` obránců (fortifications.md – Obrana bez násobku 6; návrh Clauda): napřed věže
 * nad branami po 4 (`towerPosts`), pak brány po 2 (1 m vlevo a vpravo od středu brány, u klešťové
 * brány ramena – jeden na 5 m ochozu ramene), zbytek rovnoměrně po obvodu podle délky – nejvýš jeden na 5 m; kdo
 * stanoviště nedostane, zůstane v záloze. Stanoviště leží 1 m za čarou hradby (`postInsideM`) – na
 * ochozu a koruně (`crownAt`), nebo na zemi za stěnou. Bez dne `day` bez klešťových bran a věží.
 */
export function wallPosts(forts: readonly BattleFort[], men: number, day?: number): Pos[] {
  const out: Pos[] = [];
  for (const post of day === undefined ? [] : towerPosts(forts, day)) {
    if (out.length >= men) return out;
    out.push(post);
  }
  const rings = forts
    .filter((bf) => bf.shapes.length > 0)
    .map((bf) => {
      const ring = ringOf(bf);
      const pincers = day === undefined ? [] : battlePincers(bf, day);
      return { ring, gates: gateStations(bf, ring), pincers };
    })
    .filter((r) => r.ring.lengthM > 0);
  const side = FORTIFICATIONS.gate.widthM / 4;
  for (const r of rings) {
    for (const g of r.gates) {
      const pincer = r.pincers.find((p) => p.segment === g.segment);
      const posts = pincer
        ? pincerPosts(pincer).arms
        : [-1, 1].map((k) => postAt(r.ring, g.s + k * side));
      for (const post of posts) {
        if (out.length >= men) return out;
        out.push(post);
      }
    }
  }
  const shares = largestRemainder(
    rings.map((r) => r.ring.lengthM),
    men - out.length,
  );
  rings.forEach((r, i) => {
    const k = Math.min(shares[i]!, Math.floor(r.ring.lengthM / D.perDefenderM + 1e-9));
    const anchors = r.gates.map((g) => g.s);
    for (const s of spread(r.ring.lengthM, anchors, k)) out.push(postAt(r.ring, s));
  });
  return out;
}

/**
 * Stojí bod `at` na ochozu či koruně hradby (stanoviště do 1,25 m za čarou hradby s korunou), na
 * rameni klešťové brány nebo na věži nad vraty?
 */
export function crownAt(forts: readonly BattleFort[], at: Pos, day: number): boolean {
  const near = D.postInsideM + POST_SLACK_M;
  for (const bf of forts) {
    if (bf.shapes.length === 0) continue;
    for (const p of battlePincers(bf, day)) if (onArm(p, at) || onTower(p, at)) return true;
    const hit = nearestPiece(ringOf(bf), at);
    if (!hit || hit.d2 > near * near) continue;
    if (hasCrown(wallKindAt(bf, hit.piece.segment, hit.piece.along + hit.t, day))) return true;
  }
  return false;
}

/** Vede cesta `p` → `q` podél hradby (po ochozu), ne přes nádvoří? */
function alongWall(forts: readonly BattleFort[], p: Pos, q: Pos): boolean {
  const mid = { x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 };
  for (const bf of forts) {
    if (bf.shapes.length === 0) continue;
    const hit = nearestPiece(ringOf(bf), mid);
    if (hit && hit.d2 <= ALONG_M * ALONG_M) return true;
  }
  return false;
}

/** Tempo cesty obránce k `to`: po ochozu podél hradby polovina, po zemi plné. */
function walkPace(forts: readonly BattleFort[], f: Fighter, to: Pos): number {
  return f.onWall && alongWall(forts, f.pos, to) ? D.walkwayPace : 1;
}

/** Leží bod `p` uvnitř obvodu opevnění (za čarou nejbližšího kusu, nejvýš půl metru před ní)? */
export function withinWalls(bf: BattleFort, p: Pos): boolean {
  const hit = bf.shapes.length > 0 ? nearestPiece(ringOf(bf), p) : null;
  if (!hit) return false;
  const q = inward(hit.piece, hit.t, 0);
  return (p.x - q.x) * hit.piece.nx + (p.z - q.z) * hit.piece.nz <= OUTSIDE_M;
}

/** Obránci na nohou do 2,5 m od místa `at` na hradbě, ne venku před ní. */
function defendersAt(bf: BattleFort, at: Pos, fighters: readonly Fighter[]): Fighter[] {
  const hit = bf.shapes.length > 0 ? nearestPiece(ringOf(bf), at) : null;
  const r2 = REACH_M * REACH_M + 1e-9;
  return fighters.filter((d) => {
    if (d.side !== 'defend' || d.state !== 'fight' || dist2(d.pos, at) > r2) return false;
    if (!hit) return true;
    return (d.pos.x - at.x) * hit.piece.nx + (d.pos.z - at.z) * hit.piece.nz <= OUTSIDE_M;
  });
}

/**
 * Je místo `at` na hradbě obsazené (fortifications.md – Obrana bez násobku 6)? Obránce na nohou
 * do 2,5 m, který nestojí venku před hradbou. Neobsazeným místem lezec vyleze bez boje.
 */
export function occupied(bf: BattleFort, at: Pos, defenders: readonly Fighter[]): boolean {
  return defendersAt(bf, at, defenders).length > 0;
}

// --- Rány přes hradbu -----------------------------------------------------------------------------

/**
 * Druh rány podle vzdálenosti (war.md – Boj; fortifications.md – Obrana bez násobku 3): zblízka do
 * 3 m (z ochozu i kameny k patě), luk 20–60 m (kdo ho má), z ochozu a koruny hod do 15 m (návrh
 * Clauda: i muž rodu, na kterého je pod 20 m na luk blízko). Hradby mezi nimi `canStrikeAcross`.
 * `bowMaxM` – dostřel luku (z věže nad branou dál – `towerReach`).
 */
export function strikeReach(
  f: Fighter,
  t: Fighter,
  bowMaxM: number = WAR.combat.bowMaxM,
  throwM: number = D.throwM,
): StrikeKind | null {
  const d2 = dist2(f.pos, t.pos);
  const c = WAR.combat;
  if (d2 <= c.meleeM * c.meleeM) return 'melee';
  if (f.bow && d2 >= c.bowMinM * c.bowMinM && d2 <= bowMaxM * bowMaxM) return 'bow';
  if (f.onWall && d2 <= throwM * throwM) return 'throw';
  return null;
}

/**
 * Dohled, dostřel a dohoz muže (`towerReach`; z koruny valu hod o `crest.throwM` dál – Martin
 * 9. 11. 2026, hradba na koruně valu).
 */
export function reachOf(
  f: Fighter,
  field: { readonly forts: readonly BattleFort[]; readonly day: number },
): { sightM: number; bowMaxM: number; throwM: number } {
  const r = towerReach(f, field);
  const raised = f.side === 'defend' && f.onWall && crestAt(field.forts, f.pos);
  return { ...r, throwM: D.throwM + (raised ? CREST.throwM : 0) };
}

/**
 * Zasáhne `from` muže `to` přes hradbu druhu `wall` (fortifications.md – Obrana bez násobku 2,
 * tabulka „Kdo přes hradbu koho zasáhne“)? Bez hradby a přes plot (zblízka i luk z obou stran)
 * ano; přes palisádu bez ochozu nikdo; u hradby s korunou z ochozu dolů zblízka do 3 m (lezec,
 * kameny k patě) a ven střelou i hodem, zespodu na obránce na ochozu jen střelou (kryje ho
 * předprseň – `poseOf`), jinak nikdo.
 */
export function canStrikeAcross(
  wall: WallKind | null,
  from: Fighter,
  to: Fighter,
  kind: 'melee' | 'ranged',
): boolean {
  if (wall === null || wall === 'fence') return true;
  if (!hasCrown(wall)) return false;
  if (from.onWall) {
    return kind === 'ranged' || dist2(from.pos, to.pos) <= D.footStoneM * D.footStoneM;
  }
  return kind === 'ranged' && to.onWall === true;
}

/**
 * Lezec stojí nahoře na hradbě (na vrcholu žebříku – bojuje s obráncem, přetahuje, slézá dovnitř):
 * je na hradbě, ne za ní – rány na něj i od něj hradba nekryje (souboj u žebříku).
 */
export function onWallTop(f: Fighter, b: Pick<BattleState, 'ladders'>): boolean {
  if (!onLadder(f, b) || !f.climb || f.climb.ladder === null) return false;
  const key = f.climb.ladder;
  const l = (b.ladders ?? []).find((x) => x.key === key);
  return l !== undefined && dist2(f.pos, l.top) <= 1e-4;
}

// --- Obsazení a přesun ----------------------------------------------------------------------------

/** Co obránci na hradbě čtou z taktu boje. */
export interface WallWorld {
  b: BattleState;
  /** Opevnění bojiště s průlomy boje. */
  forts: readonly BattleFort[];
  day: number;
  /** Rána `f` na `t` odsud – podle vzdálenosti a hradeb mezi nimi; null = nedosáhne. */
  strike: (f: Fighter, t: Fighter) => StrikeKind | null;
  /** Stojí mezi `p` a `q` stěna opevnění? */
  walled: (p: Pos, q: Pos) => boolean;
  /** Přidělení posil v tomto taktu (`reinforceTarget` – počítá se jednou za takt). */
  assigned?: Map<string, Pos>;
  /** Průchody opevnění v tomto taktu (brány, mezery, průlomy) – body vně a uvnitř; chybí = žádné. */
  exits?: (fort: number) => readonly Exit[];
}

/** Průchod opevněním – body vně a uvnitř, úsek. */
export interface Exit {
  out: Pos;
  in: Pos;
  segment: number;
}

/** Místo na hradbě, kde útočníci lezou nebo prolamují. */
interface Place {
  fort: number;
  /** Místo na čáře hradby a kam se obránce postaví (1 m za ní). */
  wall: Pos;
  at: Pos;
  attackers: number;
}

const AT_WALL: ReadonlySet<string> = new Set(['lean', 'up', 'over', 'down']);

/** Bod na čáře hradby nejblíž `p` a stanoviště za ním. */
function placeAt(bf: BattleFort, p: Pos, day: number): { wall: Pos; at: Pos } {
  // v uličce klešťové brány se brání u vrat (návrh Clauda): s věží na ní 1 m za vraty, bez věže
  // na rameni vedle vrat – odtud dosáhne na ty, kdo vrata prolamují
  const pincer = battlePincers(bf, day).find((x) => inAlley(x, p));
  if (pincer) {
    if (pincer.tower) {
      return {
        wall: pincerPoint(pincer, 0, pincer.endM),
        at: pincerPoint(pincer, 0, pincer.endM + D.postInsideM),
      };
    }
    const at = pincerPoint(pincer, -(ALLEY_HALF_M + D.postInsideM), pincer.endM - 1);
    return { wall: at, at: { ...at } };
  }
  const hit = bf.shapes.length > 0 ? nearestPiece(ringOf(bf), p) : null;
  if (!hit) return { wall: { ...p }, at: { ...p } };
  return { wall: inward(hit.piece, hit.t, 0), at: inward(hit.piece, hit.t, D.postInsideM) };
}

/** Žebříky s lezcem u hradby (opírá, leze, přetahuje, slézá) a rozdělané průlomy s prolamujícími. */
function places(w: WallWorld): Place[] {
  const out: Place[] = [];
  for (const l of w.b.ladders ?? []) {
    if (l.climber === null) continue;
    const c = w.b.fighters.find((x) => x.id === l.climber);
    if (!c?.climb || c.state !== 'climb' || c.climb.ladder !== l.key) continue;
    if (!AT_WALL.has(c.climb.phase)) continue;
    const bf = w.forts[l.fort];
    if (bf) out.push({ fort: l.fort, ...placeAt(bf, l.top, w.day), attackers: 1 });
  }
  for (const br of w.b.breaches) {
    if (br.phase === 'done') continue;
    const men = w.b.fighters.filter((f) => f.state === 'breach' && f.breachAt === br.key).length;
    const bf = w.forts[br.fort];
    if (men > 0 && bf) out.push({ fort: br.fort, ...placeAt(bf, br.at, w.day), attackers: men });
  }
  return out;
}

/** Opevnění stanoviště – nejbližší střed. */
export function fortOfPost(forts: readonly BattleFort[], post: Pos): number {
  let best = -1;
  let bestD = Infinity;
  forts.forEach((bf, i) => {
    const d = dist2(bf.center, post);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Obránce je v boji zblízka (minulý takt mířil na protivníka do 3 m). */
function engaged(f: Fighter, b: BattleState): boolean {
  if (f.aim === null) return false;
  const t = b.fighters.find((x) => x.id === f.aim);
  const m = WAR.combat.meleeM;
  return t !== undefined && canAttack(f, t, false) && dist2(f.pos, t.pos) <= m * m;
}

/**
 * Posily v taktu (návrh Clauda): na každém místě zůstanou obránci, kteří tam už jsou (nejvýš tolik,
 * kolik je útočníků); chybí-li jich, přijdou nejbližší volní obránci téhož opevnění podle času
 * cesty – podél hradby po ochozu polovičním tempem, přes nádvoří po zemi plným. Volný je obránce
 * se stanovištěm, který nebojuje zblízka a nestojí u žádného místa. Pořadí míst: žebříky, pak
 * průlomy, v pořadí stavu.
 */
function assign(w: WallWorld): Map<string, Pos> {
  const out = new Map<string, Pos>();
  const list = places(w);
  if (list.length === 0) return out;
  const busy = new Set<string>();
  const present = list.map((p) => {
    const here = defendersAt(w.forts[p.fort]!, p.wall, w.b.fighters);
    for (const d of here) busy.add(d.id);
    return here;
  });
  const free = w.b.fighters.filter(
    (f) =>
      f.side === 'defend' &&
      f.state === 'fight' &&
      f.post !== undefined &&
      !f.controlled &&
      !busy.has(f.id) &&
      !engaged(f, w.b),
  );
  list.forEach((p, i) => {
    const here = present[i]!;
    for (const d of here.slice(0, p.attackers)) if (!out.has(d.id)) out.set(d.id, p.at);
    const need = p.attackers - here.length;
    if (need <= 0) return;
    free
      .filter((f) => !out.has(f.id) && fortOfPost(w.forts, f.post!) === p.fort)
      .map((f) => {
        const pace = walkPace(w.forts, f, p.at);
        return { f, cost: dist2(f.pos, p.at) / (pace * pace) };
      })
      .sort((a, b) => a.cost - b.cost)
      .slice(0, need)
      .forEach(({ f }) => out.set(f.id, p.at));
  });
  return out;
}

/**
 * Kam jde obránce posílit (fortifications.md – Obrana bez násobku 6): k nejbližšímu žebříku nebo
 * místu prolamování, kde je obránců míň než útočníků (stanoviště 1 m za hradbou); null – nikam.
 */
export function reinforceTarget(f: Fighter, w: WallWorld): Pos | null {
  w.assigned ??= assign(w);
  return w.assigned.get(f.id) ?? null;
}

/**
 * Plán obránce se stanovištěm (fortifications.md – Obrana bez násobku 3, 6; návrh Clauda):
 * útočník uvnitř obvodu do 40 m od stanoviště (nebo ten, kdo útočí na něj) – boj jako u domů, a
 * nedosáhne-li na něj odsud, sleze z ochozu; jinak rána zblízka přes hradbu (lezec, muž u paty);
 * jinak posila k žebříku či průlomu; jinak (i na místě posily) střela či hod odsud; jinak zpět na
 * stanoviště (`walkTo`). Kdo posilou není a na opevnění dopadají šípy, je v krytu (`Fighter.cover`)
 * a na ochozu nestřílí ani nehází (Kryt pod palbou). Probíjení opevnění má přednost (`breakoutPlan`).
 */
export function wallDefenderPlan(f: Fighter, ctx: PlanContext, w: WallWorld): FighterPlan {
  const post = f.post ?? f.home;
  const zone = WAR.houseGroupM * WAR.houseGroupM;
  const fi = fortOfPost(w.forts, post);
  const fort = w.forts[fi];
  const breakout = (w.b.breakouts ?? []).find((x) => x.fort === fi);
  if (breakout && fort) return breakoutPlan(f, ctx, w, breakout, fort);
  const inside = ctx.fighters.filter(
    (e) =>
      canAttack(f, e, false) &&
      e.state === 'fight' &&
      (e.aim === f.id || dist2(post, e.pos) <= zone) &&
      fort !== undefined &&
      withinWalls(fort, e.pos) &&
      !w.walled(f.pos, e.pos) &&
      ctx.sees(f.pos, e.pos),
  );
  const foe = nearest(f.pos, inside);
  if (foe) {
    delete f.cover;
    if (f.onWall && w.strike(f, foe) === null) delete f.onWall;
    return { target: foe, moveTo: null, leash: { at: [post], radiusM: WAR.houseGroupM } };
  }
  const close = closeFoe(f, ctx, w);
  if (close) {
    delete f.cover;
    return { target: close, moveTo: null, leash: null };
  }
  // posila jde na místo; na místě (i na stanovišti) střílí a hází, kam dosáhne
  const to = reinforceTarget(f, w);
  // kryt pod palbou (Obrana bez násobku 3): kdo nebrání místo útoku, kryje se, dokud dopadají šípy
  if (to === null && underFire(w.b, fi)) f.cover = true;
  else delete f.cover;
  const move = to ? walkTo(f, to, w) : null;
  if (move) return { target: null, moveTo: move, leash: null };
  // na ochozu a koruně v krytu nestřílí ani nehází – skrčený za předprsní, nebo pod ochozem
  if (f.cover && f.onWall) return { target: null, moveTo: walkTo(f, post, w), leash: null };
  const far = nearest(
    f.pos,
    ctx.fighters.filter((e) => canAttack(f, e, false) && w.strike(f, e) !== null),
  );
  if (far) return { target: far, moveTo: null, leash: null };
  return { target: null, moveTo: to ? null : walkTo(f, post, w), leash: null };
}

/** Nejbližší nepřítel na ránu zblízka (do 3 m, i přes hradbu – lezec, muž u paty). */
function closeFoe(f: Fighter, ctx: PlanContext, w: WallWorld): Fighter | null {
  const m2 = WAR.combat.meleeM * WAR.combat.meleeM;
  return nearest(
    f.pos,
    ctx.fighters.filter(
      (e) => canAttack(f, e, false) && dist2(f.pos, e.pos) <= m2 && w.strike(f, e) !== null,
    ),
  );
}

/**
 * Dopadají na opevnění `fort` šípy – útočník naposled vystřelil přes hradbu na jeho obránce před
 * nejvýš 30 s (`BattleState.underFire`)?
 */
export function underFire(b: Pick<BattleState, 'underFire' | 'ticks'>, fort: number): boolean {
  const last = b.underFire?.[fort];
  return last !== undefined && b.ticks - last <= D.coverSeconds * TICKS_PER_SECOND;
}

/** Leží `p` na ose průchodu `a` → `e` (mezi body, nejvýš 1 m stranou)? */
function onAxis(p: Pos, a: Pos, e: Pos): boolean {
  const dx = e.x - a.x;
  const dz = e.z - a.z;
  const len2 = dx * dx + dz * dz;
  if (len2 <= 1e-9) return false;
  const t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2;
  if (t < 0 || t > 1) return false;
  const q = { x: a.x + dx * t, z: a.z + dz * t };
  return dist2(p, q) <= 1;
}

/**
 * Probíjení (fortifications.md – Obrana bez násobku 3, Bod zlomu a probíjení; návrh Clauda):
 * obránce sleze z hradby a jde k vybrané bráně; dokud skupina nevyrazí (`gathered`), čeká u ní,
 * pak projde branou ven a do lesa. Útočníka na ránu zblízka cestou bije (probíjí se), střílet se
 * nezastavuje.
 */
function breakoutPlan(
  f: Fighter,
  ctx: PlanContext,
  w: WallWorld,
  bo: BattleBreakout,
  fort: BattleFort,
): FighterPlan {
  delete f.cover;
  delete f.onWall;
  const close = closeFoe(f, ctx, w);
  if (close) return { target: close, moveTo: null, leash: null };
  let exit: Exit | null = null;
  for (const o of w.exits?.(bo.fort) ?? []) {
    if (o.segment !== bo.segment) continue;
    if (!exit || dist2(f.pos, o.in) < dist2(f.pos, exit.in)) exit = o;
  }
  if (!exit) return { target: null, moveTo: null, leash: null };
  if (!withinWalls(fort, f.pos)) return { target: null, moveTo: bo.to ?? exit.out, leash: null };
  if (bo.gathered && onAxis(f.pos, exit.in, exit.out)) {
    return { target: null, moveTo: exit.out, leash: null };
  }
  const at = returnTo(f, exit.in);
  return { target: null, moveTo: at ?? (bo.gathered ? exit.out : null), leash: null };
}

/**
 * Cesta obránce na místo na hradbě (stanoviště, posila): podél hradby zůstane na ochozu, přes
 * nádvoří z ochozu sleze a jde po zemi; na místě s korunou na ochoz vystoupí. Vrací cíl kroku,
 * nebo null – je na místě.
 */
function walkTo(f: Fighter, to: Pos, w: WallWorld): Pos | null {
  const move = returnTo(f, to);
  if (move === null) {
    if (!f.onWall && crownAt(w.forts, to, w.day)) f.onWall = true;
  } else if (f.onWall && !alongWall(w.forts, f.pos, to)) {
    delete f.onWall;
  }
  return move;
}
