import { INVITES } from '../domain/world';
import { expireNewcomerWaits, type NewcomerWorldDeps } from './newcomers';
import { openAnnualDialogs, type AnnualLevyDeps } from './annual-levies';
import type { ActivityRepository } from './activity';
import type { HouseRepository } from './houses';
import type { InviteRepository } from './invites';
import type { NoticeRepository } from './notices';
import {
  notifyProtectionEnding,
  quietWars,
  type ProtectionNoticeDeps,
  type QuietWarsDeps,
} from './declare-war';
import { sendDomainFood, type DomainFoodDeps } from './domain-food';
import { reconcileShipments, type ShipmentDeps } from './shipments';
import { lapseSummons } from './summons';

/** Port kreditů nástupnictví bez losu (vassalage.md – Pozvaný jako vazal). */
export interface SuccessionCreditRepository {
  /** Připíše pozvateli kredit za pozvaného; true jen poprvé (unikát na pozvaného). */
  grantOnce(playerId: string, inviteeId: string, at: Date): Promise<boolean>;
  /** Počet nevyužitých kreditů pozvatele. */
  unused(playerId: string): Promise<number>;
  /** Použije jeden kredit při nástupnictví v herní den `deathDay`; false, když žádný není. */
  consumeOne(playerId: string, deathDay: number): Promise<boolean>;
}

export interface SuccessionCreditDeps {
  invites: InviteRepository;
  activity: ActivityRepository;
  credits: SuccessionCreditRepository;
  notices: NoticeRepository;
  houses: HouseRepository;
}

/**
 * Připíše pozvatelům kredity za pozvané, kteří byli ve hře aspoň `INVITES.playedDays` různých dnů,
 * a pošle jim upozornění `'invitee-played'`. Zdrojem pozvaných jsou využité pozvánkové kódy, ne
 * vazalství: kód zůstává, i když pozvaný vazalství vypověděl, přešel pod jiného pána nebo pán
 * vymřel (pozvaný pak začal nezávisle) – kredit se má připsat vždy (vassalage.md). Vrací počet
 * nově připsaných kreditů.
 */
export async function grantSuccessionCredits(
  deps: SuccessionCreditDeps,
  input: { now: Date; today: number },
): Promise<number> {
  let granted = 0;
  for (const invite of await deps.invites.listUsed()) {
    if (invite.usedBy === null) continue;
    if ((await deps.activity.distinctDays(invite.usedBy)) < INVITES.playedDays) continue;
    if (!(await deps.credits.grantOnce(invite.issuerId, invite.usedBy, input.now))) continue;
    granted++;
    await deps.notices.post({
      playerId: invite.issuerId,
      kind: 'invitee-played',
      // jen veřejné id rodu pozvaného – id účtu cizího hráče do prohlížeče nepatří
      payload: { houseId: (await deps.houses.activeOf(invite.usedBy))?.id ?? null },
      gameDay: input.today,
    });
  }
  return granted;
}

/** Závislosti úloh světa; `shipments` jen tam, kde se zásilky obnovují (worker). */
export type WorldTaskDeps = SuccessionCreditDeps & {
  shipments?: ShipmentDeps;
  levies?: AnnualLevyDeps;
  /** Války a ochrana nováčka (war.md): utichání válek, upozornění na konec ochrany. */
  wars?: QuietWarsDeps & ProtectionNoticeDeps;
  /** Svolání bez odpovědi propadne s koncem války (vassalage.md – Svolání). */
  summons?: Parameters<typeof lapseSummons>[0];
  /** Nováček po týdnu čekání dostane pána losem, nebo začne svobodný (newcomers.md). */
  newcomers?: NewcomerWorldDeps;
  /** Jídlo domény po žních (hillfort.md – Jídlo domény): vsi držitele si rozdělí přebytek. */
  domainFood?: DomainFoodDeps;
};

/**
 * Úlohy světa, které worker pouští jednou za minutu mezi koly: kredity nástupnictví, obnova
 * zásilek po pádu (`reconcileShipments`), jídlo domény po žních (`sendDomainFood` – po obnově
 * zásilek, ať vidí, co je na cestě) a konec týdne čekání nováčků (`expireNewcomerWaits`).
 */
export async function runWorldTasks(
  deps: WorldTaskDeps,
  input: { now: Date; today: number },
): Promise<void> {
  await grantSuccessionCredits(deps, input);
  if (deps.shipments) await reconcileShipments(deps.shipments, input.today);
  if (deps.domainFood) await sendDomainFood(deps.domainFood, { today: input.today });
  if (deps.levies) await openAnnualDialogs(deps.levies, { today: input.today });
  if (deps.wars) {
    await quietWars(deps.wars, input);
    await notifyProtectionEnding(deps.wars, input);
  }
  if (deps.summons) await lapseSummons(deps.summons, input);
  if (deps.newcomers) await expireNewcomerWaits(deps.newcomers, input);
}
