// Stavby a jejich dokončování – investice práce, zakládání dílů, dokončení staveb, přestavby obydlí.
import type { Landscape, ObstacleLayer } from '../landscape';
import { constructionLaborFactor, constructionWoodShare } from './carpentry';
import { villageCemeteries } from './cemetery';
import { newWorkshop } from './crafts';
import { decayEmptyDwelling, rebuildType, wantsRebuild, yearlyCommonLabor } from './dwellings';
import { settleNewDwelling } from './households';
import {
  clearingFellCost,
  clearingNeedToday,
  clearingStage,
  clearingWorkOrder,
  fellDueTrees,
  partCenter,
} from './forest-clearing';
import { finishArd, finishPen } from './oxen';
import { recordClearedObstacles } from './obstacles';
import { mergeRoadChains } from './paths/roads';
import { roadWalk, walkGroundOf } from './paths/walking';
import { finishRoadApples, workRoadApples, roadApplesNeed } from './road-apples';
import { finishRoadUpgrade } from './road-upgrades';
import { demolitionNeed, finishDemolition, isDemolitionFinished } from './demolition';
import { finishRepair, isRepairFinished, repairNeed, workRepair } from './repair';
import { copyPlot, relocationPlot } from './plots';
import { finishThreshingFloor } from './threshing-floors';
import { finishFortification, workFortification } from './fortifications';
import { type ConstructionWork } from './labor-report';
import { isOrchardPlanted, orchardPlantingNeed, plantOrchard } from './orchard';
import { moveRelocatedHousehold, relocatingHouseholds } from './relocation';
import { villageManorId } from './manor';
import { finishTrail } from './trail';
import { finishWagonRoad } from './wagon-road';
import { recordRuins } from './ruins';
import { dwellingBuildLabor, workshopBuildLabor, workshopTrees } from './rules';
import type {
  ChronicleEvent,
  Construction,
  ConstructionKind,
  Dwelling,
  FieldPart,
  VillageState,
} from './types';
import {
  addLogs,
  fellAsWorked,
  logsFromClearedTrees,
  planDwellingWood,
  takeWood,
  woodFellingCost,
  woodSupply,
} from './wood';
import { fieldGridOf } from './squares';
import { stewardRelocate } from './steward-rebuild';
import { isStewardBuilt, markStewardBuilt } from './steward-state';
import { clearWoodAt } from './woods';
import { forestBonusUntil, occupiedDwellings } from './simulate-plan';

/**
 * Opuštěná obydlí se neopravují ani nepřestavují: rozestavěná přestavba prázdného obydlí se
 * opustí (nebere společnou práci, klády, které vzala z hromady, se na ni vrátí, vyhrazené stromy
 * se uvolní), obydlí chátrá rychleji než obydlené (`decayEmptyDwelling`) a na nule zanikne.
 */
export function decayEmptyDwellings(state: VillageState, day: number, occupied: Set<number>): void {
  state.constructions = state.constructions.filter((c) => {
    const abandoned = c.kind === 'rebuild' && c.dwellingId !== null && !occupied.has(c.dwellingId);
    if (abandoned && c.wood) addLogs(state, c.wood.fromPile, c.position);
    return !abandoned;
  });
  const gone = new Set<number>();
  for (const d of state.dwellings) {
    if (occupied.has(d.id)) continue;
    decayEmptyDwelling(d, day);
    if (d.condition <= 0) gone.add(d.id);
  }
  if (gone.size === 0) return;
  // na místě zaniklého obydlí zůstane zbytek jámy (ruins.ts)
  recordRuins(
    state,
    state.dwellings.filter((d) => gone.has(d.id)),
    day,
  );
  state.dwellings = state.dwellings.filter((d) => !gone.has(d.id));
}

/**
 * Kolik práce stavbě dnes chybí; pole = dnešní práce jeho nehotových dílů (díl v lese jen
 * zbytek fáze – kácení, nebo pálení; schnoucí díl nic – forest.md, Klučení lesa pro pole), sad =
 * zbývající výsadba (jen v oknech výsadby – mimo ně stavba čeká).
 */
