import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { advanceVillage } from '../simulate';
import type { Person, VillageState } from '../types';
import { withBuiltFirstDwelling } from './village-fixtures';

// Učení řemesla a kování vozů (crafts.md – Učení řemesla, wagons.md – Kování vozů): ves bez dílen
// se nemění bit po bitu – lidé nemají praxi, vůz se spřežením jezdí jako dřív. Otisk stavu po dvou
// letech je spočítaný kódem před učením řemesla (commit před zavedením praxe). Rok vozů po dnech

// Snopy a výmlat hned po žni (production-chains.md – Humno, 20. 10. 2026): ves bez pole nesklízí –
// přibude jen značka nové vsi `sheaves` (prázdné snopy), stav bez ní vyšel stejně jako předtím.
// Obilné jámy (production-chains.md – Obilné jámy, 20. 10. 2026): ves bez výmlatu jámy nekope –
// přibude jen značka nové vsi `grainPits` (žádné jámy), zásoby leží doma jako dřív.

/**
 * Stav v podobě z doby před hřivnami (production-chains.md – Kovář): nástroje ve vybavení
 * domácností zpět do zásoby nástrojů `crafts.toolsKg` – ves bez kováře se jinak nemění, otisk
 * zůstal.
 */
function legacyShape(state: VillageState): unknown {
  const { toolEquipmentKg, ...rest } = state;
  const c = rest.crafts;
  return {
    ...rest,
    crafts: c && {
      charcoalKg: c.charcoalKg,
      toolsKg: toolEquipmentKg ?? 0,
      potteryKg: c.potteryKg,
      ...(c.woodToolsKg !== undefined ? { woodToolsKg: c.woodToolsKg } : {}),
      ...(c.ironBarsKg ? { ironBarsKg: c.ironBarsKg } : {}),
    },
  };
}

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const DAY = at(601, 3, 1);

function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16);
}

const person = (id: number, years: number, dwellingId: number, sex: Person['sex']): Person => ({
  id,
  bornDay: DAY - Math.ceil(years * 365.25) - 10,
  dwellingId,
  sex,
});

/** Ves bez dílen – jedna domácnost, nástroje a nádoby koupené dřív, spřežení s vozem. */
function village(): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 11, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.people = [
    person(2, 30, 1, 'male'),
    person(3, 28, 1, 'female'),
    person(4, 12, 1, 'male'),
    person(5, 16, 1, 'male'),
    person(6, 9, 1, 'female'),
  ];
  s.constructions = [];
  s.storesKg = 8_000;
  s.lastDay = DAY;
  s.nextId = 1000;
  s.crafts = { charcoalKg: 0, potteryKg: 10 };
  s.toolEquipmentKg = 10;
  s.pens = [
    {
      id: 900,
      cell: { x: 8, y: 9 },
      x: -22.5,
      z: -7.5,
      builtDay: DAY - 800,
      team: { readyDay: DAY - 10 },
      training: null,
    },
  ];
  s.carts = [{ id: 1, kind: 'two-wheel', builtDay: DAY - 10 }];
  return s;
}

