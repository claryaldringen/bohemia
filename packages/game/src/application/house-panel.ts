import { canOpen, respondingHouse, type TermItem } from '../domain/negotiation';
import { treeBelowDepths } from '../domain/vassalage/tree';
import { VASSALAGE } from '../domain/vassalage/rules-vassalage';
import type { VassalTerms } from '../domain/vassalage/terms';
import type { HungerLevel } from '../domain/village';
import { INVITES, isInviteUnused } from '../domain/world';
import type { ActivityRepository } from './activity';
import type { DialogRepository } from './dialogs';
import type { HouseRepository, PersonRef } from './houses';
import type { InviteRepository } from './invites';
import type { NegotiationRepository } from './negotiations';
import type { SuccessionCreditRepository } from './succession-credits';
import type { SettlementRepository } from './settlements';
import type { StewardshipRepository } from './stewardships';
import type { VassalageRepository } from './vassalages';
import type { VillageRepository } from './villages';
import {
  publicHouseOf,
  type DirectoryEntry,
  type PublicHouse,
  type WorldDirectory,
} from './world-directory';

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
  villageId: string;
  personId: number;
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

/** Otevřené jednání hráčova rodu (vassalage.md – Vznik a jednání): poslední kolo a kdo je na tahu. */
export interface PanelNegotiation {
  id: string;
  /** Druhá strana jednání (veřejný pohled na rod). */
  other: PublicHouse;
  /** Hráčův rod má odpovědět (přijmout, odmítnout, protinávrh); jinak smí kolo stáhnout. */
  myTurn: boolean;
  /** Podmínky posledního kola; strany jsou id rodů. */
  items: TermItem[];
  /** Vzkaz posledního kola (text hráče). */
  message: string | null;
  /** Počet kol. */
  rounds: number;
}

/** Dohoda hráčova rodu s pánem nebo vazalem: podmínky a počet neplnění (zlomená pečeť). */
export interface PanelAgreement {
  vassalageId: string;
  lordHouseId: string;
  vassalHouseId: string;
  /** Druhá strana dohody (ne hráčův rod). */
  otherHouseId: string;
  /** Kým je druhá strana pro hráče. */
  other: 'lord' | 'vassal';
  terms: VassalTerms;
  /** Zapsaná neplnění vazala (`addBreach`); pán je vidí u vazala. */
  breaches: number;
  sinceDay: number;
  /** Čeká dialog Odvody k téhle dohodě (vazal ještě neodpověděl): za kolik let; jinak null. */
  levyYears: number | null;
}

/** Rod ve stromu pod hráčem: kdo je vazalem koho, podmínky té dohody a ikony stavu. */
export interface PanelTreeNode {
  house: PublicHouse;
  /** 1 = přímý vazal hráče, 2 = vazal vazala… */
  depth: number;
  /** Pán, od kterého k rodu vede dohoda. */
  parentHouseId: string;
  vassalageId: string;
  terms: VassalTerms;
  breaches: number;
  /** Nejhorší hlad ve vsích rodu (souhrn vsi), null = rod nemá aktivní ves. */
  hunger: HungerLevel | null;
  /** Muži rodu schopní služby. */
  shield: number;
}

/** Co smí hráč vůči cizímu rodu: důvod zašednutí (null = smí) u obou druhů nabídky a blokování. */
export interface PanelPlayerActions {
  /** Nabídnout vazalství (hráč pánem). */
  offer: string | null;
  /** Požádat o přijetí (hráč vazalem). */
  request: string | null;
  /** Hráč tento rod už zablokoval. */
  blockedByMe: boolean;
}

/** Ves hráčova rodu, kterou spravuje jiný rod (tlačítko Odvolat; vassalage.md – Odvolání). */
export interface PanelStewardship {
  villageId: string;
  villageName: string;
  /** Rod správce (odkaz do pánů / vazalů panelu). */
  stewardHouseId: string;
}

