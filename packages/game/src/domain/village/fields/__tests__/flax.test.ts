import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import type { PartInput } from '../../core/actions';
import { endOfSeason } from '../fields';
import { expectedFlaxKg, flaxNeedKg, harvestFlax, linenCoverage, linenUnhappiness } from '../flax';
import { allocateDay } from '../../core/labor';

import { ageGroup } from '../../people/people';
import { NO_CRAFTS } from '../../core/productivity';
import { FERTILITY, FLAX, FLAX_WINDOWS, WEEDING_WOMEN, YIELD_BASE_KG_PER_HA } from '../../rules';
import { advanceVillage } from '../../core/simulate';
import { villageSheaves } from '../threshing';
import { withThreshingFloor } from '../../__tests__/village-fixtures';

import type { FieldPart, VillageState } from '../../types';
import { dayTaskOrder, fieldTasks, THRESH_RANK } from '../../core/simulate-work';
import {
  cropGrossPerHa,
  cropSeedPerHa,
  partWork,
  seasonCrop,
  seasonCrops,
  seasonPartIds,
} from '../../core/year-plan';

// Len (fields.md – Len, diet.md – Oděv; Martin 19. 10. 2026: „na částech pole musí být zasetý
// len“; 9. 11. 2026 večer: „Len je extrémně náročná plodina na kvalitu půdy. … Sklízí se v srpnu,
// ale obilí má vždy absolutní přednost“): len na jarních dílech do potřeby na oděv, trhá se jen
// v srpnu po obilí, nevytrhaný propadne; nedostatek ubere štěstí, nikdo nehladoví. Výběr dílů
// (nejúrodnější, 7 let) – sowing-rotation.test.ts.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const DAY = at(601, 9, 1);

function part(id: number, over: Partial<FieldPart> = {}): FieldPart {
  return {
    id,
    fieldId: 1,
    areaM2: 225,
    distanceM: 100,
    naturalFertility: 70,
    fertilityShare: 1,
    bonusUntilDay: null,
    state: 'sown',
    sownYears: 1,
    fallowSinceDay: null,
    foundingCost: 0,
    foundingDone: 0,
    surface: 'meadow',
    ...over,
  };
}

