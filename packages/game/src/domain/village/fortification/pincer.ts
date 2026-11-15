import type { Point } from '../placement/polygon';
import { FORTIFICATIONS } from '../rules/rules-fortifications';
import type { Construction, WallKind } from '../types';
import { closeGateGap, gateChord, gateStands, type FortGate } from './gates';
import { FORT_DAYS_PER_YEAR } from './life';
import type { FortOutline } from './outline';
import type { FortSegmentShape } from './segments';
import type { Fortification } from './types';

// Klešťová brána a věž nad branou (fortifications.md – Hradby a obrana, Brány; Martin 8. 11. 2026:
// „Od palisády výše může hráč či NPC vylepšit bránu ve dvou úrovních 1. klešťová brána (za
// opevněním však musí být dost místa) 2. dřevěná věž nad samotnou branou.“). Ramena hradby jsou
// zatažená dovnitř podél uličky od vnitřního okraje pásu; vrata stojí na vnitřním konci uličky.
// Ulička jde kolmo na tětivu brány (osa brány), ne podél skutečné cesty – návrh Clauda. Jen
// sčítání, násobení a odmocnina – server i prohlížeč počítají stejně.

/** Osa brány: střed tětivy, směr podél brány `u` a dovnitř `n` (jednotkové). */
interface GateAxis {
  mx: number;
  mz: number;
  ux: number;
  uz: number;
  nx: number;
  nz: number;
}

/** Osa brány z tětivy (`gateChord`); tětiva nulové délky null. */
function gateAxis(outline: FortOutline, shape: FortSegmentShape, gate: FortGate): GateAxis | null {
  const { a, b } = gateChord(outline, shape, gate);
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.sqrt(dx * dx + dz * dz);
  if (!(len > 0)) return null;
  // dovnitř jako otvor brány ve stěnách (`fortWalls`)
  return {
    mx: (a[0] + b[0]) / 2,
    mz: (a[1] + b[1]) / 2,
    ux: dx / len,
    uz: dz / len,
    nx: dz / len,
    nz: -dx / len,
  };
}

/** Obdélník osy: podél brány `from`–`to` (m od středu), dovnitř `inFrom`–`inTo` (m od tětivy). */
function axisRect(ax: GateAxis, from: number, to: number, inFrom: number, inTo: number): Point[] {
  const at = (along: number, inward: number): Point => [
    ax.mx + ax.ux * along + ax.nx * inward,
    ax.mz + ax.uz * along + ax.nz * inward,
  ];
  return [at(from, inFrom), at(to, inFrom), at(to, inTo), at(from, inTo)];
}

/**
 * Jde u hradby `wall` postavit klešťovou bránu (a s ní věž)? Jen u hradby s ochozem – palisáda
 * s ochozem, roštová a komorová (`pincerGate.walls`; Brány – Martin 9. 11. 2026); u plotu
 * a palisády bez ochozu jen obyčejná brána.
 */
export function pincerWallAllowed(wall: WallKind): boolean {
  return (FORTIFICATIONS.pincerGate.walls as readonly WallKind[]).includes(wall);
}

/**
 * Druh ramen klešťové brány u hradby `wall` – ramena mají vždy ochoz (stojící klešťová brána
 * starší vsi u palisády – palisáda s ochozem), roštová a komorová svůj druh.
 */
export function pincerArmKind(wall: WallKind): WallKind {
  return wall === 'crib' || wall === 'chamber' ? wall : 'walkway';
}

/** Šířka ramene (m) – pás palisády s ochozem (stěny pro pěšiny a místo za branou). */
function armWidthM(): number {
  return FORTIFICATIONS.bandM.walkway;
}

/**
 * Ramena klešťové brány: dva obdélníky podél uličky (`pincerGate.alleyWidthM` mezi nimi) od
 * vnitřního okraje pásu `bandInM` (m od křivky) `alleyLengthM` dovnitř, každé široké jako pás
 * palisády s ochozem. Konvexní čtyřúhelníky jako stěny (`fortWalls`); bez tětivy prázdné.
 */
export function pincerArms(
  outline: FortOutline,
  shape: FortSegmentShape,
  gate: FortGate,
  bandInM: number,
): Point[][] {
  const ax = gateAxis(outline, shape, gate);
  if (!ax) return [];
  const half = FORTIFICATIONS.pincerGate.alleyWidthM / 2;
  const arm = armWidthM();
  const end = bandInM + FORTIFICATIONS.pincerGate.alleyLengthM;
  return [
    axisRect(ax, -half - arm, -half, bandInM, end),
    axisRect(ax, half, half + arm, bandInM, end),
  ];
}

/**
 * Ulička klešťové brány mezi rameny – průchod pro pěšiny až k vratům na jejím vnitřním konci
 * (otvor jako otvor brány ve stěnách); bez tětivy null.
 */
