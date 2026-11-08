// Typy stavu vsi – Kronika a rozdělení práce dne.
// Rozcestník je `types.ts`; tento soubor jen drží část typů.

import type { ConstructionKind, LandTaker } from './types-construction';
import type { Craft } from './types-crafts';
import type { AbandonedStructure, Crop, TileCell, UsableStructure } from './types-land';
import type { HerdSpecies } from './types-livestock';
import type { AwayKind, DwellingType } from './types-people';
import type { HuntKills } from './types-wildlife';
import type { FloodLevel, SummerWeather, TornadoStrength, WinterWeather } from './types-disasters';
import type { CartJob, CartKind } from './types-roads';
import type { Direction8 } from './types-state';
import type {
  CraftPurchaseGoods,
  CraftPurchasePay,
  ShipmentManifest,
  NewcomerGroup,
  TradeGoods,
  TradePeople,
} from './types-trade';

/**
 * Kořist nájezdu (war.md – Kořist): jídlo ze zásob po druzích (kg) a dobytek (kusy). Stejný tvar
 * jde ve schránce (`raid-result`, `campaign-return`) i do kroniky.
 */
export interface RaidLoot {
  grainKg: number;
  legumesKg: number;
  meatKg: number;
  cheeseKg: number;
  livestock: Record<HerdSpecies, number>;
}

/**
 * Kdo se vzal (id ženicha a nevěsty) – u událostí svatby v kronice (kinship.md – Svatba ve scéně:
 * svatebčané ve scéně); události zapsané dřív je nemají.
 */
export interface WeddingCouple {
  groomId?: number;
  brideId?: number;
  /** Jméno ženicha – muže rodu (lord.md – Kde se jméno ukazuje: „Svatba – Bořivoj“); jinak chybí. */
  name?: string;
}

