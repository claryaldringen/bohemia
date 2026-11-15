import type { Landscape } from '../domain/landscape';
import { baptizeVillage } from '../domain/village';
import { sendRodBaptized, type RodBaptizedDeps } from './advance-christianity';
import type { HouseRepository } from './houses';
import { ACTION_RIGHTS, requireRight, type RightsDeps } from './rights';
import type { StewardshipRepository } from './stewardships';
import { updateVillage } from './update-village';

// Křest vojvody (christianity.md – Křest rodu): hráč nechá svého vojvodu pokřtít – rod je od toho
// dne pokřtěný, ves vojvody se pokřtí hned (`baptizeVillage` pod zámkem `updateVillage` – kříž,
// propuštění manželek i huť jsou vidět ihned; Martin 15. 11. 2026) a ostatní vsi rodu se to dozvědí
// schránkou (`sendRodBaptized`). Zpráva vsi vojvody pak nic nezdvojí (`baptizeVillage` je
// idempotentní). Krok nejde vzít zpět.

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
 * (`markBaptized` – ze souběžných volání uspěje jedno) a nakonec hned ves vojvody. Pád mezi kroky
 * nic nezdvojí: zpráva ve schránce ves pokřtí, kdyby ji nestihl přímý zápis. Jinak důvod česky.
 */
export async function baptizeLord(
  deps: BaptizeDeps,
  input: { playerId: string; villageId: string; today: number; landscape: Landscape },
): Promise<BaptizeResult> {
  const found = await requireRight(deps, { ...input, right: ACTION_RIGHTS.baptizeLord });
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
  // ves vojvody hned (jinak by čekala na začátek dalšího dne); zpráva ze schránky pak nic nezmění
  const day = input.today;
  const village = await updateVillage(
    deps.villages,
    found.village.id,
    input.today,
    input.landscape,
    (state) => {
      const next = structuredClone(state);
      next.chronicle.push(...baptizeVillage(next, day, { houseId: house.id, lord: true }));
      return { ok: true, state: next };
    },
  );
  if (!village.ok) return village;
  return { ok: true };
}
