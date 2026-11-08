import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SelectionDetails } from '@/lib/selection-details';
import { SelectionPanel } from '../SelectionPanel';

// Panel prvku prémiové krajiny (premium-landscapes.md – Co hráč vidí; vzor rudiště): portrét
// typu, krátký název, ikony „hned“ a „později“ – slova jen v popiscích.

const render = (details: SelectionDetails): string =>
  renderToStaticMarkup(
    <SelectionPanel details={details} onCancelConstruction={() => Promise.resolve()} />,
  );

describe('panel prvku prémiové krajiny', () => {
  it('portrét typu, krátký název, „hned“ i „později“ aktivní', () => {
    const html = render({ kind: 'premium-site', type: 'iron-ore', site: 'iron-ore' });
    expect(html).toContain('data-kind="premium-site"');
    expect(html).toContain('/icons/premium/iron-ore.png');
    expect(html).toContain('Bohatá ruda');
    expect(html).toMatch(/data-testid="premium-now" data-active="true"/);
    expect(html).toMatch(/data-testid="premium-later" data-active="true"/);
    // dlouhé texty jen v popiscích ikon
    expect(html).toContain('Hned: Kovář potřebuje méně rudy – levnější nástroje');
    expect(html).toContain('Později: Prodej železa a nástrojů');
  });

  it('typ bez účinku hned má „hned“ zašedlé', () => {
    const html = render({ kind: 'premium-site', type: 'deep-gold', site: 'deposit' });
    expect(html).toContain('/icons/premium/deep-gold.png');
    expect(html).toMatch(/data-testid="premium-now" tabindex="0"><img[^>]*opacity-25 grayscale/);
    expect(html).toMatch(/data-testid="premium-later" data-active="true"/);
  });
});
