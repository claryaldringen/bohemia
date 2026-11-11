import type { WorldClock } from '../calendar';
import type { HerdSpecies } from '../village/types/types-livestock';
import type { GridCell } from '../village/people/world-grid';
import type { CampaignPlace, CampaignState } from './campaign-types';
import { returnDayAfter } from './flight';
import { flightEtaTicks } from './refuge-choice';
import { hoursPerTick } from './ticks';

// Návrat uprchlíků domů (war.md – Varování, poslové a útěk do hradiště: „domů se vrátí, až vojsko
// odtáhne z jejich mapy – rozhodne hráč, za nepřítomného správce“; plán 2026-11-09 – Úloha 10,
// Otevřené 11). Čistá pravidla pro use-case `returnFromRefuge` – stav tažení jen čtou.

/** Stojí na políčku `cell` skupina tažení `s` s aktivním mužem – vojsko je ještě na mapě? */
export function armyOnCell(s: CampaignState, cell: GridCell): boolean {
  return s.groups.some(
    (g) =>
      g.cell.x === cell.x &&
      g.cell.y === cell.y &&
      s.members.some((m) => m.group === g.id && m.status === 'active'),
  );
}

/**
 * Jde vojsko tažení `s` teprve na ves `villageId` (cíl ve shromáždění, na pochodu nebo v nájezdu)?
 * Správce lidi domů nevrací, dokud vojsko nepřitáhlo a neodtáhlo (návrh Clauda – jinak by je
 * vrátil vstříc vojsku, které o ves ještě nezavadilo).
 */
export function armyApproaching(s: CampaignState, villageId: string): boolean {
  if (s.target.villageId !== villageId) return false;
  return s.phase === 'assembling' || s.phase === 'marching' || s.phase === 'raiding';
}

/**
 * Za kolik dní dojdou uprchlíci z hradiště `from` domů `to` (Otevřené 11 – cesta zpět se
 * nesimuluje, vojsko odtáhlo): `ceil(flightEtaTicks ÷ takty herního dne)` – vzdušnou čarou × 1,3
 * tempem skupiny (jen lidé pěšky, se stádem tempem stáda).
 */
export function refugeReturnDays(
  from: CampaignPlace,
  to: CampaignPlace,
  herd: Readonly<Record<HerdSpecies, number>>,
  day: number,
  world: WorldClock,
): number {
  let head = 0;
  for (const n of Object.values(herd)) head += Math.max(0, n);
  const ticks = flightEtaTicks(
    from,
    to,
    { onFoot: 1, riders: 0, woundedOnFoot: 0, herd: head },
    day,
  );
  const ticksPerDay = 24 / hoursPerTick(world);
  return Math.max(0, Math.ceil(ticks / ticksPerDay - 1e-9));
}

/** Co správce (a NPC rod) o návratu vsi ví. */
export interface StewardReturnInput {
  /** Den odchodu skupiny (`VillageRefuge.departedDay`). */
  departedDay: number;
  /** Poslední den, kdy vojsko stálo na mapě vsi (`VillageState.raidDay`); chybí – nestálo. */
  raidDay?: number;
  today: number;
  /** Stojí vojsko některého tažení na mapě vsi (`armyOnCell`)? */
  armyOnMap: boolean;
  /** Jde vojsko některého tažení teprve na ves (`armyApproaching`)? */
  approaching: boolean;
}

/**
 * Vrátí správce lidi domů dnes (Otevřené 11): vojsko na mapě nestojí ani na ves teprve nejde
 * a od posledního dne nájezdu (nebo od odchodu, když vojsko na mapě nestálo) uplynul den
 * návratu (`returnDayAfter` – 1 herní den).
 */
export function stewardMayReturn(input: StewardReturnInput): boolean {
  if (input.armyOnMap || input.approaching) return false;
  const last = Math.max(input.raidDay ?? input.departedDay, input.departedDay);
  return returnDayAfter(last) <= input.today;
}