export function constructionNeed(
  state: VillageState,
  c: Construction,
  day: number,
  founding: FoundingIndex,
): number {
  if (c.kind === 'orchard') return orchardPlantingNeed(state, c, day);
  // jabloně u cesty se sázejí jen v oknech jara a podzimu (roads.md)
  if (c.kind === 'road-apples') return roadApplesNeed(c, day);
  // oprava stavby, která mezitím přestala stát, práci nebere (abandonment.md – Oprava)
  if (c.kind === 'repair') return repairNeed(state, c);
  // bourání stavby, která mezitím zanikla, práci nebere (demolition.md – Bourání)
  if (c.kind === 'demolition') return demolitionNeed(state, c);
  if (c.kind !== 'field') return Math.max(0, c.cost - c.done);
  return foundingParts(founding, c).reduce((sum, p) => sum + clearingNeedToday(p, day), 0);
}

/**
 * Zakládané díly po polích (v pořadí dílů ve stavu) – jeden průchod díly na krok místo průchodu
 * na každou stavbu pole (s tisíci dílů to byla třetina času simulace). Bez stavby pole prázdné.
 */
export type FoundingIndex = ReadonlyMap<number, readonly FieldPart[]>;

export function foundingIndex(state: VillageState): FoundingIndex {
  const byField = new Map<number, FieldPart[]>();
  if (!state.constructions.some((c) => c.kind === 'field')) return byField;
  for (const p of state.parts) {
    if (p.state !== 'founding') continue;
    const list = byField.get(p.fieldId);
    if (list) list.push(p);
    else byField.set(p.fieldId, [p]);
  }
  return byField;
}

/** Zakládané díly stavby pole – stav znovu, protože založení mění díl na připravený. */
export function foundingParts(founding: FoundingIndex, c: Construction): FieldPart[] {
  if (c.fieldId === null) return [];
  return (founding.get(c.fieldId) ?? []).filter((p) => p.state === 'founding');
}

/**
 * Společná práce rovným dílem do rozestavěných staveb: stavba, které stačí méně, si vezme jen
 * to, co potřebuje, a zbytek se znovu rozdělí mezi ostatní; co zbude po všech, propadne.
 * Vrátí, kolik práce šlo do které stavby (rozdělení práce dne pro scénu – labor-report.ts).
 * `carpentry` = pokrytí dřevěné práce tesařem (wagons.md – Tesař): práce stavby se násobí
 * `constructionLaborFactor` – stejná práce s tesařem postaví víc (bez tesaře 1). `only` = jen
 * stavby toho druhu (robota hostů napřed do opevnění – `work`).
 */
export function build(
  state: VillageState,
  day: number,
  common: number,
  carpentry = 0,
  only?: ConstructionKind,
): ConstructionWork[] {
  const founding = foundingIndex(state);
  // díl louky, který ves se spřežením zakládá bez překážek, práci nepotřebuje – založí se hned
  // (drn rozorá první orba – oxen.md, Jen rádlo); díl v lese s fázemi se zakládá až dohořením
  for (const c of state.constructions) {
    if (c.kind !== 'field' || (only !== undefined && only !== 'field')) continue;
    for (const part of foundingParts(founding, c)) {
      if (!part.clearing && part.foundingCost - part.foundingDone <= 0) {
        foundPart(state, day, part);
      } else if (
        part.clearing &&
        part.clearing.felledDay === undefined &&
        clearingStage(part, day) !== 'fell'
      ) {
        // pojistka: díl s nulovou prací kácení by bez zápisu pádu schnul navždy
        fellDueTrees(state, part, day);
      }
    }
  }
  let active = state.constructions
    .filter((c) => only === undefined || c.kind === only)
    .map((c) => {
      const factor = constructionLaborFactor(c, carpentry);
      return { c, factor, need: constructionNeed(state, c, day, founding) * factor };
    })
    .filter((x) => x.need > 0);
  const invested: ConstructionWork[] = [];
  const put = (
    x: { c: Construction; factor: number },
    amount: number,
    completes: boolean,
  ): void => {
    invested.push({
      construction: x.c,
      manDays: amount,
      doneBefore: x.c.done,
      felledBefore: x.c.wood?.felled ?? 0,
    });
    invest(state, day, x.c, amount / x.factor, completes, founding);
  };
  let left = common;
  while (active.length > 0 && left > 0) {
    const share = left / active.length;
    const saturated = active.filter((x) => x.need <= share);
    if (saturated.length === 0) {
      for (const x of active) put(x, share, false);
      return invested;
    }
    for (const x of saturated) {
      put(x, x.need, true);
      left = Math.max(0, left - x.need);
    }
    active = active.filter((x) => x.need > share);
  }
  return invested;
}

