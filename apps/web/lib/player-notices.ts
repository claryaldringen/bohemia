import type { PlayerNotice, PlayerNoticeKind } from '@bohemia/game';
import type { NoticeLine } from '@/components/game/hud/NoticeLines';

// Upozornění mezi hráči (`docs/code/world.md` – Upozornění mezi hráči): server je drží v tabulce
// `player_notice`, klient si je vyzvedává při dotazování na ves a ukáže jako řádky nahoře
// uprostřed vedle upozornění vsi. Čistý modul – smí do prohlížeče.

/** Nejvýš tolik upozornění naráz (jedna odpověď dotazu). */
export const NOTICE_BATCH = 20;

/** Panel, který upozornění otevírá. „Rod a vazalové“ vznikne v úloze 1.10; dál přibudou další. */
export type NoticePanel = 'house';

/** Panel podle druhu upozornění. Zatím se nic neotevírá (panel neexistuje), mapování je hotové. */
export function noticePanel(kind: PlayerNoticeKind): NoticePanel | null {
  switch (kind) {
    case 'invite-accepted':
    case 'invitee-played':
      return 'house';
  }
}

function nameOf(payload: Record<string, unknown>): string {
  return typeof payload.name === 'string' && payload.name !== '' ? payload.name : 'Pozvaný';
}

function textOf(n: PlayerNotice): string {
  switch (n.kind) {
    case 'invite-accepted':
      return `${nameOf(n.payload)} přijal pozvánku – je tvým vazalem.`;
    case 'invitee-played':
      return `${nameOf(n.payload)} se rozehrál.`;
  }
}

/**
 * Řádek upozornění pro hráče. `id` řádku je záporné číslo upozornění: vesnická upozornění mají
 * kladná id z čítače v `VillageGame`, takže se obě řady nikdy nesrazí.
 */
export function playerNoticeLine(n: PlayerNotice): NoticeLine {
  return { id: -n.id, kind: n.kind, tone: 'info', text: textOf(n) };
}

/**
 * Připojí řádky upozornění hráče k těm, které už jsou vidět: v pořadí příchodu (vesnická i
 * hráčská upozornění jdou do jednoho seznamu, jak přicházejí), bez těch, které už v seznamu
 * jsou, nejvýš `max` nejnovějších.
 */
export function mergeNoticeLines(
  current: readonly NoticeLine[],
  incoming: readonly NoticeLine[],
  max: number,
): NoticeLine[] {
  const known = new Set(current.map((n) => n.id));
  const fresh = incoming.filter((n) => !known.has(n.id));
  return [...current, ...fresh].slice(-max);
}

/** Vstup `getPlayerNotices`: `{ afterId }` – celé číslo ≥ 0; `playerId` ze vstupu se ignoruje. */
export function parseNoticesAfterInput(input: unknown): { afterId: number } | null {
  if (typeof input !== 'object' || input === null || !('afterId' in input)) return null;
  const { afterId } = input;
  return typeof afterId === 'number' && Number.isSafeInteger(afterId) && afterId >= 0
    ? { afterId }
    : null;
}

/** Vstup `markNoticesRead`: `{ upToId }` – celé číslo ≥ 0; `playerId` ze vstupu se ignoruje. */
export function parseMarkNoticesReadInput(input: unknown): { upToId: number } | null {
  if (typeof input !== 'object' || input === null || !('upToId' in input)) return null;
  const { upToId } = input;
  return typeof upToId === 'number' && Number.isSafeInteger(upToId) && upToId >= 0
    ? { upToId }
    : null;
}
