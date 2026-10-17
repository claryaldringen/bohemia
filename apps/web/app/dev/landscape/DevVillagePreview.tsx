'use client';

// VÝVOJOVÝ NÁSTROJ – jen pro /dev/landscape (v produkci stránka vrací 404). Zkouška umisťování
// staveb a vzhledu vsi ve scéně bez přihlášení a databáze: kontroly jsou zjednodušené (stavět
// nejde jen na vodu a přes jiné stavby), ves žije jen ve stavu komponenty. Skutečné rozhraní vsi
// a pravidla umístění patří do hry (/game) a herního jádra, ne sem.
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  surfaceAt,
  type DwellingType,
  type Landscape,
  type PartStage,
  type PlacementCheck,
  type Position,
} from '@bohemia/game';
import { GameView } from '@/components/game/GameView';
import { decodeLandscape, type LandscapeTransfer } from '@/lib/landscape-transfer';
import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import { tileAt, tileCenter } from '@/lib/scene/tile-at';
import { CONSTRUCTION_PHASES, constructionPhase } from '@/lib/scene/village-construction';
import { pointInPolygon, polygonArea, polygonBounds } from '@/lib/scene/village-layout';
import type { PlacementPreview, SceneDwelling, SceneField } from '@/lib/scene/village-types';
import type { SceneVillage } from '@/lib/village-view';

const STAGES: PartStage[] = [
  'founding',
  'ready',
  'sown',
  'young-fallow',
  'meadow',
  'young-growth',
  'shrub',
  'forest',
];
const buttonClass =
  'rounded bg-stone-800 px-2 py-0.5 text-stone-50 hover:bg-stone-700 disabled:opacity-40 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-stone-300';

interface DevWindow extends Window {
  __bohemiaDev?: {
    scene: LandscapeScene;
    setDwellings: (dwellings: SceneDwelling[]) => void;
  };
}

interface DevField {
  id: number;
  outline: [number, number][];
  parts: { x: number; z: number; size: number }[];
}

