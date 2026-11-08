import { segmentRampart, segmentTop, segmentWall } from './life';
import type { FortSegment, Fortification } from './types';

// Val doplněný vně stojící hradby (fortifications.md – Hradby a obrana, Druhy; Martin 8. 11. 2026:
// „… ale pak bych měl mít možnost doplnit to o val s příkopem.“): přepis dílu při zahájení
// a návrat při zrušení stavby. Zahájení a cena – `fortification-rampart.ts`.

/**
 * Přepíše díl na „hradba stojí, val se staví“ (Rozhodnutí plánu hradeb): základ val (`kind`),
 * hradba na něm (`top`, `topBuiltDay` = dřívější `builtDay`), val vně (`rampartOutside`) bez dne
 * dokončení. Stav a stáří hradby zůstanou. Val nový – u opevnění se sníženým valem plná výška dílu
 * (návrh Clauda; jinak sleduje výšku valu opevnění a jeho údržbu).
 */
export function startRampartOn(fort: Fortification, seg: FortSegment): void {
  const wall = segmentWall(fort, seg)!;
  if (fort.kind === 'rampart') delete seg.kind;
  else seg.kind = 'rampart';
  if (wall.kind === fort.top) delete seg.top;
  else seg.top = wall.kind;
  seg.topBuiltDay = wall.builtDay;
  seg.builtDay = null;
  seg.rampartOutside = true;
  if (fort.rampartHeight !== undefined && fort.rampartHeight < 1) seg.rampartHeight = 1;
  delete seg.moatDay;
}

/**
 * Zrušené doplnění valu na dílu, kde val ještě nestojí (fortifications.md – Cena a stavba;
 * Review Focus 2 plánu hradeb): díl je zase hradba bez valu se stejným dnem dokončení a stavem –
 * hradba stála a bránila celou dobu, nic se nedostaví ani nevrací.
 */
export function revertRampartAddition(fort: Fortification, seg: FortSegment): void {
  if (!seg.rampartOutside || seg.builtDay !== null) return;
  const rampart = segmentRampart(fort, seg);
  const wall = segmentTop(fort, seg);
  if (rampart === null || wall === null) return;
  seg.builtDay = seg.topBuiltDay ?? null;
  delete seg.topBuiltDay;
  delete seg.top;
  delete seg.rampartOutside;
  delete seg.rampartHeight;
  delete seg.moatDay;
  if (wall === fort.kind) delete seg.kind;
  else seg.kind = wall;
}
