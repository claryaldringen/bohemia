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
  type TradeGoods,
  type TradePeople,
  type TrailOption,
  type VillageState,
} from '@bohemia/game';

/**
 * Výprava na cestě – co nesou, co přinesou, kdo s ní odešel a kdo přijde (rodiny a svobodní
 * dospělí – trade.md, Výměna lidí) a průběh cesty 0–1.
 */
export interface VillageExpedition {
  give: TradeGoods;
  get: TradeGoods;
  givePeople: TradePeople;
  getPeople: TradePeople;
  porters: number;
  days: number;
  progress: number;
}

/**
 * Výměna lidí se sousedem (trade.md – Výměna lidí): koho soused letos dá (rodiny – lidí a cena
 * v kg obilí každé v pořadí, svobodní dospělí a cena za jednoho), kolik rodin a dospělých vezme
 * a koho by ves dala – rodiny v pořadí výběru jádra (`emigrantGroups` – prvních n je vždy
 * stejných) s tím, kolik za každou soused připíše, a kolik svobodných dospělých (počítáno po
 * odchodu všech nabízených rodin, takže posuvník nikdy nepustí víc, než server vezme).
 */
export interface VillageNeighbourPeople {
  offers: { families: { people: number; price: number }[]; adults: number; adultPrice: number };
  takes: TradePeople;
  have: { families: { people: number; credit: number }[]; adults: number; adultCredit: number };
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
  const carts = tradeCarts(state).map((c) => c.kind);
  return villageTrails(state)
    .filter((t) => t.builtDay !== null)
    .map((trail): VillageNeighbour => {
      const neighbour = neighbourOf(state.seed, trail.direction);
      const stock = neighbourStock(state, trail.direction, day);
      const expedition = expeditionTo(state, trail.direction);
      const people = stock.people ?? { families: [], adults: 0, takes: { ...NO_PEOPLE } };
      const families = emigrantGroups(state, day, {
        families: people.takes.families,
        adults: 0,
      }).families;
      const adults = emigrantGroups(state, day, {
        families: families.length,
        adults: people.takes.adults,
      }).adults;
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
            adults: people.adults,
            adultPrice: round2(adultBuyPrice()),
          },
          takes: { ...people.takes },
          have: {
            families: families.map((f) => ({
              people: f.people.length,
              credit: round2(sellValue(f.valueKg)),
            })),
            adults: adults.length,
            adultCredit: round2(sellValue(PEOPLE_TRADE.adultValueKg)),
          },
        },
        expedition: expedition
          ? {
              give: { ...expedition.give },
              get: { ...expedition.get },
              givePeople: {
                families: expedition.givePeople?.families ?? 0,
                adults: expedition.givePeople?.adults ?? 0,
              },
              getPeople: {
                families: expedition.getPeople?.families.length ?? 0,
                adults: expedition.getPeople?.adults ?? 0,
              },
              porters: expedition.porters,
              days: expedition.days,
              progress: expedition.cost > 0 ? Math.min(1, expedition.done / expedition.cost) : 1,
            }
          : null,
      };
    });
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
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
