import { describe, expect, it } from 'vitest';
import type { VillageState } from '../../types';
import { advanceVillage } from '../simulate';
import { advanceChunked, goldenWorld, stateFingerprint, YEAR } from './village-golden-fixture';

// Zlatý otisk celé vsi (village-core.md – Determinismus): ves ze seedu po 20 letech pod správcem
// (pole, stáda, zásoby řemeslného zboží, rod – dílnu nemá) se dopočte o rok a otisk jejího stavu se musí shodovat se zapsaným.
// Zachytí každou nechtěnou změnu výsledku simulace při úklidu a zrychlování. Delší běh (2. a 3. rok)
// je v village-golden-long.test.ts (npm run test:slow).
//
// Změnil jsi pravidla vsi VĚDOMĚ? Pak nový otisk zjistíš tak, že test pustíš, vezmeš hodnotu
// z chybové hlášky (Received) a přepíšeš `EXPECTED_YEAR_1`; do commitu napiš, proč se výsledek
// změnil. Při úklidu (bez změny chování) se otisk měnit nesmí.

// 14. 11. 2026 – stavby staví muži (population.md – Práce, „D24 ano“): denní minimum a úlohy dne
// nesou napřed ženy, na stavby jde jen práce mužů, která po nich zbude; dřív dda9b1f1909187c8
// (před D24) a 9f050c46fafa769c (D24 s dělením poměrem)
// 14. 11. 2026 – sloučení zboží vsi (hides-honey.md – kůže, kožešiny, med a vosk) s D24: obojí
// mění práci a jídlo vsi; dřív cec3ef2ae88c8a5c (zboží bez D24) a dcce65ed03e2f45f (D24 bez zboží)
// 14. 11. 2026 – kůže a kožešiny zpracují jen ženy z volného času (population.md – Práce, Stavby
// staví muži; hides-honey.md – Zpracování v domácnosti): ve dnech, kdy ženy nesou výmlat a jiné
// úlohy dne, zpracování čeká a volnou práci mužů dostanou oka a ryby – jiný úlovek a jídlo; dřív
// 54989ca4d4e3fef4
// 14. 11. 2026 – sloučení se zápisy vzniklých cest s konci a roky chůze (`road-formed` – `ends`,
// `years`; web-ui.md – Panel Kronika): nová pole záznamů; dřív 8c37bb353aa1f9bb (zboží) a
// 11d3b0961aecf068 (zápisy cest)
// 14. 11. 2026 – zboží vsi bez mrtvého stavu `wares.today` (rámy se kreslí z `curing`): ubylo pole
// v uloženém stavu; dřív 49dfd13fd6e3eb50
// 15. 11. 2026 – správce zakládá pole spíš čtvercová (oxen.md – Orba rádlem křížem; steward.md –
// Blok pole): za 20 let pod správcem jiná políčka polí – jiná vzdálenost, úroda a práce; dřív
// b7477b97a27c913e
// 15. 11. 2026 – výhled jídla počítá se ztrátami obilí skladováním do žní (fields.md – Přídělový
// systém, Martin „Ano“): příděl na hraně je od začátku nižší a rovný, přežívací zásoba přesná –
// jiné zásoby, osev a koně; dřív 07df9ad582db4c65
// 15. 11. 2026 – hladová ves sní i zásobu medu (hides-honey.md – Med v hladu, Martin „Ano – jsou
// to kalorie jako každé jiné.“): zlatá ves za rok nešetří ani den (medu ≈ 120 kg), ale přežívací
// zásoba obilí (`seedKeepKg` – `grainAheadForOutlookKg`) počítá s celou zásobou medu, ne jen
// s pevným přídělem – drží až o ≈ 100 kg obilí méně, jiné osivo a zásoby; dřív 49a0f7b2264963f2
// 15. 11. 2026 – sloučení: zápisy úmrtí nesou postavení (`estate`, kronika C) a hladová ves
// jí i zásobu medu – obojí mění stav; přepočteno po sloučení
// 15. 11. 2026 – jména všech lidí (population.md – Jména, Martin „Ano“): lidé mají jména ve
// stavu, zápisy narození a úmrtí je nesou, zápisy žen muže rodu postavení muže a jméno ženy;
// simulace se nezměnila – stav bez jmen a kroniky má před i po týž otisk (start 49273ab04a2e6883,
// po roce 1841ac157f2d4e93); dřív 8c854b210fec84e7
// 15. 11. 2026 – sloučení: jména všech lidí a zápisy vylepšení cest s konci a vojvodou (D59)
// – obojí jen nová pole stavu a záznamů; přepočteno po sloučení
// 15. 11. 2026 – D66 a D67 (web-ui.md – Panel Kronika): křižovatky v koncích cest nesou významné
// místo (`near`), zarostlé cesty konce (`ends`, `part`) a opuštěné kusy pod stavbou konce cesty
// z řezu (`Road.formerEnds`) – jen nová pole záznamů a úseků; stav bez nich má týž otisk jako dřív
// (7d3b0f17cb6b855b)
// 17. 11. 2026 – D90 (Martin: u sklizně zásoba a na jak dlouho vystačí, u narození a úmrtí počet
// obyvatel): zápisy `harvest`, `apple-harvest`, `garden-harvest`, `birth` a `death` nesou nová
// pole (`stock`, `population`) – simulace se nezměnila, jen kronika; dřív ce5c6d3603f17799,
// se samotnou D90 c0d4e117d27f858b
// 17. 11. 2026 – D89: cesta k vchodu uvnitř plochy staveb nevzniká dokola (jiné cesty a zápisy
// kroniky), roky chůze podle tras po cestě a cesta se vyšlape jen tam, kde trasy vedou aspoň
// 2 cesty za den – práce vznik neurychlí (Martin: „Nejvýš do 3 let“ – `WEAR.formFrom`); se
// samotnou D89 f6940655ec1a866e
// 17. 11. 2026 – D91 (Martin 17. 11. 2026: „psi ať nic nespotřebovávají“ a maso krávy 120 → 130 kg): psi dvorce už nejedí obilí a z porážky je víc masa – jiné zásoby a jídlo; dřív 619b02b6a1c512e2
// 17. 11. 2026 – D91 doplněk (Martin: „Tehdejší lidé zpracovali to zvíře komplet“): vůl na maso
// 120 → 130 kg jako kráva (`oxMeatKg`) – jiné zásoby; dřív 6df903308768fe20
// 18. 11. 2026 – strava po vrstvách, úloha 1; dřív 82b12dd84c08dd63
// 18. 11. 2026 – strava po vrstvách, úloha 2; dřív 60a62e071fd0d3fd
// 18. 11. 2026 – strava po vrstvách, úloha 2 (tempo proti zkažení napřed i v hojnosti); dřív
// 9371ea6e5d066ae8
// 18. 11. 2026 – strava po vrstvách, úloha 3 (jídlo po vrstvách, štěstí ze stravy po lidech a z medu);
// dřív 776bb414d4028d91
// 18. 11. 2026 – strava po vrstvách, úloha 3 (ovoce a pevný příděl medu všem stejně, štěstí ze
// stravy přes jedlíky); dřív 79b920be6d62a4c2
// 18. 11. 2026 – strava po vrstvách, úloha 4 (porážka celý rok – v létě kus pro rod vojvody, v zimě
// rozložená na celou zimu, práce porážky celý rok); dřív 9f3abbaffbff219f
// 18. 11. 2026 – strava po vrstvách, úloha 4, opravné kolo 1 (letní porážka bez západky – staré kusy
// se započtením letní porážky, rozhoduje se po práci dne i s rybami; nouzová porážka nenuluje
// práci porážky); dřív 9a95a3545a893d89
// 18. 11. 2026 – strava po vrstvách, úloha 4, opravné kolo 2 (odhad 1. 11. ze stáda i s letní porážkou,
// práce letní porážky se dodělá s porážkou 1. 11.); dřív 9a87bfa34fc520a8
// 18. 11. 2026 – strava po vrstvách × D93–D96 (sloučení feat/landscape); dřív ffb78a93bb4e5d05
// 18. 11. 2026 – opravy po závěrečné kontrole stravy (maso elitě před mlékem, ryby ve výhledu do
// sklizně, porážka za žní a sečí, podíl pasáků i s letní porážkou); dřív be42183ebfc3b806
// 18. 11. 2026 – D98 uzené rozložené do zkažení (Martin: „Uzené rozlož“ – díl uzeného do konce
// masa, letní porážka podle dnešního dílu); dřív 1a8f69a42f76bd25
// 18. 11. 2026 – D98 kolo 1 – rozložená jen zásoba z porážky 1. 11. (ostatní uzené hned, díl až po
// čerstvém, výhled se ztrátou uzením); dřív 215559928a2709ce
// 18. 11. 2026 – D99 cíl polí na maximum (Martin: „Cílem vesnice je prostě produkovat maximum
// všeho.“ – steward.md, Cíl polí): správce staví pole na maximum, které ves oseje, bez ohledu na
// stravu – za 20 let 27 polí místo 5, jiné zásoby, práce a lidé; dřív 8261eafa1a521bd2
// 19. 11. 2026 – D99 kolo 1 – cíl polí podle osevu i žní (výhled `workableHa`: okna setí jednou,
// orba i lidmi, žeň a výmlat po žni v oknech žní po otavě – steward.md, Cíl polí); za 20 let 26 polí;
// dřív ddd66c16e931952d
// 19. 11. 2026 – D99 kolo 2 – žeň v oknech žní před otavou a lnem, výmlat v zimním okně (cíl polí)
// a dřina s dnešní sečí a otavou v tempu (happiness.md – Plná práce ve špičce, která se stihne,
// dřinou není): jiné štěstí, práce a zásoby; dřív aa479aa7d2ce28f7
// 19. 11. 2026 – D101 pás jen ze stejné skupiny (oxen.md – Díly po dávkách: pás orby při přibírání
// jen z dílů stejné skupiny přílohové soustavy, místo na čele u každého dílu); dřív dca6b32e4c8f4cbe
// 19. 11. 2026 – D102 kolo 1 – kdo z rodiny je na poli, se počítá v lidech na celý dnešní den
// (lord.md – Kdy jde rodina na pole; dřív podle práce delšího dne – rodina ve zlaté vsi pomáhá jen
// s výmlatem v zimě, podíl setí ani žní nedostane): jiný výcvik rodu; dřív 9564aeeb22d9ac4a
// 22. 11. 2026 – D107 seno po loukách od nejbližší, ne průměrem plánu (oxen.md – Seno): jiné seno
// ze seče i strop stád; dřív ba7b005c3a4c561b
// 22. 11. 2026 – D112 v hladu díl zásoby z porážky 1. 11. do sklizně (diet.md – V hladu do
// sklizně): ve 20 letech založení 13. 12. 504 výhled s dílem do 31. 8. 0,996 – s dílem do sklizně
// ozimu 31. 7. ves nehladoví; jiné zásoby, štěstí a dál celá ves; dřív 083f1e356785126b
// 22. 11. 2026 – D110 přílohy do osevu podle úzkého hrdla a setí zorané půdy před vracením přílohu
// téže plodiny (fields.md – Pořadí důležitosti polních prací): zlatá ves zaseje zorané díly dřív,
// než lidé klučí další; samotné D110 dávalo 3ce521beed488abd, dřív (s D112) 1bf98727bddab557
// 22. 11. 2026 – D113 dřina: termín okna ve dvou úsecích a nosiči výprav v tempu (happiness.md –
// Den dřiny): jiné dny dřiny, tedy štěstí a práce vsi od prvního roku; dřív 147e3ff19545d884
// 22. 11. 2026 – D116 orba a setí až po vyklučení (fields.md – Postup práce po čtvercích): zlatá ves
// v prvních letech kope motykou a díly s drnem louky zkope (a oseje) až po vrácení přílohu, mezitím
// připravené díly – jiné pořadí kopání a setí, tedy úroda a dál celá ves; dřív e1c2e333a3b6fc16
const EXPECTED_YEAR_1 = '396a222ecc30da6b';
// 18. 11. 2026 – D93 cesta přes plochu staveb; dřív 82b12dd84c08dd63 (vyšlapaná cesta přes plochu
// staveb nevznikne a napojení ji obejde – jiné cesty a id; roky chůze nejvýš doba vyšlapání)
// 18. 11. 2026 – D95 výmlat (Martin: „A, C, E“ – výmlat podle kg snopů, rod v zimě dorovná tempo
// okna výmlatu; „Humno nestačí“ jen když ruce humna přetíží); dřív df705e2196e85d88

