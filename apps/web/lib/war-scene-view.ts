import {
  BREAKOUT_BLOCKED,
  dateOfDayIndex,
  msOfTick,
  realTimeOf,
  type GridCell,
  type Landscape,
  type Pos,
  type SeenCell,
  type WarSceneBuilding,
  type WarSceneView,
  type WorldClock,
} from '@bohemia/game';
import type { CampaignView } from './campaign-view';
import type { ForeignMap } from './foreign-map';
import { seenVillageOf } from './journey-scene-view';
import { sceneBattle } from './scene/army';
import type { SceneWar } from './scene/army-renderer';
import type { SceneAlarm } from './scene/refugee-march';
import { planFlight, type FleeWalk } from './scene/villager-plan';
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
 * Padlí leží do konce herního dne boje (server pošle rozhodnutý boj jen s padlými a raněnými).
 * Útěk vsi do lesa (`flightOf`), odehnané stádo s vojskem (`herdOf`), průvod uprchlíků a posel
 * (`alarmOf`) – scéna se zapne i bez vojska na mapě.
 */
export function sceneWarOf(
  view: WarSceneView | null,
  world: WorldClock,
  foreign = false,
): SceneWar | null {
  const alarm = view ? alarmOf(view) : null;
  if (!view || (!view.battle && !view.march && !alarm)) return null;
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
          // takt snímku – mezi dvěma dotazy jde pochod plynule (army.ts – `marchAt`)
          tick: view.tick,
        }
      : null,
    flight: flightOf(view, world),
    herd: herdOf(view),
    alarm,
    fog: foreign ? { side: view.side } : null,
    dayEndMs: realTimeOf(dateOfDayIndex(view.day + 1), world),
  };
}

/** Nejvýš tolik kusů dobytka kreslí scéna ve stádu (výkon – víc kusů je jen hustší hlouček). */
export const SCENE_HERD_MAX = 24;

/**
 * Útěk vsi do lesa pro scénu (war.md – Napadená ves): každý od svého domu k okraji lesa své skupiny
 * domů (`planFlight` po okrajích lesa), od taktu, kdy ves utekla. Takt neznámý (`startTick` null –
 * starší stav tažení) – lidé už stojí u lesa (`startMs` −∞).
 */
export function flightOf(view: WarSceneView, world: WorldClock): SceneWar['flight'] {
  const f = view.flight;
  if (!f || f.people.length === 0) return null;
  const walks: FleeWalk[] = f.forests.flatMap((forest, i) =>
    planFlight(
      f.people
        .filter((p) => p.forest === i)
        .map((p) => ({
          id: p.id,
          home: { x: p.home.x, z: p.home.z },
          kind: p.kind,
          child: p.child,
          carries: p.carries,
        })),
      forest,
    ),
  );
  return {
    walks,
    startMs: f.startTick === null ? -Infinity : msOfTick(f.startTick, world),
    herd: Math.min(f.herd, SCENE_HERD_MAX),
  };
}

/** Odehnané stádo za skupinou vojska, se kterou jde (poloha a směr chůze skupiny). */
export function herdOf(view: WarSceneView): SceneWar['herd'] {
  const h = view.march?.herd;
  const g = h ? view.march?.groups.find((x) => x.id === h.group) : undefined;
  if (!h || !g || h.count <= 0) return null;
  return {
    lead: { x: g.pos.x, z: g.pos.z },
    heading: { x: g.heading.x, z: g.heading.z },
    count: Math.min(h.count, SCENE_HERD_MAX),
  };
}

/**
 * Průvody uprchlíků a běžící poslové na mapě pro scénu (war.md – Varování, poslové a útěk do
 * hradiště; Ú14): lidé s nůšemi, stádo za nimi (nejvýš `SCENE_HERD_MAX` kusů), posel; takt snímku
 * pro plynulý posun (`alarmAt`). null – žádné.
 */