/**
 * Dřevěná práce staveb dne (čd bez tesaře – wagons.md, Tesař): kolik z `common` práce rozdělené
 * rovným dílem jako ve `build` připadne na dřevěné části staveb. Stav nemění.
 */
export function woodworkToday(state: VillageState, day: number, common: number): number {
  const founding = foundingIndex(state);
  let active = state.constructions
    .map((c) => ({
      share: constructionWoodShare(c),
      need: constructionNeed(state, c, day, founding),
    }))
    .filter((x) => x.need > 0);
  let wood = 0;
  let left = common;
  while (active.length > 0 && left > 0) {
    const share = left / active.length;
    const saturated = active.filter((x) => x.need <= share);
    if (saturated.length === 0) {
      for (const x of active) wood += x.share * share;
      return wood;
    }
    for (const x of saturated) {
      wood += x.share * x.need;
      left = Math.max(0, left - x.need);
    }
    active = active.filter((x) => x.need > share);
  }
  return wood;
}

/** Vloží práci do stavby; `completes` = dostala vše, co jí chybělo. */
export function invest(
  state: VillageState,
  day: number,
  c: Construction,
  amount: number,
  completes: boolean,
  founding: FoundingIndex,
): void {
  if (c.kind === 'orchard') {
    plantOrchard(state, day, c, amount, completes);
    return;
  }
  if (c.kind === 'road-apples') {
    workRoadApples(state, day, c, amount, completes);
    return;
  }
  if (c.kind === 'repair') {
    // stav opravované stavby roste s prací (abandonment.md – Oprava)
    workRepair(state, c, amount, completes);
    return;
  }
  if (c.kind !== 'field') {
    c.done = completes ? c.cost : Math.min(c.cost, c.done + amount);
    // dřevo se kácí jako první část práce stavby (forest.md)
    fellAsWorked(state, c, day);
    // opevnění: úseky, na které došla práce, stojí hned (fortifications.md – Cena a stavba)
    if (c.kind === 'fortification') workFortification(state, c, day);
    return;
  }
  // pole zakládá díly od nejbližšího k obydlí, v lese napřed pálí suché díly a pak kácí
  // (forest.md – Rozdělení práce); přebytek dne teče do dalšího dílu. `completes` znamená, že
  // pole dostalo celou dnešní potřebu – kácený díl dostane jen zbytek kácení (stromy padnou,
  // pak schne), založí se jen díl, který dnes dohoří (nebo díl bez fází)
  let left = amount;
  let used = 0;
  const parts = foundingParts(founding, c);
  for (const part of clearingWorkOrder(parts, day)) {
    const felling = clearingStage(part, day) === 'fell';
    const need = clearingNeedToday(part, day);
    if (completes || left >= need) {
      left -= need;
      used += need;
      if (felling) {
        part.foundingDone = clearingFellCost(part);
        fellDueTrees(state, part, day);
      } else {
        foundPart(state, day, part);
      }
    } else {
      part.foundingDone += left;
      used += left;
      if (felling) fellDueTrees(state, part, day);
      break;
    }
  }
  // průběh stavby jen z jejích dílů – pole mohlo mít díly založené dřív (rozšíření, sloučení)
  c.done = Math.min(c.cost, c.done + used);
}

