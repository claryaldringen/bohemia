import {
  BandFailureError,
  choosePremiumType,
  CURRENT_LAYER_VERSIONS,
  generateAcceptedLandscape,
  generateLandscapeAttempt,
  MAX_ATTEMPTS,
  type Landscape,
  type LayerVersions,
  type PremiumType,
} from '../domain/landscape';
import {
  DEFAULT_LANGUAGE,
  cellLandscapeSeed,
  isolatedLandscapeSeed,
  placeNewPlayer,
  type LanguageGroup,
  type PlacementRequest,
} from '../domain/world';
import type { GridCell } from '../domain/village/world-grid';
import type { House, HouseRepository } from './houses';
import type { InviteRepository } from './invites';
import type { NoticeRepository } from './notices';
import type { VassalageRepository } from './vassalages';
import {
  isIsolated,
  type LandscapeSource,
  type Settlement,
  type SettlementRepository,
} from './settlements';

/**
 * Pozvánky při vstupu nového hráče: rezervovaný kód udělá z nováčka vazala pozvatele (vassalage.md –
 * Pozvaný jako vazal). Bez nich je každý nováček nezávislý.
 */
export interface InvitationDeps {
  invites: InviteRepository;
  vassalages: VassalageRepository;
  notices: NoticeRepository;
  /** Dnešní herní den (den vzniku vazalství a upozornění). */
  gameDay: () => number;
}

export interface EnterGameDeps {
  /** Pozvánky; bez nich se rezervace nevyužívá a nováček je nezávislý. */
  invitation?: InvitationDeps;
  settlements: SettlementRepository;
  houses: HouseRepository;
  /** Jazyk účtu hráče (rod ho dostane při založení); bez portu čeština. */
  accountLanguage?: (playerId: string) => Promise<LanguageGroup>;
  /** Skutečný čas – den založení rodu (doména čas nezná, přichází zvenku). */
  now: () => Date;
  /** Seed světa – krajina každého políčka mřížky se z něj odvozuje (`cellLandscapeSeed`). */
  worldSeed: number;
  /** Krajina uloženého sídla – bez ní se pokaždé vygeneruje znovu. */
  landscapes?: LandscapeSource;
}

export interface EnterGameResult {
  settlement: Settlement;
  landscape: Landscape;
}

/**
 * Vstup hráče do hry: najde jeho sídelní sídlo, nebo ho založí, a vrátí sídlo s krajinou.
 * Pozvaný dostane místo na mapě světa u pána; nováček bez pozvánky začne v odříznuté krajině
 * (newcomers.md) – sídlo jen v místní mřížce rodu, rod bez umístění, dokud si nevybere pána
 * nebo nezačne svobodný (`newcomers.ts`).
 */
export async function enterGame(deps: EnterGameDeps, playerId: string): Promise<EnterGameResult> {
  const existing = await deps.settlements.findSeat(playerId);
  const landscapeOf = (settlement: Settlement): Landscape =>
    settlementLandscape(settlement, deps.landscapes);
  if (existing) {
    await ensureHouse(deps, playerId, isIsolated(existing) ? null : undefined);
    return { settlement: existing, landscape: landscapeOf(existing) };
  }

  // Pozvaný dostane místo blízko pána; kód se využije, i když pán už nežije (pak je odříznutý).
  const lord = await consumeInvitation(deps, playerId);
  const request: PlacementRequest | null = lord ? { kind: 'invited', lordSeat: lord.seat } : null;

  // Pozvaný dostane nejbližší volné políčko společné mřížky; souběh dvou nováčků na témže
  // políčku rozhodne unikátní index – poražený zkusí znovu s čerstvou mapou obsazení. Nováček bez
  // pozvánky začne v odříznuté krajině (newcomers.md): sídlo jen v místní mřížce rodu (0, 0),
  // krajina z vlastního seedu hráče, rod bez umístění na mapu světa. Sídelní sídlo lidského
  // hráče má prémiovou krajinu (premium-landscapes.md – Kdo dostane jakou krajinu): typ, který
  // hráč už dostal (Začít znovu ho nepřelosuje), jinak nejméně zastoupený ve světě.
  const owned = await deps.settlements.lastPremiumType(playerId);
  for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
    const occupied = await deps.settlements.occupiedCells();
    const cell = request ? placeNewPlayer(occupied, request) : null;
    const seed = cell
      ? cellLandscapeSeed(deps.worldSeed, cell)
      : isolatedLandscapeSeed(deps.worldSeed, playerId);
    const premium = owned ?? choosePremiumType(seed, await deps.settlements.premiumTypeCounts());
    const accepted = acceptedPremiumLandscape(seed, premium);
    const settlement = await deps.settlements.createSeat({
      ownerId: playerId,
      landscapeSeed: accepted.seed,
      layerVersions: PREMIUM_LAYER_VERSIONS,
      premiumType: premium,
      ...(cell ? { worldCell: cell } : { localCell: { x: 0, y: 0 } }),
    });
    if (!settlement) continue;
    const house = await ensureHouse(deps, playerId, isIsolated(settlement) ? null : undefined);
    if (lord) await becomeVassal(deps, lord.house, house);
    // Při souběhu mohl sídlo založit jiný požadavek téhož hráče – platí uložené (seed i typ).
    const same =
      settlement.landscapeSeed === accepted.seed && (settlement.premiumType ?? null) === premium;
    const landscape = same ? accepted.landscape : landscapeOf(settlement);
    return { settlement, landscape };
  }
  throw new Error(`Hráči ${playerId} se nepodařilo najít volné místo ve světě.`);
}

