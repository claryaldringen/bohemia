import type { AbandonedStructure, HerdSpecies, HungerLevel, NewcomerGroup } from '@bohemia/game';
import { DIRECTION_NAMES, NEWCOMER_TEXTS } from './trade-names';
import { formatAnimals, formatInteger } from './village-format';
import { productList, type VillageView } from './village-view';

// Upozornění vsi (population.md – Co hráč vidí): rodina čeká na dům, ves šetří jídlem, hladoví,
// lidé umírají hlady – vždy jen nejvyšší stupeň (Hlad a vymření), stavby stojí, hřbitov je plný (cemetery.md), vesničané ušetřili posvátný dub
// nebo dubový háj (happiness.md – jen když přibude), kovář nemá uhlí a dílna nemá co kácet
// (crafts.md), tesař nemá klády, vyrobil vůz, vůz dosloužil, šel pro kování a přinesl ho
// (wagons.md), svatba mezi domy (population.md – Sňatky mezi domy, když přibude), podzimní porážka,
// nouzová porážka, zkažené maso a zimní úhyn stáda (diet.md), spřežení volů – vycvičené, dosloužilo, vůl uhynul pro
// nedostatek sena (oxen.md) –, vesničané obnovují starý sad a starý sad dosloužil (orchard.md –
// Obnova sadu), posvátný dub uschl a posvátná souš padla (happiness.md), nevěsta a ženich z okolí
// a dcera vdaná pryč (kinship.md – Sňatky z okolí), lidé od souseda – rodina, muž, žena (trade.md – Výměna
// lidí), opuštěná modla padla, svatyně, plot hřbitova či ohrada
// se rozpadly a vesničané je opravili (abandonment.md – Oprava) – nové události kroniky. Vymřelá
// ves žádná nemá. Odvozují se z pohledu na ves a ukážou se jednou, když nově vzniknou – jako
// krátký mizející řádek nahoře uprostřed (jako oznámení v 0 A.D.). Jen fakt, žádná rada.

export type NoticeKind =
  | 'full-household'
  /** Stádo se na noc nevejde do ohrad svého druhu (oxen.md – Ohrady podle druhu). */
  | 'pen-short'
  /** Stupně hladu (population.md – Co hráč vidí): šetří jídlem, hladoví, umírají hlady. */
  | 'rationing'
  | 'hungry'
  | 'starving'
  | 'stalled'
  | 'cemetery-full'
  | 'no-charcoal'
  /** Kovář nemá rudu a není kde ji kopat (crafts.md – Uhlí a ruda kováře). */
  | 'no-ore'
  | 'no-wood'
  /** Tesař (wagons.md): nemá klády ani co kácet, vyrobil vůz, vůz dosloužil. */
  | 'carpenter-no-wood'
  | 'cart-made'
  | 'cart-worn-out'
  /** Ves nemá kováře – tesař šel pro kování k vozu, přinesl ho (wagons.md – Kování vozů). */
  | 'iron-trip'
  | 'iron-brought'
  /** Vesničané koupili výrobky řemeslníků u souseda (crafts.md – Nákup u sousedů). */
  | 'crafts-bought'
  | 'sacred-oak'
  | 'sacred-grove'
  | 'sacred-oak-died'
  | 'sacred-snag-fell'
  | 'marriage'
  | 'slaughter'
  /** Výhled jídla nevycházel – vesničané porazili zvířata navíc (diet.md – Nouzová porážka). */
  | 'emergency-slaughter'
  | 'meat-spoiled'
  /** Lnu na oděv všech je málo (fields.md – Len, diet.md – Oděv). */
  | 'linen-short'
  | 'herd-starved'
  /** Ovcí je málo na vlnu pro oděv všech (diet.md – Oděv). */
  | 'wool-short'
  | 'team-ready'
  | 'team-retired'
  | 'ox-died'
  | 'orchard-renewal'
  | 'orchard-gone'
  | 'bride-from-outside'
  /** K ženě se přiženil muž z okolí (kinship.md – Sňatky z okolí, Martin 19. 10. 2026). */
  | 'groom-from-outside'
  | 'married-away'
  | 'part-forest'
  /** Zemská stezka a obchod se sousedy (trade.md). */
  | 'trail-built'
  | 'trade-departed'
  | 'trade-returned'
  /** S výpravou přišli lidé od souseda (trade.md – Výměna lidí). */
  | 'newcomer-family'
  | 'newcomer-man'
  | 'newcomer-woman'
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
  | 'other-rationing'
  | 'other-hungry'
  | 'other-starving'
  | 'other-extinct';

export interface VillageNotice {
  kind: NoticeKind;
  /** info = zpráva, warn = problém. */
  tone: 'info' | 'warn';
  text: string;
}

