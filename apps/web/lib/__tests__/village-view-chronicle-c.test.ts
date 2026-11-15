// Kronika – dávka C (Martin 15. 11. 2026): obnova sadu jedním zápisem, cesty k sousedům, úmrtí
// a návraty z tažení kronikářsky.
import { describe, expect, it } from 'vitest';
import { neighbourOf, type ChronicleEvent, type ChronicleRoadEnd } from '@bohemia/game';
import { chroniclePage } from '../chronicle-view';
import { chronicleText, orchardRenewalText, roadBetween } from '../village-view-chronicle';
import { fromVillage, toVillage } from '../village-name-cases';

const DAY = 100;
const SEED = 7;

type Death = Extract<ChronicleEvent, { kind: 'death' }>;
const death = (fields: Partial<Death>): ChronicleEvent => ({
  day: DAY,
  kind: 'death',
  group: 'adult',
  ...fields,
});

describe('kronika – jména všech lidí (population.md – Jména)', () => {
  it('žena jménem za postavením; dítě jménem při narození', () => {
    const wife = { title: 'smith', kin: 'wife', female: true } as const;
    expect(
      chronicleText(death({ age: 41, estate: wife, cause: 'hunger', name: 'Ludmila' }), 'Ves'),
    ).toBe('Ve věku 41 let zemřela hlady kovářka Ludmila.');
    expect(
      chronicleText(
        death({
          group: 'child',
          age: 12,
          estate: { title: 'farmer', kin: 'child', female: true, headName: 'Bořivoj' },
          name: 'Mlada',
        }),
        'Ves',
      ),
    ).toBe('Ve věku 12 let zemřela dcera sedláka Bořivoje Mlada.');
    expect(chronicleText({ day: DAY, kind: 'birth', name: 'Radim' }, 'Ves')).toBe(
      'Narodil se Radim.',
    );
    expect(chronicleText({ day: DAY, kind: 'birth', name: 'Ludmila', female: true }, 'Ves')).toBe(
      'Narodila se Ludmila.',
    );
    // syn vojvody, který čeká na jméno, a starší zápisy
    expect(chronicleText({ day: DAY, kind: 'birth' }, 'Ves')).toBe('Narodilo se dítě.');
  });
});

describe('kronika – úmrtí kronikářsky', () => {
  it('věk, postavení a jméno; příčina jen když nebyla stáří', () => {
    const farmer = { title: 'farmer', kin: 'head' } as const;
    expect(
      chronicleText(death({ group: 'elder', age: 64, estate: farmer, name: 'Bořivoj' }), 'Ves'),
    ).toBe('Ve věku 64 let zemřel sedlák Bořivoj.');
    expect(chronicleText(death({ age: 30, estate: farmer }), 'Ves')).toBe(
      'Ve věku 30 let zemřel sedlák.',
    );
    expect(
      chronicleText(
        death({ age: 41, estate: { title: 'smith', kin: 'wife', female: true }, cause: 'hunger' }),
        'Ves',
      ),
    ).toBe('Ve věku 41 let zemřela hlady kovářka.');
    expect(
      chronicleText(
        death({ age: 50, estate: { title: 'voivode', kin: 'wife', female: true } }),
        'Ves',
      ),
    ).toBe('Ve věku 50 let zemřela vojvodova žena.');
  });

  it('děti a příbuzní hlavy domu', () => {
    expect(
      chronicleText(
        death({
          group: 'child',
          age: 12,

          estate: { title: 'farmer', kin: 'child', headName: 'Bořivoj' },
          name: 'Radim',
        }),
        'Ves',
      ),
    ).toBe('Ve věku 12 let zemřel syn sedláka Bořivoje Radim.');
    expect(
      chronicleText(
        death({ group: 'child', age: 0, estate: { title: 'potter', kin: 'child', female: true } }),
        'Ves',
      ),
    ).toBe('V prvním roce života zemřela dcera hrnčíře.');
    expect(
      chronicleText(
        death({ group: 'child', age: 1, estate: { title: 'farmer', kin: 'other' } }),
        'Ves',
      ),
    ).toBe('Ve věku 1 roku zemřel chlapec.');
    expect(
      chronicleText(
        death({
          group: 'elder',
          age: 70,
          estate: { title: 'voivode', kin: 'parent', headName: 'Kojata', female: true },
        }),
        'Ves',
      ),
    ).toBe('Ve věku 70 let zemřela matka vojvody Kojaty.');
  });

  it('boj, šelma a lov', () => {
    const son = { title: 'voivode', kin: 'child', headName: 'Bořivoj' } as const;
    expect(
      chronicleText(death({ age: 19, estate: son, name: 'Ctibor', cause: 'war' }), 'Ves'),
    ).toBe('Ve věku 19 let padl v boji syn vojvody Bořivoje Ctibor.');
    expect(
      chronicleText(
        death({
          age: 33,

          estate: { title: 'voivode', kin: 'head' },
          name: 'Bořivoj',
          cause: 'beast',
          by: 'wolves',
        }),
        'Ves',
      ),
    ).toBe('Ve věku 33 let zahynul na cestě vojvoda Bořivoj – zabili ho vlci.');
    expect(
      chronicleText(
        death({ age: 25, estate: son, name: 'Radim', cause: 'hunt', prey: 'bear' }),
        'Ves',
      ),
    ).toBe('Ve věku 25 let zahynul na lovu medvěda syn vojvody Bořivoje Radim.');
  });

  it('starší zápisy bez postavení a bez věku', () => {
    expect(chronicleText(death({ age: 30 }), 'Ves')).toBe(
      'Ve věku 30 let zemřel jeden z dospělých.',
    );
    expect(chronicleText(death({ group: 'child', age: 3, cause: 'flood' }), 'Ves')).toBe(
      'Ve věku 3 let utonulo při povodni dítě.',
    );
    expect(chronicleText(death({ group: 'elder' }), 'Ves')).toBe('Jeden ze starších zemřel.');
    expect(chronicleText(death({ cause: 'beast', by: 'bear', name: 'Bořivoj' }), 'Ves')).toBe(
      'Bořivoj zahynul na cestě – zabil ho medvěd.',
    );
  });
});

