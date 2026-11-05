import { pendingStewardDepartures } from '../domain/village';
import { announceSenior } from './announce-senior';
import { resolveSuccessionOf } from './player-succession';
import { settleStewardDeparturesSafely } from './settle-steward-departures';
import {
  dynastyStatus,
  type DynastyDeps,
  type DynastyInput,
  type DynastyStatus,
} from './restart-game';

/** Nejvýš tolik kol vybavení schránek za jeden dopočet (nová ves může mít vlastní odchod). */
export const DEPARTURE_ROUNDS = 4;

/**
 * Plný dopočet rodu: vsi hráče dopočítané do dneška (`dynastyStatus`); za dopočtem se vybaví
 * odchozí schránky správce (steward.md – Kde správce běží) – nové vsi synů vzniknou a dopočítají
 * se v dalším kole. Volající drží zámek hráče (`PlayerLock`), tady se nevnořuje. Volá ho web
 * i worker, ať kola schránek existují jednou.
 */
export async function advanceDynasty(
  deps: DynastyDeps & { worldSeed: number },
  input: DynastyInput,
): Promise<DynastyStatus> {
  let status = await dynastyStatus(deps, input);
  for (let round = 0; round < DEPARTURE_ROUNDS; round++) {
    let settled = 0;
    for (const village of status.villages) {
      if (pendingStewardDepartures(village.state).length === 0) continue;
      const founded = await settleStewardDeparturesSafely(deps, {
        playerId: input.playerId,
        villageId: village.id,
      });
      settled += founded.length;
    }
    if (settled === 0) break;
    status = await dynastyStatus(deps, input);
  }
  // senior rodu se mohl změnit (smrt, narození, příchod) – kronika ho hlásí všem vsím rodu
  if (deps.houses && !status.gameOver) {
    await resolveSuccessionOf(deps, input);
    await announceSenior(
      { houses: deps.houses, villages: deps.villages },
      { playerId: input.playerId, villages: status.villages, today: input.today },
    );
  }
  return status;
}
