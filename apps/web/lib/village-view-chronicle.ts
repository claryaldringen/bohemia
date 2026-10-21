// Texty kroniky a pojmenování staveb pro panel.

import { boughtProducts, productList } from './village-view-types';
import { Crop } from '@bohemia/game';
import {
  paymentValueKg,
  CART_NAMES,
  CRAFT_NAMES,
  dateOfDayIndex,
  type AbandonedStructure,
  type ChronicleEvent,
  type LandTaker,
  type ConstructionKind,
  type ConstructionSummary,
  type Craft,
  type CraftStocks,
  type Direction8,
  type NewcomerGroup,
  type TradeGoods,
  type TradePeople,
  type DwellingType,
  type SacredBuildingKind,
} from '@bohemia/game';

import { formatGameDate } from './game-date';

import { DIRECTION_NAMES, NEWCOMER_TEXTS, goodsText, peopleText } from './trade-names';

import { formatAnimals, formatCells, formatHa, formatInteger, plural } from './village-format';

export const CHRONICLE_LENGTH = 8;

/**
 * Řemesla v rozhraní (crafts.md): ikona dílny (`public/icons/build/`), výrobek – ikona
 * (`public/icons/resources/`), název a zásoba ve `CraftStocks`.
 */
export const CRAFT_LOOKS: Record<
  Craft,
  { icon: string; product: { icon: string; name: string; stock: keyof CraftStocks } }
> = {
  potter: { icon: 'hrncir', product: { icon: 'pottery', name: 'Keramika', stock: 'potteryKg' } },
  // production-chains.md – Kovář: v zásobě hřivny, nástroje jsou vybavení domácností
  smith: { icon: 'kovar', product: { icon: 'iron-bars', name: 'Hřivny', stock: 'ironBarsKg' } },
  burner: { icon: 'uhlir', product: { icon: 'charcoal', name: 'Uhlí', stock: 'charcoalKg' } },
  // wagons.md – Tesař: dřevěné nářadí (vozy ukazuje panel dílny zvlášť)
  carpenter: {
    icon: 'tesar',
    product: { icon: 'wood-tools', name: 'Dřevěné nářadí', stock: 'woodToolsKg' },
  },
};

/** Názvy obydlí v 1. a 4. pádě. */
export const DWELLING_NAMES: Record<DwellingType, { nominative: string; accusative: string }> = {
  zemnice: { nominative: 'Zemnice', accusative: 'zemnici' },
  polozemnice: { nominative: 'Polozemnice', accusative: 'polozemnici' },
  dvorec: { nominative: 'Dvorec', accusative: 'dvorec' },
};

function deathText(group: 'child' | 'adult' | 'elder', hunger: boolean): string {
  if (group === 'child') return hunger ? 'Dítě zemřelo hlady.' : 'Zemřelo dítě.';
  if (group === 'adult') {
    return hunger ? 'Jeden z dospělých zemřel hlady.' : 'Zemřel jeden z dospělých.';
  }
  return hunger ? 'Jeden ze starších zemřel hlady.' : 'Zemřel jeden ze starších.';
}

/** Dostavěná řemeslná dílna – kronika (crafts.md). */
const WORKSHOP_FINISHED: Record<Craft, string> = {
  potter: 'Dostavěli hrnčířskou dílnu s pecí.',
  smith: 'Dostavěli kovárnu s výhní.',
  burner: 'Dostavěli uhlířovu zemnici s milířem.',
  carpenter: 'Dostavěli tesařskou dílnu s přístřeškem.',
};

function finishedText(kind: ConstructionKind, craft?: Craft, wagon?: boolean): string {
  if (wagon) return 'Vozová cesta je hotová – vůz po ní jede rychleji.';
  if (craft && (kind === 'dwelling' || kind === 'rebuild')) {
    return kind === 'dwelling' ? WORKSHOP_FINISHED[craft] : 'Dokončili přestavbu dílny.';
  }
  if (kind === 'dwelling') return 'Dostavěli nové obydlí.';
  if (kind === 'idol') return 'Vztyčili dřevěnou modlu.';
  if (kind === 'shrine') return 'Svatyně je dostavěná – v ohništích hoří oheň.';
  if (kind === 'rebuild') return 'Dokončili přestavbu obydlí.';
  if (kind === 'cemetery') return 'Hřbitov je ohrazený – dá se do něj pohřbívat.';
  if (kind === 'orchard') return 'Sad je vysazený.';
  if (kind === 'pen') return 'Ohrada je postavená.';
  if (kind === 'ard') return 'Vesničané vyrobili rádlo.';
  if (kind === 'road') return 'Cesta je vylepšená – chodí se po ní rychleji.';
  if (kind === 'road-apples') return 'Jabloně podél cesty jsou vysazené.';
  if (kind === 'threshing-floor') return 'Humno je dostavěné – dá se na něm mlátit.';
  return 'Pole je založené – dá se osévat.';
}

