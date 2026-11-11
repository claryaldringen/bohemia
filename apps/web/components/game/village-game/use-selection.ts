'use client';

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { setE2EHook } from '@/lib/e2e-hooks';
import type { DraftFigureState } from '@/lib/draft-activity';
import type { PersonFigureState } from '@/lib/person-activity';
import type { LandscapeScene } from '@/lib/scene/landscape-scene';
import type { VillageTarget } from '@/lib/scene/village-picking';
import {
  describeTarget,
  followConstruction,
  nextSelection,
  presentTarget,
} from '@/lib/scene/village-selection';
import type { SceneVillage, VillageView } from '@/lib/village-view';

export interface Selection {
  /** Cíl vybraný hráčem (osoba, stavba, díl, skupina obydlí); null – nic. */
  selected: VillageTarget | null;
  setSelected: (target: VillageTarget | null) => void;
  /** Vybraný cíl, který ve vsi ještě je (`presentTarget`) – ten dostane scéna i panel výběru. */
  current: VillageTarget | null;
  /** Co dělá vybraný člověk (hlásí scéna). */
  personState: PersonFigureState | null;
  /** Co dělá vybrané spřežení nebo vůz a kdo je u nich (hlásí scéna). */
  draftState: DraftFigureState | null;
  /** Poslední ves scény pro obsluhy kláves a umisťování – čte se až při volání. */
  sceneVillageRef: RefObject<SceneVillage>;
  /** Obrys obydlí dílu syna vojvody vybraného v panelu dvorce (null – výběr). */
  setSonPreview: (dwellingIds: readonly number[] | null) => void;
}

/**
 * Výběr ve vsi (web-ui.md – Výběr; fields.md, villagers.md – Co hráč vidí): klik do scény
 * (Ctrl / Shift přidá nebo ubere obydlí, klik na pole či sad vybere díl, dvojklik celé),
 * dostavěné staveniště předá výběr hotové stavbě, zaniklý cíl se zruší. Scéna dostane výběr,
 * nebo obrys domů syna vojvody z panelu dvorce.
 */
export function useSelection({
  scene,
  sceneVillage,
  viewRef,
}: {
  scene: LandscapeScene | null;
  sceneVillage: SceneVillage;
  viewRef: RefObject<VillageView | null>;
}): Selection {
  const [selected, setSelected] = useState<VillageTarget | null>(null);
  // Výběr kliknutím do scény (s Ctrl / Shift přidá nebo ubere obydlí; klik na pole či sad vybere
  // díl, dvojklik celé – fields.md, Co hráč vidí); zaniklý cíl (dostavěné staveniště, zarostlé
  // pole) se zruší, z víc obydlí zbydou jen ta, která ještě stojí.
  useEffect(
    () =>
      scene?.onSelect((target, additive, double) => {
        // typ a id objektu pod kurzorem do konzole (Martin 24. 10. 2026)
        if (target)
          console.info(
            '[výběr]',
            describeTarget(target, sceneVillageRef.current, viewRef.current?.roads),
          );
        setSelected((prev) => nextSelection(prev, target, additive, double));
      }),
    [scene, viewRef],
  );
  // Dostavěné staveniště (jako v 0 A.D.): výběr přejde ze základů na hotové obydlí hned při
  // obnovení vsi – už během vykreslení, ať panel výběru neblikne (web-ui.md – Výběr)
  const [selectionScene, setSelectionScene] = useState(sceneVillage);
  if (selectionScene !== sceneVillage) {
    setSelectionScene(sceneVillage);
    const built = selected && followConstruction(selectionScene, sceneVillage, selected);
    if (built) setSelected(built);
  }
  const current = useMemo(() => presentTarget(sceneVillage, selected), [sceneVillage, selected]);
  // co dělá vybraný člověk – hlásí scéna při změně (villagers.md – Výběr postavy)
  const [personState, setPersonState] = useState<PersonFigureState | null>(null);
  useEffect(
    () =>
      scene?.onPersonState((state) => {
        setPersonState(state);
        // vybraná postava zašla do domu – výběr se zruší (villagers.md – Výběr postavy; vojvoda ne)
        if (state?.indoors) {
          setSelected((prev) => (prev?.kind === 'person' && prev.id === state.id ? null : prev));
        }
      }),
    [scene],
  );
  // co dělá vybrané spřežení nebo vůz a kdo je u nich (oxen.md, wagons.md – Výběr)
  const [draftState, setDraftState] = useState<DraftFigureState | null>(null);
  useEffect(() => scene?.onDraftState(setDraftState), [scene]);
  const sceneVillageRef = useRef(sceneVillage);
  useEffect(() => {
    sceneVillageRef.current = sceneVillage;
  }, [sceneVillage]);
  // obrys obydlí dílu syna vojvody vybraného v panelu dvorce (lord.md – Dělení vsi)
  const [sonPreview, setSonPreview] = useState<readonly number[] | null>(null);
  useEffect(() => {
    scene?.setSelection(sonPreview ? { kind: 'dwellings', ids: sonPreview } : current);
  }, [scene, current, sonPreview]);

  useEffect(() => {
    setE2EHook('selectPerson', (id) => setSelected({ kind: 'person', id }));
    setE2EHook('selectRoad', (id) => setSelected({ kind: 'road', id }));
    return () => {
      setE2EHook('selectPerson', undefined);
      setE2EHook('selectRoad', undefined);
    };
  }, []);

  return {
    selected,
    setSelected,
    current,
    personState,
    draftState,
    sceneVillageRef,
    setSonPreview,
  };
}