describe('zlatý otisk vsi', () => {
  const world = goldenWorld();

  it('po 20 letech má ves pole, stáda, zásoby řemesel i rod (základ otisku není prázdný)', () => {
    const s = world.start;
    // 18. 11. 2026 – strava po vrstvách, úloha 2: maso, ryby a mléko bez stropů – ves potřebuje
    // méně obilí a správce založil 4 pole; dřív aspoň 5
    // 18. 11. 2026 – D99 cíl polí na maximum, které ves oseje (steward.md – Cíl polí): 27 polí;
    // dřív aspoň 4; 19. 11. 2026 – D99 kolo 1 (osev i žně): 26 polí
    expect(s.fields.length).toBeGreaterThanOrEqual(20);
    expect(s.livestock?.herds).toBeDefined();
    expect(s.crafts).toBeDefined();
    expect(s.people.length).toBeGreaterThanOrEqual(10);
    expect(s.dynasty).toBeDefined();
  });

  it('rok dopočtu vcelku dá zapsaný otisk', () => {
    const s = advanceVillage(
      world.start,
      world.start.lastDay + YEAR,
      world.obstacles,
      world.landscape,
    );
    expect(stateFingerprint(s)).toBe(EXPECTED_YEAR_1);
  });

  it('rok po kouscích (37 dní) dá tentýž otisk jako vcelku', () => {
    const s = advanceChunked(world.start, YEAR, 37, world);
    expect(stateFingerprint(s)).toBe(EXPECTED_YEAR_1);
  });

  it('rok po dnech s uložením po každém dni (JSON) dá tentýž otisk jako vcelku', () => {
    // worker i web ves mezi kousky ukládají – další kousek počítá ze stavu načteného z JSONu, ne
    // z paměti. Otisk by se lišil, kdyby stav nesl něco, co JSON nepřenese (NaN, Infinity, −0,
    // undefined v poli, Map), nebo kdyby výsledek závisel na paměti podle identity objektů.
    let s = world.start;
    const end = s.lastDay + YEAR;
    while (s.lastDay < end) {
      s = advanceVillage(s, s.lastDay + 1, world.obstacles, world.landscape);
      s = JSON.parse(JSON.stringify(s)) as VillageState;
    }
    expect(stateFingerprint(s)).toBe(EXPECTED_YEAR_1);
  });
});
