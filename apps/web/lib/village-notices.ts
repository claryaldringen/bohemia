import type { AbandonedStructure } from '@bohemia/game';
import { formatInteger } from './village-format';
import type { VillageView } from './village-view';

// Upozornění vsi (population.md – Co hráč vidí): plná domácnost, ves hladoví, lidé umírají hlady
// (Hlad a vymření), stavby stojí, hřbitov je plný (cemetery.md), vesničané ušetřili posvátný dub
// nebo dubový háj (happiness.md – jen když přibude), kovář nemá uhlí a dílna nemá co kácet
// (crafts.md), svatba mezi domy (population.md – Sňatky mezi domy, když přibude), podzimní porážka,
// zkažené maso a zimní úhyn stáda (diet.md), spřežení volů – vycvičené, dosloužilo, vůl uhynul pro
// nedostatek sena (oxen.md) –, vesničané obnovují starý sad a starý sad dosloužil (orchard.md –
// Obnova sadu), posvátný dub uschl a posvátná souš padla (happiness.md), nevěsta z okolí a dcera
// vdaná pryč (kinship.md – Sňatky z okolí), opuštěná modla padla, svatyně, plot hřbitova či ohrada
// se rozpadly a vesničané je opravili (abandonment.md – Oprava) – nové události kroniky. Vymřelá
// ves žádná nemá. Odvozují se z pohledu na ves a ukážou se jednou, když nově vzniknou – jako
// krátký mizející řádek nahoře uprostřed (jako oznámení v 0 A.D.). Jen fakt, žádná rada.

export type NoticeKind =
  | 'full-household'
  | 'hungry'
  | 'starving'
  | 'stalled'
  | 'cemetery-full'
  | 'no-charcoal'
  | 'no-wood'
  | 'sacred-oak'
  | 'sacred-grove'
  | 'sacred-oak-died'
  | 'sacred-snag-fell'
  | 'marriage'
  | 'slaughter'
  | 'meat-spoiled'
  | 'herd-starved'
  | 'team-ready'
  | 'team-retired'
  | 'ox-died'
  | 'orchard-renewal'
  | 'orchard-gone'
  | 'bride-from-outside'
  | 'married-away'
  | 'part-forest'
  /** Zemská stezka a obchod se sousedy (trade.md). */
  | 'trail-built'
  | 'trade-departed'
  | 'trade-returned'
  /** Opuštěná stavba spadla (abandonment.md). */
  | 'idol-fell'
  | 'shrine-fell'
  | 'cemetery-fence-fell'
  | 'pen-fell'
  /** Vesničané opravili stavbu, ke které se zase chodí (abandonment.md – Oprava). */
  | 'idol-repaired'
  | 'shrine-repaired'
  | 'cemetery-fence-repaired'
  | 'pen-repaired'
  /** Upozornění z jiné vsi hráče (migration.md – Víc vsí jednoho hráče). */
  | 'other-hungry'
  | 'other-starving'
  | 'other-extinct';

export interface VillageNotice {
  kind: NoticeKind;
  /** info = zpráva, warn = problém. */
  tone: 'info' | 'warn';
  text: string;
}

/** Upozornění, která pro ves právě platí (pořadí: problémy, pak zprávy). */
export function villageNotices(view: VillageView): VillageNotice[] {
  const notices: VillageNotice[] = [];
  if (view.extinct) return notices;
  if (view.starving) notices.push({ kind: 'starving', tone: 'warn', text: 'Lidé umírají hlady' });
  if (view.hungry) notices.push({ kind: 'hungry', tone: 'warn', text: 'Ves hladoví' });
  if (view.constructionsStalled) {
    notices.push({ kind: 'stalled', tone: 'warn', text: 'Stavby stojí' });
  }
  // aspoň jeden hotový hřbitov a žádný hotový nemá volný hrob (rozestavěný mrtvé nepřijme)
  const built = view.cemeteries.filter((c) => c.built);
  if (built.length > 0 && built.every((c) => c.freeGraves === 0)) {
    notices.push({ kind: 'cemetery-full', tone: 'warn', text: 'Hřbitov je plný' });
  }
  // dílny bez vstupu stojí (crafts.md)
  if (view.crafts.workshops.some((w) => w.activity === 'no-charcoal')) {
    notices.push({ kind: 'no-charcoal', tone: 'warn', text: 'Kovář nemá uhlí' });
  }
  if (view.crafts.workshops.some((w) => w.activity === 'no-wood')) {
    notices.push({ kind: 'no-wood', tone: 'warn', text: 'Dílna nemá co kácet' });
  }
  if (view.fullHousehold) {
    notices.push({ kind: 'full-household', tone: 'info', text: 'Domácnost je plná' });
  }
  return notices;
}

