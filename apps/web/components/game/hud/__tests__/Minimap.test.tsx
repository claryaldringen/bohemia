import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Landscape } from '@bohemia/game';
import { Minimap } from '../Minimap';

const SIZE = 8;
const landscape: Landscape = {
  size: SIZE,
  cellSizeM: 15,
  heights: new Float32Array(SIZE * SIZE),
  surface: new Uint8Array(SIZE * SIZE).fill(2),
  fertility: new Uint8Array(SIZE * SIZE).fill(50),
  villageSite: { x: 4, y: 4 },
  stream: [],
  obstacleLayer: null,
};

describe('Minimap – statický render', () => {
  it('vykreslí plátno minimapy i bez prohlížeče (vrstva vsi vzniká až v prohlížeči)', () => {
    const html = renderToStaticMarkup(
      <Minimap landscape={landscape} scene={null} village={{ dwellings: [], fields: [] }} />,
    );
    expect(html).toContain('data-testid="minimap"');
    expect(html).toContain('width="196"');
  });
});
