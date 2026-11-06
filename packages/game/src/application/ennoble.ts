import { cellDistance } from '../domain/world/placement';
import {
  checkEnnoble,
  checkTermLines,
  ENNOBLE_REASONS,
  ennobleYear,
  departNoble,
  linesOfTerms,
  type VassalTerms,
} from '../domain/vassalage';
import {
  APPOINT_LORD,
  isVillageAbandoned,
  isVillageExtinct,
  withAwaitingLord,
  type VillageState,
} from '../domain/village';
import type { HouseRepository } from './houses';
import { NO_HOUSE } from './negotiate';
import { findPlayerVillage, NOT_PLAYER_VILLAGE, type PlayerVillage } from './player-villages';
import type { SettlementRepository } from './settlements';
import type { StewardshipRepository } from './stewardships';
import type { VassalageRepository } from './vassalages';
import type { VillageRecord, VillageRepository } from './villages';

// Povýšení vesničana (vassalage.md – Povýšení vesničana): hráč povýší muže od 16 let z jedné své
// vsi; ten s rodinou odejde do jeho vsi bez vojvody, založí NPC šlechtický rod (vazal hráčova rodu
// s holou přísahou) a ves řídí jako správce. Volající drží zámek hráče. Postup: ověřit, zapsat
// povýšení rodu v roce, zapsat do cílové vsi příjezd, založit rod + vazalství + správu, a nakonec
// poslat družinu schránkou cílové vsi (`noble-arrives`).

export interface EnnobleDeps {
  settlements: SettlementRepository;
  villages: VillageRepository;
  houses: Pick<HouseRepository, 'activeOf' | 'create' | 'claimEnnoble'>;
  vassalages: Pick<VassalageRepository, 'create'>;
  stewardships: Pick<StewardshipRepository, 'start' | 'of'>;
}

export type EnnobleResult = { ok: true; houseId: string } | { ok: false; reason: string };

const SAVE_ATTEMPTS = 5;

/** Ves se nesimuluje – nic neposílá ani nepřijímá. */
const sleeps = (state: VillageState): boolean =>
  isVillageExtinct(state) || isVillageAbandoned(state);

/** Vzdálenost sídel vsí v mapách (nejméně 1; sídlo bez polohy – 1). */
function distance(a: PlayerVillage, b: PlayerVillage): number {
  if (!a.settlement.worldCell || !b.settlement.worldCell) return 1;
  return Math.max(1, cellDistance(a.settlement.worldCell, b.settlement.worldCell));
}

/**
 * Hráč povýší vesničana `personId` z vsi `fromVillageId` do šlechtického stavu pro svou ves
 * `targetVillageId`, která je bez vojvody (`awaitingLord`). Nejvýš jedno povýšení za herní rok rodu.
 */
export async function ennobleVillager(
  deps: EnnobleDeps,
  input: {
    playerId: string;
    fromVillageId: string;
    personId: number;
    targetVillageId: string;
    today: number;
    /** Skutečný čas povýšení (zápis rodu, dohody a správy). */
    at: Date;
  },
): Promise<EnnobleResult> {
  const house = await deps.houses.activeOf(input.playerId);
  if (!house) return { ok: false, reason: NO_HOUSE };
  const from = await findPlayerVillage(deps, { ...input, villageId: input.fromVillageId });
  const target = await findPlayerVillage(deps, { ...input, villageId: input.targetVillageId });
  if (!from || !target) return { ok: false, reason: NOT_PLAYER_VILLAGE };
  if (from.village.id === target.village.id) return { ok: false, reason: ENNOBLE_REASONS.noTarget };
  const bad = checkEnnoble(from.village.state, input.personId, input.today);
  if (bad) return { ok: false, reason: bad };
  const waiting = withAwaitingLord(target.village.state).awaitingLord;
  if (
    sleeps(target.village.state) ||
    sleeps(from.village.state) ||
    !waiting ||
    waiting.appointee ||
    (await deps.stewardships.of(target.village.id))
  ) {
    return { ok: false, reason: ENNOBLE_REASONS.targetTaken };
  }
  if (!(await deps.houses.claimEnnoble(house.id, ennobleYear(input.today)))) {
    return { ok: false, reason: ENNOBLE_REASONS.perYear };
  }
  const arrivesDay = input.today + APPOINT_LORD.daysPerMapStep * distance(from, target);
  const claimed = await claimTarget(deps, target.village.id, {
    fromVillageId: from.village.id,
    personId: input.personId,
    arrivesDay,
  });
  if (!claimed) return { ok: false, reason: ENNOBLE_REASONS.targetTaken };
  const now = input.at;
  const npc = await deps.houses.create({ playerId: null, kind: 'npc', createdAt: now });
  const vassalage = await deps.vassalages.create({
    lordHouseId: house.id,
    vassalHouseId: npc.id,
    terms: {},
    origin: 'ennoble',
    sinceAt: now,
    sinceDay: input.today,
  });
  await deps.stewardships.start({
    villageId: target.village.id,
    stewardHouseId: npc.id,
    holderHouseId: house.id,
    kind: 'npc',
    vassalageId: vassalage.id,
    since: now,
  });
  await sendParty(deps, claimed, from.village, input.personId, arrivesDay, npc.id);
  return { ok: true, houseId: npc.id };
}

