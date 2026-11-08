import { deriveSeed } from '../domain/landscape/random';
import type { LayerVersions, PremiumType, SkeletonSlice } from '../domain/landscape';
import {
  NEWCOMERS,
  isolatedLandscapeSeed,
  lordOffer,
  placeCluster,
  type LanguageGroup,
  type OccupiedCell,
  type PlacementRequest,
} from '../domain/world';
import type { House, HouseRepository } from './houses';
import { openNegotiation, type NegotiateDeps } from './negotiate';
import { houseName, noticeHouse } from './negotiation-chronicle';
import type { NegotiationRecord, NegotiationTx } from './negotiations';
import type { WorldCell } from './settlements';
import { publicHouseOf, type WorldDirectory } from './world-directory';
import { seatOnWorld, seatSkeleton, type SeatSkeleton } from './world-seat';

// Vstup nového hráče do světa (docs/design/newcomers.md): odříznutý nováček si vybere pány
// z nabídky (žádost = holá přísaha, pán jen přijme / odmítne), nebo začne svobodný; po týdnu
// rozhodne los. Umístění na mapu světa přesune celý shluk vsí rodu – první uložené vyhraje
// (podmíněný zápis `placed_at IS NULL`).

const DAY_MS = 86_400_000;

/** Kolikrát zkusit umístit shluk, když políčko mezitím obsadí souběžný zápis do mřížky. */
const PLACEMENT_ATTEMPTS = 3;

/** Vylosovaná žádost se mezi čtením a transakcí losu změnila (odmítnutí) – los příště znovu. */
const LOT_STALE = 'Žádost se mezitím změnila.';

export const NEWCOMER_REASONS = {
  noHouse: 'Nemáš živý rod.',
  placed: 'Už jsi na mapě světa.',
  taken: 'Nováček už má pána.',
  choices: `Vyber jednoho až ${NEWCOMERS.maxChoices} rodů.`,
  notOffered: 'Ten rod se teď za pána nenabízí.',
  waiting: 'Na odpověď pánů se ještě čeká.',
  weekOver: 'Týden na výběr pána už uplynul.',
  lordGone: 'Pán už není na mapě světa.',
  onlyAccept: 'Nováček žádá jen o přijetí.',
  /** Odříznutý rod nesmí jednat s cizími rody ani vydat pozvánku (newcomers.md). */
  notPlaced: 'Nejdřív musíš být na mapě světa.',
  /** Cíl (jednání, válka, zásilka) je odříznutý rod – nikdo ho nevidí. */
  isolatedTarget: 'Ten rod není na mapě světa.',
  /** Odříznutý nováček zakládá ves až po volbě cesty (newcomers.md – Tři cesty do světa). */
  choosePath: 'Nejdřív si vyber pána, nebo začni svobodný.',
} as const;

/**
 * Umístění odříznutého nováčka uvnitř transakce jednání. Pořadí zámků: řádek jednání (přijetí) →
 * zámek umisťování → řádek rodu; jiná jednání se v téže transakci nezamykají (zavře je
 * `closeNewcomerRequests` po transakci) – žádné uváznutí.
 */
