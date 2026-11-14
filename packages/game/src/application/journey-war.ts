import type { WorldClock } from '../domain/calendar';
import { sameCell, type GridCell } from '../domain/village/people/world-grid';
import { commandOf, INTENT_LEAD_TICKS, tickOfMs, upgradeJourney } from '../domain/war';
import type { House, HouseRepository } from './houses';
import type { JourneyRepository } from './journeys';
import type { SettlementRepository } from './settlements';
import type { WarRepository } from './wars';

// Výjezdy a válka (lord-control.md – Rozkazy: výjezd do země, kde je válka, nejde; Pořadí zavedení:
// začne-li válka, když tam stojí, jede domů – docs/design/lord-control.md). `houseAtWarOn` je
// dotaz, kterým se ptají výjezdy při vyslání, rozkazu a vjezdu skupiny na jinou mapu (worker);
// `recallJourneysAtWar` pošle domů výjezdy, které začátek války zastihne na mapě protivníka.

export interface JourneyWarDeps {
  houses: Pick<HouseRepository, 'activeOf'>;
  wars: Pick<WarRepository, 'activeBetween'>;
  settlements: Pick<SettlementRepository, 'holderAt'>;
}

/** Živý rod hráče, kterému patří mapa na políčku `cell` (držitel sídla); prázdné políčko null. */
async function houseOfCell(
  deps: Pick<JourneyWarDeps, 'houses' | 'settlements'>,
  cell: GridCell,
): Promise<House | null> {
  const holder = await deps.settlements.holderAt(cell);
  return holder === null ? null : deps.houses.activeOf(holder);
}

/** Válka mezi rodem hráče `playerId` a držitelem mapy na políčku `cell`; prázdné políčko a vlastní mapa ne. */
export async function houseAtWarOn(
  deps: JourneyWarDeps,
  playerId: string,
  cell: GridCell,
): Promise<boolean> {
  const own = await deps.houses.activeOf(playerId);
  if (!own) return false;
  const other = await houseOfCell(deps, cell);
  if (!other || other.id === own.id) return false;
  return (await deps.wars.activeBetween(own.id, other.id)) !== null;
}

export interface RecallJourneysDeps {
  houses: Pick<HouseRepository, 'byId' | 'activeOf'>;
  settlements: Pick<SettlementRepository, 'holderAt'>;
  journeys: Pick<JourneyRepository, 'activeOfPlayer' | 'checkpoint' | 'intentsAfter' | 'addIntent'>;
  world: WorldClock;
}

/**
 * Začátek války mezi rody `houses` (lord-control.md – Pořadí zavedení; plán 2026-11-13 – Úloha 4):
 * každá běžící výprava hráče jednoho rodu, jejíž hlouček stojí na mapě druhého rodu nebo tam míří, dostane
 * za hráče odvolání domů (`recall` těch políček) s taktem jako jeho rozkaz (teď +
 * `INTENT_LEAD_TICKS`). Kde hloučky mohou být: políčka a cíle hloučků v kontrolním bodu a políčka
 * rozkazů „Přes okraj“ (a „Jdi sem“ na jinou mapu) zapsaných po bodu – worker bod ukládá jen po 40
 * taktech, hlouček tak už mohl přejet. Vrací počet zapsaných záměrů.
 */
export async function recallJourneysAtWar(
  deps: RecallJourneysDeps,
  input: { houses: readonly [string, string]; nowMs: number },
): Promise<number> {
  const [a, b] = await Promise.all(input.houses.map((id) => deps.houses.byId(id)));
  let recalled = 0;
  for (const [own, other] of [
    [a, b],
    [b, a],
  ] as const) {
    if (!own?.playerId || !other) continue;
    for (const journeyId of await deps.journeys.activeOfPlayer(own.playerId)) {
      const point = await deps.journeys.checkpoint(journeyId);
      if (!point) continue;
      const state = upgradeJourney(point.state);
      const aims = (await deps.journeys.intentsAfter(journeyId, state.tick)).flatMap((i) => {
        const command = commandOf(i.body);
        if (i.byPlayer !== own.playerId || command.kind !== 'order') return [];
        const order = command.order;
        if (order.kind === 'cross') return [order.cell];
        return order.kind === 'go' && order.cell ? [order.cell] : [];
      });
      const cells = [
        ...state.groups.flatMap((g) => [g.cell, ...(g.goal ? [g.goal.cell] : [])]),
        ...aims,
      ];
      const there: GridCell[] = [];
      for (const cell of cells) {
        if (there.some((c) => sameCell(c, cell))) continue;
        if ((await houseOfCell(deps, cell))?.id === other.id) there.push({ x: cell.x, y: cell.y });
      }
      if (there.length === 0) continue;
      const queued = await deps.journeys.addIntent(journeyId, {
        tick: tickOfMs(input.nowMs, deps.world) + INTENT_LEAD_TICKS,
        byPlayer: own.playerId,
        body: { kind: 'recall', cells: there },
      });
      if (queued) recalled++;
    }
  }
  return recalled;
}
