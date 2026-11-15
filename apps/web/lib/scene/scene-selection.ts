import { sameDraftState, type DraftFigureState } from '../draft-activity';
import type { PersonFigureState } from '../person-activity';
import { draftSelectionFor } from './draft-pick';
import type { VillageVillagers } from './villagers';
import type { VillageTarget } from './village-picking';
import type { DraftRenderState, VillageRenderer } from './village-renderer';

export type PersonListener = (state: PersonFigureState | null) => void;
export type DraftListener = (state: DraftFigureState | null) => void;

/** Vstupy výběru – lidé a ves vznikají až v `setLandscape`, proto přes getter. */
export interface SelectionDeps {
  villagers: () => VillageVillagers | null;
  villageRenderer: () => VillageRenderer | null;
}

/**
 * Výběr rozhraní ve scéně (villagers.md – Výběr postavy): co je vybrané a co dělá vybraný člověk,
 * spřežení nebo vůz (i s lidmi u nich) – posluchačům hned současný stav, pak jen při změně.
 * Zvýraznění na zemi kreslí `SelectionHighlight`.
 */
export class SceneSelection {
  private selected: VillageTarget | null = null;
  private readonly personListeners = new Set<PersonListener>();
  /** Poslední stav vybraného člověka (villagers.md – Výběr postavy). */
  private personState: PersonFigureState | null = null;
  private readonly draftListeners = new Set<DraftListener>();
  /** Vybrané spřežení nebo vůz (i s lidmi u nich) – stav z vsi a poslední ohlášený. */
  private draftRender: DraftRenderState | null = null;
  private draftState: DraftFigureState | null = null;

  constructor(private readonly deps: SelectionDeps) {}

  /** Co rozhraní vybralo (null = nic). */
  get target(): VillageTarget | null {
    return this.selected;
  }

  set target(target: VillageTarget | null) {
    this.selected = target;
  }

  /** Vybraný člověk vsi scény (id), nebo null – člověk jiné vsi (`villageId`) tu postavu nemá. */
  get personId(): number | null {
    return this.selected?.kind === 'person' && !this.selected.villageId ? this.selected.id : null;
  }

  onPersonState(listener: PersonListener): () => void {
    this.personListeners.add(listener);
    listener(this.personState);
    return () => this.personListeners.delete(listener);
  }

  /** Nový stav vybraného člověka od lidí ve vsi – posluchačům. */
  personChanged(state: PersonFigureState | null): void {
    this.personState = state;
    for (const listener of this.personListeners) listener(state);
  }

  onDraftState(listener: DraftListener): () => void {
    this.draftListeners.add(listener);
    listener(this.draftState);
    return () => this.draftListeners.delete(listener);
  }

  /** Nový stav vybraného spřežení nebo vozu od vsi. */
  draftChanged(state: DraftRenderState | null): void {
    this.draftRender = state;
    this.publishDraft();
  }

  /**
   * Výběr spřežení a vozu ve vsi podle výběru rozhraní: spřežení / vůz celé, člověk u nich
   * (oráč, honák, vozka – úlohu zná plán postav) kroužkem pod ním; jinak nic.
   */
  syncDraft(): void {
    const target = this.selected;
    const villagers = this.deps.villagers();
    const id = this.personId;
    const job = id !== null ? (villagers?.crewJob(id) ?? null) : null;
    this.deps.villageRenderer()?.selectDraft(draftSelectionFor(target, job));
    this.publishDraft();
  }

  dispose(): void {
    this.personListeners.clear();
    this.draftListeners.clear();
  }

  /** Stav vybraného spřežení / vozu i s lidmi u nich – posluchačům jen při změně. */
  private publishDraft(): void {
    const render = this.draftRender;
    const villagers = this.deps.villagers();
    let state: DraftFigureState | null = null;
    if (render?.kind === 'team') {
      const crew = villagers?.teamCrew(render.team) ?? null;
      state = {
        kind: 'team',
        team: render.team,
        activity: render.activity,
        ploughman: crew?.ploughman ?? null,
        leader: crew?.leader ?? null,
      };
    } else if (render?.kind === 'cart') {
      state = {
        kind: 'cart',
        cart: render.cart,
        leg: render.leg,
        loaded: render.loaded,
        hidden: render.hidden,
        drover: villagers?.cartDrover(render.cart) ?? null,
      };
    }
    if (sameDraftState(state, this.draftState)) return;
    this.draftState = state;
    for (const listener of this.draftListeners) listener(state);
  }
}
