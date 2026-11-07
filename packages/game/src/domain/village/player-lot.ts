import { createRandom, deriveSeed } from '../landscape/random';
import { isLineMan } from './dynasty';
import { ageYears } from './people';
import { PLAYER_SUCCESSION, LORD } from './rules-lord';
import { successorOf } from './succession';
import type { VillageState } from './types';

// Los o nástupnictví hráče (seniorate.md – Nástupnictví hráče, bod 2): kdo je v losu a jak se
// losuje. Bez I/O; náhoda jen ze seedu vsi a dne smrti, takže výsledek nezávisí na dopočtu.

/** Kandidáti losu: nástupce vsi (id) a mladší synové zemřelého (id, od nejstaršího). */
export interface PlayerLotCandidates {
  successor: number | null;
  younger: number[];
}

/**
 * Kdo je v losu po smrti muže `deadId` ve vsi `state` ke dni smrti `deathDay`: nástupce vsi z rodu
 * (`successorOf` – syn hlavní manželky…) a mladší synové zemřelého, kteří ve vsi žijí a ke dni
 * smrti měli aspoň `LORD.leaveMinAge` let (ti, kdo by mohli vést odchod). Los je jen při aspoň
 * dvou kandidátech (`successor !== null && younger.length > 0`). Bez muže rodu `successor: null`.
 */
export function playerLotCandidates(
  state: Pick<VillageState, 'people' | 'ancestors'>,
  deathDay: number,
  deadId: number,
): PlayerLotCandidates {
  const successor = successorOf(state, deadId)?.id ?? null;
  const younger = state.people
    .filter(
      (p) =>
        isLineMan(p) &&
        p.fatherId === deadId &&
        p.id !== successor &&
        p.bornDay <= deathDay &&
        ageYears(p.bornDay, deathDay) >= LORD.leaveMinAge,
    )
    .sort((a, b) => a.bornDay - b.bornDay || a.id - b.id)
    .map((p) => p.id);
  return { successor, younger };
}

/** Je co losovat? (Aspoň nástupce a jeden mladší syn.) */
export function isPlayerLot(candidates: PlayerLotCandidates): boolean {
  return candidates.successor !== null && candidates.younger.length > 0;
}

/**
 * Los: nástupce s podílem `PLAYER_SUCCESSION.successorWeight`, zbytek rovným dílem mezi mladší
 * syny. `seed` je seed vsi; náhoda `deriveSeed(seed, 'player-lot:' + deathDay)`. Vrací id vylosované
 * osoby. Bez nástupce losují jen mladší synové rovným dílem; bez kandidátů chyba.
 */
export function drawPlayerLot(
  seed: number,
  deathDay: number,
  candidates: PlayerLotCandidates,
): number {
  const { successor, younger } = candidates;
  const roll = createRandom(deriveSeed(seed, 'player-lot:' + deathDay)).next();
  if (successor !== null) {
    const w = younger.length === 0 ? 1 : PLAYER_SUCCESSION.successorWeight;
    if (roll < w) return successor;
    return pickEqual(younger, (roll - w) / (1 - w));
  }
  return pickEqual(younger, roll);
}

function pickEqual(ids: readonly number[], share: number): number {
  const id = ids[Math.min(ids.length - 1, Math.floor(share * ids.length))];
  if (id === undefined) throw new Error('Los bez kandidátů.');
  return id;
}
