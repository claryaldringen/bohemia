import type {
  AbandonedStructure,
  Craft,
  HerdSpecies,
  HungerLevel,
  NewcomerGroup,
  WorkshopActivity,
} from '@bohemia/game';
import { DIRECTION_NAMES, NEWCOMER_TEXTS } from './trade-names';
import { fromVillage, toVillage } from './village-name-cases';
import { formatAnimals, formatInteger } from './village-format';
import { ironTripWho, productList, type VillageView } from './village-view';
import { disasterNotices, weatherNotices, type DisasterNoticeKind } from './disasters-view';

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
// se rozpadly a vesničané je opravili (abandonment.md – Oprava) – nové události kroniky; před žněmi
// ves bez humna, snopy čekají na humno, nouzový výmlat a humno nestačí (production-chains.md –
// Humno), kupci přijeli – za každý příjezd, s ikonou kupců (markets.md – Rozhodnutí plánu 4,
// bod 5). Vymřelá ves žádná nemá. Odvozují se z pohledu na ves a ukážou se jednou, když nově
// vzniknou – jako krátký mizející řádek nahoře uprostřed (jako oznámení v 0 A.D.). Jen fakt, žádná
// rada – kromě humna („Před žněmi postav humno“): bez něj ves nemlátí a nesmí zahynout hladem jen
// proto, že hráč o humnu nevěděl (production-chains.md – anti-cíl). Trvalé stavy (hlad, stavby
// stojí, dílny bez vstupu, ohrady, koně a psi bez obilí, výmlat) mají podmínky v jádře
// (`lastingNotices` – pohled je skládá z týchž funkcí) a simulace je zapisuje i do kroniky
// (absence.md – Upozornění vsi do kroniky; texty `notice-chronicle.ts`).

export type NoticeKind =
  | 'full-household'
  /** Stádo se na noc nevejde do ohrad svého druhu (oxen.md – Ohrady podle druhu). */
  | 'pen-short'
  /** Ves chce víc volů, než se vejde do ohrad volů (oxen.md – Kolik volů ves chce). */
  | 'oxen-short'
  /**
   * Výmlat (production-chains.md – Humno): měsíc před žní ves bez humna, snopy čekají na humno,
   * starší ves mlátí nouzově na udusané zemi, humno nestačí.
   */
  | 'emergency-threshing'
  | 'threshing-floor-short'
  /** Stupně hladu (population.md – Co hráč vidí): šetří jídlem, hladoví, umírají hlady. */
  | 'rationing'
  | 'hungry'
  | 'starving'
  | 'stalled'
  | 'cemetery-full'
  | 'no-charcoal'
  /** Kovář nemá rudu a není kde ji kopat (crafts.md – Uhlí a ruda kováře). */
  | 'no-ore'
  /** Hrnčíř nemá hlínu a není kde ji kopat (crafts.md – Hlína hrnčíře). */
  | 'no-clay'
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
  /** Ves nemá osivo na setí nutných dílů a koupit ho nemohla (fields.md – Osivo pro ves bez zásob). */
  | 'seed-short'
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
  | 'hay-slaughter'
  /** Ovcí je málo na vlnu pro oděv všech (diet.md – Oděv). */
  | 'wool-short'
  | 'team-ready'
  | 'team-retired'
  | 'ox-died'
  /** Koně (horses.md – Co hráč vidí): bez obilí, nevejdou se do ohrady, hříbě, vycvičení, dosloužili, uhynuli. */
  | 'horses-ungrained'
  | 'horses-short'
  | 'foal-born'
  | 'horses-arrived'
  | 'horse-trained'
  | 'horse-retired'
  /** Divoká zvěř (wildlife.md – Co hráč vidí): prasata ničí úrodu, vlci strhávají dobytek, psi bez obilí. */
  | 'boar-damage'
  | 'wolves-killing'
  | 'dogs-ungrained'
  | 'horse-starved'
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
  /** Výprava na trh se vrátila (markets.md – Pravidla 3). */
  | 'market-returned'
  /** Z tažení přivedli otroky nebo křesťany (markets.md – Rozhodnutí plánu 5, bod 1). */
  | 'led-settled'
  /** Na trh vlastní vsi přijeli cizí kupci – za každý příjezd (markets.md – Rozhodnutí plánu 4, bod 5). */
  | 'merchants-arrived'
  /** S výpravou přišli lidé od souseda (trade.md – Výměna lidí). */
  | 'newcomer-family'
  | 'newcomer-man'
  | 'newcomer-woman'
  /** Z trhu přišel otrok (markets.md – Rozhodnutí plánu 5, bod 6). */
  | 'newcomer-slave'
  /** Vrátili se lidé, které ves prodala (markets.md – Rozhodnutí plánu 3, bod 13). */
  | 'newcomer-back-family'
  | 'newcomer-back-man'
  | 'newcomer-back-woman'
  | 'newcomer-back-slave'
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
  | 'other-extinct'
  /** Humno z jiné vsi hráče (production-chains.md – Humno). */
  | 'other-emergency-threshing'
  /**
   * Počasí a pohromy (disasters.md – Co hráč vidí): sucho, mokré žně, holomráz, kroupy, povodeň,
   * hoří, vyhořel dům, smršť – i z jiné vsi hráče s jejím jménem.
   */
  | DisasterNoticeKind;

