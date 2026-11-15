'use server';

import { NOT_PLAYER_VILLAGE } from '@bohemia/game';
import { chooseLanguageForPlayer, gameDeps } from '@/lib/game';
import {
  NOTICE_BATCH,
  wantsPlayerNotices,
  type VillageNone,
  type WithPlayerNotices,
} from '@/lib/player-notices';
import { trimKnownSceneData, type KnownSceneData } from '@/lib/scene-routes';
import { packViewPieces } from '@/lib/view-pieces';
import { withVillageCache } from '@bohemia/server';
import { parsePanelAsk, type PanelOptions } from '@/lib/panel-options';
import { parseChronicleAsk, type ChroniclePage } from '@/lib/chronicle-view';
import { NOTICE_PAGE_SIZE, noticePage, parseNoticeAsk, type NoticePage } from '@/lib/notice-page';
import {
  panelOptionsForPlayer,
  chronicleForPlayer,
  villageViewForPlayer,
  villageViewIfChanged,
  type VillageActionResult,
  type VillageUnchanged,
  type VillageView,
} from '@/lib/village';
import { villageIdOf } from '@/lib/village-input';
import { mapWatchForPlayer } from '@/lib/war-scene';
import { MAP_WATCH_QUIET, type MapWatchView } from '@/lib/journey-view';
import { NOT_SIGNED_IN, INVALID_INPUT, playerId } from './_shared';

/** Volba jazyka skupiny před založením vsi (účty přes Google – newcomers.md); chyba česky. */
export async function chooseLanguageAction(
  language: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = await playerId();
  if (id === null) return { ok: false, error: NOT_SIGNED_IN };
  const result = await chooseLanguageForPlayer(id, language);
  return result.ok ? result : { ok: false, error: result.reason };
}

/**
 * Ves hráče dopočítaná do dneška: `{ villageId }` – vybraná ves; `{ villageId: null }` (ještě
 * žádnou nezná, zakládá ves) – jeho první ves, nebo null, dokud žádnou nemá. Když vybraná ves
 * hráči už nepatří (restart hry v jiném panelu), vrátí jeho první ves (nebo null) – klient pak
 * načte stránku znovu. S `known` (otisk pohledu, který klient má – `VillageView.stamp`) vrátí
 * `{ unchanged: true }`, když se od něj nic nezměnilo. S `withNotices: true` přidá do odpovědi
 * (i `unchanged`) `playerNotices` – dosud nepřečtená upozornění mezi hráči, která tím označí
 * za přečtená (doručují se jen jednou), a `watch` – válka a jezdci na mapě vsi, na které se scéna
 * pak ptá zvlášť (D62 – bez nich se neptá).
 */
export async function getVillageView(
  input: unknown,
): Promise<
  | (WithPlayerNotices<VillageView | VillageUnchanged | VillageNone> & { watch?: MapWatchView })
  | null
  | { error: string }
> {
  const result = await withVillageCache(() => villageViewOf(input));
  if ((result !== null && 'error' in result) || !wantsPlayerNotices(input)) return result;
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  // Hráč bez vsi (jen sídlo): upozornění mu dojdou i tak, bez pohledu na ves.
  if (result === null) {
    return {
      noVillage: true,
      playerNotices: await gameDeps().notices.takeUnread(id, NOTICE_BATCH),
    };
  }
  // Doručení = vyzvednutí a označení za přečtená naráz. Výsledek se kopíruje – objekt z dopočtu
  // se nikdy nedoplňuje (mohl by být sdílený).
  // válka a jezdci na mapě zobrazené vsi – i u nezměněného pohledu (ten se mění jen s vsí); před
  // vyzvednutím upozornění, ať chyba dotazu žádné nespolkne
  const shown = 'unchanged' in result ? villageIdOf(input) : result.id;
  const watch = shown === null ? MAP_WATCH_QUIET : await mapWatchForPlayer(id, shown);
  const playerNotices = await gameDeps().notices.takeUnread(id, NOTICE_BATCH);
  return { ...result, playerNotices, watch };
}

async function villageViewOf(
  input: unknown,
): Promise<VillageView | VillageUnchanged | null | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const villageId = villageIdOf(input);
  if (villageId === null && !isNullVillage(input)) return { error: INVALID_INPUT };
  const known = knownStampOf(input);
  if (villageId !== null && known !== null) {
    const fresh = await villageViewIfChanged(id, villageId, known);
    if (fresh === null || !('error' in fresh) || fresh.error !== NOT_PLAYER_VILLAGE) {
      return trimKnown(fresh, input);
    }
    return villageViewForPlayer(id, null);
  }
  const view = await villageViewForPlayer(id, villageId);
  if (villageId !== null && view !== null && 'error' in view && view.error === NOT_PLAYER_VILLAGE) {
    return villageViewForPlayer(id, null);
  }
  return trimKnown(view, input);
}