/** Pole nebo sad ustoupil stavbě obydlí – kronika (population.md – Obydlí na poli a v sadu). */
/** Komu pole či sad ustoupil (3. pád) – kronika (fields.md – Pole jako krajina). */
const LAND_TAKERS: Record<LandTaker, string> = {
  dwelling: 'stavbě obydlí',
  orchard: 'sadu',
  cemetery: 'hřbitovu',
  pen: 'ohradě',
  idol: 'modle',
  shrine: 'svatyni',
  'road-apples': 'jabloním u cesty',
  'road-trees': 'stromům u cesty',
  road: 'cestě',
  'threshing-floor': 'humnu',
};

function landTakenText(
  land: 'field' | 'orchard',
  areaM2: number,
  gone: boolean,
  by: LandTaker = 'dwelling',
): string {
  const who = LAND_TAKERS[by];
  if (land === 'field') {
    return gone
      ? `Pole ustoupilo ${who} a zaniklo.`
      : `Pole ustoupilo ${who} – zmenšilo se o ${formatInteger(areaM2)} m².`;
  }
  return gone
    ? `Sad ustoupil ${who} a zanikl.`
    : `Sad ustoupil ${who} – zmenšil se o ${formatInteger(areaM2)} m².`;
}

/** Příloh zarostl lesem a vypadl z pole – kronika (fields.md – Zarůstání). */
function forestText(parts: number, gone: boolean): string {
  if (gone) return 'Nepasené pole zarostlo lesem a zaniklo.';
  return parts === 1
    ? 'Nepasený díl pole zarostl lesem – pole se zmenšilo.'
    : `Nepasené pole zarostlo lesem – ubylo ${formatCells(parts)}.`;
}

/** Opuštěná stavba spadla (abandonment.md – kronika). */
const STRUCTURE_FELL_TEXTS: Record<AbandonedStructure, string> = {
  idol: 'Modla, ke které léta nikdo nechodil, padla.',
  shrine: 'Opuštěná svatyně se rozpadla – zbyl jen zarůstající příkop.',
  'cemetery-fence': 'Plot hřbitova, kam nikdo nechodí, se rozpadl.',
  pen: 'Opuštěná ohrada se rozpadla.',
};

/** Vesničané opravili stavbu, ke které se zase chodí (abandonment.md – Oprava) – kronika. */
const STRUCTURE_REPAIRED_TEXTS: Record<AbandonedStructure, string> = {
  idol: 'Vesničané modlu znovu usadili a opravili.',
  shrine: 'Vesničané opravili svatyni – v ohništích zase hoří oheň.',
  'cemetery-fence': 'Vesničané opravili plot hřbitova.',
  pen: 'Vesničané opravili ohradu.',
};

/** Domácnosti odešly založit novou ves (migration.md) – kronika. */
function householdsLeftText(households: number, people: number, direction?: Direction8): string {
  const who =
    households === 1
      ? 'Jedna domácnost odešla'
      : households <= 4
        ? `${households} domácnosti odešly`
        : `${households} domácností odešlo`;
  const where = direction ? ` na ${DIRECTION_NAMES[direction].name}` : '';
  return `${who} založit novou ves${where} – ${formatInteger(people)} ${plural(people, 'člověk', 'lidé', 'lidí')}.`;
}

/**
 * Věta kroniky o výpravě (trade.md – Obchod, Výměna lidí): „Nosiči vyrazili … – nesou 100 kg obilí;
 * odchází s nimi 1 rodina.“ Bez zboží jen lidé, bez lidí jen zboží.
 */
function tradeTripText(
  lead: string,
  carry: string,
  goods: TradeGoods,
  withThem: string,
  people: TradePeople | undefined,
): string {
  const who = peopleText(people);
  const hasGoods = Object.values(goods).some((n) => (n ?? 0) > 0);
  if (who === '') return `${lead} – ${carry} ${goodsText(goods)}.`;
  if (!hasGoods) return `${lead} – ${withThem} ${who}.`;
  return `${lead} – ${carry} ${goodsText(goods)}; ${withThem} ${who}.`;
}

