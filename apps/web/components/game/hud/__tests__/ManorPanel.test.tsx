import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DIRECTIONS, type TrailOption } from '@bohemia/game';
import type { ManorMember } from '@/lib/manor-view';
import { ManorUpgrades, TrailCompass } from '../ManorPanel';
import { DwellingResidents } from '../selection/dwelling';

// Dvorec vojvody v panelu výběru (trade.md – Co hráč vidí): vylepšení vsi ikonami, růžice stezek
// do 8 směrů s cenou v popisku a zašedlé s důvodem.

const option = (
  direction: TrailOption['direction'],
  over: Partial<TrailOption> = {},
): TrailOption => ({
  direction,
  status: 'none',
  progress: 0,
  lengthM: 820,
  laborManDays: 131.4,
  trees: 3,
  treesToFell: 1,
  swathTrees: 0,
  tripDays: 5,
  blocked: null,
  ...over,
});

const trails = DIRECTIONS.map((d) =>
  d === 'N'
    ? option(d, {
        blocked: 'Ke kraji mapy tudy cesta nevede – zahrazuje ji voda nebo sráz.',
        lengthM: null,
      })
    : d === 'E'
      ? option(d, { status: 'built', progress: 1, blocked: 'Stezka tímto směrem už vede.' })
      : d === 'S'
        ? option(d, {
            status: 'building',
            progress: 0.4,
            blocked: 'Stezka tímto směrem se už staví.',
          })
        : option(d),
);

/** Atributy tlačítka s `data-testid`. */
const button = (html: string, testId: string): string | undefined =>
  new RegExp(`<button([^>]*data-testid="${testId}"[^>]*)>`).exec(html)?.[1];

describe('růžice zemských stezek', () => {
  const html = renderToStaticMarkup(<TrailCompass trails={trails} onBuild={() => undefined} />);

  it('8 šipek kolem dvorce, sever nahoře', () => {
    for (const d of DIRECTIONS) expect(html).toContain(`data-testid="trail-${d}"`);
    expect(html.indexOf('trail-NW')).toBeLessThan(html.indexOf('trail-N"'));
    expect(html).toContain('/icons/build/dvorec.png');
  });

  it('volný směr jde, zahrazený zašedlý s důvodem, hotový a rozestavěný nejdou', () => {
    expect(button(html, 'trail-W')).not.toContain('disabled=""');
    expect(button(html, 'trail-N')).toContain('disabled=""');
    expect(html).toContain('zahrazuje ji voda nebo sráz');
    expect(button(html, 'trail-E')).toContain('data-status="built"');
    expect(button(html, 'trail-E')).toContain('disabled=""');
    expect(button(html, 'trail-S')).toContain('data-status="building"');
    expect(html).toContain('width:40%');
  });

  it('cena v popisku: práce, dřevo, délka a dny cesty', () => {
    expect(html).toContain('Zemská stezka – západ');
    expect(html).toContain('131');
    expect(html).toContain('820 m');
  });

  it('stezka lesem: v popisku stromy v průseku (roads.md – Průsek lesem)', () => {
    expect(html).not.toContain('data-testid="swath-trees"');
    const forest = renderToStaticMarkup(
      <TrailCompass trails={[option('W', { swathTrees: 37 })]} onBuild={() => undefined} />,
    );
    expect(forest).toMatch(/data-testid="swath-trees"[^>]*>.*37/);
    expect(forest).toContain('Průsek lesem');
  });
});

describe('vylepšení vsi ve dvorci', () => {
  it('stezka, lov, vojsko a obchod (markets.md – Pravidla 1)', () => {
    const html = renderToStaticMarkup(
      <ManorUpgrades
        manor={{
          dwellingId: 1,
          market: {
            stock: {},
            homeCarts: [],
            oxenHome: 0,
            adults: 0,
            day: 0,
            trips: [],
            merchantsDay: null,
            arms: [],
            merchantsArrived: null,
          },
          stance: 'flee',
          huntDenied: null,
        }}
      />,
    );
    expect(html).toContain('data-testid="manor-trail"');
    expect(html).toContain('data-testid="manor-hunt"');
    expect(html).toContain('data-testid="manor-market"');
    expect(html).not.toContain('manor-trade');
  });

  it('tlačítko Obchod otevře panel Trh; bez obsluhy je zašedlé', () => {
    const manor = {
      dwellingId: 1,
      market: {
        stock: {},
        homeCarts: [],
        oxenHome: 0,
        adults: 0,
        day: 0,
        trips: [],
        merchantsDay: null,
        arms: [],
        merchantsArrived: null,
      },
      stance: 'flee' as const,
      huntDenied: null,
    };
    expect(button(renderToStaticMarkup(<ManorUpgrades manor={manor} />), 'manor-market')).toContain(
      'disabled=""',
    );
    const html = renderToStaticMarkup(
      <ManorUpgrades manor={manor} onOpenMarket={() => undefined} />,
    );
    expect(button(html, 'manor-market')).not.toContain('disabled=""');
    expect(html).toContain('/icons/build/obchod.png');
  });
});