export type ChronicleEvent = { day: number } & (
  | { kind: 'village-founded' }
  | { kind: 'birth' }
  /** Vojvodovi se narodil syn (lord.md – Rod vojvody) – čeká na jméno od hráče. */
  | { kind: 'line-birth' }
  /** Hráč pojmenoval muže rodu (lord.md – Jména) – jméno je trvalé. */
  | {
      kind: 'line-named';
      name: string;
      /** Koho hráč pojmenoval – vojvodu, nebo syna vojvody; chybí – jiný muž rodu (starší záznam). */
      who?: 'lord' | 'son';
    }
  /** Vojvodou se stal muž rodu `name` (lord.md – Nástupnictví); bez jména chybí. */
  | { kind: 'lord'; name?: string }
  /**
   * Muž rodu `name` odešel vládnout do vsi `villageName` (seniorate.md – Ves bez muže rodu –
   * dosazení vojvody); píše se ve vsi, odkud odešel.
   */
  | { kind: 'lord-sent'; villageName: string; name?: string }
  /**
   * Zásilka vyrazila do vsi `villageName` jiného hráče (vassalage.md – Doprava a cílová ves) –
   * co veze; `purpose` = popisek (dávka, dar…).
   */
  | { kind: 'shipment-sent'; villageName: string; goods: ShipmentManifest; purpose?: string }
  /** Zásilka z vsi `villageName` dorazila (do vsi, nebo zpět odesílateli – `returned`). */
  | {
      kind: 'shipment-received';
      villageName: string;
      goods: ShipmentManifest;
      purpose?: string;
      returned?: true;
    }
  /**
   * Lidé odešli na čas do vsi `villageName` (vassalage.md – Lidé a robota): `people` lidí, druh
   * `away`, vrátí se nejpozději v den `untilDay`.
   */
  | { kind: 'people-away'; away: AwayKind; people: number; villageName: string; untilDay: number }
  /** Lidé se vrátili domů (robota odpracovaná…) – `people` lidí, druh `away`. */
  | { kind: 'people-back'; away: AwayKind; people: number }
  /** Do vsi přišli hosté z vsi `villageName` – `people` lidí na čas, druh `away`. */
  | { kind: 'guests-came'; away: AwayKind; people: number; villageName: string }
  /**
   * Do vsi, která už vojvodu má, přišel z jiné vsi rodu muž `name` s rodinou (dosazení vojvody
   * přišlo pozdě) – žije v dvorci jako ostatní muži rodu.
   */
  | { kind: 'line-arrived'; name?: string }
  /** Muž rodu `name` si vzal další manželku z okolí (lord.md – Manželky); bez jména chybí. */
  | { kind: 'extra-wife'; name?: string }
  /** Muž rodu `name` má po smrti hlavní manželky novou hlavní (lord.md – Nová hlavní manželka). */
  | { kind: 'main-wife'; name?: string }
  /** Ženatý muž rodu `name` odešel z dvorce do vlastního domu (lord.md – Synové po sňatku). */
  | { kind: 'son-left-manor'; name?: string }
  /**
   * Ve vsi nezbyl žijící muž rodu (lord.md – Konec rodu) – `name` posledního vojvody vsi, bez
   * jména chybí. Hra končí, až rod nezbude v žádné vsi hráče.
   */
  | { kind: 'line-ended'; name?: string }
  /** Seniorem rodu se stal muž rodu `name` (seniorate.md – Seniorát; zapisuje se do všech vsí rodu). */
  | { kind: 'senior'; name?: string }
  /**
   * Jednání mezi rody (vassalage.md – Vznik a jednání): neutrální záznam do vlastní vsi obou rodů.
   * `self` = jméno hlavy rodu, do jehož vsi se píše, `other` = jméno druhé strany; nabídku
   * a protinávrh posílá ten, kdo je v textu první (`actor`), jinak je záznam stejný pro oba.
   */
  | {
      kind: 'negotiation';
      step:
        | 'offer'
        | 'counter'
        | 'rejected'
        | 'withdrawn'
        | 'terms-accepted'
        | 'aid-gift'
        | 'aid-loan'
        | 'trade-accepted';
      actor: string;
      other: string;
    }
  /**
   * Válka mezi rody (war.md – Začátek války, Konec války): neutrální věcný záznam do kronik obou
   * rodů, bez hodnocení. `actor` = ten, kdo válku začal (`declared`, `ambush`); u `quiet` a `peace`
   * jsou jména obou stran (`other` = druhá strana z pohledu vsi, do které se píše, doplní web).
   */
  | {
      kind: 'war';
      step: 'declared' | 'ambush' | 'quiet' | 'peace';
      actor: string;
      other: string;
    }
  /**
   * Tažení (war.md – Velení a příprava tažení): vojsko vůdce `leader` vyrazilo ze shromaždiště
   * (`set-out`), vrátilo se domů (`returned`), nebo se rozpadlo (`disbanded` – Ú6.12) – věcně, bez
   * hodnocení.
   */
  | { kind: 'campaign'; step: 'set-out' | 'returned' | 'disbanded'; leader: string }
  /**
   * Nájezd (war.md – Co hráč vidí: Kronika) – věcný zápis do kronik obou rodů: vůdce `leader` ze
   * vsi `from` na ves `target`, bez opovědi (`declared` false), padlí, ranění a odvedení obránci
   * a kořist. Jména vsí chybí, když je tažení nezná (starší stav).
   */
  | {
      kind: 'raid';
      leader: string;
      from?: string;
      target?: string;
      declared: boolean;
      fallen: number;
      wounded: number;
      led: number;
      loot: RaidLoot;
    }
  /** Dohoda z jednání: rod `vassal` přísahal rodu `lord` (jména hlav rodů). */
  | { kind: 'negotiation-accepted'; lord: string; vassal: string }
  /** Vazalství skončilo formálním vypovězením (jména hlav rodů; text je neutrální, bez viníka). */
  | { kind: 'vassalage-renounced'; lord: string; vassal: string }
  /**
   * Roční Odvody (vassalage.md – Roční dialog 1. 11.): vazal `vassal` odvedl pánovi `lord` řádky
   * `parts` (odvedeno z domluveného; `good` je řádek Odvodů – `LevyGood`, `years` – za kolik let).
   */
  | {
      kind: 'levy';
      lord: string;
      vassal: string;
      years: number;
      parts: { good: string; sent: number; agreed: number }[];
    }
  /**
   * Rod `name` neposlechl pána: nesplnil rozsudek, nebo rozpoutal válku přes rozsudek „mír“
   * (vassalage.md – Mír a spory); text je neutrální.
   */
  | { kind: 'disobeyed'; name: string }
  /**
   * Plátce `payer` neposlal příjemci `recipient` celý tribut z míru (war.md – Konec války:
   * neplnění se zapíše, řešení je na hráčích); text je neutrální, bez pána a vazala.
   */
  | { kind: 'tribute-short'; payer: string; recipient: string }
  /** Rod `name` ohlásil průchod vojska (war.md – Pohyb); do kronik obou rodů. */
  | { kind: 'passage-announced'; name: string }
  /** Vazal `name` nepřišel na svolání do války (vassalage.md – Svolání); do kronik obou rodů. */
  | { kind: 'no-show'; name: string }
  /** Rod `blocker` zablokoval rod `blocked` (vassalage.md – Meze); zapisuje se do kronik obou. */
  | { kind: 'blocked'; blocker: string; blocked: string }
  /** Vedlejší manželka odešla z přeplněného dvorce do vlastního domu (lord.md – Manželky). */
  | { kind: 'wife-left-manor' }
  /**
   * `age` – věk zemřelého v celých letech (štěstí: starší ubere méně, happiness.md); starší
   * události bez něj. `cause: 'hunger'` – zemřel hlady (nahromaděný hlad, population.md); jinak
   * bez údaje. `name` – jméno zemřelého muže rodu (lord.md – Kde se jméno ukazuje); ostatní ho
   * nemají.
   */
  | {
      kind: 'death';
      group: 'child' | 'adult' | 'elder';
      age?: number;
      /** `war` – padl v boji (war.md – Ztráty), `wounds` – zemřel na rány. */
      cause?: 'hunger' | 'hunt' | 'flood' | 'tornado' | 'war' | 'wounds';
      /** Zvěř, na jejímž lovu muž zahynul (`cause: 'hunt'`). */
      prey?: 'boar' | 'bear';
      name?: string;
      /** Id zemřelého muže rodu (vždy spolu s `name`) – den smrti pro los nástupnictví hráče. */
      personId?: number;
    }
  /** Zemřel poslední člověk – ves vymřela (population.md – Hlad a vymření). */
  | { kind: 'village-extinct' }
  | { kind: 'household-founded'; dwellingId: number }
  | { kind: 'household-merged'; fromDwellingId: number; toDwellingId: number }
  /**
   * Svatba ve vsi (kinship.md – Sňatky) – nevěsta (s vlastními dětmi do 16 let) z domu `from` se
   * přestěhovala k muži do domu `to` (ze stejného domu from = to); `groomMoved` – naopak ženich se
   * přiženil k nevěstě, která drží dům; `widow` – vdávala se vdova (už má děti).
   */
  | ({
      kind: 'marriage';
      fromDwellingId: number;
      toDwellingId: number;
      groomMoved?: true;
      widow?: true;
      /**
       * Domy ženicha a nevěsty před svatbou (id obydlí – kinship.md, Svatba ve scéně: odkud jde
       * průvod); události zapsané dřív je nemají – odvodí se z `fromDwellingId` / `toDwellingId`.
       */
      groomFromDwellingId?: number;
      brideFromDwellingId?: number;
    } & WeddingCouple)
  /** Muž z domu `dwellingId` si přivedl nevěstu z okolí (kinship.md – Sňatky z okolí). */
  | ({ kind: 'bride-from-outside'; dwellingId: number } & WeddingCouple)
  /**
   * K ženě z domu `dwellingId` se přiženil muž z okolí (kinship.md – Sňatky z okolí); `widow` –
   * k vdově.
   */
  | ({ kind: 'groom-from-outside'; dwellingId: number; widow?: true } & WeddingCouple)
  /** Dcera z domu `dwellingId` se vdala pryč – odešla ze vsi (kinship.md – Sňatky z okolí). */
  | { kind: 'married-away'; dwellingId: number }
  | {
      kind: 'construction-finished';
      constructionKind: ConstructionKind;
      dwellingId: number | null;
      fieldId: number | null;
      /** Dostavěná řemeslná dílna (crafts.md); u ostatních staveb chybí. */
      craft?: Craft;
      /** Dostavěná vozová cesta (roads.md – Vozová cesta); u ostatních staveb chybí. */
      wagon?: true;
    }
  /**
   * Zbořený úsek opevnění (demolition.md – Opevnění): plot, palisáda či nástavba valu, nebo
   * srovnaný val (`level`); `logs` klád přišlo na hromadu u cesty.
   */
  | { kind: 'fortification-demolished'; logs: number; level?: true }
  /** Hráč zrušil rozestavěnou stavbu (cancel-construction.ts); dřevo se vrátilo na hromadu. */
  | { kind: 'construction-cancelled'; constructionKind: ConstructionKind; craft?: Craft }
  /**
   * Opuštěné díly pole (fields.md – Opuštěný díl): kolik dílů vypadlo z osevu a zaroste (osetý až
   * po žních).
   */
  | { kind: 'parts-abandoned'; parts: number }
  /** Opuštěné díly pole se vrátily do osevního postupu (fields.md – Opuštěný díl). */
  | { kind: 'parts-returned'; parts: number }
  | { kind: 'rebuild-decided'; dwellingId: number; type: DwellingType }
  /** Domácnost obydlí `dwellingId` si začala stavět nový dům typu `type` (migration.md). */
  | { kind: 'relocation-started'; dwellingId: number; type: DwellingType }
  /** Hráč zrušil rozestavěné přestěhování domácnosti `dwellingId` (migration.md). */
  | { kind: 'relocation-cancelled'; dwellingId: number }
  /** Domácnost se přestěhovala do dostavěného domu – starý dům zůstal prázdný (migration.md). */
  | { kind: 'household-relocated'; fromDwellingId: number; toDwellingId: number }
  /**
   * Domácnosti odešly založit novou ves (migration.md – Odchod do nové vsi): kolik domácností
   * a lidí, na novou mapu i se směrem (na téže mapě bez směru).
   */
  | { kind: 'households-left'; households: number; people: number; direction?: Direction8 }
  /**
   * Syn vojvody odešel s poměrnou částí vsi založit ves (lord.md – Dělení vsi, Nová ves: „Bořivoj
   * odešel založit ves Lhota“): `name` jméno syna, `village` jméno nové vsi (bez něj chybí), kolik
   * celých domácností a lidí s ním odešlo (lidé i s jeho rodinou), na novou mapu i se směrem.
   */
  | {
      kind: 'son-left-village';
      name?: string;
      village?: string;
      households: number;
      people: number;
      direction?: Direction8;
    }
  /**
   * Odešli všichni – ves je opuštěná (migration.md); `reason: 'line-ended'` – rod vymřel a ves
   * zanikla s lidmi jako záznamem (lord.md – Konec rodu).
   */
  | { kind: 'village-abandoned'; reason?: 'line-ended' }
  /** Lidé vyrazili na novou mapu – dorazí v den `arrivalDay` (migration.md – fáze 4). */
  | { kind: 'journey-started'; direction: Direction8; arrivalDay: number }
  /**
   * Sklizeň – plodina, když ves seje ozim i jař (ozim v červenci, jař v srpnu); bez ní jen jař
   * (ves bez ozimu, starší sklizně). `legume` – luštěniny (kg do zásoby luštěnin, ne obilí).
   */
  | { kind: 'harvest'; kg: number; crop?: Crop }
  /** Konec sklizně jablek (1. 11.) – kolik kg se sklidilo. */
  | { kind: 'apple-harvest'; kg: number }
  /**
   * Při trhání lnu (31. 7.): ves sklidila jen `kg` třeného lnu z `neededKg`, které potřebuje na
   * oděv (fields.md – Len, diet.md – Oděv).
   */
  | { kind: 'linen-short'; kg: number; neededKg: number }
  /** Podzimní porážka (diet.md – 1. 11.): kolik kg masa a kolik kusů kterého druhu. */
  | {
      kind: 'slaughter';
      kg: number;
      animals: Partial<Record<HerdSpecies, number>>;
      /** Z toho maso kusů, které se porážejí po dnech přes zimu (diet.md – Porážka v zimě). */
      fresh?: number;
    }
  /**
   * Nouzová porážka (diet.md – Nouzová porážka): výhled jídla do sklizně nevycházel, ves porazila
   * zvířata navíc – kolik kg masa a kusů (na setiny) kterého druhu.
   */
  | { kind: 'emergency-slaughter'; kg: number; animals: Partial<Record<HerdSpecies, number>> }
  /**
   * Zbytek uzeného masa se zkazil (diet.md – Trvanlivost masa, 1. 9.) – kolik kg; méně než kilo
   * se nezapíše.
   */
  | { kind: 'meat-spoiled'; kg: number }
  /**
   * Přes zimu chybělo přes polovinu sena – část stáda uhynula (diet.md – Zimní úhyn, 1. 3.); kusy
   * po druzích na setiny. Jen kronika uložená před 24. 10. 2026 – od té doby ves poráží
   * (`hay-slaughter`).
   */
  | { kind: 'herd-starved'; animals: Partial<Record<HerdSpecies, number>> }
  /**
   * Seno do konce března nevystačí – ves hned porazila kusy, na které nezbude (oxen.md – Co nejvíc
   * sena a co největší stáda): kolik kg masa a kusů (na setiny) kterého druhu.
   */
  | { kind: 'hay-slaughter'; kg: number; animals: Partial<Record<HerdSpecies, number>> }
  /**
   * Při porážce: ovce, které ves nechala přes zimu (`sheep`, na desetiny), nedají vlnu na oděv pro
   * všechny – potřeba by byla `needed` ovcí (diet.md – Oděv).
   */
  | { kind: 'wool-short'; sheep: number; needed: number }
  /**
   * Voli v ohradě jsou vycvičení – táhnou rádla a vozy (oxen.md; `oxen` – kolik, chybí = pár ve
   * vsích uložených dřív).
   */
  | { kind: 'team-ready'; penId: number; oxen?: number }
  /** Voli dosloužili – zestárli (oxen.md, ≈ 10 let), šli na maso (`oxen` jako u `team-ready`). */
  | { kind: 'team-retired'; penId: number; oxen?: number }
  /**
   * Přes zimu chybělo přes polovinu sena – voli (`training` – telata ve výcviku) uhynuli
   * (`oxen` – kolik; chybí = spřežení se rozpadlo ve vsích uložených dřív).
   */
  | { kind: 'ox-died'; penId: number; training: boolean; oxen?: number }
  /** Koně uhynuli 1. 3. pro nedostatek sena (horses.md – Krmení). */
  | { kind: 'horse-starved'; penId: number; horses: number }
  /** Klisny ohrady porodily 1. 5. hříbata (horses.md – Chov; `foals` – kolik). */
  | { kind: 'foal-born'; penId: number; foals: number }
  /** Do nově dostavěné ohrady koní přivedli hřebce a dvě klisny (horses.md – Koně se stavbou ohrady). */
  | { kind: 'horses-arrived'; penId: number; horses: number }
  /** Kůň pod jezdcem došel plného výcviku (horses.md – Výcvik koně a jezdec). */
  | { kind: 'horse-trained'; penId: number; horseId: number }
  /** Jezdecké koně podkovali (horses.md – Kování; `own` – vlastní kovář, jinak z jiné vsi). */
  | { kind: 'horses-shod'; horses: number; own: boolean }
  /**
   * Koně šli 1. 11. na maso (horses.md – Chov): dosloužili ve 20 letech (`age`), nebo jich ves má
   * víc, než chce (`surplus` – nejdřív nejstarší).
   */
  | { kind: 'horse-retired'; penId: number; horses: number; reason: 'age' | 'surplus' }
  /** Do kraje přišel nový medvěd (wildlife.md – Roční přepočet: ulovený se vrací za 3 roky). */
  | { kind: 'bear-returned' }
  /** Šelmy strhly dobytek (wildlife.md – Vlci na dobytku; `heads` – celé kusy dne). */
  | { kind: 'predator-kill'; species: HerdSpecies; by: 'wolf' | 'bear'; heads: number }
  /** Velký lov rodu (wildlife.md – Lov rodu): úlovek dne, maso do zásoby a nejlepší lovec. */
  | { kind: 'hunt'; kills: HuntKills; meatKg: number; names: string[] }
  /** Lovec byl zraněn a 60 dní nepracuje (wildlife.md – Nebezpečí pro lidi). */
  | { kind: 'hunt-injury'; prey: 'boar' | 'bear'; name?: string }
  /** Po žních: zvěř a vrány zničily `kg` obilí na polích (wildlife.md – Škody). */
  | { kind: 'wildlife-damage'; kg: number }
  /** Sad dosloužil (60. rok) a vrátil se v louku. */
  | { kind: 'orchard-gone'; orchardId: number }
  /** Vesničané zařadili čtverce starého sadu do obnovy (orchard.md – Obnova sadu). */
  | { kind: 'orchard-renewal-started'; orchardId: number; squares: number }
  /**
   * Pole nebo sad ustoupil stavbě obydlí (population.md – Obydlí na poli a v sadu): o kolik m² se
   * zmenšil, a jestli tím zanikl (dům sebral poslední čtverec).
   */
  | {
      kind: 'land-taken';
      land: 'field' | 'orchard';
      id: number;
      areaM2: number;
      gone: boolean;
      /** Co půdu vzalo (fields.md – Pole jako krajina); bez údaje obydlí (starší události). */
      by?: LandTaker;
    }
  | { kind: 'hunger-began' }
  | { kind: 'hunger-ended' }
  /** Vojvodova rodina jde na pole – hrozí hlad (lord.md – Kdy jde rodina na pole). */
  | { kind: 'lord-to-field'; reason: 'hunger' | 'sowing' }
  /** Vojvodova rodina se vrací k výcviku – 30 dní plného přídělu (lord.md). */
  | { kind: 'lord-to-training' }
  /**
   * Nepasený a nesečený příloh zarostl lesem a z pole vypadl (fields.md – Zarůstání): první díl,
   * pole, kolik dílů a jestli pole zaniklo. U událostí ze staršího pravidla (do 18. 10. 2026)
   * je jen `partId`.
   */
  | {
      kind: 'part-became-forest';
      partId: number;
      fieldId?: number;
      parts?: number;
      gone?: boolean;
    }
  /** Vesničané při mýcení ušetřili posvátný dub nebo dubový háj (happiness.md) – id místa. */
  | { kind: 'sacred-spared'; site: 'oak' | 'grove'; id: number }
  /** Ušetřený posvátný dub stářím uschl – zůstala posvátná souš (happiness.md) – id dubu. */
  | { kind: 'sacred-oak-died'; id: number }
  /** Posvátná souš padla – místo už není posvátný dub (happiness.md) – id dubu. */
  | { kind: 'sacred-snag-fell'; id: number }
  /** Z dlouhodobého provozu vznikla pevná cesta (roads.md) – id úseku. */
  | { kind: 'road-formed'; roadId: number }
  /** Nepoužívaná vyšlapaná cesta zarostla (roads.md – Zarůstání) – id úseku. */
  | { kind: 'road-overgrown'; roadId: number }
  /** Zemská stezka ke kraji mapy je dostavěná – obchod se sousedem (trade.md). */
  | { kind: 'trail-built'; trailId: number; direction: Direction8 }
  /**
   * Výprava nosičů vyrazila k sousedovi – co nesou (trade.md – Obchod) a kdo s ní odešel do
   * sousední vsi (`people` – trade.md, Výměna lidí; chybí = nikdo).
   */
  | { kind: 'trade-departed'; direction: Direction8; give: TradeGoods; people?: TradePeople }
  /**
   * Výprava se vrátila – co přinesla (trade.md – Obchod) a kdo s ní přišel (`people`; chybí =
   * nikdo).
   */
  | { kind: 'trade-returned'; direction: Direction8; get: TradeGoods; people?: TradePeople }
  /**
   * Vesničané koupili výrobky řemeslníků u souseda (crafts.md – Nákup u sousedů) – kg nástrojů,
   * keramiky a dřevěného nářadí, čím platili (kg obilí a luštěnin).
   */
  | {
      kind: 'crafts-bought';
      direction: Direction8;
      get: CraftPurchaseGoods;
      pay: CraftPurchasePay;
    }
  /**
   * Ves koupila u sousedů osivo na setí nutných dílů (fields.md – Osivo pro ves bez zásob): kg
   * obilí na osivo, obilí do zásob za přeplatek posledního kusu dobytka (`changeKg`; chybí = nic)
   * a čím platila – hřivny (kg) a krávy (kusy).
   */
  | {
      kind: 'seed-bought';
      seedKg: number;
      changeKg?: number;
      pay: { ironBarsKg?: number; cows?: number };
    }
  /**
   * Ves nemá osivo na setí nutných dílů a koupit ho nemohla (fields.md – Osivo pro ves bez zásob):
   * kolik osiva chybí (kg) – nemá čím zaplatit (`pay`), nebo sousedé obilí nemají (`supply`).
   */
  | { kind: 'seed-short'; shortKg: number; reason: 'pay' | 'supply' }
  /** Tesař vyrobil vůz (wagons.md – Tesař). */
  | { kind: 'cart-made'; cart: CartKind }
  /**
   * Ves nemá kováře – tesař (`son` – jeho syn) šel pro kování k vozu do nejbližší vsi s kovářem
   * `to` (jméno; soused za krajem mapy ve směru `direction` – wagons.md, Kování vozů).
   */
  | {
      kind: 'iron-trip';
      cart: CartKind;
      to: string;
      son: boolean;
      direction?: Direction8;
      /** Kolik nosičů šlo s tesařem; `byCart` – platbu vezl vůz se sedlákem. */
      porters?: number;
      byCart?: true;
    }
  /** Tesař (`son` – jeho syn) přinesl kování k vozu – vůz je hotový (wagons.md – Kování vozů). */
  | { kind: 'iron-brought'; cart: CartKind; son: boolean }
  /** Vůz dosloužil (wagons.md – Vůz) – tesař vyrobí nový, když ho ves potřebuje. */
  | { kind: 'cart-worn-out'; cart: CartKind }
  /**
   * S výpravou přišli lidé od souseda (trade.md – Výměna lidí): rodina, svobodný muž nebo žena,
   * kolik jich je a do kterého obydlí šli.
   */
  | {
      kind: 'newcomer';
      direction: Direction8;
      group: NewcomerGroup;
      people: number;
      dwellingId: number;
    }
  /**
   * Opuštěná stavba, ke které léta nikdo nechodil, se rozpadla (abandonment.md): modla padla,
   * svatyně se rozpadla, plot hřbitova se rozpadl, ohrada se rozpadla – id stavby.
   */
  | { kind: 'structure-fell'; structure: AbandonedStructure; id: number }
  /**
   * Hráč nebo správce stavbu opustil, nebo opuštěnou vrátil (demolition.md – Opuštění): obydlí,
   * ohrada, modla nebo svatyně – id stavby.
   */
  | { kind: 'structure-abandoned' | 'structure-restored'; structure: UsableStructure; id: number }
  /**
   * Vesničané opravili stavbu, ke které se zase chodí (abandonment.md – Oprava): modlu, svatyni,
   * plot hřbitova (i spadlý postavili znovu) nebo ohradu – id stavby.
   */
  | { kind: 'structure-repaired'; structure: AbandonedStructure; id: number }
  /**
   * Ukázalo se počasí roku kraje (disasters.md – Léto, Zima, „Kdy je vidět“): zlá zima, nebo
   * neobvyklé léto (mokré žně jsou 1. 6. deštivé léto, 15. 7. mokré žně).
   */
  | { kind: 'weather'; summer?: SummerWeather; winter?: WinterWeather }
  /**
   * Požár (disasters.md – Požár): chytlo obydlí `startedDwellingId`, shořela obydlí
   * `burnedDwellingIds` (včetně něj); ztráty zásob v kg (zrno mimo jámy, maso, sýr, seno).
   */
  | {
      kind: 'fire';
      startedDwellingId: number;
      burnedDwellingIds: number[];
      /** Z nich zřícená (dům na nulu) – ostatní stojí ohořelé; chybí v kronice uložené dřív (všechna). */
      collapsedDwellingIds?: number[];
      lostGrainKg: number;
      lostMeatKg: number;
      lostCheeseKg: number;
      lostHayKg: number;
      /** Zásoby shořelých dílen (kg): uhlí a železo kovárny, keramika hrnčířství; starší zápisy chybí. */
      lostCharcoalKg?: number;
      lostIronKg?: number;
      lostPotteryKg?: number;
    }
  /**
   * Kroupy (disasters.md – Kroupy): pruh potloukl nesklizené díly `partIds` a střechy staveb
   * `dwellingIds`; `meadowShare` = podíl sena nesečené louky, který ubyl, `appleShare` = podíl
   * letošních jablek, který ubyl (chybí = nic).
   */
  | {
      kind: 'hail';
      partIds: number[];
      dwellingIds: number[];
      meadowShare?: number;
      appleShare?: number;
    }
  /**
   * Povodeň (disasters.md – Povodeň potoka): voda kraje stupně `level` (`heightM` nad hladinou
   * potoka) zatopila díly `partIds` a stavby `dwellingIds`, z nich `collapsedDwellingIds` se
   * zřítily; `meadowShare` = podíl sena nesečené louky, který ubyl, `lostGrainKg` = zrno, které
   * zateklo do jam. Úmrtí jsou zvlášť (`death`, `cause: 'flood'`).
   */
  | {
      kind: 'flood';
      level: FloodLevel;
      heightM: number;
      partIds: number[];
      dwellingIds: number[];
      collapsedDwellingIds: number[];
      meadowShare?: number;
      lostGrainKg?: number;
    }
  /**
   * Smršť (disasters.md – Smršť (tornádo)) síly `strength`: pás poničil stavby `dwellingIds`,
   * z nich `collapsedDwellingIds` se zřítily, polehlé nesklizené díly `partIds`; `uprootedTrees`
   * = vyvrácené stromy v okolí vsi (kmeny na hromadě klád), `orchardSquares` = vyvrácené čtverce
   * sadů, `roadApples` = vyvrácené jabloně u cest, `meadowShare` = podíl sena nesečené louky,
   * který ubyl, `lostHayKg` = rozmetané seno stohů. Úmrtí jsou zvlášť (`death`, `cause: 'tornado'`).
   */
  | {
      kind: 'tornado';
      strength: TornadoStrength;
      partIds: number[];
      dwellingIds: number[];
      collapsedDwellingIds: number[];
      uprootedTrees: number;
      orchardSquares?: number;
      roadApples?: number;
      meadowShare?: number;
      lostHayKg?: number;
    }
  | {
      kind: 'cemetery-full';
      cemeteryId: number;
      /** Jiný hotový hřbitov má volný hrob. */
      othersFree: boolean;
      /** Nějaký hřbitov nebo rozšíření se právě staví (u starších událostí chybí). */
      othersBuilding?: boolean;
    }
);
// Rozdělení práce dne po činnostech a místech (labor-report.ts) – jen pro zobrazení postav.
/** Činnost, na kterou šla práce dne. */
export type LaborActivity =
  /** Polní práce plánu (fields.md – Práce); sklizeň srpem a odnos v nůších zvlášť. */
  | 'reclaim'
  | 'dig'
  | 'sow'
  | 'weed'
  | 'harvest'
  | 'carry'
  | 'thresh'
  /** Orba rádlem – oráč a honáček se spřežením (oxen.md). */
  | 'plough'
  /** Sečení, sušení a stohování sena (oxen.md – Seno). */
  | 'mow'
  /** Porážka a uzení masa (diet.md). */
  | 'slaughter'
  /**
   * Dojení a zpracování mléka na sýr (diet.md – Práce se zvířaty) – bokem, ne z práce vsi
   * (`LaborDay.aside`).
   */
  | 'milking'
  /**
   * Pasení dospělým z práce vsi – ves bez výrostků (diet.md – Pasáci, Dospělý pasák; od 2. 11. 2026)
   * a v rozdělení práce z doby před 19. 10. 2026.
   */
  | 'herding'
  /**
   * Péče o zvířata – zimní krmení, voda a kydání krav a volů, prasata a slepice; bokem
   * (`LaborDay.aside`).
   */
  | 'animal-care'
  /** Péče o koně u ohrady koní – krmení, voda a kydání, hodina denně na koně (horses.md – Péče). */
  | 'horse-care'
  /** Kování jezdeckých koní vlastním kovářem u ohrady koní (horses.md – Kování). */
  | 'horse-shoeing'
  /** Rybaření vesničanů u tůně (wildlife.md – Drobná zvěř a ryby; rybář s prutem). */
  | 'fish'
  /** Noční hlídka polí dospělými (wildlife.md – Obrana polí; `allocation.tasks.watch`). */
  | 'watch'
  /** Oka na zajíce v zimě (wildlife.md – Drobná zvěř a ryby). */
  | 'snare'
  /** Sezónní práce v sadech (orchard.md). */
  | 'orchard-care'
  | 'orchard-harvest'
  /** Společná práce do staveb: stavba obydlí, kácení jeho dřeva, zakládání pole, výsadba sadu, hřbitov. */
  | 'build'
  /** Stavba ohrady a výroba rádla (oxen.md). */
  | 'pen'
  | 'fell'
  | 'found-field'
  | 'orchard-plant'
  | 'cemetery'
  /** Opravy obydlí (population.md), oprava modly a svatyně (abandonment.md – Oprava). */
  | 'repair'
  /** Řemeslník v dílně (crafts.md) – výroba uhlí, nástrojů nebo keramiky. */
  | 'craft'
  /** Uhlíř sází mladé buky na pařezy (crafts.md – Uhlíř, obnova lesa). */
  | 'plant'
  /**
   * Kopání, praní a pražení bahenní rudy na rudišti – kovář a synové od 14 let (crafts.md – Uhlí
   * a ruda kováře).
   */
  | 'ore'
  /** Kopání hlíny na hliništi – hrnčíř a synové od 14 let (crafts.md – Hlína hrnčíře). */
  | 'clay'
  /**
   * Obilné jámy (production-chains.md – Obilné jámy): vesničané kopou jámu, vypalují ji, nosí do
   * ní vymlácené zrno z humna a zapečetí ji.
   */
  | 'grain-pit'
  /**
   * Nošení uhlí od milíře a rudy z rudiště do kovárny v koších – synové kováře (uhlí od 10 let,
   * rudu od 14) nebo kovář sám (crafts.md – Uhlí a ruda kováře); kdo nese, je v `LaborShare.ages`.
   */
  | 'fetch'
  /**
   * Denní minimum domácností (fields.md – Práce, bod 1); domácí výroba žen jde bokem
   * (`LaborDay.aside`).
   */
  | 'domestic'
  /** Nosiči výpravy k sousedovi po zemské stezce (trade.md – Obchod). */
  | 'trade'
  /**
   * Svoz vozem (wagons.md – Vůz): honák a nakladač s vozem – snopy z pole, seno z luk, klády ke
   * stavbám, a co vozy vozí mimo svoz (Co vozy vozí – `LaborShare.job`): uhlí z milíře, osivo na
   * pole, vodu v sudech. Kolik vozů jede, je v `LaborShare.carts`.
   */
  | 'haul'
  /** Společná práce, na kterou nezbyla žádná stavba ani oprava (propadla). */
  | 'idle';

