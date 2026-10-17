'use client';

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  START_AGES,
  VILLAGE_NAMES,
  VILLAGE_NAME_MAX_LENGTH,
  checkDwellingPlacement,
  checkVillageName,
  fieldPartsFromOutline,
  suggestVillageName,
  type FieldPreview,
  type Landscape,
  type Position,
} from '@bohemia/game';
import type { Placement } from '@/hooks/use-placement';
import { fieldPreviewLabel } from '@/lib/village-format';
import { foundingSceneVillage, type SceneVillage } from '@/lib/village-view';

type Step = 'name' | 'dwelling' | 'field' | 'confirm';

export interface FoundingInput {
  name: string;
  dwelling: Position;
  fieldOutline: [number, number][];
}

const STEPS: { step: Step; label: string }[] = [
  { step: 'name', label: 'Jméno' },
  { step: 'dwelling', label: 'Zemnice' },
  { step: 'field', label: 'Pole' },
];

const primaryClass =
  'rounded bg-emerald-800 px-3 py-1.5 text-stone-50 hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryClass =
  'rounded bg-stone-300 px-3 py-1.5 hover:bg-stone-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-stone-800 dark:hover:bg-stone-700';

/** Krok ve stavu umisťování: probíhá / čeká na scénu / jde spustit tlačítkem. */
function PlacementStatus({
  placing,
  sceneReady,
  idleLabel,
  onStart,
}: {
  placing: boolean;
  sceneReady: boolean;
  idleLabel: string;
  onStart: () => void;
}): ReactElement {
  if (placing) {
    return (
      <p className="text-xs text-emerald-800 dark:text-emerald-400">
        Ukaž místo v krajině – bublina u kurzoru řekne, jestli tam stavba může být.
      </p>
    );
  }
  if (!sceneReady) {
    return (
      <p className="text-xs text-stone-500 dark:text-stone-400">Krajina se ještě připravuje…</p>
    );
  }
  return (
    <button type="button" className={primaryClass} onClick={onStart}>
      {idleLabel}
    </button>
  );
}

/**
 * Založení vsi při prvním vstupu do hry (vlevo nahoře, krajina zůstává vidět a ovladatelná):
 * jméno → umístění první zemnice → obrys prvního pole → odeslání na server. Kontroly umístění
 * běží v prohlížeči nad stejnými pravidly jako na serveru, server je ověří znovu.
 */
