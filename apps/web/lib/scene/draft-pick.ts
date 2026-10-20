// Výběr spřežení s rádlem a vozu kliknutím (villagers.md – Výběr postavy; oxen.md a wagons.md –
// Výběr spřežení a vozu): voli, rádlo, korba vozu a lidé u nich jako válce (úsečka s poloměrem)
// promítnuté na plátno; vybere se díl nejblíž kurzoru. Čisté funkce bez Babylonu – průmět bodu
// světa na plátno dodá scéna. Jen při kliknutí, O(spřežení + vozů).
import type { CartKind } from '@bohemia/game';
import { CART_PARTS, CART_SCALE, type CartPose } from './cart-layout';
import { TEAM_PARTS, TEAM_SCALE, type FigurePose, type TeamPose } from './plough-team';
import type { VillageTarget } from './village-picking';
import { FIGURE_HEIGHT_M, PICK_PX, distanceToSegment, type Project } from './villager-pick';
import type { PersonJob } from './villager-roster';

/** Díl spřežení s rádlem pod kurzorem: vůl, rádlo s ojí, oráč, honák. */
export type TeamPart = 'ox' | 'ard' | 'ploughman' | 'leader';
/** Díl vozu pod kurzorem: vůl, korba (i s nákladem), vozka. */
export type CartPart = 'ox' | 'body' | 'drover';

/** Válec pro výběr: úsečka a–b (m, svět) a poloměr (m); poloměr 0 = postava (čára). */
export interface PickCapsule {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  radius: number;
}

/**
 * Postava má u stejné vzdálenosti přednost před dílem, ve kterém stojí (oráč u rukojeti rádla,
 * vozka vedle vola) – o tolik px se jí vzdálenost zmenší.
 */
export const PERSON_BIAS_PX = 4;

/** Vůl pro výběr: tělo podél směru (m při měřítku 1) – od zadku po hlavu, výška a poloměr. */
const OX = { back: 1.1, front: 1.1, height: 0.85, radius: 0.5 } as const;
/** Rádlo s ojí: poloměr válce podél oje (m). */
const ARD_RADIUS_M = 0.3;
/** Korba vozu: výška osy válce nad zemí a přídavek k poloviční šířce (náklad, m). */
const BODY = { height: 0.9, pad: 0.25 } as const;

/**
 * Vzdálenost kurzoru (x, y – CSS px) od průmětu válce: od průmětu úsečky minus poloměr v px
 * (na obou koncích průměrně); kurzor uvnitř – 0. Za kamerou null.
 */
export function capsuleDistance(
  c: PickCapsule,
  x: number,
  y: number,
  project: Project,
): number | null {
  const a = project(c.ax, c.ay, c.az);
  const b = project(c.bx, c.by, c.bz);
  if (!a || !b) return null;
  const d = distanceToSegment(x, y, a, b);
  if (c.radius <= 0) return d;
  const ua = project(c.ax, c.ay + c.radius, c.az);
  const ub = project(c.bx, c.by + c.radius, c.bz);
  const ra = ua ? Math.hypot(ua.x - a.x, ua.y - a.y) : 0;
  const rb = ub ? Math.hypot(ub.x - b.x, ub.y - b.y) : 0;
  return Math.max(0, d - (ra + rb) / 2);
}

/** Válec vola: tělo podél směru pohledu ve výšce hřbetu. */
function oxCapsule(o: FigurePose, scale: number): PickCapsule {
  const y = o.y + OX.height * scale;
  return {
    ax: o.x - o.hx * OX.back * scale,
    ay: y,
    az: o.z - o.hz * OX.back * scale,
    bx: o.x + o.hx * OX.front * scale,
    by: y,
    bz: o.z + o.hz * OX.front * scale,
    radius: OX.radius * scale,
  };
}

/** Postava jako čára od nohou po hlavu (jako výběr lidí – villager-pick.ts). */
function figureCapsule(f: FigurePose, scale: number): PickCapsule {
  return {
    ax: f.x,
    ay: f.y,
    az: f.z,
    bx: f.x,
    by: f.y + FIGURE_HEIGHT_M * scale,
    bz: f.z,
    radius: 0,
  };
}

/** Díl pod kurzorem: kolikátý (spřežení, vůz), který díl a vzdálenost (px). */
export interface DraftHit<P> {
  index: number;
  part: P;
  distance: number;
}

/** Nejbližší díl do `maxPx` (postavy s přednostní PERSON_BIAS_PX); nic – null. */
function nearest<P>(
  items: readonly { index: number; part: P; capsule: PickCapsule; person: boolean }[],
  x: number,
  y: number,
  project: Project,
  maxPx: number,
): DraftHit<P> | null {
  let best: DraftHit<P> | null = null;
  let bestScore = Infinity;
  for (const item of items) {
    const d = capsuleDistance(item.capsule, x, y, project);
    if (d === null || d > maxPx) continue;
    const score = d - (item.person ? PERSON_BIAS_PX : 0);
    if (score < bestScore) {
      bestScore = score;
      best = { index: item.index, part: item.part, distance: d };
    }
  }
  return best;
}

/**
 * Spřežení s rádlem pod kurzorem (`poses` – poslední zapsané pózy spřežení po pořadí): voli,
 * rádlo s ojí, oráč a honák. Nic do `maxPx` – null.
 */
