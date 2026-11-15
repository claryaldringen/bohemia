/** Panel výběru obydlí, dvorce vojvody a skupiny obydlí. */
import { type ReactElement } from 'react';
import { type DefenseStance, Direction8, TradeGoods } from '@bohemia/game';
import { VillageTarget } from '@/lib/scene/village-picking';
import { type SelectionDetails } from '@/lib/selection-details';
import { PreviewPeople } from '@/lib/trade-quote';
import type { DwellingResident } from '@/lib/person-view';
import { Tooltip } from '../Tooltip';
import { StewardToggle } from '../StewardToggle';
import { ManorUpgrades } from '../ManorPanel';
import { AlarmButtons, type AlarmActions } from '../AlarmButtons';
import type { PrisonerAction } from '../PrisonersPanel';
import { TradePanel } from '../TradePanel';
import { LeaveControls } from '../RelocationControls';
import { Stat, Bar, ROW, Commands, WoodToFell } from './parts';
import { ManorHunt } from './wildlife';
import { WaresStock } from './wares';
import { WorkshopRow, BuyingRow } from './crafts';
import { SonsRow } from './sons';
import { DemolitionBar } from '../StructureUseButtons';
import { plural } from '@/lib/village-format';

/** Akce panelu nad obydlími – odchod do nové vsi a zrušení stavby (migration.md). */
export interface RelocationActions {
  /** Zruší rozestavěnou stavbu – hotovo, až se vrátí. */
  onCancelConstruction?: (constructionId: number) => Promise<void>;
  /**
   * Odejít do nové vsi (migration.md – fáze 3 a 4): na novou mapu ve směru (jedna ves, jedna mapa).
   */
  onLeave?: (direction: Direction8, householdIds: readonly number[]) => void;
  /** Odchod syna vojvody s poměrnou částí vsi (lord.md – Dělení vsi): cíl jako u `onLeave`. */
  onLeaveSon?: (direction: Direction8, sonId: number) => void;
  /** Obrys obydlí dílu vybraného syna ve scéně; null – obrys zmizí. */
  onPreviewSon?: (dwellingIds: readonly number[] | null) => void;
}