/**
 * Upozornění, která mezi dvěma pohledy na ves nově vznikla (dřív neplatila). Bez předchozího
 * pohledu (první načtení) žádná; po přepnutí na jinou ves (jiné id) také žádná – porovnává se ves
 * sama se sebou. Přidá i upozornění z ostatních vsí hráče (`otherVillageNotices`).
 */
export function newNotices(previous: VillageView | null, next: VillageView): VillageNotice[] {
  if (previous === null || previous.id !== next.id) return [];
  return [...ownNotices(previous, next), ...otherVillageNotices(previous, next)];
}

/**
 * Upozornění z jiných vsí hráče (migration.md – návrh Clauda): hlad, vymírání hladem a vymření –
 * krátký řádek se jménem vsi, jen když u té vsi nově vzniklo.
 */
export function otherVillageNotices(previous: VillageView, next: VillageView): VillageNotice[] {
  const notices: VillageNotice[] = [];
  for (const village of next.villages) {
    if (village.id === next.id) continue;
    const before = previous.villages.find((v) => v.id === village.id);
    if (!before) continue;
    if (village.extinct && !before.extinct) {
      notices.push({ kind: 'other-extinct', tone: 'warn', text: `${village.name}: ves vymřela` });
    } else if (village.starving && !before.starving) {
      notices.push({
        kind: 'other-starving',
        tone: 'warn',
        text: `${village.name}: lidé umírají hlady`,
      });
    } else if (village.hungry && !before.hungry) {
      notices.push({ kind: 'other-hungry', tone: 'warn', text: `${village.name}: ves hladoví` });
    }
  }
  return notices;
}

/** Nová upozornění vsi samotné mezi dvěma jejími pohledy. */
function ownNotices(previous: VillageView, next: VillageView): VillageNotice[] {
  const before = new Set(villageNotices(previous).map((n) => n.kind));
  const notices = villageNotices(next).filter((n) => !before.has(n.kind));
  // posvátná místa vznikají jednou – fakt, když přibudou (happiness.md)
  if (next.sacred.oaks.length > previous.sacred.oaks.length) {
    notices.push({ kind: 'sacred-oak', tone: 'info', text: 'Vesničané ušetřili posvátný dub' });
  }
  if (next.sacred.groves.length > previous.sacred.groves.length) {
    notices.push({ kind: 'sacred-grove', tone: 'info', text: 'Vesničané ušetřili dubový háj' });
  }
  // svatba mezi domy – fakt, když od minulého pohledu přibude (population.md); den poslední svatby
  // nese pohled zvlášť, takže ji nevytlačí ani hodně jiných událostí kroniky
  const married = next.lastMarriageDay;
  if (!next.extinct && married !== null && married > (previous.lastMarriageDay ?? -Infinity)) {
    notices.push({ kind: 'marriage', tone: 'info', text: 'Svatba' });
  }
  notices.push(...chronicleNotices(previous, next));
  return notices;
}

/**
 * Události kroniky, které se ohlásí jako fakt (diet.md, oxen.md, orchard.md – Obnova sadu,
 * fields.md – Zarůstání) – nejvýš jednou za druh.
 */
type ChronicleEntry = VillageView['chronicle'][number];

const CHRONICLE_NOTICES: Partial<
  Record<ChronicleEntry['kind'], (entry: ChronicleEntry) => VillageNotice>