/** Kde se práce dělá. */
export type LaborTarget =
  /**
   * Pole (id) – osévané díly plánu, zakládané díly. U polních prací `parts` = díly pole, přes
   * které dnes práce postoupila (čelo práce, v pořadí postupu); bez nich celé pole.
   */
  | {
      kind: 'field';
      id: number;
      parts?: number[];
      /**
       * U orby: kolik orby dílu bylo hotovo na začátku a na konci dne (0–1, ke každému dílu
       * `parts`) – kudy dnes spřežení prošlo (scéna projede celou dnešní orbu – oxen.md).
       */
      progress?: [number, number][];
    }
  /** Loviště ryb – tůň do 1 km od vsi (pořadí od nejbližší; wildlife.md – Drobná zvěř a ryby). */
  | { kind: 'pool'; index: number }
  /** Hotové obydlí (id) – opravy, přestavba, práce řemeslníka v dílně. */
  | { kind: 'dwelling'; id: number }
  /** Staveniště nového obydlí – id stavby. */
  | { kind: 'site'; id: number }
  /** Sad (id) – výsadba, péče, sklizeň. */
  | { kind: 'orchard'; id: number }
  /** Hřbitov (id) – zakládání, rozšíření a oprava plotu (abandonment.md – Oprava). */
  | { kind: 'cemetery'; id: number }
  /** Hotová modla nebo svatyně (id stavby) – oprava (abandonment.md – Oprava). */
  | { kind: 'sacred'; id: number }
  /** Ohrada (id) – stavba, rádlo, péče o krávy a voly v zimě. */
  | { kind: 'pen'; id: number }
  /** Pevná cesta (id úseku) – vylepšení a jabloně podél ní (roads.md). */
  | { kind: 'road'; id: number }
  /**
   * Stavba vozové cesty (roads.md – Vozová cesta) – id stavby a čelo práce na ose (m): úsek, který
   * ještě není cestou.
   */
  | { kind: 'wagon'; id: number; x: number; z: number }
  /** Přirozená louka – políčka, na kterých se dnes seče seno (oxen.md – Seno). */
  | { kind: 'meadow'; cells: TileCell[] }
  /** Stromy z vrstvy překážek, které se pro stavbu nebo dílnu právě kácejí (i pařezy k sázení). */
  | { kind: 'trees'; ids: number[] }
  /**
   * Milíř uhlíře (crafts.md – Milíř u skácených buků) – dílna (id obydlí), střed milíře ve světě (m)
   * a id milíře (`kiln`; chybí jen u rozdělení práce ze starší vsi); odkud se nosí uhlí ke kováři
   * (`from` = id kovárny – nosí se z milíře do ní; crafts.md – Uhlí a ruda kováře).
   */
  | { kind: 'kiln'; id: number; x: number; z: number; from?: number; kiln?: number }
  /**
   * Rudiště kováře (crafts.md – Uhlí a ruda kováře) – kovárna (id obydlí) a místo, kde se kope
   * (m): kopání u jámy, nošení rudy z něj do kovárny, jízda vozu pro rudu.
   */
  | { kind: 'ore'; id: number; x: number; z: number }
  /**
   * Hliniště hrnčíře (crafts.md – Hlína hrnčíře) – dílna (id obydlí) a místo, kde se kope (m):
   * kopání u jámy, nošení hlíny k dílně, jízda vozu pro hlínu.
   */
  | { kind: 'clay'; id: number; x: number; z: number }
  /** Zemská stezka (id) – nosiči výpravy k sousedovi (trade.md – Obchod). */
  | { kind: 'trail'; id: number }
  /**
   * Cesta krajinou ke kraji mapy ve směru (bez zemské stezky) – nákup u souseda (crafts.md –
   * Nákup u sousedů); bod na kraji mapy (m).
   */
  | { kind: 'edge'; direction: Direction8; x: number; z: number }
  /** Břeh vody, kam vůz jezdí pro vodu v sudech (wagons.md – Co vozy vozí); bod ve světě (m). */
  | { kind: 'water'; x: number; z: number }
  /**
   * Hotové humno (id) – výmlat snopů a odvívání zrna (production-chains.md – Humno); snopy se na
   * něj nosí z polí, zrno z něj do zásob.
   */
  | { kind: 'threshing-floor'; id: number }
  /**
   * Obilná jáma (production-chains.md – Obilné jámy) – id jámy (i nové, kterou vesničané teprve
   * kopou) a její střed (m): kopání, plnění a pečetění jámy.
   */
  | { kind: 'grain-pit'; id: number; x: number; z: number }
  /**
   * Ves celkově – nouzový výmlat na udusané zemi u domů (rok odkladu starší vsi), porážka, domácí
   * práce, nevyužitá společná práce.
   */
  | { kind: 'village' };

