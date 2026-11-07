// Obydlí, pozemky, kácení, humno, odchod do nové vsi a chátrání staveb (část rozdělených pravidel, rozcestník je rules.ts).

import type { DwellingType, PlotVariant } from './types';
import { CEMETERY_FENCE_INSET_M, DWELLINGS } from './rules-people';

// population.md – Umístění obydlí (půdorys zemnice ≈ 4 × 4 m, polozemnice 5 × 5 m, rovina ≤ 0,5 m)
export const DWELLING_FOOTPRINT_M: Record<DwellingType, { width: number; depth: number }> = {
  zemnice: { width: 4, depth: 4 },
  polozemnice: { width: 5, depth: 5 },
  // trade.md – Dvorec (návrh Clauda): srub 5 × 8,4 m s valy – tools/blender/dwellings.py
  dvorec: { width: 6, depth: 9.6 },
};
export const DWELLING_MAX_HEIGHT_DIFF_M = 0.5;
// population.md – Varianty rozměrů (Martin, GitHub #1, 20. 10. 2026: „Udělejme různé kombinace
// výšky, poměru stěn a plochy. Oproti současnému stavu smí být každý z těchto rozměrů jiný max
// o 10%.“; podrobnosti návrh Clauda): zemnice, polozemnice a dílny mají každá svou plochu, poměr
// stěn a výšku – odchylky nejvýš ±10 % proti tvaru z DWELLING_FOOTPRINT_M (dvorec ne, je jen
// jeden). Dveře a vstupní šíje se schody se nenatahují: pás |x| < doorHalfM zůstává, šíje
// (od `frontM` dál) se jen posune se štítem. Rozměry sedí s tools/blender/dwellings.py (DOOR)
// a s jámami ve scéně (PIT_SHAPES.halfZ – kde šíje začíná).
export const DWELLING_SHAPE = {
  /** Největší odchylka plochy, poměru stěn i výšky (podíl). */
  spread: 0.1,
  /** Polovina šířky dveří a vstupní šíje (m, dwellings.py – DOOR). */
  doorHalfM: 0.42,
  /** Kde (z, m od středu k vchodu) začíná vstupní šíje – PIT_SHAPES.halfZ ve scéně. */
  frontM: { zemnice: 1.98, polozemnice: 2.04, dvorec: 4.14 } as Readonly<
    Record<DwellingType, number>
  >,
  /**
   * Dům v rohu pozemku (PLOT_HOUSE_OFFSET_M) má k plotu napříč jen ≈ 0,35 m – smí se rozšířit
   * nejvýš tolikrát (škála šířky půdorysu), jinak by valy a trsy u okapu sahaly do plotu; plocha
   * se pro takovou variantu zmenší (`dwellingShape`). Hlídá test pozemku ve scéně.
   */
  plotCornerMaxWidth: 1.07,
} as const;
// population.md – Umístění obydlí (překážky na místě osadníci odstraní), fields.md – Co je
// překážka (obydlí: kusy na ploše ≈ 10 × 10 m kolem půdorysu). Plocha v souřadnicích modelu
// (x napříč, z k vchodu, m) – staveniště s hromadou hlíny a střecha předsazená před štíty;
// scéna podle ní kreslí staveniště (DWELLING_CLEARANCE_M). Obydlí na pozemku (PLOT_TYPES)
// vyklízí místo toho celé políčko pozemku – jako čtverec pole.
export const DWELLING_CLEARING_M: Record<
  DwellingType,
  { minX: number; maxX: number; minZ: number; maxZ: number }