/**
 * Upozornění na dílnu, která stojí bez vstupu (crafts.md) – týž text ukáže i popisek řádku výrobků
 * v panelu dvorce (`workshopStopNotice`).
 */
export const WORKSHOP_STOP_NOTICES = {
  'no-charcoal': 'Kovář nemá uhlí',
  'no-ore': 'Kovář nemá rudu',
  'no-clay': 'Hrnčíř nemá hlínu',
  'no-wood': 'Dílna nemá co kácet',
  'carpenter-no-wood': 'Tesař nemá klády',
} as const;

/** Text upozornění dílny, která stojí bez vstupu (`WORKSHOP_STOP_NOTICES`); jinak null. */
export function workshopStopNotice(workshop: {
  craft: Craft;
  activity: WorkshopActivity;
}): string | null {
  switch (workshop.activity) {
    case 'no-charcoal':
    case 'no-ore':
    case 'no-clay':
      return WORKSHOP_STOP_NOTICES[workshop.activity];
    case 'no-wood':
      return WORKSHOP_STOP_NOTICES[
        workshop.craft === 'carpenter' ? 'carpenter-no-wood' : 'no-wood'
      ];
    default:
      return null;
  }
}

export interface VillageNotice {
  kind: NoticeKind;
  /** info = zpráva, warn = problém. */
  tone: 'info' | 'warn';
  text: string;
  /** Ikona před textem řádku (jen kupci); jinak žádná. */
  icon?: string;
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

/** Ves šetří jen kvůli osivu (absence.md – Upozornění vsi do kroniky) – místo „Ves šetří jídlem“. */
const SEED_RATIONING_NOTICE: VillageNotice = {
  kind: 'rationing',
  tone: 'info',
  text: 'Ves šetří na osivo',
};

/** Řádek stupně hladu vsi `view` – šetření jen kvůli osivu má vlastní text. */
function hungerNotice(view: VillageView, level: Exclude<HungerLevel, 'fed'>): VillageNotice {
  return level === 'rationing' && view.seedRationing === true
    ? SEED_RATIONING_NOTICE
    : HUNGER_NOTICES[level];
}

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

/** Text o volech podle počtu (kronika uložená dřív bez počtu – `legacy`). */
function oxenText(oxen: number | undefined, legacy: string, one: string, many: string): string {
  if (oxen === undefined) return legacy;
  return oxen === 1 ? one : many;
}

/** Škoda zvěře letos nad tímto podílem úrody polí u lesa je upozornění (wildlife.md – Co hráč vidí). */
const WILDLIFE_DAMAGE_NOTICE_SHARE = 0.05;

/** Upozornění, která pro ves právě platí (pořadí: problémy, pak zprávy). */
export function villageNotices(view: VillageView): VillageNotice[] {
  const notices: VillageNotice[] = [];
  if (view.extinct) return notices;
  if (view.hunger !== 'fed') notices.push(hungerNotice(view, view.hunger));
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
    notices.push({ kind: 'no-charcoal', tone: 'warn', text: WORKSHOP_STOP_NOTICES['no-charcoal'] });
  }
  if (view.crafts.workshops.some((w) => w.activity === 'no-ore')) {
    notices.push({ kind: 'no-ore', tone: 'warn', text: WORKSHOP_STOP_NOTICES['no-ore'] });
  }
  if (view.crafts.workshops.some((w) => w.activity === 'no-clay')) {
    notices.push({ kind: 'no-clay', tone: 'warn', text: WORKSHOP_STOP_NOTICES['no-clay'] });
  }
  if (view.crafts.workshops.some((w) => w.activity === 'no-wood' && w.craft !== 'carpenter')) {
    notices.push({ kind: 'no-wood', tone: 'warn', text: WORKSHOP_STOP_NOTICES['no-wood'] });
  }
  // tesař bez klád na hromadě a bez stromů ke kácení (wagons.md)
  if (view.crafts.workshops.some((w) => w.activity === 'no-wood' && w.craft === 'carpenter')) {
    notices.push({
      kind: 'carpenter-no-wood',
      tone: 'warn',
      text: WORKSHOP_STOP_NOTICES['carpenter-no-wood'],
    });
  }
  // rodina, která smí odejít, nemá kam (dřív „Domácnost je plná“ – od 19. 10. 2026 smí ženatý pár
  // odejít i z neplného domu, kinship.md – Lidé k osídlení)
  if (view.fullHousehold) {
    // ženatí synové rodu v dvorci čekají na dům jménem (lord.md – Kde se jméno ukazuje)
    const sons = view.dynasty?.waitingHome ?? [];
    const text = sons.length > 0 ? `Rodina čeká na dům – ${sons.join(', ')}` : 'Rodina čeká na dům';
    notices.push({ kind: 'full-household', tone: 'info', text });
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
  // ves chce víc volů, než se vejde do ohrad volů – má méně vozů nebo orá pomaleji (oxen.md –
  // Kolik volů ves chce)
  if (view.oxen?.overRoom) {
    notices.push({ kind: 'oxen-short', tone: 'warn', text: 'Voli se nevejdou do ohrady' });
  }
  // koně (horses.md – Co hráč vidí): ves chce víc koní, než se vejde do ohrad koní; jezdečtí koně
  // bez obilí (výcvik se zpomalil)
  if (view.horses?.overRoom) {
    notices.push({ kind: 'horses-short', tone: 'warn', text: 'Koně se nevejdou do ohrady' });
  }
  if (view.horses?.ungrained) {
    notices.push({ kind: 'horses-ungrained', tone: 'warn', text: 'Koně jsou bez obilí' });
  }
  // divoká zvěř (wildlife.md – Co hráč vidí)
  const wild = view.wildlife;
  if (wild && wild.damageShare > WILDLIFE_DAMAGE_NOTICE_SHARE) {
    notices.push({ kind: 'boar-damage', tone: 'warn', text: 'Divoká prasata ničí úrodu' });
  }
  if (wild?.wolvesTroubling) {
    notices.push({ kind: 'wolves-killing', tone: 'warn', text: 'Vlci strhávají dobytek' });
  }
  // výmlat (production-chains.md – Humno): bez humna ves nemlátí – upozornění s předstihem, aby
  // ves nezahynula hladem jen proto, že hráč o humnu nevěděl (anti-cíl)
  const threshing = view.threshing;
  if (threshing?.emergency) {
    notices.push({
      kind: 'emergency-threshing',
      tone: 'info',
      text: 'Mlátí se na udusané zemi – postav humno',
    });
  }
  if (threshing?.floorShort) {
    notices.push({
      kind: 'threshing-floor-short',
      tone: 'info',
      text: 'Humno nestačí – část se mlátí nouzově',
    });
  }
  // počasí roku, které se právě ukázalo (disasters.md – Co hráč vidí)
  if (!view.extinct) notices.push(...weatherNotices(view.weather));
  return notices;
}

/**
 * Upozornění, která se ohlásí i při prvním pohledu na ves – po načtení i přepnutí vsi
 * (production-chains.md – Humno, anti-cíl „vždy jasné upozornění“): bez humna ves nemlátí a hráč
 * se to nesmí dozvědět pozdě.
 */
const FIRST_LOOK_NOTICES: ReadonlySet<NoticeKind> = new Set(['emergency-threshing']);

/**
 * Upozornění, která mezi dvěma pohledy na ves nově vznikla (dřív neplatila). Bez předchozího
 * pohledu (první načtení) a po přepnutí na jinou ves (jiné id) jen humno a čekající snopy
 * (`FIRST_LOOK_NOTICES`) – jinak se porovnává ves sama se sebou. Přidá i upozornění z ostatních
 * vsí hráče (`otherVillageNotices`).
 */
export function newNotices(previous: VillageView | null, next: VillageView): VillageNotice[] {
  if (previous === null || previous.id !== next.id) {
    return villageNotices(next).filter((n) => FIRST_LOOK_NOTICES.has(n.kind));
  }
  return [...ownNotices(previous, next), ...otherVillageNotices(previous, next)];
}

/** Humno z jiné vsi – krátký řádek se jménem vsi (production-chains.md – Humno). */
const OTHER_THRESHING_NOTICE = {
  kind: 'other-emergency-threshing',
  tone: 'info',
  text: 'mlátí se na udusané zemi – postav humno',
} as const satisfies VillageNotice;

/**
 * Upozornění z jiných vsí hráče (migration.md – návrh Clauda): hlad, vymírání hladem a vymření,
 * humno před žněmi a čekající snopy (production-chains.md – Humno) – krátký řádek se jménem vsi,
 * jen když u té vsi nově vzniklo.
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
    // humno – když nově vznikne (production-chains.md – Humno)
    if (village.threshing?.emergency && !before.threshing?.emergency) {
      notices.push({
        ...OTHER_THRESHING_NOTICE,
        text: `${village.name}: ${OTHER_THRESHING_NOTICE.text}`,
      });
    }
    // počasí a pohromy (disasters.md – Co hráč vidí) – když nově vzniknou
    const had = new Set(before.disasters?.weather?.map((n) => n.kind));
    for (const notice of village.disasters?.weather ?? []) {
      if (!had.has(notice.kind))
        notices.push({ ...notice, text: `${village.name}: ${notice.text}` });
    }
    const last = village.disasters?.last;
    if (last && last.day > (before.disasters?.last?.day ?? -Infinity)) {
      notices.push({ ...last.notice, text: `${village.name}: ${last.notice.text}` });
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
    notices.unshift(hungerNotice(next, next.hunger));
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
  // kupci přijeli – za každý den příjezdu, ne jen první v roce jako kronika (markets.md – Rozhodnutí
  // plánu 4, bod 5): den posledního příjezdu v pohledu je novější než v minulém pohledu. Dva příjezdy
  // téhož dne dají jedno upozornění (stejný den, nic novějšího).
  const arrived = next.manor?.market.merchantsArrived ?? null;
  if (
    !next.extinct &&
    arrived !== null &&
    arrived > (previous.manor?.market.merchantsArrived ?? -Infinity)
  ) {
    notices.push({
      kind: 'merchants-arrived',
      tone: 'info',
      text: 'Kupci přijeli',
      icon: '/icons/resources/merchants.png',
    });
  }
  // pohromy z kroniky – kroupy, povodeň, požár (hoří / vyhořel dům), smršť (disasters.md)
  if (!next.extinct)
    notices.push(...disasterNotices(next.chronicle, previous.dayIndex, next.dayIndex));
  return notices;
}

/**
 * Události kroniky, které se ohlásí jako fakt (diet.md, oxen.md, orchard.md – Obnova sadu,
 * fields.md – Zarůstání) – nejvýš jednou za druh.
 */
type ChronicleEntry = VillageView['chronicle'][number];

/** První písmeno velké (věta upozornění). */
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

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
  // seno do jara nevystačí – ves porazila kusy, na které nezbude (oxen.md – Co nejvíc sena a co
  // největší stáda)
  'hay-slaughter': (entry) => {
    const animals = entry.animals ? formatAnimals(entry.animals) : '';
    return {
      kind: 'hay-slaughter',
      tone: 'warn',
      text: animals !== '' ? `Chybí seno – porazili ${animals}` : 'Chybí seno – porazili dobytek',
    };
  },
  // ovcí přes zimu méně, než je třeba na vlnu pro oděv všech (diet.md – Oděv)
  'wool-short': () => ({ kind: 'wool-short', tone: 'warn', text: 'Chybí vlna na oděv' }),
  // voli po kusech (oxen.md); kronika uložená dřív – spřežení
  'team-ready': (entry) => ({
    kind: 'team-ready',
    tone: 'info',
    text: oxenText(entry.oxen, 'Spřežení je vycvičené', 'Vůl je vycvičený', 'Voli jsou vycvičení'),
  }),
  // sňatky se sousedy (kinship.md – Sňatky z okolí; plán 3): se jménem vsi, starší záznamy „z okolí“
  'bride-from-outside': (entry) => ({
    kind: 'bride-from-outside',
    tone: 'info',
    text:
      entry.villageName === undefined
        ? 'Nevěsta z okolí'
        : `Nevěsta ${fromVillage(entry.villageName)}`,
  }),
  'groom-from-outside': (entry) => ({
    kind: 'groom-from-outside',
    tone: 'info',
    text:
      entry.villageName === undefined
        ? 'Ženich z okolí'
        : `Ženich ${fromVillage(entry.villageName)}`,
  }),
  'married-away': (entry) => ({
    kind: 'married-away',
    tone: 'info',
    text:
      entry.villageName === undefined
        ? 'Dcera se vdala pryč'
        : `${entry.groom ? 'Syn se přiženil' : 'Dcera se vdala'} ${toVillage(entry.villageName)}`,
  }),
  'team-retired': (entry) => ({
    kind: 'team-retired',
    tone: 'info',
    text: oxenText(entry.oxen, 'Spřežení dosloužilo', 'Vůl dosloužil', 'Voli dosloužili'),
  }),
  'ox-died': (entry) => ({
    kind: 'ox-died',
    tone: 'warn',
    text: `${oxenText(entry.oxen, 'Vůl uhynul', 'Vůl uhynul', 'Voli uhynuli')} – chybělo seno`,
  }),
  // koně po kusech (horses.md – Chov, Krmení, Výcvik koně)
  'foal-born': (entry) => ({
    kind: 'foal-born',
    tone: 'info',
    text: entry.horses === 1 ? 'Narodilo se hříbě' : 'Narodila se hříbata',
  }),
  'horses-arrived': () => ({
    kind: 'horses-arrived',
    tone: 'info',
    text: 'Do ohrady koní přivedli hřebce a dvě klisny',
  }),
  // kování (horses.md – Kování) se neohlašuje – děje se samo, kovář dojde k ohradě ve scéně
  // (Martin 27. 10. 2026); zůstává jen v kronice
  'horse-trained': () => ({ kind: 'horse-trained', tone: 'info', text: 'Kůň je vycvičený' }),
  'horse-retired': (entry) => ({
    kind: 'horse-retired',
    tone: 'info',
    text:
      entry.retired === 'hay'
        ? entry.horses === 1
          ? 'Kůň šel na maso – chybělo seno'
          : 'Koně šli na maso – chybělo seno'
        : entry.horses === 1
          ? 'Kůň dosloužil'
          : 'Koně dosloužili',
  }),
  'horse-starved': (entry) => ({
    kind: 'horse-starved',
    tone: 'warn',
    text: `${entry.horses === 1 ? 'Kůň uhynul' : 'Koně uhynuli'} – chybělo seno`,
  }),
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
  // výprava na trh (markets.md – Pravidla 3); podrobnosti jsou v kronice
  'market-returned': () => ({
    kind: 'market-returned',
    tone: 'info',
    text: 'Výprava se vrátila z trhu',
  }),
  // odvedení z tažení – otroci (s ikonou otroka) nebo svobodní křesťané (markets.md – plán 5, bod 1)
  'led-settled': (entry) =>
    (entry.slaves ?? 0) > 0
      ? {
          kind: 'led-settled',
          tone: 'info',
          text: 'Z tažení přivedli otroky',
          icon: '/icons/resources/slave.png',
        }
      : { kind: 'led-settled', tone: 'info', text: 'Z tažení přivedli křesťany' },
  // vozy od tesaře (wagons.md – Vůz)
  'cart-made': () => ({ kind: 'cart-made', tone: 'info', text: 'Tesař vyrobil vůz' }),
  'cart-worn-out': () => ({ kind: 'cart-worn-out', tone: 'warn', text: 'Vůz dosloužil' }),
  // kování vozů (wagons.md) – jen fakt: kdo šel a kam, kdo přinesl
  'iron-trip': (entry) => ({
    kind: 'iron-trip',
    tone: 'info',
    text: `${capitalize(ironTripWho(entry.son === true, entry.porters ?? 0, entry.byCart === true))} pro kování k vozu ${entry.place ? `do vsi ${entry.place}` : 'do sousední vsi'}${
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
    text: `Vesničané koupili ${productList(entry.products ?? [], entry.cart)} u souseda${
      entry.direction ? ` (${DIRECTION_NAMES[entry.direction].name})` : ''
    }`,
  }),
  // osivo chybí a koupit nešlo (fields.md – Osivo pro ves bez zásob) – díly bez osiva ves nezaseje
  'seed-short': () => ({ kind: 'seed-short', tone: 'warn', text: 'Chybí osivo na setí' }),
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
  // vrácení lidé mají vlastní upozornění, ne „Přišla rodina“ (plán 3, bod 13)
  if (entry.returned) {
    return { kind: `newcomer-back-${group}`, tone: 'info', text: NEWCOMER_TEXTS[group].backNotice };
  }
  const from =
    entry.villageName !== undefined
      ? ` ${fromVillage(entry.villageName)}`
      : entry.direction
        ? ` ${DIRECTION_NAMES[entry.direction].from}`
        : '';
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

/**
 * Trvalé upozornění „Syn vojvody čeká na jméno“ (lord.md – Kde se jméno zadává; Martin 24. 10. 2026:
 * „Hráči se vypíše upozornění a bude se čekat na jeho reakci.“) – nemizí jako ostatní, dokud hráč
 * muže nepojmenuje. Text podle prvního ve frontě (vojvoda, jinak nejstarší syn), číslo je počet
 * všech čekajících; klik otevře panel jména na `personId`.
 */
export interface LineNameNotice {
  kind: 'line-name';
  tone: 'warn';
  text: string;
  count: number;
  personId: number;
}

/** Upozornění na muže rodu bez jména; nikdo nečeká (nebo ves vymřela) – null. */
export function lineNameNotice(view: VillageView | null): LineNameNotice | null {
  if (!view || view.extinct) return null;
  const unnamed = view.dynasty?.unnamed ?? [];
  const first = unnamed[0];
  if (!first) return null;
  return {
    kind: 'line-name',
    tone: 'warn',
    text: first.lord ? 'Vojvoda čeká na jméno' : 'Syn vojvody čeká na jméno',
    count: unnamed.length,
    personId: first.id,
  };
}
