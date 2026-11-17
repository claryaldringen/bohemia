import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import { newWorkshop } from '../crafts';
import { CRAFT_BASE } from '../../rules';
import { advanceVillage } from '../../core/simulate';
import type { Craft, Person, VillageState } from '../../types';
import { withBuiltFirstDwelling, withoutNoticeChronicle } from '../../__tests__/village-fixtures';

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
/** Kopie objektu bez klíčů `keys` (pořadí ostatních klíčů zůstane). */
function withoutKeys(value: object, keys: readonly string[]): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const key of keys) delete copy[key];
  return copy;
}

function legacyShape(state: VillageState): unknown {
  const { toolEquipmentKg, ...rest } = state;
  const c = rest.crafts;
  return {
    ...rest,
    // jména lidí a v zápisech kroniky (population.md – Jména) – jen záznam, simulace je nečte
    people: rest.people.map((p) => withoutKeys(p, ['name'])),
    // zásoba u sklizně a počet obyvatel (kronika, 17. 11. 2026) jsou jen zápis – otisk řemesel je neměří
    chronicle: rest.chronicle.map((e) =>
      withoutKeys(e, ['name', 'personId', 'female', 'stock', 'population']),
    ),
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
      // správce vsi (steward.md – Stav správce) – vypnutý, jen značka `steward`
      'steward',
      // značka převodu na osevní postup (fields.md – Osevní postup po dílech, bod 7)
      'sowingRotation',
      // zvěř vsi (wildlife.md) – přibyl klíč `wildlife`; v rámci dne ovlivňuje i simulaci, ale zlatý běh ji neprojeví
      'wildlife',
      // kusy poražené dnes (hlášení pro scénu – LivestockState.slaughtered) – simulace je nečte
      'slaughtered',
      // osivo ze zásob při setí (fields.md – Úroda, Osivo ze zásob, 27. 10. 2026) – zlatá ves má
      // zásoby nad pojistkou, setí osivo neomezí a bez nových klíčů vyšel stav stejně (7bf72274)
      'armsCapped', // příznak převodu stropů výcviku (war.md – Síla), do stavu nic nemění
      'seedKg',
      'seedWaitingKg',
      'seedFloorKg',
      // hromada osiva okna setí (fields.md – Osivo bez cíle osevu, 9. 11. 2026)
      'sowingSeed',
      // výběr dílů z posledního dne s místem na čele (fields.md – Postup práce po dílech, výkon)
      'selection',
      // ruce pro výmlat dne (production-chains.md – Humno, Výhled jídla; 2. 11. 2026) – podle nich
      // výhled výmlatu do konce okna
      'threshHands',
      // zboží vsi – kůže, kožešiny, med a vosk (hides-honey.md): zásoby, potřeba a várky; práci
      // na zpracování kůží hlídá zbytek otisku (oka a ryby z toho, co po ní zbude)
      'wares',
    ]);
    // trvalé stavy z upozornění do kroniky (absence.md, 9. 11. 2026) – jen zápis, simulaci nemění
    const stripped = JSON.stringify(
      legacyShape(withoutNoticeChronicle(next)),
      (key, value: unknown) => (learning.has(key) ? undefined : value),
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
    // hash d6a17a0c (6. 11. 2026, Ú6.1 stropy výcviku; war.md – Síla): rodina cvičí doma nejvýš do 50 (dřív 100), takže jezdci a lovci jsou slabší – jiný lov a práce vsi; dřív 7bf72274
    // hash b19ba3eb (9. 11. 2026, len z polí vyřazený – fields.md, Zahrádka u obydlí): plán bez dílů lnu, jař místo nich, oděv ze zahrádek – jiný osev, práce a štěstí; dřív d6a17a0c
    // hash d7b0bb8d (9. 11. 2026, skladba dne podle období – population.md: venkovní práce podle
    // délky dne, poloviční minimum ve žních, dříví v zimě, se sněhem bez vody): jiná práce, osev
    // a zásoby; dřív b19ba3eb
    // hash d0039846 (9. 11. 2026 večer, len zpět na poli – fields.md, Len): díly lnu do potřeby na
    // oděv, trhání v srpnu za žněmi obilí, zahrádka jen luštěniny – jiný osev, práce a štěstí; dřív
    // d7b0bb8d
    // hash 971d2cb8 (10. 11. 2026, zima bez sena – diet.md a oxen.md, Zima bez sena): seč srpem
    // (menší seno z volné práce `mowCapacityKg`, dražší vůl `oxCost`), stádo žere jen ve sněhu
    // (`herdNeedKg`); stáda, lidé a zásoby beze změny; dřív d0039846
    // hash d068311f (14. 11. 2026, kůže a kožešiny – hides-honey.md, Zpracování v domácnosti):
    // domácnosti v zimě zpracují kůže a kožešiny ze zbytku práce napřed, ryby a oka dostanou
    // jen to, co zbude – jiný úlovek a jídlo; dřív 971d2cb8
    // hash 12845e84 (14. 11. 2026, ves jí med z klátů – hides-honey.md, Klát u obydlí): med šetří
    // obilí (zásoby, jídlo) a ubírá podíl jídla z pole (výhled zásob k sklizni); dřív d068311f
    // hash 56ec5ab2 (14. 11. 2026, stavby staví muži – population.md, Práce, „D24 ano“): denní práci
    // nesou napřed ženy, na stavby jde jen práce mužů, která zbude; dřív 971d2cb8 (a 96b811ae)
    // hash d30e476f (14. 11. 2026, sloučení zboží vsi s D24): obojí mění práci a jídlo vsi; dřív
    // 12845e84 (zboží bez D24) a 56ec5ab2 (D24 bez zboží)
    expect(hash(stripped)).toBe('d30e476f');
  }, 120_000);
});
