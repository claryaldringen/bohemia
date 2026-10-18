import { useState, type ReactElement, type ReactNode } from 'react';
import { CRAFT_NAMES, type DwellingType, type FamilyCounts } from '@bohemia/game';
import { PART_COLORS, SURFACE_COLORS } from '@/lib/minimap';
import {
  CROP_LABELS,
  FIELD_SURFACE_NAMES,
  HERD_LABELS,
  HERD_ORDER,
  PART_STAGE_NAMES,
  type SelectionDetails,
  type SelectionWorkshop,
} from '@/lib/selection-details';
import {
  formatDecimal,
  formatHa,
  formatInteger,
  formatPercent,
  formatYearsShort,
  plural,
} from '@/lib/village-format';
import {
  CRAFT_LOOKS,
  DWELLING_NAMES,
  ROAD_GRADE_NAMES,
  ROAD_UPGRADE_NAMES,
  SACRED_BUILDING_NAMES,
  type Craft,
  type WorkshopActivity,
} from '@/lib/village-view';
import type { RoadGrade, RoadUpgrade } from '@bohemia/game';
import {
  CancelRelocationButton,
  LeaveButton,
  RelocateButtons,
  RelocationProgress,
} from './RelocationControls';
import { Tooltip } from './Tooltip';

function Portrait({ icon, name }: { icon: string; name: string }): ReactElement {
  return (
    <div className="flex w-20 shrink-0 flex-col items-center gap-1">
      <div className="hud-inset h-20 w-20 overflow-hidden rounded">
        <img
          src={`/icons/build/${icon}.png`}
          alt=""
          width={128}
          height={128}
          className="h-full w-full"
        />
      </div>
      <h2 className="text-center font-serif text-sm leading-tight text-[#f3dfb0]">{name}</h2>
    </div>
  );
}

function Stat({
  icon,
  src,
  name,
  testId,
  children,
}: {
  /** Ikona suroviny v `public/icons/resources/` bez přípony. */
  icon?: string;
  /** Jiná ikona – celá cesta (dub z `public/icons/build/`). */
  src?: string;
  name: string;
  testId?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <Tooltip content={name} placement="above">
      <span className="flex items-center gap-1" tabIndex={0}>
        <img src={src ?? `/icons/resources/${icon}.png`} alt="" width={20} height={20} />
        <span data-testid={testId} className="text-sm font-semibold tabular-nums">
          {children}
        </span>
      </span>
    </Tooltip>
  );
}

function Bar({
  value,
  name,
  testId,
}: {
  value: number;
  name: string;
  testId?: string;
}): ReactElement {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <Tooltip content={`${name} ${percent} %`} placement="above">
      <span
        role="progressbar"
        aria-label={name}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        data-testid={testId}
        tabIndex={0}
        className="hud-bar block h-2.5 w-40"
      >
        <span style={{ width: `${percent}%` }} />
      </span>
    </Tooltip>
  );
}

/** Portrét a název obydlí, nebo dílny řemesla. */
function dwellingPortrait(type: DwellingType, craft: Craft | null): ReactElement {
  return craft ? (
    <Portrait icon={CRAFT_LOOKS[craft].icon} name={CRAFT_NAMES[craft]} />
  ) : (
    <Portrait icon={type} name={DWELLING_NAMES[type].nominative} />
  );
}

/**
 * Co dílna dělá – ikona (výrobek, dřevo, uhlí, lidé) s červeným tónem, když stojí, a popisek
 * v tooltipu; u výroby kolik kg za den.
 */
/** Čeho má ves dost, když řemeslník pomáhá vsi (2. pád). */
const ENOUGH: Record<Craft, string> = { burner: 'Uhlí', smith: 'Nástrojů', potter: 'Keramiky' };

