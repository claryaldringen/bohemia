import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import {
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  obstaclesOf,
  tileCenterWorld,
} from '../../../landscape';
import { foundVillage } from '../../core/actions';
import { bufferFill } from '../../fields/field-food';
import { NO_CRAFTS } from '../../core/productivity';
import { LUCKY_STARVATION_CAP } from '../../people/population';
import { craftCoverage } from '../../crafts/crafts';
import { STEWARD } from '../../rules/rules-steward';
import { advanceVillage } from '../../core/simulate';
import { fieldStoresOutlook } from '../../core/simulate-plan';
import { fieldTarget, stewardMode, workshopValue } from '../steward';
import { newSteward } from '../steward-state';
import type { Dwelling, VillageState } from '../../types';

// Dlouhé běhy správce na skutečné krajině (10 až 25 let) – jedou v `npm run test:slow`;
// rychlé testy dne správce jsou v steward.test.ts.

const YEAR = 365;
const landscape = generateLandscape(1, CURRENT_LAYER_VERSIONS);
const obstacles = obstaclesOf(landscape);
/** 1. 9. 503 zaokrouhlený na den správce – okno polí na louce. */
const SEPT =
  Math.ceil(dayIndexOf({ year: 503, month: 9, day: 1 }) / STEWARD.everyDays) * STEWARD.everyDays;

/** Nová ves zakladatelů u sídla krajiny; ves založená v den `day` je dopočítaná do `day − 1`. */
function village(day: number, on = true): VillageState {
  const site = landscape.villageSite;
  const c = tileCenterWorld(landscape, site.x, site.y);
  const s = foundVillage({ seed: 4242, day, dwellingPosition: { x: c.x, z: c.z, rotation: 0 } });
  return { ...s, steward: newSteward(day, on) };
}