/** Díl pole je založený (mutuje stav). */
export function foundPart(state: VillageState, day: number, part: FieldPart): void {
  part.foundingDone = part.foundingCost;
  part.state = 'ready';
  if (part.surface === 'forest') part.bonusUntilDay = forestBonusUntil(day);
  // díl v lese s fázemi dnes dohořel (forest.md – Klučení lesa pro pole – postup, bod 3): stromy,
  // které ještě stály, padnou s kládou na hromadu u lesa; pařezy a padlé stromy shořely – jejich
  // záznamy kácení zmizí (odstranění má přednost, seznam neroste); bonus popela běží od dneška
  if (part.clearing) {
    fellDueTrees(state, part, day);
    const burnt = new Set([...(part.obstacles ?? []), ...part.clearing.fell.map((t) => t.id)]);
    if (state.felledTrees) state.felledTrees = state.felledTrees.filter((f) => !burnt.has(f.id));
    // trasy vidí paseku jako les až do dohoření celého pole (forest.md – Klučení – trasy)
    const site = state.constructions.find((c) => c.kind === 'field' && c.fieldId === part.fieldId);
    if (site) site.burntObstacles = [...(site.burntObstacles ?? []), ...burnt];
    part.burnedDay = day;
    delete part.clearing;
  }
  // založený díl: stromy, kameny a keře z něj zmizí natrvalo (fields.md – Zakládání),
  // dospělé stromy dají klády na hromadu (forest.md – Mýcení)
  if (part.obstacles) {
    recordClearedObstacles(state, part.obstacles, day);
    delete part.obstacles;
  }
  if (part.trees) {
    addLogs(state, logsFromClearedTrees(part.trees), partCenter(state, part), part.fieldId);
    delete part.trees;
  }
  // pole vymýtilo les vsi na čtverci (fields.md – Les vsi) – stromy zmizely s překážkami
  if (part.cell) clearWoodAt(state, part.cell, fieldGridOf(state, part.fieldId));
}

// --- stavby a domácnosti ------------------------------------------------------------------

/**
 * Dostavěná stavba správce předá značku „postavil správce“ tomu, co z ní vzniklo (pole, ohrada,
 * hřbitov, sad, cesty; obydlí viz `finishConstructions`), jen když stavba entitu sama založila
 * (`Construction.extends` ji nepřenáší; přestavba a oprava nic) – steward.md – Stav správce.
 */
function inheritStewardMark(state: VillageState, c: Construction): void {
  if (!isStewardBuilt(state, c.id)) return;
  // přestavba a oprava se týkají hráčova domu, rozšíření pole, ohrady a hřbitova hráčova celku
  if (c.kind === 'rebuild' || c.kind === 'repair') return;
  const entities = c.extends ? [] : [c.fieldId, c.cemeteryId, c.orchardId, c.penId];
  const ids = [...entities, ...(c.roadIds ?? [])];
  for (const id of ids) if (id !== null && id !== undefined) markStewardBuilt(state, id);
}

export function isFinished(state: VillageState, c: Construction, founding: FoundingIndex): boolean {
  if (c.kind === 'field') return foundingParts(founding, c).length === 0;
  if (c.kind === 'orchard') return isOrchardPlanted(state, c);
  if (c.kind === 'repair') return isRepairFinished(state, c);
  if (c.kind === 'demolition') return isDemolitionFinished(state, c);
  return c.done >= c.cost;
}

/**
 * Krok 4: dokončené stavby – nové obydlí, přestavěné obydlí, založené pole, vysazený (obnovený)
 * sad, pohřebiště a opravená stavba (abandonment.md – Oprava). První zemnice dostane id
 * domácnosti zakladatelů (`dwellingId` stavby) – ti už v ní bydlí, nikdo se nestěhuje. Do jiného
 * nového obydlí se stěhuje mladý pár; když žádný není, osídlí ho ještě týž den dospělé děti
 * z přeplněné domácnosti (krok 6).
 */
