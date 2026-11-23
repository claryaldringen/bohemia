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
  it('stezka, lov a vojsko; tlačítko Obchod není (markets.md – Pravidla 1)', () => {
    const html = renderToStaticMarkup(
      <ManorUpgrades
        manor={{
          dwellingId: 1,
          stance: 'flee',
          huntDenied: null,
        }}
      />,
    );
    expect(html).toContain('data-testid="manor-trail"');
    expect(html).toContain('data-testid="manor-hunt"');
    expect(html).not.toContain('manor-trade');
    expect(html).not.toContain('trade-blocked');
  });
});

describe('tlačítko lovu ve dvorci', () => {
  const huntButton = (huntDenied: string | null): string =>
    renderToStaticMarkup(
      <ManorUpgrades
        manor={{ dwellingId: 1, stance: 'flee', huntDenied }}
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
