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
    case 'negotiation-offer':
    case 'negotiation-counter':
    case 'negotiation-accepted':
    case 'negotiation-rejected':
    case 'negotiation-withdrawn':
    case 'blocked':
      return 'house';
    case 'player-succession':
      return null;
  }
}

function nameOf(payload: Record<string, unknown>): string {
  return typeof payload.name === 'string' && payload.name !== '' ? payload.name : 'Pozvaný';
}

/** Jméno druhého rodu v upozornění z jednání; bez jména „Jiný rod“. */
function otherName(payload: Record<string, unknown>): string {
  return typeof payload.name === 'string' && payload.name !== '' ? payload.name : 'Jiný rod';
}

/**
 * 4. pád mužského jména rodu („Hraješ za Ctibora“): -a → -u, -ek → -ka, měkká souhláska +e, jinak
 * +a; jména na jinou samohlásku zůstanou. Jména rodu jsou krátký seznam českých mužských jmen.
 */
export function accusativeOf(name: string): string {
  if (name.endsWith('a')) return `${name.slice(0, -1)}u`;
  if (name.endsWith('něk')) return `${name.slice(0, -3)}ňka`;
  if (name.endsWith('ek')) return `${name.slice(0, -2)}ka`;
  if (/[eiyouáéíóúůý]$/i.test(name)) return name;
  if (/[šžčřcjďťň]$/i.test(name)) return `${name}e`;
  return `${name}a`;
}

function stringOf(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function textOf(n: PlayerNotice): string {
  switch (n.kind) {
    case 'invite-accepted':
      return `${nameOf(n.payload)} přijal pozvánku – je tvým vazalem.`;
    case 'invitee-played':
      return `${nameOf(n.payload)} se rozehrál.`;
    case 'negotiation-offer':
      return `${otherName(n.payload)} ti poslal návrh dohody.`;
    case 'negotiation-counter':
      return `${otherName(n.payload)} poslal protinávrh.`;
    case 'negotiation-accepted':
      return `${otherName(n.payload)} přijal dohodu.`;
    case 'negotiation-rejected':
      return `${otherName(n.payload)} odmítl tvůj návrh.`;
    case 'negotiation-withdrawn':
      return `${otherName(n.payload)} stáhl svůj návrh.`;
    case 'blocked':
      return `${otherName(n.payload)} tě zablokoval.`;
    case 'player-succession': {
      const dead = stringOf(n.payload.deadName) ?? 'Tvůj muž';
      const next = stringOf(n.payload.newName);
      return `${dead} zemřel. Hraješ za ${next === null ? 'dalšího muže rodu' : accusativeOf(next)}.`;
    }
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

/**
 * Chce klient v odpovědi dotazu na ves i upozornění mezi hráči? `{ withNotices: true }` ve vstupu
 * `getVillageView`; `playerId` ze vstupu se nečte (hráč je jen ze session).
 */
export function wantsPlayerNotices(input: unknown): boolean {
  return typeof input === 'object' && input !== null && 'withNotices' in input
    ? input.withNotices === true
    : false;
}

/** Výsledek dotazu na ves s doručenými upozorněními (jen když o ně klient požádal). */
export type WithPlayerNotices<T> = T & { playerNotices?: PlayerNotice[] };