/** Startovní pole s rezervou půdy – 4 ha dílů po 225 m², úrodnost 70. */
const bigField = (count = 180): PartInput[] =>
  Array.from({ length: count }, (_, i) => ({
    areaM2: 225,
    distanceM: 50 + Math.round((100 * i) / (count - 1)),
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));

// ves s humnem – mlátí hned po žni (production-chains.md – Humno)
const found = (day: number, fieldParts = 180): VillageState =>
  withThreshingFloor(
    foundVillage({
      seed: 7,
      day,
      dwellingPosition: { x: 0, z: 0, rotation: 0 },
      firstField: {
        outline: [
          [0, 0],
          [10, 0],
          [10, 10],
        ],
        parts: bigField(fieldParts),
      },
    }),
  );

describe('kolik lnu ves potřebuje a výnos', () => {
  it('potřeba podle věku – dospělý a starší 2 kg, dítě 1 kg třeného lnu za rok', () => {
    const s = found(at(600, 3, 1));
    const expected = s.people.reduce((sum, p) => sum + FLAX.kgPerYear[ageGroup(p, DAY)], 0);
    expect(flaxNeedKg(s, DAY)).toBeCloseTo(expected, 9);
    expect(FLAX.kgPerYear).toEqual({ child: 1, adult: 2, elder: 2 });
  });

  it('výnos 550 kg/ha při plné úrodnosti, s úrodností jako obilí; osivo z vlastní úrody', () => {
    expect(cropGrossPerHa('flax', 100)).toBeCloseTo(FLAX.fiberKgPerHa, 9);
    expect(cropGrossPerHa('flax', 70)).toBeCloseTo(
      (cropGrossPerHa('spring', 70) / YIELD_BASE_KG_PER_HA) * FLAX.fiberKgPerHa,
      9,
    );
    // při úrodnosti 70 ≈ 450 kg/ha – Skotsko 18. st. 440–550, Irsko 1892 429 (rešerše)
    expect(cropGrossPerHa('flax', 70)).toBeCloseTo(451, 0);
    expect(cropSeedPerHa('flax')).toBe(0);
    expect(expectedFlaxKg(part(1), DAY)).toBeCloseTo(cropGrossPerHa('flax', 70) * 0.0225, 9);
  });

  it('práce: příprava půdy a setí jako jař, pletí 40, trhání a odnos 55, nemlátí se', () => {
    const p = part(1, { areaM2: 10_000 });
    const flax = partWork(p, DAY, NO_CRAFTS.tools, false, 'flax');
    const grain = partWork(p, DAY, NO_CRAFTS.tools, false, 'spring');
    expect(flax.dig).toBeCloseTo(grain.dig, 9);
    expect(flax.sow).toBeCloseTo(grain.sow, 9);
    expect(flax.weed / grain.weed).toBeCloseTo(10 / 8, 9);
    // obilí: sklizeň 15 + odnos 8 (fields.md – Práce, Zprůměrovaná žeň, 10. 11. 2026)
    expect(flax.harvest / grain.harvest).toBeCloseTo(55 / 23, 9);
    expect(flax.thresh).toBe(0);
  });

  it('osev lnu vyčerpá úrodnost 1,5× víc než obilí (len vysiluje půdu)', () => {
    const flax = part(1, { crop: 'flax', fertilityShare: 1 });
    const grain = part(2, { crop: 'spring', fertilityShare: 1 });
    endOfSeason(flax, DAY);
    endOfSeason(grain, DAY);
    expect(1 - flax.fertilityShare).toBeCloseTo(FLAX.sowDepletion, 9);
    expect(1 - grain.fertilityShare).toBeCloseTo(FERTILITY.sowDepletion, 9);
    expect(FLAX.sowDepletion / FERTILITY.sowDepletion).toBeCloseTo(1.5, 9);
  });
});

/** Otisk FNV-1a 32 bitů z JSON – pozná i nejmenší změnu výběru. */
function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return `${text.length}:${(h >>> 0).toString(16).padStart(8, '0')}`;
}