export interface LaborShare {
  activity: LaborActivity;
  target: LaborTarget;
  /** Člověkodny (na tisíciny). */
  manDays: number;
  /**
   * Stavba, do které práce šla (stavba i kácení jejího dřeva, zakládání pole, výsadba sadu,
   * hřbitov) – scéna podle ní ukáže u každé stavby, která dnes dostala práci, aspoň jednoho
   * člověka. U ostatní práce (a u rozdělení uložených dřív) chybí.
   */
  construction?: number;
  /** Svoz a výprava s vozy (wagons.md): kolik vozů tu dnes jezdí; u ostatní práce chybí. */
  carts?: number;
  /** Z nich čtyřkoláky (svoz, kam dojedou – wagons.md, Co se vozí a na čem); chybí = žádný. */
  fourWheel?: number;
  /**
   * Co vůz veze, když nesváží úrodu, seno ani klády (wagons.md – Co vozy vozí): uhlí z milíře,
   * osivo na pole, vodu v sudech. U svozu a ostatní práce chybí.
   */
  job?: CartJob;
  /**
   * Kdo práci dělá (věk v letech, od nejstaršího) – u kopání a nošení kováře (crafts.md – Uhlí
   * a ruda kováře): kovář, nebo jeho synové; postavy pod 14 let jsou děti. U ostatní práce chybí.
   */
  ages?: number[];
  /**
   * Podíl žen mezi dospělými, kteří práci dělají (0–1) – u pletí dospělých (fields.md – Pletí
   * jednou a rychle: plejí napřed ženy vsi, muži jen zbytek). U ostatní práce chybí – scéna vezme
   * podíl podle činnosti.
   */
  women?: number;
}