describe('ves bez dílen beze změny (crafts.md – Učení řemesla)', () => {
  it('stav po dvou letech jako před učením řemesla a kováním vozů', () => {
    const next = advanceVillage(village(), DAY + 730, null);
    expect(next.people.length).toBeGreaterThan(3);
    expect(next.people.some((p) => 'practice' in p)).toBe(false);
    // příznak převodu dosahů čtyřkoláku (wagons.md – Co se vozí a na čem) – jen značka ve stavu;
    // pár a domy před svatbou v kronice (kinship.md – Svatba ve scéně) – jen zápis pro scénu
    const marks = new Set([
      'fourWheelOffRoad',
      'groomId',
      'brideId',
      'groomFromDwellingId',
      'brideFromDwellingId',
      // prázdné snopy nové vsi (production-chains.md – Humno) – bez sklizně jen značka
      'sheaves',
      // nová ves bez jam (production-chains.md – Obilné jámy) – bez výmlatu se nic neukládá
      'grainPits',
      // ves bez rodu (lord.md – Rod vojvody) – přibude jen značka `dynasty`
      'dynasty',
      // správce vsi (steward.md – Stav správce) – vypnutý, jen značka `steward`
      'steward',
      // značka převodu na osevní postup (fields.md – Osevní postup po dílech, bod 7)
      'sowingRotation',
      // zvěř vsi (wildlife.md) – přibyl klíč `wildlife`; v rámci dne ovlivňuje i simulaci, ale zlatý běh ji neprojeví
      'wildlife',
      // kusy poražené dnes (hlášení pro scénu – LivestockState.slaughtered) – simulace je nečte
      'slaughtered',
      // věk zemřelého v události úmrtí (happiness.md – Co ubírá) – jen zápis do kroniky
      'age', // hash 3bd10c3d: úmrtí podle věku mění štěstí (a tím práci), jinak shodné s f0150b51
      // hash f78f3f13 (25. 10. 2026): porody brzdí jen energie, ne pestrost – víc porodů
      // hash 1661516a (25. 10. 2026): stáda jen na seno, které ves stihne posekat (oxen.md – Stáda
      // podle práce na seč) – zápis volné práce na seč, menší stáda po první sezóně, otava se
      // stropem práce, nouzová porážka ovce před kravami
      // hash 39b51dd8 (25. 10. 2026): jen přejmenování plánu na hospodářský rok (`season`, `crops`) –
      // bez klíčů `plan` a `season` zůstal 46b42f4f
      // osivo ze zásob při setí (fields.md – Úroda, Osivo ze zásob, 27. 10. 2026) – zlatá ves má
      // zásoby nad pojistkou, setí osivo neomezí a bez nových klíčů vyšel stav stejně (8498535)
      'seedKg',
      'seedWaitingKg',
      'seedFloorKg',
      // výběr dílů z posledního dne s místem na čele (fields.md – Postup práce po dílech, výkon)
      'selection',
    ]);
    const stripped = JSON.stringify(legacyShape(next), (key, value: unknown) =>
      marks.has(key) ? undefined : value,
    );
    // hash 5e3b6c4c (26. 10. 2026 (W3 šelmy; wildlife.md – Vlci na dobytku): vlčí díl ztrát jen venku a medvěd bere prasata, takže stáda jdou po dnech jinak; dřív 39b51dd8); 26. 10. 2026 podruhé (oprava po recenzi W3): medvěd bere jen z prasat nad chovný pár a kronika šelem jde po měsících (jiné události kroniky), dřív 5e3b6c4c)
    // hash 89e5e1ce (26. 10. 2026 (W4 psi dvorce a velký lov rodu; wildlife.md – Psi, Lov rodu): obilí psů dvorce se sije z pole a pěší lovci a odešlí synové chybí v den lovu v práci vsi, takže se mění sklizeň, plán osevu a stav zvěře; dřív 5362ef6)
    // hash c98b44a4 (26. 10. 2026, oprava po recenzi W4): psi dvorce vznikají hned (ne až 1. 5.), rodina na poli neloví a slabý jezdec jde pěšky – jiný lov, obilí psů a práce vsi; dřív 89e5e1ce
    // hash 7fc9acc1 (26. 10. 2026, W7 ryby a oka; wildlife.md – Drobná zvěř a ryby): vesničané chytají ryby a zajíce z volné práce (nebo při hladu před stavbami), maso jde do zásoby bez porážky – jiná práce vsi, zásoby a stav zvěře; dřív c98b44a4
    // hash 673f1d6b (26. 10. 2026, oprava po recenzi W7): roční kvóta ryb a zajíců, čerstvé maso a brzda letošním úlovkem – jiný úlovek, jídlo a stav zvěře; dřív 7fc9acc1
    // hash 8498535 (26. 10. 2026, závěrečná oprava zvěře): drobná zvěř loňska se do chuti na bílkoviny nepočítá, jen letošní – jiný úlovek ryb a jídlo; dřív 673f1d6b
    expect(hash(stripped)).toBe('8498535');
  }, 120_000);
});