export function pincerAlley(
  outline: FortOutline,
  shape: FortSegmentShape,
  gate: FortGate,
  bandInM: number,
): Point[] | null {
  const ax = gateAxis(outline, shape, gate);
  if (!ax) return null;
  const half = FORTIFICATIONS.pincerGate.alleyWidthM / 2;
  return axisRect(ax, -half, half, bandInM, bandInM + FORTIFICATIONS.pincerGate.alleyLengthM);
}

/**
 * Místo za branou, které klešťová brána potřebuje volné (Brány – „za opevněním však musí být dost
 * místa“): ulička s oběma rameny, `pincerGate.clearM` dovnitř od vnitřního okraje pásu; bez tětivy
 * null.
 */
export function pincerSpace(
  outline: FortOutline,
  shape: FortSegmentShape,
  gate: FortGate,
  bandInM: number,
): Point[] | null {
  const ax = gateAxis(outline, shape, gate);
  if (!ax) return null;
  const wide = FORTIFICATIONS.pincerGate.alleyWidthM / 2 + armWidthM();
  return axisRect(ax, -wide, wide, bandInM, bandInM + FORTIFICATIONS.pincerGate.clearM);
}

/** Ramena klešťové brány blokují od zahájení stavby (`pincerDay` null) i hotová. */
export function pincerBlocks(gate: Pick<FortGate, 'pincerDay'>): boolean {
  return gate.pincerDay !== undefined;
}

/** Stojí klešťová brána ke dni `day` (ramena dostavěná)? */
export function gatePincerStands(gate: Pick<FortGate, 'pincerDay'>, day: number): boolean {
  return gate.pincerDay != null && gate.pincerDay <= day;
}

/** Stáří věže nad branou ke dni `day` (dny, i navíc za nedodělanou údržbu); bez hotové věže null. */
function towerAgeDays(
  gate: Pick<FortGate, 'towerDay' | 'towerExtraAgeDays'>,
  day: number,
): number | null {
  if (gate.towerDay == null || gate.towerDay > day) return null;
  return day - gate.towerDay + (gate.towerExtraAgeDays ?? 0);
}

/** Dožilá věž nad branou – za koncem životnosti (`tower.lifeYears`, Životnost a údržba). */
export function gateTowerIsOld(
  gate: Pick<FortGate, 'towerDay' | 'towerExtraAgeDays'>,
  day: number,
): boolean {
  const age = towerAgeDays(gate, day);
  return age !== null && age >= FORTIFICATIONS.tower.lifeYears * FORT_DAYS_PER_YEAR;
}

/**
 * Stojí věž nad branou ke dni `day`? Hotová a nepřestavěná dožilá věž chátrá jako hradba
 * (`decayYears`) – po nich se zřítí (návrh Clauda).
 */
export function gateTowerStands(
  gate: Pick<FortGate, 'towerDay' | 'towerExtraAgeDays'>,
  day: number,
): boolean {
  const age = towerAgeDays(gate, day);
  const years = FORTIFICATIONS.tower.lifeYears + FORTIFICATIONS.decayYears;
  return age !== null && age < years * FORT_DAYS_PER_YEAR;
}

/**
 * Práce na bráně došla (mutuje opevnění): klešťová brána nebo věž dostane den dokončení – nová
 * (null) i přestavba dožilé věže (den věže starší než založení stavby); přestavěná věž stárne
 * znovu bez stárnutí navíc. Otvor po zbořené bráně: zastavený hradbou zmizí (`closeGateGap`),
 * postavená brána zase stojí.
 */
export function completeGateWork(
  fort: Fortification,
  c: Pick<Construction, 'fortGate' | 'startedDay'>,
  day: number,
): void {
  const work = c.fortGate;
  const gate = work && fort.gates.find((g) => g.segment === work.segment);
  if (!work || !gate) return;
  // otvor po zbořené bráně (D45): zastavený hradbou zmizí, nová brána v něm zase stojí
  if (work.level === 'fill' || work.level === 'rebuild') {
    if (gateStands(gate)) return;
    if (work.level === 'fill') closeGateGap(fort, gate);
    else delete gate.demolishedDay;
    return;
  }
  if (work.level === 'pincer') {
    if (gate.pincerDay == null || gate.pincerDay < c.startedDay) gate.pincerDay = day;
    return;
  }
  if (gate.towerDay == null || gate.towerDay < c.startedDay) {
    gate.towerDay = day;
    delete gate.towerExtraAgeDays;
  }
}

/**
 * Zrušená práce na bráně (mutuje opevnění): nedostavěná klešťová brána nebo věž zmizí (brána je
 * jako dřív); zrušená přestavba dožilé věže nechá starou věž.
 */
export function dropGateWork(fort: Fortification, c: Pick<Construction, 'fortGate'>): void {
  const work = c.fortGate;
  const gate = work && fort.gates.find((g) => g.segment === work.segment);
  if (!work || !gate) return;
  if (work.level === 'pincer' && gate.pincerDay === null) delete gate.pincerDay;
  if (work.level === 'tower' && gate.towerDay === null) delete gate.towerDay;
}
