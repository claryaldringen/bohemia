// Dvorec vojvody v pohledu na ves (docs/design/trade.md – Dvorec vojvody): které obydlí je
// dvorcem a vylepšení vsi, která odtud jdou – zemské stezky do 8 směrů a obchod se sousedy po
// hotových stezkách (co soused nabízí a shání, za kolik, kolik ještě letos, výprava na cestě)
// i výměna lidí (trade.md – Výměna lidí: rodiny a svobodní dospělí). Čistý modul – data ze stavu
// vsi.
import {
  NO_PEOPLE,
  PEOPLE_TRADE,
  adultBuyPrice,
  buyPrice,
  emigrantGroups,
  expeditionTo,
  familyBuyPrice,
  neighbourOf,
  neighbourStock,
  obstaclesOf,
  sellPrice,
  sellValue,
  tradeCarts,
  trailCartPassable,
  trailOptions,
  trailTripDays,
  villageGoodStock,
  villageManor,
  villageRoadWalk,
  villageTrails,
  type CartKind,
  type Direction8,
  type Landscape,
  type TradeGood,
  type TradeExpedition,
  type TradeGoods,
  type TradePeople,
  type TrailOption,
  type VillageState,
} from '@bohemia/game';

/**
 * Výprava na cestě – co nesou, co přinesou, kdo s ní odešel a kdo přijde (rodiny, svobodní muži
 * a ženy – trade.md, Výměna lidí), průběh cesty 0–1 a jak dnes postoupila (trade.md – Doprava:
 * lidé na výpravě mají vlastní podíl práce po denním minimu – zdrží se jen ves bez dost dospělých).
 */
export interface VillageExpedition {
  give: TradeGoods;
  get: TradeGoods;
  givePeople: TradePeople;
  getPeople: TradePeople;
  porters: number;
  /** Vozy s výpravou (wagons.md – Obchod). */
  carts: number;
  days: number;
  progress: number;
  /**
   * Za kolik dní se vrátí dnešním tempem (null = dnes nepostoupila – ves neměla nikoho, kdo by
   * šel); výprava vyslaná dnes počítá s plným tempem.
   */
  daysLeft: number | null;
  /**
   * Tempo dne: `full` – šli všichni (lidé na výpravě mají vlastní podíl práce – trade.md,
   * Doprava), `slow` – ves po denním minimu neměla dost dospělých (výprava se zdrží), `waiting` –
   * neměla nikoho, výprava stojí, `starting` – vyslaná dnes, vyrazí zítra.
   */
  pace: 'full' | 'slow' | 'waiting' | 'starting';
  /** Kolik člověkodní dnes dostala (podíl `trade` v rozdělení práce), u nové null. */
  today: number | null;
}

/**
 * Výměna lidí se sousedem (trade.md – Výměna lidí): koho soused letos dá (rodiny – lidí a cena
 * v kg obilí každé v pořadí, svobodní dospělí a cena za jednoho), kolik rodin a dospělých vezme
 * a koho by ves dala – rodiny v pořadí výběru jádra (`emigrantGroups` – prvních n je vždy
 * stejných) s tím, kolik za každou soused připíše, a kolik svobodných dospělých (počítáno po
 * odchodu všech nabízených rodin, takže posuvník nikdy nepustí víc, než server vezme).
 */
export interface VillageNeighbourPeople {
  offers: {
    families: { people: number; price: number }[];
    men: number;
    women: number;
    adultPrice: number;
  };
  takes: TradePeople;
  have: {
    families: { people: number; credit: number }[];
    men: number;
    women: number;
    adultCredit: number;
  };
}

/** Soused po hotové stezce pro panel obchodu. */
export interface VillageNeighbour {
  direction: Direction8;
  name: string;
  /** Délka stezky (m) a dny cesty nosičů tam a zpět i za krajem mapy. */
  lengthM: number;
  tripDays: number;
  /** Co soused nabízí – za kolik kg obilí kus (`price`) a kolik letos ještě má (`left`). */
  offers: { good: TradeGood; price: number; left: number }[];
  /**
   * Co soused shání – kolik kg obilí za kus dá (`price`), kolik letos ještě vezme (`left`) a kolik
   * toho ves má (`have`).
   */
  demands: { good: TradeGood; price: number; left: number; have: number }[];
  /** Lidé ve výměně (trade.md – Výměna lidí). */
  people: VillageNeighbourPeople;
  /** Výprava k sousedovi na cestě; jinak null (jedna na souseda naráz). */
  expedition: VillageExpedition | null;
  /**
   * Vozy, které by s výpravou mohly jet (wagons.md – Obchod: doma a se spřežením, čtyřkoláky
   * napřed) – náhled nosičů je počítá jako server (`expeditionTransport`).
   */
  carts: CartKind[];
}

/** Dvorec vojvody pro panel výběru. */
export interface VillageManor {
  /** Obydlí (id domácnosti), které je dvorcem. */
  dwellingId: number;
  /** Zemské stezky do 8 směrů – hotové, rozestavěné a nabídka nových (cena, délka, důvod). */
  trails: TrailOption[];
  /** Sousedé po hotových stezkách (v pořadí směrů). */
  neighbours: VillageNeighbour[];
}

/**
 * Sousedé po hotových stezkách v den `day`; vozy jen po stezce sjízdné pro vozy (`landscape` –
 * wagons.md, Obchod; bez krajiny vždy).
 */
