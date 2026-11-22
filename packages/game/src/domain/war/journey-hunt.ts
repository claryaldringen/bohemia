import type { NewVillageEvent } from '../village/core/inbox';
import { gridOf, type TickContext } from './campaign-tick';
import { beatersPlan, endBeaters, type HuntStart } from './hunt-beaters';
import { fightResult, huntFightTick, newHuntFight, releaseQuarry } from './hunt-fight';
import type { JourneyHunt, JourneyState } from './journey-types';
import { dayOfTick, hoursPerTick, tickRandom } from './ticks';

// Lov ve výpravě (hunting.md – Pravidla 3, 7; plán 2026-11-22-hunting – Rozhodnutí 1, 4, 6): lov
// je součást výpravy domovské vsi (`JourneyState.hunt`) – honci jdou ze dvorce k dveřím lesa,
// tam zvíře vyběhne a běží souboj (`hunt-fight.ts`) na mřížce pochodu domovské mapy. Konec
// souboje (zabití, nebo útěk po nečinnosti) vydá jednou výsledek do vsi a pošle honce domů; až
// jsou doma, lov zmizí – výprava bez skupin pak končí (`journey.ts`). Mutuje stav taktu (kopii,
// kterou `journeyTick` zahodí, chybí-li data); náhoda jen ze seedu výpravy, taktu a id lovu.

/** Co vydal takt lovu: události do vsi (`hunt-result`) a zda někdo z výpravy padl či byl raněn. */
export interface HuntTickOut {
  events: NewVillageEvent[];
  losses: boolean;
}

/**
 * Nový lov ve výpravě; běží-li jiný, nic. Honci vyjdou ze dvorce (`home.pos`) v taktu `tick`,
 * zvíře čeká skryté u dveří lesa (`newHuntFight`); id lovu je z `nextId` výpravy.
 */
export function startHunt(s: JourneyState, start: HuntStart, tick: number): void {
  if (s.hunt !== undefined) return;
  s.hunt = {
    id: s.nextId++,
    day: start.day,
    dogs: start.dogs,
    out: { x: start.out.x, z: start.out.z },
    beaters: beatersPlan(s.home.pos, start.door, tick),
    fight: newHuntFight(start.quarry, start.door, tick),
  };
}

/**
 * Takt lovu `tick` (stav výpravy už má den taktu): honci u dveří → skryté zvíře vyběhne
 * (`releaseQuarry`); souboj taktu (`huntFightTick` – na mřížce pochodu domovské mapy pro den taktu
 * jako pohyb hloučků, náhoda `tickRandom(seed, takt, 'hunt:<id>')`; skryté zvíře jen čeká). Konec
 * souboje → honci domů (`endBeaters` – s úlovkem přes místo, kde padl) a jednou `hunt-result` do
 * domovské vsi na den taktu (`ref` `journey:<id>:hunt:<id lovu>` – druhé doručení zahodí
 * schránka). Honci doma (`homeTick`) → lov zmizí.
 */
export function huntTick(s: JourneyState, tick: number, ctx: TickContext): HuntTickOut {
  const out: HuntTickOut = { events: [], losses: false };
  const hunt = s.hunt;
  if (hunt === undefined) return out;
  const f = hunt.fight;
  if (f.outcome === 'ongoing') {
    if (f.quarry.state === 'hidden' && tick >= hunt.beaters.arriveTick) {
      releaseQuarry(f, hunt.out, tick);
    }
    // souboj vzniklý v tomto taktu je už spočtený (`f.tick`); skryté zvíře mřížku nepotřebuje
    if (f.tick < tick) {
      const grid = f.quarry.state === 'hidden' ? null : gridOf(s.home.cell, s.day, ctx);
      const field = { grid, hoursPerTick: hoursPerTick(ctx.world.clock) };
      huntFightTick(f, field, tickRandom(s.seed, tick, `hunt:${hunt.id}`));
    }
    if (f.outcome !== 'ongoing') {
      endBeaters(hunt.beaters, tick, f.quarry.pos, f.outcome === 'killed');
    }
  }
  if (f.outcome !== 'ongoing' && !hunt.reported) {
    hunt.reported = true;
    out.events.push(resultEvent(s, hunt, tick, ctx));
  }
  const home = hunt.beaters.homeTick;
  if (home !== null && tick >= home) delete s.hunt;
  return out;
}

/**
 * Výsledek lovu do domovské vsi (`fightResult`): jména útočníků a jejich jezdecké koně
 * (`horseId`) z lidí výpravy.
 */
function resultEvent(
  s: JourneyState,
  hunt: JourneyHunt,
  tick: number,
  ctx: TickContext,
): NewVillageEvent {
  const names = new Map<number, string>();
  const horses = new Map<number, number>();
  for (const m of s.members) {
    if (m.name !== undefined) names.set(m.ref.personId, m.name);
    if (m.horseId !== undefined) horses.set(m.ref.personId, m.horseId);
  }
  return {
    villageId: s.home.villageId,
    day: dayOfTick(tick, ctx.world.clock),
    ref: `journey:${s.id}:hunt:${hunt.id}`,
    body: {
      kind: 'hunt-result',
      journeyId: s.id,
      huntId: hunt.id,
      result: fightResult(hunt.fight, names, horses),
    },
  };
}
