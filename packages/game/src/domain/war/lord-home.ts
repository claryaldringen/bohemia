import { isAway } from '../village/people/people';
import type { VillageState } from '../village/types';
import { MissingData } from './campaign-tick';
import type { TickContext } from './campaign-tick';
import type { AlarmOwner } from './alarm-types';
import type { CampaignState } from './campaign-types';
import { alarmTaken } from './evacuation';

// Vojvoda doma (war.md – Hráč ve vsi a mimo ni; plán 2026-11-14 – Úloha 3): hráčův muž (hlava rodu
// v sídelní vsi – `AlarmOwner.lordId`) rozhoduje o vsi jen tehdy, když je ve vsi.

/** Hráčův muž žije ve vsi, dnes není pryč (`isAway`) a tažení ho dnes neodvedlo (`gone`). */
export function lordAtHome(
  state: Pick<VillageState, 'people'>,
  lordId: number | undefined,
  day: number,
  gone?: ReadonlySet<number>,
): boolean {
  if (lordId === undefined || gone?.has(lordId) === true) return false;
  const person = state.people.find((p) => p.id === lordId);
  return person !== undefined && !isAway(person, day);
}

/** Totéž v taktu: stav `villageAt(villageId, s.day)` (chybí → MissingData), `gone` = lidé z `alarmTaken`. */
export function lordHomeAt(
  s: CampaignState,
  villageId: string,
  owner: AlarmOwner,
  ctx: TickContext,
): boolean {
  const state = ctx.world.villageAt(villageId, s.day);
  if (state === null) throw new MissingData([], [villageId]);
  const gone = alarmTaken(s, villageId, s.day, ctx.world.clock).people;
  return lordAtHome(state, owner.lordId, s.day, gone);
}
