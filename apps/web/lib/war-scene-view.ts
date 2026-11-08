import { dateOfDayIndex, realTimeOf, type WarSceneView, type WorldClock } from '@bohemia/game';
import { sceneBattle } from './scene/army';
import type { SceneWar } from './scene/army-renderer';

// Válka ve scéně vlastní mapy (war.md – Ve scéně – napojení na hru): odpověď serveru
// (`WarSceneView` – už po mlze války) na snímek pro scénu (`LandscapeScene.setWar`). Jen převod,
// žádná herní logika – co hráč smí vidět, rozhodl server.

export type { WarSceneView };

/** Odpověď `GET /api/war-scene/[sídlo]` – válka na mapě, nebo chyba (401 bez session). */
export type WarSceneResponse = { war: WarSceneView | null } | { error: string };

/** Dotaz při válce na mapě 2× za sekundu (takty boje jsou 4 za sekundu – jako tažení). */
export const WAR_SCENE_POLL_MS = 500;
/** Bez války na mapě jednou za 5 s – vojsko jde po mapě minuty, pozdní začátek nevadí. */
export const WAR_SCENE_IDLE_MS = 5_000;

/**
 * Snímek války pro scénu: boj (hradby z odpovědi), nebo pochod. Na vlastní mapě bez závoje mlhy
 * (návrh Clauda – svou zem hráč zná; cizí muže mimo dohled server neposlal). Padlí leží do konce
 * herního dne boje. Útěk vsi a odehnané stádo zatím ne (scéna je umí – `planFlight`, `drivenHerd`).
 */
export function sceneWarOf(view: WarSceneView | null, world: WorldClock): SceneWar | null {
  if (!view || (!view.battle && !view.march)) return null;
  return {
    battle: view.battle ? sceneBattle(view.battle, view.battle.walls) : null,
    march: view.march
      ? {
          members: view.march.members.map((m) => ({ ...m })),
          groups: view.march.groups.map((g) => ({
            ...g,
            pos: { ...g.pos },
            heading: { ...g.heading },
          })),
        }
      : null,
    flight: null,
    herd: null,
    fog: null,
    dayEndMs: realTimeOf(dateOfDayIndex(view.day + 1), world),
  };
}