export interface PlacementTx {
  /** Umisťování nováčků jde po jednom do konce transakce (dva shluky na stejné políčko ne). */
  lockPlacement(): Promise<void>;
  /** Podmíněně (`placed_at IS NULL`, rod živý) zapíše umístění; false – už umístěný. */
  claim(houseId: string, at: Date): Promise<boolean>;
  /**
   * Zamkne řádek odříznutého živého rodu do konce transakce (`FOR UPDATE`) – žádosti nováčka se
   * zapisují po jedné a umístění (`claim`) počká; false – rod už je na mapě světa nebo zanikl.
   */
  lockIsolated(houseId: string): Promise<boolean>;
  /** Místní polohy odříznutých sídel hráče, sídelní první. */
  isolatedCells(ownerId: string): Promise<WorldCell[]>;
  /** Aktivní mapy světa všech hráčů. */
  occupiedCells(): Promise<OccupiedCell[]>;
  /** Mapy světa živých umístěných rodů hráčů s jazykem `language` (umístění svobodného). */
  languageCells(language: LanguageGroup): Promise<WorldCell[]>;
  /** Poloha sídelního sídla hráče na mapě světa; null – nemá (odříznutý, bez sídla). */
  seatCell(ownerId: string): Promise<WorldCell | null>;
  /**
   * Přesune odříznutá sídla hráče na mapu světa (místní poloha + `shift`) a místní smaže; false –
   * cílové políčko mezitím obsadil souběžný zápis do mřížky (nic se nepřesunulo).
   */
  moveIsolated(ownerId: string, shift: WorldCell): Promise<boolean>;
  /** Kolik hráčů má který prémiový typ (`SettlementRepository.premiumTypeCounts`). */
  premiumTypeCounts(): Promise<Partial<Record<PremiumType, number>>>;
  /** Typ, který hráč dostal (`SettlementRepository.lastPremiumType` – jen sídla s vsí a archivovaná). */
  lastPremiumType(playerId: string): Promise<PremiumType | null>;
  /** Má hráč odříznuté sídelní sídlo bez vsi (svobodný nováček, který ještě nezaložil ves)? */
  seatWithoutVillage(ownerId: string): Promise<boolean>;
  /**
   * Přesídlí odříznuté sídelní sídlo bez vsi na políčko mapy světa s novou krajinou (seed, verze,
   * typ, výřez) – podmíněně: sídlo je pořád odříznuté a bez vsi. False – podmínka neplatí (ves
   * mezitím založená), nebo políčko obsadil souběžný zápis do mřížky (nic se nezměnilo).
   */
  reseatIsolated(playerId: string, seat: IsolatedReseat): Promise<boolean>;
}

/** Nové místo a krajina odříznutého sídla bez vsi (`PlacementTx.reseatIsolated`). */
export interface IsolatedReseat {
  worldCell: WorldCell;
  landscapeSeed: number;
  layerVersions: LayerVersions;
  premiumType: PremiumType;
  skeleton: SkeletonSlice | null;
}

/** Rod v nabídce pánů – jen veřejné údaje (praporec kreslí web podle `houseId`). */
export interface OfferHouse {
  houseId: string;
  lordName: string;
  language: LanguageGroup;
}

export interface NewcomerRequest {
  houseId: string;
  /** Jméno hlavy žádaného rodu (prázdné, když rod už v adresáři není). */
  lordName: string;
  state: 'pending' | 'rejected';
}

export type NewcomerStatus =
  | { phase: 'isolated'; offer: OfferHouse[]; requests: NewcomerRequest[]; deadline: Date | null }
  | { phase: 'placed' };

export type NewcomerResult = { ok: true } | { ok: false; reason: string };

export type NewcomerDeps = NegotiateDeps & {
  houses: Pick<HouseRepository, 'activeOf' | 'byId' | 'markNewcomerSince' | 'waitingNewcomers'>;
  worldDirectory: Pick<WorldDirectory, 'entriesOf' | 'offerCandidates'>;
  /** Seed světa – z něj a id účtu pevné pořadí nabídky a los. */
  worldSeed: number;
};

const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

/** Seed účtu nováčka – pořadí nabídky i los po týdnu (newcomers.md, návrh Clauda). */
export function accountSeed(worldSeed: number, playerId: string): number {
  return deriveSeed(worldSeed, `newcomer:${playerId}`);
}

/** Konec týdne na výběr pána – 7 skutečných dní od první žádosti; null – ještě nežádal. */
export function newcomerDeadline(house: Pick<House, 'newcomerSince'>): Date | null {
  return house.newcomerSince === null
    ? null
    : new Date(house.newcomerSince.getTime() + NEWCOMERS.waitDays * DAY_MS);
}

/**
 * Kdy rozhodne los: týden od první žádosti; odříznutý rod, který cestu ještě nezvolil, týden od
 * založení rodu (pojistka – začne svobodný; návrh Clauda, newcomers.md).
 */
function newcomerLotAt(house: Pick<House, 'newcomerSince' | 'createdAt'>): Date {
  return (
    newcomerDeadline(house) ?? new Date(house.createdAt.getTime() + NEWCOMERS.waitDays * DAY_MS)
  );
}

/**
 * Smí hráč založit ves? Odříznutý nováček nejdřív zvolí cestu – pošle žádost o pána
 * (`newcomerSince`), nebo začne svobodný (pak už je na mapě světa). newcomers.md: „Volba 2 nebo 3
 * padne při vstupu do hry, před stavbou vesnice“. Vrací důvod odmítnutí, nebo null.
 */