/**
 * Hráč má vždy živý rod – chybějící (nový hráč, po restartu) se založí; souběh dá jeden.
 * `placedAt` null = odříznutý rod (bez umístění), bez něj je rod na mapě od založení.
 */
async function ensureHouse(
  deps: EnterGameDeps,
  playerId: string,
  placedAt?: Date | null,
): Promise<House> {
  const existing = await deps.houses.activeOf(playerId);
  if (existing) return existing;
  const language = deps.accountLanguage ? await deps.accountLanguage(playerId) : DEFAULT_LANGUAGE;
  const createdAt = deps.now();
  return deps.houses.create({
    playerId,
    kind: 'player',
    createdAt,
    language,
    placedAt: placedAt === undefined ? createdAt : placedAt,
  });
}

interface InvitingLord {
  house: House;
  seat: GridCell;
}

/**
 * Využije rezervovaný pozvánkový kód nového hráče. Vrátí rod pozvatele a polohu jeho sídla, když
 * pozvatel žije a sídlo má polohu; jinak null (nezávislý nováček).
 */
async function consumeInvitation(
  deps: EnterGameDeps,
  playerId: string,
): Promise<InvitingLord | null> {
  if (!deps.invitation) return null;
  const invite = await deps.invitation.invites.consumeReservation(playerId, deps.now());
  if (!invite) return null;
  const house = await deps.houses.activeOf(invite.issuerId);
  if (!house) return null;
  const seat = await deps.settlements.findSeat(invite.issuerId);
  return seat?.worldCell ? { house, seat: { x: seat.worldCell.x, y: seat.worldCell.y } } : null;
}

/** Nováček je vazalem pozvatele (holá přísaha, bez podmínek) a pán se to dozví. */
async function becomeVassal(deps: EnterGameDeps, lord: House, vassal: House): Promise<void> {
  const invitation = deps.invitation;
  if (!invitation) return;
  const day = invitation.gameDay();
  await invitation.vassalages.create({
    lordHouseId: lord.id,
    vassalHouseId: vassal.id,
    terms: {},
    origin: 'invite',
    sinceAt: deps.now(),
    sinceDay: day,
  });
  if (lord.playerId === null) return;
  await invitation.notices.post({
    playerId: lord.playerId,
    kind: 'invite-accepted',
    // jen veřejné id rodu – id účtu cizího hráče do prohlížeče nepatří
    payload: { houseId: vassal.id },
    gameDay: day,
  });
}

/** Kolikrát se nováček pokusí o místo, než se vzdá (souběh s jinými nováčky). */
const PLACEMENT_ATTEMPTS = 5;

/**
 * Verze vrstev prémiové krajiny – průměrné vrstvy a prémiový průchod. Sídlo zatím vzniká bez
 * výřezu kostry, proto průchod 1 (typy kostry s vlastní řekou); průchod 2 (`PREMIUM_LAYER_VERSION`,
 * typ kostry na místě kostry) přijde s umístěním sídla podle kostry (`placeSeat`).
 */
const PREMIUM_LAYER_VERSIONS: LayerVersions = {
  ...CURRENT_LAYER_VERSIONS,
  premium: 1,
};

/**
 * Kolik oken po `MAX_ATTEMPTS` pokusech se zkusí, než se vstup vzdá – prémiový typ projde
 * pásmem do `MAX_ATTEMPTS` pokusů aspoň na 95 % seedů (premium-landscapes.md – Generátor), takže
 * na seedu, kde neprojde, se pokračuje dalšími seedy (seed + 16, + 32 …).
 */
const PREMIUM_SEED_WINDOWS = 4;

/** Prémiová krajina sídelního sídla – první okno seedů, kde typ projde pásmem. */
function acceptedPremiumLandscape(
  seed: number,
  premium: PremiumType,
): { seed: number; landscape: Landscape } {
  for (let window = 0; ; window++) {
    try {
      return generateAcceptedLandscape(
        (seed + window * MAX_ATTEMPTS) >>> 0,
        PREMIUM_LAYER_VERSIONS,
        premium,
      );
    } catch (error) {
      if (!(error instanceof BandFailureError) || window + 1 >= PREMIUM_SEED_WINDOWS) throw error;
    }
  }
}

/** Uložené sídlo má seed přijatého pokusu – krajina se generuje přesně z něj, bez pásma. */
const GENERATED: LandscapeSource = { landscapeOf: generateLandscapeAttempt };

/**
 * Krajina uloženého sídla – z mezipaměti vstupního bodu, nebo vygenerovaná ze seedu; s prémiovým
 * typem sídla (bez něj průměrná krajina bit po bitu jako dřív).
 */
export function settlementLandscape(
  settlement: Settlement,
  landscapes?: LandscapeSource,
): Landscape {
  return (landscapes ?? GENERATED).landscapeOf(
    settlement.landscapeSeed,
    settlement.layerVersions,
    settlement.premiumType ?? undefined,
  );
}