export function finishConstructions(state: VillageState, day: number): void {
  const unfinished: Construction[] = [];
  const founding = foundingIndex(state);
  let roadUpgraded = false;
  for (const c of state.constructions) {
    if (!isFinished(state, c, founding)) {
      unfinished.push(c);
      continue;
    }
    inheritStewardMark(state, c);
    if (c.kind === 'field' || c.kind === 'orchard') {
      // obnova sadu má zápis v kronice při zahájení (orchard.md – Obnova sadu)
      if (!c.renewal) state.chronicle.push(finishedEvent(day, c, null));
      continue;
    }
    if (c.kind === 'cemetery') {
      finishCemetery(state, day, c);
      state.chronicle.push(finishedEvent(day, c, null));
      continue;
    }
    if (c.kind === 'demolition') {
      // zbouraná stavba zmizí a dá klády na hromadu (demolition.md – Bourání)
      const demolished = finishDemolition(state, day, c);
      if (demolished) state.chronicle.push(demolished);
      continue;
    }
    if (c.kind === 'repair') {
      // opravená stavba je celá – „Modla opravena“ ap. (abandonment.md – Oprava)
      const repaired = finishRepair(state, day, c);
      if (repaired) state.chronicle.push(repaired);
      continue;
    }
    if (c.kind === 'road' && c.earthwork !== undefined) {
      // dostavěná vozová cesta (roads.md – Vozová cesta) – úseky jsou cestou od dostavění
      finishWagonRoad(state, c, day);
      state.chronicle.push({
        day,
        kind: 'construction-finished',
        constructionKind: c.kind,
        dwellingId: null,
        fieldId: null,
        wagon: true,
      });
      roadUpgraded = true;
      continue;
    }
    if (c.kind === 'road' && c.trail !== undefined) {
      // dostavěná zemská stezka – obchod se sousedem (trade.md)
      state.chronicle.push(...finishTrail(state, c, day));
      continue;
    }
    if (c.kind === 'road') {
      // vylepšená pevná cesta – rychlejší chůze (roads.md); vzdálenosti chůze se přepočítají
      finishRoadUpgrade(state, c);
      state.chronicle.push(finishedEvent(day, c, null));
      roadUpgraded = true;
      continue;
    }
    if (c.kind === 'road-apples') {
      // jabloně podél cesty vysazené – péče a sklizeň se sady (roads.md)
      finishRoadApples(state, c, day);
      state.chronicle.push(finishedEvent(day, c, null));
      continue;
    }
    if (c.kind === 'pen' || c.kind === 'ard') {
      // dostavěná ohrada přijme dobytek, hotové rádlo orá s párem vycvičených volů (oxen.md)
      if (c.kind === 'pen' && c.penId !== null && c.penId !== undefined) {
        // založení celé ohrady, nebo rozšíření o čtverce (oxen.md – Ohrady podle druhu)
        finishPen(state, c.penId, day, c.id);
      }
      if (c.kind === 'ard') finishArd(state);
      state.chronicle.push(finishedEvent(day, c, null));
      continue;
    }
    if (c.kind === 'fortification') {
      // dostavěné opevnění, vylepšení na palisádu nebo nástavba na valu (fortifications.md)
      finishFortification(state, c, day);
      state.chronicle.push(finishedEvent(day, c, null));
      continue;
    }
    if (c.kind === 'threshing-floor') {
      // dostavěné humno – mlátí se na něm (production-chains.md – Humno)
      finishThreshingFloor(state, c, day);
      state.chronicle.push(finishedEvent(day, c, null));
      continue;
    }
    if (c.kind === 'idol' || c.kind === 'shrine') {
      // dostavěná modla nebo svatyně – přidává štěstí (happiness.md)
      if (c.position !== null) {
        (state.sacredBuildings ??= []).push({
          id: c.id,
          kind: c.kind,
          position: { ...c.position },
          builtDay: day,
        });
      }
      state.chronicle.push(finishedEvent(day, c, null));
      continue;
    }
    if (c.dwellingType === null) throw new Error(`Stavba ${c.id} nemá typ obydlí.`);
    if (c.kind === 'rebuild') {
      const dwelling = state.dwellings.find((d) => d.id === c.dwellingId);
      if (dwelling) {
        // přestavba jinde: starý dům se zboří – na jeho místě zůstane zbytek jámy (ruins.ts)
        if (c.plot && c.position) recordRuins(state, [dwelling], day);
        dwelling.type = c.dwellingType;
        dwelling.builtDay = day;
        dwelling.condition = 1;
        // přestavba na pozemku jinde (polozemnice bez pozemku) – domácnost se přestěhuje
        if (c.plot && c.position) {
          dwelling.position = { ...c.position };
          dwelling.plot = copyPlot(c.plot);
          if (c.forestDistanceM !== undefined) dwelling.forestDistanceM = c.forestDistanceM;
          // nový dům na novém místě má svou variantu rozměrů (population.md – Varianty rozměrů)
          delete dwelling.plainShape;
        }
      }
      state.chronicle.push(finishedEvent(day, c, c.dwellingId));
      continue;
    }
    if (c.position === null) throw new Error(`Stavba obydlí ${c.id} nemá polohu.`);
    const dwelling: Dwelling = {
      id: c.dwellingId ?? state.nextId++,
      type: c.dwellingType,
      builtDay: day,
      condition: 1,
      position: { ...c.position },
      ...(c.plot ? { plot: copyPlot(c.plot) } : {}),
      ...(c.forestDistanceM === undefined ? {} : { forestDistanceM: c.forestDistanceM }),
      ...(c.plainShape ? { plainShape: true as const } : {}),
      // řemeslná dílna – řemeslo patří budově (crafts.md); nový řemeslník se teprve učí
      // (crafts.md – Učení řemesla)
      ...(c.craft
        ? { workshop: { ...newWorkshop(c.craft, c.waterDistanceM), skillTracked: true as const } }
        : {}),
    };
    state.dwellings.push(dwelling);
    if (isStewardBuilt(state, c.id)) markStewardBuilt(state, dwelling.id);
    state.chronicle.push(finishedEvent(day, c, dwelling.id));
    // přestěhování: domácnost se přestěhuje do nového domu, starý zůstane prázdný (migration.md);
    // jinak nové obydlí osídlí rodina ženatého syna (kinship.md – Domácnosti)
    if (c.relocates !== undefined) moveRelocatedHousehold(state, day, c, dwelling.id);
    else if (c.dwellingId === null) settleNewDwelling(state, day, dwelling.id);
  }
  state.constructions = unfinished;
  // vylepšený úsek se stejným stupněm jako soused v uzlu bez odbočky se s ním spojí (roads.md)
  if (roadUpgraded && state.roads) mergeRoadChains(state.roads, state.constructions, state.trails);
}