> = {
  zemnice: { minX: -4.8, maxX: 4.8, minZ: -4.4, maxZ: 7.5 },
  polozemnice: { minX: -5.1, maxX: 5.1, minZ: -4.7, maxZ: 7.5 },
  dvorec: { minX: -5.4, maxX: 5.4, minZ: -6.4, maxZ: 9.5 },
};
// population.md – Umístění obydlí, Stavba v lese (Martin, 19. 10. 2026: „obydlí může jít postavit
// i v lese – les se prostě vyklučí“; šířka návrh Clauda): v lese osadníci kolem volně stojící
// stavby (obydlí, dílna, modla, svatyně) vyklučí i pruh, nad který by sahaly koruny okolních
// stromů – koruna ≈ 50 m² jako u posvátného dubu (SACRED_OAK.crownM2), poloměr ≈ 4 m. Dům pod
// korunami by stál ve stínu a vlhku a hráč by ho ve scéně neviděl.
export const FOREST_CROWN_MARGIN_M = 4;
// population.md – Umístění obydlí (Martin, 18. 10. 2026): polozemnice stojí na pozemku velkém
// jako jedno políčko pole (15 × 15 m, v mřížce políček), obehnaném polským plotem; dům uprostřed
// nebo v jednom ze čtyř rohů (5 variant), vchodem vždy k brance na přední straně (−z světa,
// natočení π), zbytek pozemku jsou záhony. Zemnice pozemek nemá (volná poloha).
export const PLOT_TYPES: Readonly<Record<DwellingType, boolean>> = {
  zemnice: false,
  polozemnice: true,
  dvorec: true,
};
/** Pořadí variant při přepínání klávesami [ a ]. */
export const PLOT_VARIANTS: readonly PlotVariant[] = [
  'center',
  'back-left',
  'back-right',
  'front-right',
  'front-left',
];
/**
 * Střed domu od středu pozemku (m, osy světa): v rozích tak, aby dům i se střechou, valy a trsy
 * trávy u okapu zůstal uvnitř plotu (plot ≈ 0,5 m od okraje políčka) a před vchodem rohového domu
 * vpředu zbyla cestička k brance.
 */
export const PLOT_HOUSE_OFFSET_M: Readonly<Record<PlotVariant, { x: number; z: number }>> = {
  center: { x: 0, z: 0 },
  'back-left': { x: -3.3, z: 3.2 },
  'back-right': { x: 3.3, z: 3.2 },
  'front-right': { x: 3.3, z: -2.3 },
  'front-left': { x: -3.3, z: -2.3 },
};
/** Natočení domu na pozemku – vchod k brance (−z světa). */
export const PLOT_HOUSE_ROTATION = Math.PI;
/**
 * Převod starších polozemnic na pozemky (Martin, 18. 10. 2026 – `withPlots`): dům blíž místu
 * varianty než tolik metrů se na něj posune, dál zůstane stát, kde je.
 */
export const PLOT_SNAP_M = 2;
/**
 * population.md – Obydlí na poli a v sadu (Martin, 18. 10. 2026: „Pole a sad se prostě zmenší
 * o plochu domu“; práh návrh Clauda): díl pole nebo čtverec sadu, kterému po stavbě obydlí zbude
 * méně než tento podíl políčka, zmizí celý – zbytek u domu by nikdo neobdělával.
 */
export const TAKEN_LAND_MIN_SHARE = 0.2;
/**
 * fields.md – Pole jako krajina (Martin, 18. 10. 2026: „Pole by se mělo chovat jako normální
 * krajina. Takže by na něm mělo jít postavit cokoliv kromě jiného pole.“; číslo návrh Clauda):
 * jabloň nebo strom u cesty vezme dílu pole tolik m² – pod korunou (≈ 5 m) se neorá ani neseje.
 */
export const TAKEN_LAND_TREE_M2 = 20;
/**
 * Polozemnice bez pozemku dostane při přestavbě nejbližší volné políčko – nejvýš tak daleko od
 * domu (m, ke středu políčka); dál žádné nehledá a zůstane bez pozemku.
 */
