import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';
import {
  createSkeletonCache,
  seatSlot,
  skeletonSlice,
  type SeatSlot,
  type SkeletonSlice,
} from '@bohemia/game';
import { worldSeed } from '@bohemia/server';

interface Props {
  searchParams: Promise<{ x?: string; y?: string; size?: string }>;
}

/** Strana políčka v obrazovkových bodech a strana mapy v políčkách (SkeletonSlice.at je 0–127). */
const CELL_PX = 24;
const MAP_TILES = 128;

const SLOT_FILL: Readonly<Record<SeatSlot, string>> = {
  dry: '#f3f4f6',
  river: '#dbeafe',
  trail: '#fef3c7',
  ford: '#fde68a',
};

function intParam(value: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Bod na okraji mapy v souřadnicích políčka (0 – CELL_PX, sever nahoře). */
function portPoint(side: 'N' | 'E' | 'S' | 'W', at: number): [number, number] {
  const along = ((at + 0.5) / MAP_TILES) * CELL_PX;
  switch (side) {
    case 'N':
      return [along, 0];
    case 'S':
      return [along, CELL_PX];
    case 'E':
      return [CELL_PX, CELL_PX - along];
    case 'W':
      return [0, CELL_PX - along];
  }
}

function label(slice: SkeletonSlice | null, x: number, y: number): string {
  const ports = slice
    ? [
        ...slice.rivers.map((p) => `řeka ${p.side}${p.at} ${p.widthM} m ${p.flow}`),
        ...slice.trails.map((p) => `stezka ${p.side}${p.at}`),
      ].join(', ')
    : '';
  return `(${x}, ${y}) ${seatSlot(slice) ?? 'ostatní'}${ports ? ` – ${ports}` : ''}`;
}

/**
 * Vývojový náhled kostry světa (world-skeleton.md): mřížka políček, řeky modře (tloušťka podle
 * šířky), stezky hnědě, uzly tečkou, suchá šedě. `?x=0&y=0&size=64`. V produkci neexistuje.
 */
export default async function DevSkeletonPage({ searchParams }: Props): Promise<ReactElement> {
  if (process.env.NODE_ENV === 'production') notFound();
  const params = await searchParams;
  const size = intParam(params.size, 64, 4, 128);
  const cx = intParam(params.x, 0, -100_000, 100_000);
  const cy = intParam(params.y, 0, -100_000, 100_000);
  const x0 = cx - Math.floor(size / 2);
  const y0 = cy - Math.floor(size / 2);
  const seed = worldSeed();
  const cache = createSkeletonCache(seed);

  const cells: ReactElement[] = [];
  const rivers: ReactElement[] = [];
  const trails: ReactElement[] = [];
  const nodes: ReactElement[] = [];
  let riverLines = 0;
  for (let row = 0; row < size; row++) {
    const y = y0 + size - 1 - row;
    for (let col = 0; col < size; col++) {
      const x = x0 + col;
      const slice = skeletonSlice(seed, { x, y }, cache);
      const slot = seatSlot(slice);
      const ox = col * CELL_PX;
      const oy = row * CELL_PX;
      const key = `${x},${y}`;
      cells.push(
        <rect
          key={key}
          x={ox}
          y={oy}
          width={CELL_PX}
          height={CELL_PX}
          fill={slot === null ? '#e9d5ff' : SLOT_FILL[slot]}
          stroke="#d1d5db"
          strokeWidth={0.5}
        >
          <title>{label(slice, x, y)}</title>
        </rect>,
      );
      if (!slice) continue;
      const mid: [number, number] = [CELL_PX / 2, CELL_PX / 2];
      // Řeka: vtok → střed → výtok (stejná tloušťka podle šířky bodu).
      slice.rivers.forEach((p, i) => {
        const [px, py] = portPoint(p.side, p.at);
        riverLines++;
        rivers.push(
          <line
            key={`r${key}-${i}`}
            data-river
            x1={ox + px}
            y1={oy + py}
            x2={ox + mid[0]}
            y2={oy + mid[1]}
            stroke="#2563eb"
            strokeWidth={Math.max(1.5, p.widthM / 12)}
            strokeLinecap="round"
          />,
        );
      });
      slice.trails.forEach((p, i) => {
        const [px, py] = portPoint(p.side, p.at);
        trails.push(
          <line
            key={`t${key}-${i}`}
            x1={ox + px}
            y1={oy + py}
            x2={ox + mid[0]}
            y2={oy + mid[1]}
            stroke="#92400e"
            strokeWidth={1.5}
            strokeLinecap="round"
          />,
        );
      });
      if (slice.trails.length > 0 || slice.rivers.length > 0) {
        nodes.push(
          <circle
            key={`n${key}`}
            cx={ox + mid[0]}
            cy={oy + mid[1]}
            r={slice.trails.length >= 3 || slice.rivers.length >= 3 ? 3 : 1.8}
            fill={slice.trails.length > 0 ? '#78350f' : '#1d4ed8'}
          />,
        );
      }
    }
  }
  const px = size * CELL_PX;
  return (
    <main className="p-4">
      <h1 className="mb-2 text-lg font-semibold">
        Kostra světa – seed {seed}, střed ({cx}, {cy}), {size} × {size} map
      </h1>
      <p className="mb-2 text-sm text-gray-600">
        Řeky modře, stezky hnědě, uzly tečkou; fialová = ostatní místo (pramen, soutok,
        křižovatka…), šedá = suchá. Popisek políčka v title.
      </p>
      <svg
        data-skeleton
        data-river-lines={riverLines}
        width={px}
        height={px}
        viewBox={`0 0 ${px} ${px}`}
        role="img"
        aria-label="Kostra světa"
      >
        {cells}
        {rivers}
        {trails}
        {nodes}
      </svg>
    </main>
  );
}