function activityLook(workshop: SelectionWorkshop): {
  icon: string;
  name: string;
  value: string;
  stalled: boolean;
} {
  const product = CRAFT_LOOKS[workshop.craft].product;
  const perDay = `${formatDecimal(workshop.outputPerDayKg, 1)} kg/den`;
  const kiln = workshop.kiln;
  const percent = kiln ? formatPercent(kiln.progress) : '–';
  const looks: Record<WorkshopActivity, { icon: string; name: string; value: string }> = {
    producing: {
      icon: product.icon,
      name: `Vyrábí – ${product.name.toLowerCase()}`,
      value: perDay,
    },
    felling: {
      icon: 'wood',
      name: workshop.craft === 'burner' ? 'Kácí a připravuje buky na milíř' : 'Kácí dřevo',
      value: kiln ? `${kiln.prepared}/${kiln.trees}` : perDay,
    },
    building: { icon: 'wood', name: 'Staví milíř', value: percent },
    burning: { icon: 'charcoal', name: 'Pálí milíř – hlídá ve dne i v noci', value: percent },
    drawing: { icon: 'charcoal', name: 'Vytahuje uhlí z milíře', value: percent },
    planting: { icon: 'labor', name: 'Sází mladé buky na pařezy', value: `${workshop.toPlant}` },
    resting: {
      icon: 'people',
      name: `${ENOUGH[workshop.craft]} je dost na rok – pomáhá vsi na poli a se stavbami`,
      value: '–',
    },
    'no-charcoal': { icon: 'charcoal', name: 'Čeká na uhlí – zatím pomáhá vsi', value: '0' },
    'no-wood': {
      icon: 'wood',
      name:
        workshop.craft === 'burner'
          ? 'Čeká na dřevo – nejsou dospělé buky, zatím pomáhá vsi'
          : 'Čeká na dřevo – není co kácet, zatím pomáhá vsi',
      value: '0',
    },
    idle: { icon: 'labor', name: 'Nemá kdo pracovat', value: '0' },
    empty: { icon: 'people', name: 'Prázdná – nikdo tu nebydlí', value: '0' },
  };
  const look = looks[workshop.activity];
  const stalled =
    workshop.activity === 'no-charcoal' ||
    workshop.activity === 'no-wood' ||
    workshop.activity === 'idle' ||
    workshop.activity === 'empty';
  return { ...look, stalled };
}

/** Dílna v panelu výběru: co dělá, práce za den, zásoba výrobku (a pokrytí potřeby vsi). */
function WorkshopRow({ workshop }: { workshop: SelectionWorkshop }): ReactElement {
  const activity = activityLook(workshop);
  const product = CRAFT_LOOKS[workshop.craft].product;
  return (
    <div
      data-testid="selection-workshop"
      data-activity={workshop.activity}
      className="flex flex-wrap items-center gap-x-3 gap-y-1"
    >
      <Stat icon={activity.icon} name={activity.name} testId="selection-workshop-activity">
        <span className={activity.stalled ? 'text-red-400' : ''}>{activity.value}</span>
      </Stat>
      <Stat icon="labor" name="Práce v dílně za den" testId="selection-workshop-labor">
        {formatDecimal(workshop.laborPerDay, 1)}
      </Stat>
      <Stat
        icon={product.icon}
        name={
          workshop.coverage === null
            ? `${product.name} v zásobě (kg)`
            : `${product.name} v zásobě (kg) – pokrytí potřeby vsi ${formatPercent(workshop.coverage)}`
        }
        testId="selection-workshop-stock"
      >
        {formatInteger(workshop.stockKg)}
      </Stat>
      {workshop.kiln?.forest && (
        <Stat icon="wood" name="Milíř stojí v lese u těžby" testId="selection-workshop-forest">
          les
        </Stat>
      )}
      {workshop.craft === 'burner' && workshop.toPlant > 0 && workshop.activity !== 'planting' && (
        <Stat
          icon="labor"
          name="Pařezy buků, na které ještě zasadí mladý buk (sází na jaře a na podzim)"
          testId="selection-workshop-to-plant"
        >
          {workshop.toPlant}
        </Stat>
      )}
    </div>
  );
}

/** Akce panelu nad obydlími – přestěhování domácnosti a jeho zrušení (migration.md). */
interface RelocationActions {
  /** Začne umisťovat nové domy domácností `householdIds` (postupně, jeden za druhým). */
  onRelocate?: (type: DwellingType, householdIds: readonly number[]) => void;
  /** Zruší rozestavěné stěhování (stavba nového domu) – hotovo, až se vrátí. */
  onCancelRelocation?: (constructionId: number) => Promise<void>;
}

function DwellingBody({
  details,
  onRelocate,
  onCancelRelocation,
}: {
  details: Extract<SelectionDetails, { kind: 'dwelling' }>;
} & RelocationActions): ReactElement {
  const tone = details.overcrowded ? 'text-red-400' : details.full ? 'text-[#f3cf86]' : '';
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {details.workshop && <WorkshopRow workshop={details.workshop} />}
      <div className="flex items-center gap-3">
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
      <ul data-testid="selection-ages" aria-label="Věk obyvatel" className="flex flex-wrap gap-1">
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
        <div className="flex items-center gap-3">
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
      {details.relocate && (
        <div className="flex items-center gap-2">
          <RelocateButtons
            options={details.relocate}
            households={1}
            onRelocate={onRelocate ? (type) => onRelocate(type, [details.id]) : undefined}
          />
          <LeaveButton />
        </div>
      )}
    </div>
  );
}