export function pickTeam(
  poses: readonly TeamPose[],
  x: number,
  y: number,
  project: Project,
  maxPx = PICK_PX,
): DraftHit<TeamPart> | null {
  const items: { index: number; part: TeamPart; capsule: PickCapsule; person: boolean }[] = [];
  poses.forEach((pose, index) => {
    for (const o of pose.oxen) {
      items.push({ index, part: 'ox', capsule: oxCapsule(o, TEAM_SCALE), person: false });
    }
    const p = pose.pole;
    items.push({
      index,
      part: 'ard',
      capsule: { ax: p.ax, ay: p.ay, az: p.az, bx: p.bx, by: p.by, bz: p.bz, radius: ARD_RADIUS_M },
      person: false,
    });
    items.push({
      index,
      part: 'ploughman',
      capsule: figureCapsule(pose.plowman, TEAM_SCALE),
      person: true,
    });
    items.push({
      index,
      part: 'leader',
      capsule: figureCapsule(pose.boy, TEAM_SCALE * TEAM_PARTS.boy.scale),
      person: true,
    });
  });
  return nearest(items, x, y, project, maxPx);
}

/**
 * Vůz pod kurzorem (`carts` – druh a poslední zapsaná póza po pořadí): korba (i stojící vůz
 * u ohrady), a u zapřaženého vozu voli a vozka. Vůz za krajem mapy ne. Nic do `maxPx` – null.
 */
export function pickCart(
  carts: readonly { kind: CartKind; pose: CartPose }[],
  x: number,
  y: number,
  project: Project,
  maxPx = PICK_PX,
): DraftHit<CartPart> | null {
  const items: { index: number; part: CartPart; capsule: PickCapsule; person: boolean }[] = [];
  carts.forEach(({ kind, pose }, index) => {
    if (pose.hidden) return;
    const k = CART_PARTS[kind];
    const b = pose.body;
    const len = Math.hypot(b.fx, b.fz) || 1;
    const fx = b.fx / len;
    const fz = b.fz / len;
    const y0 = b.y + BODY.height * CART_SCALE;
    items.push({
      index,
      part: 'body',
      capsule: {
        ax: b.x - fx * k.back * CART_SCALE,
        ay: y0,
        az: b.z - fz * k.back * CART_SCALE,
        bx: b.x + fx * k.front * CART_SCALE,
        by: y0,
        bz: b.z + fz * k.front * CART_SCALE,
        radius: (k.halfWidth + BODY.pad) * CART_SCALE,
      },
      person: false,
    });
    if (!pose.hitched) return;
    pose.oxen.forEach((o, j) => {
      if (j >= pose.team) return;
      items.push({ index, part: 'ox', capsule: oxCapsule(o, CART_SCALE), person: false });
    });
    items.push({
      index,
      part: 'drover',
      capsule: figureCapsule(pose.boy, CART_SCALE * CART_PARTS.drover.scale),
      person: true,
    });
  });
  return nearest(items, x, y, project, maxPx);
}

/** Co je ve spřežení vybrané: celé spřežení, nebo oráč či honák (člověk vsi). */
export type TeamFigure = 'team' | 'ploughman' | 'leader';
/** Co je u vozu vybrané: vůz (i se spřežením), nebo vozka (člověk vsi). */
export type CartFigure = 'cart' | 'drover';

/** Co je ze spřežení a vozů vybrané – celé, nebo člověk u nich (oráč, honák, vozka). */
export type DraftSelection =
  | { kind: 'team'; team: number; figure: TeamFigure }
  | { kind: 'cart'; cart: number; figure: CartFigure };

/** Spřežení nebo vůz pod kurzorem – kolikáté spřežení / id vozu, díl a vzdálenost (px). */
export type DraftPick =
  | { kind: 'team'; team: number; part: TeamPart; distance: number }
  | { kind: 'cart'; cart: number; part: CartPart; distance: number };

/** Lidé u spřežení a vozů dne (villager-plan.ts – `DraftCrew`), jak je zná scéna. */
export interface CrewLookup {
  teamCrew(team: number): { ploughman: number | null; leader: number | null } | null;
  cartDrover(cart: number): number | null;
}

/**
 * Co klik na spřežení či vůz vybere: oráče, honáka nebo vozku jako člověka vsi (villagers.md –
 * Výběr postavy), když ho scéna má; jinak – i u volů, rádla a korby – celé spřežení či vůz.
 */
export function draftHitTarget(hit: DraftPick, crew: CrewLookup | null): VillageTarget {
  if (hit.kind === 'team') {
    const members = crew?.teamCrew(hit.team) ?? null;
    const id =
      hit.part === 'ploughman'
        ? (members?.ploughman ?? null)
        : hit.part === 'leader'
          ? (members?.leader ?? null)
          : null;
    return id !== null ? { kind: 'person', id } : { kind: 'plough-team', team: hit.team };
  }
  const id = hit.part === 'drover' ? (crew?.cartDrover(hit.cart) ?? null) : null;
  return id !== null ? { kind: 'person', id } : { kind: 'cart', id: hit.cart };
}

/**
 * Co má ves ze spřežení a vozů zvýraznit pro výběr rozhraní: spřežení / vůz celé, člověk u nich
 * (`job` – oráč, honák, vozka z plánu postav) kroužkem pod ním; jinak nic.
 */
export function draftSelectionFor(
  target: VillageTarget | null,
  job: PersonJob | null,
): DraftSelection | null {
  if (target?.kind === 'plough-team') return { kind: 'team', team: target.team, figure: 'team' };
  if (target?.kind === 'cart') return { kind: 'cart', cart: target.id, figure: 'cart' };
  if (target?.kind !== 'person') return null;
  if (job?.kind === 'plough') return { kind: 'team', team: job.team, figure: job.role };
  if (job?.kind === 'cart') return { kind: 'cart', cart: job.cart, figure: 'drover' };
  return null;
}
