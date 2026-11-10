import { sendRodBaptized, type RodBaptizedDeps } from './advance-christianity';
import type { HouseRepository } from './houses';
import { requireRight, type RightsDeps } from './rights';
import type { StewardshipRepository } from './stewardships';

// Křest vojvody (christianity.md – Křest rodu): hráč nechá svého vojvodu pokřtít – rod je od toho
// dne pokřtěný a všechny vsi rodu se to dozvědí schránkou (`sendRodBaptized` → `baptizeVillage`:
// den křtu, ve vsi vojvody křest a propuštění vedlejších manželek). Krok nejde vzít zpět.

/** Proč křest nejde – důvod u tlačítka i odpověď use-casu (jediné místo textů). */
export const BAPTIZE_REASONS = {
  unknown: 'Rod křesťanství nezná.',
  done: 'Rod je už pokřtěný.',
  lordAway: 'Tvůj vojvoda tu není.',
} as const;

export interface BaptizeDeps extends RightsDeps {
  houses: Pick<HouseRepository, 'activeOf' | 'byId' | 'markBaptized'>;
  stewardships: Pick<StewardshipRepository, 'of'> & RodBaptizedDeps['stewardships'];
}

export type BaptizeResult = { ok: true } | { ok: false; reason: string };

/**
 * Hráč nechá pokřtít vojvodu svého rodu ve vsi `villageId`: právo rozhodnutí rodu (`ennoble` – jen
 * držitel vlastní vsi), rod křesťanství zná a pokřtěný ještě není, vojvoda rodu (`House.lord`) žije
 * v té vsi. Nejdřív zpráva vsím (jedinečný `ref` – opakování nic nezdvojí), pak rod
 * (`markBaptized` – ze souběžných volání uspěje jedno). Jinak důvod česky.
 */
export async function baptizeLord(
  deps: BaptizeDeps,
  input: { playerId: string; villageId: string; today: number },
): Promise<BaptizeResult> {
  const found = await requireRight(deps, { ...input, right: 'ennoble' });
  if (typeof found === 'string') return { ok: false, reason: found };
  const house = await deps.houses.activeOf(input.playerId);
  if (!house || house.christianityKnownYear === null) {
    return { ok: false, reason: BAPTIZE_REASONS.unknown };
  }
  if (house.baptizedDay !== null) return { ok: false, reason: BAPTIZE_REASONS.done };
  if (house.lord?.villageId !== found.village.id) {
    return { ok: false, reason: BAPTIZE_REASONS.lordAway };
  }
  await sendRodBaptized(deps, house.id, input.today);
  if (!(await deps.houses.markBaptized(house.id, input.today))) {
    return { ok: false, reason: BAPTIZE_REASONS.done };
  }
  return { ok: true };
}
