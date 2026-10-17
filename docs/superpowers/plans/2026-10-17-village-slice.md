# Hratelná ves – první prototyp (vertikální řez)

Stav: rozhoduje Martin („Prostě to udělej, pak to budeme ladit… rychlé iterace“) – prototyp,
ladí se za běhu. Pravidla: `docs/design/population.md`, `docs/design/fields.md`. Jádro simulace:
`packages/game/src/domain/village/` (`foundVillage`, `advanceVillage`, `startNewDwelling`,
`foundField`).

## Co hráč dělá

1. **Založení vsi** při prvním vstupu na `/game`: jméno vsi (hra nabídne staročeské), umístění
   první zemnice (půdorys u kurzoru), nakreslení prvního pole (obrys), potvrzení.
2. **Panel vsi** (vlevo nahoře): jméno, lidé (děti / dospělí / starší), domácnosti (typ,
   obsazenost, plná / přeplněná, stav), zásoby obilí a na kolik měsíců, nasycení, volná společná
   práce za den, rozestavěné stavby s průběhem, posledních ~8 událostí kroniky.
3. **Nabídka staveb:** Zemnice, Polozemnice (cena v člověkodnech; zašedlé s důvodem, dokud
   `canStartNewDwelling` neplatí), Pole (cena za ha louky).
4. **Umístění obydlí:** půdorys u kurzoru, zelený / červený s důvodem, Q/E otáčí, klik potvrdí,
   Esc zruší. **Pole:** klikáním body obrysu, Backspace ubere bod, dvojklik / Enter uzavře, Esc
   zruší; během kreslení výměra, průměrná úrodnost, cena.
5. **Scéna:** hotová obydlí jako naše modely (omazané stěny, slámové došky, kozy, vyšlapaná
   hlína, trsy u okapu), rozestavěná jako výkop / lešení, pole na terénu podle stavu dílů.

## Zjednodušení prototypu (návrh Clauda, Martin odsouhlasil „prostě to udělej“)

- Stavět jen na **louce**: díly pole mimo louku se zahodí, obydlí jinde nejde. Kameny a stromy
  pod stavbou / polem zmizí bez ceny navíc (`obstacleCost = 0`). Les a překážky jako herní data
  přijdou v další verzi.
- Ves se dopočítá **při každém načtení a akci** (žádný worker); klient se ptá každých ~5 s.
- Lokálně **zrychlený testovací svět** (`WORLD_START` / `WORLD_END` v `apps/web/.env.local`).

## Rozhraní (závazné pro všechny tři části)

**Doména (`packages/game/src/domain/village/placement.ts`, čisté funkce, i pro klienta):**

```ts
export const DWELLING_FOOTPRINT_M: Record<DwellingType, { width: number; depth: number }>; // 4×4, 5×5 (rules.ts)
export interface PlacementCheck {
  ok: boolean;
  reason: string | null;
} // česky, pro hráče
export function checkDwellingPlacement(
  landscape: Landscape,
  village: VillageState | null,
  type: DwellingType,
  position: Position,
): PlacementCheck; // rovina ≤ 0,5 m, louka, ne voda, ne přes obydlí / pole
export function fieldPartsFromOutline(
  landscape: Landscape,
  village: VillageState | null,
  outline: [number, number][],
  dwellingPositions: Position[],
): {
  parts: PartInput[];
  areaM2: number;
  averageFertility: number;
  foundingCost: number;
  check: PlacementCheck;
}; // průnik s políčky, jen louka
```

Souřadnice = svět scény v metrech (`x`, `z`, střed krajiny 0,0; políčka podle `tileCenter`), výšky
herní (bez `HEIGHT_SCALE`).

**Aplikace (`packages/game/src/application/`):** port `VillageRepository { find(settlementId),
create(settlementId, name, state), save(settlementId, state, expectedVersion) }` + use-casy
`foundVillageForSettlement`, `loadVillage` (dopočítá do dneška a uloží), `placeDwelling`,
`placeField` – každý dostane dnešní herní den parametrem.

**Web (`apps/web/lib/village.ts` + server actions v `apps/web/app/game/actions.ts`):**

```ts
export interface VillageView {
  name: string;
  dayIndex: number;
  people: { children: number; adults: number; elders: number };
  households: {
    dwellingId: number;
    type: DwellingType;
    occupants: number;
    capacity: number;
    full: boolean;
    overcrowded: boolean;
    condition: number;
  }[];
  storesKg: number;
  storesMonths: number;
  satiation: number;
  commonLaborPerDay: number;
  canBuildDwelling: PlacementCheck;
  costs: { zemnice: number; polozemnice: number; fieldPerHa: number };
  constructions: {
    id: number;
    kind: 'dwelling' | 'rebuild' | 'field';
    label: string;
    progress: number;
  }[];
  scene: SceneVillage;
  chronicle: { day: number; dateLabel: string; text: string }[];
}
export interface SceneVillage {
  dwellings: {
    id: number;
    type: DwellingType;
    position: Position;
    built: boolean;
    progress: number;
  }[];
  fields: {
    id: number;
    outline: [number, number][];
    parts: { x: number; z: number; size: number; stage: PartStage }[];
  }[];
}
export type PartStage =
  'founding' | 'ready' | 'sown' | 'young-fallow' | 'meadow' | 'young-growth' | 'shrub' | 'forest';
// actions: getVillageView(): VillageView | null; foundVillage({ name, dwelling, fieldOutline });
// placeDwelling({ type, position }); placeField({ outline }) – vrací VillageView nebo { error }
```

**Scéna (`apps/web/lib/scene/`):** `LandscapeScene.setVillage(village: SceneVillage)` (inkrementálně,
bez přestavby krajiny), `LandscapeScene.startPlacement(mode, handlers)` s `mode` =
`{ kind: 'dwelling'; type; check(position): PlacementCheck }` nebo
`{ kind: 'field'; preview(outline): { check: PlacementCheck; label: string } }` a
`handlers = { onConfirm(result), onCancel() }`; `cancelPlacement()`.
