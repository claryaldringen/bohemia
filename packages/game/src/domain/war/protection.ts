import { inDisasterProtection } from '../village/disaster-schedule';
import { WAR } from './rules-war';

// Ochrana nového hráče a nové vsi před válkou (docs/design/war.md – Ochrana nového hráče).

const DAY_MS = 86_400_000;

/** Rod pro ochranu: druh a kdy vznikl (stačí jeho tvar, doména nezná `House` z use-casů). */
export interface ProtectedHouse {
  kind: 'player' | 'npc';
  createdAt: Date;
  /** Umístění na mapu světa (newcomers.md) – ochrana běží od něj; chybí/null – od založení. */
  placedAt?: Date | null;
}

/**
 * Do kdy je rod chráněn před napadením: 7 skutečných dní od založení (Martin 2. 11. 2026 – „ok“),
 * u nováčka z odříznuté krajiny od umístění na mapu světa (newcomers.md – Odříznutá krajina).
 * Ochrana **skončí dřív**, když rod sám napadl – opověděl válku nebo jeho vojsko zaútočilo
 * (`ownAttackAt`, čas prvního útoku). Vrací konec ochrany, nebo null – rod chráněn není (NPC rod,
 * nebo ochranu ukončil vlastní útok). Platí i po Začít znovu – nový rod je nový začátek.
 */
export function houseProtectedUntil(house: ProtectedHouse, ownAttackAt: Date | null): Date | null {
  if (house.kind !== 'player') return null;
  // odříznutý nováček (newcomers.md) má ochranu až od umístění na mapu světa
  const since = house.placedAt ?? house.createdAt;
  const until = new Date(since.getTime() + WAR.newLineProtectionDays * DAY_MS);
  if (ownAttackAt !== null && ownAttackAt.getTime() < until.getTime()) return null;
  return until;
}

/** Zbývá ochrany v celých dnech (nahoru), 0 – ochrana už skončila. */
export function protectionDaysLeft(until: Date | null, now: Date): number {
  if (until === null) return 0;
  const left = until.getTime() - now.getTime();
  return left > 0 ? Math.ceil(left / DAY_MS) : 0;
}

/**
 * Nová ves rodu: prvních 5 herních let ji nikdo nenapadne – stejně jako ji nezasáhne pohroma
 * (Martin 27. 10. 2026: „Pětiletou ochranu“; převzetí do války je návrh Clauda).
 */
export function villageProtected(state: { foundedDay: number }, day: number): boolean {
  return inDisasterProtection(state.foundedDay, day);
}

/** Skloňování „1 den, 2 dny, 5 dní“. */
export function daysWord(days: number): string {
  if (days === 1) return 'den';
  return days >= 2 && days <= 4 ? 'dny' : 'dní';
}

/** Důvod odmítnutí: „Ctibor je pod ochranou ještě 3 dny.“ (`name` = jméno hlavy rodu). */
export function protectedReason(name: string, daysLeft: number): string {
  return `${name} je pod ochranou ještě ${daysLeft} ${daysWord(daysLeft)}.`;
}