/**
 * Stupně hladu (population.md – Co hráč vidí): ves šetří jídlem (ubírá z přídělu, jí se 90–100 % –
 * mírně, jako zpráva), hladoví (pod 90 % – od té hranice se sčítá hlad), lidé umírají hlady.
 */
const HUNGER_NOTICES: Record<Exclude<HungerLevel, 'fed'>, VillageNotice> = {
  rationing: { kind: 'rationing', tone: 'info', text: 'Ves šetří jídlem' },
  hungry: { kind: 'hungry', tone: 'warn', text: 'Ves hladoví' },
  starving: { kind: 'starving', tone: 'warn', text: 'Lidé umírají hlady' },
};

/** Totéž z jiné vsi hráče – krátký řádek se jménem vsi. */
const OTHER_HUNGER_NOTICES: Record<
  Exclude<HungerLevel, 'fed'>,
  { kind: NoticeKind; tone: VillageNotice['tone']; text: string }
> = {
  rationing: { kind: 'other-rationing', tone: 'info', text: 'ves šetří jídlem' },
  hungry: { kind: 'other-hungry', tone: 'warn', text: 'ves hladoví' },
  starving: { kind: 'other-starving', tone: 'warn', text: 'lidé umírají hlady' },
};

/** Pořadí stupňů hladu – vyšší je horší. */
const HUNGER_RANK: Record<HungerLevel, number> = { fed: 0, rationing: 1, hungry: 2, starving: 3 };

/** Je stupeň hladu `next` horší než `before`? */
function worse(next: HungerLevel, before: HungerLevel): boolean {
  return HUNGER_RANK[next] > HUNGER_RANK[before];
}

/** Stádo, které se nevejde do ohrad (upozornění „Ovce se nevejdou do ohrad“). */
const PEN_SHORT_NAMES: Record<HerdSpecies, string> = {
  sheep: 'Ovce',
  goat: 'Kozy',
  pig: 'Prasata',
  cow: 'Krávy',
};

/** Upozornění, která pro ves právě platí (pořadí: problémy, pak zprávy). */
export function villageNotices(view: VillageView): VillageNotice[] {
  const notices: VillageNotice[] = [];
  if (view.extinct) return notices;
  if (view.hunger !== 'fed') notices.push(HUNGER_NOTICES[view.hunger]);
  if (view.constructionsStalled) {
    notices.push({ kind: 'stalled', tone: 'warn', text: 'Stavby stojí' });
  }
  // aspoň jeden hotový hřbitov a žádný hotový nemá volné místo (rozestavěný mrtvé nepřijme)
  const built = view.cemeteries.filter((c) => c.built);
  if (built.length > 0 && built.every((c) => c.freePlaces === 0)) {
    notices.push({ kind: 'cemetery-full', tone: 'warn', text: 'Hřbitov je plný' });
  }
  // dílny bez vstupu stojí (crafts.md)
  if (view.crafts.workshops.some((w) => w.activity === 'no-charcoal')) {
    notices.push({ kind: 'no-charcoal', tone: 'warn', text: 'Kovář nemá uhlí' });
  }
  if (view.crafts.workshops.some((w) => w.activity === 'no-ore')) {
    notices.push({ kind: 'no-ore', tone: 'warn', text: 'Kovář nemá rudu' });
  }
  if (view.crafts.workshops.some((w) => w.activity === 'no-wood' && w.craft !== 'carpenter')) {
    notices.push({ kind: 'no-wood', tone: 'warn', text: 'Dílna nemá co kácet' });
  }
  // tesař bez klád na hromadě a bez stromů ke kácení (wagons.md)
  if (view.crafts.workshops.some((w) => w.activity === 'no-wood' && w.craft === 'carpenter')) {
    notices.push({ kind: 'carpenter-no-wood', tone: 'warn', text: 'Tesař nemá klády' });
  }
  // rodina, která smí odejít, nemá kam (dřív „Domácnost je plná“ – od 19. 10. 2026 smí ženatý pár
  // odejít i z neplného domu, kinship.md – Lidé k osídlení)
  if (view.fullHousehold) {
    notices.push({ kind: 'full-household', tone: 'info', text: 'Rodina čeká na dům' });
  }
  // stádo se nevejde do ohrad – nadbytek půjde při porážce na maso (oxen.md – Ohrady podle druhu)
  const short = view.penShort ?? [];
  if (short.length > 0) {
    const text =
      short.length === 1
        ? `${PEN_SHORT_NAMES[short[0]!]} se nevejdou do ohrad`
        : 'Stáda se nevejdou do ohrad';
    notices.push({ kind: 'pen-short', tone: 'warn', text });
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
    } else if (village.hunger !== 'fed' && worse(village.hunger, before.hunger)) {
      // jen když se hlad v té vsi zhoršil – zlepšení se neohlašuje
      const notice = OTHER_HUNGER_NOTICES[village.hunger];
      notices.push({ ...notice, text: `${village.name}: ${notice.text}` });
    }
  }
  return notices;
}