/** Rozdělení práce jednoho dne – uložené ve stavu vsi (`VillageState.labor`). */
export interface LaborDay {
  day: number;
  shares: LaborShare[];
  /**
   * Kolik výrostků 7–13 let dnes pase (diet.md – Pasáci) – pasou bez práce vsi, proto nejsou
   * v `shares`. Starší (`elders`) jen v rozdělení práce z doby před 19. 10. 2026. Bez údaje se
   * neví (dřívější rozdělení).
   */
  herders?: { children: number; elders?: number };
  /**
   * Práce bokem – mimo práci vsi (population.md – Práce; Martin 19. 10. 2026): dojení a péče
   * o zvířata a domácí výroba (ženy), denní minimum, které pokryli starší – jen pro postavy ve
   * scéně, v `shares` nejsou.
   */
  aside?: LaborShare[];
  /**
   * Vojvodova rodina mimo práci vsi (lord.md – Den rodiny; počty lidí – pro scénu a lištu): kolik
   * jich cvičí, kolik je na poli a kolik žen vede domácnost dvorce. Chybí, když rodina pracuje
   * jako ostatní (i dřívější rozdělení).
   */
  lord?: { training: number; field: number; household: number };
  /**
   * Kusy poražené dnes (zimní den, 1. 11., nouzová porážka, porážka pro seno; i zlomky kusů) –
   * jen hlášení pro scénu (porážka ve scéně), simulace ho nečte. Chybí, když se dnes neporáželo.
   */
  slaughterHeads?: Partial<Record<HerdSpecies, number>>;
}