describe('zlatý otisk – výběr dílů a práce vsi k 2. 9.', () => {
  // Otisky jsou z doby před „Len napřed“ (20. 10. 2026) – výběr, ve kterém len pokryl potřebu,
  // se nesmí změnit. Spadne-li po záměrné změně pravidel osevu, vědomě se přepíše.

  it('plány vsi k 1. 9. tří let', () => {
    let state = found(at(600, 3, 1));
    const plans: Record<string, number[]>[] = [];
    for (const year of [601, 602, 603]) {
      state = advanceVillage(state, at(year, 9, 2), null);
      plans.push(
        Object.fromEntries(
          seasonCrops(state.season!).map(({ crop, work }) => [crop, work.partIds]),
        ),
      );
    }
    // ves bez stropu oseje všechny díly s prvním osevem už na podzim – 603 nezbude díl na len
    // (linen-short); otevřené pro Martina (fields.md – Osevní postup po dílech, bod 3, 9. 11. 2026)
    // přepsáno s výmlatem hned po žni (production-chains.md – Humno, 20. 10. 2026): ves s humnem
    // mlátí v srpnu a září – plán osevu odečte výmlat z podzimu a srpna, snopy jsou zásobou;
    // a s obilnými jámami (Obilné jámy, 20. 10. 2026): vymlácené zrno v zapečetěných jamách ubývá
    // méně (zásoby k 1. 9. jsou vyšší) a ukládání do jam bere na podzim práci před osevem navíc –
    // mění se výběr dílů, len dál bez nedostatku; a s nouzovým výmlatem přebytku nad kapacitu humna
    // (21. 10. 2026): výmlat, který humno nestihne, se mlátí nouzově (+30 % práce, bez kažení snopů)
    // – plán osevu ho počítá do podzimní práce; a s jarním vrácením přílohu pod jař (21. 10. 2026)
    // a se žněmi všemi rukama (fields.md – Žně všemi rukama, 24. 10. 2026): žeň 30 místo 50 čd/ha
    // a výrostci se staršími ve žních – červenec a srpen pojmou víc dílů, výběr se mění; a s co
    // největšími stády (oxen.md – Co nejvíc sena a co největší stáda, 24. 10. 2026): plán luštěnin
    // počítá celé stádo a seč všech luk bere volnou práci v červnu a červenci; a s porody, které
    // brzdí jen energie (Martin, 25. 10. 2026): víc porodů, víc lidí na poli; a s nutnými díly den
    // po dni místo plánu k 1. 9. (fields.md – Osevní postup po dílech, 25. 10. 2026): 2. 9. je
    // v práci, co ves za dva dny přibrala podle potřeby úrody – bez kapacity plánu (dřív
    // 721:3d269733); a s postupem práce po dílech od čela (fields.md – Postup práce po dílech,
    // 25. 10. 2026): 2. 9. je v práci jen dávka, kterou ves za WORK_FRONT_DAYS stihne (dřív
    // 1018:b6da3f2c); a s díly nad potřebu po stavbách (fields.md – Osevní postup po dílech,
    // bod 3, 25. 10. 2026): ves bez staveb obdělá i díly nad potřebu – víc zásob, jiná potřeba
    // úrody (dřív 167:3d9cb32c); a se škodami zvěře na polích (wildlife.md – Škody, 26. 10. 2026):
    // od 1. 6. ubývá úroda dílů prasaty, jeleny a vranami, výhled jídla a plán osevu k 1. 9. to
    // zná – jiný výběr dílů (dřív 171:fcbccd0e)
    // a se šelmami na dobytku (wildlife.md – Vlci na dobytku, 26. 10. 2026): vlčí díl jen venku a
    // medvěd – jiná stáda, jiné bílkoviny a plán osevu (dřív 165:b78c12b3); a s opravou škod zvěře
    // (wildlife.md – Škody, 26. 10. 2026): násobek malé vsi se počítá jen z dosud nesklizených
    // dílů (po sklizni ozimu se škoda jaře na ha nezvyšuje), výhled jídla bere jen dosud nasbíranou
    // škodu, takže skutečná sklizeň a plán osevu k 1. 9. se mírně změnily (dřív 167:abb10b73)
    // a se psy dvorce a velkým lovem rodu (wildlife.md – Psi, Lov rodu, 26. 10. 2026): obilí psů se
    // sije z pole a pěší lovci chybí v práci vsi – jiný plán osevu k 1. 9. (dřív 168:48676c9e)
    // 26. 10. 2026 (W7 ryby a oka): vesničané chytají ryby z volné práce, takže se mění plány vsi; dřív f2f1018c
    // oprava po recenzi W7 (26. 10. 2026): roční kvóta ryb a zajíců a čerstvé maso mění práci vsi; dřív c856e421
    // 161:edeabe8e (26. 10. 2026, závěrečná oprava zvěře): chuť na bílkoviny bez loňské drobné zvěře – jiné ryby a jídlo; dřív 161:c9dee13e
    // 165:82576eb1 (27. 10. 2026, osivo ze zásob při setí – fields.md, Úroda, Osivo ze zásob):
    // setí bere osivo ze zásob, výhled zásob k sklizni odečte osivo, které na setí čeká, a ves ho
    // nejí – jiné zásoby k 1. 9. a jiný plán osevu; dřív 161:edeabe8e
    // 163:73d7b124 (27. 10. 2026, SEED_STORES.floorRation 0,6 → 0,75 – fields.md, Osivo ze zásob):
    // ves pod pojistkou seje osivo do roční potřeby jen nad příděl 0,75 – menší osev; dřív 165:82576eb1
    // 165:82576eb1 (31. 10. 2026, SEED_STORES.floorRation 0,75 → 0,5 – Martin: „osivo se nejí“): práh
    // 0,5 už plán osevu k 1. 9. nemění oproti stavu s prahem 0,6 – otisk je zpět na 165:82576eb1
    // 163:1fa9eda1 (2. 11. 2026, příprava jaře jen na díly s osivem – fields.md, Osivo ze zásob):
    // nová ves založená 1. 3. nekope jař, na kterou nemá osivo – výběr dílů se mění; dřív 165:82576eb1
    // 158:fbeb05f6 (6. 11. 2026, osev má přednost – fields.md, Osivo ze zásob): ves si nechá jen
    // přežívací zásobu do žní a ostatní zrno je osivo – jiné zásoby a osev; dřív 163:1fa9eda1
    // 162:a9a20af5 (6. 11. 2026, přežívací zásoba podle celé stravy, nezaseté osivo po okně zpět do
    // zásob, díly nad potřebu v okně setí před stavbami – fields.md, Osivo ze zásob a bod 3): jiné
    // zásoby k 1. 9. a jiný výběr dílů; dřív 158:fbeb05f6
    // 152:979c21c8 (9. 11. 2026, luštěniny z polí vyřazené – fields.md, Luštěniny, zrušeno; žně
    // i v srpnu): plán bez luštěnin, díly jaře místo nich; dřív 162:a9a20af5
    // 154:0b8371f9 (9. 11. 2026, osivo bez cíle osevu a setí týž den za orbou – fields.md, Osivo
    // bez cíle osevu): hromada osiva okna, díl smí začít i v poslední den okna; dřív 152:979c21c8
    // 123:ac9d7796 (9. 11. 2026, díly jedna fronta bez stropu – fields.md, Osevní postup po
    // dílech, bod 3): ves bere všechny díly na řadě, pletí mužů po stavbách; dřív 154:0b8371f9
    // 149:b60f2983 (9. 11. 2026, zimní osivo a výhled zásob bez osiva, které ves ještě zaseje –
    // fields.md, Zimní osivo a Výhled zásob k sklizni): ves v zimě šetří na jař – jiné zásoby
    // a osev; dřív 123:ac9d7796
    // 120:58a8e173 (9. 11. 2026, len z polí vyřazený – fields.md, Zahrádka u obydlí): plán bez
    // dílů lnu, díly jaře místo nich; dřív 149:b60f2983
    // 124:fe7ca4e9 (9. 11. 2026, rozsévač za spřežením – fields.md, Práce, setí 10 → 3,3 čd/ha): ves
    // oseje víc dílů – jiné zásoby a výběr dílů; dřív 120:58a8e173
    // 139:0eabfd7a (9. 11. 2026, skladba dne podle období – population.md: venkovní práce podle
    // délky dne, poloviční minimum ve žních): žně stihnou víc, ves oseje víc dílů; dřív
    // 124:fe7ca4e9
    // 154:7d382a45 (9. 11. 2026 večer, len zpět na poli – fields.md, Len): plán k 1. 9. nese
    // potřebu lnu a 2. 9. 601 už díl lnu; dřív 139:0eabfd7a
    // 169:c1ff75b5 (9. 11. 2026, pořadí důležitosti polních prací a výmlat do zimy – fields.md):
    // výmlat čeká za přípravou půdy, plán osevu ho z podzimu neodečítá – jiné zásoby a výběr dílů;
    // dřív 154:7d382a45
    // 152:9a7a02d5 (10. 11. 2026, přílohová soustava do roku 1100 – fields.md): díl se osévá rok po
    // roku do 70 % a plodinu dostane podle prvního okna (ozim i po ozimu) – jiný výběr dílů;
    // dřív 169:c1ff75b5
    // 152:21f1a713 (10. 11. 2026, díly na len se odloží před ozimem – fields.md, Len): plán k 1. 9.
    // nezahrnuje do ozimu díly odložené na jarní len; dřív 152:9a7a02d5
    // 152:d4e3d735 (14. 11. 2026, ves jí med z klátů – hides-honey.md, Klát u obydlí): med šetří
    // obilí a ubírá podíl jídla z pole – jiné zásoby a plán osevu; dřív 152:21f1a713
    // 148:71cb4ea8 (14. 11. 2026, stavby staví muži – population.md, Práce, „D24 ano“): pole zakládá
    // jen práce mužů, která zbude po denní práci žen – méně dílů v plánu; dřív 152:21f1a713
    // (a 142:6739db1a)
    // 148:71cb4ea8 i po sloučení zboží vsi s D24 (14. 11. 2026): med plán osevu pod D24 nezmění
    // 152:4c6912f4 (15. 11. 2026, výhled jídla počítá se ztrátami obilí skladováním do žní –
    // fields.md, Přídělový systém): jiný příděl a přežívací zásoba – jiné zásoby a výběr dílů;
    // dřív 148:71cb4ea8
    // 159:d5b34cab (17. 11. 2026, D91 – Martin: „psi ať nic nespotřebovávají“ a maso krávy
    // 120 → 130 kg): psi dvorce už nejedí obilí a výhled osevu ho nepočítá, větší maso z porážky
    // mění jídlo a zásoby – jiný výběr dílů; dřív 152:4c6912f4
    // 18. 11. 2026 – strava po vrstvách, úloha 1; dřív 159:d5b34cab
    // 18. 11. 2026 – strava po vrstvách, úloha 4 (porážka celý rok); dřív 163:569fec9e
    // 18. 11. 2026 – strava po vrstvách, úloha 4, opravné kolo 1 (letní porážka po práci dne); dřív
    // 156:aa2d6716 (zpět na plány před úlohou 4)
    expect(fingerprint(plans)).toBe('163:569fec9e');
  });
});