/** Věta kroniky o lidech od souseda: „Ze severu přišla rodina – 4 lidé.“ */
function newcomerText(direction: Direction8, group: NewcomerGroup, people: number): string {
  const from = DIRECTION_NAMES[direction].from;
  const lead = `${from.charAt(0).toUpperCase()}${from.slice(1)} ${NEWCOMER_TEXTS[group].chronicle}`;
  if (group !== 'family') return `${lead}.`;
  return `${lead} – ${formatInteger(people)} ${plural(people, 'člověk', 'lidé', 'lidí')}.`;
}

/** Věta kroniky o svatbě ve vsi (kinship.md – Sňatky): kdo se k komu stěhoval, vdova. */
function marriageText(event: Extract<ChronicleEvent, { kind: 'marriage' }>): string {
  if (event.groomMoved) {
    return event.widow
      ? 'Svatba – k vdově se přiženil muž ze vsi.'
      : 'Svatba – ženich se přiženil k nevěstě.';
  }
  if (event.fromDwellingId === event.toDwellingId) {
    return event.widow ? 'Svatba – vdova se znovu vdala.' : 'Svatba ve vsi.';
  }
  return event.widow
    ? 'Svatba – vdova se přestěhovala k ženichovi.'
    : 'Svatba – nevěsta se přestěhovala k ženichovi.';
}

/**
 * Kdo šel pro kování k vozu (wagons.md – Kování vozů) – „tesař šel se 6 nosiči“, „syn tesaře jel
 * s vozem“ (malým písmenem, jak je ve větě).
 */
export function ironTripWho(son: boolean, porters: number, byCart: boolean): string {
  const who = son ? 'syn tesaře' : 'tesař';
  if (byCart) return `${who} jel s vozem`;
  if (porters <= 0) return `${who} šel`;
  return `${who} šel ${porters === 1 ? 's 1 nosičem' : `se ${porters} nosiči`}`;
}

