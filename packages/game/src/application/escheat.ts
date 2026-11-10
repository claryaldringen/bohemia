import {
  checkEscheatPlan,
  endNobleHouse,
  ESCHEAT_REASONS,
  escheatVillage,
  extinctNobleHouse,
  isGiftPart,
  partLord,
  type EscheatPart,
  type EscheatScope,
} from '../domain/vassalage/escheat';
import type { VillageGiftLine } from '../domain/negotiation';
import { isVillageDormant, withHolderFaith } from '../domain/village';
import type { DialogRepository } from './dialogs';
import { settlementLandscape } from './enter-game';
import type { HouseRepository } from './houses';
import { onHouseEnded } from './loan-house-ended';
import type { LoanRepository } from './loans';
import type { PlayerLock } from './locks';
import { onNpcHouseEnded } from './ennoble';
import { houseName, UNNAMED_HOUSE } from './negotiation-chronicle';
import type { NegotiationRepository } from './negotiations';
import type { LandscapeSource, Settlement, SettlementRepository } from './settlements';
import type { StewardshipRepository } from './stewardships';
import type { WarRepository } from './wars';
import { updateVillage } from './update-village';
import type { Vassalage, VassalageRepository } from './vassalages';
import type { VillageRecord, VillageRepository, VillageStamp } from './villages';

// Konec rodu a odúmrť (vassalage.md – Vymření rodu – odúmrť; lord.md – Konec rodu). `endHouse` je
// jediné místo, kudy jde konec každého rodu (hráčova i NPC). Rod bez pána: vazalové přijdou o dohodu,
// dluhy zaniknou, vsi zaniknou jako dřív (volající). Rod s pánem: vsi a vazalové připadnou pánům
// (`Escheat`); do rozhodnutí je technickým držitelem pán s nejstarší dohodou (jen kvůli zámku
// a dopočtu – vsi řídí správce), ostatní páni se jen dívají. Rozhodnutí platí po souhlasu všech pánů.
//
// Převod držitele (riziko fáze 4 – odúmrť mění držitele vsí uprostřed práce workeru): nikdy dva zámky
// naráz. 1. krok pod zámkem starého držitele: ves se převede (`escheatVillage`) a sídlo dostane
// čekajícího držitele (`transferHolder`) – od té chvíle ho nepočítá nikdo. 2. krok pod zámkem nového
// držitele: převezme čekající sídla (`acceptTransfers` – na začátku jeho dopočtu ve webu i workeru).
// Pád mezi kroky: sídlo čeká, nic se neztratí – převezme ho nejbližší dopočet nového držitele.
// Pád před koncem `endHouse`: rod ještě žije (`houses.end` je poslední) a příští konec rodu všechno
// zopakuje – každý krok je idempotentní (odúmrť je jedna na rod, převod podmíněný).

export type EscheatStatus = 'open' | 'decided';

/** Odúmrť vymřelého rodu `deadHouseId`; páni v pořadí dohod (nejstarší = technický držitel). */
export interface Escheat {
  id: string;
  deadHouseId: string;
  lordHouseIds: string[];
  villageIds: string[];
  vassalIds: string[];
  status: EscheatStatus;
  /** Poslední návrh dělení; null – zatím žádný. */
  plan: EscheatPart[] | null;
  /** Páni, kteří s návrhem souhlasí (navrhovatel vždy). */
  consents: string[];
  version: number;
  createdAt: Date;
}

export type NewEscheat = Pick<
  Escheat,
  'deadHouseId' | 'lordHouseIds' | 'villageIds' | 'vassalIds'
> & {
  createdAt: Date;
};

/** Port repozitáře odúmrtí. */
export interface EscheatRepository {
  /** Založí odúmrť; rod ji už má → vrátí tu existující (jedna na rod, i při souběhu). */
  create(input: NewEscheat): Promise<Escheat>;
  byId(id: string): Promise<Escheat | null>;
  /** Nerozhodnuté odúmrti, o kterých rod rozhoduje jako pán. */
  openOfLord(lordHouseId: string): Promise<Escheat[]>;
  /** Zapíše návrh, souhlasy a stav a zvýší verzi; null, pokud se verze mezitím změnila. */
  update(
    id: string,
    patch: Pick<Escheat, 'plan' | 'consents' | 'status'>,
    expectedVersion: number,
  ): Promise<Escheat | null>;
}

