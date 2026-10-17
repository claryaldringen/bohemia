import type { ReactElement } from 'react';
import type { PlacementPreview } from '@/lib/scene/village-types';

/** Ovládání malování pole – stejná nápověda v nabídce staveb i při zakládání vsi. */
export const FIELD_PAINT_HINT =
  'Klik přepne čtverec · tažení přidá obdélník · Shift + tažení nebo pravý klik ubere · ' +
  'krajinu posuneš prostředním tlačítkem, mezerníkem + tažením nebo WASD · ' +
  'Backspace vrátí tah · Enter potvrdí · Esc zruší';

/**
 * Živý souhrn malovaného pole: čtverce, výměra, úrodnost, cena (z náhledu scény) a proč pole
 * ještě neprojde.
 */
export function FieldPaintStatus({ preview }: { preview: PlacementPreview | null }): ReactElement {
  const label = preview?.label ?? '';
  const reason = preview && !preview.check.ok ? preview.check.reason : null;
  return (
    <div data-testid="field-paint-status" aria-live="polite" className="text-xs">
      <p className="font-medium text-stone-800 tabular-nums dark:text-stone-200">
        {label || 'Zatím žádný čtverec'}
      </p>
      {reason && <p className="text-red-700 dark:text-red-400">{reason}</p>}
    </div>
  );
}
