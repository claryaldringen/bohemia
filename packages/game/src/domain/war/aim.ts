import type { Random } from '../landscape/random';
import type { BattleField, BattleSide, Fighter } from './battle';
import type { Pos } from './march-grid';
import { dist2 } from './orders';
import { WAR } from './rules-war';

// Střelba podle dovednosti (fortifications.md – Střelba a viditelná plocha; war.md – Boj – Souboj
// mužů; Martin 8. 11. 2026): střelec míří do kruhu rozptylu kolem cíle – čím lepší, tím menší kruh.
// Šance na zásah = součet viditelných ploch všech lidí na nohou v kruhu ÷ plocha kruhu (nejvýš 1),
// koho šíp trefí, určí los váhou podle plochy – hlouček je snadný cíl a šíp smí trefit i vlastního.
// Jsou-li v kruhu jen vlastní, střelec nestřílí. Los ze seedu války v pořadí mužů. Jen det-math.

/** Jak je cíl vidět: stojí, kryje se předprsní na ochozu, leze po žebříku, je v podkopu. */
export type TargetPose = 'standing' | 'parapet' | 'climbing' | 'underground';

/**
 * Poloha muže na bojišti pro střelbu. Zatím všichni stojí – lezce na žebříku, obránce na ochozu
 * a kopáče v podkopu doplní Úlohy 9, 12 a 14 plánu hradeb.
 */
export const poseOf: (f: Fighter, field: BattleField) => TargetPose = () => 'standing';

/** Viditelná plocha cíle v m² (stojící 0,85, za předprsní 0,25, lezec 0,85, v podkopu 0). */
export function visibleAreaM2(pose: TargetPose): number {
  return pose === 'underground' ? 0 : WAR.combat.aim.visibleM2[pose];
}

/**
 * Poloměr kruhu rozptylu v m: `(2 − 1,5 × dovednost ÷ 100) × vzdálenost ÷ 30` (mistr 0,5 m na
 * 30 m, nováček 2 m). Dovednost se ořízne na 0–100.
 */
export function spreadRadiusM(skill: number, distanceM: number): number {
  const a = WAR.combat.aim;
  const s = Math.min(100, Math.max(0, skill));
  return ((a.baseM - (a.skillM * s) / 100) * distanceM) / a.refM;
}

/** Člověk v kruhu rozptylu – id bojovníka, strana a viditelná plocha. */
export interface ShotCandidate {
  id: string;
  side: BattleSide;
  areaM2: number;
}

/** Šance, že šíp někoho v kruhu trefí: součet ploch ÷ plocha kruhu, nejvýš 1. */
export function shotChance(candidates: readonly ShotCandidate[], radiusM: number): number {
  let area = 0;
  for (const c of candidates) area += Math.max(0, c.areaM2);
  if (area <= 0) return 0;
  const circle = Math.PI * radiusM * radiusM;
  return circle <= area ? 1 : area / circle;
}

/**
 * Koho šíp trefí: `roll` (0–1) pod šancí `shotChance` = zásah, `pick` (0–1) vybere zasaženého
 * váhou podle plochy v pořadí kandidátů; jinak null (šíp padl mimo).
 */
export function shotHit(
  candidates: readonly ShotCandidate[],
  radiusM: number,
  roll: number,
  pick: number,
): string | null {
  if (roll >= shotChance(candidates, radiusM)) return null;
  let total = 0;
  for (const c of candidates) total += Math.max(0, c.areaM2);
  let left = pick * total;
  let last: string | null = null;
  for (const c of candidates) {
    if (c.areaM2 <= 0) continue;
    last = c.id;
    left -= c.areaM2;
    if (left < 0) return c.id;
  }
  return last;
}

/**
 * Lidé na nohou obou stran (ne padlí, ranění ani ti, kdo z bojiště utekli), jejichž střed leží
 * v kruhu `radiusM` kolem `at`, v pořadí bojovníků; střelec sám ne.
 */
export function shotCandidates(
  at: Pos,
  radiusM: number,
  fighters: readonly Fighter[],
  shooter: Pick<Fighter, 'id'>,
  pose: (f: Fighter) => TargetPose,
): ShotCandidate[] {
  const r2 = radiusM * radiusM;
  const out: ShotCandidate[] = [];
  for (const f of fighters) {
    if (f.id === shooter.id || f.state === 'down' || f.state === 'fled') continue;
    if (dist2(f.pos, at) > r2 + 1e-9) continue;
    out.push({ id: f.id, side: f.side, areaM2: visibleAreaM2(pose(f)) });
  }
  return out;
}

/** Výstřel: nestřílí (v kruhu nikdo z nepřátel), nebo vystřelil a šíp trefil `hit` (null = mimo). */
export type BowShot = { fired: false } | { fired: true; hit: string | null };

/**
 * Výstřel lukem na `target`: kruh rozptylu podle dovednosti luku střelce (chybí – jako vesničan
 * 20) a vzdálenosti, v něm všichni na nohou. Nestřílí, když v kruhu není vidět žádný nepřítel
 * (rána zůstane na další takt). Jinak dva losy ze seedu – zda šíp trefí a koho.
 */
export function bowShot(
  shooter: Fighter,
  target: Fighter,
  fighters: readonly Fighter[],
  pose: (f: Fighter) => TargetPose,
  rng: Random,
): BowShot {
  const distanceM = Math.sqrt(dist2(shooter.pos, target.pos));
  const skill = shooter.bowSkill ?? WAR.combat.aim.villagerSkill;
  const radiusM = spreadRadiusM(skill, distanceM);
  const candidates = shotCandidates(target.pos, radiusM, fighters, shooter, pose);
  if (!candidates.some((c) => c.side !== shooter.side && c.areaM2 > 0)) return { fired: false };
  const roll = rng.next();
  const pick = rng.next();
  return { fired: true, hit: shotHit(candidates, radiusM, roll, pick) };
}
