'use client';

// VÝVOJOVÝ NÁSTROJ – jen pro /dev/landscape (v produkci stránka vrací 404). Zkouška umisťování
// staveb a vzhledu vsi ve scéně bez přihlášení a databáze: kontroly jsou zjednodušené (stavět
// nejde jen na vodu a přes jiné stavby), ves žije jen ve stavu komponenty. Skutečné rozhraní vsi
// a pravidla umístění patří do hry (/game) a herního jádra, ne sem.
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  CEMETERY,
  cemeteryPartsFromCells,
  surfaceAt,
  type DwellingType,
  type Landscape,
  type PartStage,
  type PlacementCheck,
  type Position,
  type TileCell,
} from '@bohemia/game';
import { GameView } from '@/components/game/GameView';
import { decodeLandscape, type LandscapeTransfer } from '@/lib/landscape-transfer';
import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import { CEMETERY_PHASES } from '@/lib/scene/cemetery-layout';
import { tileAt, tileCenter } from '@/lib/scene/tile-at';
import { CONSTRUCTION_PHASES, constructionPhase } from '@/lib/scene/village-construction';
import type {
  SquaresPreview,
  PlacementPreview,
  SceneDwelling,
  SceneField,
} from '@/lib/scene/village-types';
import { formatCells, formatHa, plural } from '@/lib/village-format';
import { placementVillageFromScene, type SceneVillage } from '@/lib/village-view';

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

type DevCemetery = NonNullable<SceneVillage['cemeteries']>[number];

interface DevWindow extends Window {
  __bohemiaDev?: {
    scene: LandscapeScene;
    setDwellings: (dwellings: SceneDwelling[]) => void;
    setCemeteries: (cemeteries: DevCemetery[]) => void;
  };
}

interface DevField {
  id: number;
  parts: { cell: TileCell; x: number; z: number; size: number }[];
}