/**
 * Víc vybraných obydlí (migration.md – Výběr víc obydlí): kolik domácností a lidí, Přestěhovat
 * (nový dům postupně každé domácnosti, která se může stěhovat) a Odejít (zatím zašedlé).
 */
function DwellingsBody({
  details,
  onRelocate,
}: {
  details: Extract<SelectionDetails, { kind: 'dwellings' }>;
} & RelocationActions): ReactElement {
  return (
    <div className="flex min-w-0 flex-col justify-center gap-1.5">
      <div className="flex items-center gap-3">
        <Stat src="/icons/build/zemnice.png" name="Domácnosti" testId="selection-households">
          {details.households}
        </Stat>
        <Stat icon="people" name="Lidé" testId="selection-people">
          {details.people}
        </Stat>
      </div>
      <div className="flex items-center gap-2">
        {details.relocate && (
          <RelocateButtons
            options={details.relocate}
            households={details.relocatable.length}
            onRelocate={onRelocate ? (type) => onRelocate(type, details.relocatable) : undefined}
          />
        )}
        <LeaveButton />
      </div>
    </div>
  );
}

/**
 * Rodiny v obydlí (kinship.md – Co hráč vidí): muži, ženy, děti, starší a manželské páry – ikony
 * s čísly, bez slov (rozhraní jako v 0 A.D.).
 */
function FamilyRow({ family }: { family: FamilyCounts }): ReactElement {
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

/** Dřevo, které stavba ještě musí skácet (forest.md) – ikona a počet stromů. */
function WoodToFell({ trees }: { trees: number }): ReactElement {
  return (
    <Stat icon="wood" name="Stromy ke skácení" testId="selection-wood">
      {trees}
    </Stat>
  );
}

function FieldBody({
  details,
}: {
  details: Extract<SelectionDetails, { kind: 'field' }>;
}): ReactElement {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <Tooltip content="Výměra" placement="above">
          <span
            data-testid="selection-area"
            tabIndex={0}
            className="text-sm font-semibold tabular-nums"
          >
            {formatHa(details.areaM2)}
          </span>
        </Tooltip>
        <Stat icon="food" name="Úrodnost" testId="selection-fertility">
          {Math.round(details.fertility)}
        </Stat>
        {details.ashBonus > 0 && (
          <Tooltip
            content={`Popel z vymýceného lesa – úrodnost +40 první sezónu osevu, +20 druhou (${details.ashParts} ${plural(details.ashParts, 'díl', 'díly', 'dílů')})`}
            placement="above"
          >
            <span
              data-testid="selection-ash"
              tabIndex={0}
              className="text-xs font-semibold text-amber-300 tabular-nums"
            >
              +{details.ashBonus}
            </span>
          </Tooltip>
        )}
        {details.crops.map(({ crop, count }) => (
          <Stat
            key={crop}
            icon={CROP_LABELS[crop].icon}
            name={CROP_LABELS[crop].name}
            testId={`selection-crop-${crop}`}
          >
            {count}
          </Stat>
        ))}
        {details.overgrowingM2 > 0 && (
          <Stat icon="overgrowth" name="Zarůstá" testId="selection-overgrowing">
            {formatHa(details.overgrowingM2)}
          </Stat>
        )}
      </div>
      <ul aria-label="Díly pole" className="flex flex-wrap gap-1.5">
        {details.stages.map(({ stage, count }) => (
          <li key={stage}>
            <Tooltip content={PART_STAGE_NAMES[stage]} placement="above">
              <span
                data-stage={stage}
                tabIndex={0}
                className="flex items-center gap-1 text-xs tabular-nums"
              >
                <span
                  aria-hidden
                  className="inline-block h-3 w-3 rounded-sm border border-black/50"
                  style={{ background: `rgb(${PART_COLORS[stage].join(' ')})` }}
                />
                {count}
              </span>
            </Tooltip>
          </li>
        ))}
      </ul>
      {details.surfaces.length > 0 && (
        <ul aria-label="Povrch dílů při založení" className="flex flex-wrap gap-1.5">
          {details.surfaces.map(({ surface, count }) => (
            <li key={surface}>
              <Tooltip content={FIELD_SURFACE_NAMES[surface]} placement="above">
                <span
                  data-surface={surface}
                  tabIndex={0}
                  className="flex items-center gap-1 text-xs tabular-nums"
                >
                  <span
                    aria-hidden
                    className="inline-block h-3 w-3 rounded-full border border-black/50"
                    style={{ background: `rgb(${SURFACE_COLORS[surface].join(' ')})` }}
                  />
                  {count}
                </span>
              </Tooltip>
            </li>
          ))}
        </ul>
      )}
      {details.founding !== null && <Bar value={details.founding} name="Založení" />}
    </div>
  );
}