export async function newcomerFoundingReason(
  houses: Pick<HouseRepository, 'activeOf'>,
  playerId: string,
): Promise<string | null> {
  const house = await houses.activeOf(playerId);
  return house && house.placedAt === null && house.newcomerSince === null
    ? NEWCOMER_REASONS.choosePath
    : null;
}

/** Žádosti nováčka: čekající a odmítnuté (stažené a zaniklé se nepočítají), bez jmen pánů. */
async function requestsOf(
  deps: NewcomerDeps,
  house: House,
): Promise<Omit<NewcomerRequest, 'lordName'>[]> {
  const records = await deps.negotiations.newcomerRequestsOf(house.id);
  return records.flatMap((r): Omit<NewcomerRequest, 'lordName'>[] =>
    r.status === 'open'
      ? [{ houseId: r.recipientHouseId, state: 'pending' }]
      : r.status === 'rejected'
        ? [{ houseId: r.recipientHouseId, state: 'rejected' }]
        : [],
  );
}

/** Id rodů nabídky pro nováčka – bez rodů, které už žádal. */
async function offerIds(deps: NewcomerDeps, house: House, asked: Set<string>): Promise<string[]> {
  const candidates = (await deps.worldDirectory.offerCandidates()).filter(
    (c) => c.houseId !== house.id && !asked.has(c.houseId),
  );
  return lordOffer(candidates, {
    language: house.language,
    seed: accountSeed(deps.worldSeed, house.playerId ?? house.id),
  });
}

/** Odříznutý živý rod hráče, nebo důvod, proč nováček nic volit nemůže. */
async function isolatedHouse(
  deps: Pick<NegotiateDeps, 'houses'>,
  playerId: string,
): Promise<{ ok: true; house: House } | { ok: false; reason: string }> {
  const house = await deps.houses.activeOf(playerId);
  if (!house) return fail(NEWCOMER_REASONS.noHouse);
  if (house.placedAt !== null) return fail(NEWCOMER_REASONS.placed);
  return { ok: true, house };
}

/** Stav nováčka: odříznutý (nabídka, žádosti, konec týdne), nebo už na mapě světa. */
export async function newcomerStatus(
  deps: NewcomerDeps,
  playerId: string,
): Promise<NewcomerStatus> {
  const found = await isolatedHouse(deps, playerId);
  if (!found.ok) return { phase: 'placed' };
  const { house } = found;
  const requests = await requestsOf(deps, house);
  const ids = await offerIds(deps, house, new Set(requests.map((r) => r.houseId)));
  const entries = new Map(
    (await deps.worldDirectory.entriesOf([...ids, ...requests.map((r) => r.houseId)])).map(
      (e) => [e.house.id, e] as const,
    ),
  );
  const nameOf = (id: string): string | null => {
    const entry = entries.get(id);
    return entry ? (publicHouseOf(entry, entry.seat, 0).lordName ?? '') : null;
  };
  const offer = ids.flatMap((id): OfferHouse[] => {
    const entry = entries.get(id);
    if (!entry) return [];
    return [{ houseId: id, lordName: nameOf(id) ?? '', language: entry.house.language }];
  });
  return {
    phase: 'isolated',
    offer,
    requests: requests.map((r) => ({ ...r, lordName: nameOf(r.houseId) ?? '' })),
    deadline: newcomerDeadline(house),
  };
}

/**
 * Nováček požádá 1–5 rodů z aktuální nabídky o přijetí za vazala (holá přísaha, `terms: {}`).
 * Nový výběr jen po odmítnutí všemi a jen do konce týdne; první úspěšná žádost spustí týden.
 */
