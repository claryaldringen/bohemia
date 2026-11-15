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
const EXPECTED_YEAR_1 = '07df9ad582db4c65';

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
