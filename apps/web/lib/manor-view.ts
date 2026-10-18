// Dvorec vojvody v pohledu na ves (docs/design/trade.md – Dvorec vojvody): které obydlí je
// dvorcem a vylepšení vsi, která odtud jdou – zemské stezky do 8 směrů a obchod se sousedy po
// hotových stezkách (co soused nabízí a shání, za kolik, kolik ještě letos, výprava na cestě).
// Čistý modul – data ze stavu vsi.
import {
  buyPrice,
  expeditionTo,
  neighbourOf,
  neighbourStock,
  obstaclesOf,
  sellPrice,
  trailOptions,
  trailTripDays,
  villageGoodStock,
  villageManor,
  villageRoadWalk,
  villageTrails,
  type Direction8,
  type Landscape,
  type TradeGood,
  type TradeGoods,
  type TrailOption,
  type VillageState,
} from '@bohemia/game';

/** Výprava na cestě – co nesou, co přinesou a průběh cesty 0–1. */
export interface VillageExpedition {
  give: TradeGoods;
  get: TradeGoods;
  porters: number;
  days: number;
  progress: number;
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
  /** Výprava k sousedovi na cestě; jinak null (jedna na souseda naráz). */
  expedition: VillageExpedition | null;
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

/** Sousedé po hotových stezkách v den `day`. */
export function neighbourViews(state: VillageState, day: number): VillageNeighbour[] {
  return villageTrails(state)
    .filter((t) => t.builtDay !== null)
    .map((trail): VillageNeighbour => {
      const neighbour = neighbourOf(state.seed, trail.direction);
      const stock = neighbourStock(state, trail.direction, day);
      const expedition = expeditionTo(state, trail.direction);
      return {
        direction: trail.direction,
        name: neighbour.name,
        lengthM: Math.round(trail.lengthM),
        tripDays: trailTripDays(trail.lengthM),
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
        expedition: expedition
          ? {
              give: { ...expedition.give },
              get: { ...expedition.get },
              porters: expedition.porters,
              days: expedition.days,
              progress: expedition.cost > 0 ? Math.min(1, expedition.done / expedition.cost) : 1,
            }
          : null,
      };
    });
}

/** Dvorec vsi pro pohled na ves; dokud stojí jen staveniště první zemnice, null. */
export function manorView(
  state: VillageState,
  landscape: Landscape,
  day: number,
): VillageManor | null {
  const manor = villageManor(state);
  if (!manor || state.extinctDay !== undefined) return null;
  const obstacles = obstaclesOf(landscape);
  return {
    dwellingId: manor.id,
    trails: trailOptions(state, day, landscape, obstacles, villageRoadWalk(state, landscape)),
    neighbours: neighbourViews(state, day),
  };
}