/** Vylepšení vsi z dvorce vojvody (trade.md) – zemská stezka a obchod. */
export interface ManorActions {
  /** Zadá stavbu zemské stezky do směru (server action) – hotovo, až se vrátí. */
  onBuildTrail?: (direction: Direction8) => Promise<void>;
  /** Vyhlásí lov navíc na zítřek (server action) – vrátí důvod odepření, nebo null. */
  onDeclareHunt?: () => Promise<string | null | void>;
  /** Nastaví postoj vsi před cizím vojskem (war.md – Obránci) – vrátí důvod odepření, nebo null. */
  onSetStance?: (stance: DefenseStance) => Promise<string | null | void>;
  onDecidePrisoner?: (id: string, action: PrisonerAction) => Promise<string | null | void>;
  /**
   * Varování a útěk (war.md – Varování, poslové a útěk do hradiště): pohled a příkazy – řádek
   * ikon pod postojem vsi, jen když ves o vojsku ví nebo má lidi na útěku.
   */
  alarm?: AlarmActions;
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

/** Popisek dočasně ubytovaných (demolition.md – Obydlí): „Dočasně tu bydlí 3 lidé z opuštěného domu“. */
export function lodgersLabel(count: number): string {
  return `Dočasně tu bydlí ${count} ${plural(count, 'člověk', 'lidé', 'lidí')} z opuštěného domu`;
}

export function DwellingBody({
  details,
  onSelectTarget,
  onLeave,
  onLeaveSon,
  onPreviewSon,
  onBuildTrail,
  onDeclareHunt,
  onSetStance,
  onDecidePrisoner,
  onSendExpedition,
  alarm,
  steward,
  onSetSteward,
}: {
  details: Extract<SelectionDetails, { kind: 'dwelling' }>;
  /** Přepínač správce (jen dvorec vojvody); jinak undefined. */
  steward?: { on: boolean } | undefined;
  onSetSteward?: ((on: boolean) => Promise<unknown>) | undefined;
  /** Vybere milíř uhlíře z panelu dílny (crafts.md – Milíř u skácených buků). */
  onSelectTarget?: ((target: VillageTarget) => void) | undefined;
} & RelocationActions &
  ManorActions): ReactElement {
  const tone = details.overcrowded ? 'text-red-400' : details.full ? 'text-[#f3cf86]' : '';
  const commands = details.manor !== null || details.leave !== null || steward !== undefined;
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
          {details.garden && (
            <Stat
              icon="legumes"
              name="Luštěniny ze zahrádky (kg)"
              testId="selection-garden-legumes"
            >
              {details.garden.legumeKg}
            </Stat>
          )}
          {details.use?.lodgers !== undefined && (
            <Stat icon="family" name={lodgersLabel(details.use.lodgers)} testId="selection-lodgers">
              {details.use.lodgers}
            </Stat>
          )}
        </div>
        <DwellingResidents residents={details.residents} onSelect={onSelectTarget} />
        {details.manor?.hunt && <ManorHunt hunt={details.manor.hunt} />}
        {details.manor && <WaresStock wares={details.wares ?? null} />}
        {details.sons && details.sons.length > 0 && (
          <SonsRow sons={details.sons} onLeaveSon={onLeaveSon} onPreviewSon={onPreviewSon} />
        )}
        <Bar value={details.condition} name="Stav" testId="selection-condition" />
        <DemolitionBar use={details.use} />
        {details.rebuild && (
          <div className={ROW}>
            <Bar value={details.rebuild.progress} name="Přestavba" />
            {details.rebuild.treesToFell > 0 && <WoodToFell trees={details.rebuild.treesToFell} />}
          </div>
        )}
      </div>
      {commands && (
        <Commands>
          {steward && <StewardToggle on={steward.on} onToggle={onSetSteward} />}
          {details.manor && (
            <ManorUpgrades
              manor={details.manor}
              onBuildTrail={onBuildTrail}
              onDeclareHunt={onDeclareHunt}
              onSetStance={onSetStance}
              onDecidePrisoner={onDecidePrisoner}
              trade={() => (
                <TradePanel
                  neighbours={details.manor?.neighbours ?? []}
                  onSend={onSendExpedition}
                />
              )}
            />
          )}
          {details.manor && alarm && <AlarmButtons {...alarm} />}
          {details.leave && <LeaveControls leave={details.leave} onLeave={onLeave} />}
        </Commands>
      )}
    </div>
  );
}

/**
 * Víc vybraných obydlí (migration.md – Výběr víc obydlí): kolik domácností a lidí a Odejít
 * (růžice odchodu).
 */
export function DwellingsBody({
  details,
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
        <LeaveControls leave={details.leave} onLeave={onLeave} />
      </Commands>
    </div>
  );
}

/**
 * Obyvatelé obydlí (lord.md – Co hráč vidí; dvorec i běžná obydlí): u každého portrét s věkem (popisek role, u mužů rodu
 * jméno – „Bořivoj – Syn vojvody“, lord.md – Kde se jméno ukazuje). Dovednosti
 * (luk, boj, jízda) ukazuje jen panel vybrané osoby (Martin 24. 10. 2026: „To by mělo být na
 * panelu té označené osoby“).
 */
export function DwellingResidents({
  residents,
  onSelect,
}: {
  residents: readonly DwellingResident[];
  /** Klik na portrét vybere osobu (villagers.md – Výběr postavy). */
  onSelect?: ((target: VillageTarget) => void) | undefined;
}): ReactElement {
  return (
    <ul
      data-testid="selection-residents"
      aria-label="Obyvatelé"
      className="flex max-w-[26rem] flex-wrap gap-x-3 gap-y-1"
    >
      {residents.map((m) => (
        <li key={m.id} data-testid={`resident-${m.id}`} className="flex items-center gap-1.5">
          <Tooltip
            placement="above"
            content={m.name === undefined ? m.role : `${m.name} – ${m.role}`}
          >
            <button
              type="button"
              aria-label={m.name === undefined ? m.role : `${m.name} – ${m.role}`}
              data-testid={`resident-select-${m.id}`}
              onClick={() => onSelect?.({ kind: 'person', id: m.id })}
              className="hud-inset flex min-w-14 cursor-pointer items-center gap-1 rounded px-1 text-xs tabular-nums text-[#ecdfc4]"
            >
              <img src={`/icons/resources/${m.portrait}.png`} alt="" width={20} height={20} />
              {m.age}
            </button>
          </Tooltip>
        </li>
      ))}
    </ul>
  );
}