/** Text události kroniky česky. */
export function chronicleText(event: ChronicleEvent, villageName: string): string {
  switch (event.kind) {
    case 'village-founded':
      return `Osadníci založili ves ${villageName}.`;
    case 'birth':
      return 'Narodilo se dítě.';
    case 'death':
      return deathText(event.group, event.cause === 'hunger');
    case 'village-extinct':
      return `Zemřel poslední obyvatel – ves ${villageName} vymřela.`;
    case 'household-founded':
      return 'V obydlí založila domácnost nová rodina.';
    case 'household-merged':
      return 'Zbytek domácnosti se přestěhoval k příbuzným nebo sousedům.';
    case 'marriage':
      return marriageText(event);
    case 'bride-from-outside':
      return 'Muž si přivedl nevěstu ze sousední vsi.';
    case 'groom-from-outside':
      return event.widow
        ? 'K vdově se přiženil muž ze sousední vsi.'
        : 'K ženě se přiženil muž ze sousední vsi.';
    case 'married-away':
      return 'Dcera se vdala do sousední vsi.';
    case 'construction-finished':
      return finishedText(event.constructionKind, event.craft, event.wagon);
    case 'cart-made':
      return `Tesař vyrobil ${CART_NAMES[event.cart].toLowerCase()}.`;
    case 'iron-trip':
      return `Ves nemá kováře – ${ironTripWho(event.son, event.porters ?? 0, event.byCart === true)} pro kování k vozu do vsi ${event.to}.`;
    case 'iron-brought':
      return `${event.son ? 'Syn tesaře přinesl' : 'Tesař přinesl'} kování k vozu.`;
    case 'cart-worn-out':
      return `${CART_NAMES[event.cart]} dosloužil – tesař vyrobí nový.`;
    case 'rebuild-decided':
      return `Obyvatelé se rozhodli přestavět dožilé obydlí na ${DWELLING_NAMES[event.type].accusative}.`;
    case 'relocation-started':
      return `Domácnost si začala stavět novou ${DWELLING_NAMES[event.type].accusative} – přestěhuje se.`;
    case 'relocation-cancelled':
      return 'Stěhování domácnosti se zrušilo – zůstává ve starém domě.';
    case 'household-relocated':
      return 'Domácnost se přestěhovala do nového domu – starý zůstal prázdný.';
    case 'households-left':
      return householdsLeftText(event.households, event.people, event.direction);
    case 'village-abandoned':
      return `Odešli všichni – ves ${villageName} je opuštěná.`;
    case 'journey-started':
      return `Lidé vyrazili na ${DIRECTION_NAMES[event.direction].name} – na místo nové vsi dorazí ${formatGameDate(dateOfDayIndex(event.arrivalDay))}.`;
    case 'harvest':
      return `${HARVEST_NAMES[event.crop ?? 'any']}: ${formatInteger(event.kg)} kg ${HARVEST_GOODS[event.crop ?? 'any']}.`;
    case 'linen-short':
      return `Lnu je na oděv málo – vytrhali ${formatInteger(event.kg)} kg z ${formatInteger(event.neededKg)} kg, které lidé potřebují.`;
    case 'apple-harvest':
      return `Sklizeň ovoce: ${formatInteger(event.kg)} kg.`;
    case 'slaughter':
      return `Podzimní porážka: ${formatInteger(event.kg)} kg masa.`;
    case 'emergency-slaughter': {
      const animals = formatAnimals(event.animals);
      return `Jídlo do sklizně by nevystačilo – vesničané porazili ${animals !== '' ? animals : 'dobytek'} navíc: ${formatInteger(event.kg)} kg masa.`;
    }
    case 'meat-spoiled':
      return `Zbytek uzeného masa se zkazil: ${formatInteger(event.kg)} kg.`;
    case 'wool-short':
      return `Ovcí je na oděv málo – ${formatInteger(Math.floor(event.sheep))} z ${formatInteger(event.needed)}, lidem chybí vlna.`;
    case 'herd-starved':
      return `Přes zimu chybělo seno – uhynulo ${formatInteger(
        Object.values(event.animals).reduce((sum, n) => sum + n, 0),
      )} kusů dobytka.`;
    case 'team-ready':
      // voli po kusech (oxen.md); kronika uložená dřív – spřežení
      if (event.oxen === undefined) return 'Spřežení volů je vycvičené – orá rádlem.';
      return event.oxen === 1
        ? 'Vůl je vycvičený – táhne dvoukolák, s druhým rádlo.'
        : `Voli jsou vycvičení (${event.oxen}) – táhnou rádla a vozy.`;
    case 'team-retired':
      if (event.oxen === undefined) return 'Spřežení dosloužilo – voli zestárli a šli na maso.';
      return event.oxen === 1
        ? 'Vůl dosloužil – zestárl a šel na maso.'
        : `Voli dosloužili (${event.oxen}) – zestárli a šli na maso.`;
    case 'ox-died':
      if (event.oxen === undefined) {
        return event.training
          ? 'Přes zimu chybělo seno – tele ve výcviku uhynulo.'
          : 'Přes zimu chybělo seno – vůl uhynul a spřežení se rozpadlo.';
      }
      if (event.training) {
        return event.oxen === 1
          ? 'Přes zimu chybělo seno – tele ve výcviku uhynulo.'
          : `Přes zimu chybělo seno – uhynula telata ve výcviku (${event.oxen}).`;
      }
      return event.oxen === 1
        ? 'Přes zimu chybělo seno – vůl uhynul.'
        : `Přes zimu chybělo seno – uhynuli voli (${event.oxen}).`;
    case 'orchard-gone':
      return 'Starý sad dosloužil a zarostl loukou.';
    case 'orchard-renewal-started':
      return `Vesničané obnovují starý sad – znovu vysadí ${formatCells(event.squares)}.`;
    case 'land-taken':
      return landTakenText(event.land, event.areaM2, event.gone, event.by);
    case 'hunger-began':
      return 'Ve vsi začal hlad – zásoby nevystačí do sklizně.';
    case 'hunger-ended':
      return 'Hlad skončil.';
    case 'part-became-forest':
      return forestText(event.parts ?? 1, event.gone ?? false);
    case 'sacred-spared':
      return event.site === 'oak'
        ? 'Vesničané ušetřili posvátný dub.'
        : 'Vesničané ušetřili dubový háj.';
    case 'sacred-oak-died':
      return 'Posvátný dub stářím uschl – zůstala posvátná souš.';
    case 'sacred-snag-fell':
      return 'Posvátná souš padla.';
    case 'road-formed':
      return 'Kudy se chodí léta, vyšlapala se pevná cesta.';
    case 'road-overgrown':
      return 'Nepoužívaná cesta zarostla.';
    case 'trail-built':
      return `Zemská stezka na ${DIRECTION_NAMES[event.direction].name} je dostavěná – dá se obchodovat se sousedy.`;
    case 'trade-departed':
      return tradeTripText(
        `Nosiči vyrazili po stezce na ${DIRECTION_NAMES[event.direction].name}`,
        'nesou',
        event.give,
        'odchází s nimi',
        event.people,
      );
    case 'crafts-bought':
      return `Vesničané koupili ${productList(boughtProducts(event.get))} u souseda (${DIRECTION_NAMES[event.direction].name}) – zaplatili ${formatInteger(paymentValueKg(event.pay))} kg obilí.`;
    case 'trade-returned':
      return tradeTripText(
        `Nosiči se vrátili ${DIRECTION_NAMES[event.direction].from}`,
        'přinesli',
        event.get,
        'přišli s nimi',
        event.people,
      );
    case 'newcomer':
      return newcomerText(event.direction, event.group, event.people);
    case 'structure-fell':
      return STRUCTURE_FELL_TEXTS[event.structure];
    case 'structure-repaired':
      return STRUCTURE_REPAIRED_TEXTS[event.structure];
    case 'cemetery-full':
      if (event.othersFree) return 'Jeden z hřbitovů se zaplnil – pohřbívá se do dalšího.';
      // staví se jiný hřbitov nebo rozšíření – bude kam pohřbívat
      if (event.othersBuilding) return 'Hřbitov se zaplnil.';
      return 'Hřbitov se zaplnil – mrtvé není kam pohřbívat.';
  }
}