/** Data panelu; web z nich složí `HouseView`. */
export interface HousePanelData {
  /** Hráč má živý rod (bez něj je panel prázdný). */
  hasHouse: boolean;
  /** Vlastní rod: id a muži od 16 let. */
  own: {
    houseId: string;
    men: PanelMan[];
    /** Senior rodu (stolec) a hráčův muž (praporec) – naposledy zapsaní, viz seniorate.md. */
    senior: PersonRef | null;
    lord: PersonRef | null;
    /** Nevyužitá nástupnictví bez losu (pečeť s počtem). */
    successionCredits: number;
    /** Nejhorší hlad ve vsích rodu (souhrn vsi), null = žádná aktivní ves. */
    hunger: HungerLevel | null;
    /** Štít: muži rodu schopní služby (viz `serviceMen`). */
    shield: number;
  } | null;
  /** Dohody hráčova rodu s pány a vazaly, i s podmínkami a neplněním. */
  agreements: PanelAgreement[];
  /** Strom vazalů pod hráčem do `VASSALAGE.panelTreeDepth` pater, po patrech. */
  tree: PanelTreeNode[];
  /** Ikony stavu přímých pánů a vazalů podle id rodu (hlad, štít). */
  status: Record<string, { hunger: HungerLevel | null; shield: number }>;
  lords: PublicHouse[];
  vassals: PublicHouse[];
  /** Cizí hráči podle vzdálenosti; pány a vazaly neopakují. */
  others: PublicHouse[];
  invites: PanelInvite[];
  freeInviteSlots: number;
  /** Otevřená jednání hráčova rodu, nejstarší první. */
  negotiations: PanelNegotiation[];
  /** Akce vůči rodům v `others` podle id rodu. */
  actions: Record<string, PanelPlayerActions>;
  /** Vsi hráčova rodu ve správě jiných rodů. */
  stewardships: PanelStewardship[];
}

export interface HousePanelDeps {
  houses: HouseRepository;
  settlements: SettlementRepository;
  worldDirectory: WorldDirectory;
  vassalages: VassalageRepository;
  invites: InviteRepository;
  negotiations: NegotiationRepository;
  successionCredits: SuccessionCreditRepository;
  activity: ActivityRepository;
  dialogs: DialogRepository;
  /** Správy cizích vsí a jména vsí k nim; bez nich panel správy nenese. */
  stewardships?: Pick<StewardshipRepository, 'listByHolderHouse'>;
  villages?: Pick<VillageRepository, 'find'>;
  now: () => Date;
}