export const PLOT_RELOCATION_M = 50;
// fields.md – Překážka na louce (skalní výchoz se neodstraní, plocha pod ním se nepočítá):
// poloměr výchozu (m) na jednotku velikosti modelu (modely skal 0 A.D. mají půdorys ≈ 6 m)
export const OUTCROP_RADIUS_M = 3;
// forest.md – Les ustupuje (oprava podle rešerše, schválil Martin): z pařezu vyroste nálet
// a pokácený strom je ≈ za 30 let mladý stromek, za ≈ 70 let zase dospělý strom (dá se kácet)
export const TREE_SAPLING_AFTER_YEARS = 30;
export const TREE_REGROWTH_YEARS = 70;
// forest.md – Stavby a kácení (Martin – oprava podle rešerše 17. 10. 2026): strom = velký strom;
// zemnice ≈ 7 stromů, polozemnice ≈ 18 stromů; přestavba stejně jako nová stavba
export const DWELLING_TREES: Record<DwellingType, number> = {
  zemnice: 7,
  polozemnice: 18,
  // trade.md – Dvorec: dřevo polozemnice × 1,5
  dvorec: 27,
};
// forest.md – Kácení: skácení a dovoz 2 člověkodny za strom, +1 % za každých 10 m nad 100 m od
// staveniště (vzdálenost jako u polí – DISTANCE). U blízkého lesa stojí stavba práci jako dřív –
// cena obydlí (DWELLINGS.cost) v sobě kácení blízkého lesa už má (dwellingBuildLabor).
export const FELLING_MAN_DAYS_PER_TREE = 2;
// forest.md – Mýcení a hromada klád: dospělý strom z mýcení (pole, hřbitov, staveniště) = 1 kláda
export const LOGS_PER_CLEARED_TREE = 1;
// forest.md – Klády hnijí (Martin – oprava podle rešerše 17. 10. 2026): ≈ 4 % ročně
export const LOG_ROT_PER_YEAR = 0.04;

/** Práce na obydlí bez dřeva – cena obydlí minus kácení jeho stromů u blízkého lesa. */
export function dwellingBuildLabor(type: DwellingType): number {
  return DWELLINGS[type].cost - DWELLING_TREES[type] * FELLING_MAN_DAYS_PER_TREE;
}
// production-chains.md – Humno (stavba hráče; Martin 21. 10. 2026, varianta 1: „humno je jen mlat
// pod širým nebem – bez přístřešku“; čísla návrh Clauda podle rešerše
// research/2026-10-20-production-chains.md – Humno): udusaná a vymazaná mlatová plocha 8 × 10 m,
// ≈ 20 člověkodní (sejmutí drnu a srovnání 4–9, hlína na mazanici 4–6, kropení, dusání
// a vymazání ≈ 10), žádné dřevo ani stromy; přístřešek může přijít později jako vylepšení.
// Rozdíl výšek pod plochou nejvýš 1 m (mlat se při stavbě srovná). Osa x = šířka, z = délka
// (natočení jako obydlí – `Position.rotation`).
export const HUMNO = {
  sizeM: { x: 8, z: 10 },
  laborManDays: 20,
  trees: 0,
  maxHeightDiffM: 1,
} as const;

// abandonment.md – Chátrání (Martin 18. 10. 2026: „stavby, kam nikdo nechodí, budou postupně
// chátrat a rozpadnou se“; čísla návrh Clauda podle rešerše research/2026-10-18-abandonment.md):
// opuštěná stavba spadne za `fallYears` let od plného stavu – modla (dubový kůl Ø 0,5 m v zemi)
// 20, svatyně (kůl ×1,55) 30, pletený plot hřbitova 10, ohrada bez zvířat (přístřešek s došky,
// pletený plot) 10; zbytek padlé modly leží 10 let, zarostlý příkop svatyně 20 let. Stavba
// dokončená za poslední rok opuštěná není – lidé k ní chodili stavět.
export const ABANDONMENT = {
  fallYears: { idol: 20, shrine: 30, 'cemetery-fence': 10, pen: 10 },
  remnantYears: { idol: 10, shrine: 20 },
  graceDays: 365,
} as const;
// abandonment.md – Oprava (Martin 19. 10. 2026: vesničané plot hřbitova opraví sami, jakmile se
// ke hřbitovu zase chodí – postupně z práce vsi, spadlý postaví znovu; „ano“ i pro modlu, svatyni
// a ohradu; podíly návrh Clauda): stavba, ke které se zase chodí, se opraví stavbou ze společné
// práce – práce = `share` z ceny stavby bez kácení × chybějící stav. Opravuje se jen to, co
// chátrá: plot hřbitova je třetina vytyčení a ohrazení (10 čd na čtverec → 3 čd na čtverec
// i u spadlého plotu); u modly a svatyně řezba, kůl z dubu a příkop vydrží – oprava je znovu
// usadit a zaklínovat modlu, očistit ji, vyčistit příkop a založit ohniště (čtvrtina); ohrada je
// z poloviny pletený plot a došky, které hnijí (plot 7–8 let, sláma bez údržby 15–20) – sloupy
// a jesle vydrží (polovina). Dřevo oprava nebere (pruty, sláma a drn nejsou surovina).
export const STRUCTURE_REPAIR = {
  share: { idol: 0.25, shrine: 0.25, 'cemetery-fence': 0.3, pen: 0.5 },
} as const;

