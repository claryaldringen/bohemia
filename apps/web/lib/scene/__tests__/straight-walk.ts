// Délky chůze rovně ode dveří pro testy rozvrhu (scéna bere délky z odhadu sítě pěšin –
// `Timetable.setEstimate`).
import type { PersonTask, TaskWalk } from '../villager-schedule';

/**
 * Práce na místě a úloha u objektu tam i zpět vzdálenost ÷ `speed` (m/s), pochůzka celý cyklus
 * `errand.homeS` (půl tam, půl zpět). Bez dveří nebo místa chůze 0.
 */
export function straightWalk(
  doorOf: (personId: number) => { x: number; z: number } | null,
  speed: number,
): (personId: number, task: PersonTask) => TaskWalk {
  const v = Math.max(0.1, speed);
  return (personId, task) => {
    if (task.errand) return { outS: task.errand.homeS / 2, endS: 0, backS: task.errand.homeS / 2 };
    const door = doorOf(personId);
    const walk = door && task.at ? Math.hypot(task.at.x - door.x, task.at.z - door.z) / v : 0;
    return { outS: walk, endS: 0, backS: walk };
  };
}
