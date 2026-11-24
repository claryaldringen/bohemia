import { domainFoodReadyYear, villageFoodBalance } from '../../vassalage/domain-food';
import { isVillageTravelling } from '../people/departure';
import { lineMen } from '../people/dynasty';
import { kinSingles } from '../people/kin-match';
import { lineFacts, type LineFacts } from './extinction';
import { isStewardOn } from '../steward/steward-state';
import { hungerLevel, type HungerLevel } from './summary';
import { threshingStatus } from '../fields/threshing';
import { trailExitsOf, type TrailExit } from '../trade/trail-exits';
import type { ChronicleEvent } from '../types/types-chronicle';
import type { DisasterState, FloodRecord } from '../types/types-disasters';
import type { NearbySingle } from '../types/types-market';
import type { VillageState } from '../types/types-state';

// Souhrn vsi (plán workeru – Mimo plán: souhrn vsi pro přepínač): co pohled a akce potřebují
// o ostatních vsích hráče (přepínač vsí, konec hry) bez celého stavu – u velké vsi přes 2 MB JSON.
// Odvozuje se ze stavu při každém uložení (zdroj pravdy je dál stav), takže pohled ze souhrnu je
// týž jako ze stavu. Den pohledu (dnešek) smí být po dni vsi – co na dni závisí (počasí roku),
// nese souhrn jako vstup pravidla (`weatherSeed`, `disasters`), ne jako výsledek.

/** Verze tvaru souhrnu – souhrn jiné verze se nepoužije (ves se načte celá a souhrn se obnoví). */
export const VILLAGE_DIGEST_VERSION = 4;

/** Místní pohromy v kronice – poslední z nich ukáže přepínač vsí (disasters.md – Co hráč vidí). */
export const LOCAL_DISASTER_KINDS: ReadonlySet<ChronicleEvent['kind']> = new Set([
  'hail',
  'flood',
  'fire',
  'tornado',
]);

/** Část pohrom, kterou čte počasí roku (`weatherView` – `weatherOf`, `sceneFlood`). */
export interface WeatherDisasters {
  flood?: FloodRecord;
  override?: { weather?: NonNullable<DisasterState['override']>['weather'] };
}

/** Pohromy pro počasí roku ze stavu; nic z nich – undefined. */
function weatherDisasters(disasters: DisasterState | undefined): WeatherDisasters | undefined {
  const flood = disasters?.flood;
  const weather = disasters?.override?.weather;
  if (!flood && !weather) return undefined;
  return { ...(flood ? { flood } : {}), ...(weather ? { override: { weather } } : {}) };
}

/**
 * Muž rodu, jak ho smí vidět cizí hráč (vassalage.md – Přehled pána: rodokmeny šlechty jsou
 * veřejné) – jen číslo osoby ve vsi (pro hlavu rodu), jméno a den narození, nic víc.
 */
export interface PublicLineMan {
  id: number;
  name?: string;
  bornDay: number;
}

