import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { VillageView } from '@/lib/village-view';
import {
  FieldCapacityTooltip,
  HappinessTooltip,
  LaborTooltip,
  SatiationTooltip,
  fieldCapacityShort,
  housingState,
  PeopleCount,
  PeopleTooltip,
  peopleLabel,
  TopBar,
  dairyName,
  satiationState,
  sheavesName,
  showsDairy,
  showsHay,
} from '../TopBar';

// Horní lišta (diet.md, oxen.md): barva nasycení podle energie, podíly stravy v tooltipu, seno,
// luštěniny.

const diet = (energy: number): VillageView['diet'] => ({
  energy,
  protein: 0.85,
  diversity: 0.89,
  shares: { grain: 0.6, legumes: 0.1, meat: 0.15, dairy: 0.1, eggs: 0.05, fruit: 0 },
});

describe('satiationState – barva ikony podle energie, ne nasycení', () => {
  it('ves jen s obilím (nasycení ≈ 80 %) je sytá, když má dost energie', () => {
    expect(satiationState({ diet: diet(1), hungry: false, starving: false })).toBe('fed');
  });

  it('hlad: energie pod plným přídělem nebo ves hladoví podle výhledu', () => {
    expect(satiationState({ diet: diet(0.9), hungry: false, starving: false })).toBe('hungry');
    expect(satiationState({ diet: diet(1), hungry: true, starving: false })).toBe('hungry');
  });

  it('velký hlad: energie pod 60 % nebo lidé umírají hlady', () => {
    expect(satiationState({ diet: diet(0.5), hungry: true, starving: false })).toBe('starving');
    expect(satiationState({ diet: diet(0.8), hungry: true, starving: true })).toBe('starving');
  });
});

describe('SatiationTooltip', () => {
  it('nasycení, energie a bílkoviny, podíly zdrojů na energii (ikony a procenta)', () => {
    const view = { satiation: 0.89, diet: diet(1) } as VillageView;
    const html = renderToStaticMarkup(<SatiationTooltip view={view} />);
    expect(html).toContain('Nasycení 89 %');
    expect(html).toContain('energie 100 % · bílkoviny 85 %');
    expect(html).toMatch(/data-share="grain".*food\.png.*60 %/);
    expect(html).toMatch(/data-share="legumes".*legumes\.png.*10 %/);
    // pořadí: obilí, luštěniny, maso, mléko a sýr, vejce, ovoce
    const order = [...html.matchAll(/data-share="(\w+)"/g)].map((m) => m[1]);
    expect(order).toEqual(['grain', 'legumes', 'meat', 'dairy', 'eggs', 'fruit']);
    expect(html).toMatch(/data-share="meat".*meat\.png.*15 %/);
    expect(html).toMatch(/data-share="dairy".*cheese\.png.*10 %/);
    expect(html).toMatch(/data-share="eggs".*eggs\.png.*5 %/);
    expect(html).toMatch(/data-share="fruit".*apples\.png.*0 %/);
  });
});

describe('LaborTooltip – vojvodova rodina', () => {
  it('řádek s ikonou dvorce: cvičí, při hladu na poli; bez rodiny jen název', () => {
    const train = renderToStaticMarkup(
      <LaborTooltip lord={{ training: 5, field: 0, household: 3 }} />,
    );
    expect(train).toContain('manor.png');
    expect(train).toContain('Vojvodova rodina: 5 cvičí');
    const field = renderToStaticMarkup(
      <LaborTooltip lord={{ training: 0, field: 5, household: 3 }} />,
    );
    expect(field).toContain('Vojvodova rodina: 5 na poli');
    expect(renderToStaticMarkup(<LaborTooltip lord={null} />)).not.toContain('village-labor-lord');
  });
});

describe('SatiationTooltip – jídlo uložené před luštěninami', () => {
  it('podíl luštěnin chybí → 0 %', () => {
    const old = diet(1);
    const view = {
      satiation: 0.8,
      diet: { ...old, shares: { grain: 1, meat: 0, dairy: 0, eggs: 0, fruit: 0 } },
    } as VillageView;
    const html = renderToStaticMarkup(<SatiationTooltip view={view} />);
    expect(html).toMatch(/data-share="legumes".*legumes\.png.*0 %/);
    expect(html).not.toContain('NaN');
  });
});

