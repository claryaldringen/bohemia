import { houseProtectedUntil, protectedReason, protectionDaysLeft, WAR } from '../domain/war';
import type { TermItem } from '../domain/negotiation';
import type { HouseRepository, House } from './houses';
import { NO_HOUSE, openNegotiation, type NegotiateDeps } from './negotiate';
import { houseName, type NegotiationVillages } from './negotiation-chronicle';
import type { NoticeRepository } from './notices';
import type { PassageRepository } from './passages';
import { noteBrokenPeace, type BrokenPeaceDeps } from './judgment';
import { chronicleWar } from './war-chronicle';
import type { WarRepository } from './wars';

// Válka mezi rody (docs/design/war.md – Začátek války, Ochrana nového hráče). Válka začne odesláním
// opovědi, nebo prvním útokem vojska (přepadení). Hráč smí napadnout i vlastního pána nebo vazala
// (Martin 2. 11. 2026 – „hra to nezakazuje“). Kronika je neutrální, bez hodnocení.

export interface WarDeps extends NegotiationVillages {
  houses: Pick<HouseRepository, 'activeOf' | 'byId'>;
  wars: WarRepository;
  notices: NoticeRepository;
  /**
   * Rozsudky pána (`disputes` + `vassalages`) (vassalage.md – Mír a spory): válka přes platný rozsudek „mír“ se zapíše jako
   * neposlušnost; válku to nezakáže. Bez závislosti se nezapisuje nic.
   */
  disputes?: BrokenPeaceDeps['disputes'];
  vassalages?: BrokenPeaceDeps['vassalages'];
  /**
   * Ohlášené průchody (war.md – Pohyb): válka mezi rody – opověď i útok po ohlášení – ohlášení
   * zruší pro všechny vsi rodu (návrh Clauda). Bez závislosti se nic neruší.
   */
  passages?: Pick<PassageRepository, 'voidBetween'>;
}

export type WarResult = { ok: true; warId: string } | { ok: false; reason: string };

const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

export const WAR_REASONS = {
  extinct: 'Ten rod už není.',
  atWar: 'S tímto rodem už válčíš.',
} as const;

/** Průměrná délka herního roku ve dnech (přestupný každý čtvrtý rok – calendar.ts). */
const DAYS_PER_YEAR = 365.25;
const DAY_MS = 86_400_000;

/** Válka přes rozsudek „mír“ (jen je-li zapojeno): zápis neposlušnosti agresora. */
async function brokenPeace(
  deps: WarDeps,
  aggressorId: string,
  otherId: string,
  today: number,
): Promise<void> {
  if (!deps.disputes || !deps.vassalages) return;
  await noteBrokenPeace(
    {
      villages: deps.villages,
      houses: deps.houses,
      disputes: deps.disputes,
      vassalages: deps.vassalages,
    },
    { aggressorId, otherId, today },
  );
}

const isAlive = (house: House | null): house is House => house !== null && house.endedAt === null;

/** Důvod, proč rod `target` nesmí být napaden (ochrana nováčka), nebo null. */
async function protectionReason(deps: WarDeps, target: House, now: Date): Promise<string | null> {
  const until = houseProtectedUntil(target, await deps.wars.ownAttackAt(target.id));
  const left = protectionDaysLeft(until, now);
  return left > 0 ? protectedReason(await houseName(deps, target), left) : null;
}

/**
 * Hráč za svůj rod opoví válku rodu `target`: ukončí vlastní ochranu nováčka a válka začne
 * odesláním. S požadavkem (podmínky jako mír) nebo vzkazem se otevře jednání – přijetí požadavku
 * znamená mír s těmi podmínkami, odmítnutí nebo mlčení nic nemění. Rod v ochraně nelze napadnout.
 */
export async function declareWar(
  deps: WarDeps & NegotiateDeps,
  input: {
    playerId: string;
    target: string;
    demand: TermItem[];
    message: string | null;
    now: Date;
    today: number;
  },
): Promise<WarResult> {
  const from = await deps.houses.activeOf(input.playerId);
  if (!from) return fail(NO_HOUSE);
  const target = await deps.houses.byId(input.target);
  if (!isAlive(target)) return fail(WAR_REASONS.extinct);
  if (target.id === from.id) return fail(WAR_REASONS.extinct);
  const reason = await protectionReason(deps, target, input.now);
  if (reason) return fail(reason);
  if (await deps.wars.activeBetween(from.id, target.id)) return fail(WAR_REASONS.atWar);
  // požadavek nebo vzkaz = jednání; selže-li (jednáte už, zablokován…), válka nevznikne
  if (input.demand.length > 0 || input.message !== null) {
    const opened = await openNegotiation(deps, {
      playerId: input.playerId,
      to: target.id,
      items: [{ kind: 'war-demand', items: input.demand }],
      message: input.message,
      now: input.now,
      today: input.today,
    });
    if (!opened.ok) return fail(opened.reason);
  }
  const { war, created } = await deps.wars.start({
    houses: [from.id, target.id],
    startedAt: input.now,
    startedDay: input.today,
    how: 'declared',
  });
  // opověď ukončí ochranu opovídajícího
  await deps.wars.markAttack(from.id, input.now);
  if (created) {
    if (target.playerId !== null) {
      await deps.notices.post({
        playerId: target.playerId,
        kind: 'war-declared',
        payload: { houseId: from.id, name: await houseName(deps, from) },
        gameDay: input.today,
      });
    }
    await chronicleWar(deps, from, target, 'declared', `war-declared:${war.id}`, input.today);
    await brokenPeace(deps, from.id, target.id, input.today);
    await deps.passages?.voidBetween(from.id, target.id, input.now);
  }
  return { ok: true, warId: war.id };
}

