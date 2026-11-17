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
const EXPECTED_YEAR_1 = '82b12dd84c08dd63';

describe('zlatý otisk vsi', () => {
  const world = goldenWorld();

  it('po 20 letech má ves pole, stáda, zásoby řemesel i rod (základ otisku není prázdný)', () => {
    const s = world.start;
    expect(s.fields.length).toBeGreaterThanOrEqual(5);
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