const EMPTY: HousePanelData = {
  hasHouse: false,
  own: null,
  lords: [],
  vassals: [],
  others: [],
  agreements: [],
  tree: [],
  status: {},
  invites: [],
  freeInviteSlots: 0,
  negotiations: [],
  actions: {},
  stewardships: [],
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

const HUNGER_ORDER: readonly HungerLevel[] = ['fed', 'rationing', 'hungry', 'starving'];

/** Nejhorší hlad ve vsích rodu; rod bez aktivní vsi nemá žádný. */
function worstHunger(entry: DirectoryEntry | undefined): HungerLevel | null {
  let worst: HungerLevel | null = null;
  for (const d of entry?.digests ?? []) {
    if (d.digest.extinctDay !== undefined || d.digest.abandonedDay !== undefined) continue;
    const level = d.digest.hunger;
    if (worst === null || HUNGER_ORDER.indexOf(level) > HUNGER_ORDER.indexOf(worst)) worst = level;
  }
  return worst;
}

/**
 * Muži rodu schopní služby: veřejný rodokmen od 16 let (`PublicHouse.men`). Raněné a muže, kteří
 * už slouží ve válce, z počtu odečte F6 (válka) – rodokmen je zatím nezná.
 */
export const serviceMen = (house: PublicHouse): number => house.men.length;

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

  const open = await deps.negotiations.transaction((tx) => tx.openOf(own.id));

  // strom pod hráčem: struktura z hran sítě, podmínky z dohod pánů v něm
  const edges = await deps.vassalages.edgesNear(own.id, VASSALAGE.panelTreeDepth);
  const treeNodes = treeBelowDepths(edges, own.id, VASSALAGE.panelTreeDepth);
  const recordsOf = new Map<string, Awaited<ReturnType<VassalageRepository['activeOf']>>>();
  recordsOf.set(own.id, vassalages);
  const treeRecords = new Map<string, (typeof vassalages)[number]>();
  for (const node of treeNodes) {
    let list = recordsOf.get(node.parentHouseId);
    if (!list) {
      list = await deps.vassalages.activeOf(node.parentHouseId);
      recordsOf.set(node.parentHouseId, list);
    }
    const record = list.find(
      (v) => v.lordHouseId === node.parentHouseId && v.vassalHouseId === node.houseId,
    );
    if (record) treeRecords.set(node.houseId, record);
  }

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
      ...treeNodes.map((n) => n.houseId),
      ...open.map((n) => (n.initiatorHouseId === own.id ? n.recipientHouseId : n.initiatorHouseId)),
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

  const statusOf = (houseId: string): { hunger: HungerLevel | null; shield: number } => ({
    hunger: worstHunger(entries.find((e) => e.house.id === houseId)),
    shield: serviceMen(publicOf(houseId)),
  });
  const status: HousePanelData['status'] = {};
  // hlad vidí jen pán u svých vazalů (vassalage.md – Co hráč vidí); u pánů jen štít
  for (const id of lordIds) status[id] = { ...statusOf(id), hunger: null };
  for (const id of vassalIds) status[id] = statusOf(id);

  const levyYearsOf = new Map<string, number>();
  for (const v of vassalages) {
    const dialog = await deps.dialogs.openFor(v.id, 'levy');
    if (dialog) levyYearsOf.set(v.id, dialog.years);
  }
  const agreements = vassalages.map((v): PanelAgreement => {
    const mine = v.lordHouseId === own.id;
    return {
      vassalageId: v.id,
      lordHouseId: v.lordHouseId,
      vassalHouseId: v.vassalHouseId,
      otherHouseId: mine ? v.vassalHouseId : v.lordHouseId,
      other: mine ? 'vassal' : 'lord',
      terms: v.terms,
      breaches: v.breaches,
      sinceDay: v.sinceDay,
      levyYears: levyYearsOf.get(v.id) ?? null,
    };
  });

  const tree = treeNodes.flatMap((node): PanelTreeNode[] => {
    const record = treeRecords.get(node.houseId);
    if (!record) return [];
    return [
      {
        house: publicOf(node.houseId),
        depth: node.depth,
        parentHouseId: node.parentHouseId,
        vassalageId: record.id,
        terms: record.terms,
        breaches: record.breaches,
        ...statusOf(node.houseId),
      },
    ];
  });

  const negotiations = open.map((n): PanelNegotiation => {
    const otherId = n.initiatorHouseId === own.id ? n.recipientHouseId : n.initiatorHouseId;
    const last = n.rounds[n.rounds.length - 1];
    return {
      id: n.id,
      other: publicOf(otherId),
      myTurn: n.status === 'open' && respondingHouse({ ...n, status: 'open' }) === own.id,
      items: last?.items ?? [],
      message: last?.message ?? null,
      rounds: n.rounds.length,
    };
  });

  // důvody zašednutí tlačítek u cizích hráčů – pravidla `canOpen`, web je jen zobrazí
  const actions: Record<string, PanelPlayerActions> = {};
  await deps.negotiations.transaction(async (tx): Promise<void> => {
    const nearEdges = await tx.vassalages.edgesNear(own.id, 1);
    for (const other of nearby) {
      const base = {
        now,
        fromAlive: true,
        toAlive: true,
        blockedByTarget: await tx.blocks(other.houseId, own.id),
        negotiationOpen: (await tx.openBetween(own.id, other.houseId)) !== null,
        rejectedByTargetAt: await tx.lastReject(own.id, other.houseId),
        edges: nearEdges,
      };
      actions[other.houseId] = {
        offer: canOpen({
          ...base,
          from: own.id,
          to: other.houseId,
          oath: { lord: own.id, vassal: other.houseId },
        }),
        request: canOpen({
          ...base,
          from: own.id,
          to: other.houseId,
          oath: { lord: other.houseId, vassal: own.id },
        }),
        blockedByMe: await tx.blocks(own.id, other.houseId),
      };
    }
  });

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
    own: {
      houseId: own.id,
      men: ownView?.men ?? [],
      senior: own.senior,
      lord: own.lord,
      successionCredits: await deps.successionCredits.unused(input.playerId),
      ...statusOf(own.id),
    },
    agreements,
    tree,
    status,
    lords: lordIds.map(publicOf),
    vassals: vassalIds.map(publicOf),
    others: nearby,
    invites,
    freeInviteSlots: Math.max(0, INVITES.maxUnused - openCount),
    negotiations,
    actions,
    stewardships: await stewardshipsOf(deps, own.id),
  };
}

/** Vsi rodu, které právě spravuje jiný rod, se jmény vsí. */
async function stewardshipsOf(deps: HousePanelDeps, houseId: string): Promise<PanelStewardship[]> {
  if (!deps.stewardships || !deps.villages) return [];
  const out: PanelStewardship[] = [];
  for (const s of await deps.stewardships.listByHolderHouse(houseId)) {
    const village = await deps.villages.find(s.villageId);
    out.push({
      villageId: s.villageId,
      villageName: village?.name ?? '',
      stewardHouseId: s.stewardHouseId,
    });
  }
  return out;
}
