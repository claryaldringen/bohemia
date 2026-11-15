import type {
  CampaignView,
  ComputeProgress,
  ExpeditionView,
  ExpeditionVisitor,
  GridCell,
  WarSceneView,
} from '@bohemia/game';

// Protokol událostí ze serveru (docs/code/server-events.md; plán 2026-11-15 – Rozhodnutí 3): jedno
// spojení SSE na panel, adresa nese rozsah (zobrazená ves, otevřené tažení, cizí mapa ve scéně).
// Čistý modul – sdílí ho server (`/api/events`) i prohlížeč.

/** Verze protokolu v `sync`; jiná verze (starý kód v prohlížeči po nasazení) = `location.reload()`. */
export const SERVER_EVENTS_PROTOCOL = 1;

/** Adresa spojení událostí. */
export const EVENTS_PATH = '/api/events';

/** Rozsah, o který si prohlížeč říká – server ho ověří (ves 403, tažení se tiše zahodí). */
export interface EventScope {
  villageId: string | null;
  campaignId: string | null;
  scene: { campaignId: string; cell: GridCell } | null;
}

/** Události SSE a jejich náklad (Rozhodnutí 3) – signál (prohlížeč si dočte), nebo rovnou stav. */
export interface ServerEvents {
  /** Po připojení a po obnově LISTEN – prohlížeč dočte vše, co ukazuje. */
  sync: { protocol: number };
  /**
   * Ves `villageId` má verzi `version` (`getVillageView` s `known` / `pieces`). Změna sídla hráče
   * (nový nebo starý vlastník, archiv) nese null – dočíst vždy.
   */
  village: { villageId: string | null; version: number | null };
  /** Hráči přibylo upozornění (`getVillageView` s `withNotices`). */
  notices: Record<string, never>;
  /** Varování zobrazené vsi se změnilo (`getAlarmView`). */
  alarm: { villageId: string };
  /** Pohledy na výpravy hráče – stav rovnou (jako `GET /api/journey`). */
  journeys: { views: ExpeditionView[] };
  /** Skupiny výprav na mapě zobrazené vsi – stav rovnou (`GET /api/journey?visitors=`). */
  visitors: { villageId: string; visitors: ExpeditionVisitor[] };
  /** Pohled na tažení – stav rovnou (`GET /api/campaign/<id>`). */
  campaign: { campaignId: string; view: CampaignView };
  /** Válka ve scéně – `key` z `warKeyOfSettlement` / `warKeyOfScene`; null = nic k vidění. */
  war: { key: string; war: WarSceneView | null };
  /** Průběh přeskoku času (vývojový režim); null = žádný neběží. */
  skip: { progress: ComputeProgress | null };
  /**
   * Spojení vyhodil novější panel téhož hráče (nad `MAX_CONNECTIONS_PER_PLAYER`) a hned ho zavře –
   * prohlížeč se znovu nepřipojí sám (vyhodil by další panel a tak dokola), přejde na pojistku.
   */
  evicted: Record<string, never>;
}

export type ServerEventName = keyof ServerEvents;

/** Id je UUID z databáze (jako `parseVillageId`) – jiný řetězec do dotazu vůbec nepustíme. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Cizí mapa ve scéně: `<id tažení>@<x>,<y>`. */
const SCENE = /^([0-9a-f-]{36})@(-?\d{1,4}),(-?\d{1,4})$/i;

/** Adresa spojení pro rozsah – prázdné části vynechá, pořadí je pevné (ves, tažení, scéna). */
export function eventsUrl(scope: EventScope): string {
  const parts: string[] = [];
  if (scope.villageId !== null) parts.push(`village=${encodeURIComponent(scope.villageId)}`);
  if (scope.campaignId !== null) parts.push(`campaign=${encodeURIComponent(scope.campaignId)}`);
  if (scope.scene !== null) {
    const { campaignId, cell } = scope.scene;
    parts.push(`scene=${encodeURIComponent(campaignId)}@${cell.x},${cell.y}`);
  }
  return parts.length > 0 ? `${EVENTS_PATH}?${parts.join('&')}` : EVENTS_PATH;
}

/** Jediná hodnota parametru: chybí = undefined, víc hodnot nebo vadná = null. */
function single(params: URLSearchParams, name: string): string | null | undefined {
  const values = params.getAll(name);
  if (values.length === 0) return undefined;
  return values.length === 1 ? (values[0] ?? null) : null;
}

/** Id (UUID, malými písmeny jako z databáze); chybí = undefined, vadné = null. */
function idOf(params: URLSearchParams, name: string): string | null | undefined {
  const value = single(params, name);
  if (value === undefined || value === null) return value;
  return UUID.test(value) ? value.toLowerCase() : null;
}

/** Cizí mapa ve scéně; chybí = undefined, vadná = null. */
function sceneOf(params: URLSearchParams): EventScope['scene'] | undefined {
  const value = single(params, 'scene');
  if (value === undefined || value === null) return value;
  const match = SCENE.exec(value);
  const campaignId = match?.[1];
  if (!match || campaignId === undefined || !UUID.test(campaignId)) return null;
  return {
    campaignId: campaignId.toLowerCase(),
    cell: { x: Number(match[2]), y: Number(match[3]) },
  };
}

/**
 * Rozsah z dotazu `?village=<id>&campaign=<id>&scene=<id>@<x>,<y>`; id jen UUID, políčko
 * `-?\d{1,4}`. Cokoli jiného (i dvojí hodnota) = null – route odpoví 400. Jiné parametry nevadí.
 */
export function parseEventScope(params: URLSearchParams): EventScope | null {
  const villageId = idOf(params, 'village');
  const campaignId = idOf(params, 'campaign');
  const scene = sceneOf(params);
  if (villageId === null || campaignId === null || scene === null) return null;
  return { villageId: villageId ?? null, campaignId: campaignId ?? null, scene: scene ?? null };
}

/** Jedna událost SSE: `event: <jméno>\ndata: <json>\n\n` (JSON je vždy na jednom řádku). */
export function formatServerEvent<K extends ServerEventName>(
  name: K,
  data: ServerEvents[K],
): string {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Klíč války na vlastní mapě sídla (`ServerEvents['war'].key`). */
export function warKeyOfSettlement(settlementId: string): string {
  return `settlement:${settlementId}`;
}

/** Klíč války na cizí mapě ve scéně – tažení a políčko (`ServerEvents['war'].key`). */
export function warKeyOfScene(campaignId: string, cell: GridCell): string {
  return `scene:${campaignId}@${cell.x},${cell.y}`;
}
