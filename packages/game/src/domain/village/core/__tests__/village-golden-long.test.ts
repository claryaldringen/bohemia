import { describe, expect, it } from 'vitest';
import { dateOfDayIndex } from '../../../calendar';
import { craftCoverage } from '../../crafts/crafts';
import { fieldTarget } from '../../steward/steward';
import { stewardOutlook } from '../../steward/steward-outlook';
import { advanceVillage } from '../simulate';
import { goldenWorld, stateFingerprint, YEAR } from './village-golden-fixture';

// Pomalá sada (npm run test:slow): zlatý otisk vsi z village-golden.test.ts po 2. a 3. roce
// dopočtu, vcelku po jednotlivých letech. Vědomé přepsání otisků: viz village-golden.test.ts.

// 14. 11. 2026 – stavby staví muži (population.md – Práce, „D24 ano“): denní práci nesou napřed
// ženy, na stavby jde jen práce mužů, která zbude; dřív c99147eba93dbf6e a 2f3ab71db19f73c6
// (před D24), 1a766c1232b112a9 a 02b6d592aeb6b165 (D24 s dělením poměrem)
// 14. 11. 2026 – sloučení zboží vsi (hides-honey.md) s D24: dřív 69109b1f98faa831
// a f081cee3459719e2 (zboží bez D24), 8a0abe82b58bcef8 a 91a89a9500dcce15 (D24 bez zboží)
// 14. 11. 2026 – kůže a kožešiny zpracují jen ženy z volného času (population.md – Práce, Stavby
// staví muži): zpracování čeká na volnou práci žen, oka a ryby dostanou volnou práci mužů; dřív
// f81e4a064771f2bd a e52babe3f8cdc2b0
// 14. 11. 2026 – sloučení se zápisy vzniklých cest s konci a roky chůze (`road-formed` – `ends`,
// `years`): nová pole záznamů; dřív e061caeb9287a11c a 14ab1671d93f3eca (zboží), 337ac1e26a689941
// a 402c83aada144bca (zápisy cest)
// 14. 11. 2026 – zboží vsi bez mrtvého stavu `wares.today` (rámy se kreslí z `curing`): ubylo pole
// v uloženém stavu; dřív ebdc645e3e62b846 a 6ad042796fa46459
// 15. 11. 2026 – správce zakládá pole spíš čtvercová (oxen.md – Orba rádlem křížem; steward.md –
// Blok pole): jiná políčka polí ze 20 let pod správcem; dřív 661ac775bc7e6967 a b75848dca0cbb5c0
// 15. 11. 2026 – výhled jídla počítá se ztrátami obilí skladováním do žní (fields.md – Přídělový
// systém, Martin „Ano“): jiný příděl a přežívací zásoba – jiné zásoby a osev; dřív
// 2d83c6aef0fd4e1f a fdb154bca6bd33dc
// 15. 11. 2026 – hladová ves sní i zásobu medu (hides-honey.md – Med v hladu): přežívací zásoba
// obilí (`seedKeepKg`) počítá s celou zásobou medu – jiné osivo a zásoby (village-golden.test.ts);
// dřív 8dce05322fad129e a da411ec1fa2f9cb4
// 15. 11. 2026 – sloučení: zápisy úmrtí nesou postavení (`estate`, kronika C) a hladová ves
// jí i zásobu medu – obojí mění stav; přepočteno po sloučení
// 15. 11. 2026 – jména všech lidí (population.md – Jména, Martin „Ano“): jména ve stavu a v zápisech
// kroniky, simulace beze změny (village-golden.test.ts); dřív ba92a0936e30252b a 2053f8f0078f2fb6
// 15. 11. 2026 – sloučení: jména všech lidí a zápisy vylepšení cest s konci a vojvodou (D59)
// – obojí jen nová pole stavu a záznamů; přepočteno po sloučení
// 15. 11. 2026 – D66 a D67: jen nová pole záznamů kroniky a opuštěných úseků (`near`, `ends`,
// `part`, `Road.formerEnds`); stav bez nich má týž otisk jako dřív (2e53d16e130cecd7,
// cb4fa09a11e5ad7e)
// 17. 11. 2026 – D90: nová pole zápisů kroniky (`stock`, `population`); se samotnou D90
// 2d69169517a16319 a 2199edea4fda668a
// 17. 11. 2026 – D89 (cesty k vchodům, roky chůze, vznik cesty od 2 cest tras za den – viz
// village-golden.test.ts); dřív 4ae0bce6720eb749 a b6f24d22b7474e65
// 17. 11. 2026 – D91 (psi dvorce nejedí obilí, maso krávy 130 kg, včasná porážka koní bez sena –
// viz village-golden.test.ts); dřív 344a0e5dac68c6b6 a 7d8de5be28486665
// D91 doplněk: vůl na maso 130 kg (viz village-golden.test.ts); dřív 306440f7f5b30966 a 2e3e180d8e3119dd
// 18. 11. 2026 – strava po vrstvách, úloha 1; dřív 168010dd35f7c1c7 / a499594da5514b49
// 18. 11. 2026 – strava po vrstvách, úloha 2; dřív cd7bd43b11e74421 / cb235ea806f24818
// 18. 11. 2026 – strava po vrstvách, úloha 2 (tempo proti zkažení napřed i v hojnosti); dřív
// b6001ccd4e274037 / b8e6cbe3938ba593
// 18. 11. 2026 – strava po vrstvách, úloha 3 (jídlo po vrstvách, štěstí ze stravy po lidech a z medu);
// dřív 1f4e71c751f2f92d / 7c864080e92c063e
// 18. 11. 2026 – strava po vrstvách, úloha 3 (ovoce a pevný příděl medu všem stejně, štěstí ze
// stravy přes jedlíky); dřív 2a2209659320ad84 / d9a302302d49421b
// 18. 11. 2026 – strava po vrstvách, úloha 4 (porážka celý rok – v létě kus pro rod vojvody, v zimě
// rozložená na celou zimu, práce porážky celý rok); dřív 7a525fcee8315820 a 5b62bbb80dd2cc96
// 18. 11. 2026 – strava po vrstvách, úloha 4, opravné kolo 1 (letní porážka bez západky, po práci dne);
// dřív 69369fe95832f5ba a f588619d4f4abbe0
// 18. 11. 2026 – strava po vrstvách, úloha 4, opravné kolo 2 (odhad 1. 11. ze stáda i s letní porážkou);
// dřív 4d3b560d29b64956 a 10a4b9f7cd55317f
// 18. 11. 2026 – strava po vrstvách × D93–D96 (sloučení feat/landscape); dřív ed829a5207034ab1
// a 0fc9dc69b6627550
// 18. 11. 2026 – opravy po závěrečné kontrole stravy (maso elitě před mlékem, ryby ve výhledu do
// sklizně, porážka za žní a sečí, podíl pasáků i s letní porážkou); dřív 96cbecd21f6d8927
// a 5d858a6a3e2859bc
// 18. 11. 2026 – D98 uzené rozložené do zkažení (viz village-golden.test.ts); dřív
// 29895c33a84fdb08 a 7ce7a924372a21a0
// 18. 11. 2026 – D98 kolo 1 – rozložená jen zásoba z porážky 1. 11.; dřív 3178f7e153f41913
// a 8f07292a73a628b8
// 18. 11. 2026 – D99 cíl polí na maximum (správce staví pole na maximum, které ves oseje, bez
// ohledu na stravu – viz village-golden.test.ts); dřív e528780d5ee19f50 a 0696bc715723e45d
// 19. 11. 2026 – D99 kolo 1 – cíl polí podle osevu i žní (viz village-golden.test.ts); dřív
// 9211b65615240ce4 a 426240b4c2f0f137
// 19. 11. 2026 – D99 kolo 2 – žeň před otavou a lnem, výmlat v zimním okně, dřina s dnešní sečí
// v tempu (viz village-golden.test.ts); dřív bc6cf2d0f3138154 a cde4d16e57f9748d
const EXPECTED_YEAR_2 = 'f5d8eb349980a618';
const EXPECTED_YEAR_3 = '8a159f25b32c5015';
// 18. 11. 2026 – D93 cesta přes plochu staveb; dřív 168010dd35f7c1c7 a a499594da5514b49 (viz
// village-golden.test.ts)
// 18. 11. 2026 – D95 výmlat (výmlat podle kg snopů, rod v zimě dorovná tempo okna – viz
// village-golden.test.ts); dřív dea6984b000dcf8f a a1562c05b5f77eb7

