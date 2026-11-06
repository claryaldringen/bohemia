import { addMacro, noMacroGoods, type MacroGoods } from '../domain/vassalage/macro';
import type { MacroSpare } from '../domain/vassalage/macro';
import type { HouseVillage } from '../domain/vassalage/transport';
import { houseSpare } from '../domain/vassalage/transport';
import type { HouseRepository } from './houses';
import type { SettlementRepository } from './settlements';
import type { VassalageRepository } from './vassalages';
import type { VillageRepository } from './villages';
import type { WorldDirectory } from './world-directory';

// Výhled „kolik můžu postrádat“ pro formulář podmínek (vassalage.md – Výhled): počítá se jen na
// vyžádání (načítá stavy všech vsí rodu), ne v každém pohledu na panel.

export interface HouseSpareDeps {
  houses: Pick<HouseRepository, 'activeOf' | 'byId'>;
  settlements: Pick<SettlementRepository, 'listActive'>;
  villages: Pick<VillageRepository, 'listBySettlement' | 'find'>;
  worldDirectory: Pick<WorldDirectory, 'entriesOf'>;
  vassalages: Pick<VassalageRepository, 'activeOf'>;
}

export type HouseSpareResult = { ok: true; spare: MacroSpare } | { ok: false; reason: string };

const NO_HOUSE = 'Nemáš živý rod.';
const NO_TARGET = 'Cíl dávky nenalezen.';

/**
 * Výhled hráčova rodu pro dávku rodu `toHouseId` (pána): součet přebytků vsí rodu omezený dopravou
 * do cílové vsi pána (`targetVillageId`, jinak jeho sídelní ves), bez toho, co rod už odvádí jiným
 * pánům. Dohodu s `toHouseId` samotným do závazků nepatří – právě se sjednává.
 */
export async function houseSpareOutlook(
  deps: HouseSpareDeps,
  input: { playerId: string; toHouseId: string; targetVillageId?: string },
): Promise<HouseSpareResult> {
  const own = await deps.houses.activeOf(input.playerId);
  if (!own) return { ok: false, reason: NO_HOUSE };
  const lord = await deps.houses.byId(input.toHouseId);
  const [entry] = await deps.worldDirectory.entriesOf([input.toHouseId]);
  if (!lord || !entry) return { ok: false, reason: NO_TARGET };

  // cílové políčko: mapa cílové vsi, jinak sídelní sídlo pána
  let cell = { x: entry.seat.x, y: entry.seat.y };
  if (input.targetVillageId !== undefined && lord.playerId !== null) {
    const village = await deps.villages.find(input.targetVillageId);
    const settlement = (await deps.settlements.listActive(lord.playerId)).find(
      (s) => s.id === village?.settlementId,
    );
    if (!settlement?.worldCell) return { ok: false, reason: NO_TARGET };
    cell = { x: settlement.worldCell.x, y: settlement.worldCell.y };
  }

  const villages: HouseVillage[] = [];
  for (const settlement of await deps.settlements.listActive(input.playerId)) {
    if (!settlement.worldCell) continue;
    for (const village of await deps.villages.listBySettlement(settlement.id)) {
      villages.push({
        state: village.state,
        cell: { x: settlement.worldCell.x, y: settlement.worldCell.y },
      });
    }
  }

  // závazky k jiným pánům: jejich roční dávky
  let goods: MacroGoods = noMacroGoods();
  const people = { families: 0, men: 0, women: 0 };
  let laborDays = 0;
  for (const v of await deps.vassalages.activeOf(own.id)) {
    if (v.vassalHouseId !== own.id || v.lordHouseId === input.toHouseId) continue;
    const tribute = v.terms.tribute;
    if (!tribute) continue;
    goods = addMacro(goods, tribute);
    people.families += tribute.people.families;
    people.men += tribute.people.men;
    people.women += tribute.people.women;
    laborDays += tribute.laborDays;
  }
  return { ok: true, spare: houseSpare(villages, cell, { ...goods, people, laborDays }) };
}