describe('oděv ze lnu – trhání a štěstí', () => {
  it('ves bez zápisu má lnu dost; nedostatek ubere štěstí až 4', () => {
    expect(linenCoverage({})).toBe(1);
    expect(linenUnhappiness({})).toBe(0);
    expect(linenUnhappiness({ linen: 0 })).toBe(FLAX.unhappiness);
    expect(linenUnhappiness({ linen: 0.5 })).toBeCloseTo(2, 9);
  });

  it('plán bez potřeby (ves založená během roku, plán z doby lnu na zahrádkách) oděv nezapíše', () => {
    const s = advanceVillage(found(at(600, 3, 1)), at(600, 8, 30), null);
    expect(s.season).not.toBeNull();
    expect(s.season!.flaxNeedKg).toBeUndefined();
    const after = advanceVillage(s, at(600, 9, 1), null);
    expect(after.linen).toBeUndefined();
    expect(after.chronicle.some((e) => e.kind === 'linen-short')).toBe(false);
  });

  it('plán bez lnu s potřebou: 31. 8. podíl 0, upozornění do kroniky', () => {
    const s = advanceVillage(found(at(600, 3, 1)), at(600, 8, 30), null);
    const copy = JSON.parse(JSON.stringify(s)) as VillageState;
    copy.season!.flaxNeedKg = 12;
    const day = at(600, 8, 31);
    const event = harvestFlax(copy, day);
    expect(copy.linen).toBe(0);
    expect(event).toEqual({ day, kind: 'linen-short', kg: 0, neededKg: 12 });
  });
});