export interface EndHouseDeps {
  houses: Pick<HouseRepository, 'byId' | 'end'>;
  vassalages: Pick<VassalageRepository, 'activeOf' | 'end'>;
  loans: Pick<LoanRepository, 'cancelOfDebtor'>;
  dialogs: Pick<DialogRepository, 'dropFor' | 'dropOpenOf' | 'openOnce'>;
  negotiations: NegotiationRepository;
  stewardships: Pick<StewardshipRepository, 'listByStewardHouse' | 'listByHolderHouse' | 'end'>;
  escheats: Pick<EscheatRepository, 'create'>;
  settlements: Pick<SettlementRepository, 'listActive' | 'transferHolder'>;
  villages: VillageRepository;
  landscapes?: LandscapeSource;
  wars?: Pick<WarRepository, 'extinctOf'>;
}

export interface EndHouseResult {
  /** Rod skončil tímto voláním (už skončený → false). */
  ended: boolean;
  /** Odúmrť (rod měl pána); null – rod bez pána. */
  escheatId: string | null;
}

/** Konec rodu `houseId` ke hernímu dni `day`. Volající drží zámek hráče rodu (u NPC zámek držitele). */
export async function endHouse(
  deps: EndHouseDeps,
  input: { houseId: string; day: number; now: Date },
): Promise<EndHouseResult> {
  const { houseId, day, now } = input;
  const house = await deps.houses.byId(houseId);
  if (!house || house.endedAt !== null) return { ended: false, escheatId: null };
  const agreements = await deps.vassalages.activeOf(houseId);
  const lordAgreements = oldestFirst(agreements.filter((v) => v.vassalHouseId === houseId));
  const vassalAgreements = oldestFirst(agreements.filter((v) => v.lordHouseId === houseId));
  // rozběhnuté věci (review bod 3): jednání skončí, čekající dialogy zmizí, správa cizí vsi skončí;
  // zásilka na cestě je ve schránce cílové vsi – dojde sama
  await endNegotiationsOf(deps.negotiations, houseId, now);
  if (house.playerId) await deps.dialogs.dropOpenOf(house.playerId);
  for (const s of await deps.stewardships.listByStewardHouse(houseId)) {
    await deps.stewardships.end(s.villageId, 'house-ended', now);
  }
  let escheatId: string | null = null;
  const lords = await livingLords(deps, lordAgreements);
  const vassalIds = vassalAgreements.map((v) => v.vassalHouseId);
  const settlements = house.playerId ? await deps.settlements.listActive(house.playerId) : [];
  const living = (await deps.villages.stampsOf(settlements.map((s) => s.id))).filter(
    (s) => !s.asleep,
  );
  if (house.kind === 'npc') {
    // NPC rod nedrží vsi ani vazaly: ves se vrací držiteli, dohoda s pánem končí
    await onNpcHouseEnded(deps, houseId, now);
    for (const v of lordAgreements) await deps.dialogs.dropFor(v.id);
  } else if (
    lords.length === 0 ||
    !house.playerId ||
    // není co dělit (restart s opuštěním vsí bez vazalů) – jako bez pána
    (living.length === 0 && vassalIds.length === 0)
  ) {
    for (const v of vassalAgreements) {
      await deps.vassalages.end(v.id, 'house-ended', now);
      await deps.dialogs.dropFor(v.id);
    }
    await onHouseEnded(deps, houseId, now);
  } else {
    // dluhy vymřelého zaniknou i s pánem (pohledávky jdou s vazaly – návrh Clauda)
    for (const id of await deps.loans.cancelOfDebtor(houseId, now)) await deps.dialogs.dropFor(id);
    escheatId = await openEscheat(deps, {
      deadHouseId: houseId,
      deadPlayerId: house.playerId,
      lords,
      vassalIds,
      settlements,
      living,
      day,
      now,
    });
  }
  const ended = await deps.houses.end(houseId, now, day);
  // války vymřelého rodu skončí (war.md – Konec války: do vymření jednoho z rodů)
  if (ended && deps.wars) await deps.wars.extinctOf(houseId, now);
  return { ended, escheatId: ended ? escheatId : null };
}

