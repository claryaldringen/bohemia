// Varování u kurzoru, když stavba přeruší cestu (paths.md – Stavba přes cestu, Náhled u kurzoru –
// Martin 18. 11. 2026): stavbě nebrání, jen upozorní (jako „Pole se zmenší“).

import type { PlacementCheck } from '@bohemia/game';

export const ROAD_CUT_WARNING = 'Cesta se přeruší';

/**
 * Kontrola u kurzoru s varováním o přerušené cestě (`cut` – kolik kusů cest náhled vyznačuje):
 * jen u kontroly, která prošla; jiná varování zůstanou nad ním (další řádek – bublina u kurzoru
 * je kreslí po řádcích). Bez zásahu, nebo neprošlá kontrola – beze změny.
 */
export function withRoadCut<C extends PlacementCheck>(check: C, cut: number): C {
  if (!check.ok || cut === 0) return check;
  const warning = check.warning ? `${check.warning}\n${ROAD_CUT_WARNING}` : ROAD_CUT_WARNING;
  return { ...check, warning };
}