describe('showsHay', () => {
  const pen = (built: boolean): VillageView['pens'][number] => ({
    id: 1,
    species: 'cattle',
    squares: 1,
    places: 45,
    animals: 0,
    herdPlaces: null,
    extension: null,
    built,
    progress: built ? 1 : 0.3,
    team: null,
    training: null,
    cows: 0,
    oxen: 0,
    condition: 1,
    abandoned: false,
    repair: null,
  });

  it('seno v liště, když ves má hotovou ohradu nebo seno v zásobě', () => {
    expect(showsHay({ hayKg: 0, pens: [] })).toBe(false);
    expect(showsHay({ hayKg: 0, pens: [pen(false)] })).toBe(false);
    expect(showsHay({ hayKg: 0, pens: [pen(true)] })).toBe(true);
    expect(showsHay({ hayKg: 1500, pens: [] })).toBe(true);
  });
});

describe('mléko a sýr v liště', () => {
  it('ukáže se se sýrem v zásobě nebo v době dojení, v popisku mléko za den', () => {
    expect(showsDairy({ cheeseKg: 0, milkLPerDay: 0 })).toBe(false);
    expect(showsDairy({ cheeseKg: 12, milkLPerDay: 0 })).toBe(true);
    expect(showsDairy({ cheeseKg: 0, milkLPerDay: 3.2 })).toBe(true);
    expect(dairyName({ milkLPerDay: 12.4 })).toBe('Sýr (kg) – mléko 12 l/den');
    expect(dairyName({ milkLPerDay: 0 })).toBe('Sýr (kg)');
  });
});

describe('snopy v liště (production-chains.md – Humno)', () => {
  it('popisek: nevymláceno (i bez humna se mlátí nouzově)', () => {
    expect(sheavesName()).toBe('Snopy – nevymláceno (kg zrna)');
  });
});

describe('Pole uživí (fields.md – Co hráč vidí)', () => {
  const field = (people: number, capacity: number): VillageView =>
    ({
      people: { children: 0, adults: people, elders: 0 },
      fieldCapacity: { people: capacity, rotationHa: 47.9, fertility: 52, soil: 0.77 },
    }) as VillageView;

  it('lidí je víc, než pole uživí: červeně', () => {
    expect(fieldCapacityShort(field(31, 21.9))).toBe(true);
    const html = renderToStaticMarkup(<FieldCapacityTooltip view={field(31, 21.9)} />);
    expect(html).toContain('Pole uživí ≈ 22 lidí');
    expect(html).toMatch(/data-testid="field-capacity-people"[^>]*text-red-400/);
    expect(html).toContain('people.png');
    expect(html).toContain('47,9 ha');
    expect(html).toMatch(/data-testid="field-capacity-soil"[^>]*>.*fields\.png.*77 %/);
  });

  it('pole stačí: bez červené', () => {
    expect(fieldCapacityShort(field(20, 21.9))).toBe(false);
    expect(fieldCapacityShort(field(22, 21.9))).toBe(false);
    const html = renderToStaticMarkup(<FieldCapacityTooltip view={field(20, 21.9)} />);
    expect(html).not.toContain('text-red-400');
  });

  it('bez pole nic nehlásí', () => {
    expect(
      fieldCapacityShort({ people: { children: 1, adults: 2, elders: 0 }, fieldCapacity: null }),
    ).toBe(false);
  });
});

