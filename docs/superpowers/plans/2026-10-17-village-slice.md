# Hratelná ves – první prototyp (vertikální řez)

Stav: rozhoduje Martin („Prostě to udělej, pak to budeme ladit… rychlé iterace“) – prototyp,
ladí se za běhu. **Rozhraní a ovládání níže (průvodce založením, panel vsi, nabídka staveb,
odemčení plnou domácností) nahradilo 17. 10. 2026 rozhraní jako v 0 A.D. a stavění kdykoli** –
platí CLAUDE.md (Ves) a population.md (Nové obydlí). Pravidla: `docs/design/population.md`, `docs/design/fields.md`. Jádro simulace:
`packages/game/src/domain/village/` (`foundVillage`, `advanceVillage`, `startNewDwelling`,
`foundField`).

## Co hráč dělá

1. **Založení vsi** při prvním vstupu na `/game`: jméno vsi (hra nabídne staročeské), umístění
   první zemnice (půdorys u kurzoru), vybarvení čtverců prvního pole, potvrzení.
2. **Panel vsi** (vlevo nahoře): jméno, lidé (děti / dospělí / starší), domácnosti (typ,
   obsazenost, plná / přeplněná, stav), zásoby obilí a na kolik měsíců, nasycení, volná společná
   práce za den, rozestavěné stavby s průběhem, posledních ~8 událostí kroniky.
3. **Nabídka staveb:** Zemnice, Polozemnice (cena v člověkodnech; zašedlé s důvodem, dokud
   `canStartNewDwelling` neplatí), Pole (cena za ha louky).
4. **Umístění obydlí:** půdorys u kurzoru, zelený / červený s důvodem, Q/E otáčí, klik potvrdí,
   Esc zruší. **Pole** (iterace 2 – po čtvercích, políčkách krajiny): klik přepne čtverec, tažení
   přidá obdélník, Shift + tažení nebo pravý klik ubere, Backspace vrátí tah, Enter / Potvrdit
   potvrdí, Esc zruší; krajina se posouvá prostředním tlačítkem, mezerníkem + tažením nebo WASD.
   Během malování mřížka kolem kurzoru, počet čtverců, výměra, průměrná úrodnost, cena.
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
export function fieldPartsFromCells(
  landscape: Landscape,
  village: PlacementVillage | null,
  cells: TileCell[],
  dwellingPositions: Position[],
): {
  cells: TileCell[];
  parts: PartInput[];
  areaM2: number;
  averageFertility: number;
  foundingCost: number;
  blockedCells: TileCell[];
  check: PlacementCheck;
}; // díl = celé políčko; voda, les (zatím), překryv, 800 m, jeden celek stranou, ≥ 0,1 ha
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
    parts: { cell: TileCell; x: number; z: number; size: number; stage: PartStage }[];
  }[];
}
export type PartStage =
  'founding' | 'ready' | 'sown' | 'young-fallow' | 'meadow' | 'young-growth' | 'shrub' | 'forest';
// actions: getVillageView(): VillageView | null; foundVillage({ name, dwelling, fieldCells });
// placeDwelling({ type, position }); placeField({ cells }) – vrací VillageView nebo { error }
```

**Scéna (`apps/web/lib/scene/`):** `LandscapeScene.setVillage(village: SceneVillage)` (inkrementálně,
bez přestavby krajiny), `LandscapeScene.startPlacement(mode, handlers)` s `mode` =
`{ kind: 'dwelling'; type; check(position): PlacementCheck }` nebo
`{ kind: 'field'; preview(cells): { check: PlacementCheck; label: string; blockedCells } }` a
`handlers = { onConfirm(result), onCancel() }`; `cancelPlacement()`, `confirmPlacement()`
(tlačítko Potvrdit u pole).