describe('zlatý otisk vsi – delší běh', () => {
  const world = goldenWorld();

  it('cíl polí nikdy pod polem, které ves oseje a sklidí – ve dnech bez dřiny (D99 kolo 2)', () => {
    // steward.md – Cíl polí: maximum, které ves obdělá. Zlatá ves rok po roce otisku stihne
    // osít i sklidit, co má (≈ 12 ha) – cíl v hektarech osevu (need ÷ have × osev podle půdy)
    // nesmí být ve dnech, kdy ves všechno stíhá, pod dnešní osetou plochou
    let s = world.start;
    const end = s.lastDay + YEAR;
    let checked = 0;
    while (s.lastDay < end) {
      s = advanceVillage(s, s.lastDay + 1, world.obstacles, world.landscape);
      const date = dateOfDayIndex(s.lastDay);
      if ((date.day !== 1 && date.day !== 15) || (s.happiness?.toil.at(-1) ?? 0) > 0) continue;
      const coverage = craftCoverage(s, s.lastDay);
      const outlook = stewardOutlook(s, s.lastDay, coverage);
      const target = fieldTarget(s, s.lastDay, coverage, outlook);
      const sownHa =
        s.parts.filter((p) => p.state === 'sown').reduce((sum, p) => sum + p.areaM2, 0) / 10_000;
      expect(target.have).toBeGreaterThan(0);
      expect((target.need / target.have) * outlook.landHa).toBeGreaterThanOrEqual(sownHa);
      checked++;
    }
    expect(checked).toBeGreaterThan(12);
  });

  it('po 2. a 3. roce dopočtu dá zapsané otisky', () => {
    let s = world.start;
    const prints: string[] = [];
    for (let year = 1; year <= 3; year++) {
      s = advanceVillage(s, s.lastDay + YEAR, world.obstacles, world.landscape);
      prints.push(stateFingerprint(s));
    }
    expect(prints.slice(1)).toEqual([EXPECTED_YEAR_2, EXPECTED_YEAR_3]);
  });
});