/** Trasy a vyšlapanost, které klient už má (`routesKey`, `wearDay` v dotazu), se neposílají. */
function trimKnown<T extends VillageView | VillageUnchanged | null | { error: string }>(
  result: T,
  input: unknown,
): T {
  if (
    result === null ||
    !('scene' in result) ||
    // jen pohled té vsi, na kterou se klient ptal (fallback na první ves netrimovat)
    !('id' in result) ||
    result.id !== villageIdOf(input) ||
    typeof input !== 'object' ||
    input === null
  ) {
    return result;
  }
  const known: KnownSceneData = {
    ...('routesKey' in input && typeof input.routesKey === 'string'
      ? { routesKey: input.routesKey }
      : {}),
    ...('wearDay' in input && typeof input.wearDay === 'number' ? { wearDay: input.wearDay } : {}),
    ...('wearCellM' in input && typeof input.wearCellM === 'number'
      ? { wearCellM: input.wearCellM }
      : {}),
  };
  return packViewPieces(
    { ...result, scene: trimKnownSceneData(result.scene, known) },
    knownPiecesOf(input),
  ) as T;
}

/** Nejvýš tolik částí a otisků v dotazu (`pieces`) – víc pohled nemá. */
const MAX_PIECE_PARTS = 256;
const MAX_PIECE_KEYS = 20_000;

/** Otisky kusů pohledu, které klient má (`pieces` v dotazu – view-pieces.ts), jinak null. */
function knownPiecesOf(input: object): Record<string, string[]> | null {
  if (!('pieces' in input) || typeof input.pieces !== 'object' || input.pieces === null) {
    return null;
  }
  const entries = Object.entries(input.pieces as Record<string, unknown>);
  if (entries.length > MAX_PIECE_PARTS) return null;
  const out: Record<string, string[]> = {};
  let count = 0;
  for (const [name, keys] of entries) {
    if (!/^[a-z]{1,2}\d{0,4}$/.test(name) || !Array.isArray(keys)) return null;
    count += keys.length;
    if (count > MAX_PIECE_KEYS) return null;
    if (!keys.every((k) => typeof k === 'string' && k.length <= 32)) return null;
    out[name] = keys as string[];
  }
  return out;
}

/** Otisk pohledu z dotazu (`known` – 16 šestnáctkových číslic), jinak null. */
function knownStampOf(input: unknown): string | null {
  if (typeof input !== 'object' || input === null || !('known' in input)) return null;
  return typeof input.known === 'string' && /^[0-9a-f]{16}$/.test(input.known) ? input.known : null;
}

function isNullVillage(input: unknown): boolean {
  return (
    typeof input === 'object' && input !== null && 'villageId' in input && input.villageId === null
  );
}

/**
 * Pohled na jinou ves hráče `{ villageId }` (přepínač v horní liště) – ověří, že ves
 * patří hráči. Výběr si zapamatuje prohlížeč (cookie – `lib/village-choice.ts`); ves na jiné mapě
 * si klient otevře novým načtením stránky (jiná krajina).
 */
export async function selectVillage(input: unknown): Promise<VillageActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const villageId = villageIdOf(input);
  if (villageId === null) return { error: INVALID_INPUT };
  const view = await withVillageCache(() => villageViewForPlayer(id, villageId));
  return view ?? { error: INVALID_INPUT };
}

/**
/**
 * Úprava pevné cesty s hatí a lávkou (roads.md): `{ villageId, roadId, upgrade: 'improved' }` –
 * server ho ověří znovu (`roadUpgradeOptions`).
 */
/**
 * Nabídka panelu až na vyžádání (panel-options.ts): `{ villageId, panel: 'trails' }` – zemské
 * stezky dvorce do 8 směrů, `{ villageId, panel: 'road-apples', roadId }` – výsadba jabloní
 * podél cesty. Server ji spočítá ze vsi dopočítané do dneška; akce ji ověří znovu.
 */
export async function getPanelOptions(input: unknown): Promise<PanelOptions | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const villageId = villageIdOf(input);
  const ask = parsePanelAsk(input);
  if (villageId === null || ask === null) return { error: INVALID_INPUT };
  return panelOptionsForPlayer(id, villageId, ask);
}

/**
 * Stránka kroniky vsi (panel Kronika): `{ villageId, before? }` – roky před `before`, bez něj od
 * nejnovějšího (chronicle-view.ts).
 */
export async function getChronicle(input: unknown): Promise<ChroniclePage | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const villageId = villageIdOf(input);
  const ask = parseChronicleAsk(input);
  if (villageId === null || ask === null) return { error: INVALID_INPUT };
  return chronicleForPlayer(id, villageId, ask);
}

/**
 * Stránka historie upozornění mezi hráči (panel Upozornění): `{ before? }`. Jen upozornění
 * přihlášeného hráče (id hráče je ze session, ne ze vstupu); nic neoznačuje za přečtené.
 */
export async function getNotices(input: unknown): Promise<NoticePage | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const ask = parseNoticeAsk(input);
  if (ask === null) return { error: INVALID_INPUT };
  return noticePage(await gameDeps().notices.page(id, ask.before, NOTICE_PAGE_SIZE + 1));
}