/** Souhrn vsi – odvozený ze stavu (`villageDigest`). */
export interface VillageDigest extends LineFacts {
  /** `VILLAGE_DIGEST_VERSION` v době uložení. */
  v: number;
  /** Den, do kterého je ves dopočtená (`state.lastDay`). */
  lastDay: number;
  /** Lidé ve vsi (`state.people.length` – i opuštěná ves je drží jako záznam). */
  people: number;
  /** Lidé jsou na cestě (`isVillageTravelling`). */
  travelling: boolean;
  /** Stupeň hladu (`hungerLevel`). */
  hunger: HungerLevel;
  /** Ves mlátí nouzově bez humna (`threshingStatus().emergency` – na dni nezávisí). */
  threshingEmergency: boolean;
  /** Správce je zapnutý (`isStewardOn`). */
  steward: boolean;
  /** Ves čeká na vojvodu a nikdo k ní zatím nejde (`awaitingLord` bez `appointee`) – povýšení ji smí obsadit. */
  awaitingLord: boolean;
  /**
   * Rok, jestli je ves po výmlatu letošní sklizně a smí dát jídlo domény (`domainFoodReadyYear`
   * ve dni vsi); jinak null. Od verze 4 (8. 11. 2026, hradiště).
   */
  domainReadyYear: number | null;
  /** Kolik ves vypěstuje a potřebuje obilí z pole (`villageFoodBalance`); bez lidí nebo pole null. */
  food: { growsKg: number; needsKg: number } | null;
  /** Vstupy počasí roku (`weatherView` v den pohledu): seed počasí kraje… */
  weatherSeed?: number;
  /**
   * …a z pohrom jen to, co počasí roku čte – poslední povodeň a vynucené počasí (testy, dev).
   * Ochrana dílů (u velké vsi přes 100 kB) do souhrnu nepatří.
   */
  disasters?: WeatherDisasters;
  /** Žijící muži rodu po meči s jménem a dnem narození (adresář rodů, `housesNear`). */
  publicLineMen: PublicLineMan[];
  /**
   * Hlava NPC rodu povýšeného ve vsi (`VillageState.nobles`) – jen jméno, aby panel rodu ukázal
   * NPC vazala jako hráčské rody (vassalage.md – Povýšení vesničana).
   */
  nobleHead?: { houseId: string; name?: string };
  /** Poslední místní pohroma v kronice (`LOCAL_DISASTER_KINDS`). */
  lastLocalDisaster?: ChronicleEvent;
  /**
   * Výstupy hotových zemských stezek na kraj mapy (`trailExitsOf` – trade.md, Pokračování na
   * sousední mapě): sousední mapa z nich odvodí pokračování stezky bez načtení stavu vsi. Chybí =
   * souhrn uložený dřív (16. 11. 2026) – sousední mapa ves načte celou; verze tvaru se nemění.
   */
  trailExits?: TrailExit[];
  /**
   * Svobodní, kteří by šli za partnerem odjinud (`kinSingles` ve dni vsi – markets.md, Rozhodnutí
   * plánu 3, body 1 a 11): okolí sousedních vsí je čte bez načtení stavu (`nearbyVillages`).
   * Chybí = nikdo, nebo souhrn uložený dřív (24. 11. 2026); verze tvaru se nemění.
   */
  singles?: NearbySingle[];
}

/** Poslední místní pohroma v kronice; žádná – undefined. */
export function lastLocalDisaster(
  chronicle: readonly ChronicleEvent[],
): ChronicleEvent | undefined {
  for (let i = chronicle.length - 1; i >= 0; i--) {
    const event = chronicle[i];
    if (event && LOCAL_DISASTER_KINDS.has(event.kind)) return event;
  }
  return undefined;
}

/** Hlava NPC rodu ze stavu; bez povýšení nebo bez osoby – nic. */
function nobleHeadOf(
  state: VillageState,
): { nobleHead: { houseId: string; name?: string } } | null {
  const nobles = state.nobles;
  if (nobles === undefined) return null;
  const head = state.people.find((p) => p.id === nobles.headId);
  if (head === undefined) return null;
  return {
    nobleHead: {
      houseId: nobles.houseId,
      ...(head.name !== undefined ? { name: head.name } : {}),
    },
  };
}

/** Souhrn vsi ze stavu – jen čte stav. */
export function villageDigest(state: VillageState): VillageDigest {
  const last = lastLocalDisaster(state.chronicle);
  const disasters = weatherDisasters(state.disasters);
  return {
    v: VILLAGE_DIGEST_VERSION,
    lastDay: state.lastDay,
    people: state.people.length,
    travelling: isVillageTravelling(state),
    hunger: hungerLevel(state),
    threshingEmergency: threshingStatus(state, state.lastDay).emergency,
    steward: isStewardOn(state),
    awaitingLord: state.awaitingLord !== undefined && state.awaitingLord.appointee === undefined,
    domainReadyYear: domainFoodReadyYear(state, state.lastDay),
    food: villageFoodBalance(state, state.lastDay),
    ...lineFacts(state),
    publicLineMen: lineMen(state)
      .filter((p) => !p.noble)
      .map((p) => ({
        id: p.id,
        ...(p.name !== undefined ? { name: p.name } : {}),
        bornDay: p.bornDay,
      })),
    ...nobleHeadOf(state),
    ...(state.weatherSeed !== undefined ? { weatherSeed: state.weatherSeed } : {}),
    ...(disasters ? { disasters } : {}),
    ...(last ? { lastLocalDisaster: last } : {}),
    trailExits: trailExitsOf(state),
    ...singlesOf(state),
  };
}

/** Svobodní pro okolí ze stavu ve dni vsi; nikdo – nic. */
function singlesOf(state: VillageState): { singles: NearbySingle[] } | null {
  const singles = kinSingles(state, state.lastDay);
  return singles.length > 0 ? { singles } : null;
}

/** Souhrn je použitelný – nese současnou verzi tvaru. */
export function isCurrentDigest(digest: unknown): digest is VillageDigest {
  return (
    typeof digest === 'object' &&
    digest !== null &&
    (digest as { v?: unknown }).v === VILLAGE_DIGEST_VERSION
  );
}