export function FoundingPanel({
  landscape,
  seed,
  sceneReady,
  placement,
  onPreviewVillage,
  onFound,
}: {
  landscape: Landscape;
  seed: number;
  sceneReady: boolean;
  placement: Placement;
  onPreviewVillage: (village: SceneVillage) => void;
  /** Odešle založení; vrátí chybu pro hráče, nebo null (ves založená). */
  onFound: (input: FoundingInput) => Promise<string | null>;
}): ReactElement {
  const [step, setStep] = useState<Step>('name');
  const [nameIndex, setNameIndex] = useState(() =>
    Math.max(0, VILLAGE_NAMES.indexOf(suggestVillageName(seed))),
  );
  const [name, setName] = useState(() => suggestVillageName(seed));
  const [dwelling, setDwelling] = useState<Position | null>(null);
  const [field, setField] = useState<{
    outline: [number, number][];
    preview: FieldPreview;
  } | null>(null);
  /** Spustit umisťování kroku, jakmile je scéna připravená. */
  const [wantPlacement, setWantPlacement] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const { start } = placement;

  const nameCheck = checkVillageName(name);

  const startDwelling = useCallback((): void => {
    start(
      {
        kind: 'dwelling',
        type: 'zemnice',
        check: (position) => checkDwellingPlacement(landscape, null, 'zemnice', position),
      },
      (result) => {
        if (result.kind !== 'dwelling') return;
        setDwelling(result.position);
        onPreviewVillage(foundingSceneVillage(landscape, result.position, null));
        setStep('field');
        setWantPlacement(true);
      },
    );
  }, [start, landscape, onPreviewVillage]);

  const startField = useCallback(
    (zemnice: Position): void => {
      const preview = (outline: [number, number][]): FieldPreview =>
        fieldPartsFromOutline(landscape, null, outline, [zemnice]);
      start(
        {
          kind: 'field',
          preview: (outline) => {
            const result = preview(outline);
            return { check: result.check, label: fieldPreviewLabel(result) };
          },
        },
        (result) => {
          if (result.kind !== 'field') return;
          const fieldPreview = preview(result.outline);
          setField({ outline: result.outline, preview: fieldPreview });
          onPreviewVillage(
            foundingSceneVillage(landscape, zemnice, {
              outline: result.outline,
              parts: fieldPreview.parts,
            }),
          );
          setStep('confirm');
        },
      );
    },
    [start, landscape, onPreviewVillage],
  );

  useEffect(() => {
    if (!wantPlacement || !sceneReady) return;
    setWantPlacement(false);
    if (step === 'dwelling') startDwelling();
    else if (step === 'field' && dwelling) startField(dwelling);
  }, [wantPlacement, sceneReady, step, dwelling, startDwelling, startField]);

  const otherName = (): void => {
    const next = (nameIndex + 1) % VILLAGE_NAMES.length;
    setNameIndex(next);
    setName(VILLAGE_NAMES[next]!);
  };

  const toDwelling = (): void => {
    placement.cancel();
    setDwelling(null);
    setField(null);
    onPreviewVillage(foundingSceneVillage(landscape, null, null));
    setError(null);
    setStep('dwelling');
    setWantPlacement(true);
  };

  const toName = (): void => {
    placement.cancel();
    setDwelling(null);
    setField(null);
    onPreviewVillage(foundingSceneVillage(landscape, null, null));
    setWantPlacement(false);
    setStep('name');
  };

  const toField = (): void => {
    setField(null);
    onPreviewVillage(foundingSceneVillage(landscape, dwelling, null));
    setError(null);
    setStep('field');
    setWantPlacement(true);
  };

  const submit = async (): Promise<void> => {
    if (!dwelling || !field) return;
    setPending(true);
    setError(null);
    const failure = await onFound({ name, dwelling, fieldOutline: field.outline });
    if (failure !== null) {
      setError(failure);
      setPending(false);
    }
  };

  const currentIndex = STEPS.findIndex((s) => s.step === step);

  return (
    <section
      data-testid="founding-panel"
      aria-labelledby="founding-title"
      className="fixed top-12 left-2 z-10 w-80 max-w-[calc(100vw-1rem)] rounded bg-stone-100/90 px-4 py-3 text-sm text-stone-800 shadow-lg backdrop-blur dark:bg-stone-950/85 dark:text-stone-200"
    >
      <h2 id="founding-title" className="font-serif text-lg text-stone-900 dark:text-stone-50">
        Založ ves
      </h2>
      <ol className="mt-1 flex gap-3 text-xs text-stone-500 dark:text-stone-400">
        {STEPS.map((s, i) => (
          <li
            key={s.step}
            aria-current={s.step === step ? 'step' : undefined}
            className={
              i === currentIndex || (step === 'confirm' && i === STEPS.length - 1)
                ? 'font-semibold text-emerald-800 dark:text-emerald-400'
                : i < currentIndex || step === 'confirm'
                  ? 'text-stone-700 dark:text-stone-300'
                  : undefined
            }
          >
            {i + 1}. {s.label}
          </li>
        ))}
      </ol>

      {step === 'name' && (
        <form
          className="mt-3 space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!nameCheck.ok) return;
            setStep('dwelling');
            setWantPlacement(true);
          }}
        >
          <label htmlFor="village-name" className="block text-stone-600 dark:text-stone-400">
            Jméno vsi
          </label>
          <div className="flex gap-2">
            <input
              id="village-name"
              value={name}
              maxLength={VILLAGE_NAME_MAX_LENGTH}
              onChange={(event) => setName(event.target.value)}
              className="min-w-0 flex-1 rounded border border-stone-300 bg-white px-2 py-1 text-stone-900 focus-visible:outline-2 focus-visible:outline-emerald-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
            />
            <button type="button" className={secondaryClass} onClick={otherName}>
              Jiné jméno
            </button>
          </div>
          {!nameCheck.ok && (
            <p className="text-xs text-red-700 dark:text-red-400">{nameCheck.reason}</p>
          )}
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Přicházejí {START_AGES.length} osadníci – dva dospělí a dva dospívající.
          </p>
          <button type="submit" className={primaryClass} disabled={!nameCheck.ok}>
            Dál – umístit zemnici
          </button>
        </form>
      )}

      {step === 'dwelling' && (
        <div className="mt-3 space-y-2">
          <h3 className="font-semibold">Umísti zemnici</h3>
          <p className="text-stone-600 dark:text-stone-400">
            Klikni na rovné místo na louce – tam osadníci vykopou první zemnici. Q/E otáčí vchodem,
            Esc zruší.
          </p>
          <PlacementStatus
            placing={placement.active === 'dwelling'}
            sceneReady={sceneReady}
            idleLabel="Umístit zemnici"
            onStart={startDwelling}
          />
          <div>
            <button type="button" className={secondaryClass} onClick={toName}>
              Zpět
            </button>
          </div>
        </div>
      )}

      {step === 'field' && dwelling && (
        <div className="mt-3 space-y-2">
          <h3 className="font-semibold">Vyznač první pole</h3>
          <p className="text-stone-600 dark:text-stone-400">
            Klikáním vyznač obrys pole na louce poblíž zemnice. Backspace ubere bod, Enter nebo
            dvojklik obrys uzavře, Esc zruší.
          </p>
          <PlacementStatus
            placing={placement.active === 'field'}
            sceneReady={sceneReady}
            idleLabel="Vyznačit pole"
            onStart={() => startField(dwelling)}
          />
          <div>
            <button type="button" className={secondaryClass} onClick={toDwelling}>
              Zpět – jiné místo zemnice
            </button>
          </div>
        </div>
      )}

      {step === 'confirm' && field && (
        <div className="mt-3 space-y-2">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <dt className="text-stone-600 dark:text-stone-400">Ves</dt>
            <dd className="font-semibold">{name.trim()}</dd>
            <dt className="text-stone-600 dark:text-stone-400">Zemnice</dt>
            <dd>stojí, bydlí v ní {START_AGES.length} lidé</dd>
            <dt className="text-stone-600 dark:text-stone-400">Pole</dt>
            <dd>{fieldPreviewLabel(field.preview)}</dd>
          </dl>
          {error && (
            <p role="alert" className="text-xs text-red-700 dark:text-red-400">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" className={secondaryClass} onClick={toField} disabled={pending}>
              Zpět
            </button>
            <button
              type="button"
              className={primaryClass}
              onClick={() => void submit()}
              disabled={pending}
            >
              {pending ? 'Zakládám…' : 'Založit ves'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
