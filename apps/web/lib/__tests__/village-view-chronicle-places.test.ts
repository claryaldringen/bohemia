import { describe, expect, it } from 'vitest';
import type { ChronicleEvent, ChronicleRoadEnd } from '@bohemia/game';
import { neighbourOf } from '@bohemia/game';
import { chronicleText, landmarkPhrase, roadBetween } from '../village-view-chronicle';
import { withVillagersOf } from '../village-name-cases';

// Kronika – cesty, opevnění a ohrady popsané místem (Martin 14. 11. 2026).

const DAY = 100;
const manor: ChronicleRoadEnd = { kind: 'dwelling', type: 'dvorec' };
const smithy: ChronicleRoadEnd = { kind: 'dwelling', type: 'polozemnice', craft: 'smith' };
const water: ChronicleRoadEnd = { kind: 'place', place: 'water' };
const river: ChronicleRoadEnd = { kind: 'place', place: 'water:river' };

describe('kronika – konce cesty v 7. pádě', () => {
  it('stavby, místa, křižovatky, kraj mapy, stejné konce', () => {
    expect(roadBetween([manor, smithy])).toBe('mezi dvorcem a kovárnou');
    expect(roadBetween([{ kind: 'dwelling', type: 'zemnice' }, water])).toBe(
      'mezi zemnicí a potokem',
    );
    expect(
      roadBetween([
        { kind: 'junction', shape: 'y' },
        { kind: 'place', place: 'field' },
      ]),
    ).toBe('mezi rozcestím a polem');
    expect(
      roadBetween([
        { kind: 'junction', shape: 'cross' },
        { kind: 'edge', direction: 'NE' },
      ]),
    ).toBe('mezi křižovatkou a severovýchodním krajem mapy');
    expect(
      roadBetween([
        { kind: 'place', place: 'field' },
        { kind: 'place', place: 'field' },
      ]),
    ).toBe('mezi polem a dalším polem');
    expect(
      roadBetween([
        { kind: 'junction', shape: 'cross' },
        { kind: 'junction', shape: 'star' },
      ]),
    ).toBe('mezi křižovatkou a další křižovatkou');
    expect(roadBetween([manor, { kind: 'place', place: 'lodge' }])).toBeNull();
  });
});

describe('kronika – jabloně podél cesty (D36)', () => {
  const apples = (extra: object = {}): ChronicleEvent => ({
    day: DAY,
    kind: 'construction-finished',
    constructionKind: 'road-apples',
    dwellingId: null,
    fieldId: null,
    ...extra,
  });
  it('s konci cesty i bez nich', () => {
    expect(chronicleText(apples({ roadEnds: [manor, smithy] }), 'X')).toBe(
      'Podél cesty mezi dvorcem a kovárnou byly vysazeny jabloně.',
    );
    expect(chronicleText(apples(), 'X')).toBe('Podél cesty byly vysazeny jabloně.');
  });
});

describe('kronika – vyšlapaná cesta (D40)', () => {
  const formed = (extra: object = {}): ChronicleEvent => ({
    day: DAY,
    kind: 'road-formed',
    roadId: 5,
    ...extra,
  });
  it('roky chůze a konce', () => {
    expect(chronicleText(formed({ ends: [manor, water], years: 12 }), 'X')).toBe(
      'Po 12 letech chůze lidé vyšlapali cestu mezi dvorcem a potokem.',
    );
    expect(chronicleText(formed({ ends: [manor, water], years: 1 }), 'X')).toBe(
      'Po roce chůze lidé vyšlapali cestu mezi dvorcem a potokem.',
    );
    expect(chronicleText(formed({ ends: [manor, water], years: 0 }), 'X')).toBe(
      'Lidé vyšlapali cestu mezi dvorcem a potokem.',
    );
    expect(chronicleText(formed({ ends: [manor, water] }), 'X')).toBe(
      'Lidé vyšlapali cestu mezi dvorcem a potokem.',
    );
    // řeka (D44)
    expect(chronicleText(formed({ ends: [manor, river], years: 12 }), 'X')).toBe(
      'Po 12 letech chůze lidé vyšlapali cestu mezi dvorcem a řekou.',
    );
    expect(roadBetween([river, river])).toBe('mezi řekou a další řekou');
    expect(chronicleText(formed({ years: 3 }), 'X')).toBe(
      'Po 3 letech chůze lidé vyšlapali cestu.',
    );
    expect(chronicleText(formed(), 'X')).toBe('Lidé vyšlapali pevnou cestu.');
  });
});