export function DevVillagePreview({ landscape }: { landscape: LandscapeTransfer }): ReactElement {
  const decoded = useMemo(() => decodeLandscape(landscape), [landscape]);
  const [scene, setScene] = useState<LandscapeScene | null>(null);
  const [dwellings, setDwellings] = useState<SceneDwelling[]>([]);
  const [fields, setFields] = useState<DevField[]>([]);
  const [stage, setStage] = useState(0);
  const [mixed, setMixed] = useState(true);
  const [placing, setPlacing] = useState<string | null>(null);
  const [preview, setPreview] = useState<PlacementPreview | null>(null);
  const [smokeAlways, setSmokeAlways] = useState(false);
  const nextId = useRef(1);

  const village = useMemo<SceneVillage>(
    () => ({
      dwellings,
      fields: fields.map((field): SceneField => ({
        id: field.id,
        outline: field.outline,
        parts: field.parts.map((part, i) => ({
          ...part,
          stage: STAGES[(stage + (mixed ? i : 0)) % STAGES.length]!,
        })),
      })),
    }),
    [dwellings, fields, stage, mixed],
  );

  useEffect(() => {
    scene?.setVillage(village);
  }, [scene, village]);

  useEffect(() => {
    scene?.setSmokeAlways(smokeAlways);
  }, [scene, smokeAlways]);

  // Přístup ke scéně a vsi pro snímky z Playwrightu (jen tato vývojová stránka).
  useEffect(() => {
    if (!scene) return;
    const devWindow = window as DevWindow;
    devWindow.__bohemiaDev = { scene, setDwellings };
    return () => {
      delete devWindow.__bohemiaDev;
    };
  }, [scene]);

  const handlers = {
    onCancel: (): void => {
      setPlacing(null);
      setPreview(null);
    },
    onPreview: setPreview,
  };

  const placeDwelling = (type: DwellingType): void => {
    if (!scene) return;
    setPlacing(type === 'zemnice' ? 'Zemnice' : 'Polozemnice');
    scene.startPlacement(
      {
        kind: 'dwelling',
        type,
        check: (position) => fakeDwellingCheck(decoded, village, position),
      },
      {
        ...handlers,
        onConfirm: (result) => {
          handlers.onCancel();
          if (result.kind !== 'dwelling') return;
          const id = nextId.current++;
          setDwellings((list) => [
            ...list,
            { id, type: result.type, position: result.position, built: false, progress: 0 },
          ]);
        },
      },
    );
  };

  const placeField = (): void => {
    if (!scene) return;
    setPlacing('Pole');
    scene.startPlacement(
      { kind: 'field', preview: (outline) => fakeFieldPreview(decoded, village, outline) },
      {
        ...handlers,
        onConfirm: (result) => {
          handlers.onCancel();
          if (result.kind !== 'field') return;
          const id = nextId.current++;
          const parts = fieldParts(decoded, result.outline);
          setFields((list) => [...list, { id, outline: result.outline, parts }]);
        },
      },
    );
  };

  const advanceConstruction = (step: number): void =>
    setDwellings((list) =>
      list.map((d) => {
        if (d.built) return d;
        const progress = Math.min(1, Math.max(0, Math.round((d.progress + step) * 100) / 100));
        return { ...d, progress, built: progress >= 1 };
      }),
    );

  /** Řada stavenišť ve všech fázích vedle sebe u místa vsi (a hotové obydlí na konci). */
  const showPhases = (): void => {
    scene?.cancelPlacement();
    const site = tileCenter(decoded, decoded.villageSite.x, decoded.villageSite.y);
    const list: SceneDwelling[] = [];
    (['zemnice', 'polozemnice'] as const).forEach((type, row) => {
      const phases = CONSTRUCTION_PHASES[type];
      const stops = [...phases.map((p) => (p.from + p.to) / 2), 1];
      stops.forEach((progress, i) => {
        const x = site.worldX + (i - (stops.length - 1) / 2) * 10.5;
        const z = site.worldZ + row * 14;
        const tile = tileAt(decoded, x, z);
        if (!tile || surfaceAt(decoded, tile.x, tile.y) === 'water') return;
        list.push({
          id: nextId.current++,
          type,
          // vchodem ke kameře (ta se ve výchozím pohledu dívá k +z)
          position: { x, z, rotation: Math.PI },
          built: progress >= 1,
          progress,
        });
      });
    });
    setDwellings(list);
  };

  const firstSite = dwellings.find((d) => !d.built);

  return (
    <>
      <GameView landscape={landscape} onSceneReady={setScene} />
      <div
        data-testid="dev-village"
        className="fixed top-12 left-2 z-10 flex max-w-[calc(100vw-4rem)] flex-wrap items-center gap-1.5 rounded border-2 border-dashed border-amber-600 bg-stone-100/90 px-2 py-1 text-xs text-stone-700 backdrop-blur dark:bg-stone-950/80 dark:text-stone-300"
      >
        <span className="font-semibold text-amber-700">Vývoj – ves bez DB:</span>
        <button className={buttonClass} disabled={!scene} onClick={() => placeDwelling('zemnice')}>
          Zemnice
        </button>
        <button
          className={buttonClass}
          disabled={!scene}
          onClick={() => placeDwelling('polozemnice')}
        >
          Polozemnice
        </button>
        <button className={buttonClass} disabled={!scene} onClick={placeField}>
          Pole
        </button>
        <button className={buttonClass} onClick={() => advanceConstruction(-0.1)}>
          Stavby −10 %
        </button>
        <button className={buttonClass} onClick={() => advanceConstruction(0.1)}>
          Stavby +10 %
        </button>
        {firstSite && (
          <span data-testid="dev-village-phase">
            {Math.round(firstSite.progress * 100)} % ·{' '}
            {constructionPhase(firstSite.type, firstSite.progress).label}
          </span>
        )}
        <button className={buttonClass} disabled={!scene} onClick={showPhases}>
          Ukázka fází
        </button>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={smokeAlways}
            onChange={(e) => setSmokeAlways(e.target.checked)}
          />
          dým stále
        </label>
        <button className={buttonClass} onClick={() => setStage((s) => (s + 1) % STAGES.length)}>
          Díly: {STAGES[stage]}
        </button>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={mixed} onChange={(e) => setMixed(e.target.checked)} />
          střídat stavy
        </label>
        <button
          className={buttonClass}
          onClick={() => {
            scene?.cancelPlacement();
            setDwellings([]);
            setFields([]);
          }}
        >
          Smazat ves
        </button>
        {placing && (
          <span data-testid="dev-village-status">
            {placing}: {preview ? `${preview.check.ok ? '✓' : '✗'} ${previewText(preview)}` : '…'}{' '}
            <span className="text-stone-500">
              (Esc zruší
              {placing === 'Pole'
                ? ', Backspace ubere bod, Enter / dvojklik uzavře'
                : ', Q/E otáčí, klik postaví'}
              )
            </span>
          </span>
        )}
      </div>
      {preview?.screen && (
        <div
          className={`pointer-events-none fixed z-10 rounded px-2 py-0.5 text-xs text-white ${preview.check.ok ? 'bg-emerald-700/85' : 'bg-red-700/85'}`}
          style={{ left: preview.screen.x + 16, top: preview.screen.y + 16 }}
        >
          {previewText(preview)}
        </div>
      )}
    </>
  );
}