export function DevVillagePreview({ landscape }: { landscape: LandscapeTransfer }): ReactElement {
  const decoded = useMemo(() => decodeLandscape(landscape), [landscape]);
  const [scene, setScene] = useState<LandscapeScene | null>(null);
  const [dwellings, setDwellings] = useState<SceneDwelling[]>([]);
  const [fields, setFields] = useState<DevField[]>([]);
  const [cemeteries, setCemeteries] = useState<DevCemetery[]>([]);
  const [stage, setStage] = useState(0);
  const [mixed, setMixed] = useState(true);
  const [placing, setPlacing] = useState<string | null>(null);
  const [preview, setPreview] = useState<PlacementPreview | null>(null);
  const [smokeAlways, setSmokeAlways] = useState(false);
  const [woodLogs, setWoodLogs] = useState(0);
  const nextId = useRef(1);

  const village = useMemo<SceneVillage>(
    () => ({
      dwellings,
      fields: fields.map((field): SceneField => ({
        id: field.id,
        parts: field.parts.map((part, i) => ({
          ...part,
          stage: STAGES[(stage + (mixed ? i : 0)) % STAGES.length]!,
        })),
      })),
      cemeteries,
      woodLogs,
    }),
    [dwellings, fields, cemeteries, stage, mixed, woodLogs],
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
    devWindow.__bohemiaDev = { scene, setDwellings, setCemeteries };
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
      { kind: 'squares', preview: (cells) => fakeFieldPreview(decoded, village, cells) },
      {
        ...handlers,
        onConfirm: (result) => {
          handlers.onCancel();
          if (result.kind !== 'squares') return;
          const id = nextId.current++;
          setFields((list) => [...list, { id, parts: fieldParts(decoded, result.cells) }]);
        },
      },
    );
  };

  /** Hřbitov se skutečnou kontrolou z herního jádra (i s varováním u obydlí a vody). */
  const placeCemetery = (): void => {
    if (!scene) return;
    setPlacing('Hřbitov');
    scene.startPlacement(
      {
        kind: 'squares',
        preview: (cells) => {
          const result = cemeteryPartsFromCells(
            decoded,
            placementVillageFromScene(village),
            cells,
            village.dwellings.map((d) => d.position),
          );
          return {
            check: result.check,
            label: `${formatCells(cells.length)} · ${result.capacity} ${plural(result.capacity, 'hrob', 'hroby', 'hrobů')}`,
            blockedCells: result.blockedCells,
            warningCells: result.warningCells,
          };
        },
      },
      {
        ...handlers,
        onConfirm: (result) => {
          handlers.onCancel();
          if (result.kind !== 'squares') return;
          const id = nextId.current++;
          const squares = fieldParts(decoded, result.cells);
          setCemeteries((list) => [...list, { id, squares, built: false, progress: 0, graves: 0 }]);
        },
      },
    );
  };

  const advanceConstruction = (step: number): void => {
    const next = (progress: number): number =>
      Math.min(1, Math.max(0, Math.round((progress + step) * 100) / 100));
    setDwellings((list) =>
      list.map((d) => {
        if (d.built) return d;
        const progress = next(d.progress);
        return { ...d, progress, built: progress >= 1 };
      }),
    );
    setCemeteries((list) =>
      list.map((c) => {
        if (c.built) return c;
        const progress = next(c.progress);
        return { ...c, progress, built: progress >= 1 };
      }),
    );
  };

  /** Pohřbí do hotových hřbitovů dalších `count` mrtvých (nejvýš do zaplnění). */
  const addGraves = (count: number): void =>
    setCemeteries((list) =>
      list.map((c) => {
        if (!c.built) return c;
        const capacity = c.squares.length * CEMETERY.gravesPerSquare;
        return { ...c, graves: Math.min(capacity, Math.max(0, c.graves + count)) };
      }),
    );

  /**
   * Hřbitovy 2 × 2 čtverce ve všech fázích založení vedle sebe kousek od místa vsi, hotové
   * s hroby a hotový s rozšířením ve stavbě; zemnice před nimi ukáže, kam míří branka.
   */
  const showCemeteries = (): void => {
    scene?.cancelPlacement();
    const { x: sx, y: sy } = decoded.villageSite;
    const stops = [...CEMETERY_PHASES.map((p) => (p.from + p.to) / 2), 1, 1];
    const list: DevCemetery[] = [];
    stops.forEach((progress, i) => {
      const cells: TileCell[] = [];
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) cells.push({ x: sx - 7 + i * 3 + dx, y: sy + 2 + dy });
      const squares = fieldParts(decoded, cells);
      if (squares.length < cells.length) return;
      const built = progress >= 1;
      const graves = built ? (i === stops.length - 1 ? 224 : 70) : 0;
      list.push({ id: nextId.current++, squares, built, progress, graves });
    });
    // hotový hřbitov s rozšířením ve stavbě (dva čtverce za ním, kůly zatlučené z poloviny)
    const extended = fieldParts(decoded, [
      { x: sx - 7, y: sy + 5 },
      { x: sx - 6, y: sy + 5 },
      { x: sx - 7, y: sy + 6 },
      { x: sx - 6, y: sy + 6 },
    ]);
    const extension = fieldParts(decoded, [
      { x: sx - 7, y: sy + 7 },
      { x: sx - 6, y: sy + 7 },
    ]).map((square) => ({ ...square, pending: true }));
    if (extended.length === 4 && extension.length === 2) {
      list.push({
        id: nextId.current++,
        squares: [...extended, ...extension],
        built: true,
        progress: 0.3,
        graves: 150,
      });
    }
    const site = tileCenter(decoded, sx, sy);
    setDwellings([
      {
        id: nextId.current++,
        type: 'zemnice',
        position: { x: site.worldX, z: site.worldZ - 10, rotation: 0 },
        built: true,
        progress: 1,
      },
    ]);
    setCemeteries(list);
  };

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
        <button className={buttonClass} disabled={!scene} onClick={placeCemetery}>
          Hřbitov
        </button>
        <button className={buttonClass} onClick={() => addGraves(10)}>
          Hroby +10
        </button>
        <button className={buttonClass} disabled={!scene} onClick={showCemeteries}>
          Ukázka hřbitovů
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
        <button className={buttonClass} onClick={() => setWoodLogs((n) => Math.max(0, n - 10))}>
          Klády −10
        </button>
        <span data-testid="dev-village-wood">{woodLogs} klád</span>
        <button className={buttonClass} onClick={() => setWoodLogs((n) => n + 10)}>
          Klády +10
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
            setCemeteries([]);
          }}
        >
          Smazat ves
        </button>
        {placing && (
          <span data-testid="dev-village-status">
            {placing}: {preview ? `${preview.check.ok ? '✓' : '✗'} ${previewText(preview)}` : '…'}{' '}
            <span className="text-stone-500">
              (Esc zruší
              {placing === 'Pole' || placing === 'Hřbitov'
                ? ', klik / tažení maluje čtverce, Ctrl ubírá, Enter potvrdí, pravý klik zruší'
                : ', [ ] otáčí, klik postaví, Shift + klik staví dál'}
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
  const reason = preview.check.ok ? (preview.check.warning ?? null) : preview.check.reason;
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
  if (village.fields.some((f) => f.parts.some((c) => c.cell.x === tile.x && c.cell.y === tile.y))) {
    return { ok: false, reason: 'Na poli stavět nejde' };
  }
  return { ok: true, reason: null };
}

/** Zjednodušený náhled pole: čtverce ve vodě a v jiném poli jsou zakázané. */
function fakeFieldPreview(l: Landscape, village: SceneVillage, cells: TileCell[]): SquaresPreview {
  const taken = new Set(
    village.fields.flatMap((f) => f.parts.map((p) => `${p.cell.x},${p.cell.y}`)),
  );
  const blockedCells = cells.filter(
    (c) => surfaceAt(l, c.x, c.y) === 'water' || taken.has(`${c.x},${c.y}`),
  );
  const label = `${formatCells(cells.length)} · ${formatHa(cells.length * l.cellSizeM ** 2)}`;
  const check: PlacementCheck =
    blockedCells.length > 0
      ? { ok: false, reason: 'Ve vodě ani přes jiné pole pole nejde' }
      : { ok: true, reason: null };
  return { check, label, blockedCells };
}

/** Díly pole – políčka ve středech čtverců (bez vody). */
function fieldParts(l: Landscape, cells: TileCell[]): DevField['parts'] {
  return cells
    .filter((c) => surfaceAt(l, c.x, c.y) !== 'water')
    .map((cell) => {
      const c = tileCenter(l, cell.x, cell.y);
      return { cell, x: c.worldX, z: c.worldZ, size: l.cellSizeM };
    });
}