/** Názvy posvátných staveb (happiness.md). */
export const SACRED_BUILDING_NAMES: Record<SacredBuildingKind, string> = {
  idol: 'Modla',
  shrine: 'Svatyně',
};

/** Co se opravuje (abandonment.md – Oprava) – popisek stavby. */
const REPAIR_NAMES: Record<AbandonedStructure, string> = {
  idol: 'modla',
  shrine: 'svatyně',
  'cemetery-fence': 'plot hřbitova',
  pen: 'ohrada',
};

/** Průběh opravy stavby 0–1 (abandonment.md – Oprava); bez opravy null. */
export function repairProgress(
  constructions: readonly ConstructionSummary[],
  structure: AbandonedStructure,
  id: number,
): number | null {
  const c = constructions.find(
    (x) => x.kind === 'repair' && x.repair?.structure === structure && x.repair.id === id,
  );
  return c ? c.progress : null;
}

export function constructionLabel(c: ConstructionSummary): string {
  if (c.kind === 'field') return `Pole ${formatHa(c.areaM2 ?? 0)}`;
  if (c.craft && c.kind === 'dwelling') return CRAFT_NAMES[c.craft];
  if (c.kind === 'idol' || c.kind === 'shrine') return SACRED_BUILDING_NAMES[c.kind];
  if (c.kind === 'cemetery') return `Hřbitov (${formatCells(c.squares ?? 0)})`;
  if (c.kind === 'orchard') return `Sad ${formatHa(c.areaM2 ?? 0)}`;
  if (c.kind === 'pen') return 'Ohrada';
  if (c.kind === 'ard') return 'Rádlo';
  if (c.kind === 'road' && c.wagon) return 'Vozová cesta';
  if (c.kind === 'road') return c.roadGrade === 'causeway' ? 'Hať a lávka' : 'Úprava cesty';
  if (c.kind === 'road-apples') return 'Jabloně u cesty';
  if (c.kind === 'threshing-floor') return 'Humno';
  if (c.kind === 'repair') return `Oprava – ${REPAIR_NAMES[c.repair?.structure ?? 'idol']}`;
  const type = c.dwellingType ?? 'zemnice';
  if (c.kind === 'rebuild') return `Přestavba na ${DWELLING_NAMES[type].accusative}`;
  return DWELLING_NAMES[type].nominative;
}

/** Kronika sklizní podle plodiny (fields.md – Ozim a jař); bez plodiny ves seje jen jař. */
export const HARVEST_NAMES: Record<Crop | 'any', string> = {
  winter: 'Sklizeň ozimu',
  spring: 'Sklizeň jaře',
  legume: 'Sklizeň luštěnin',
  flax: 'Trhání lnu',
  any: 'Sklizeň',
};

/** Co se sklidilo (2. pád) podle plodiny. */
export const HARVEST_GOODS: Record<Crop | 'any', string> = {
  winter: 'obilí',
  spring: 'obilí',
  legume: 'luštěnin',
  flax: 'lnu',
  any: 'obilí',
};
