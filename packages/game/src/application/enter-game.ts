import {
  CURRENT_LAYER_VERSIONS,
  generateAcceptedLandscape,
  generateLandscapeAttempt,
  type Landscape,
} from '../domain/landscape';
import {
  DEFAULT_LANGUAGE,
  cellLandscapeSeed,
  placeNewPlayer,
  type LanguageGroup,
  type PlacementRequest,
} from '../domain/world';
import type { GridCell } from '../domain/village/world-grid';
import type { House, HouseRepository } from './houses';
import type { InviteRepository } from './invites';
import type { NoticeRepository } from './notices';
import type { VassalageRepository } from './vassalages';
import type { LandscapeSource, Settlement, SettlementRepository } from './settlements';

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

/** Vstup hráče do hry: najde jeho sídelní sídlo, nebo ho založí, a vrátí sídlo s krajinou. */
export async function enterGame(deps: EnterGameDeps, playerId: string): Promise<EnterGameResult> {
  const existing = await deps.settlements.findSeat(playerId);
  const landscapeOf = (settlement: Settlement): Landscape =>
    settlementLandscape(settlement, deps.landscapes);
  if (existing) {
    await ensureHouse(deps, playerId);
    return { settlement: existing, landscape: landscapeOf(existing) };
  }

  // Pozvaný dostane místo blízko pána; kód se využije, i když pán už nežije (pak je nezávislý).
  const lord = await consumeInvitation(deps, playerId);
  const request: PlacementRequest = lord
    ? { kind: 'invited', lordSeat: lord.seat }
    : { kind: 'independent' };

  // Nováček dostane nejbližší volné políčko společné mřížky; souběh dvou nováčků na témže
  // políčku rozhodne unikátní index – poražený zkusí znovu s čerstvou mapou obsazení.
  for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
    const cell = placeNewPlayer(await deps.settlements.occupiedCells(), request);
    const accepted = generateAcceptedLandscape(cellLandscapeSeed(deps.worldSeed, cell));
    const settlement = await deps.settlements.createSeat({
      ownerId: playerId,
      landscapeSeed: accepted.seed,
      layerVersions: CURRENT_LAYER_VERSIONS,
      worldCell: cell,
    });
    if (!settlement) continue;
    const house = await ensureHouse(deps, playerId);
    if (lord) await becomeVassal(deps, lord.house, house);
    // Při souběhu mohl sídlo založit jiný požadavek téhož hráče – platí uložené.
    const landscape =
      settlement.landscapeSeed === accepted.seed ? accepted.landscape : landscapeOf(settlement);
    return { settlement, landscape };
  }
  throw new Error(`Hráči ${playerId} se nepodařilo najít volné místo ve světě.`);
}

/** Hráč má vždy živý rod – chybějící (nový hráč, po restartu) se založí; souběh dá jeden. */
async function ensureHouse(deps: EnterGameDeps, playerId: string): Promise<House> {
  const existing = await deps.houses.activeOf(playerId);
  if (existing) return existing;
  const language = deps.accountLanguage ? await deps.accountLanguage(playerId) : DEFAULT_LANGUAGE;
  return deps.houses.create({ playerId, kind: 'player', createdAt: deps.now(), language });
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

/** Uložené sídlo má seed přijatého pokusu – krajina se generuje přesně z něj, bez pásma. */
const GENERATED: LandscapeSource = { landscapeOf: generateLandscapeAttempt };

/** Krajina uloženého sídla – z mezipaměti vstupního bodu, nebo vygenerovaná ze seedu. */
export function settlementLandscape(
  settlement: Settlement,
  landscapes?: LandscapeSource,
): Landscape {
  return (landscapes ?? GENERATED).landscapeOf(settlement.landscapeSeed, settlement.layerVersions);
}