> = {
  slaughter: (entry) => ({
    kind: 'slaughter',
    tone: 'info',
    text:
      entry.kg !== undefined
        ? `Podzimní porážka – ${formatInteger(entry.kg)} kg masa`
        : 'Podzimní porážka',
  }),
  // zbytek uzeného masa se do žní nesnědl, přes zimu chybělo seno (diet.md)
  'meat-spoiled': (entry) => ({
    kind: 'meat-spoiled',
    tone: 'warn',
    text:
      entry.kg !== undefined
        ? `Maso se zkazilo – ${formatInteger(entry.kg)} kg`
        : 'Maso se zkazilo',
  }),
  'herd-starved': () => ({
    kind: 'herd-starved',
    tone: 'warn',
    text: 'Dobytek hynul – chybělo seno',
  }),
  'team-ready': () => ({ kind: 'team-ready', tone: 'info', text: 'Spřežení je vycvičené' }),
  'bride-from-outside': () => ({
    kind: 'bride-from-outside',
    tone: 'info',
    text: 'Nevěsta z okolí',
  }),
  'married-away': () => ({ kind: 'married-away', tone: 'info', text: 'Dcera se vdala pryč' }),
  'team-retired': () => ({ kind: 'team-retired', tone: 'info', text: 'Spřežení dosloužilo' }),
  'ox-died': () => ({ kind: 'ox-died', tone: 'warn', text: 'Vůl uhynul – chybělo seno' }),
  'orchard-renewal-started': () => ({
    kind: 'orchard-renewal',
    tone: 'info',
    text: 'Vesničané obnovují starý sad',
  }),
  'orchard-gone': () => ({ kind: 'orchard-gone', tone: 'warn', text: 'Starý sad dosloužil' }),
  // zemská stezka a výpravy k sousedům (trade.md – Kronika)
  'trail-built': () => ({ kind: 'trail-built', tone: 'info', text: 'Zemská stezka je dostavěná' }),
  'trade-departed': () => ({ kind: 'trade-departed', tone: 'info', text: 'Výprava vyrazila' }),
  'trade-returned': () => ({ kind: 'trade-returned', tone: 'info', text: 'Výprava se vrátila' }),
  // nepasený příloh zarostl lesem a vypadl z pole (fields.md – Zarůstání)
  'part-became-forest': () => ({
    kind: 'part-forest',
    tone: 'warn',
    text: 'Nepasené pole zarostlo lesem',
  }),
  // posvátný dub stářím uschl, posvátná souš padla (happiness.md – Posvátný dub)
  'sacred-oak-died': () => ({
    kind: 'sacred-oak-died',
    tone: 'warn',
    text: 'Posvátný dub uschl',
  }),
  'sacred-snag-fell': () => ({
    kind: 'sacred-snag-fell',
    tone: 'warn',
    text: 'Posvátná souš padla',
  }),
  // opuštěná stavba spadla (abandonment.md) – fakt podle stavby
  'structure-fell': (entry) => STRUCTURE_FELL_NOTICES[entry.structure ?? 'idol'],
  // vesničané opravili stavbu, ke které se zase chodí (abandonment.md – Oprava)
  'structure-repaired': (entry) => STRUCTURE_REPAIRED_NOTICES[entry.structure ?? 'idol'],
};

/** Krátké řádky k pádu opuštěné stavby (abandonment.md – Následky). */
const STRUCTURE_FELL_NOTICES: Record<AbandonedStructure, VillageNotice> = {
  idol: { kind: 'idol-fell', tone: 'warn', text: 'Modla padla' },
  shrine: { kind: 'shrine-fell', tone: 'warn', text: 'Svatyně se rozpadla' },
  'cemetery-fence': {
    kind: 'cemetery-fence-fell',
    tone: 'warn',
    text: 'Plot hřbitova se rozpadl',
  },
  pen: { kind: 'pen-fell', tone: 'warn', text: 'Ohrada se rozpadla' },
};

/** Krátké řádky k opravené stavbě (abandonment.md – Oprava). */
const STRUCTURE_REPAIRED_NOTICES: Record<AbandonedStructure, VillageNotice> = {
  idol: { kind: 'idol-repaired', tone: 'info', text: 'Modla opravena' },
  shrine: { kind: 'shrine-repaired', tone: 'info', text: 'Svatyně opravena' },
  'cemetery-fence': {
    kind: 'cemetery-fence-repaired',
    tone: 'info',
    text: 'Plot hřbitova opraven',
  },
  pen: { kind: 'pen-repaired', tone: 'info', text: 'Ohrada opravena' },
};

/** Nové události kroniky od předchozího pohledu (den po něm), které se ohlásí jako fakt. */
function chronicleNotices(previous: VillageView, next: VillageView): VillageNotice[] {
  if (next.extinct) return [];
  const seen = new Set<NoticeKind>();
  const notices: VillageNotice[] = [];
  // kronika je od nejnovější – ohlásí se v pořadí, jak se staly
  for (const entry of [...next.chronicle].reverse()) {
    if (entry.day <= previous.dayIndex) continue;
    const notice = CHRONICLE_NOTICES[entry.kind]?.(entry);
    if (!notice || seen.has(notice.kind)) continue;
    seen.add(notice.kind);
    notices.push(notice);
  }
  return notices;
}