export async function requestLords(
  deps: NewcomerDeps,
  input: { playerId: string; houseIds: string[]; now: Date; today: number },
): Promise<NewcomerResult> {
  const found = await isolatedHouse(deps, input.playerId);
  if (!found.ok) return found;
  const { house } = found;
  const ids = [...new Set(input.houseIds)];
  if (ids.length < 1 || ids.length > NEWCOMERS.maxChoices) return fail(NEWCOMER_REASONS.choices);
  const deadline = newcomerDeadline(house);
  if (deadline && input.now.getTime() >= deadline.getTime()) {
    return fail(NEWCOMER_REASONS.weekOver);
  }
  const requests = await requestsOf(deps, house);
  if (requests.some((r) => r.state === 'pending')) return fail(NEWCOMER_REASONS.waiting);
  const offer = new Set(await offerIds(deps, house, new Set(requests.map((r) => r.houseId))));
  if (ids.some((id) => !offer.has(id))) return fail(NEWCOMER_REASONS.notOffered);
  let opened = 0;
  let firstReason: string | null = null;
  for (const lordId of ids) {
    const result = await openNegotiation(deps, {
      playerId: input.playerId,
      to: lordId,
      items: [{ kind: 'oath', lord: lordId, vassal: house.id }],
      message: null,
      now: input.now,
      today: input.today,
      newcomer: true,
    });
    if (result.ok) opened++;
    else firstReason ??= result.reason;
  }
  if (opened === 0) return fail(firstReason ?? NEWCOMER_REASONS.notOffered);
  // týden běží od první žádosti; nový výběr ho neprodlouží (podmíněný zápis)
  await deps.houses.markNewcomerSince(house.id, input.now);
  return { ok: true };
}

/** Nováček začne svobodný: stáhne žádosti a umístí se k rodům svého jazyka. */
export async function startFree(
  deps: Pick<NegotiateDeps, 'houses' | 'villages' | 'negotiations' | 'worldSeed'>,
  input: { playerId: string; now: Date; today: number },
): Promise<NewcomerResult> {
  const found = await isolatedHouse(deps, input.playerId);
  if (!found.ok) return found;
  const { house } = found;
  // žádosti napřed (vlastní transakce) – mezitím přijatá žádost vyhraje a umístění níž selže
  const withdraw = (): Promise<void> =>
    closeNewcomerRequests(deps, {
      houseId: house.id,
      status: 'withdrawn',
      notify: false,
      now: input.now,
      today: input.today,
    });
  await withdraw();
  const placed = await deps.negotiations.transaction((tx) =>
    placeNewcomer(deps, tx, {
      houseId: house.id,
      lordHouseId: null,
      origin: 'newcomer',
      now: input.now,
      today: input.today,
    }),
  );
  // žádost zapsaná souběžně před umístěním (`lockIsolated`) – po umístění už žádná nepřibude
  if (placed.ok) await withdraw();
  return placed.ok || placed.reason !== NEWCOMER_REASONS.taken
    ? placed
    : fail(NEWCOMER_REASONS.placed);
}

/**
 * Umístí odříznutý rod na mapu světa – uvnitř transakce jednání: podmíněně (`placed_at IS NULL`,
 * z více souběžných volání uspěje jedno, ostatní dostanou „Nováček už má pána.“) přesune celý
 * shluk vsí rodu se zachováním vzájemných poloh – vazal nejblíž sídlu pána (odstup 2), svobodný
 * nejblíž mapám rodů svého jazyka (odstup 3, bez nich u středu světa). Se seedem světa jen na suchá
 * políčka kostry (world-skeleton.md – Odříznutý nováček); svobodný, který ještě nezaložil ves,
 * se místo přesunu přesídlí – místo, typ a krajina z políčka světa jako u pozvaného (`seatOnWorld`).
 * U pána založí vazalství (holá přísaha). Ostatní žádosti zavře `closeNewcomerRequests` po transakci.
 */
