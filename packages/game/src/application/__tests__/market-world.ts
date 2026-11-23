import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import {
  departMarket,
  type ChronicleEvent,
  type Horse,
  type MarketOrder,
  type MarketTrip,
  type VillageState,
} from '../../domain/village';
import { horse, horsePen } from '../../domain/village/__tests__/horse-fixtures';
import { makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import {
  D,
  homeVillage,
  marketVillage,
} from '../../domain/village/trade/__tests__/market-fixtures';
import type { WorldStepDeps } from '../advance-world';
import { loadVillage } from '../load-village';
import type { LandscapeSource } from '../settlements';
import { InMemoryPlayerLock } from './in-memory-locks';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryTimeOffsets } from './in-memory-time-offsets';
import { InMemoryVillages } from './in-memory-villages';
import { InMemoryWorldQueue } from './in-memory-world-queue';

// Dva hráči na sousedních mapách pro poštu mezi vsemi (markets.md – Rozhodnutí plánu 2, bod 6):
// domovská ves výpravy Vlkov (H, hráč `hrac-h`, políčko 0,0) a hostitel Lhota (M, hráč `hrac-m`,
// políčko 1,0) z přípravků trhu jádra (`market-fixtures.ts`). Ves je napřed jednou načtená
// (převody starého stavu běží ke dni načtení – worker.md, Výjimky), ať je dopočet po kouscích
// stejný jako vcelku.

export const H_PLAYER = 'hrac-h';
export const M_PLAYER = 'hrac-m';
export const landscape = makeLandscape({ size: 48 });
const landscapes: LandscapeSource = { landscapeOf: () => landscape };

/** Hříbě (2 roky) ve vsi H s ohradou koní – na prodej (`horsesForSale`). */
export const FOAL_ID = 6;

/** Ohrada koní H: jezdecký kůň vojvody, dva koně a hříbě (horse-trade.test.ts). */
function withHorses(s: VillageState): VillageState {
  const herd: Horse[] = [
    { ...horse(1, 8, 'male', 80, D), riderId: 10 },
    horse(2, 5, 'male', 20, D),
    horse(3, 6, 'female', 0, D),
    horse(FOAL_ID, 2, 'male', 0, D),
  ];
  return { ...s, pens: [...(s.pens ?? []), { ...horsePen(90, herd, 2), builtDay: D - 400 }] };
}

export class MarketWorld {
  readonly settlements = new InMemorySettlements();
  readonly villages = new InMemoryVillages();
  readonly offsets = new InMemoryTimeOffsets();
  readonly locks = new InMemoryPlayerLock();
  readonly deps: WorldStepDeps = {
    settlements: this.settlements,
    villages: this.villages,
    landscapes,
    worldSeed: 4242,
    locks: this.locks,
    queue: new InMemoryWorldQueue(this.settlements, this.villages, this.offsets),
  };
  h = '';
  m = '';

  state(villageId: string): VillageState {
    return this.villages.records.get(villageId)!.state;
  }

  version(villageId: string): number {
    return this.villages.records.get(villageId)!.version;
  }

  load(villageId: string, today: number): Promise<unknown> {
    return loadVillage(this.deps, { villageId, today, landscape });
  }

  /**
   * Výprava z H na trh M v den D uložená jako po akci webu – odchozí schránka se nedoručí (pád
   * webu po uložení).
   */
  async depart(order: MarketOrder): Promise<MarketTrip> {
    const home = (await this.villages.find(this.h))!;
    const sent = departMarket(home.state, D, order, {
      villageId: this.m,
      name: 'Lhota',
      cells: 1,
      firstStep: 'E',
      homeVillageId: this.h,
      homeName: 'Vlkov',
    });
    if (!sent.ok) throw new Error(sent.reason);
    if (!(await this.villages.save(this.h, sent.state, home.version))) {
      throw new Error('Ves H se neuložila.');
    }
    return sent.trip;
  }
}

/** Svět H a M; `horses` – H má ohradu koní s hříbětem na prodej. */
export async function marketWorld(options: { horses?: true } = {}): Promise<MarketWorld> {
  const world = new MarketWorld();
  const place = (ownerId: string, x: number): Parameters<InMemorySettlements['createSeat']>[0] => ({
    ownerId,
    landscapeSeed: 11 + x,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: { x, y: 0 },
  });
  const h = (await world.settlements.createSeat(place(H_PLAYER, 0)))!;
  const m = (await world.settlements.createSeat(place(M_PLAYER, 1)))!;
  const home = options.horses ? withHorses(homeVillage()) : homeVillage();
  world.h = (await world.villages.add(h.id, 'Vlkov', home)).id;
  world.m = (await world.villages.add(m.id, 'Lhota', marketVillage())).id;
  await world.load(world.h, D);
  await world.load(world.m, D - 1);
  return world;
}

type MarketReturned = Extract<ChronicleEvent, { kind: 'market-returned' }>;

/** Zápisy kroniky `market-returned` vsi. */
export function returnedOf(state: VillageState): MarketReturned[] {
  return state.chronicle.filter((e): e is MarketReturned => e.kind === 'market-returned');
}

/** Krávy vsi. */
export function cowsOf(state: VillageState): number {
  return state.livestock?.herds.cow ?? 0;
}
