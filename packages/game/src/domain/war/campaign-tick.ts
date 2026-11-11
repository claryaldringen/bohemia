import type { NewVillageEvent, VillageEventBody } from '../village/core/inbox';
import type { GridCell } from '../village/people/world-grid';
import type { BattleFort } from './battle';
import type { CampaignNotice, CampaignState, CampaignWorld } from './campaign-types';
import { marchGrid, type MarchGrid, type Pos } from './march-grid';
import type { Lookout } from './lookouts';

// Společné součástky taktu tažení (plán 2026-11-09 – Rozhodnutí plánu: přesun z `campaign.ts`, ať je
// sdílí varování – `alarm.ts` – bez kruhového importu). Chování beze změny.

/** Data, bez kterých takt nejde spočítat – takt se zahodí a volající je načte. */
export class MissingData {
  constructor(
    readonly cells: GridCell[],
    readonly villageIds: string[],
  ) {}
}

/** Výstup jednoho taktu – do výsledku se přidá, jen když takt doběhne. */
export interface TickOut {
  events: NewVillageEvent[];
  notices: CampaignNotice[];
}

/** Mřížky pochodu jednoho volání (políčko a den; napříč voláními `world.grids`). */
export interface TickContext {
  world: CampaignWorld;
  grids: Map<string, MarchGrid>;
  /** Opevnění vsi pro bojiště (ves a den). */
  forts: Map<string, BattleFort[]>;
  /** Dříví vsi na otepi (`fuelOf`) podle klíče vsi a dne jako `forts`. */
  fuel: Map<string, Pos[]>;
  /** Oči vsi (`villageLookouts`) podle klíče vsi a dne (`ves@den`). */
  lookouts: Map<string, Lookout[]>;
  /** Takty doběhu od oka do středu vsi (`runTicks`) podle klíče `ves@den:oko`. */
  runs: Map<string, number>;
}

/** Prázdný kontext jednoho volání `stepCampaign`. */
export function tickContext(world: CampaignWorld): TickContext {
  return {
    world,
    grids: new Map(),
    forts: new Map(),
    fuel: new Map(),
    lookouts: new Map(),
    runs: new Map(),
  };
}

export const cellKey = (c: GridCell): string => `${c.x},${c.y}`;
export const sameCell = (a: GridCell, b: GridCell): boolean => a.x === b.x && a.y === b.y;

/** Událost do schránky vsi – `ref` je jedinečný: takt a pořadí v něm. */
export function villageEvent(
  s: CampaignState,
  out: TickOut,
  villageId: string,
  day: number,
  body: VillageEventBody,
): void {
  out.events.push({ villageId, day, ref: `camp:${s.id}:${s.tick}:${out.events.length}`, body });
}

/** Mřížka pochodu mapy políčka v den `day` – krajina, překážky a první ves na mapě. */
export function gridOf(cell: GridCell, day: number, ctx: TickContext): MarchGrid {
  const key = `${cellKey(cell)}@${day}`;
  const cached = ctx.grids.get(key);
  if (cached) return cached;
  const map = ctx.world.landscapeOf(cell);
  if (map === null) throw new MissingData([{ ...cell }], []);
  const villageId = map.villageIds[0];
  let village = null;
  if (villageId !== undefined) {
    village = ctx.world.villageAt(villageId, day);
    if (village === null) throw new MissingData([], [villageId]);
  }
  const grid = ctx.world.grids
    ? ctx.world.grids.gridOf(map.landscape, map.obstacles, village, day)
    : marchGrid(map.landscape, map.obstacles, village, { day });
  ctx.grids.set(key, grid);
  return grid;
}
