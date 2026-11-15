import { describe, expect, it } from 'vitest';
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
const EXPECTED_YEAR_2 = 'c736e7bb425cf85d';
const EXPECTED_YEAR_3 = '25cd730a5ce85ee1';

describe('zlatý otisk vsi – delší běh', () => {
  it('po 2. a 3. roce dopočtu dá zapsané otisky', () => {
    const world = goldenWorld();
    let s = world.start;
    const prints: string[] = [];
    for (let year = 1; year <= 3; year++) {
      s = advanceVillage(s, s.lastDay + YEAR, world.obstacles, world.landscape);
      prints.push(stateFingerprint(s));
    }
    expect(prints.slice(1)).toEqual([EXPECTED_YEAR_2, EXPECTED_YEAR_3]);
  });
});