export async function placeNewcomer(
  deps: Pick<NegotiateDeps, 'houses' | 'villages' | 'worldSeed'>,
  tx: NegotiationTx,
  input: {
    houseId: string;
    lordHouseId: string | null;
    origin: 'newcomer' | 'newcomer-lot';
    now: Date;
    today: number;
  },
): Promise<NewcomerResult> {
  await tx.placement.lockPlacement();
  const house = await deps.houses.byId(input.houseId);
  if (!house || house.endedAt !== null || house.playerId === null) {
    return fail(NEWCOMER_REASONS.noHouse);
  }
  const lord = input.lordHouseId ? await deps.houses.byId(input.lordHouseId) : null;
  const lordSeat =
    lord && lord.endedAt === null && lord.playerId !== null && lord.placedAt !== null
      ? await tx.placement.seatCell(lord.playerId)
      : null;
  if (input.lordHouseId !== null && (!lord || !lordSeat)) return fail(NEWCOMER_REASONS.lordGone);
  if (!(await tx.placement.claim(house.id, input.now))) return fail(NEWCOMER_REASONS.taken);

  const cluster = await tx.placement.isolatedCells(house.playerId);
  if (cluster.length > 0) {
    const request: PlacementRequest = lordSeat
      ? { kind: 'invited', lordSeat }
      : { kind: 'independent', sameLanguage: await tx.placement.languageCells(house.language) };
    const skeleton = deps.worldSeed === undefined ? null : seatSkeleton(deps.worldSeed);
    const reseated =
      lordSeat === null &&
      skeleton !== null &&
      cluster.length === 1 &&
      (await reseatFree(tx.placement, skeleton, house.playerId, request));
    if (!reseated) await moveCluster(tx.placement, skeleton, house.playerId, cluster, request);
  }

  if (lord && lordSeat) {
    await tx.vassalages.create({
      lordHouseId: lord.id,
      vassalHouseId: house.id,
      terms: {},
      origin: input.origin,
      sinceAt: input.now,
      sinceDay: input.today,
    });
    const lordName = await houseName(deps, lord);
    const kind = input.origin === 'newcomer' ? 'newcomer-accepted' : 'newcomer-assigned';
    await noticeHouse(tx, house, kind, { houseId: lord.id, name: lordName }, input.today);
    if (input.origin === 'newcomer-lot') {
      const name = await houseName(deps, house);
      await noticeHouse(
        tx,
        lord,
        'newcomer-assigned',
        { houseId: house.id, name, asLord: true },
        input.today,
      );
    }
  } else if (input.origin === 'newcomer-lot') {
    await noticeHouse(tx, house, 'newcomer-assigned', { houseId: null }, input.today);
  }
  return { ok: true };
}

/**
 * Přesune odříznutý shluk na mapu světa (`placeCluster`, se seedem světa jen na suchá políčka
 * kostry). Pozvaný a odchod ve světě zapisují do mřížky bez zámku umisťování – obsazené políčko →
 * znovu s čerstvou mapou obsazení.
 */
async function moveCluster(
  placement: PlacementTx,
  skeleton: SeatSkeleton | null,
  playerId: string,
  cluster: readonly WorldCell[],
  request: PlacementRequest,
): Promise<void> {
  const first = cluster[0];
  if (!first) return;
  for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
    const { offset } = placeCluster(
      await placement.occupiedCells(),
      cluster,
      request,
      skeleton?.isDryCell,
    );
    const shift = { x: offset.x - first.x, y: offset.y - first.y };
    if (await placement.moveIsolated(playerId, shift)) return;
  }
  // umístění už je zapsané (`claim`) – výjimka zruší celou transakci
  throw new Error(`Nováčka ${playerId} se nepodařilo umístit na mapu světa.`);
}

/**
 * Svobodný nováček bez vsi (world-skeleton.md – Svobodný nováček bez vsi): odříznutou krajinu jen
 * viděl, a tak sídlo dostane místo a typ jako pozvaný (`seatOnWorld` u map jeho jazykové skupiny)
 * a krajinu z políčka světa. False – sídlo už má ves (pak se přesune celý shluk na suchá políčka).
 */
async function reseatFree(
  placement: PlacementTx,
  skeleton: SeatSkeleton,
  playerId: string,
  request: PlacementRequest,
): Promise<boolean> {
  // typ sídla bez vsi hráči nepatří (`lastPremiumType` ho nevrací) – platí jen typ z dřívějška
  const owned = await placement.lastPremiumType(playerId);
  const playerSeed = isolatedLandscapeSeed(skeleton.worldSeed, playerId);
  for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
    if (!(await placement.seatWithoutVillage(playerId))) return false;
    const seat = seatOnWorld(
      {
        skeleton,
        occupied: await placement.occupiedCells(),
        counts: await placement.premiumTypeCounts(),
        playerSeed,
        owned,
      },
      request,
    );
    const done = await placement.reseatIsolated(playerId, {
      worldCell: seat.cell,
      landscapeSeed: seat.seed,
      layerVersions: seat.layerVersions,
      premiumType: seat.type,
      skeleton: seat.skeleton,
    });
    if (done) return true;
  }
  throw new Error(`Nováčka ${playerId} se nepodařilo přesídlit na mapu světa.`);
}

/**
 * Zavře otevřené žádosti nováčka (vlastní transakce, každé jednání pod svým zámkem): po umístění
 * zaniknou (`ended`, pánům upozornění `newcomer-taken`, kromě `quietLord`), při volbě
 * „Svobodný“ se stáhnou (`withdrawn`, bez upozornění).
 */
