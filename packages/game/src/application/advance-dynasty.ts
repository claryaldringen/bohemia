import { isVillageAsleep, pendingStewardDepartures } from '../domain/village';
import { announceSenior } from './announce-senior';
import { acceptHolderTransfers } from './escheat';
import { nearbyStale, refreshNearbySafely } from './nearby';
import { settleSuccessionOf } from './player-departure';
import { settleStewardDeparturesSafely } from './settle-steward-departures';
import { deliverVillageMailSafely, hasVillageMail } from './village-mail';
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
 * se v dalším kole; po kolech se doručí odchozí schránky vsí s poštou (`deliverVillageMailSafely`,
 * village-mail.ts) a nespícím vsím se obnoví okolí (`refreshNearbySafely`, nearby.ts). Volající drží
 * zámek hráče (`PlayerLock`), tady se nevnořuje. Volá ho web i worker, ať kola schránek existují
 * jednou.
 */
export async function advanceDynasty(
  deps: DynastyDeps & { worldSeed: number },
  input: DynastyInput,
): Promise<DynastyStatus> {
  // 2. krok převodu odúmrti – sídla čekající na hráče převezme pod jeho zámkem (escheat.ts)
  await acceptHolderTransfers(deps, input.playerId);
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
  // odchozí schránky vsí (village-mail.ts) a okolí (nearby.ts) – po kolech odchodů správce, i nové
  // vsi
  for (const village of status.villages) {
    if (hasVillageMail(village.state)) await deliverVillageMailSafely(deps, village.id);
    if (!isVillageAsleep(village.state) && nearbyStale(village.state)) {
      await refreshNearbySafely(deps, village.id);
    }
  }
  // senior rodu se mohl změnit (smrt, narození, příchod) – kronika ho hlásí všem vsím rodu
  if (deps.houses && !status.gameOver) {
    await settleSuccessionOf(deps, input);
    await announceSenior(
      { houses: deps.houses, villages: deps.villages },
      { playerId: input.playerId, villages: status.villages, today: input.today },
    );
  }
  return status;
}
