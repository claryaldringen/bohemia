// Nabídky panelů až na vyžádání: zemské stezky dvorce (8 plánů tras se dřevem a průseky) a výsadba
// jabloní u cesty (volná místa podél celé cesty hráče a co zabere polím) stály u Vlkova ≈ 90 ms
// z ≈ 140 ms pohledu za každý herní den – a hráč je vidí, jen když otevře kompas stezek nebo vybere
// cestu. Paměť podle otisku vstupů by nepomohla: obě nabídky závisí na dni (stromy u cest rostou,
// pařezy zarůstají, stavby postupují), takže by se otisk měnil s každým dotazem. Server je proto
// spočítá až na vyžádání panelu (`getPanelOptions`) ze stejného stavu jako pohled (`buildVillageView`
// – ves se sousedy z mapy, opuštěná jen jako pohled) a akce je ověří znovu. Čistý modul.
import {
  abandonedVillageAt,
  obstaclesOf,
  roadApplesOption,
  trailOptions,
  villageRoadWalk,
  type Landscape,
  type RoadApplesOption,
  type TrailOption,
  type VillageState,
} from '@bohemia/game';

/** Který panel se ptá: kompas zemských stezek dvorce, nebo „Vysadit jabloně“ u cesty. */
export type PanelAsk = { panel: 'trails' } | { panel: 'road-apples'; roadId: number };

/** Nabídka panelu – stezky do 8 směrů, nebo výsadba jabloní podél cesty `roadId`. */
export type PanelOptions =
  | { panel: 'trails'; trails: TrailOption[] }
  | { panel: 'road-apples'; roadId: number; option: RoadApplesOption };

/** Výsadba u cesty, která mezitím zanikla – nic nepřibude. */
const NO_ROAD_APPLES: RoadApplesOption = {
  trees: 0,
  laborManDays: 0,
  blocked: null,
  warning: null,
};

/** Dotaz panelu ze vstupu klienta; jiný tvar null. */
export function parsePanelAsk(input: unknown): PanelAsk | null {
  if (typeof input !== 'object' || input === null) return null;
  const { panel, roadId } = input as { panel?: unknown; roadId?: unknown };
  if (panel === 'trails') return { panel };
  if (panel === 'road-apples' && typeof roadId === 'number' && Number.isInteger(roadId)) {
    return { panel, roadId };
  }
  return null;
}

/** Klíč dotazu panelu (stejný dotaz = stejný klíč). */
export function panelAskKey(ask: PanelAsk): string {
  return ask.panel === 'trails' ? 'trails' : `road-apples:${ask.roadId}`;
}

/**
 * Nabídka panelu `ask` pro ves se stavem `own` v den `day` – stav připravený jako v pohledu
 * (opuštěná ves jen to, co z ní stojí).
 */
export function panelOptionsOf(
  own: VillageState,
  landscape: Landscape,
  day: number,
  ask: PanelAsk,
): PanelOptions {
  const state = abandonedVillageAt(own, day);
  const obstacles = obstaclesOf(landscape);
  if (ask.panel === 'trails') {
    const walk = villageRoadWalk(state, landscape);
    return { panel: 'trails', trails: trailOptions(state, day, landscape, obstacles, walk) };
  }
  return {
    panel: 'road-apples',
    roadId: ask.roadId,
    option: roadApplesOption(state, ask.roadId, day, landscape, obstacles) ?? NO_ROAD_APPLES,
  };
}
