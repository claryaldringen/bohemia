import type { WorldClock } from '../domain/calendar';
import type { GridCell } from '../domain/village/people/world-grid';
import { INTENT_LEAD_TICKS, tickOfMs } from '../domain/war';
import type { House, HouseRepository } from './houses';
import type { JourneyRepository } from './journeys';
import type { SettlementRepository } from './settlements';
import type { WarRepository } from './wars';

// Výjezdy a válka (lord-control.md – Rozkazy: výjezd do země, kde je válka, nejde; Pořadí zavedení:
// začne-li válka, když tam stojí, jede domů; plán 2026-11-13 – rozhodnutí 1). `houseAtWarOn` je
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
  journeys: Pick<JourneyRepository, 'activeOf' | 'checkpoint' | 'intentsAfter' | 'addIntent'>;
  world: WorldClock;
}

/**
 * Začátek války mezi rody `houses` (lord-control.md – Pořadí zavedení; plán 2026-11-13 – Úloha 4):
 * běžící výjezd hráče jednoho rodu, jehož skupina stojí na mapě druhého rodu nebo tam míří, dostane
 * za hráče rozkaz „Domů“ s taktem jako jeho rozkaz (teď + `INTENT_LEAD_TICKS`). Kde skupina může
 * být: políčko a cíl skupiny v kontrolním bodu a políčka rozkazů „Přes okraj“ zapsaných po bodu –
 * worker bod ukládá jen po 40 taktech, skupina tak už mohla přejet. Vrací počet zapsaných rozkazů.
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
    const journeyId = await deps.journeys.activeOf(own.playerId);
    const point = journeyId ? await deps.journeys.checkpoint(journeyId) : null;
    const group = point?.state.groups[0];
    if (!journeyId || !point || !group) continue;
    const crossings = (await deps.journeys.intentsAfter(journeyId, point.state.tick)).flatMap(
      (i) => (i.body.kind === 'cross' && i.byPlayer === own.playerId ? [i.body.cell] : []),
    );
    const cells = [group.cell, ...(group.goal ? [group.goal.cell] : []), ...crossings];
    let there = false;
    for (const cell of cells) {
      there = (await houseOfCell(deps, cell))?.id === other.id;
      if (there) break;
    }
    if (!there) continue;
    const queued = await deps.journeys.addIntent(journeyId, {
      tick: tickOfMs(input.nowMs, deps.world) + INTENT_LEAD_TICKS,
      byPlayer: own.playerId,
      body: { kind: 'home' },
    });
    if (queued) recalled++;
  }
  return recalled;
}
