// Požár pro scénu (disasters.md – Požár, Hašení – řetěz s vědry, Ve scéně): jen v den požáru –
// které stavby hoří (zápis kroniky `fire`) a řetěz s vědry (`disasters.fireFight`, platí jen
// v jeho den). Shořelé zbytky jam poznají ohořelý odstín podle zápisů kroniky. Nikdy budoucí
// rozpis – vynucený požár (`override.fire`) se do prohlížeče nedostane. Čistý modul na serveru.
import type { ChronicleEvent, Position, VillageState } from '@bohemia/game';
import type { SceneBurningHouse, SceneFire } from './village-view-scene-types';

type FireEvent = Extract<ChronicleEvent, { kind: 'fire' }>;

/** Zápis požáru dne `day` v kronice (nejnovější napřed – požár je v kronice na konci). */
function fireEventOf(state: Pick<VillageState, 'chronicle'>, day: number): FireEvent | null {
  for (let i = state.chronicle.length - 1; i >= 0; i--) {
    const event = state.chronicle[i]!;
    if (event.day < day) return null;
    if (event.day === day && event.kind === 'fire') return event;
  }
  return null;
}

/**
 * Požár vsi ve scéně v den `day`, jinak null: hořící stavby – stojící (poškozené) z obydlí,
 * zřícené ze zbytků jam téhož dne – a řetěz s vědry, když je u plánu hašení voda.
 */
export function sceneFire(
  state: Pick<VillageState, 'chronicle' | 'dwellings' | 'ruins' | 'disasters'>,
  day: number,
): SceneFire | null {
  const event = fireEventOf(state, day);
  if (!event) return null;
  const where = (id: number): Position | null =>
    state.dwellings.find((d) => d.id === id)?.position ??
    state.ruins?.find((r) => r.id === id && r.day === day)?.position ??
    null;
  const typeOf = (id: number): SceneBurningHouse['type'] =>
    state.dwellings.find((d) => d.id === id)?.type ??
    state.ruins?.find((r) => r.id === id && r.day === day)?.type ??
    'zemnice';
  const burning: SceneBurningHouse[] = event.burnedDwellingIds.flatMap((id) => {
    const p = where(id);
    if (!p) return [];
    return [
      {
        id,
        x: p.x,
        z: p.z,
        type: typeOf(id),
        rotation: p.rotation,
        ...(id === event.startedDwellingId ? { started: true as const } : {}),
      },
    ];
  });
  if (burning.length === 0) return null;
  const fight = state.disasters?.fireFight;
  const target = fight && burning.find((b) => b.id === fight.dwellingId);
  const chain =
    fight && fight.day === day && fight.water && fight.people > 0 && target
      ? {
          water: { x: fight.water.x, z: fight.water.z },
          target: { x: target.x, z: target.z },
          people: fight.people,
          spacingM: Math.round(fight.spacingM * 100) / 100,
        }
      : null;
  return { day, burning, ...(chain ? { chain } : {}) };
}
