import { describe, expect, it } from 'vitest';
import { CURRENT_LAYER_VERSIONS, generateLandscape, premiumFeaturesOf } from '@bohemia/game';
import { parsePremium, premiumOverlay } from '../dev-premium';

describe('prémiové krajiny na /dev/landscape', () => {
  it('?premium= přijme jen typ katalogu, jinak průměrná krajina', () => {
    expect(parsePremium('mountain-pass')).toBe('mountain-pass');
    expect(parsePremium('navigable-river')).toBe('navigable-river');
    expect(parsePremium(undefined)).toBeUndefined();
    expect(parsePremium('')).toBeUndefined();
    expect(parsePremium('zlato')).toBeUndefined();
  });

  it('překryv prvků: obrysy, osy a kroužky míst; řeka bez osy (je to voda), průměrná nic', () => {
    expect(premiumOverlay(generateLandscape(42))).toEqual([]);
    const l = generateLandscape(42, CURRENT_LAYER_VERSIONS, 'ford-hill');
    const overlay = premiumOverlay(l);
    const sites = premiumFeaturesOf(l)!.sites;
    // řeka (osa) vypadne, brod kroužek, ostrožna obrys, stezka otevřená čára
    expect(overlay.length).toBe(sites.length - 1);
    expect(overlay.some((s) => s.open)).toBe(true);
    for (const sector of overlay) expect(sector.lines?.[0]?.length).toBeGreaterThan(1);
  });
});
