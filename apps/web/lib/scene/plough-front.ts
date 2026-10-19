// Kde dnes orá spřežení (oxen.md – Spřežení postupuje s orbou; návrh Clauda, Martin schválil
// 19. 10. 2026) – čistá funkce vsi pro scénu, bez Babylonu. Spřežení orá díl, přes který dnes
// orba postoupila (fronta `parts` podílu práce `plough` od herního jádra), a na něm pruh u čáry
// práce – tam, kde se zem během dne mění na zoranou: stejné řádky a strana od vsi jako obtisk
// rozpracovaného dílu (field-look.ts – `workFrame`, `workSteps`), ať orá přesně tu část, která
// se překresluje. Za herní den (≈ 86 s) spřežení skutečnou rychlostí zorá ≈ 2 řady, orba ve
// hře ale za den postoupí o ≈ 13 čtverců na spřežení (0,3 ha) – projít je všechny by znamenalo
// hnát voly třináctkrát rychleji. Spřežení proto stojí na čele orby (díl s čárou práce na konci
// dne) a druhý den dojde na nové čelo (plough-team.ts – `transitTrack`). Víc spřežení si rozdělí
// díly dnešní fronty tak, aby se jejich dráhy i se souvratěmi nepotkaly; když takový díl není,
// orají dvě spřežení jeden díl ve dvou pruzích vedle sebe a jdou v zákrytu (stejná dráha
// posunutá napříč – nikdy se nesrazí).
import { dateOfDayIndex } from '@bohemia/game';
import type { SceneFieldPart, SceneLaborShare, SceneVillage } from '../village-view';
import { rowDirection } from './field-cells';
import {
  fieldPartViews,
  villageCenter,
  workFrame,
  workSteps,
  workedParts,
  type FieldLook,
  type PartView,
} from './field-look';
import { TURN_RADIUS_M, ardReach, type PloughField } from './plough-team';

/** Rozestup řad orby (m) – 2,5 m jako dřív (6 řad na čtverec 15 m). */
export const PLOUGH_ROW_M = 2.5;
/**
 * Pruh u čáry práce (m napříč řadami): spřežení za herní den zorá ≈ 2 řady, pruh o 4 řadách
 * drží spřežení u čáry, ale nechá mu kus místa (nejede pořád po téže brázdě).
 */
export const FRONT_STRIP_M = 4 * PLOUGH_ROW_M;
/** Nejužší pruh (m) – aspoň dvě řady; na začátku dílu sahá kus do nezorané části. */
export const MIN_STRIP_M = 15 / 4;
/**
 * Pruh jednoho ze dvou spřežení na jednom dílu (m) – půlka dílu: v zákrytu jde druhé spřežení
 * vedle prvního, na souvrati, kde se otáčejí, jedno za druhým (spřežení s rádlem a oráčem je
 * ≈ 5,3 m dlouhé – mezi nimi zbydou ≈ 2 m).
 */
export const SHARED_STRIP_M = 7.5;
/** Kolik spřežení se vejde na jeden díl (pruhy SHARED_STRIP_M vedle sebe). */
const TEAMS_PER_PART = 2;
/** Kam spřežení od své dráhy sahá (m): honáček vlevo od jha, voli kus před ním. */
const TEAM_BODY_M = 1.8;

/** Vzhledy dílu před orbou (ještě nezorané) – jinak je díl zoraný celý. */
const UNPLOUGHED: ReadonlySet<FieldLook | null> = new Set<FieldLook | null>([
  null,
  'bare',
  'stubble',
  'pasture',
  'young-fallow',
  'meadow',
  'mown',
  'haystacks',
]);

/** Spřežení na čele orby: pole, díl a pruh, který orá (dráhu postaví `ploughPath`). */
export interface PloughAssignment {
  fieldId: number;
  /** Id dílu v herním jádru (díl bez id – starší data – null). */
  partId: number | null;
  field: PloughField;
}

/** Spřežení dnes orá – rozdělení práce dne má orbu. */
export function ploughingToday(village: Pick<SceneVillage, 'labor'>): boolean {
  return (village.labor?.shares ?? []).some((s) => s.activity === 'plough' && s.manDays > 0);
}