/** Zapíše do cílové vsi, koho čeká; souběžný zápis se zopakuje. Null – ves už vyslance má. */
async function claimTarget(
  deps: Pick<EnnobleDeps, 'villages'>,
  villageId: string,
  appointee: { fromVillageId: string; personId: number; arrivesDay: number },
): Promise<VillageRecord | null> {
  for (let attempt = 0; attempt < SAVE_ATTEMPTS; attempt++) {
    const current = await deps.villages.find(villageId);
    if (!current) return null;
    const waiting = withAwaitingLord(current.state).awaitingLord;
    if (!waiting || waiting.appointee) return null;
    const next: VillageState = { ...current.state, awaitingLord: { ...waiting, appointee } };
    const saved = await deps.villages.save(villageId, next, current.version);
    if (saved) return saved;
  }
  return null;
}

/** Muž s rodinou odejde ze své vsi a družina se pošle schránkou cílové vsi na den příjezdu. */
async function sendParty(
  deps: Pick<EnnobleDeps, 'villages'>,
  target: VillageRecord,
  source: VillageRecord,
  personId: number,
  arrivesDay: number,
  houseId: string,
): Promise<void> {
  for (let attempt = 0; attempt < SAVE_ATTEMPTS; attempt++) {
    const current = await deps.villages.find(source.id);
    if (!current || !current.state.people.some((p) => p.id === personId)) return;
    const departure = departNoble(current.state, current.state.lastDay, personId, target.name);
    await deps.villages.inbox.post({
      villageId: target.id,
      day: arrivesDay,
      ref: `ennoble:${target.id}:${target.state.awaitingLord?.sinceDay ?? 0}`,
      body: {
        kind: 'noble-arrives',
        party: departure.party,
        houseId,
        fromVillageId: source.id,
      },
    });
    if (await deps.villages.save(current.id, departure.state, current.version)) return;
  }
}

export const NOT_NPC_VASSAL = 'Podmínky smíš měnit jen šlechtici, kterého jsi povýšil.';

/**
 * Pán změní podmínky dohody s povýšeným (NPC rodem) přímo – NPC vždy přijme a plní přesně, takže
 * podmínky platí hned (bez jednání). Volající drží zámek pána.
 */
export async function setNpcTerms(
  deps: {
    houses: Pick<HouseRepository, 'activeOf' | 'byId'>;
    vassalages: Pick<VassalageRepository, 'byId' | 'updateTerms'>;
  },
  input: { playerId: string; vassalageId: string; terms: VassalTerms },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const house = await deps.houses.activeOf(input.playerId);
  if (!house) return { ok: false, reason: NO_HOUSE };
  const vassalage = await deps.vassalages.byId(input.vassalageId);
  const vassal = vassalage ? await deps.houses.byId(vassalage.vassalHouseId) : null;
  if (!vassalage || vassalage.endedAt !== null || vassalage.lordHouseId !== house.id) {
    return { ok: false, reason: NOT_NPC_VASSAL };
  }
  if (vassal?.kind !== 'npc') return { ok: false, reason: NOT_NPC_VASSAL };
  const bad = checkTermLines(linesOfTerms(input.terms));
  if (bad) return { ok: false, reason: bad };
  const updated = await deps.vassalages.updateTerms(vassalage.id, input.terms, vassalage.version);
  return updated ? { ok: true } : { ok: false, reason: NOT_NPC_VASSAL };
}

/**
 * Háček pro konec NPC rodu (vassalage.md – Povýšení vesničana): vymřelému rodu skončí správa vsí
 * (ves se vrátí do správy držitele) i dohoda s pánem. Vrací id vsí, které se vrátily.
 */
export async function onNpcHouseEnded(
  deps: {
    stewardships: Pick<StewardshipRepository, 'listByStewardHouse' | 'end'>;
    vassalages: Pick<VassalageRepository, 'activeOf' | 'end'>;
  },
  houseId: string,
  at: Date,
): Promise<string[]> {
  const returned: string[] = [];
  for (const s of await deps.stewardships.listByStewardHouse(houseId)) {
    if (await deps.stewardships.end(s.villageId, 'house-ended', at)) returned.push(s.villageId);
  }
  for (const v of await deps.vassalages.activeOf(houseId)) {
    if (v.vassalHouseId === houseId) await deps.vassalages.end(v.id, 'house-ended', at);
  }
  return returned;
}
