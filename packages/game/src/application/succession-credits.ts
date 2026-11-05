import { INVITES } from '../domain/world';
import type { ActivityRepository } from './activity';
import type { InviteRepository } from './invites';
import type { NoticeRepository } from './notices';

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
      payload: { inviteeId: invite.usedBy },
      gameDay: input.today,
    });
  }
  return granted;
}

/** Úlohy světa, které worker pouští jednou za minutu mezi koly (zatím jen kredity). */
export async function runWorldTasks(
  deps: SuccessionCreditDeps,
  input: { now: Date; today: number },
): Promise<void> {
  await grantSuccessionCredits(deps, input);
}