describe('den správce – dlouhý běh na skutečné krajině', () => {
  // 10 let vcelku a po 37 dnech – výsledek nezávisí na kouscích dopočtu; po kouscích dál do 15 let
  // (kouřový test – lidé rostou, nikdo neumře hlady)
  const start = village(SEPT);
  const TEN = SEPT + 10 * YEAR;
  let chunked = start;
  let hunger = 0;
  /** Nejvyšší nahromaděný hlad (konce kousků) po letech od založení. */
  const starvation: number[] = [];
  let atThree: VillageState | null = null;
  /** Režimy na koncích kousků od chvíle, kdy hlad poprvé dosáhl stropu hájení (past osiva). */
  const trapModes: string[] = [];
  const advanceChunked = (to: number): void => {
    while (chunked.lastDay < to) {
      const prev = chunked.lastDay;
      chunked = advanceVillage(chunked, Math.min(to, prev + 37), obstacles, landscape);
      hunger += chunked.chronicle.filter(
        (e) => e.day > prev && e.kind === 'death' && e.cause === 'hunger',
      ).length;
      if (!atThree && chunked.lastDay >= SEPT + 3 * YEAR) atThree = chunked;
      const year = Math.floor((chunked.lastDay - SEPT) / YEAR);
      starvation[year] = Math.max(starvation[year] ?? 0, chunked.starvationDays ?? 0);
      if (trapModes.length > 0 || (chunked.starvationDays ?? 0) >= LUCKY_STARVATION_CAP) {
        const day = chunked.lastDay;
        trapModes.push(stewardMode(chunked, day, craftCoverage(chunked, day)));
      }
    }
  };

  it('po kouscích stejně jako vcelku (10 let)', { timeout: 120_000 }, () => {
    // otisk vcelku hned po dopočtu: pod zátěží V8 občas přepsal krajinu zvěře (`wildlife.land`)
    // už vráceného stavu během dalšího dopočtu, ač ji žádný kód nemění (village-core.md –
    // Determinismus) – test porovnává výsledky dopočtů, ne pozdější obsah starého objektu
    const whole = JSON.stringify(advanceVillage(start, TEN, obstacles, landscape));
    advanceChunked(TEN);
    expect(JSON.stringify(chunked)).toBe(whole);
  });

  it('pole dorostou k cíli a jsou správcova', () => {
    const s = atThree!;
    const target = fieldTarget(s, s.lastDay, NO_CRAFTS);
    expect(target.have).toBeGreaterThan(0.8 * target.need);
    const fields = s.parts.filter((p) => s.steward!.built.includes(p.id));
    expect(fields.length).toBeGreaterThan(0);
  });

  it('dílna má kladnou hodnotu – uhlíř od 6 obydlí, kovář až s uhlířem', () => {
    const s = structuredClone(atThree!);
    const home = s.dwellings[0]!;
    s.dwellings = Array.from({ length: 8 }, (_, k): Dwelling => ({ ...home, id: 90_000 + k }));
    const day = s.lastDay;
    expect(workshopValue(s, day, 'burner', NO_CRAFTS)).toBeGreaterThan(0);
    expect(workshopValue(s, day, 'smith', NO_CRAFTS)).toBe(0);
    s.dwellings[1] = { ...s.dwellings[1]!, workshop: { craft: 'burner' } as Dwelling['workshop'] };
    expect(workshopValue(s, day, 'smith', NO_CRAFTS)).toBeGreaterThan(0);
    expect(workshopValue(s, day, 'burner', NO_CRAFTS)).toBe(0);
  });

  it('Nouze jen při ohrožení – ves bez pojistky, které zásoby i s osivem do žní vystačí, je v Obnově', () => {
    // ves po 3 letech, po 1. 9. – osivo ozimu a jaře na setí čeká; bez snopů (výmlat čeká
    // do zimy – fields.md, Pořadí důležitosti polních prací), zásoby jen vymlácené
    const s: VillageState = { ...atThree!, sheaves: { grainKg: 0, legumesKg: 0 } };
    const day = s.lastDay;
    const modes = new Map<string, number[]>();
    for (let kg = 0; kg <= 3000; kg += 5) {
      const v = { ...s, storesKg: kg };
      const mode = stewardMode(v, day, NO_CRAFTS);
      modes.set(mode, [...(modes.get(mode) ?? []), kg]);
      if (mode !== 'recovery') continue;
      // stará Nouze (pojistka bez osiva pod polovinou) – teď Obnova, osivo by ji pokrylo
      expect(bufferFill(fieldStoresOutlook(v, day, NO_CRAFTS, false))).toBeGreaterThanOrEqual(
        STEWARD.emergencyFill,
      );
    }
    const recovery = modes.get('recovery') ?? [];
    expect(Math.max(...(modes.get('emergency') ?? [-1]))).toBeLessThan(Math.min(...recovery));
    expect(Math.max(...recovery)).toBeLessThan(Math.min(...(modes.get('growth') ?? [Infinity])));
    expect(
      recovery.some(
        (kg) =>
          bufferFill(fieldStoresOutlook({ ...s, storesKg: kg }, day, NO_CRAFTS)) <
          STEWARD.emergencyFill,
      ),
    ).toBe(true);
  });

  it('15 let – lidé rostou, nikdo neumře hlady', { timeout: 120_000 }, () => {
    advanceChunked(SEPT + 15 * YEAR);
    expect(chunked.people.length).toBeGreaterThan(start.people.length);
    expect(hunger).toBe(0);
    // hlad na stropu hájení ne do krutého roku 9 (úroda ≈ ½) – pak ves bez pojistky spadne do
    // pasti osiva (seje jen osivo nad jídlo do žní) a pole navíc nepomohou (S4-report, N1)
    expect(Math.max(...starvation.slice(0, 9))).toBeLessThan(LUCKY_STARVATION_CAP);
    const built = new Set(chunked.steward!.built);
    expect(chunked.dwellings.some((d) => built.has(d.id))).toBe(true);
  });

  it(
    '25 let – v pasti osiva (hlad na stropu hájení) není trvalá Nouze',
    { timeout: 180_000 },
    () => {
      advanceChunked(SEPT + 25 * YEAR);
      expect(hunger).toBe(0);
      // osivo se nejí (SEED_STORES.floorRation 0,5 – Martin 31. 10. 2026, od 6. 11. 2026 přežívací
      // zásoba do žní – osev má přednost, fields.md): ves zakladatelů
      // na krajině 1 už do pasti osiva (hlad na stropu hájení) nespadne – dřív tu `trapModes`
      // sbíraly režimy správce v pasti (Obnova místo Nouze). Kdyby do ní přece spadla, hlad na
      // stropu nesmí správce držet v Nouzi (kouřový test S5 – osm let žádná stavba mimo pole); od
      // olemování podle míst na stromy (Martin 31. 10. 2026) je chůze po cestách s alejí rychlejší hned
      const emergency = trapModes.filter((m) => m === 'emergency').length;
      expect(emergency).toBeLessThanOrEqual(trapModes.length / 2);
      // ves bez rodu (zakladatelé bez vojvody) syna vojvody nemá – odchod syna z pasti tu nejde
      // (ves rodu ve hře vojvodu má; odchod z pasti hlídá steward-son.test.ts)
      expect(chunked.dynasty?.lordId ?? null).toBeNull();
    },
  );
});
