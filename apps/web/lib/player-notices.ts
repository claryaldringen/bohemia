import {
  dateOfDayIndex,
  type LevyPart,
  type PlayerNotice,
  type PlayerNoticeKind,
} from '@bohemia/game';
import { formatGameDate } from './game-date';
import { LEVY_UNITS } from './levy-labels';
import type { NoticeLine } from '@/components/game/hud/NoticeLines';

// Upozornění mezi hráči (`docs/code/world.md` – Upozornění mezi hráči): server je drží v tabulce
// `player_notice`, klient si je vyzvedává při dotazování na ves a ukáže jako řádky nahoře
// uprostřed vedle upozornění vsi. Čistý modul – smí do prohlížeče.

/** Nejvýš tolik upozornění naráz (jedna odpověď dotazu). */
export const NOTICE_BATCH = 20;

/** Panel, který upozornění otevírá. „Rod a vazalové“ vznikne v úloze 1.10; dál přibudou další. */
export type NoticePanel = 'house' | 'levy' | 'war';

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
    case 'vassalage-renounced':
    case 'levy-sent':
    case 'complaint-filed':
    case 'complaint-answered':
    case 'judgment-given':
      return 'house';
    case 'war-declared':
    case 'protection-ending':
    case 'campaign-returned':
    case 'campaign-disbanded':
    case 'foreign-army':
      return 'war';
    case 'levy-pending':
      return 'levy';
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

/** Věta o rozsudku pána podle druhu a strany sporu (obžalovaný / žalobce). */
function judgmentLine(payload: Record<string, unknown>): string {
  const lord = stringOf(payload.lordName) ?? 'Pán';
  const defendant = payload.asDefendant === true;
  switch (payload.verdict) {
    case 'compensation':
      return defendant
        ? `${lord} ti uložil náhradu zbožím – čeká odeslání.`
        : `${lord} ti přiznal náhradu zbožím.`;
    case 'return-people':
      return defendant
        ? `${lord} ti uložil vrátit lidi – čeká odeslání.`
        : `${lord} ti přiznal vrácení lidí.`;
    case 'peace':
      return `${lord} rozsoudil mír mezi tebou a ${stringOf(payload.otherName) ?? 'druhým vazalem'}.`;
    default:
      return defendant ? `${lord} žalobu zamítl.` : `${lord} tvou žalobu zamítl.`;
  }
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
    case 'complaint-filed':
      return `${otherName(n.payload)} žaluje ${accusativeOf(stringOf(n.payload.otherName) ?? 'jiného vazala')}.`;
    case 'complaint-answered':
      return `${otherName(n.payload)} se vyjádřil ke sporu.`;
    case 'judgment-given':
      return judgmentLine(n.payload);
    case 'war-declared':
      return `${otherName(n.payload)} opověděl válku.`;
    case 'protection-ending':
      return 'Ochrana končí za 1 den.';
    case 'campaign-returned':
      return n.payload.reason === 'supplies'
        ? 'Vojsko se vrátilo – došlo jídlo.'
        : 'Vojsko se vrátilo domů.';
    case 'campaign-disbanded':
      return 'Výprava se rozpadla.';
    case 'foreign-army':
      // jméno vsi se neskloňuje (2. pád jmen vsí nejde spolehlivě odvodit) – „u vsi Kněžice“
      return `Cizí vojsko u vsi ${stringOf(n.payload.name) ?? ''}!`.replace(' !', '!');
    case 'vassalage-renounced': {
      const lord = stringOf(n.payload.lordName) ?? 'Pán';
      const vassal = stringOf(n.payload.vassalName) ?? 'Vazal';
      return `Vazalství mezi ${lord} (pán) a ${vassal} (vazal) skončilo vypovězením.`;
    }
    case 'levy-pending': {
      const lord = stringOf(n.payload.lordName) ?? 'pánovi';
      const years = typeof n.payload.years === 'number' ? n.payload.years : 1;
      if (n.payload.loan === true) return `Čas splátky – ${lord} čeká splátku půjčky.`;
      if (n.payload.trade === true) return `Obchod s ${lord} – čeká odeslání zboží.`;
      if (n.payload.peace === true) return `Mír s ${lord} – čeká odeslání zboží.`;
      return years > 1
        ? `Odvody pánu ${lord} čekají už ${years} roky.`
        : `Čas odvodů – pán ${lord} čeká dávku.`;
    }
    case 'levy-sent': {
      const vassal = stringOf(n.payload.vassalName) ?? 'Vazal';
      const parts = Array.isArray(n.payload.parts) ? (n.payload.parts as LevyPart[]) : [];
      const what = parts.map((p) => `${p.sent} ${LEVY_UNITS[p.good] ?? p.good}`).join(', ');
      const day = typeof n.payload.arrivesDay === 'number' ? n.payload.arrivesDay : null;
      const when = day === null ? '' : ` Dorazí ${formatGameDate(dateOfDayIndex(day))}.`;
      const message = stringOf(n.payload.message);
      const noun =
        n.payload.trade === true
          ? 'zboží z obchodu'
          : n.payload.loan === true
            ? 'splátku půjčky'
            : 'odvod';
      const short =
        n.payload.trade === true && n.payload.short === true ? ' Míň, než bylo domluveno.' : '';
      return (
        `${vassal} ti posílá ${noun}${what === '' ? ' – tentokrát nic' : `: ${what}`}.${when}${short}` +
        (message === null ? '' : ` Vzkaz: „${message}“`)
      );
    }
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

/**
 * Odpověď hráči, který ještě nemá ves (jen sídlo), když žádá upozornění: místo `null` nese jen
 * doručená upozornění, aby mu nepropadla, dokud ves nezaloží.
 */
export interface VillageNone {
  noVillage: true;
}

/** Je výsledek dotazu odpovědí „hráč nemá ves“ s upozorněními? */
export function isVillageNone(result: unknown): result is WithPlayerNotices<VillageNone> {
  return typeof result === 'object' && result !== null && 'noVillage' in result;
}

/** Výsledek dotazu na ves s doručenými upozorněními (jen když o ně klient požádal). */
export type WithPlayerNotices<T> = T & { playerNotices?: PlayerNotice[] };
