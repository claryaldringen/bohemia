// Kněz u kostela (churches.md – Co kostel dává; návrh Clauda 12. 11. 2026): kněz dostavěného
// kostela stojí přes den před vchodem a modlí se – pevné místo dne, do práce vsi nejde (jádro ho
// z práce vynechává – `isLodgeIdle`).
import { churchDoorWorld } from './church-site-layout';
import { stand } from './villager-motion';
import { cast, figure } from './villager-plan-cast';
import { nearestFree } from './villager-plan-geometry';
import type { Context, PlannedVillager } from './villager-plan-types';

/** Kolik metrů před vchodem kněz stojí (návrh Clauda). */
export const PRIEST_DOOR_M = 2.5;

/**
 * Kněží kostelů vsi: u každého dostavěného kostela s knězem (`SceneChurch.priestId`) postava
 * před vchodem čelem ven. Bere se z rozpisu lidí jako první (před spřežením a prací vsi), ať ho
 * nikdo nepošle orat; bez lidí ve scéně je postava jen podle kostela. Kněz, který dnes jde na
 * svatbu nebo pohřeb (`atEvents`), před vchodem nestojí – postavu mu dá obřad.
 */
export function priestFigures(
  ctx: Context,
  atEvents: ReadonlySet<number> = new Set(),
): PlannedVillager[] {
  const out: PlannedVillager[] = [];
  for (const church of ctx.village.churches ?? []) {
    const id = church.priestId;
    if (!church.built || id === undefined || atEvents.has(id)) continue;
    const c = cast(ctx, `priest:${church.id}`, { women: 0, child: false }, () =>
      ctx.roster!.takeId(id),
    );
    if (!c) continue;
    const door = churchDoorWorld(church.type, church.dims, church.position);
    const spot = nearestFree(
      ctx,
      door.x + door.outX * PRIEST_DOOR_M,
      door.z + door.outZ * PRIEST_DOOR_M,
      2,
    );
    if (!spot) {
      if (c.person) ctx.roster?.release(c.person.id);
      continue;
    }
    out.push(
      figure(c, stand(spot.x, spot.z, door.outX, door.outZ, 'idle'), 'natural', {
        kind: 'priest',
        church: church.id,
      }),
    );
  }
  return out;
}