/**
 * Ves po listopadu 601 s lnem v letošní práci (k trhání v srpnu 602) – v září a říjnu dostanou
 * díly na řadě ozim, len (místo jaře) přibývá až s kopáním pod jař (přílohová soustava).
 */
let planned: VillageState | null = null;
function withFlax(): VillageState {
  planned ??= advanceVillage(found(at(600, 3, 1)), at(601, 11, 30), null);
  return JSON.parse(JSON.stringify(planned)) as VillageState;
}

describe('len v simulaci', () => {
  it('k 1. 9. potřeba v plánu, len na dílech do potřeby; v srpnu vytrhá a oděv má celý', () => {
    const s = withFlax();
    const flax = seasonCrop(s.season, 'flax');
    expect(flax).toBeDefined();
    expect(s.season!.flaxNeedKg).toBeCloseTo(flaxNeedKg(s, at(601, 9, 1)), 9);
    const byId = new Map(s.parts.map((p) => [p.id, p]));
    expect(flax!.partIds.every((id) => byId.get(id)?.crop === 'flax')).toBe(true);
    expect(seasonPartIds(s.season!)).toEqual(expect.arrayContaining(flax!.partIds));
    const expected = flax!.partIds.reduce(
      (sum, id) => sum + expectedFlaxKg(byId.get(id)!, s.lastDay),
      0,
    );
    expect(expected).toBeGreaterThanOrEqual(s.season!.flaxNeedKg! - 1e-9);
    // bez posledního dílu by len potřebu nepokryl – jen do potřeby
    const last = byId.get(flax!.partIds.at(-1)!)!;
    expect(expected - expectedFlaxKg(last, s.lastDay)).toBeLessThan(s.season!.flaxNeedKg!);
    // 31. 7. len ještě na poli – trhá se jen v srpnu
    const july = advanceVillage(s, at(602, 7, 31), null);
    expect(seasonCrop(july.season!, 'flax')!.done.harvest).toBe(0);
    expect(seasonCrop(july.season!, 'flax')!.harvestedKg).toBeNull();
    // 31. 8. plán jde k výmlatu (`threshingSeason`)
    const pulled = advanceVillage(july, at(602, 8, 31), null);
    const work = seasonCrop(pulled.threshingSeason!, 'flax')!;
    expect(work.harvestedKg).toBeGreaterThan(0);
    expect(work.done.thresh).toBe(0);
    expect(pulled.linen).toBe(1);
    // 1. 9. si díly len zapamatují
    const next = advanceVillage(pulled, at(602, 9, 1), null);
    for (const id of work.partIds) {
      expect(next.parts.find((p) => p.id === id)?.flaxYear).toBe(602);
    }
  });

  it('trhání lnu v srpnu – ženy a děti napřed, jinak za žněmi obilí, před sečí a výmlatem; rodina nepomáhá', () => {
    expect(FLAX_WINDOWS.harvest).toEqual([[8, 8]]);
    // 1. 8. – ženy a děti len v prvních srpnových dnech vytrhají (Martin 10. 11. 2026)
    const s = advanceVillage(withFlax(), at(602, 7, 31), null);
    const tasks = fieldTasks(s, at(602, 8, 1), 0);
    const flax = tasks.find((t) => t.crop === 'flax' && t.name === 'harvest');
    expect(flax).toBeDefined();
    const task = (
      over: Partial<Parameters<typeof dayTaskOrder>[0]>,
    ): Parameters<typeof dayTaskOrder>[0] => ({
      name: 'thresh',
      remaining: 1,
      end: 9,
      tie: 1,
      rank: THRESH_RANK,
      ...over,
    });
    const flaxTask = task({ name: 'harvest', end: flax!.end, rank: flax!.rank, field: flax });
    // za všemi žněmi obilí – i za žní jaře (okno do září)
    for (const reap of tasks.filter((t) => t.name === 'harvest' && t.crop !== 'flax')) {
      const grain = task({ name: 'harvest', end: reap.end, rank: reap.rank, field: reap });
      expect(dayTaskOrder(flaxTask, grain)).toBeGreaterThan(0);
    }
    // výmlat na dnešní jídlo napřed
    expect(dayTaskOrder(flaxTask, task({ thresh: { urgent: true } as never }))).toBeGreaterThan(0);
    // výmlat (i v posledním měsíci okna a zpožděný) a seč až po lnu
    expect(dayTaskOrder(flaxTask, task({ thresh: {} as never, end: 8 }))).toBeLessThan(0);
    expect(dayTaskOrder(flaxTask, task({ thresh: {} as never, end: 99 }))).toBeLessThan(0);
    expect(
      dayTaskOrder(flaxTask, task({ name: 'mow', end: Infinity, tie: 3, rank: 1 })),
    ).toBeLessThan(0);
    // pomoc rodiny jde na žeň obilí, na len ne
    const allocation = allocateDay({
      householdElders: [0],
      potteryCoverage: NO_CRAFTS.pottery,
      capacity: 0,
      lordHelp: 20,
      tasks: [
        { name: 'harvest', remaining: 5 },
        { name: 'harvest', remaining: 5, noLordHelp: true },
      ],
    });
    expect(allocation.taskAmounts).toEqual([5, 0]);
    // ženy a děti trhají napřed (fields.md – Len; Martin 10. 11. 2026): výrostci a starší ze
    // žňových rukou, ženy řemeslníků, ženy vsi nad svůj díl minima – muži (zbytek vsi) žnou obilí;
    // řemeslníci se syny (zbytek žňových rukou) jdou na žeň obilí
    const women = allocateDay({
      householdElders: [0],
      potteryCoverage: NO_CRAFTS.pottery,
      capacity: 6,
      harvestHands: 2,
      harvestYouth: 1,
      light: 0.5,
      womenLabor: 3,
      tasks: [
        { name: 'harvest', remaining: 20 },
        { name: 'harvest', remaining: 2, noLordHelp: true, womenFirst: true },
      ],
    });
    const minimum = women.dailyMin;
    const womenFree = Math.max(0, 3 - WEEDING_WOMEN.dailyMinShare * minimum);
    expect(womenFree).toBeGreaterThan(0.5);
    expect(women.taskAmounts[1]).toBeCloseTo(2, 9);
    expect(women.harvestHands).toBeCloseTo(2, 9);
    // obilí: řemeslníci (1) a zbytek vsi po lnu (ženy vsi daly 0,5)
    expect(women.taskAmounts[0]).toBeCloseTo(1 + 6 - minimum - 0.5, 9);
    // bez lnu: len jen z práce, která po obilí zbude
    const after = allocateDay({
      householdElders: [0],
      potteryCoverage: NO_CRAFTS.pottery,
      capacity: 6,
      harvestHands: 2,
      tasks: [
        { name: 'harvest', remaining: 20 },
        { name: 'harvest', remaining: 2, noLordHelp: true },
      ],
    });
    expect(after.taskAmounts[1]).toBe(0);
  });

  it('nevytrhaný len 31. 8. propadne – oděvu chybí; muži dál žnou obilí, nikdo nehladoví', () => {
    const base = advanceVillage(withFlax(), at(602, 7, 31), null);
    // len, který ves v srpnu nestihne ani se všemi ženami a dětmi: trhání ×1000 (dřív ×100 – ženy
    // a děti trhají od 10. 11. 2026 napřed a ×100 vytrhají)
    const heavy = JSON.parse(JSON.stringify(base)) as VillageState;
    const flax = seasonCrop(heavy.season!, 'flax')!;
    flax.required.harvest *= 1000;
    // bez lnu v letošní práci (díly zůstanou bez práce)
    const none = JSON.parse(JSON.stringify(base)) as VillageState;
    none.season!.crops = none.season!.crops.filter((c) => c.crop !== 'flax');
    const a = advanceVillage(heavy, at(602, 8, 31), null);
    const b = advanceVillage(none, at(602, 8, 31), null);
    const pulled = seasonCrop(a.threshingSeason!, 'flax')!;
    expect(pulled.done.harvest).toBeGreaterThan(0);
    expect(pulled.done.harvest).toBeLessThan(pulled.required.harvest);
    expect(a.linen).toBeLessThan(1);
    expect(a.chronicle.some((e) => e.kind === 'linen-short' && e.day === at(602, 8, 31))).toBe(
      true,
    );
    // obilí: ženy a děti trhají napřed (Martin 10. 11. 2026), muži dál žnou – žeň skoro stejná jako
    // bez lnu i s takovým lnem; výmlat s oknem i v září len jen odsune – zrno je ve snopech
    const grainKg = (v: VillageState): number =>
      v.chronicle
        .filter((e) => e.kind === 'harvest' && e.day > base.lastDay)
        .reduce((sum, e) => sum + (e.kind === 'harvest' ? e.kg : 0), 0);
    expect(grainKg(b)).toBeGreaterThan(0);
    expect(grainKg(a)).toBeGreaterThan(grainKg(b) * 0.97);
    const total = (v: VillageState): number => v.storesKg + villageSheaves(v).grainKg;
    expect(total(a)).toBeGreaterThan(total(b) * 0.97);
    // nikdo nehladoví – jídlo dne celé
    expect(a.ration ?? null).toEqual(b.ration ?? null);
  });

  it('po kouscích s JSON mezi nimi dá stejný stav jako jedním voláním (3 roky)', () => {
    const start = found(at(600, 3, 1));
    const whole = advanceVillage(start, at(603, 3, 1), null);
    let chunked = start;
    for (const day of [
      at(600, 8, 31),
      at(601, 9, 1),
      at(602, 8, 15),
      at(602, 8, 31),
      at(603, 3, 1),
    ]) {
      chunked = JSON.parse(JSON.stringify(advanceVillage(chunked, day, null))) as VillageState;
    }
    expect(chunked).toEqual(JSON.parse(JSON.stringify(whole)));
    expect(whole.linen).toBeDefined();
  });
});