/** Kolik spřežení ves má – ohrady s vycvičenými voly, nejméně jedno (orba bez ohrady v datech). */
export function ploughTeamCount(village: Pick<SceneVillage, 'pens'>): number {
  return Math.max(1, (village.pens ?? []).filter((p) => p.oxen > 0).length);
}

/**
 * Kam orba na dílu došla (0–1 napříč řadami od strany blíž vsi): rozpracovaný díl k čáře práce
 * po pruzích obtisku (`workSteps`), zoraný celý 1, nezoraný 0.
 */
export function ploughedTo(view: Pick<PartView, 'look' | 'work'>): number {
  if (view.look === 'plowed') return view.work !== null ? workSteps(view.work) : 1;
  return UNPLOUGHED.has(view.look) ? 0 : 1;
}

/**
 * Pruh u čáry práce (m od strany, kde práce na dílu začíná): končí na čáře, nejvýš
 * FRONT_STRIP_M zpět do zorané části, aspoň MIN_STRIP_M (na začátku dílu kus za čáru).
 */
export function frontStrip(line: number, size: number): { lo: number; hi: number } {
  const hi = Math.min(size, Math.max(line * size, MIN_STRIP_M));
  return { lo: Math.max(0, hi - FRONT_STRIP_M), hi };
}

/** Kolik řad na pruhu šířky `width` (m): sudý počet po ≈ PLOUGH_ROW_M, aspoň dvě. */
export function stripRows(width: number): number {
  return Math.max(2, 2 * Math.round(width / (2 * PLOUGH_ROW_M)));
}

/** Díl fronty orby s polem, rámcem práce a místem, kam orba došla. */
interface Candidate {
  fieldId: number;
  part: SceneFieldPart;
  along: [number, number];
  across: [number, number];
  line: number;
}

/** Obdélník ve světě (střed, osy a poloviny stran) – kam až dráha spřežení sahá. */
interface Footprint {
  x: number;
  z: number;
  ax: [number, number];
  bx: [number, number];
  ha: number;
  hb: number;
}

/**
 * Kam sahá dráha spřežení na dílu i se souvratěmi (ať pruh na dílu je jakýkoli): podél řad
 * za okraj o dosah rádla a obrat (kapka sahá až (1 + √3) × poloměr obratu), napříč o poloměr
 * obratu; obojí i s tělem spřežení.
 */
function footprint(c: Candidate): Footprint {
  const half = c.part.size / 2;
  return {
    x: c.part.x,
    z: c.part.z,
    ax: c.along,
    bx: c.across,
    ha: half + ardReach() + (1 + Math.sqrt(3)) * TURN_RADIUS_M + TEAM_BODY_M,
    hb: half + TURN_RADIUS_M + TEAM_BODY_M,
  };
}

/** Překrývají se dva natočené obdélníky? (věta o oddělující ose – 4 osy) */
function overlaps(a: Footprint, b: Footprint): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  for (const [ux, uz] of [a.ax, a.bx, b.ax, b.bx]) {
    const radius = (f: Footprint): number =>
      f.ha * Math.abs(f.ax[0] * ux + f.ax[1] * uz) + f.hb * Math.abs(f.bx[0] * ux + f.bx[1] * uz);
    if (Math.abs(dx * ux + dz * uz) > radius(a) + radius(b) - 1e-9) return false;
  }
  return true;
}

/**
 * Díly fronty orby jednoho podílu práce v pořadí, jak čerstvě se na nich oralo: nejdřív čelo
 * (rozpracovaný díl, bez něj poslední díl dnešní fronty), pak díly před ním od posledního, nakonec
 * díly, na které orba teprve přijde (jen v odhadu bez fronty od jádra).
 */