function CemeteryBody({
  details,
}: {
  details: Extract<SelectionDetails, { kind: 'cemetery' }>;
}): ReactElement {
  if (!details.built) {
    return (
      <div className="flex flex-col justify-center gap-1.5">
        <Bar value={details.building ?? 0} name="Založení" testId="selection-progress" />
      </div>
    );
  }
  const full = details.freeGraves === 0;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <Tooltip content="Hroby" placement="above">
          <span
            data-testid="selection-graves"
            tabIndex={0}
            className={`text-sm font-semibold tabular-nums ${full ? 'text-red-400' : ''}`}
          >
            {details.graves}/{details.capacity}
          </span>
        </Tooltip>
        <Stat icon="date" name="Místo na roky" testId="selection-years">
          {formatYearsShort(details.yearsLeft)}
        </Stat>
      </div>
      {details.building !== null && <Bar value={details.building} name="Rozšíření" />}
    </div>
  );
}

function OrchardBody({
  details,
}: {
  details: Extract<SelectionDetails, { kind: 'orchard' }>;
}): ReactElement {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <Tooltip content="Výměra" placement="above">
          <span
            data-testid="selection-area"
            tabIndex={0}
            className="text-sm font-semibold tabular-nums"
          >
            {formatHa(details.areaM2)}
          </span>
        </Tooltip>
        {details.ageYears !== null && (
          <Stat icon="date" name="Stáří (roky)" testId="selection-age">
            {details.ageYears}
          </Stat>
        )}
        <Stat icon="apples" name="Úroda (kg)" testId="selection-yield">
          {formatInteger(details.expectedYieldKg)}
        </Stat>
      </div>
      {details.planting !== null && (
        <div className="flex items-center gap-1.5">
          <Bar value={details.planting} name="Výsadba" testId="selection-progress" />
          {details.plantingWaits && (
            <Tooltip content="Sází se na jaře a na podzim" placement="above">
              <img
                data-testid="selection-planting-waits"
                src="/icons/resources/date.png"
                alt="Sází se na jaře a na podzim"
                width={18}
                height={18}
                tabIndex={0}
              />
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Kolik místo přidává štěstí (happiness.md) – ikona štěstí a „+N“; rozestavěná stavba přidá až
 * po dostavění (bledší).
 */
function HappinessGain({
  value,
  pending = false,
}: {
  value: number;
  pending?: boolean;
}): ReactElement {
  return (
    <Stat
      icon="happiness"
      name={pending ? 'Štěstí po dostavění' : 'Štěstí'}
      testId="selection-happiness"
    >
      <span className={pending ? 'opacity-60' : ''}>+{value}</span>
    </Stat>
  );
}

/** Dospělé duby – ikona dubu a počet (háj: duby v háji, stavba: duby ke skácení). */
function Oaks({
  count,
  name,
  testId,
}: {
  count: number;
  name: string;
  testId: string;
}): ReactElement {
  return (
    <Stat src="/icons/build/dub.png" name={name} testId={testId}>
      {count}
    </Stat>
  );
}

/**
 * Stáří posvátného dubu (háj: nejstaršího dubu) – ikona data a roky jako u obydlí a sadu;
 * neznámé se neukáže.
 */
function OakAge({ years }: { years: number | null }): ReactElement | null {
  if (years === null) return null;
  return (
    <Stat icon="date" name="Stáří (roky)" testId="selection-age">
      {formatInteger(years)}
    </Stat>
  );
}

/** Seno v tunách s jedním desetinným místem – „3,0 t“. */
function formatTons(kg: number): string {
  return `${formatDecimal(Math.max(0, kg) / 1000, 1)} t`;
}

/**
 * Ohrada (oxen.md – Co hráč vidí): rozestavěná jen průběh stavby; hotová zvířata v ohradě (voli,
 * v zimě krávy), seno, stáda vsi s pastvou, spřežení (stáří a kolik let ještě slouží) nebo
 * průběh výcviku a tlačítko „Vycvičit spřežení“ – když výcvik nejde, zašedlé s důvodem červeně.
 */
function PenBody({
  details,
  onTrainTeam,
}: {
  details: Extract<SelectionDetails, { kind: 'pen' }>;
  onTrainTeam?: (penId: number) => Promise<void>;
}): ReactElement {
  const [busy, setBusy] = useState(false);
  if (!details.built) {
    return (
      <div className="flex flex-col justify-center gap-1.5">
        <Stat icon="labor" name="Stavba">
          {formatPercent(details.progress)}
        </Stat>
        <Bar value={details.progress} name="Stavba" testId="selection-progress" />
      </div>
    );
  }
  const blocked = details.trainBlocked;
  const train = (): void => {
    if (!onTrainTeam || blocked !== null || busy) return;
    setBusy(true);
    void onTrainTeam(details.id).finally(() => setBusy(false));
  };
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <Stat icon="ox" name="Voli v ohradě" testId="selection-oxen">
          {details.oxen}
        </Stat>
        <Stat icon="cow" name="Krávy v ohradě" testId="selection-penned-cows">
          {details.cows}
        </Stat>
        <Stat icon="hay" name="Seno" testId="selection-hay">
          {formatTons(details.hayKg)}
        </Stat>
        {details.milkLPerDay > 0 && (
          <Stat icon="cheese" name="Mléko stád (l/den)" testId="selection-milk">
            {formatInteger(details.milkLPerDay)}
          </Stat>
        )}
      </div>
      <ul aria-label="Stáda vsi" className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {HERD_ORDER.map((species) => (
          <li key={species}>
            <Stat
              icon={HERD_LABELS[species].icon}
              name={HERD_LABELS[species].name}
              testId={`selection-herd-${species}`}
            >
              {formatInteger(details.herds[species])}
            </Stat>
          </li>
        ))}
        <li>
          <Stat icon="chicken" name="Slepice" testId="selection-herd-chicken">
            {formatInteger(details.chickens)}
          </Stat>
        </li>
        <li>
          <Tooltip content="Pastva – spásáno / celkem" placement="above">
            <span
              data-testid="selection-pasture"
              tabIndex={0}
              className={`text-xs font-semibold tabular-nums ${details.grazingHa > details.pastureHa ? 'text-red-400' : ''}`}
            >
              {formatDecimal(details.grazingHa, 1)}/{formatDecimal(details.pastureHa, 1)} ha
            </span>
          </Tooltip>
        </li>
      </ul>
      {details.team && (
        <div className="flex items-center gap-3">
          <Stat icon="ox" name="Spřežení – stáří (roky)" testId="selection-team-age">
            {details.team.ageYears}
          </Stat>
          <Stat icon="hourglass" name="Spřežení – slouží ještě (roky)" testId="selection-team-left">
            {details.team.yearsLeft}
          </Stat>
        </div>
      )}
      {details.training && (
        <div className="flex items-center gap-1.5">
          <Bar
            value={details.training.progress}
            name="Výcvik spřežení"
            testId="selection-training"
          />
          <Stat icon="hourglass" name="Výcvik – zbývá dní" testId="selection-training-days">
            {formatInteger(details.training.daysLeft)}
          </Stat>
        </div>
      )}
      {!details.training && (
        <Tooltip
          content={
            blocked ? (
              <span data-testid="train-blocked" className="font-semibold text-red-400">
                {blocked}
              </span>
            ) : (
              'Vycvičit spřežení'
            )
          }
          placement="above"
        >
          <button
            type="button"
            data-testid="train-team"
            disabled={blocked !== null || busy || !onTrainTeam}
            aria-busy={busy}
            onClick={train}
            className={`hud-button px-2 py-0.5 font-serif text-sm whitespace-nowrap ${busy ? 'disabled:cursor-wait disabled:opacity-60' : 'disabled:cursor-not-allowed disabled:opacity-45 disabled:grayscale'}`}
          >
            Vycvičit spřežení
          </button>
        </Tooltip>
      )}
    </div>
  );
}

/** Portréty stupňů cesty a ikony tlačítek vylepšení (`/icons/build/<ikona>.png`). */
export const ROAD_GRADE_ICONS: Record<RoadGrade, string> = {
  trodden: 'cesta',
  improved: 'cesta-upravena',
  causeway: 'hat',
};

/**
 * Pevná cesta (roads.md – Co hráč vidí): délka, stáří, stromy u ní, jabloně (z nich plodící),
 * mokřina a brody; rozestavěné vylepšení a výsadba jabloní průběh; tlačítka vylepšení a „Vysadit
 * jabloně“ (ikony, cena v popisku jako v 0 A.D.) – když nejde, zašedlé s důvodem červeně.
 */
function RoadBody({
  details,
  onUpgrade,
  onPlantApples,
}: {
  details: Extract<SelectionDetails, { kind: 'road' }>;
  onUpgrade?: (roadId: number, upgrade: RoadUpgrade) => Promise<void>;
  onPlantApples?: (roadId: number) => Promise<void>;
}): ReactElement {
  const [busy, setBusy] = useState(false);
  const run = (upgrade: RoadUpgrade): void => {
    if (!onUpgrade || busy) return;
    setBusy(true);
    void onUpgrade(details.id, upgrade).finally(() => setBusy(false));
  };
  const plant = (): void => {
    if (!onPlantApples || busy) return;
    setBusy(true);
    void onPlantApples(details.id).finally(() => setBusy(false));
  };
  const { apples } = details;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <Tooltip content="Délka" placement="above">
          <span
            data-testid="selection-length"
            tabIndex={0}
            className="text-sm font-semibold tabular-nums"
          >
            {formatInteger(details.lengthM)} m
          </span>
        </Tooltip>
        <Stat icon="date" name="Stáří (roky)" testId="selection-road-age">
          {details.ageYears}
        </Stat>
        <Oaks count={details.trees} name="Stromy u cesty" testId="selection-road-trees" />
        {apples.trees > 0 && (
          <Stat icon="apples" name="Jabloně (plodí)" testId="selection-road-apples">
            {apples.trees}
            {apples.bearing < apples.trees ? ` (${apples.bearing})` : ''}
          </Stat>
        )}
        {(details.wetM > 0 || details.fords > 0) && (
          <Tooltip content="Mokřina a brody" placement="above">
            <span
              data-testid="selection-wet"
              tabIndex={0}
              className="text-xs font-semibold tabular-nums"
            >
              {formatInteger(details.wetM)} m · {details.fords}×
            </span>
          </Tooltip>
        )}
      </div>
      {details.building && (
        <div className="flex items-center gap-1.5">
          <Bar value={details.building.progress} name="Vylepšení" testId="selection-progress" />
          {details.building.treesToFell > 0 && <WoodToFell trees={details.building.treesToFell} />}
        </div>
      )}
      {apples.planting && (
        <div className="flex items-center gap-1.5">
          <Bar
            value={apples.planting.progress}
            name="Výsadba jabloní"
            testId="selection-apples-progress"
          />
          {apples.planting.waits && (
            <Tooltip content="Sází se na jaře a na podzim" placement="above">
              <img
                data-testid="selection-apples-waits"
                src="/icons/resources/date.png"
                alt="Sází se na jaře a na podzim"
                width={18}
                height={18}
                tabIndex={0}
              />
            </Tooltip>
          )}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        {details.upgrades.map((option) => (
          <Tooltip
            key={option.upgrade}
            placement="above"
            content={
              <span className="flex flex-col gap-0.5">
                <span>{ROAD_UPGRADE_NAMES[option.upgrade]}</span>
                <span className="flex items-center gap-2 tabular-nums">
                  <span className="flex items-center gap-1">
                    <img src="/icons/resources/labor.png" alt="" width={16} height={16} />
                    {formatDecimal(option.laborManDays, 0)}
                  </span>
                  {option.trees > 0 && (
                    <span className="flex items-center gap-1">
                      <img src="/icons/resources/wood.png" alt="" width={16} height={16} />
                      {option.trees}
                    </span>
                  )}
                </span>
                {option.blocked && (
                  <span data-testid="road-upgrade-blocked" className="font-semibold text-red-400">
                    {option.blocked}
                  </span>
                )}
              </span>
            }
          >
            <button
              type="button"
              data-testid={`road-upgrade-${option.upgrade}`}
              aria-label={ROAD_UPGRADE_NAMES[option.upgrade]}
              disabled={option.blocked !== null || busy || !onUpgrade}
              aria-busy={busy}
              onClick={() => run(option.upgrade)}
              className={`hud-inset h-10 w-10 overflow-hidden rounded ${busy ? 'disabled:cursor-wait disabled:opacity-60' : 'disabled:cursor-not-allowed disabled:opacity-45 disabled:grayscale'}`}
            >
              <img
                src={`/icons/build/${ROAD_GRADE_ICONS[option.upgrade]}.png`}
                alt=""
                width={40}
                height={40}
                className="h-full w-full"
              />
            </button>
          </Tooltip>
        ))}
        <Tooltip
          placement="above"
          content={
            <span className="flex flex-col gap-0.5">
              <span>Vysadit jabloně</span>
              <span className="flex items-center gap-2 tabular-nums">
                <span className="flex items-center gap-1">
                  <img src="/icons/resources/labor.png" alt="" width={16} height={16} />
                  {formatDecimal(apples.option.laborManDays, 0)}
                </span>
                {apples.option.trees > 0 && (
                  <span className="flex items-center gap-1">
                    <img src="/icons/resources/apples.png" alt="" width={16} height={16} />
                    {apples.option.trees}
                  </span>
                )}
              </span>
              {apples.option.blocked && (
                <span data-testid="road-apples-blocked" className="font-semibold text-red-400">
                  {apples.option.blocked}
                </span>
              )}
              {!apples.option.blocked && apples.option.warning && (
                <span
                  data-testid="road-apples-warning"
                  className="font-semibold whitespace-pre-line text-[#ffc27a]"
                >
                  {apples.option.warning}
                </span>
              )}
            </span>
          }
        >
          <button
            type="button"
            data-testid="road-plant-apples"
            aria-label="Vysadit jabloně"
            disabled={apples.option.blocked !== null || busy || !onPlantApples}
            aria-busy={busy}
            onClick={plant}
            className={`hud-inset h-10 w-10 overflow-hidden rounded ${busy ? 'disabled:cursor-wait disabled:opacity-60' : 'disabled:cursor-not-allowed disabled:opacity-45 disabled:grayscale'}`}
          >
            <img
              src="/icons/build/jablone.png"
              alt=""
              width={40}
              height={40}
              className="h-full w-full"
            />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

const SACRED_ICONS: Record<Extract<SelectionDetails, { kind: 'sacred' }>['type'], string> = {
  idol: 'modla',
  shrine: 'svatyne',
};

function SacredBody({
  details,
}: {
  details: Extract<SelectionDetails, { kind: 'sacred' }>;
}): ReactElement {
  if (details.building === null) {
    return (
      <div className="flex flex-col justify-center gap-1.5">
        <HappinessGain value={details.happiness} />
      </div>
    );
  }
  return (
    <div className="flex flex-col justify-center gap-1.5">
      <div className="flex items-center gap-3">
        <Stat icon="labor" name="Stavba">
          {formatPercent(details.building)}
        </Stat>
        <HappinessGain value={details.happiness} pending />
        {details.oaksToFell > 0 && (
          <Oaks count={details.oaksToFell} name="Duby ke skácení" testId="selection-oaks" />
        )}
      </div>
      <Bar value={details.building} name="Stavba" testId="selection-progress" />
    </div>
  );
}

/**
 * Panel výběru dole uprostřed (jako v 0 A.D.) – jen když je něco vybrané: portrét, typ
 * a ikony s čísly. Obydlí: obyvatelé, věk obyvatel, stav, stáří (u přestavby i stromy ke
 * skácení), dílna navíc co dělá, práci za den a zásobu výrobku (crafts.md); staveniště: průběh
 * stavby a stromy, které ještě musí skácet;
 * pole: výměra, úrodnost, díly podle stadia; hřbitov: hroby, na kolik let místo vystačí
 * a průběh založení / rozšíření; sad: výměra, stáří, úroda příští sklizně a průběh výsadby;
 * posvátný dub, háj, modla a svatyně: kolik přidávají štěstí (háj i počet dubů), rozestavěná
 * modla a svatyně průběh stavby a duby ke skácení; ohrada: zvířata, seno, stáda, spřežení
 * a výcvik (`onTrainTeam` – akce „Vycvičit spřežení“); pevná cesta: délka, stáří, stromy,
 * vylepšení (`onUpgradeRoad`) a výsadba jabloní (`onPlantRoadApples`). Obydlí a víc vybraných
 * obydlí: Přestěhovat (`onRelocate`), Odejít (zatím zašedlé) a průběh stěhování se zrušením
 * (`onCancelRelocation` – migration.md).
 */
export function SelectionPanel({
  details,
  onTrainTeam,
  onRelocate,
  onCancelRelocation,
  onUpgradeRoad,
  onPlantRoadApples,
}: {
  details: SelectionDetails | null;
  /** Zadá v ohradě výcvik spřežení (server action) – hotovo, až se vrátí. */
  onTrainTeam?: (penId: number) => Promise<void>;
  /** Zadá vylepšení pevné cesty (server action) – hotovo, až se vrátí. */
  onUpgradeRoad?: (roadId: number, upgrade: RoadUpgrade) => Promise<void>;
  /** Zadá výsadbu jabloní podél pevné cesty (server action) – hotovo, až se vrátí. */
  onPlantRoadApples?: (roadId: number) => Promise<void>;
} & RelocationActions): ReactElement | null {
  if (!details) return null;
  let portrait: ReactElement;
  let body: ReactElement;
  if (details.kind === 'road') {
    portrait = (
      <Portrait icon={ROAD_GRADE_ICONS[details.grade]} name={ROAD_GRADE_NAMES[details.grade]} />
    );
    body = (
      <RoadBody
        key={details.id}
        details={details}
        onUpgrade={onUpgradeRoad}
        onPlantApples={onPlantRoadApples}
      />
    );
  } else if (details.kind === 'pen') {
    portrait = <Portrait icon="ohrada" name="Ohrada" />;
    body = <PenBody key={details.id} details={details} onTrainTeam={onTrainTeam} />;
  } else if (details.kind === 'field') {
    portrait = <Portrait icon="pole" name="Pole" />;
    body = <FieldBody details={details} />;
  } else if (details.kind === 'cemetery') {
    portrait = <Portrait icon="hrbitov" name="Hřbitov" />;
    body = <CemeteryBody details={details} />;
  } else if (details.kind === 'orchard') {
    portrait = <Portrait icon="sad" name="Sad" />;
    body = <OrchardBody details={details} />;
  } else if (details.kind === 'sacred-oak') {
    portrait = details.snag ? (
      <Portrait icon="sous" name="Posvátná souš" />
    ) : (
      <Portrait icon="dub" name="Posvátný dub" />
    );
    body = (
      <div className="flex flex-col justify-center gap-1.5">
        <div className="flex items-center gap-3">
          <HappinessGain value={details.happiness} />
          <OakAge years={details.ageYears} />
        </div>
      </div>
    );
  } else if (details.kind === 'grove') {
    portrait = <Portrait icon="haj" name="Dubový háj" />;
    body = (
      <div className="flex flex-col justify-center gap-1.5">
        <div className="flex items-center gap-3">
          <HappinessGain value={details.happiness} />
          <Oaks count={details.oaks} name="Dospělé duby" testId="selection-grove-oaks" />
          <OakAge years={details.ageYears} />
        </div>
      </div>
    );
  } else if (details.kind === 'sacred') {
    portrait = (
      <Portrait icon={SACRED_ICONS[details.type]} name={SACRED_BUILDING_NAMES[details.type]} />
    );
    body = <SacredBody details={details} />;
  } else if (details.kind === 'site') {
    portrait = dwellingPortrait(details.type, details.craft);
    body = (
      <div className="flex flex-col justify-center gap-1.5">
        <div className="flex items-center gap-3">
          <Stat icon="labor" name="Stavba">
            {formatPercent(details.progress)}
          </Stat>
          {details.treesToFell > 0 && <WoodToFell trees={details.treesToFell} />}
        </div>
        <Bar value={details.progress} name="Stavba" testId="selection-progress" />
        {details.relocates !== null && (
          <CancelRelocationButton constructionId={details.id} onCancel={onCancelRelocation} />
        )}
      </div>
    );
  } else if (details.kind === 'dwellings') {
    portrait = <Portrait icon="zemnice" name={`Obydlí (${details.ids.length})`} />;
    body = <DwellingsBody details={details} onRelocate={onRelocate} />;
  } else {
    portrait = dwellingPortrait(details.type, details.workshop?.craft ?? null);
    body = (
      <DwellingBody
        details={details}
        onRelocate={onRelocate}
        onCancelRelocation={onCancelRelocation}
      />
    );
  }
  return (
    <section
      data-testid="selection-panel"
      data-kind={details.kind}
      data-hud-block
      aria-label="Výběr"
      className="hud-panel fixed bottom-2 left-1/2 z-20 flex min-h-28 w-[22rem] max-w-[calc(100vw-30rem)] -translate-x-1/2 gap-3 p-2"
    >
      {portrait}
      {body}
    </section>
  );
}
