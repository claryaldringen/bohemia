import type { ReactElement } from 'react';
import { formatTileInfo, type TileInfo } from '@/lib/tile-info';

export function TileInfoPanel({ tile }: { tile: TileInfo | null }): ReactElement | null {
  if (!tile) return null;
  return (
    <div
      data-testid="tile-info"
      data-tile={`${tile.x},${tile.y}`}
      className="pointer-events-none fixed bottom-4 left-4 z-10 rounded bg-stone-900/75 px-3 py-1.5 text-sm text-stone-50"
    >
      {formatTileInfo(tile)}
    </div>
  );
}