describe('kronika – zbořené opevnění z rozkazu (D41)', () => {
  const demolished = (extra: object = {}): ChronicleEvent => ({
    day: DAY,
    kind: 'fortification-demolished',
    logs: 9,
    ...extra,
  });
  it('vojvoda, lokte a brány na koncích úseku', () => {
    expect(
      chronicleText(
        demolished({
          lord: 'Lutobor',
          lengthM: 15.4,
          gates: [{ direction: 'N' }, { tower: true }],
        }),
        'X',
      ),
    ).toBe('Vojvoda Lutobor přikázal zbořit 26 loktů opevnění od severní brány k věži.');
    expect(
      chronicleText(
        demolished({
          lord: 'Lutobor',
          lengthM: 1.5,
          gates: [{ direction: 'W' }, { direction: 'S' }],
        }),
        'X',
      ),
    ).toBe('Vojvoda Lutobor přikázal zbořit 3 lokty opevnění od západní brány k jižní bráně.');
    expect(
      chronicleText(
        demolished({ lord: 'Lutobor', lengthM: 180, gates: [{}, {}], around: true }),
        'X',
      ),
    ).toBe('Vojvoda Lutobor přikázal zbořit 304 loktů opevnění od brány dokola zpět k bráně.');
    expect(chronicleText(demolished({ lord: 'Lutobor', lengthM: 0.5 }), 'X')).toBe(
      'Vojvoda Lutobor přikázal zbořit 1 loket opevnění.',
    );
    expect(
      chronicleText(
        demolished({
          level: true,
          lengthM: 30,
          gates: [
            { tower: true, direction: 'E' },
            { tower: true, direction: 'S' },
          ],
        }),
        'X',
      ),
    ).toBe('Srovnali 51 loktů valu od východní věže k jižní věži.');
    expect(chronicleText(demolished(), 'X')).toBe('Úsek opevnění byl zbořen.');
  });
});

describe('kronika – ohrada (D43)', () => {
  const pen = (extra: object = {}): ChronicleEvent => ({
    day: DAY,
    kind: 'construction-finished',
    constructionKind: 'pen',
    dwellingId: null,
    fieldId: null,
    ...extra,
  });
  it('druh ve 4. pádě množného čísla, rozšíření, zrušení', () => {
    expect(chronicleText(pen({ penSpecies: 'sheep' }), 'X')).toBe(
      'Byla postavena ohrada pro ovce.',
    );
    expect(chronicleText(pen({ penSpecies: 'team' }), 'X')).toBe('Byla postavena ohrada pro voly.');
    expect(chronicleText(pen({ penSpecies: 'horse' }), 'X')).toBe(
      'Byla postavena ohrada pro koně.',
    );
    expect(chronicleText(pen({ penSpecies: 'pig' }), 'X')).toBe(
      'Byla postavena ohrada pro prasata.',
    );
    expect(chronicleText(pen({ penSpecies: 'cattle', penExtended: true }), 'X')).toBe(
      'Ohrada pro skot byla rozšířena.',
    );
    expect(chronicleText(pen(), 'X')).toBe('Byla postavena ohrada.');
    expect(
      chronicleText(
        { day: DAY, kind: 'construction-cancelled', constructionKind: 'pen', penSpecies: 'goat' },
        'X',
      ),
    ).toBe('Stavba ohrady pro kozy se zrušila.');
    expect(
      chronicleText({ day: DAY, kind: 'construction-cancelled', constructionKind: 'pen' }, 'X'),
    ).toBe('Stavba ohrady se zrušila.');
  });
});