/**
 * Dokončené založení hřbitova (hřbitov přijímá mrtvé), nebo rozšíření (jeho čtverce se začnou
 * počítat – stavba je pozná podle `constructionId`). Překážky na dostavěných čtvercích zmizí
 * natrvalo jako u založeného dílu pole (fields.md – Zakládání).
 */
export function finishCemetery(state: VillageState, day: number, c: Construction): void {
  const cemetery = villageCemeteries(state).find((x) => x.id === c.cemeteryId);
  if (!cemetery) return;
  const extension = cemetery.squares.filter((s) => s.constructionId === c.id);
  const finished =
    extension.length > 0
      ? extension
      : cemetery.squares.filter((s) => s.constructionId === undefined);
  for (const square of finished) {
    if (square.trees) {
      addLogs(state, logsFromClearedTrees(square.trees), square);
      delete square.trees;
    }
    if (!square.obstacles) continue;
    recordClearedObstacles(state, square.obstacles, day);
    delete square.obstacles;
  }
  if (extension.length === 0) {
    cemetery.builtDay = day;
    return;
  }
  for (const square of extension) delete square.constructionId;
}

export function finishedEvent(
  day: number,
  c: Construction,
  dwellingId: number | null,
): ChronicleEvent {
  return {
    day,
    kind: 'construction-finished',
    constructionKind: c.kind,
    dwellingId,
    fieldId: c.kind === 'field' ? c.fieldId : null,
    ...(c.craft && c.kind === 'dwelling' ? { craft: c.craft } : {}),
  };
}

