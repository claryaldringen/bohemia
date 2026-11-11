import type { Prisoner } from '../domain/village';
import { cellDistance } from '../domain/world/placement';
import type { RansomHooks } from './negotiate';
import type { HouseRepository } from './houses';
import type { PlayerLock } from './locks';
import type { SettlementRepository } from './settlements';
import { sendShipment, type ShipmentDeps } from './shipments';
import type { VillageRecord, VillageRepository } from './villages';

// Zajatci (war.md – Vzdaní, zajetí a výkupné). Zajetí žije ve stavu vsí (`VillageState.prisoners`
// ve vsi věznitele, `Person.away` druhu `captive` ve vsi domova); věznitel o zajatci rozhoduje
// (`decidePrisoner`), nebo se zajatec vykoupí jednáním (`ransom`) či mírem (`releasePrisoners`).
// Rozhodnutí zapíše řádek `prisoner` (primární klíč = klíč zajetí) – souběžná druhá rozhodnutí
// narazí na existující klíč a neprojdou. Propuštění pošle zajatce domů za 2 × vzdálenost dní,
// poprava ho zabije (nástupnictví hráče, je-li to jeho muž).

export type PrisonerDecision = 'released' | 'executed' | 'ransomed';

/** Zapsané rozhodnutí o zajatci. */
export interface PrisonerRecord {
  id: string;
  captorVillageId: string;
  homeVillageId: string;
  personId: number;
  decision: PrisonerDecision;
  decidedDay: number;
  decidedAt: Date;
}

/** Port repozitáře rozhodnutí o zajatcích. */
export interface PrisonerRepository {
  /** Zapíše rozhodnutí; true jen při zápisu – klíč zajetí už rozhodnutý → false (souběh). */
  claim(record: PrisonerRecord): Promise<boolean>;
  find(id: string): Promise<PrisonerRecord | null>;
}

const PRISONER_REASONS = {
  notFound: 'Takový zajatec tu není.',
  decided: 'O tomhle zajatci už je rozhodnuto.',
  noHome: 'Domovská ves zajatce zanikla.',
} as const;

export interface PrisonerDeps {
  prisoners: PrisonerRepository;
  villages: Pick<VillageRepository, 'find' | 'listBySettlement' | 'inbox'>;
  settlements: Pick<SettlementRepository, 'find' | 'listActive'>;
  locks: PlayerLock;
  now: () => Date;
}

export type PrisonerResult = { ok: true } | { ok: false; reason: string };

/** Zajatec držený ve vsi s jejím záznamem. */
export interface HeldPrisoner {
  prisoner: Prisoner;
  captor: VillageRecord;
}

/** Zajatci držení ve vsích hráče `playerId` (uložený stav, v pořadí sídel). */
export async function heldPrisoners(
  deps: Pick<PrisonerDeps, 'villages' | 'settlements'>,
  playerId: string,
): Promise<HeldPrisoner[]> {
  const held: HeldPrisoner[] = [];
  for (const settlement of await deps.settlements.listActive(playerId)) {
    for (const captor of await deps.villages.listBySettlement(settlement.id)) {
      for (const prisoner of captor.state.prisoners ?? []) held.push({ prisoner, captor });
    }
  }
  return held;
}

/** Dny cesty domů: 2 × vzdálenost map věznitele a domova (nejméně den). */
async function travelDays(
  deps: Pick<PrisonerDeps, 'settlements'>,
  captor: VillageRecord,
  home: VillageRecord,
): Promise<number> {
  const [a, b] = await Promise.all([
    deps.settlements.find(captor.settlementId),
    deps.settlements.find(home.settlementId),
  ]);
  const distance = cellDistance(a?.worldCell ?? { x: 0, y: 0 }, b?.worldCell ?? { x: 0, y: 0 });
  return Math.max(1, 2 * distance);
}

/**
 * Provede rozhodnutí o zajatci `held` (zápis rozhodnutí, události do obou vsí). Propuštění:
 * věznitelova ves ho přestane živit hned, domov ho uvidí za `travelDays`. Poprava: domov ho
 * pohřbí jako padlého muže rodu. Vrací false, když už je o zajatci rozhodnuto.
 */
async function conclude(
  deps: PrisonerDeps,
  held: HeldPrisoner,
  decision: PrisonerDecision,
  today: number,
): Promise<PrisonerResult> {
  const { prisoner, captor } = held;
  const home = await deps.villages.find(prisoner.ref.villageId);
  if (!home) return { ok: false, reason: PRISONER_REASONS.noHome };
  const claimed = await deps.prisoners.claim({
    id: prisoner.id,
    captorVillageId: captor.id,
    homeVillageId: home.id,
    personId: prisoner.ref.personId,
    decision,
    decidedDay: today,
    decidedAt: deps.now(),
  });
  if (!claimed) return { ok: false, reason: PRISONER_REASONS.decided };
  const personId = prisoner.ref.personId;
  await deps.villages.inbox.post({
    villageId: captor.id,
    day: today,
    ref: `captive:${prisoner.id}:captor`,
    body: { kind: 'captive-returns', role: 'captor', prisonerId: prisoner.id, personId },
  });
  if (decision === 'executed') {
    await deps.villages.inbox.post({
      villageId: home.id,
      day: today,
      ref: `captive:${prisoner.id}:fell`,
      body: { kind: 'line-man-fell', personId, campaignId: prisoner.id },
    });
    return { ok: true };
  }
  await deps.villages.inbox.post({
    villageId: home.id,
    day: today + (await travelDays(deps, captor, home)),
    ref: `captive:${prisoner.id}:home`,
    body: { kind: 'captive-returns', role: 'home', prisonerId: prisoner.id, personId },
  });
  return { ok: true };
}

