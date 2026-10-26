import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { newWorkshop } from '../crafts';
import { CRAFT_BASE } from '../rules';
import { advanceVillage } from '../simulate';
import type { Craft, Person, VillageState } from '../types';
import { withBuiltFirstDwelling } from './village-fixtures';

// Uhlí a ruda kováře (crafts.md – Uhlí a ruda kováře, Starší vsi): ves bez kováře se nemění bit po
// bitu – uhlíř, hrnčíř, tesař i vůz se spřežením jako dřív. Otisk stavu po dvou letech je
// spočítaný kódem před rudou (commit před zavedením rudy); s voly po kusech a rokem vozů
// (oxen.md – Voli po kusech, wagons.md – Kolik vozů ves chce) přepočítaný kódem bez rudy
// (feat/oxen-carts 656dec4) – vyšel stejně jako se rudou. Rok vozů po dnech a tabulka úspor
// (wagons.md – Co se vozí a na čem) mění jen záznam roku vozů (`draft.demand`, `draft.lastYear`)
// – stav bez nich vyšel stejně jako předtím (5d100038). Hrnčíř od hlíny (crafts.md – Hlína
// hrnčíře) kope a nosí hlínu jako kovář rudu – ve zlaté vsi proto už není; ves bez kováře
// a hrnčíře vyšla bez záznamu roku vozů a praxe stejně kódem před hlínou i s ní (f49f757d).
// Milíř u skácených buků a rovnováha uhlíř – kovář (crafts.md, 20. 10. 2026) mění uhlíře záměrně

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

function village(): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 7, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.people = [
    person(2, 30, 1, 'male'),
    person(3, 28, 1, 'female'),
    person(4, 12, 1, 'male'),
    person(5, 9, 1, 'female'),
  ];
  s.constructions = [];
  s.storesKg = 8_000;
  s.lastDay = DAY;
  s.nextId = 1000;
  const crafts: [Craft, number, number][] = [
    ['burner', 40, 0],
    ['carpenter', 0, -40],
  ];
  crafts.forEach(([craft, x, z], k) => {
    const id = 50 + k;
    s.dwellings.push({
      id,
      type: CRAFT_BASE[craft],
      builtDay: DAY,
      condition: 1,
      position: { x, z, rotation: 0 },
      workshop: { ...newWorkshop(craft), waterDistanceM: 250 },
    });
    s.people.push(person(100 + 2 * k, 30, id, 'male'), person(101 + 2 * k, 27, id, 'female'));
  });
  s.crafts = { charcoalKg: 300, potteryKg: 20 };
  s.toolEquipmentKg = 20;
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

describe('ves bez kováře a hrnčíře beze změny (crafts.md – Uhlí a ruda kováře)', () => {
  it('uhlíř, tesař a vůz – stav po dvou letech jako před rudou', () => {
    const next = advanceVillage(village(), DAY + 730, null);
    expect(next.orePits).toBeUndefined();
    // učení řemesla (crafts.md – Učení řemesla, Starší vsi): dnešní řemeslníci jsou vyučení – jen
    // přibude praxe u lidí a příznak u dílen, simulace jde bit po bitu jako dřív
    expect(next.people.find((p) => p.id === 100)?.practice).toEqual({ burner: 5 });
    // příznak převodu dosahů čtyřkoláku (wagons.md – Co se vozí a na čem) – jen značka ve stavu;
    // pár a domy před svatbou v kronice (kinship.md – Svatba ve scéně) – jen zápis pro scénu
    const learning = new Set([
      'practice',
      'skillTracked',
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
      // značka převodu na osevní postup (fields.md – Osevní postup po dílech, bod 7)
      'sowingRotation',
      // zvěř vsi (wildlife.md) – přibyl klíč `wildlife`; v rámci dne ovlivňuje i simulaci, ale zlatý běh ji neprojeví
      'wildlife',
      // kusy poražené dnes (hlášení pro scénu – LivestockState.slaughtered) – simulace je nečte
      'slaughtered',
    ]);
    const stripped = JSON.stringify(legacyShape(next), (key, value: unknown) =>
      learning.has(key) ? undefined : value,
    );
    // otisk se změnil 22. 10. 2026: řemeslo dělají jen muži domácnosti, ženy dávají zbytek práce
    // po domácnosti vsi (crafts.md – Kdo dělá řemeslo); dřív 2f488a15; 23. 10. 2026 podruhé (6bd77b28): práce žen
    // je samostatný zásobník jen na setí, okopávání, žně a výmlat, ne do orby, kácení a staveb;
    // dřív d7d45927; 24. 10. 2026 potřetí (e92e2e86): ves má mimo dvorec 4 dospělé dílen, vojvodova
    // rodina proto cvičí mimo práci vsi a minimum dvorce kryje sama (lord.md – Den rodiny,
    // Zakládání vsi) – ves má méně práce, jinak staví, orá i jí; dřív 6bd77b28; 25. 10. 2026
    // počtvrté (573d22e4): stáda jen na seno, které ves stihne posekat (oxen.md – Stáda podle práce
    // na seč) – stav nese zápis volné práce na seč a po první sezóně menší stáda, otava má všechny
    // posečené louky se stropem práce; nouzová porážka bere ovce před kravami; dřív e92e2e86
    // 25. 10. 2026 popáté (8c518a4a): jen přejmenování plánu na hospodářský rok (`season`, `crops`) –
    // bez klíčů `plan` a `season` zůstal a87dde34; dřív 573d22e4
    // 26. 10. 2026 (W3 šelmy; wildlife.md – Vlci na dobytku): vlčí díl ztrát jen venku a medvěd bere prasata, takže stáda jdou po dnech jinak; dřív 8c518a4a
    // 26. 10. 2026 podruhé (oprava po recenzi W3): medvěd bere jen z prasat nad chovný pár a kronika šelem jde po měsících (jiné události kroniky); dřív e3e385c3
    // 26. 10. 2026 (W4 psi dvorce a velký lov rodu; wildlife.md – Psi, Lov rodu): obilí psů dvorce se sije z pole a pěší lovci a odešlí synové chybí v den lovu v práci vsi, takže se mění sklizeň, plán osevu a stav zvěře; dřív cc8c88e1
    // hash c3eb2c09 (26. 10. 2026, oprava po recenzi W4): psi dvorce vznikají hned, rodina na poli neloví, slabý jezdec jde pěšky a pěší lov je vydatnější – jiný lov a obilí psů; dřív f335bac8
    // hash 13eb70fa (26. 10. 2026, W7 ryby a oka; wildlife.md – Drobná zvěř a ryby): vesničané chytají ryby a zajíce z volné práce (nebo při hladu před stavbami), maso jde do zásoby bez porážky – jiná práce vsi, zásoby a stav zvěře; dřív c3eb2c09
    // hash 7bf72274 (26. 10. 2026, oprava po recenzi W7): roční kvóta ryb a zajíců, čerstvé maso a brzda letošním úlovkem – jiný úlovek, jídlo a stav zvěře; dřív 13eb70fa
    expect(hash(stripped)).toBe('7bf72274');
  }, 120_000);
});