// migration.md – Odchod do nové vsi (návrh Clauda): s sebou jídlo, které unesou – 25 kg na
// člověka od 7 let, nejvýš poměrný díl zásob vsi podle počtu lidí; cesta na novou mapu 1–3 dny
// podle vzdálenosti ke kraji mapy (každých `perDayM` metrů den), po hotové zemské stezce 1 den.
// Osivo (fields.md – Osivo pro ves bez zásob; Martin 27. 10. 2026: „ok, jak navrhuješ“; čísla návrh
// Clauda): k jídlu nesou osivo na první osev – půl roční potřeby odcházejících (START_SEED_YEARS,
// jako nová ves) – nejvýš `seedKgPerCarrier` na nosiče navíc (s jídlem 45 kg) a volné místo vozu,
// jen z dílu zásob obilí vsi, který jim patří a který jako jídlo neunesli.
export const LEAVING = {
  carryKgPerPerson: 25,
  seedKgPerCarrier: 20,
  // migration.md – Jídlo před osivem na voze (návrh Clauda): osivo na vůz (nad to, co unesou pěšky)
  // jen z místa, které zbude po jídle na tolik dní
  cartSeedFoodDays: 180,
  carryFromAge: 7,
  travelDays: { min: 1, max: 3, perDayM: 400 },
} as const;

// Plot ohrady a hřbitova odsazený od okraje čtverce (oxen.md – Ohrady jsou menší než čtverec,
// cemetery.md – Plot hřbitova; Martin 23. 10. 2026: „Ohrady by měly být fyzicky menší než plocha,
// kterou zabírají. Když například vedle sebe budu mít ohradu s kozami a ohradu s ovcemi, musí mezi
// nimi být taková mezera, aby tam mohl projet vůz.“; volba Martina téhož dne: platí i pro hřbitov,
// kapacita na čtverec zůstává): plot stojí 1,5 m uvnitř čtverce 15 × 15 m, mezi dvěma sousedními
// ohradami (nebo ohradou a hřbitovem) je tedy ulička 3 m – míjí se v ní vůz i chodec. Mezi čtverci
// téže ohrady nebo téhož hřbitova plot není. Návrh Clauda: 1,5 m = polovina uličky pro vůz (≈ 2,2 m
// široký i s nákladem) s rezervou. Pozemek polozemnice (PLOT_*) zůstává 0,5 m od okraje.
// Číslo drží `CEMETERY_FENCE_INSET_M` (rules-people.ts) – plot ohrady i hřbitova je odsazen stejně.
export const PEN_FENCE_INSET_M = CEMETERY_FENCE_INSET_M;
// oxen.md – Plot podle délky (návrh Clauda): polovina práce ohrady (`PEN.laborManDays`) a 4 stromy ze
// 6 (`PEN.trees`) jsou plot, tedy strana čtverce stojí osminu práce a strom.
export const PEN_FENCE = { share: 0.5, trees: 4 } as const;
/** horses.md – Ohrada koní (návrh Clauda): plot koní je vyšší (jen pro scénu). */
export const PEN_FENCE_HEIGHT_M = { default: 1.1, horse: 1.4 } as const;