export function alarmOf(view: WarSceneView): SceneAlarm | null {
  const refugees = (view.refugeMarch ?? []).map((r) => ({
    key: r.refId,
    mode: r.mode,
    pos: { x: r.pos.x, z: r.pos.z },
    heading: { x: r.heading.x, z: r.heading.z },
    moving: r.moving,
    people: r.people.map((p) => ({ kind: p.kind, child: p.child, carries: p.carries })),
    herd: Math.min(r.herd, SCENE_HERD_MAX),
  }));
  const messengers = (view.messengers ?? []).map((m) => ({
    key: m.refId,
    pos: { x: m.pos.x, z: m.pos.z },
    heading: { x: m.heading.x, z: m.heading.z },
    mounted: m.mounted,
  }));
  if (refugees.length === 0 && messengers.length === 0) return null;
  return { tick: view.tick, refugees, messengers };
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
 * Kam jde scéna cizí mapy `current`, když na ní vojsko už nestojí (design „mapu po mapě“ – scéna jde
 * za vojskem): na mapu, kde je teď (`watchCellOf` – velitel, jinak vlastní muž, jinak spojenec).
 * null – zpět na ves: tažení skončilo, vojsko přišlo na mapu sídla ve scéně (ukáže ho scéna vsi),
 * nikdo nestojí, nebo pohled ho má pořád na téže mapě (nic nového k ukázání).
 */
export function followCellOf(
  view: CampaignView,
  current: GridCell,
  home: GridCell | null,
): GridCell | null {
  const next = watchCellOf(view, home);
  if (!next || (next.x === current.x && next.y === current.y)) return null;
  return next;
}

/**
 * Cizí ves ve scéně tažení (co z ní hráč smí vidět, rozhodl server): objevené domy (stojící, bez
 * lidí, polí a všeho dalšího) a stavby, jak je rod naposled viděl (`known` – `seenVillageOf`
 * s krajinou cizí mapy `landscape`; plán 2026-11-13 – Úloha 12b). Objevený dům má přednost před
 * známým téhož id, opevnění ze znalosti se nekreslí – útočník ho vidí ze stavu vsi jako dřív.
 * null – nic objeveného ani známého.
 */
export function foreignVillageOf(
  buildings: readonly WarSceneBuilding[] | undefined,
  known: SeenCell | null = null,
  landscape: Landscape | null = null,
): SceneVillage | null {
  const found = (buildings ?? []).map((b): SceneVillage['dwellings'][number] => ({
    id: b.id,
    type: b.type,
    position: { ...b.position },
    built: true,
    progress: 1,
  }));
  const ids = new Set(found.map((d) => d.id));
  const parts = (landscape ? (known?.parts ?? []) : []).filter(
    (p) => p.data.kind !== 'fortification' && !(p.data.kind === 'dwelling' && ids.has(p.data.id)),
  );
  const seen =
    known && landscape && parts.length > 0 ? seenVillageOf({ ...known, parts }, landscape) : null;
  if (found.length === 0) return seen;
  return seen
    ? { ...seen, dwellings: [...found, ...seen.dwellings] }
    : { dwellings: found, fields: [] };
}

/**
 * Tlačítko „Probít se“ obránce na mapě své vsi (fortifications.md – Obrana bez násobku 3, Bod zlomu
 * a probíjení): null – ves nemá opevnění s branou nebo se u ní nebojuje (tlačítko chybí); jinak
 * důvod, proč rozkaz nejde (`denied` null – jde). Rozhodl server (`WarSceneView.breakout`).
 */
export function breakoutOf(
  view: WarSceneView | null | undefined,
): { denied: string | null } | null {
  if (!view || view.side !== 'defend' || !view.breakout) return null;
  const blocked = view.breakout.blocked;
  return { denied: blocked === null ? null : BREAKOUT_BLOCKED[blocked] };
}

/** Kam se podívat na cizí mapě: první vlastní bojovník na nohou, jinak první skupina pochodu. */
export function armyFocusOf(view: WarSceneView): Pos | null {
  const own = view.battle?.fighters.find(
    (f) => f.side === view.side && f.state !== 'down' && !f.killed,
  );
  const at = own?.pos ?? view.march?.groups[0]?.pos ?? view.battle?.fighters[0]?.pos;
  return at ? { x: at.x, z: at.z } : null;
}
