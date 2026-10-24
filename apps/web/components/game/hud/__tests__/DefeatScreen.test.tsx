import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { LineEndView } from '@/lib/line-end-view';
import { DefeatScreen } from '../DefeatScreen';

// Obrazovka porážky (population.md – Hlad a vymření; lord.md – Konec rodu: kronika rodu).

const restart = (): Promise<string | null> => Promise.resolve(null);
const text = (html: string): string => html.replace(/<[^>]+>/g, '');

describe('DefeatScreen', () => {
  it('vymřelá ves – jméno a roky vsi, bez kroniky rodu', () => {
    const html = renderToStaticMarkup(
      <DefeatScreen
        name="Libice"
        lifespan={{ foundedYear: 500, extinctYear: 530, years: 30 }}
        onRestart={restart}
      />,
    );
    expect(text(html)).toContain('Rod vymřel');
    expect(text(html)).toContain('Libice');
    expect(html).not.toContain('data-testid="defeat-lords"');
  });

  it('konec rodu – vojvodové po sobě, poslední muž rodu, ves a jediné Začít znovu', () => {
    const line: LineEndView = {
      lords: [
        { name: 'Bořivoj', fromYear: 500, toYear: 541 },
        { fromYear: 541, toYear: 560 },
        { name: 'Ctibor', fromYear: 560, toYear: 571 },
      ],
      last: 'Ctibor',
      village: 'Lhota',
      foundedYear: 500,
      endedYear: 571,
      years: 70,
    };
    const html = renderToStaticMarkup(
      <DefeatScreen
        name="Lhota"
        lifespan={{ foundedYear: 500, extinctYear: 571, years: 70 }}
        line={line}
        onRestart={restart}
      />,
    );
    const shown = text(html);
    expect(shown).toContain('Rod vymřel');
    expect(shown).toContain('Bořivoj 500–541');
    expect(shown).toContain('Ctibor 560–571');
    expect(shown).toContain('Zemřel Ctibor – poslední muž rodu');
    expect(shown).toContain('Lhota');
    expect(shown).toContain('500 – 571');
    expect(html.match(/<button/g)).toHaveLength(1);
  });
});
