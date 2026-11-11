import { moveParts } from '../buildings/land-taken';
import { NO_CRAFTS } from '../core/productivity';
import { WILDLIFE_LAND } from '../rules/rules-wildlife';
import type { VillageState } from '../types';
import { freshWildlife } from '../wildlife/wildlife';
import { dropSeasonCrop, seasonCrop, springCrop } from '../core/year-plan';

/**
 * Ves, ve které první zemnice už stojí – jako vsi uložené dřív, než si ji zakladatelé začali
 * stavět sami (zemnice stála od založení, 17. 10. 2026). Stavba první zemnice zmizí a obydlí
 * dostane id domácnosti zakladatelů; zbytek stavu zůstane, jak je.
 */
export function withBuiltFirstDwelling(state: VillageState): VillageState {
  const next = structuredClone(state);
  const founding = next.constructions.find((c) => c.kind === 'dwelling' && c.dwellingId !== null);
  if (!founding || founding.dwellingId === null) return next;
  if (founding.dwellingType === null || founding.position === null) {
    throw new Error('Stavba první zemnice nemá typ nebo polohu.');
  }
  next.constructions = next.constructions.filter((c) => c !== founding);
  next.dwellings.unshift({
    id: founding.dwellingId,
    type: founding.dwellingType,
    builtDay: next.foundedDay,
    condition: 1,
    position: { ...founding.position },
  });
  return next;
}

/**
 * Dvorec vojvody jinde (trade.md): přidá prázdné starší obydlí daleko od vsi a udělá z něj dvorec
 * – první zemnice zakladatelů se pak přestavuje jako každé obyčejné obydlí (testy přestavby na
 * lepší obydlí).
 */
export function withManorElsewhere(state: VillageState): VillageState {
  const next = structuredClone(state);
  const id = next.nextId++;
  next.dwellings.push({
    id,
    type: 'zemnice',
    builtDay: next.foundedDay,
    condition: 1,
    position: { x: 400, z: 400, rotation: 0 },
  });
  next.manorId = id;
  return next;
}

/**
 * Ves s velkými hotovými ohradami ovcí, koz, prasat a skotu (4 čtverce každá, daleko od vsi) –
 * stáda pak kapacita ohrad neomezí (oxen.md – Ohrady podle druhu); pro testy pravidel stád, které
 * na ohradách nestojí. Mutuje stav.
 */
export function withRoomyPens(state: VillageState): VillageState {
  const species = ['sheep', 'goat', 'pig', 'cattle'] as const;
  state.pens = species.map((s, k) => {
    const y = 100 + k * 3;
    const square = (
      x: number,
      dy: number,
    ): { cell: { x: number; y: number }; x: number; z: number } => ({
      cell: { x, y: y + dy },
      x: x * 15,
      z: (y + dy) * 15,
    });
    const first = square(100, 0);
    return {
      id: 50_000 + k,
      species: s,
      ...first,
      extraSquares: [square(101, 0), square(100, 1), square(101, 1)],
      builtDay: state.lastDay - 400,
      team: null,
      training: null,
    };
  });
  return state;
}

/**
 * Ves s hotovým humnem daleko od vsi (production-chains.md – Humno) – snopy se mlátí hned po žni
 * (ozim a luštěniny v srpnu, jař v září); pro testy, které na humnu nestojí a chtějí, aby ves
 * mlátila. Mutuje stav.
 */
export function withThreshingFloor(state: VillageState): VillageState {
  state.threshingFloors = [
    { id: 60_000, position: { x: -300, z: 300, rotation: 0 }, builtDay: state.foundedDay },
  ];
  return state;
}

/**
 * Ves bez ryb a zajíců (mutuje stav): vesničané nemají co chytat (wildlife.md – Drobná zvěř a ryby),
 * takže testy hladu, nečinné práce a stavby nepočítají s jídlem z vody a ok. Ostatní zvěř
 * (krajina, vlci, lišky) je výchozí.
 */
export function withoutSmallGame(state: VillageState): VillageState {
  const wildlife = state.wildlife ?? freshWildlife({ ...WILDLIFE_LAND.defaultLand }, 0);
  wildlife.fishKg = 0;
  wildlife.hares = 0;
  state.wildlife = wildlife;
  return state;
}

/**
 * Stav bez trvalých stavů z upozornění (absence.md – Upozornění vsi do kroniky): `noticeStates`
 * a zápisy `notice-began` / `notice-ended` jen zaznamenávají, simulace je nečte – zlaté otisky
 * stavu je vynechají.
 */
export function withoutNoticeChronicle(state: VillageState): VillageState {
  const next: VillageState = {
    ...state,
    chronicle: state.chronicle.filter(
      (e) => e.kind !== 'notice-began' && e.kind !== 'notice-ended',
    ),
  };
  delete next.noticeStates;
  return next;
}

/**
 * Ves bez lnu v letošní práci (mutuje): díly lnu přejdou do jaře i s hotovou prací (`moveParts`) –
 * pro testy, které počítají jen s obilím na všech osetých dílech (len na poli – fields.md, Len).
 */
export function flaxIntoSpring(state: VillageState): VillageState {
  const season = state.season;
  const flax = season ? seasonCrop(season, 'flax') : undefined;
  if (!season || !flax) return state;
  const ids = [...flax.partIds];
  moveParts(state, season, flax, springCrop(season), ids, state.lastDay, NO_CRAFTS.tools);
  for (const part of state.parts) if (ids.includes(part.id)) part.crop = 'spring';
  dropSeasonCrop(season, 'flax');
  return state;
}
