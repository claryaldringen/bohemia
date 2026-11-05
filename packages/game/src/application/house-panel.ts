import { INVITES, isInviteUnused } from '../domain/world';
import type { ActivityRepository } from './activity';
import type { HouseRepository } from './houses';
import type { InviteRepository } from './invites';
import type { SettlementRepository } from './settlements';
import type { VassalageRepository } from './vassalages';
import { publicHouseOf, type PublicHouse, type WorldDirectory } from './world-directory';

// Panel „Rod a vazalové“ – první verze (vassalage.md – Co hráč vidí): data pro rozhraní. Nese jen
// to, co je o cizím rodu veřejné (jako adresář rodů) – žádná id účtů, zásoby ani výzbroj.

/** Kolik nejbližších cizích rodů panel ukáže v seznamu hráčů. */
export const PANEL_OTHERS_LIMIT = 12;

/** Kolik využitých pozvánek panel ukáže (nejnovější první). */
const PANEL_USED_INVITES = 6;

/** Muž vlastního rodu v panelu (od 16 let). */
export interface PanelMan {
  name: string | null;
  age: number;
  villageName: string;
}

/** Vydaná pozvánka: nevyužitá (platí do `validUntil`), nebo využitá pozvaným rodem. */
export type PanelInvite =
  | { state: 'open'; code: string; validUntil: Date }
  | {
      state: 'used';
      code: string;
      /** Veřejný pohled na rod pozvaného, nebo null, když už žádný živý nemá. */
      house: PublicHouse | null;
      /** Pozvaný se rozehrál (kredit nástupnictví). */
      played: boolean;
    };

/** Data panelu; web z nich složí `HouseView`. */
export interface HousePanelData {
  /** Hráč má živý rod (bez něj je panel prázdný). */
  hasHouse: boolean;
  /** Vlastní rod: id a muži od 16 let. */
  own: { houseId: string; men: PanelMan[] } | null;
  lords: PublicHouse[];
  vassals: PublicHouse[];
  /** Cizí hráči podle vzdálenosti; pány a vazaly neopakují. */
  others: PublicHouse[];
  invites: PanelInvite[];
  freeInviteSlots: number;
}

export interface HousePanelDeps {
  houses: HouseRepository;
  settlements: SettlementRepository;
  worldDirectory: WorldDirectory;
  vassalages: VassalageRepository;
  invites: InviteRepository;
  activity: ActivityRepository;
  now: () => Date;
}

const EMPTY: HousePanelData = {
  hasHouse: false,
  own: null,
  lords: [],
  vassals: [],
  others: [],
  invites: [],
  freeInviteSlots: 0,
};

/** Rod, kterého adresář nezná (bez sídelního sídla) – jen id. */
const unknownHouse = (houseId: string): PublicHouse => ({
  houseId,
  lordName: null,
  seat: { x: 0, y: 0 },
  distance: 0,
  men: [],
  villages: 0,
});

/** Data panelu hráče ke dni `today`. */
export async function housePanel(
  deps: HousePanelDeps,
  input: { playerId: string; today: number },
): Promise<HousePanelData> {
  const own = await deps.houses.activeOf(input.playerId);
  if (!own) return EMPTY;
  const seat = (await deps.settlements.findSeat(input.playerId))?.worldCell ?? null;
  const now = deps.now();

  const vassalages = await deps.vassalages.activeOf(own.id);
  const lordIds = vassalages.filter((v) => v.vassalHouseId === own.id).map((v) => v.lordHouseId);
  const vassalIds = vassalages.filter((v) => v.lordHouseId === own.id).map((v) => v.vassalHouseId);

  const allInvites = await deps.invites.listOf(input.playerId);
  const usedHouseIds = new Map<string, string | null>();
  const used = allInvites
    .filter((i) => i.usedBy !== null && i.revokedAt === null)
    .slice(0, PANEL_USED_INVITES);
  for (const invite of used) {
    usedHouseIds.set(invite.code, (await deps.houses.activeOf(invite.usedBy!))?.id ?? null);
  }

  const wanted = [
    ...new Set([
      own.id,
      ...lordIds,
      ...vassalIds,
      ...[...usedHouseIds.values()].flatMap((id) => (id ? [id] : [])),
    ]),
  ];
  const entries = await deps.worldDirectory.entriesOf(wanted);
  const center = seat ?? { x: 0, y: 0 };
  const publicOf = (houseId: string): PublicHouse => {
    const entry = entries.find((e) => e.house.id === houseId);
    return entry ? publicHouseOf(entry, center, input.today) : unknownHouse(houseId);
  };

  const usedHouseOf = (houseId: string | null): PublicHouse | null =>
    houseId !== null && entries.some((e) => e.house.id === houseId) ? publicOf(houseId) : null;

  const ownEntry = entries.find((e) => e.house.id === own.id);
  const ownView = ownEntry ? publicHouseOf(ownEntry, center, input.today) : null;

  const linked = new Set([...lordIds, ...vassalIds]);
  const nearby = seat
    ? (await deps.worldDirectory.nearestHouses(seat, PANEL_OTHERS_LIMIT + linked.size, own.id))
        .map((entry) => publicHouseOf(entry, seat, input.today))
        .filter((h) => !linked.has(h.houseId))
        .slice(0, PANEL_OTHERS_LIMIT)
    : [];

  const invites: PanelInvite[] = [];
  for (const invite of allInvites) {
    if (isInviteUnused(invite, now)) {
      invites.push({ state: 'open', code: invite.code, validUntil: invite.validUntil });
    }
  }
  const openCount = invites.length;
  for (const invite of used) {
    invites.push({
      state: 'used',
      code: invite.code,
      house: usedHouseOf(usedHouseIds.get(invite.code) ?? null),
      played: (await deps.activity.distinctDays(invite.usedBy!)) >= INVITES.playedDays,
    });
  }

  return {
    hasHouse: true,
    own: { houseId: own.id, men: ownView?.men ?? [] },
    lords: lordIds.map(publicOf),
    vassals: vassalIds.map(publicOf),
    others: nearby,
    invites,
    freeInviteSlots: Math.max(0, INVITES.maxUnused - openCount),
  };
}