/**
 * Krok 5: obyvatelé dožilého obydlí se rozhodnou ho přestavět (rozhoduje stáří – obydlený dům
 * nechátrá). Přestavba bere
 * dřevo jako nová stavba (forest.md): klády z hromady, zbytek vyhradí mezi nejbližšími dospělými
 * stromy k obydlí. Nezastaví ji ani nedostatek dřeva – vezme, co je. Polozemnice bez pozemku
 * (i zemnice přestavovaná na polozemnici) se s krajinou staví na nejbližším volném políčku
 * s pozemkem (`relocationPlot`, Martin 18. 10. 2026): překážky na něm zmizí hned (klády na
 * hromadu, práce navíc jako u nové stavby), po dostavění se domácnost přestěhuje. Dílna se přestaví na
 * stejnou dílnu na místě (crafts.md – přestavba zachová řemeslo) za cenu nové dílny.
 */
export function decideRebuilds(
  state: VillageState,
  day: number,
  obstacles: ObstacleLayer | null,
  landscape: Landscape | null,
): void {
  const rebuilding = new Set(
    state.constructions.filter((c) => c.kind === 'rebuild').map((c) => c.dwellingId),
  );
  // domácnost, která si staví nový dům, starý nepřestavuje (migration.md)
  for (const household of relocatingHouseholds(state)) rebuilding.add(household);
  // „má na to“ podle ročního průměru – v zimě (výmlat) ani o žních ves nezchudne (Martin)
  const yearlyCommon = yearlyCommonLabor(state);
  const manorId = villageManorId(state);
  for (const d of occupiedDwellings(state)) {
    if (rebuilding.has(d.id) || !wantsRebuild(d, day)) continue;
    // dílna zůstane dílnou stejného typu na svém místě (crafts.md), dvorec vojvody se přestaví na
    // dvorec (trade.md), ostatní podle práce a dřeva
    const craft = d.workshop?.craft;
    // dřevo: klády na hromadě a stromy, které jde skácet – po předchozích přestavbách dne
    const type = craft
      ? d.type
      : d.id === manorId
        ? 'dvorec'
        : rebuildType(d.type, yearlyCommon, woodSupply(state, obstacles, day));
    // obydlí správce na konci životnosti: když se vyplatí, správce ho přestěhuje na lepší slot
    // plánu místo přestavby na místě (steward.md – Přestavba vlastních staveb)
    if (landscape && obstacles && !craft && type !== 'dvorec' && d.id !== manorId) {
      if (stewardRelocate(state, d, type, day, landscape, obstacles)) continue;
    }
    // nový pozemek: polozemnice bez pozemku, dvorec bez pozemku se dvorem (dvě políčka)
    const needsSite = !d.plot || (type === 'dvorec' && !d.plot.yard);
    const site =
      landscape && obstacles && needsSite && !craft
        ? relocationPlot(state, landscape, obstacles, d, type, day)
        : null;
    // kácení chůzí po pevných cestách (roads.md) – jen s krajinou
    const walk = landscape ? roadWalk(state.roads?.roads ?? [], walkGroundOf(landscape)) : null;
    const plan = planDwellingWood(state, type, site?.position ?? d.position, day, {
      obstacles,
      ...(walk ? { walk } : {}),
      ...(craft ? { trees: workshopTrees(craft) } : {}),
      ...(site
        ? { clearedTrees: site.check.clearedTrees, clearedIds: site.check.obstacleIds }
        : {}),
    });
    if (site) recordClearedObstacles(state, site.check.obstacleIds, day);
    const wood = takeWood(state, plan);
    state.constructions.push({
      id: state.nextId++,
      kind: 'rebuild',
      startedDay: day,
      cost:
        (craft ? workshopBuildLabor(craft) : dwellingBuildLabor(type)) +
        (site?.check.obstacleCost ?? 0) +
        woodFellingCost(wood),
      done: 0,
      dwellingType: type,
      position: site ? { ...site.position } : null,
      ...(site ? { plot: site.plot, forestDistanceM: site.forestDistanceM } : {}),
      dwellingId: d.id,
      fieldId: null,
      wood,
    });
    state.chronicle.push({ day, kind: 'rebuild-decided', dwellingId: d.id, type });
  }
}

// --- sklizeň a jídlo --------------------------------------------------------------------