/**
 * Živí páni rodu (hráči) v pořadí dohod od nejstarší – první je technický držitel odúmrti. Stará
 * dohoda s pánem, jehož rod už skončil, se nepočítá (rod je pak bez pána).
 */
export async function livingLords(
  deps: { houses: Pick<HouseRepository, 'byId'> },
  lordAgreements: readonly Vassalage[],
): Promise<{ houseId: string; playerId: string }[]> {
  const lords: { houseId: string; playerId: string }[] = [];
  for (const v of oldestFirst(lordAgreements)) {
    const lord = await deps.houses.byId(v.lordHouseId);
    if (lord?.playerId && lord.endedAt === null) {
      lords.push({ houseId: lord.id, playerId: lord.playerId });
    }
  }
  return lords;
}

/** Dohody od nejstarší (den vzniku, pak čas a id – pevné pořadí). */
function oldestFirst(list: readonly Vassalage[]): Vassalage[] {
  return [...list].sort(
    (a, b) =>
      a.sinceDay - b.sinceDay ||
      a.sinceAt.getTime() - b.sinceAt.getTime() ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/**
 * Odúmrť: záznam, správy hráčů ve vsích vymřelého skončí (správce byl vazal vymřelého – přejde
 * s ostatními), živé vsi se převedou a 1. krokem převodu jdou technickému držiteli, každý pán dostane
 * dialog `escheat`. Vazalové vymřelého zůstanou do rozhodnutí na staré dohodě (podmínky a půjčky
 * se tak neztratí).
 */
async function openEscheat(
  deps: EndHouseDeps,
  input: {
    deadHouseId: string;
    deadPlayerId: string;
    lords: { houseId: string; playerId: string }[];
    vassalIds: string[];
    settlements: Settlement[];
    living: VillageStamp[];
    day: number;
    now: Date;
  },
): Promise<string> {
  const { settlements, living } = input;
  const escheat = await deps.escheats.create({
    deadHouseId: input.deadHouseId,
    lordHouseIds: input.lords.map((l) => l.houseId),
    villageIds: living.map((s) => s.id),
    vassalIds: input.vassalIds,
    createdAt: input.now,
  });
  for (const s of await deps.stewardships.listByHolderHouse(input.deadHouseId)) {
    if (s.kind === 'player') await deps.stewardships.end(s.villageId, 'house-ended', input.now);
  }
  const holder = input.lords[0];
  for (const settlement of settlements) {
    const villages = living.filter((s) => s.settlementId === settlement.id);
    if (villages.length === 0) continue;
    const landscape = settlementLandscape(settlement, deps.landscapes);
    for (const village of villages) {
      await updateVillage(deps.villages, village.id, input.day, landscape, (state) => ({
        ok: true,
        state: escheatVillage(state, input.day),
      }));
    }
    if (holder)
      await deps.settlements.transferHolder(settlement.id, input.deadPlayerId, holder.playerId);
  }
  for (const lord of input.lords) {
    await deps.dialogs.openOnce(`escheat:${escheat.id}:${lord.houseId}`, {
      playerId: lord.playerId,
      kind: 'escheat',
      refId: escheat.id,
      year: 0,
      body: { escheatId: escheat.id },
    });
  }
  return escheat.id;
}

/**
 * Konec NPC rodů ve vsích hráče (povýšený vesničan bez mužů po meči – `extinctNobleHouse`): ves se
 * vrací pod rod držitele (`endNobleHouse` – ženy a dcery zůstanou jako vesničanky) a NPC rod skončí
 * (`endHouse`). Volající drží zámek držitele vsí. Vrací nové záznamy převedených vsí.
 */
export async function endExtinctNobles(
  deps: EndHouseDeps,
  input: {
    villages: readonly VillageRecord[];
    settlements: readonly Settlement[];
    day: number;
    now: Date;
  },
): Promise<VillageRecord[]> {
  const changed: VillageRecord[] = [];
  for (const village of input.villages) {
    const houseId = extinctNobleHouse(village.state);
    const settlement = input.settlements.find((s) => s.id === village.settlementId);
    if (houseId === null || !settlement || isVillageDormant(village.state)) continue;
    const landscape = settlementLandscape(settlement, deps.landscapes);
    const result = await updateVillage(
      deps.villages,
      village.id,
      input.day,
      landscape,
      (state) => ({
        ok: true,
        state: endNobleHouse(state, houseId),
      }),
    );
    if (result.ok) changed.push(result.village);
    await endHouse(deps, { houseId, day: input.day, now: input.now });
  }
  return changed;
}

/** Ukončí otevřená jednání zaniklého rodu (`ended`) – dohodu by neměl kdo uzavřít. */
export async function endNegotiationsOf(
  negotiations: NegotiationRepository | undefined,
  houseId: string,
  at: Date,
): Promise<void> {
  if (!negotiations) return;
  await negotiations.transaction(async (tx) => {
    for (const open of await tx.openOf(houseId)) {
      await tx.setStatus(open.id, 'ended', open.version, at);
    }
  });
}

/** Kolikrát se zkusí verzovaný zápis víry vsi při souběžné změně. */
const FAITH_SAVE_ATTEMPTS = 5;

/** Závislosti převzetí sídel (`acceptHolderTransfers`). */
export interface AcceptTransfersDeps {
  settlements: Pick<SettlementRepository, 'acceptTransfers'>;
  villages: Pick<VillageRepository, 'listBySettlement' | 'find' | 'save'>;
  /** Rod nového držitele – bez něj se víra vsí nepřepočte (testy bez rodů). */
  houses?: Pick<HouseRepository, 'activeOf'>;
}

/**
 * Převzetí sídel, která na hráče čekají (2. krok převodu – odúmrť, postoupení, věnování); volající
 * drží zámek hráče. Vsi převzatých sídel dostanou křest nového rodu (`withHolderFaith` –
 * christianity.md – Vsi rodu): pokřtěný → den jeho křtu, jinak příznak zmizí; zničená posvátná
 * místa zůstanou. Zápis je verzovaný a opakování nic nezmění. Vrací převzatá sídla.
 */
export async function acceptHolderTransfers(
  deps: AcceptTransfersDeps,
  playerId: string,
): Promise<Settlement[]> {
  const accepted = await deps.settlements.acceptTransfers(playerId);
  if (accepted.length === 0 || !deps.houses) return accepted;
  const baptizedDay = (await deps.houses.activeOf(playerId))?.baptizedDay ?? null;
  for (const settlement of accepted) {
    for (const village of await deps.villages.listBySettlement(settlement.id)) {
      let current: VillageRecord | null = village;
      for (let attempt = 0; current && attempt < FAITH_SAVE_ATTEMPTS; attempt++) {
        const next = withHolderFaith(current.state, baptizedDay);
        if (next === current.state) break;
        if (await deps.villages.save(current.id, next, current.version)) break;
        current = await deps.villages.find(village.id);
      }
    }
  }
  return accepted;
}

// --- rozhodnutí pánů ---

export interface EscheatDeps {
  houses: Pick<HouseRepository, 'activeOf' | 'byId'>;
  escheats: EscheatRepository;
  vassalages: Pick<VassalageRepository, 'activeOf' | 'end' | 'create'>;
  loans: Pick<LoanRepository, 'moveCredits'>;
  dialogs: Pick<DialogRepository, 'dropFor'>;
  negotiations: NegotiationRepository;
  settlements: Pick<SettlementRepository, 'find' | 'transferHolder' | 'acceptTransfers'>;
  villages: Pick<VillageRepository, 'find' | 'listBySettlement' | 'save'>;
  /** Zámky hráčů – převod jde postupně pod zámkem starého a pak nového držitele, nikdy naráz. */
  locks: PlayerLock;
}

export type EscheatResult =
  { ok: true; escheat: Escheat; decided: boolean } | { ok: false; reason: string };

/** Pohled pána na odúmrť: rozsah (mapy vsí, koho smí obdarovat) a záznam. */
export interface EscheatContext {
  escheat: Escheat;
  scope: EscheatScope;
  /** Rod pána, který se ptá. */
  houseId: string;
}

/** Odúmrť, o které hráč rozhoduje (jeho rod je mezi pány); jinak důvod. */
export async function escheatFor(
  deps: Pick<EscheatDeps, 'houses' | 'escheats' | 'vassalages'> & {
    villages: Pick<VillageRepository, 'find'>;
  },
  input: { playerId: string; escheatId: string },
): Promise<{ ok: true; context: EscheatContext } | { ok: false; reason: string }> {
  const house = await deps.houses.activeOf(input.playerId);
  const escheat = await deps.escheats.byId(input.escheatId);
  if (!house || !escheat || !escheat.lordHouseIds.includes(house.id)) {
    return { ok: false, reason: ESCHEAT_REASONS.notLord };
  }
  return { ok: true, context: { escheat, scope: await scopeOf(deps, escheat), houseId: house.id } };
}

/** Rozsah odúmrti: mapa každé vsi a vazalové pánů (smějí dostat věnování). */
async function scopeOf(
  deps: Pick<EscheatDeps, 'vassalages'> & { villages: Pick<VillageRepository, 'find'> },
  escheat: Escheat,
): Promise<EscheatScope> {
  const mapOf: Record<string, string> = {};
  for (const id of escheat.villageIds) {
    const village = await deps.villages.find(id);
    mapOf[id] = village?.settlementId ?? id;
  }
  const giftFrom: Record<string, string> = {};
  const excluded = new Set([escheat.deadHouseId, ...escheat.lordHouseIds]);
  for (const lordId of escheat.lordHouseIds) {
    for (const v of oldestFirst(await deps.vassalages.activeOf(lordId))) {
      if (v.lordHouseId !== lordId || excluded.has(v.vassalHouseId)) continue;
      giftFrom[v.vassalHouseId] ??= lordId;
    }
  }
  return {
    lordHouseIds: escheat.lordHouseIds,
    villageIds: escheat.villageIds,
    vassalIds: escheat.vassalIds,
    mapOf,
    giftFrom,
  };
}

/**
 * Pán navrhne dělení odúmrti (díly po celých vsích a vazalech – ponechat celé = jeden díl sobě).
 * Navrhovatel s návrhem souhlasí; s jediným pánem platí hned, jinak až po souhlasu všech pánů
 * (`consentEscheat`). Volající nedrží žádný zámek – převod si bere zámky postupně.
 */
export async function proposeEscheat(
  deps: EscheatDeps,
  input: { playerId: string; escheatId: string; parts: EscheatPart[]; now: Date; today: number },
): Promise<EscheatResult> {
  const found = await escheatFor(deps, input);
  if (!found.ok) return found;
  const { escheat, scope, houseId } = found.context;
  if (escheat.status !== 'open') return { ok: false, reason: ESCHEAT_REASONS.decided };
  const bad = checkEscheatPlan(scope, input.parts);
  if (bad) return { ok: false, reason: bad };
  return record(deps, escheat, scope, input.parts, [houseId], input);
}

/**
 * Pán souhlasí s návrhem dělení ve verzi `version` (tu, kterou viděl); po souhlasu všech pánů
 * dělení platí.
 */
export async function consentEscheat(
  deps: EscheatDeps,
  input: { playerId: string; escheatId: string; version: number; now: Date; today: number },
): Promise<EscheatResult> {
  const found = await escheatFor(deps, input);
  if (!found.ok) return found;
  const { escheat, scope, houseId } = found.context;
  if (escheat.status !== 'open') return { ok: false, reason: ESCHEAT_REASONS.decided };
  if (!escheat.plan) return { ok: false, reason: ESCHEAT_REASONS.noPlan };
  if (escheat.version !== input.version) return { ok: false, reason: ESCHEAT_REASONS.changed };
  const consents = escheat.consents.includes(houseId)
    ? escheat.consents
    : [...escheat.consents, houseId];
  return record(deps, escheat, scope, escheat.plan, consents, input);
}

async function record(
  deps: EscheatDeps,
  escheat: Escheat,
  scope: EscheatScope,
  plan: EscheatPart[],
  consents: string[],
  input: { now: Date; today: number },
): Promise<EscheatResult> {
  const decided = escheat.lordHouseIds.every((id) => consents.includes(id));
  const saved = await deps.escheats.update(
    escheat.id,
    { plan, consents, status: decided ? 'decided' : 'open' },
    escheat.version,
  );
  if (!saved) return { ok: false, reason: ESCHEAT_REASONS.changed };
  // dělení platí právě jednou – podmíněný zápis stavu `decided` uspěje jen jednomu
  if (decided) await applyEscheat(deps, saved, scope, input);
  return { ok: true, escheat: saved, decided };
}

/**
 * Dělení platí: vazalové přejdou od vymřelého na pána dílu se stejnými podmínkami a pohledávkami,
 * vsi od technického držitele k pánovi dílu; věnovaný díl pán nabídne obdarovanému jednáním
 * `village-gift` (odmítne-li, díl zůstane pánovi). Dialogy odúmrti zmizí.
 */
async function applyEscheat(
  deps: EscheatDeps,
  escheat: Escheat,
  scope: EscheatScope,
  input: { now: Date; today: number },
): Promise<void> {
  const holder = await playerOf(deps, escheat.lordHouseIds[0]);
  for (const part of escheat.plan ?? []) {
    const lordId = partLord(scope, part);
    const lordPlayer = lordId ? await playerOf(deps, lordId) : null;
    if (!lordId || !lordPlayer) continue;
    for (const vassalId of part.vassalIds) {
      await moveVassal(deps, {
        fromHouseId: escheat.deadHouseId,
        toHouseId: lordId,
        vassalId,
        ...input,
      });
    }
    if (holder && holder !== lordPlayer) {
      await transferVillages(deps, part.villageIds, holder, lordPlayer);
    }
    if (isGiftPart(scope, part)) {
      const line: VillageGiftLine = {
        kind: 'village-gift',
        escheatId: escheat.id,
        villageIds: part.villageIds,
        vassalIds: part.vassalIds,
      };
      await deps.negotiations.transaction((tx) =>
        tx.open({
          initiatorHouseId: lordId,
          recipientHouseId: part.toHouseId,
          round: { authorHouseId: lordId, items: [line], message: null, at: input.now },
        }),
      );
    }
  }
  await deps.dialogs.dropFor(escheat.id);
}

async function playerOf(
  deps: Pick<EscheatDeps, 'houses'>,
  houseId: string | undefined,
): Promise<string | null> {
  if (!houseId) return null;
  return (await deps.houses.byId(houseId))?.playerId ?? null;
}

/**
 * Vazal přejde od `fromHouseId` na `toHouseId` se stejnými podmínkami (původ `escheat`)
 * a pohledávky dosavadního pána vůči němu jdou s ním. Idempotentní (stará dohoda už skončila → nic).
 */
async function moveVassal(
  deps: Pick<EscheatDeps, 'vassalages' | 'loans' | 'dialogs'>,
  input: { fromHouseId: string; toHouseId: string; vassalId: string; now: Date; today: number },
): Promise<void> {
  const old = (await deps.vassalages.activeOf(input.vassalId)).find(
    (v) => v.lordHouseId === input.fromHouseId && v.vassalHouseId === input.vassalId,
  );
  if (!old || input.fromHouseId === input.toHouseId) return;
  await deps.vassalages.create({
    lordHouseId: input.toHouseId,
    vassalHouseId: input.vassalId,
    terms: old.terms,
    origin: 'escheat',
    sinceAt: input.now,
    sinceDay: input.today,
  });
  await deps.loans.moveCredits(input.fromHouseId, input.vassalId, input.toHouseId);
  await deps.vassalages.end(old.id, 'escheat', input.now);
  await deps.dialogs.dropFor(old.id);
}

/**
 * Převod vsí (po celých mapách) od hráče `from` k hráči `to`: pod zámkem `from` nejdřív převezme,
 * co na něj čeká (technický držitel ještě nemusel), a dá sídlům čekajícího držitele; zámek uvolní
 * a teprve pak pod zámkem `to` sídla převezme. Dva zámky nikdy naráz. Převzaté vsi dostanou křest
 * rodu svého držitele (`acceptHolderTransfers`).
 */
export async function transferVillages(
  deps: Pick<EscheatDeps, 'locks' | 'settlements' | 'villages' | 'houses'>,
  villageIds: readonly string[],
  from: string,
  to: string,
): Promise<void> {
  if (villageIds.length === 0 || from === to) return;
  await deps.locks.run(from, async () => {
    await acceptHolderTransfers(deps, from);
    const maps = new Set<string>();
    for (const id of villageIds) {
      const village = await deps.villages.find(id);
      if (village) maps.add(village.settlementId);
    }
    for (const map of maps) await deps.settlements.transferHolder(map, from, to);
  });
  await deps.locks.run(to, () => acceptHolderTransfers(deps, to));
}

/**
 * Obdarovaný přijal věnování dílu odúmrti (`village-gift`): vazalové přejdou od dárce na něj
 * (s pohledávkami dárce vůči nim), vsi od dárce k němu. Volající (`acceptNegotiation` po transakci)
 * nedrží žádný zámek.
 */
export async function giveEscheatPart(
  deps: Pick<
    EscheatDeps,
    'houses' | 'vassalages' | 'loans' | 'dialogs' | 'locks' | 'settlements' | 'villages'
  >,
  input: {
    line: VillageGiftLine;
    fromHouseId: string;
    toHouseId: string;
    now: Date;
    today: number;
  },
): Promise<void> {
  const from = await playerOf(deps, input.fromHouseId);
  const to = await playerOf(deps, input.toHouseId);
  if (!from || !to) return;
  for (const vassalId of input.line.vassalIds) {
    if (vassalId === input.toHouseId) continue;
    await moveVassal(deps, { ...input, vassalId });
  }
  await transferVillages(deps, input.line.villageIds, from, to);
}

// --- pohled pána (dialog Odúmrť) ---

/** Dialog odúmrti pro pána: co se dělí, komu smí díl připadnout a poslední návrh. */
export interface EscheatView {
  id: string;
  version: number;
  ownHouseId: string;
  deadName: string;
  lords: { houseId: string; name: string }[];
  villages: { id: string; name: string; mapId: string }[];
  vassals: { houseId: string; name: string }[];
  /** Kdo smí díl dostat: páni a jejich vazalové (`gift` – věnování, obdarovaný smí odmítnout). */
  recipients: { houseId: string; name: string; gift: boolean }[];
  plan: EscheatPart[] | null;
  consents: string[];
}

/** Nerozhodnuté odúmrti, o kterých hráč rozhoduje (počítá se na vyžádání – dialog). */
export async function escheatDialogs(
  deps: Pick<EscheatDeps, 'escheats' | 'vassalages'> & {
    houses: Pick<HouseRepository, 'activeOf' | 'byId'>;
    villages: Pick<VillageRepository, 'find' | 'inbox'>;
  },
  input: { playerId: string },
): Promise<EscheatView[]> {
  const house = await deps.houses.activeOf(input.playerId);
  if (!house) return [];
  const nameOf = async (houseId: string): Promise<string> => {
    const found = await deps.houses.byId(houseId);
    return found ? houseName(deps, found) : UNNAMED_HOUSE;
  };
  const views: EscheatView[] = [];
  for (const escheat of await deps.escheats.openOfLord(house.id)) {
    const scope = await scopeOf(deps, escheat);
    const villages: EscheatView['villages'] = [];
    for (const id of escheat.villageIds) {
      const village = await deps.villages.find(id);
      villages.push({ id, name: village?.name ?? '', mapId: scope.mapOf[id] ?? id });
    }
    const lords = await Promise.all(
      escheat.lordHouseIds.map(async (id) => ({ houseId: id, name: await nameOf(id) })),
    );
    const gifts = await Promise.all(
      Object.keys(scope.giftFrom).map(async (id) => ({
        houseId: id,
        name: await nameOf(id),
        gift: true,
      })),
    );
    views.push({
      id: escheat.id,
      version: escheat.version,
      ownHouseId: house.id,
      deadName: await nameOf(escheat.deadHouseId),
      lords,
      villages,
      vassals: await Promise.all(
        escheat.vassalIds.map(async (id) => ({ houseId: id, name: await nameOf(id) })),
      ),
      recipients: [...lords.map((l) => ({ ...l, gift: false })), ...gifts],
      plan: escheat.plan,
      consents: escheat.consents,
    });
  }
  return views;
}