export async function closeNewcomerRequests(
  deps: Pick<NegotiateDeps, 'houses' | 'villages' | 'negotiations'>,
  input: {
    houseId: string;
    status: 'withdrawn' | 'ended';
    notify: boolean;
    quietLord?: string | null;
    now: Date;
    today: number;
  },
): Promise<void> {
  await deps.negotiations.transaction(async (tx) => {
    const open = (await tx.openOf(input.houseId)).filter(
      (r) => r.newcomer && r.initiatorHouseId === input.houseId,
    );
    const newcomer = await deps.houses.byId(input.houseId);
    for (const r of open) {
      const record: NegotiationRecord | null = await tx.getForUpdate(r.id);
      if (!record || record.status !== 'open') continue;
      if (!(await tx.setStatus(record.id, input.status, record.version, input.now))) continue;
      if (!input.notify || !newcomer || record.recipientHouseId === input.quietLord) continue;
      const lord = await deps.houses.byId(record.recipientHouseId);
      if (!lord) continue;
      await noticeHouse(
        tx,
        lord,
        'newcomer-taken',
        { houseId: newcomer.id, name: await houseName(deps, newcomer) },
        input.today,
      );
    }
  });
}

/**
 * Úloha světa (worker): nováček, kterému uplynul týden od první žádosti, dostane losem (seed účtu)
 * pána mezi vybranými živými rody, které žádost neodmítly; nezbude-li žádný, začne svobodný.
 * Odříznutý rod, který týden od založení cestu nezvolil, začne svobodný (pojistka). Souběh
 * s přijetím pánem rozhodne podmíněné umístění – vyhraje jeden.
 */
export async function expireNewcomerWaits(
  deps: NewcomerDeps,
  input: { now: Date; today: number },
): Promise<void> {
  // chyba jednoho rodu (např. souběžný zápis do mřížky) nepřeruší kolo – vyhodí se až na konci
  let failure: unknown = null;
  for (const house of await deps.houses.waitingNewcomers()) {
    if (input.now.getTime() < newcomerLotAt(house).getTime()) continue;
    try {
      await drawNewcomerLot(deps, house, input);
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure !== null) throw failure;
}

/** Los jednoho nováčka po týdnu (`expireNewcomerWaits`). */
async function drawNewcomerLot(
  deps: NewcomerDeps,
  house: House,
  input: { now: Date; today: number },
): Promise<void> {
  const open = (await deps.negotiations.newcomerRequestsOf(house.id)).filter(
    (r) => r.status === 'open',
  );
  const lords: string[] = [];
  for (const id of [...new Set(open.map((r) => r.recipientHouseId))].sort()) {
    const lord = await deps.houses.byId(id);
    if (lord && lord.endedAt === null && lord.placedAt !== null) lords.push(id);
  }
  const seed = deriveSeed(accountSeed(deps.worldSeed, house.playerId ?? house.id), 'lot');
  const chosen = lords.length > 0 ? (lords[seed % lords.length] ?? null) : null;
  const request = open.find((r) => r.recipientHouseId === chosen) ?? null;
  const place = (lordHouseId: string | null): Promise<NewcomerResult> =>
    deps.negotiations.transaction(async (tx) => {
      // žádosti se četly mimo transakci: vylosovanou zamknout (pořadí zámků jako přijetí –
      // řádek jednání → umisťování → rod) a vyžadovat, že je pořád otevřená (neodmítnutá)
      if (lordHouseId !== null && request) {
        const fresh = await tx.getForUpdate(request.id);
        if (!fresh || fresh.status !== 'open') return fail(LOT_STALE);
      }
      return placeNewcomer(deps, tx, {
        houseId: house.id,
        lordHouseId,
        origin: 'newcomer-lot',
        now: input.now,
        today: input.today,
      });
    });
  let placed = await place(chosen);
  // pán mezitím z mapy zmizel (vymřel) – nováček začne svobodný
  if (!placed.ok && placed.reason === NEWCOMER_REASONS.lordGone) placed = await place(null);
  // přijetí pánem mohlo vyhrát dřív – jeho zavření žádostí proběhlo tam; změněná žádost –
  // los příští kolo s čerstvými žádostmi
  if (!placed.ok) return;
  await closeNewcomerRequests(deps, {
    houseId: house.id,
    status: 'ended',
    notify: true,
    quietLord: chosen,
    now: input.now,
    today: input.today,
  });
}
