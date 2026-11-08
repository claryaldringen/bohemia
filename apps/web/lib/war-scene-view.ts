import {
  dateOfDayIndex,
  realTimeOf,
  type GridCell,
  type Pos,
  type WarSceneBuilding,
  type WarSceneView,
  type WorldClock,
} from '@bohemia/game';
import type { CampaignView } from './campaign-view';
import type { ForeignMap } from './foreign-map';
import { sceneBattle } from './scene/army';
import type { SceneWar } from './scene/army-renderer';
import type { SceneVillage } from './village-view-scene-types';

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

/** Odpověď `GET /api/campaign/[id]?map=x,y` – krajina cizí mapy, nebo chyba (404 – mapu nezná). */
export type ForeignMapResponse = { map: ForeignMap } | { error: string };

/** Cizí mapa ve scéně – tažení a políčko, na kterém jeho vojsko stojí. */
export interface WatchedMap {
  campaignId: string;
  cell: GridCell;
}

/**
 * Snímek války pro scénu: boj (hradby z odpovědi), nebo pochod. Na vlastní mapě bez závoje mlhy
 * (návrh Clauda – svou zem hráč zná; cizí muže mimo dohled server neposlal), na cizí mapě
 * (`foreign`) se závojem z pohledu strany hráče (war.md – Ve scéně: mlha války na cizí mapě).
 * Padlí leží do konce herního dne boje. Útěk vsi a odehnané stádo zatím ne (scéna je umí –
 * `planFlight`, `drivenHerd`).
 */
export function sceneWarOf(
  view: WarSceneView | null,
  world: WorldClock,
  foreign = false,
): SceneWar | null {
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
    fog: foreign ? { side: view.side } : null,
    dayEndMs: realTimeOf(dateOfDayIndex(view.day + 1), world),
  };
}

/**
 * Cizí mapa, na kterou se hráč může z mapy tažení podívat ve scéně: políčko velitele (stojí-li na
 * nohou), jinak prvního vlastního muže na nohou, jinak muže spojence (vazal ve službě, jehož muži
 * padli, sleduje tažení dál). null – tažení skončilo, nikdo nestojí, nebo vojsko stojí na mapě
 * sídla, kterou má hráč ve scéně (`home` – tam ho scéna ukazuje sama).
 */
export function watchCellOf(view: CampaignView, home: GridCell | null): GridCell | null {
  if (view.phase === 'done' || view.phase === 'disbanded') return null;
  const active = <T extends { status: string }>(m: T): boolean => m.status === 'active';
  const man =
    view.men.find((m) => m.commander && active(m)) ??
    view.men.find(active) ??
    view.allies.find(active);
  if (!man) return null;
  if (home && man.cell.x === home.x && man.cell.y === home.y) return null;
  return { x: man.cell.x, y: man.cell.y };
}

/**
 * Cizí ves ve scéně – jen objevené domy (stojící, bez lidí, polí a všeho dalšího; co z ní hráč
 * smí vidět, rozhodl server). null – nic objeveného.
 */
export function foreignVillageOf(
  buildings: readonly WarSceneBuilding[] | undefined,
): SceneVillage | null {
  if (!buildings || buildings.length === 0) return null;
  return {
    dwellings: buildings.map((b) => ({
      id: b.id,
      type: b.type,
      position: { ...b.position },
      built: true,
      progress: 1,
    })),
    fields: [],
  };
}

/** Kam se podívat na cizí mapě: první vlastní bojovník na nohou, jinak první skupina pochodu. */
export function armyFocusOf(view: WarSceneView): Pos | null {
  const own = view.battle?.fighters.find(
    (f) => f.side === view.side && f.state !== 'down' && !f.killed,
  );
  const at = own?.pos ?? view.march?.groups[0]?.pos ?? view.battle?.fighters[0]?.pos;
  return at ? { x: at.x, z: at.z } : null;
}
