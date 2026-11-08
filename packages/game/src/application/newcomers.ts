import { deriveSeed } from '../domain/landscape/random';
import {
  NEWCOMERS,
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

// Vstup nového hráče do světa (docs/design/newcomers.md): odříznutý nováček si vybere pány
// z nabídky (žádost = holá přísaha, pán jen přijme / odmítne), nebo začne svobodný; po týdnu
// rozhodne los. Umístění na mapu světa přesune celý shluk vsí rodu – první uložené vyhraje
// (podmíněný zápis `placed_at IS NULL`).

const DAY_MS = 86_400_000;

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
  /** Místní polohy odříznutých sídel hráče, sídelní první. */
  isolatedCells(ownerId: string): Promise<WorldCell[]>;
  /** Aktivní mapy světa všech hráčů. */
  occupiedCells(): Promise<OccupiedCell[]>;
  /** Mapy světa živých umístěných rodů hráčů s jazykem `language` (umístění svobodného). */
  languageCells(language: LanguageGroup): Promise<WorldCell[]>;
  /** Poloha sídelního sídla hráče na mapě světa; null – nemá (odříznutý, bez sídla). */
  seatCell(ownerId: string): Promise<WorldCell | null>;
  /** Přesune odříznutá sídla hráče na mapu světa (místní poloha + `shift`) a místní smaže. */
  moveIsolated(ownerId: string, shift: WorldCell): Promise<void>;
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
  deps: Pick<NegotiateDeps, 'houses' | 'villages' | 'negotiations'>,
  input: { playerId: string; now: Date; today: number },
): Promise<NewcomerResult> {
  const found = await isolatedHouse(deps, input.playerId);
  if (!found.ok) return found;
  const { house } = found;
  // žádosti napřed (vlastní transakce) – mezitím přijatá žádost vyhraje a umístění níž selže
  await closeNewcomerRequests(deps, {
    houseId: house.id,
    status: 'withdrawn',
    notify: false,
    now: input.now,
    today: input.today,
  });
  const placed = await deps.negotiations.transaction((tx) =>
    placeNewcomer(deps, tx, {
      houseId: house.id,
      lordHouseId: null,
      origin: 'newcomer',
      now: input.now,
      today: input.today,
    }),
  );
  return placed.ok || placed.reason !== NEWCOMER_REASONS.taken
    ? placed
    : fail(NEWCOMER_REASONS.placed);
}

/**
 * Umístí odříznutý rod na mapu světa – uvnitř transakce jednání: podmíněně (`placed_at IS NULL`,
 * z více souběžných volání uspěje jedno, ostatní dostanou „Nováček už má pána.“) přesune celý
 * shluk vsí rodu se zachováním vzájemných poloh – vazal nejblíž sídlu pána (odstup 2), svobodný
 * nejblíž mapám rodů svého jazyka (odstup 3, bez nich u středu světa). U pána založí vazalství
 * (holá přísaha). Ostatní žádosti zavře `closeNewcomerRequests` po transakci.
 */
export async function placeNewcomer(
  deps: Pick<NegotiateDeps, 'houses' | 'villages'>,
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
  const first = cluster[0];
  if (first) {
    const request: PlacementRequest = lordSeat
      ? { kind: 'invited', lordSeat }
      : { kind: 'independent', sameLanguage: await tx.placement.languageCells(house.language) };
    const { offset } = placeCluster(await tx.placement.occupiedCells(), cluster, request);
    await tx.placement.moveIsolated(house.playerId, {
      x: offset.x - first.x,
      y: offset.y - first.y,
    });
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
  for (const house of await deps.houses.waitingNewcomers()) {
    if (input.now.getTime() < newcomerLotAt(house).getTime()) continue;
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
    const place = (lordHouseId: string | null): Promise<NewcomerResult> =>
      deps.negotiations.transaction((tx) =>
        placeNewcomer(deps, tx, {
          houseId: house.id,
          lordHouseId,
          origin: 'newcomer-lot',
          now: input.now,
          today: input.today,
        }),
      );
    let placed = await place(chosen);
    // pán mezitím z mapy zmizel (vymřel) – nováček začne svobodný
    if (!placed.ok && placed.reason === NEWCOMER_REASONS.lordGone) placed = await place(null);
    // přijetí pánem mohlo vyhrát dřív – jeho zavření žádostí proběhlo tam
    if (!placed.ok) continue;
    await closeNewcomerRequests(deps, {
      houseId: house.id,
      status: 'ended',
      notify: true,
      quietLord: chosen,
      now: input.now,
      today: input.today,
    });
  }
}