describe('kronika – vylepšená cesta', () => {
  const upgraded = (extra: object = {}): ChronicleEvent => ({
    day: DAY,
    kind: 'construction-finished',
    constructionKind: 'road',
    dwellingId: null,
    fieldId: null,
    ...extra,
  });
  it('vojvoda a konce, správce, starý zápis', () => {
    expect(chronicleText(upgraded({ lord: 'Lutobor', roadEnds: [manor, water] }), 'X')).toBe(
      'Vojvoda Lutobor nechal vylepšit cestu mezi dvorcem a potokem.',
    );
    expect(chronicleText(upgraded({ bySteward: true, roadEnds: [manor, smithy] }), 'X')).toBe(
      'Správce nechal vylepšit cestu mezi dvorcem a kovárnou.',
    );
    expect(chronicleText(upgraded({ lord: 'Lutobor' }), 'X')).toBe(
      'Vojvoda Lutobor nechal vylepšit cestu.',
    );
    expect(chronicleText(upgraded(), 'X')).toBe('Cesta byla vylepšena.');
  });
});

describe('kronika – křižovatka podle významného místa (D66)', () => {
  const fork = (near?: object): ChronicleRoadEnd =>
    ({ kind: 'junction', shape: 'y', ...(near ? { near } : {}) }) as ChronicleRoadEnd;
  const cross = (near?: object): ChronicleRoadEnd =>
    ({ kind: 'junction', shape: 'cross', ...(near ? { near } : {}) }) as ChronicleRoadEnd;
  const smith = { kind: 'dwelling', type: 'srub', craft: 'smith', at: 'at' };

  it('u, pod, nad – 2. a 7. pád místa', () => {
    expect(roadBetween([fork(smith), { kind: 'place', place: 'field' }])).toBe(
      'mezi rozcestím u kovárny a polem',
    );
    expect(roadBetween([cross({ kind: 'dwelling', type: 'dvorec', at: 'below' }), smithy])).toBe(
      'mezi křižovatkou pod dvorcem a kovárnou',
    );
    expect(roadBetween([fork({ kind: 'place', place: 'water', at: 'above' }), manor])).toBe(
      'mezi rozcestím nad potokem a dvorcem',
    );
    expect(roadBetween([cross({ kind: 'place', place: 'church', at: 'at' }), water])).toBe(
      'mezi křižovatkou u kostela a potokem',
    );
    expect(roadBetween([fork({ kind: 'place', place: 'water:river', at: 'at' }), manor])).toBe(
      'mezi rozcestím u řeky a dvorcem',
    );
    // stejné konce i s místem
    expect(roadBetween([fork(smith), fork(smith)])).toBe(
      'mezi rozcestím u kovárny a dalším rozcestím u kovárny',
    );
  });

  it('kraj mapy – soused, bez místa poloha vůči vsi, starší zápis postaru', () => {
    const north = neighbourOf(7, 'N').name;
    const edge = { kind: 'edge', direction: 'N' } as const;
    expect(landmarkPhrase(edge, 7)).toBe(`u hranice ${withVillagersOf(north)}`);
    expect(landmarkPhrase(edge)).toBe('u severního kraje mapy');
    expect(landmarkPhrase({ kind: 'village' })).toBe('uprostřed vsi');
    expect(landmarkPhrase({ kind: 'village', direction: 'SW' })).toBe('na jihozápadní straně vsi');
    expect(landmarkPhrase({ kind: 'village', direction: 'N', outside: true })).toBe(
      'severně od vsi',
    );
    expect(roadBetween([cross({ kind: 'village', direction: 'E', outside: true }), water])).toBe(
      'mezi křižovatkou východně od vsi a potokem',
    );
    // k sousedovi „z rozcestí u kovárny do Lhoty“
    expect(roadBetween([fork(smith), { kind: 'edge', direction: 'N' }], 7)).toMatch(
      /^z rozcestí u kovárny do /,
    );
    expect(roadBetween([fork(), manor])).toBe('mezi rozcestím a dvorcem');
  });
});

describe('kronika – zarostlá cesta (D67)', () => {
  const overgrown = (extra: object = {}): ChronicleEvent =>
    ({ day: DAY, kind: 'road-overgrown', roadId: 4, ...extra }) as ChronicleEvent;
  it('konce cesty, jen část, starší zápis', () => {
    expect(chronicleText(overgrown({ ends: [smithy, water] }), 'X')).toBe(
      'Nepoužívaná cesta mezi kovárnou a potokem zarostla.',
    );
    expect(chronicleText(overgrown({ ends: [smithy, water], part: true }), 'X')).toBe(
      'Část nepoužívané cesty mezi kovárnou a potokem zarostla.',
    );
    expect(chronicleText(overgrown(), 'X')).toBe('Nepoužívaná cesta zarostla.');
  });
});