describe('Lidé a kolik jich pole uživí v jedné ikoně (Martin 24. 10. 2026)', () => {
  const people = { children: 5, adults: 24, elders: 2 };

  it('popisek „lidí / ≈ N“, bez polí jen počet lidí', () => {
    expect(
      peopleLabel({
        people,
        fieldCapacity: { people: 21.9, rotationHa: 1, fertility: 50, soil: 1 },
      }),
    ).toBe('31 / ≈ 22');
    expect(peopleLabel({ people, fieldCapacity: null })).toBe('31');
  });

  it('lišta má jednu ikonu lidí a nemá rozlohu polí, uhlí, keramiku, nářadí ani vozy', () => {
    const view = {
      id: 1,
      name: 'Ves',
      villages: [],
      people,
      fieldCapacity: { people: 21.9, rotationHa: 47.9, fertility: 52, soil: 1 },
      fields: [{ id: 1, areaM2: 50000, crops: {} }],
      orchards: [],
      pens: [],
      storesKg: 10,
      livestock: { herds: { sheep: 0, goat: 0, pig: 0, cow: 0 }, oxen: 0 },
      legumesKg: 0,
      meatKg: 0,
      cheeseKg: 0,
      milkLPerDay: 0,
      applesKg: 0,
      hayKg: 0,
      woodLogs: 0,
      commonLaborPerDay: 1,
      lord: null,
      satiation: 1,
      diet: diet(1),
      happiness: { value: 50 },
      steward: { on: false, built: [] },
      crafts: {
        present: true,
        stocks: { charcoalKg: 7, potteryKg: 8, woodToolsKg: 9, ironBarsKg: 3 },
        coverage: { tools: 0, pottery: 0 },
        carts: [{ id: 1, kind: 'two-wheel', condition: 1, away: false }],
      },
    } as unknown as VillageView;
    const html = renderToStaticMarkup(
      <TopBar
        view={view}
        world={{ startMs: 0, endMs: 1e12 }}
        initialNowMs={1}
        menuOpen={false}
        onToggleMenu={() => {}}
        onRename={async () => null}
        devTime={null}
      />,
    );
    expect(html).toContain('data-testid="village-people"');
    expect(html.replace(/<[^>]+>/g, '')).toContain('31 / ≈ 22');
    for (const id of [
      'village-fields',
      'village-field-capacity',
      'village-charcoal',
      'village-pottery',
      'village-wood-tools',
      'village-carts',
    ]) {
      expect(html).not.toContain(`data-testid="${id}"`);
    }
    expect(html).toContain('data-testid="village-iron-bars"');
  });
});

// Popisek štěstí (christianity.md – Štěstí): podíl křesťanů a nespokojenost pohanů jen nad nulou.
describe('HappinessTooltip – víra', () => {
  it('pohanská ves – jen „Štěstí“', () => {
    const html = renderToStaticMarkup(<HappinessTooltip happiness={{}} />);
    expect(html).toContain('Štěstí');
    expect(html).not.toContain('happiness-christians');
    expect(html).not.toContain('happiness-desecration');
  });

  it('křesťané v procentech a nespokojenost pohanů se zničenými místy', () => {
    const html = renderToStaticMarkup(
      <HappinessTooltip happiness={{ christianShare: 0.25, desecration: 15 }} />,
    );
    expect(html).toMatch(/data-testid="happiness-christians"[^>]*>.*Křesťané 25 %/);
    expect(html).toContain('src="/icons/house/faith-cross.png"');
    expect(html).toMatch(/data-testid="happiness-desecration"[^>]*>.*−15/);
  });
});

describe('Lidé podle míst k bydlení (D80, Martin 15. 11. 2026)', () => {
  const view = (people: number, places: number, field?: number): VillageView =>
    ({
      people: { children: 0, adults: people, elders: 0 },
      housingPlaces: places,
      fieldCapacity: field ? { people: field, rotationHa: 1, fertility: 50, soil: 1 } : null,
    }) as VillageView;
  const count = (v: VillageView): string => renderToStaticMarkup(<PeopleCount view={v} />);

  it('volné místo: bez barvy', () => {
    expect(housingState(view(30, 32))).toBe('ok');
    expect(count(view(30, 32))).not.toMatch(/text-(amber|red)/);
  });

  it('plno: žlutooranžově', () => {
    expect(housingState(view(32, 32))).toBe('full');
    expect(count(view(32, 32))).toMatch(/data-testid="people-count"[^>]*text-amber-300/);
  });

  it('přeplněno: červeně', () => {
    expect(housingState(view(33, 32))).toBe('over');
    expect(count(view(33, 32))).toMatch(/data-testid="people-count"[^>]*text-red-400/);
  });

  it('pole zvlášť: červená část polí nebarví číslo lidí', () => {
    const html = count(view(20, 32, 10));
    expect(html).toMatch(/<span class="text-red-400">\s*\/ ≈ 10<\/span>|text-red-400">[^<]*≈ 10/);
    expect(html).not.toMatch(/people-count"[^>]*text-red-400/);
  });

  it('tooltip: řádek Bydlení', () => {
    const html = renderToStaticMarkup(<PeopleTooltip view={view(31, 32)} />);
    expect(html).toContain('Bydlení 31 / 32 míst');
  });
});
