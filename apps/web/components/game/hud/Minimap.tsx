'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react';
import { DWELLING_FOOTPRINT_M, type Landscape } from '@bohemia/game';
import {
  CEMETERY_COLOR,
  ORCHARD_COLOR,
  PART_COLORS,
  minimapImage,
  minimapToWorld,
  worldToMinimap,
} from '@/lib/minimap';
import type { LandscapeScene, ViewFootprint } from '@/lib/scene/landscape-scene';
import type { SceneVillage } from '@/lib/village-view';

/** Strana minimapy v CSS px. */
const SIZE_PX = 196;
/** Rozlišení obrázku krajiny (px na stranu) – 2 px na políčko krajiny. */
const IMAGE_PX = 256;

/**
 * Minimapa vlevo dole (jako v 0 A.D.): krajina sídla shora (voda, les, louka, skála), pole,
 * hřbitovy, sady, obydlí a obrys záběru kamery. Kliknutí nebo tažení přesune pohled.
 */
export function Minimap({
  landscape,
  scene,
  village,
}: {
  landscape: Landscape;
  scene: LandscapeScene | null;
  village: SceneVillage;
}): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<ViewFootprint | null>(null);
  const dragging = useRef(false);

  // Obrázek krajiny se spočítá jednou (krajina sídla se nemění).
  const base = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const image = document.createElement('canvas');
    image.width = IMAGE_PX;
    image.height = IMAGE_PX;
    const context = image.getContext('2d');
    if (!context) return null;
    const pixels = new ImageData(IMAGE_PX, IMAGE_PX);
    pixels.data.set(minimapImage(landscape, IMAGE_PX));
    context.putImageData(pixels, 0, 0);
    return image;
  }, [landscape]);

  useEffect(() => scene?.onViewChange(setView), [scene]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const ratio = window.devicePixelRatio || 1;
    const px = Math.round(SIZE_PX * ratio);
    if (canvas.width !== px) {
      canvas.width = px;
      canvas.height = px;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.imageSmoothingEnabled = true;
    context.clearRect(0, 0, SIZE_PX, SIZE_PX);
    if (base) context.drawImage(base, 0, 0, SIZE_PX, SIZE_PX);
    const at = (x: number, z: number): { x: number; y: number } =>
      worldToMinimap(landscape, x, z, SIZE_PX);
    const cellPx = (landscape.cellSizeM / (landscape.size * landscape.cellSizeM)) * SIZE_PX;

    // pole po čtvercích podle stadia dílů
    for (const field of village.fields) {
      for (const part of field.parts) {
        const [r, g, b] = PART_COLORS[part.stage];
        context.fillStyle = `rgb(${r} ${g} ${b})`;
        const p = at(part.x, part.z);
        context.fillRect(p.x - cellPx / 2, p.y - cellPx / 2, cellPx + 0.3, cellPx + 0.3);
      }
    }
    // hřbitovy po čtvercích (zakládané průsvitné)
    for (const cemetery of village.cemeteries ?? []) {
      const [r, g, b] = CEMETERY_COLOR;
      context.fillStyle = `rgb(${r} ${g} ${b} / ${cemetery.built ? 1 : 0.55})`;
      for (const square of cemetery.squares) {
        const p = at(square.x, square.z);
        context.fillRect(p.x - cellPx / 2, p.y - cellPx / 2, cellPx + 0.3, cellPx + 0.3);
      }
    }
    // sady po čtvercích (čtverce, které se ještě sázejí, průsvitné)
    for (const orchard of village.orchards ?? []) {
      const [r, g, b] = ORCHARD_COLOR;
      for (const square of orchard.squares) {
        context.fillStyle = `rgb(${r} ${g} ${b} / ${square.planting >= 1 ? 1 : 0.55})`;
        const p = at(square.x, square.z);
        context.fillRect(p.x - cellPx / 2, p.y - cellPx / 2, cellPx + 0.3, cellPx + 0.3);
      }
    }
    // obydlí – světlé čtverečky (rozestavěná průsvitná), jako budovy hráče v 0 A.D.
    for (const dwelling of village.dwellings) {
      const p = at(dwelling.position.x, dwelling.position.z);
      const side = Math.max(
        3.5,
        (DWELLING_FOOTPRINT_M[dwelling.type].width / landscape.cellSizeM) * cellPx * 1.6,
      );
      context.fillStyle = dwelling.built ? '#f6e3b0' : 'rgb(246 227 176 / 0.55)';
      context.strokeStyle = '#2a1d10';
      context.lineWidth = 1;
      context.fillRect(p.x - side / 2, p.y - side / 2, side, side);
      context.strokeRect(p.x - side / 2, p.y - side / 2, side, side);
    }
    // záběr kamery
    if (view) {
      context.beginPath();
      view.corners.forEach(([x, z], i) => {
        const p = at(x, z);
        if (i === 0) context.moveTo(p.x, p.y);
        else context.lineTo(p.x, p.y);
      });
      context.closePath();
      context.strokeStyle = 'rgb(255 255 255 / 0.9)';
      context.lineWidth = 1.25;
      context.stroke();
    }
  }, [base, landscape, village, view]);

  const moveTo = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (!scene) return;
    const box = event.currentTarget.getBoundingClientRect();
    const point = minimapToWorld(
      landscape,
      ((event.clientX - box.left) / box.width) * SIZE_PX,
      ((event.clientY - box.top) / box.height) * SIZE_PX,
      SIZE_PX,
    );
    scene.moveCameraTo(point.x, point.z);
  };

  return (
    <div data-hud-block className="hud-panel fixed bottom-2 left-2 z-20 p-1.5">
      <canvas
        ref={canvasRef}
        data-testid="minimap"
        aria-label="Minimapa"
        role="img"
        width={SIZE_PX}
        height={SIZE_PX}
        className="hud-inset block cursor-pointer touch-none"
        style={{ width: SIZE_PX, height: SIZE_PX }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          moveTo(event);
        }}
        onPointerMove={(event) => {
          if (dragging.current) moveTo(event);
        }}
        onPointerUp={(event) => {
          dragging.current = false;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
        onContextMenu={(event) => event.preventDefault()}
      />
    </div>
  );
}