describe('kronika – návrat z tažení', () => {
  const back = (
    who: Extract<ChronicleEvent, { kind: 'people-back' }>['who'],
    deserted = false,
  ): ChronicleEvent => ({
    day: DAY,
    kind: 'people-back',
    away: 'campaign',
    people: who?.length ?? 2,
    ...(who ? { who } : {}),
    ...(deserted ? { deserted: true as const } : {}),
  });
  const farmer = { estate: { title: 'farmer', kin: 'head' } } as const;

  it('jménem a postavením, víc lidí výčtem, nad 3 „a další“', () => {
    expect(chronicleText(back([{ ...farmer, name: 'Bořivoj' }]), 'Ves')).toBe(
      'Z tažení se vrátil sedlák Bořivoj.',
    );
    expect(
      chronicleText(
        back([
          { ...farmer, name: 'Bořivoj' },
          { estate: { title: 'smith', kin: 'head' }, name: 'Radim' },
        ]),
        'Ves',
      ),
    ).toBe('Z tažení se vrátili sedlák Bořivoj a kovář Radim.');
    expect(
      chronicleText(
        back([
          { estate: { title: 'voivode', kin: 'head' }, name: 'Bořivoj' },
          {
            estate: { title: 'voivode', kin: 'child', headName: 'Bořivoj' },
            name: 'Radim',
          },
          { estate: { title: 'smith', kin: 'head' } },
          { estate: { title: 'farmer', kin: 'child' } },
          farmer,
          farmer,
          { estate: { title: 'potter', kin: 'head' } },
        ]),
        'Ves',
      ),
    ).toBe('Z tažení se vrátili vojvoda Bořivoj, syn vojvody Bořivoje Radim, kovář a další 4.');
  });

  it('stejní sedláci číslem, dezertér, starší zápis počtem', () => {
    expect(chronicleText(back([farmer, farmer]), 'Ves')).toBe('Z tažení se vrátili 2 sedláci.');
    expect(chronicleText(back([farmer, farmer, farmer, farmer, farmer]), 'Ves')).toBe(
      'Z tažení se vrátilo 5 sedláků.',
    );
    expect(chronicleText(back([{ ...farmer, name: 'Bořivoj' }], true), 'Ves')).toBe(
      'Z tažení utekl domů sedlák Bořivoj.',
    );
    expect(chronicleText(back(undefined), 'Ves')).toBe('Z tažení se vrátili 2 lidé.');
  });
});

describe('kronika – sad a cesty k sousedům', () => {
  it('obnova sadu – stromy všech čtverců dne jedním zápisem', () => {
    expect(orchardRenewalText('Vlkov', 1)).toBe(
      'Vlkovští vysadili 4 stromy, aby obnovili starý sad.',
    );
    const renewal = (orchardId: number): ChronicleEvent => ({
      day: DAY,
      kind: 'orchard-renewal-started',
      orchardId,
      squares: 1,
    });
    const page = chroniclePage([renewal(1), renewal(2), renewal(2)], 'Vlkov', { before: null });
    expect(page.years[0]!.entries.map((e) => e.text)).toEqual([
      'Vlkovští vysadili 12 stromů, aby obnovili staré sady.',
    ]);
  });

  it('kraj mapy – cesta vede do sousední vsi', () => {
    const junction: ChronicleRoadEnd = { kind: 'junction', shape: 'y' };
    const south: ChronicleRoadEnd = { kind: 'edge', direction: 'S' };
    const north: ChronicleRoadEnd = { kind: 'edge', direction: 'N' };
    const to = toVillage(neighbourOf(SEED, 'S').name);
    expect(roadBetween([south, junction], SEED)).toBe(`z rozcestí ${to}`);
    expect(
      roadBetween([{ kind: 'dwelling', type: 'polozemnice', craft: 'smith' }, south], SEED),
    ).toBe(`od kovárny ${to}`);
    expect(roadBetween([north, south], SEED)).toBe(
      `${fromVillage(neighbourOf(SEED, 'N').name)} ${to}`,
    );
    expect(
      chronicleText(
        { day: DAY, kind: 'road-formed', roadId: 1, years: 12, ends: [junction, south] },
        'Ves',
        SEED,
      ),
    ).toBe(`Po 12 letech chůze lidé vyšlapali cestu z rozcestí ${to}.`);
    // bez seedu vsi kraj mapy jako místo
    expect(roadBetween([junction, south])).toBe('mezi rozcestím a jižním krajem mapy');
  });
});