export function neighbourViews(
  state: VillageState,
  day: number,
  landscape: Landscape | null = null,
): VillageNeighbour[] {
  const carts = tradeCarts(state, day).map((c) => c.kind);
  return villageTrails(state)
    .filter((t) => t.builtDay !== null)
    .map((trail): VillageNeighbour => {
      const neighbour = neighbourOf(state.seed, trail.direction);
      const stock = neighbourStock(state, trail.direction, day);
      const expedition = expeditionTo(state, trail.direction);
      const people = stock.people ?? { families: [], men: 0, women: 0, takes: { ...NO_PEOPLE } };
      const families = emigrantGroups(state, day, {
        families: people.takes.families,
        men: 0,
        women: 0,
      }).families;
      // muži a ženy po odchodu všech rodin, které soused vezme – posuvník nepustí víc, než server
      const singles = emigrantGroups(state, day, {
        families: families.length,
        men: people.takes.men,
        women: people.takes.women,
      });
      return {
        direction: trail.direction,
        name: neighbour.name,
        lengthM: Math.round(trail.lengthM),
        tripDays: trailTripDays(trail.lengthM),
        carts: trailCartPassable(state, trail, landscape) ? carts : [],
        offers: neighbour.offers.map((good) => ({
          good,
          price: Math.round(buyPrice(good) * 100) / 100,
          left: Math.max(0, stock.supply[good] ?? 0),
        })),
        demands: neighbour.demands.map((good) => ({
          good,
          price: Math.round(sellPrice(good) * 100) / 100,
          left: Math.max(0, stock.demand[good] ?? 0),
          have: villageGoodStock(state, good),
        })),
        people: {
          offers: {
            families: people.families.map((children) => ({
              people: 2 + children,
              price: round2(familyBuyPrice(children)),
            })),
            men: people.men,
            women: people.women,
            adultPrice: round2(adultBuyPrice()),
          },
          takes: { ...people.takes },
          have: {
            families: families.map((f) => ({
              people: f.people.length,
              credit: round2(sellValue(f.valueKg)),
            })),
            men: singles.men.length,
            women: singles.women.length,
            adultCredit: round2(sellValue(PEOPLE_TRADE.adultValueKg)),
          },
        },
        expedition: expedition ? expeditionView(state, expedition) : null,
      };
    });
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Lidé výpravy uložení dřív s `adults` (bez pohlaví) – v panelu polovina muži, zbytek ženy. */
function peopleOf(people: {
  families: number;
  men?: number;
  women?: number;
  adults?: number;
}): TradePeople {
  const adults = people.adults ?? 0;
  return {
    families: people.families,
    men: (people.men ?? 0) + Math.ceil(adults / 2),
    women: (people.women ?? 0) + Math.floor(adults / 2),
  };
}

/**
 * Kolik člověkodní výprava dostala posledního dne (podíl `trade` u její stezky v rozdělení práce
 * dne); výprava vyslaná až po dni (dnes) nebo bez rozdělení práce null.
 */
export function expeditionToday(state: VillageState, e: TradeExpedition): number | null {
  const labor = state.labor;
  if (!labor || labor.day !== state.lastDay || e.startedDay >= labor.day) return null;
  return labor.shares
    .filter((s) => s.activity === 'trade' && s.target.kind === 'trail' && s.target.id === e.trailId)
    .reduce((sum, s) => sum + s.manDays, 0);
}

/**
 * Výprava pro panel: náklad a lidé tam i zpět, průběh a tempo posledního dne – kolik člověkodní
 * jí dnes dala společná práce vsi (podíl `trade` u její stezky v rozdělení práce). Bez volných
 * rukou stojí (`waiting`), s menší prací se zdrží (`slow`).
 */
export function expeditionView(state: VillageState, e: TradeExpedition): VillageExpedition {
  const remaining = Math.max(0, e.cost - e.done);
  const today = expeditionToday(state, e);
  const EPS = 1e-6;
  const pace: VillageExpedition['pace'] =
    today === null
      ? 'starting'
      : today <= EPS
        ? 'waiting'
        : today + EPS < Math.min(e.porters, remaining + today)
          ? 'slow'
          : 'full';
  const daysLeft =
    remaining <= EPS
      ? 0
      : today === null
        ? Math.ceil(remaining / Math.max(1, e.porters) - EPS)
        : today > EPS
          ? Math.ceil(remaining / today - EPS)
          : null;
  return {
    give: { ...e.give },
    get: { ...e.get },
    givePeople: peopleOf(e.givePeople ?? { families: 0 }),
    getPeople: peopleOf({ ...e.getPeople, families: e.getPeople?.families.length ?? 0 }),
    porters: e.porters,
    carts: e.carts?.length ?? 0,
    days: e.days,
    progress: e.cost > 0 ? Math.min(1, e.done / e.cost) : 1,
    daysLeft,
    pace,
    today: today === null ? null : round2(today),
  };
}

/** Dvorec vsi pro pohled na ves; dokud stojí jen staveniště první zemnice, null. */
export function manorView(
  state: VillageState,
  landscape: Landscape,
  day: number,
  ownMaps: Partial<Record<Direction8, string>> = {},
): VillageManor | null {
  const manor = villageManor(state);
  if (!manor || state.extinctDay !== undefined) return null;
  const obstacles = obstaclesOf(landscape);
  return {
    dwellingId: manor.id,
    trails: trailOptions(state, day, landscape, obstacles, villageRoadWalk(state, landscape)),
    // tím směrem, kde leží vlastní ves, soused bez simulace není (migration.md)
    neighbours: neighbourViews(state, day, landscape).filter(
      (n) => ownMaps[n.direction] === undefined,
    ),
  };
}
