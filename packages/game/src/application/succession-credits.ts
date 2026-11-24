import { INVITES } from '../domain/world';
import { expireNewcomerWaits, type NewcomerWorldDeps } from './newcomers';
import {
  answerAbsentLevies,
  openAnnualDialogs,
  type AnnualLevyDeps,
  type LevyDeps,
} from './annual-levies';
import { expireNegotiations, type ExpireNegotiationsDeps } from './negotiation-expiry';
import { deliverPendingAcceptances, type PendingAcceptanceDeps } from './negotiate';
import { advanceChristianity, type ChristianityDeps } from './advance-christianity';
import type { ActivityRepository } from './activity';
import type { HouseRepository } from './houses';
import type { InviteRepository } from './invites';
import type { NoticeRepository } from './notices';
import { playerDays, type PlayerTimeDeps } from './player-time';
import {
  notifyProtectionEnding,
  quietWars,
  type ProtectionNoticeDeps,
  type QuietWarsDeps,
} from './declare-war';
import { sendDomainFood, type DomainFoodDeps } from './domain-food';
import { returnStewardRefugees, type StewardRefugeDeps } from './refuge-return';
import { reconcileShipments, type ShipmentDeps } from './shipments';
import { answerAbsentSummons, lapseSummons, type SummonsDeps } from './summons';
import { returnStrandedPeople, type VillageMailDeps } from './village-mail';

/** Port kreditů nástupnictví bez losu (vassalage.md – Pozvaný jako vazal). */
export interface SuccessionCreditRepository {
  /** Připíše pozvateli kredit za pozvaného; true jen poprvé (unikát na pozvaného). */
  grantOnce(playerId: string, inviteeId: string, at: Date): Promise<boolean>;
  /** Počet nevyužitých kreditů pozvatele. */
  unused(playerId: string): Promise<number>;
  /** Použije jeden kredit při nástupnictví v herní den `deathDay`; false, když žádný není. */
  consumeOne(playerId: string, deathDay: number): Promise<boolean>;
}

/** `offsets`: upozornění pozvatele nese jeho den (posun času hráče). */
export interface SuccessionCreditDeps extends PlayerTimeDeps {
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
  const dayOf = playerDays(deps, input.today);
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
      gameDay: await dayOf(invite.issuerId),
    });
  }
  return granted;
}

/** Závislosti úloh světa; `shipments` jen tam, kde se zásilky obnovují (worker). */
export type WorldTaskDeps = SuccessionCreditDeps & {
  shipments?: ShipmentDeps & PlayerTimeDeps;
  /**
   * Návrat uprchlíků (war.md – Varování, poslové a útěk do hradiště): správce a NPC rod vrátí lidi
   * domů po odtažení vojska, návrat po pádu se dopíše (`returnStewardRefugees`).
   */
  refugees?: StewardRefugeDeps;
  levies?: AnnualLevyDeps;
  /** Války a ochrana nováčka (war.md): utichání válek, upozornění na konec ochrany. */
  wars?: QuietWarsDeps & ProtectionNoticeDeps;
  /** Svolání bez odpovědi propadne s koncem války (vassalage.md – Svolání). */
  summons?: Parameters<typeof lapseSummons>[0];
  /** Nováček po týdnu čekání dostane pána losem, nebo začne svobodný (newcomers.md). */
  newcomers?: NewcomerWorldDeps;
  /** Jídlo domény po žních (hillfort.md – Jídlo domény): vsi držitele si rozdělí přebytek. */
  domainFood?: DomainFoodDeps;
  /**
   * Lidé z výsledku trhu pro domovskou ves, která zanikla, když už výsledek ležel v její schránce,
   * jdou zpět k hostiteli (markets.md – Rozhodnutí plánu 3, bod 13 – `returnStrandedPeople`).
   */
  villageMail?: VillageMailDeps;
  /**
   * Za nepřítomného hráče jedná po lhůtě formální správce (absence.md – Povinnosti vazala, když
   * hráč nehraje): odvede roční Odvody a pošle muže na Svolání.
   */
  stewards?: { levies: LevyDeps; summons: SummonsDeps };
  /** Návrh v jednání bez odpovědi vyprší po lhůtě (absence.md). */
  negotiationExpiry?: ExpireNegotiationsDeps;
  /** Roční los objevu křesťanství a křest NPC rodů (christianity.md). */
  christianity?: ChristianityDeps;
  /**
   * Schránky účinků přijatých jednání, po kterých web spadl (audit A2, vassalage.md – Přijetí
   * a schránka účinků): pomoc, výkupné, mír, obchod a kronika (`deliverPendingAcceptances`).
   */
  acceptances?: PendingAcceptanceDeps;
};

/**
 * Úlohy světa, které worker pouští jednou za minutu mezi koly: kredity nástupnictví, obnova
 * zásilek po pádu (`reconcileShipments`), návrat uprchlíků za správce (`returnStewardRefugees`), jídlo domény po žních (`sendDomainFood` – po obnově
 * zásilek, ať vidí, co je na cestě), správce za nepřítomné (Odvody před otevřením nového roku,
 * ať loňský dialog nenaroste; Svolání před propadnutím s koncem války), vypršení jednání, konec
 * týdne čekání nováčků (`expireNewcomerWaits`), roční los křesťanství (`advanceChristianity`),
 * lidé z výsledků trhu pro zaniklé vsi zpět k hostiteli (`returnStrandedPeople`) a nakonec účinky
 * přijatých jednání po pádu webu (`deliverPendingAcceptances`). Schránky mají
 * vlastní ochranu: selhání dřívější úlohy jejich doručení nezastaví a naopak – první chyba se
 * vyhodí až na konci (jako chyba jedné schránky nebo vsi v kole). Dřívější úlohy dál jdou za sebou
 * a chyba zastaví ty po ní – na pořadí závisí (jídlo domény po obnově zásilek, Odvody správce před
 * novým rokem).
 */
export async function runWorldTasks(
  deps: WorldTaskDeps,
  input: { now: Date; today: number },
): Promise<void> {
  let failure: unknown = null;
  try {
    await runOrderedTasks(deps, input);
  } catch (error) {
    failure = error;
  }
  if (deps.acceptances) {
    try {
      await deliverPendingAcceptances(deps.acceptances, input);
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure !== null) throw failure;
}

/** Úlohy světa před schránkami účinků – za sebou, chyba zastaví ty po ní (`runWorldTasks`). */
async function runOrderedTasks(
  deps: WorldTaskDeps,
  input: { now: Date; today: number },
): Promise<void> {
  await grantSuccessionCredits(deps, input);
  if (deps.shipments) await reconcileShipments(deps.shipments, input.today);
  if (deps.refugees) await returnStewardRefugees(deps.refugees, { today: input.today });
  if (deps.domainFood) await sendDomainFood(deps.domainFood, { today: input.today });
  if (deps.stewards) await answerAbsentLevies(deps.stewards.levies, { today: input.today });
  if (deps.levies) await openAnnualDialogs(deps.levies, { today: input.today });
  if (deps.wars) {
    await quietWars(deps.wars, input);
    await notifyProtectionEnding(deps.wars, input);
  }
  if (deps.stewards) await answerAbsentSummons(deps.stewards.summons, { today: input.today });
  if (deps.summons) await lapseSummons(deps.summons, input);
  if (deps.negotiationExpiry) await expireNegotiations(deps.negotiationExpiry, input);
  if (deps.newcomers) await expireNewcomerWaits(deps.newcomers, input);
  if (deps.christianity) await advanceChristianity(deps.christianity, input.today);
  if (deps.villageMail) await returnStrandedPeople(deps.villageMail);
}