/**
 * Přepadení bez opovědi (war.md – Začátek války): válka začne prvním útokem vojska rodu
 * `attackerId` na lidi, dobytek nebo zásoby rodu `defenderId`; volá ho tažení. Útok ukončí
 * ochranu útočníka; chráněný rod napadnout nejde. Běží-li válka, jen zapíše střet.
 */
export async function startWarByAttack(
  deps: WarDeps,
  input: { attackerId: string; defenderId: string; now: Date; today: number },
): Promise<WarResult> {
  const attacker = await deps.houses.byId(input.attackerId);
  const defender = await deps.houses.byId(input.defenderId);
  if (!isAlive(attacker) || !isAlive(defender) || attacker.id === defender.id) {
    return fail(WAR_REASONS.extinct);
  }
  const running = await deps.wars.activeBetween(attacker.id, defender.id);
  if (running) {
    await deps.wars.touchClash(running.id, input.today);
    return { ok: true, warId: running.id };
  }
  const reason = await protectionReason(deps, defender, input.now);
  if (reason) return fail(reason);
  const { war, created } = await deps.wars.start({
    houses: [attacker.id, defender.id],
    startedAt: input.now,
    startedDay: input.today,
    how: 'ambush',
  });
  await deps.wars.markAttack(attacker.id, input.now);
  if (created) {
    await chronicleWar(deps, attacker, defender, 'ambush', `war-ambush:${war.id}`, input.today);
    await brokenPeace(deps, attacker.id, defender.id, input.today);
    // útok po ohlášeném průchodu = přepadení; ohlášení tím přestane platit (war.md – Pohyb)
    await deps.passages?.voidBetween(attacker.id, defender.id, input.now);
  } else {
    await deps.wars.touchClash(war.id, input.today);
  }
  return { ok: true, warId: war.id };
}

export interface QuietWarsDeps extends NegotiationVillages {
  houses: Pick<HouseRepository, 'byId'>;
  wars: Pick<WarRepository, 'listActive' | 'end'>;
}

/**
 * Úloha světa: válka bez střetu 3 herní roky utichne (war.md – Začátek války; návrh Clauda – aby
 * horní lišta a panel nedržely mrtvé války). Zápis „Válka s Bořivojem utichla.“ do kronik obou
 * rodů; další útok je nová válka. Vrací počet utichlých válek.
 */
export async function quietWars(
  deps: QuietWarsDeps,
  input: { today: number; now: Date },
): Promise<number> {
  let quieted = 0;
  const limit = WAR.quietYears * DAYS_PER_YEAR;
  for (const war of await deps.wars.listActive()) {
    if (input.today - war.lastClashDay < limit) continue;
    if (!(await deps.wars.end(war.id, 'quiet', input.now))) continue;
    quieted++;
    const a = await deps.houses.byId(war.houses[0]);
    const b = await deps.houses.byId(war.houses[1]);
    if (a && b) await chronicleWar(deps, a, b, 'quiet', `war-quiet:${war.id}`, input.today);
  }
  return quieted;
}

export interface ProtectionNoticeDeps {
  houses: Pick<HouseRepository, 'playerHousesSince'>;
  wars: Pick<WarRepository, 'ownAttackAt' | 'claimProtectionNotice'>;
  notices: NoticeRepository;
}

/**
 * Úloha světa: rod, kterému ochrana nováčka končí do 1 dne, dostane upozornění „Ochrana končí za
 * 1 den.“ (war.md – Co hráč vidí; návrh Clauda). Jednou na rod (`claimProtectionNotice`); rod, který
 * ochranu ukončil sám, ji nedostane. Vrací počet rozeslaných upozornění.
 */
export async function notifyProtectionEnding(
  deps: ProtectionNoticeDeps,
  input: { now: Date; today: number },
): Promise<number> {
  const since = new Date(input.now.getTime() - WAR.newLineProtectionDays * DAY_MS);
  let sent = 0;
  for (const house of await deps.houses.playerHousesSince(since)) {
    if (house.playerId === null) continue;
    const until = houseProtectedUntil(house, await deps.wars.ownAttackAt(house.id));
    if (until === null || until.getTime() - input.now.getTime() > DAY_MS) continue;
    if (until.getTime() <= input.now.getTime()) continue;
    if (!(await deps.wars.claimProtectionNotice(house.id, input.now))) continue;
    await deps.notices.post({
      playerId: house.playerId,
      kind: 'protection-ending',
      payload: { daysLeft: 1 },
      gameDay: input.today,
    });
    sent++;
  }
  return sent;
}