/** Upozornění na hlad – ohlašují se jen, když se hlad zhorší (o stupeň a víc). */
const HUNGER_KINDS: ReadonlySet<NoticeKind> = new Set(
  Object.values(HUNGER_NOTICES).map((n) => n.kind),
);

/** Nová upozornění vsi samotné mezi dvěma jejími pohledy. */
function ownNotices(previous: VillageView, next: VillageView): VillageNotice[] {
  const before = new Set(villageNotices(previous).map((n) => n.kind));
  const notices = villageNotices(next).filter(
    (n) => !before.has(n.kind) && !HUNGER_KINDS.has(n.kind),
  );
  if (!next.extinct && next.hunger !== 'fed' && worse(next.hunger, previous.hunger)) {
    notices.unshift(HUNGER_NOTICES[next.hunger]);
  }
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
  // výhled jídla do sklizně nevycházel – ves porazila zvířata navíc (diet.md – Nouzová porážka)
  'emergency-slaughter': (entry) => {
    const animals = entry.animals ? formatAnimals(entry.animals) : '';
    return {
      kind: 'emergency-slaughter',
      tone: 'info',
      text:
        animals !== '' ? `Vesničané porazili ${animals} navíc` : 'Vesničané porazili dobytek navíc',
    };
  },
  // zbytek uzeného masa se do žní nesnědl, přes zimu chybělo seno (diet.md)
  'meat-spoiled': (entry) => ({
    kind: 'meat-spoiled',
    tone: 'warn',
    text:
      entry.kg !== undefined
        ? `Maso se zkazilo – ${formatInteger(entry.kg)} kg`
        : 'Maso se zkazilo',
  }),
  // len z trhání nestačí na plátno pro všechny (fields.md – Len)
  'linen-short': () => ({ kind: 'linen-short', tone: 'warn', text: 'Chybí len na oděv' }),
  'herd-starved': () => ({
    kind: 'herd-starved',
    tone: 'warn',
    text: 'Dobytek hynul – chybělo seno',
  }),
  // ovcí přes zimu méně, než je třeba na vlnu pro oděv všech (diet.md – Oděv)
  'wool-short': () => ({ kind: 'wool-short', tone: 'warn', text: 'Chybí vlna na oděv' }),
  'team-ready': () => ({ kind: 'team-ready', tone: 'info', text: 'Spřežení je vycvičené' }),
  'bride-from-outside': () => ({
    kind: 'bride-from-outside',
    tone: 'info',
    text: 'Nevěsta z okolí',
  }),
  'groom-from-outside': () => ({
    kind: 'groom-from-outside',
    tone: 'info',
    text: 'Ženich z okolí',
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
  // vozy od tesaře (wagons.md – Vůz)
  'cart-made': () => ({ kind: 'cart-made', tone: 'info', text: 'Tesař vyrobil vůz' }),
  'cart-worn-out': () => ({ kind: 'cart-worn-out', tone: 'warn', text: 'Vůz dosloužil' }),
  // kování vozů (wagons.md) – jen fakt: kdo šel a kam, kdo přinesl
  'iron-trip': (entry) => ({
    kind: 'iron-trip',
    tone: 'info',
    text: `${entry.son ? 'Syn tesaře šel' : 'Tesař šel'} pro kování k vozu do vsi ${entry.place ?? ''}${
      entry.direction ? ` (${DIRECTION_NAMES[entry.direction].name})` : ''
    }`,
  }),
  'iron-brought': (entry) => ({
    kind: 'iron-brought',
    tone: 'info',
    text: `${entry.son ? 'Syn tesaře přinesl' : 'Tesař přinesl'} kování`,
  }),
  // nákup u sousedů (crafts.md) – jen fakt: co a u koho
  'crafts-bought': (entry) => ({
    kind: 'crafts-bought',
    tone: 'info',
    text: `Vesničané koupili ${productList(entry.products ?? [])} u souseda${
      entry.direction ? ` (${DIRECTION_NAMES[entry.direction].name})` : ''
    }`,
  }),
  // lidé od souseda (trade.md – Výměna lidí) – fakt, odkud přišli
  newcomer: (entry) => newcomerNotice(entry.group ?? 'family', entry),
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

/** Krátký řádek „Přišla rodina ze severu“ (trade.md – Výměna lidí). */
function newcomerNotice(group: NewcomerGroup, entry: ChronicleEntry): VillageNotice {
  const from = entry.direction ? ` ${DIRECTION_NAMES[entry.direction].from}` : '';
  return {
    kind: `newcomer-${group}`,
    tone: 'info',
    text: `${NEWCOMER_TEXTS[group].notice}${from}`,
  };
}

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