/**
 * Věznitel rozhodne o zajatci: `hold` (nic se nemění), `release` (jde domů za 2 × vzdálenost dní),
 * `execute` (poprava – smrt a nástupnictví). Zajatec musí být v některé vsi hráče; druhé rozhodnutí
 * o témž zajatci neprojde. Pod zámkem hráče.
 */
export async function decidePrisoner(
  deps: PrisonerDeps,
  input: {
    playerId: string;
    prisonerId: string;
    action: 'hold' | 'release' | 'execute';
    today: number;
  },
): Promise<PrisonerResult> {
  return deps.locks.run(input.playerId, async (): Promise<PrisonerResult> => {
    const held = (await heldPrisoners(deps, input.playerId)).find(
      (h) => h.prisoner.id === input.prisonerId,
    );
    if (!held) return { ok: false, reason: PRISONER_REASONS.notFound };
    if (input.action === 'hold') return { ok: true };
    return conclude(deps, held, input.action === 'release' ? 'released' : 'executed', input.today);
  });
}

/** Závislosti hráčem nezávislých hlásičů výkupného (jednání běží bez zámku hráče). */
export interface RansomDeps extends PrisonerDeps {
  houses: Pick<HouseRepository, 'byId'>;
  shipments: ShipmentDeps;
  prepareVillage: (villageId: string, today: number) => Promise<unknown>;
}

/** Rod `houseId` a jeho hráč; rod bez hráče nic nedrží. */
async function playerOf(deps: Pick<RansomDeps, 'houses'>, houseId: string): Promise<string | null> {
  return (await deps.houses.byId(houseId))?.playerId ?? null;
}

/** Zajatci `ids` držení hráčem `captorPlayerId`; chybí-li kterýkoli, null. */
async function holdAll(
  deps: RansomDeps,
  captorPlayerId: string,
  ids: readonly string[],
): Promise<HeldPrisoner[] | null> {
  const held = await heldPrisoners(deps, captorPlayerId);
  const found = ids.map((id) => held.find((h) => h.prisoner.id === id));
  return found.every((h) => h !== undefined) ? (found as HeldPrisoner[]) : null;
}

/**
 * Hlásiče výkupného pro jednání (`NegotiateDeps.ransom`): kontrola, že zajatce drží jedna strana
 * a druhá je jeho rod; po přijetí zaplatí výkupné z vsi platícího věznitelově vsi (zásilka) a propustí;
 * mír propustí zajatce bez platby.
 */
export function ransomHooks(deps: RansomDeps): RansomHooks {
  return {
    async check(parties, line) {
      for (const captorHouse of parties) {
        const captorPlayer = await playerOf(deps, captorHouse);
        if (captorPlayer === null) continue;
        const held = await holdAll(deps, captorPlayer, line.prisonerIds);
        if (held) return { ok: true, captorHouseId: captorHouse };
      }
      return { ok: false, reason: 'Tohle zajetí už neplatí nebo ho nedržíš ty ani druhá strana.' };
    },
    async apply(input) {
      const captorPlayer = await playerOf(deps, input.captorHouseId);
      const payer = await deps.houses.byId(input.payerHouseId);
      const captor = await deps.houses.byId(input.captorHouseId);
      const from = payer?.lord?.villageId;
      const to = captor?.lord?.villageId;
      if (captorPlayer === null || !from || !to) return 'Výkupné teď nejde poslat.';
      const held = await holdAll(deps, captorPlayer, input.line.prisonerIds);
      if (!held) return 'Tohle zajetí už neplatí.';
      await deps.prepareVillage(from, input.today);
      const sent = await sendShipment(deps.shipments, {
        fromVillageId: from,
        toVillageId: to,
        bundle: input.line.price,
        purpose: 'ransom',
        refId: `ransom:${input.negotiationId}`,
        today: input.today,
      });
      if (!sent.ok) return sent.reason;
      await deps.locks.run(captorPlayer, async () => {
        for (const h of held) await conclude(deps, h, 'ransomed', input.today);
      });
      return null;
    },
    async release(input) {
      for (const houseId of input.parties) {
        const player = await playerOf(deps, houseId);
        if (player === null) continue;
        const held = (await heldPrisoners(deps, player)).filter((h) =>
          input.prisonerIds.includes(h.prisoner.id),
        );
        await deps.locks.run(player, async () => {
          for (const h of held) await conclude(deps, h, 'released', input.today);
        });
      }
    },
  };
}