function shareCandidates(
  village: Pick<SceneVillage, 'labor' | 'fields' | 'dwellings'>,
  share: SceneLaborShare,
): Candidate[] {
  if (share.target.kind !== 'field') return [];
  const fieldId = share.target.id;
  const field = village.fields.find((f) => f.id === fieldId);
  if (!field || field.parts.length === 0) return [];
  const day = village.labor?.day ?? 0;
  const views = fieldPartViews(field, { dayOfYear: dateOfDayIndex(day).dayOfYear, village });
  // fronta od herního jádra (díly, přes které dnes orba postoupila), jinak odhad jako u kopání
  const worked = workedParts(views, 'dig', share.parts);
  if (worked.length === 0) return [];
  let front = -1;
  worked.forEach((v, i) => {
    if (v.work !== null && v.look === 'plowed') front = i;
  });
  if (front < 0) front = share.parts && share.parts.length > 0 ? worked.length - 1 : 0;
  const order = [...worked.slice(0, front + 1).reverse(), ...worked.slice(front + 1)];
  const rows = rowDirection(field.parts);
  const center = villageCenter(village, field.parts);
  return order.map((view) => {
    const frame = workFrame(view.part, rows, center);
    return {
      fieldId,
      part: view.part,
      along: frame.along,
      across: frame.across,
      line: ploughedTo(view),
    };
  });
}

/** Pruh napříč řadami (m od strany, kde práce začíná) na dílu jako pole orby pro `ploughPath`. */
function stripField(c: Candidate, lo: number, hi: number): PloughField {
  const half = c.part.size / 2;
  return {
    x: c.part.x,
    z: c.part.z,
    size: c.part.size,
    dirX: c.along[0],
    dirZ: c.along[1],
    rows: stripRows(hi - lo),
    from: lo - half,
    to: hi - half,
    acrossX: c.across[0],
    acrossZ: c.across[1],
  };
}

/**
 * Kde dnes orají spřežení (jedno na ohradu s voly): každé na jiném dílu dnešní fronty orby –
 * první na čele, další na dílech, kam jeho dráha (i souvratě) nesahá; když takový díl není,
 * přidá se k už obsazenému dílu (dva pruhy vedle sebe, nejvýš dvě spřežení na díl). Kdo se
 * nevejde, zůstane v ohradě. Pruh dílu: u čáry práce (`frontStrip`) ve směru práce od vsi.
 * Bez orby dne žádné.
 */
export function ploughFront(
  village: Pick<SceneVillage, 'labor' | 'fields' | 'pens' | 'dwellings'>,
): PloughAssignment[] {
  const shares = (village.labor?.shares ?? []).filter(
    (s) => s.activity === 'plough' && s.manDays > 0 && s.target.kind === 'field',
  );
  if (shares.length === 0) return [];
  // podíly jdou v pořadí postupu – čelo je v posledním
  const candidates = [...shares].reverse().flatMap((share) => shareCandidates(village, share));
  const teams = ploughTeamCount(village);
  const lanes: { candidate: Candidate; footprint: Footprint; members: number }[] = [];
  for (let team = 0; team < teams; team++) {
    const free = candidates.find((c) => {
      const f = footprint(c);
      return lanes.every((lane) => !overlaps(lane.footprint, f));
    });
    if (free) {
      lanes.push({ candidate: free, footprint: footprint(free), members: 1 });
      continue;
    }
    const shared = lanes
      .filter((lane) => lane.members < TEAMS_PER_PART)
      .reduce<(typeof lanes)[number] | null>(
        (best, lane) => (!best || lane.members < best.members ? lane : best),
        null,
      );
    if (!shared) break;
    shared.members++;
  }
  return lanes.flatMap(({ candidate, members }) => {
    const size = candidate.part.size;
    const strip = frontStrip(candidate.line, size);
    // víc spřežení na dílu: pruh se rozšíří zpět do zorané části (pak dál za čáru)
    const width =
      members > 1
        ? Math.min(size, Math.max(strip.hi - strip.lo, members * SHARED_STRIP_M))
        : strip.hi - strip.lo;
    const lo = Math.max(0, Math.min(strip.hi - width, size - width));
    const step = width / members;
    return Array.from({ length: members }, (_, k) => ({
      fieldId: candidate.fieldId,
      partId: candidate.part.id ?? null,
      field: stripField(candidate, lo + k * step, lo + (k + 1) * step),
    }));
  });
}
