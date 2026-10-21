/** Panel výběru obydlí, dvorce vojvody a skupiny obydlí. */
import { type ReactElement } from 'react';
import {
  type BuildableDwellingType,
  type FamilyCounts,
  Direction8,
  TradeGoods,
} from '@bohemia/game';
import { VillageTarget } from '@/lib/scene/village-picking';
import { type SelectionDetails } from '@/lib/selection-details';
import { PreviewPeople } from '@/lib/trade-quote';
import { ManorUpgrades } from '../ManorPanel';
import { TradePanel } from '../TradePanel';
import { LeaveControls, RelocateButtons, RelocationProgress } from '../RelocationControls';
import { Stat, Bar, ROW, Commands, WoodToFell } from './parts';
import { WorkshopRow, BuyingRow } from './crafts';

/** Akce panelu nad obydlími – přestěhování domácnosti a jeho zrušení (migration.md). */
export interface RelocationActions {
  /** Začne umisťovat nové domy domácností `householdIds` (postupně, jeden za druhým). */
  onRelocate?: (type: BuildableDwellingType, householdIds: readonly number[]) => void;
  /** Zruší rozestavěné stěhování (stavba nového domu) – hotovo, až se vrátí. */
  onCancelRelocation?: (constructionId: number) => Promise<void>;
  /**
   * Odejít do nové vsi (migration.md – fáze 3 a 4): na téže mapě (`here` – hráč pak umístí první
   * zemnici), nebo na novou mapu ve směru.
   */
  onLeave?: (target: 'here' | Direction8, householdIds: readonly number[]) => void;
}

/** Vylepšení vsi z dvorce vojvody (trade.md) – zemská stezka a obchod. */
export interface ManorActions {
  /** Zadá stavbu zemské stezky do směru (server action) – hotovo, až se vrátí. */
  onBuildTrail?: (direction: Direction8) => Promise<void>;
  /**
   * Vyšle výpravu k sousedovi (server action) – hotovo, až se vrátí; vrátí důvod, proč ji server
   * odmítl, nebo null (panel obchodu ho ukáže pod tlačítkem).
   */
  onSendExpedition?: (
    direction: Direction8,
    give: TradeGoods,
    get: TradeGoods,
    people: PreviewPeople,
  ) => Promise<string | null | void>;
}

export function DwellingBody({
  details,
  onSelectTarget,
  onRelocate,
  onCancelRelocation,
  onLeave,
  onBuildTrail,
  onSendExpedition,
}: {
  details: Extract<SelectionDetails, { kind: 'dwelling' }>;
  /** Vybere milíř uhlíře z panelu dílny (crafts.md – Milíř u skácených buků). */
  onSelectTarget?: ((target: VillageTarget) => void) | undefined;
} & RelocationActions &
  ManorActions): ReactElement {
  const tone = details.overcrowded ? 'text-red-400' : details.full ? 'text-[#f3cf86]' : '';
  const commands = details.manor !== null || details.relocate !== null || details.leave !== null;
  return (
    <div className="hud-split">
      <div className="flex min-w-0 flex-col justify-center gap-1.5">
        {details.workshop && (
          <WorkshopRow workshop={details.workshop} onSelectTarget={onSelectTarget} />
        )}
        {details.buying && <BuyingRow buying={details.buying} />}
        <div className={ROW}>
          <Stat icon="people" name="Obyvatelé" testId="selection-occupants">
            <span className={tone}>
              {details.occupants}/{details.capacity}
            </span>
          </Stat>
          <Stat icon="date" name="Stáří (roky)">
            {details.ageYears}
          </Stat>
        </div>
        <FamilyRow family={details.family} />
        {/* nejvýš 8 věků v řádku (8 × 1,75rem + mezery) – dvorec má 10 lidí a víc */}
        <ul
          data-testid="selection-ages"
          aria-label="Věk obyvatel"
          className="flex max-w-[15.75rem] flex-wrap gap-1"
        >
          {details.ages.map((age, i) => (
            <li
              key={i}
              className="hud-inset min-w-7 rounded px-1 text-center text-xs tabular-nums text-[#ecdfc4]"
            >
              {age}
            </li>
          ))}
        </ul>
        <Bar value={details.condition} name="Stav" testId="selection-condition" />
        {details.rebuild && (
          <div className={ROW}>
            <Bar value={details.rebuild.progress} name="Přestavba" />
            {details.rebuild.treesToFell > 0 && <WoodToFell trees={details.rebuild.treesToFell} />}
          </div>
        )}
        {details.relocation && (
          <RelocationProgress
            constructionId={details.relocation.constructionId}
            progress={details.relocation.progress}
            onCancel={onCancelRelocation}
          />
        )}
      </div>
      {commands && (
        <Commands>
          {details.manor && (
            <ManorUpgrades
              manor={details.manor}
              onBuildTrail={onBuildTrail}
              trade={() => (
                <TradePanel
                  neighbours={details.manor?.neighbours ?? []}
                  onSend={onSendExpedition}
                />
              )}
            />
          )}
          {(details.relocate || details.leave) && (
            <div className="flex items-center gap-2">
              {details.relocate && (
                <RelocateButtons
                  options={details.relocate}
                  households={1}
                  onRelocate={onRelocate ? (type) => onRelocate(type, [details.id]) : undefined}
                />
              )}
              <LeaveControls leave={details.leave} onLeave={onLeave} />
            </div>
          )}
        </Commands>
      )}
    </div>
  );
}

/**
 * Víc vybraných obydlí (migration.md – Výběr víc obydlí): kolik domácností a lidí, Přestěhovat
 * (nový dům postupně každé domácnosti, která se může stěhovat) a Odejít (růžice odchodu).
 */
export function DwellingsBody({
  details,
  onRelocate,
  onLeave,
}: {
  details: Extract<SelectionDetails, { kind: 'dwellings' }>;
} & RelocationActions): ReactElement {
  return (
    <div className="hud-split">
      <div className={`${ROW} min-w-0`}>
        <Stat src="/icons/build/zemnice.png" name="Domácnosti" testId="selection-households">
          {details.households}
        </Stat>
        <Stat icon="people" name="Lidé" testId="selection-people">
          {details.people}
        </Stat>
      </div>
      <Commands>
        <div className="flex items-center gap-2">
          {details.relocate && (
            <RelocateButtons
              options={details.relocate}
              households={details.relocatable.length}
              onRelocate={onRelocate ? (type) => onRelocate(type, details.relocatable) : undefined}
            />
          )}
          <LeaveControls leave={details.leave} onLeave={onLeave} />
        </div>
      </Commands>
    </div>
  );
}

/**
 * Rodiny v obydlí (kinship.md – Co hráč vidí): muži, ženy, děti, starší a manželské páry – ikony
 * s čísly, bez slov (rozhraní jako v 0 A.D.).
 */
export function FamilyRow({ family }: { family: FamilyCounts }): ReactElement {
  const items: { icon: string; name: string; value: number }[] = [
    { icon: 'man', name: 'Muži', value: family.men },
    { icon: 'woman', name: 'Ženy', value: family.women },
    { icon: 'child', name: 'Děti', value: family.boys + family.girls },
    { icon: 'elder', name: 'Starší', value: family.elderMen + family.elderWomen },
    { icon: 'ring', name: 'Manželské páry', value: family.couples },
  ];
  return (
    <div data-testid="selection-family" className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {items.map((item) => (
        <Stat
          key={item.icon}
          icon={item.icon}
          name={item.name}
          testId={`selection-family-${item.icon}`}
        >
          {item.value}
        </Stat>
      ))}
    </div>
  );
}
