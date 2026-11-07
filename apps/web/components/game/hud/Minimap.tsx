'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react';
import { premiumFeaturesOf, type Landscape } from '@bohemia/game';
import {
  drawMinimapPremium,
  drawMinimapView,
  drawMinimapVillage,
  minimapImage,
  minimapToWorld,
  premiumMinimapMarks,
} from '@/lib/minimap';
import type { ClearedForest } from '@/lib/scene/cleared-forest';
import type { LandscapeScene, ViewFootprint } from '@/lib/scene/landscape-scene';
import type { SceneVillage } from '@/lib/village-view';
import { Tooltip } from './Tooltip';

/** Strana minimapy v CSS px. */
const SIZE_PX = 196;
/** Rozlišení obrázku krajiny (px na stranu) – 2 px na políčko krajiny. */
const IMAGE_PX = 256;

/**
 * Minimapa vlevo dole (jako v 0 A.D.): krajina sídla shora (voda, les – vykácený řídne do
 * paseky, louka, skála), prvky prémiové krajiny, pole, hřbitovy, sady, obydlí a obrys záběru
 * kamery. Kliknutí nebo tažení přesune pohled. Odříznutý nováček (newcomers.md – Čekání) nemá
 * kolem sebe mapu světa – popisek „Odříznutá krajina“.
 */
export function Minimap({
  landscape,
  scene,
  village,
  isolated = false,
}: {
  landscape: Landscape;
  scene: LandscapeScene | null;
  village: SceneVillage;
  /** Sídlo je jen v odříznuté krajině – ještě není na mapě světa. */
  isolated?: boolean;
}): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<ViewFootprint | null>(null);
  const dragging = useRef(false);
  // vymýcený les počítá scéna (její vrstva překážek) a ohlásí jen znatelnou změnu
  const [cleared, setCleared] = useState<ClearedForest | null>(null);

  // Obrázek krajiny se přepočítá jen při změně vymýceného lesa (krajina sídla se nemění).
  const base = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const image = document.createElement('canvas');
    image.width = IMAGE_PX;
    image.height = IMAGE_PX;
    const context = image.getContext('2d');
    if (!context) return null;
    const pixels = new ImageData(IMAGE_PX, IMAGE_PX);
    pixels.data.set(minimapImage(landscape, IMAGE_PX, cleared));
    context.putImageData(pixels, 0, 0);
    return image;
  }, [landscape, cleared]);

  useEffect(() => scene?.onViewChange(setView), [scene]);
  useEffect(() => scene?.onClearedForestChange(setCleared), [scene]);

  // Krajina a ves ve vrstvě v rozlišení plátna – překreslí se jen při změně vsi nebo lesa, ne
  // při každém pohybu kamery (záběr se kreslí přes ni).
  const layer = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const ratio = window.devicePixelRatio || 1;
    const image = document.createElement('canvas');
    image.width = Math.round(SIZE_PX * ratio);
    image.height = image.width;
    const context = image.getContext('2d');
    if (!context) return null;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.imageSmoothingEnabled = true;
    if (base) context.drawImage(base, 0, 0, SIZE_PX, SIZE_PX);
    // prvky prémiové krajiny (naleziště, brod, stezka, pramen…) pod vsí
    drawMinimapPremium(
      context,
      premiumMinimapMarks(landscape, premiumFeaturesOf(landscape), SIZE_PX),
    );
    drawMinimapVillage(context, landscape, village, SIZE_PX);
    return image;
  }, [base, landscape, village]);

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
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, px, px);
    // vrstva má rozlišení plátna – kopie pixel na pixel
    if (layer) context.drawImage(layer, 0, 0, px, px);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawMinimapView(context, landscape, view, SIZE_PX);
  }, [layer, landscape, view]);

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

  const canvas = (
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
  );
  return (
    <div
      data-hud-block
      data-testid="minimap-panel"
      data-isolated={isolated || undefined}
      className="hud-panel fixed bottom-2 left-2 z-20 p-1.5"
    >
      {isolated ? (
        <Tooltip content="Odříznutá krajina" placement="above">
          {canvas}
        </Tooltip>
      ) : (
        canvas
      )}
    </div>
  );
}