function previewText(preview: PlacementPreview): string {
  const reason = preview.check.ok ? null : preview.check.reason;
  return [preview.label, reason].filter((text) => text).join(' – ');
}

/** Zjednodušená kontrola obydlí: ne na vodu, ne mimo krajinu, ne přes jinou stavbu nebo pole. */
function fakeDwellingCheck(l: Landscape, village: SceneVillage, p: Position): PlacementCheck {
  const tile = tileAt(l, p.x, p.z);
  if (!tile) return { ok: false, reason: 'Mimo krajinu' };
  if (surfaceAt(l, tile.x, tile.y) === 'water')
    return { ok: false, reason: 'Na vodě stavět nejde' };
  if (village.dwellings.some((d) => Math.hypot(d.position.x - p.x, d.position.z - p.z) < 7)) {
    return { ok: false, reason: 'Překáží jiné obydlí' };
  }
  if (village.fields.some((f) => pointInPolygon(f.outline, p.x, p.z))) {
    return { ok: false, reason: 'Na poli stavět nejde' };
  }
  return { ok: true, reason: null };
}

/** Zjednodušený náhled pole: výměra a díly (políčka obrysu mimo vodu). */
function fakeFieldPreview(
  l: Landscape,
  village: SceneVillage,
  outline: [number, number][],
): { check: PlacementCheck; label: string } {
  const area = polygonArea(outline);
  const parts = fieldParts(l, outline);
  const label = `${(area / 10_000).toFixed(2).replace('.', ',')} ha · ${parts.length} dílů`;
  if (area < 200) return { check: { ok: false, reason: 'Pole je moc malé' }, label };
  if (parts.length === 0) return { check: { ok: false, reason: 'Pole je celé na vodě' }, label };
  if (village.dwellings.some((d) => pointInPolygon(outline, d.position.x, d.position.z))) {
    return { check: { ok: false, reason: 'V poli stojí obydlí' }, label };
  }
  return { check: { ok: true, reason: null }, label };
}

/** Políčka, která obrys zasahuje (vzorkování 5 × 5 bodů na políčko), kromě vody. */
function fieldParts(
  l: Landscape,
  outline: [number, number][],
): { x: number; z: number; size: number }[] {
  const bounds = polygonBounds(outline);
  const from = tileAt(l, bounds.minX, bounds.minZ) ?? { x: 0, y: 0 };
  const to = tileAt(l, bounds.maxX, bounds.maxZ) ?? { x: l.size - 1, y: l.size - 1 };
  const size = l.cellSizeM;
  const parts: { x: number; z: number; size: number }[] = [];
  for (let y = from.y; y <= to.y; y++) {
    for (let x = from.x; x <= to.x; x++) {
      if (surfaceAt(l, x, y) === 'water') continue;
      const c = tileCenter(l, x, y);
      let hit = outline.some(
        ([px, pz]) => Math.abs(px - c.worldX) <= size / 2 && Math.abs(pz - c.worldZ) <= size / 2,
      );
      for (let i = 0; i < 5 && !hit; i++) {
        for (let j = 0; j < 5 && !hit; j++) {
          hit = pointInPolygon(
            outline,
            c.worldX + ((i + 0.5) / 5 - 0.5) * size,
            c.worldZ + ((j + 0.5) / 5 - 0.5) * size,
          );
        }
      }
      if (hit) parts.push({ x: c.worldX, z: c.worldZ, size });
    }
  }
  return parts;
}