describe('cizí kupci ve dvorci (markets.md – Rozhodnutí plánu 4, bod 12)', () => {
  /** Vylepšení dvorce vsi v den 10, kam kupci přijedou v den `merchantsDay`. */
  const render = (merchantsDay: number | null): string =>
    renderToStaticMarkup(
      <ManorUpgrades
        manor={{
          dwellingId: 1,
          stance: 'flee',
          huntDenied: null,
          market: {
            stock: {},
            homeCarts: [],
            oxenHome: 0,
            adults: 0,
            day: 10,
            trips: [],
            merchantsDay,
            arms: [],
            merchantsArrived: null,
          },
        }}
      />,
    );
  const days = (html: string): string | undefined =>
    /data-testid="manor-merchants"[^>]*>([^<]*)</.exec(html)?.[1];
  const trade = 'kupují med, vosk, kožešiny a otroky, prodávají meče, kroužkové košile a helmy';

  it('ikona kupců s počtem dní do příjezdu, slova jen v popisku', () => {
    const html = render(22);
    expect(html).toContain('/icons/resources/merchants.png');
    expect(days(html)).toBe('12');
    expect(html).toContain(`>Kupci přijedou za 12 dní – ${trade}<`);
  });

  it('český plurál – 1 den, 2–4 dny, jinak dní', () => {
    expect(render(11)).toContain(`>Kupci přijedou za 1 den – ${trade}<`);
    expect(render(12)).toContain(`>Kupci přijedou za 2 dny – ${trade}<`);
    expect(render(14)).toContain(`>Kupci přijedou za 4 dny – ${trade}<`);
    expect(render(15)).toContain(`>Kupci přijedou za 5 dní – ${trade}<`);
  });

  it('přijíždějí-li dnes, jsou dnes ve vsi', () => {
    const html = render(10);
    expect(days(html)).toBe('0');
    expect(html).toContain(`>Kupci jsou dnes ve vsi – ${trade}<`);
    expect(html).not.toContain('přijedou');
  });

  it('ves bez stezky nic', () => {
    const html = render(null);
    expect(html).not.toContain('manor-merchants');
    expect(html).not.toContain('merchants.png');
  });
});

describe('tlačítko lovu ve dvorci', () => {
  const huntButton = (huntDenied: string | null): string =>
    renderToStaticMarkup(
      <ManorUpgrades
        manor={{
          dwellingId: 1,
          stance: 'flee',
          huntDenied,
          market: {
            stock: {},
            homeCarts: [],
            oxenHome: 0,
            adults: 0,
            day: 0,
            trips: [],
            merchantsDay: null,
            arms: [],
            merchantsArrived: null,
          },
        }}
        onDeclareHunt={async () => null}
      />,
    );

  it('běží-li lov: tlačítko zašedlé a důvod v popisku', () => {
    const html = huntButton('Lov už běží.');
    expect(button(html, 'manor-hunt')).toContain('disabled=""');
    expect(html).toMatch(/data-testid="hunt-blocked"[^>]*>Lov už běží\./);
  });

  it('bez důvodu je tlačítko povolené a popisek je jen Lov', () => {
    const html = huntButton(null);
    expect(button(html, 'manor-hunt')).not.toContain('disabled=""');
    expect(html).not.toContain('hunt-blocked');
    expect(html).not.toContain('navíc');
  });
});

describe('rodina ve dvorci (lord.md – Co hráč vidí)', () => {
  const member = (over: Partial<ManorMember>): ManorMember => ({
    id: 1,
    portrait: 'man',
    role: 'Vojvoda',
    age: 42,
    arms: { bow: 64, combat: 51, riding: 38 },
    horse: true,
    ...over,
  });
  const html = renderToStaticMarkup(
    <DwellingResidents
      residents={[
        member({}),
        member({
          id: 2,
          portrait: 'woman',
          role: 'Vojvodova žena',
          age: 39,
          arms: null,
          horse: false,
        }),
        member({
          id: 3,
          role: 'Syn vojvody',
          age: 16,
          arms: { bow: 20, combat: 5, riding: 0 },
          horse: false,
        }),
      ]}
    />,
  );

  it('panel dvorce dovednosti neukazuje – ty jsou v panelu vybrané osoby', () => {
    expect(html).toContain('data-testid="resident-1"');
    expect(html).toContain('data-testid="resident-2"');
    expect(html).not.toContain('manor-arms-');
    expect(html).not.toContain('Lukostřelba');
  });
});

describe('otroci ve dvorci (markets.md – Pravidla 7)', () => {
  const render = (slaves?: { all: number; baptized: number }): string =>
    renderToStaticMarkup(
      <ManorUpgrades
        manor={{
          dwellingId: 1,
          stance: 'flee',
          huntDenied: null,
          ...(slaves ? { slaves } : {}),
          market: {
            stock: {},
            homeCarts: [],
            oxenHome: 0,
            adults: 0,
            day: 10,
            trips: [],
            merchantsDay: null,
            arms: [],
            merchantsArrived: null,
          },
        }}
      />,
    );
  const count = (html: string): string | undefined =>
    /data-testid="manor-slaves"[^>]*>([^<]*)</.exec(html)?.[1];

  it('ikona s počtem a popiskem, český plurál pokřtěných', () => {
    const html = render({ all: 3, baptized: 1 });
    expect(html).toContain('/icons/resources/slave.png');
    expect(count(html)).toBe('3');
    expect(html).toContain('>Otroci – 3, z toho 1 pokřtěný – prodat je nejde<');
    expect(render({ all: 5, baptized: 2 })).toContain(
      'Otroci – 5, z toho 2 pokřtění – prodat je nejde',
    );
    expect(render({ all: 9, baptized: 5 })).toContain('z toho 5 pokřtěných – prodat je nejde');
    expect(render({ all: 4, baptized: 0 })).toContain('>Otroci – 4<');
  });

  it('bez otroků nic', () => {
    expect(render()).not.toContain('manor-slaves');
  });
});
