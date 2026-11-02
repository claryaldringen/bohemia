/** Panel výběru pole, dílu pole, sadu, hřbitova, ohrady a obilné jámy. */
import { type ReactElement, type ReactNode } from 'react';
import { CART_NAMES, MAX_PEN_SQUARES, dateOfDayIndex, type ClearingStage } from '@bohemia/game';
import { formatGameDate } from '@/lib/game-date';
import type { VillageHorse, VillageHorses } from '@/lib/horse-view';
import { PART_COLORS, SURFACE_COLORS } from '@/lib/minimap';
import { VillageTarget } from '@/lib/scene/village-picking';
import {
  CROP_LABELS,
  FIELD_SURFACE_NAMES,
  HERD_LABELS,
  PART_STAGE_NAMES,
  type SelectionDetails,
} from '@/lib/selection-details';
import { penVariant } from '@/lib/build-items';
import {
  formatDecimal,
  formatHa,
  formatInteger,
  formatPercent,
  formatYearsShort,
  plural,
} from '@/lib/village-format';
import { DWELLING_NAMES } from '@/lib/village-view';
import type { PartClearingView } from '@/lib/village-view-types';
import { Tooltip } from '../Tooltip';
import { FieldDamage } from './wildlife';
import { protectionLabel } from '@/lib/disasters-view';
import {
  fieldOutlookKg,
  fieldOutlookLabel,
  outlookYieldLabel,
  shortfallLabel,
  shortfallManDays,
} from '@/lib/field-outlook-labels';
import type { WorkShortfallView } from '@/lib/village-view-types';
import { Stat, Bar, Wear, RepairBar, ROW, formatM2, Walk, Flag, formatTons } from './parts';

/** Krátký název plodiny malými písmeny (ozim, jař, luštěniny, len) – do popisků. */
function cropShort(crop: keyof typeof CROP_LABELS): string {
  return CROP_LABELS[crop].name.split(' – ')[0]!.toLowerCase();
}

/**
 * Práce do konce okna nestačí (fields.md – Co hráč vidí, Očekávaná úroda a jestli práce stačí):
 * ikona práce s chybějícími člověkodny červeně, okna a kroky v popisku u kurzoru.
 */
function WorkShort({ short }: { short: readonly WorkShortfallView[] }): ReactElement {
  return (
    <Stat icon="labor" name={shortfallLabel(short)} testId="selection-work-short" alert>
      −{formatInteger(shortfallManDays(short))}
    </Stat>
  );
}

/**
 * Příloh ikonou – čtvereček barvy mladého přílohu jako v řádku dílů podle stadia (úhor a odpočívající
 * díly – fields.md, Osevní postup po dílech, bod 6) s číslem.
 */
function FallowStat({
  name,
  testId,
  children,
}: {
  name: string;
  testId: string;
  children: ReactNode;
}): ReactElement {
  return (
    <Tooltip content={name} placement="above">
      <span className="flex shrink-0 items-center gap-1 whitespace-nowrap" tabIndex={0}>
        <span
          aria-hidden
          className="inline-block h-3 w-3 rounded-sm border border-black/50"
          style={{ background: `rgb(${PART_COLORS['young-fallow'].join(' ')})` }}
        />
        <span data-testid={testId} className="text-sm font-semibold tabular-nums">
          {children}
        </span>
      </span>
    </Tooltip>
  );
}

/**
 * Tlačítko „Označit všechna pole“ (Martin 24. 10. 2026): vybere všechna pole vsi najednou, i když
 * spolu nesousedí. Jediné pole ve vsi se nabízet nemusí.
 */
function SelectAllFields({
  fieldIds = [],
  onSelectTarget,
}: {
  fieldIds?: readonly number[];
  onSelectTarget?: (target: VillageTarget) => void;
}): ReactElement | null {
  if (fieldIds.length < 2) return null;
  return (
    <Tooltip content="Označit všechna pole" placement="above">
      <button
        type="button"
        data-testid="selection-all-fields"
        aria-label="Označit všechna pole"
        className="hud-icon-button h-7 w-7"
        onClick={() => onSelectTarget?.({ kind: 'fields', ids: fieldIds })}
      >
        <img
          src="/icons/resources/fields.png"
          alt=""
          width={26}
          height={26}
          className="h-[22px] w-[22px] m-auto"
        />
      </button>
    </Tooltip>
  );
}

/** Všechna pole najednou (tlačítko v panelu pole): počet polí a součet výměry. */
export function FieldsBody({
  details,
}: {
  details: Extract<SelectionDetails, { kind: 'fields' }>;
}): ReactElement {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className={ROW}>
        <Tooltip content="Výměra všech polí" placement="above">
          <span
            data-testid="selection-area"
            tabIndex={0}
            className="text-sm font-semibold tabular-nums"
          >
            {formatHa(details.areaM2)}
          </span>
        </Tooltip>
        <Stat icon="fields" name="Pole" testId="selection-fields-count">
          {details.ids.length}
        </Stat>
      </div>
    </div>
  );
}

export function FieldBody({
  details,
  onSelectTarget,
}: {
  details: Extract<SelectionDetails, { kind: 'field' }>;
  onSelectTarget?: (target: VillageTarget) => void;
}): ReactElement {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className={ROW}>
        <Tooltip content="Výměra" placement="above">
          <span
            data-testid="selection-area"
            tabIndex={0}
            className="text-sm font-semibold tabular-nums"
          >
            {formatHa(details.areaM2)}
          </span>
        </Tooltip>
        <SelectAllFields fieldIds={details.fieldIds} onSelectTarget={onSelectTarget} />
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
      {details.outlook && (
        <div className={ROW}>
          <Stat icon="sheaves" name={fieldOutlookLabel(details.outlook)} testId="selection-outlook">
            {formatInteger(fieldOutlookKg(details.outlook))}
          </Stat>
          {details.outlook.short && <WorkShort short={details.outlook.short} />}
        </div>
      )}
      <ul aria-label="Díly pole" className="flex flex-wrap gap-x-2.5 gap-y-1">
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
      {(details.turn.length > 0 || details.resting > 0) && (
        <ul aria-label="Na řadě" className={ROW}>
          {details.turn.map(({ crop, count, surplus }) => (
            <li key={crop}>
              <Stat
                icon={CROP_LABELS[crop].icon}
                name={`Na řadě – ${cropShort(crop)}${
                  surplus > 0
                    ? `; nad potřebu letos ${surplus} ${plural(surplus, 'díl', 'díly', 'dílů')}`
                    : ''
                }`}
                testId={`selection-turn-${crop}`}
              >
                {count}
              </Stat>
            </li>
          ))}
          {details.resting > 0 && (
            <li>
              <FallowStat name="Odpočívá – příloh pod 95 %" testId="selection-resting">
                {details.resting}
              </FallowStat>
            </li>
          )}
        </ul>
      )}
      {details.surfaces.length > 0 && (
        <ul aria-label="Povrch dílů při založení" className="flex flex-wrap gap-x-2.5 gap-y-1">
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
      {details.clearing && <ClearingCounts clearing={details.clearing} />}
    </div>
  );
}

/** Ikona a popisek fáze klučení – kácení, schnutí, pálení (forest.md – Klučení lesa pro pole). */
const CLEARING_LOOKS: Record<ClearingStage, { icon: string; name: string }> = {
  fell: { icon: 'wood', name: 'Kácí se les' },
  dry: { icon: 'hourglass', name: 'Větve schnou' },
  burn: { icon: 'fire', name: 'Pálí se paseka' },
};

/** Fáze zakládaného dílu v lese: kácení – kolik stromů zbývá, schnutí – od kdy se pálí, pálení. */
function ClearingStageFlag({ clearing }: { clearing: PartClearingView }): ReactElement {
  if (clearing.stage === 'fell') {
    return (
      <Stat
        icon={CLEARING_LOOKS.fell.icon}
        name={`${CLEARING_LOOKS.fell.name} – stromů zbývá pokácet`}
        testId="selection-clearing"
      >
        {clearing.treesLeft}
      </Stat>
    );
  }
  const look = CLEARING_LOOKS[clearing.stage];
  const name =
    clearing.stage === 'dry' && clearing.burnFrom !== undefined
      ? `${look.name} – pálí se od ${formatGameDate(dateOfDayIndex(clearing.burnFrom))}`
      : look.name;
  return <Flag icon={look.icon} name={name} testId="selection-clearing" />;
}

/** Pole: kolik čtverců se kácí, schne a pálí – jen fáze, které někde běží. */
function ClearingCounts({ clearing }: { clearing: Record<ClearingStage, number> }): ReactElement {
  return (
    <ul aria-label="Klučení lesa po čtvercích" className="flex flex-wrap gap-x-2.5 gap-y-1">
      {(['fell', 'dry', 'burn'] as const).map((stage) =>
        clearing[stage] > 0 ? (
          <li key={stage}>
            <Stat
              icon={CLEARING_LOOKS[stage].icon}
              name={`${CLEARING_LOOKS[stage].name} – čtverců`}
              testId={`selection-clearing-${stage}`}
            >
              {clearing[stage]}
            </Stat>
          </li>
        ) : null,
      )}
    </ul>
  );
}

/** Příprava půdy dílu – ikona a popisek podle úlohy (fields.md – Práce, oxen.md). */
export const PREP_LOOKS: Record<'reclaim' | 'plough' | 'dig', { icon: string; name: string }> = {
  reclaim: { icon: 'labor', name: 'Rozrytí drnu přílohu' },
  plough: { icon: 'ox', name: 'Orba rádlem' },
  dig: { icon: 'labor', name: 'Kopání motykou' },
};

/**
 * Díl pole (fields.md – Co hráč vidí; Martin 19. 10. 2026: „Když kliknu na pole, zobrazí se mi
 * jen to jedno políčko s parametry.“): výměra, úrodnost (v popisku přirozená), cesta z domu
 * a hospodářství – ikona domu, kliknutím vybere dům; osetý díl letošní práci (příprava půdy,
 * setí s ikonou plodiny, sklizeň); osevní postup – kolikátý osev oběhu, co poroste příště (u úhoru
 * odpočinek k 95 %) a díl nad potřebu (fields.md – Osevní postup po dílech, bod 6); příloh roky
 * ladem, zarůstání, pastvu a seč; zakládaný díl průběh, zbývající práci a stromy na klády.
 */
export function FieldPartBody({
  details,
  onSelectTarget,
}: {
  details: Extract<SelectionDetails, { kind: 'field-part' }>;
  onSelectTarget?: (target: VillageTarget) => void;
}): ReactElement {
  const { crop, holding, founding, next, rest } = details;
  const fallow = details.fallowYears !== null;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className={ROW}>
        <Tooltip content="Výměra" placement="above">
          <span
            data-testid="selection-area"
            tabIndex={0}
            className="text-sm font-semibold tabular-nums"
          >
            {formatM2(details.areaM2)}
          </span>
        </Tooltip>
        <SelectAllFields fieldIds={details.fieldIds} onSelectTarget={onSelectTarget} />
        <Stat
          icon="food"
          name={`Úrodnost – přirozená ${details.naturalFertility}`}
          testId="selection-fertility"
        >
          {details.fertility}
        </Stat>
        {details.ashBonus > 0 && (
          <Tooltip
            content="Popel z vymýceného lesa – úrodnost +40 první sezónu osevu, +20 druhou"
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
        <Walk meters={details.walkM} />
        {details.damage && <FieldDamage damage={details.damage} />}
        {details.protection && (
          <Stat
            icon="protection"
            name={protectionLabel(details.protection)}
            testId="selection-protection"
          >
            {details.protection.level}
          </Stat>
        )}
        {details.losses?.map((row) => (
          <Stat
            key={row.key}
            icon={row.icon}
            name={row.name}
            testId={`selection-loss-${row.key}`}
            alert={row.alert}
          >
            {row.text}
          </Stat>
        ))}
        {holding && (
          <Tooltip
            content={`Hospodářství – ${DWELLING_NAMES[holding.type].nominative.toLowerCase()}`}
            placement="above"
          >
            <button
              type="button"
              data-testid="selection-holding"
              aria-label="Hospodářství"
              className="hud-icon-button h-7 w-7"
              onClick={() => onSelectTarget?.({ kind: 'dwelling', id: holding.dwellingId })}
            >
              <img
                src={`/icons/build/${holding.type}.png`}
                alt=""
                width={128}
                height={128}
                className="h-full w-full"
              />
            </button>
          </Tooltip>
        )}
        {details.surface !== 'meadow' && (
          <Tooltip content={FIELD_SURFACE_NAMES[details.surface]} placement="above">
            <span data-surface={details.surface} tabIndex={0} className="flex items-center">
              <span
                aria-hidden
                className="inline-block h-3 w-3 rounded-full border border-black/50"
                style={{ background: `rgb(${SURFACE_COLORS[details.surface].join(' ')})` }}
              />
            </span>
          </Tooltip>
        )}
      </div>
      {crop && (
        <div className={ROW}>
          {crop.prep && (
            <Stat
              icon={PREP_LOOKS[crop.prep.task].icon}
              name={PREP_LOOKS[crop.prep.task].name}
              testId="selection-prep"
            >
              {formatPercent(crop.prep.share)}
            </Stat>
          )}
          <Stat
            icon={CROP_LABELS[crop.crop].icon}
            name={`Setí – ${CROP_LABELS[crop.crop].name}`}
            testId={`selection-sow-${crop.crop}`}
          >
            {formatPercent(crop.sow)}
          </Stat>
          <Stat icon="harvest" name="Sklizeň" testId="selection-harvest">
            {formatPercent(crop.harvest)}
          </Stat>
          {details.outlook && (
            <Stat
              icon="sheaves"
              name={outlookYieldLabel(details.outlook)}
              testId="selection-outlook"
            >
              {formatInteger(details.outlook.kg)}
            </Stat>
          )}
          {details.outlook?.short && <WorkShort short={details.outlook.short} />}
        </div>
      )}
      {(next !== null || details.sownYears !== null || details.surplus) && (
        <div className={ROW}>
          {details.sownYears !== null && (
            <Stat
              icon="date"
              name={`${details.sownYears + 1}. osev oběhu`}
              testId="selection-sown-years"
            >
              {details.sownYears + 1}.
            </Stat>
          )}
          {next === 'fallow' && rest && (
            <FallowStat
              name={`Příště úhor – odpočinek k 95 %, osev za ≈ ${rest.years} ${plural(rest.years, 'rok', 'roky', 'let')}`}
              testId="selection-next"
            >
              {formatPercent(rest.share)}
            </FallowStat>
          )}
          {next !== null && next !== 'fallow' && (
            <Flag
              icon={CROP_LABELS[next].icon}
              name={`Příště – ${cropShort(next)}`}
              testId="selection-next"
            />
          )}
          {details.surplus && (
            <Flag
              icon="hourglass"
              name="Jen z volné práce – stavby mají přednost"
              testId="selection-surplus"
            />
          )}
        </div>
      )}
      {fallow && (
        <div className={ROW}>
          <Stat icon="date" name="Ladem (roky)" testId="selection-fallow-years">
            {details.fallowYears}
          </Stat>
          {details.overgrowthYears > 0 && (
            <Stat icon="overgrowth" name="Bez pastvy a seče (roky)" testId="selection-overgrowth">
              {details.overgrowthYears}
            </Stat>
          )}
          {details.grazed === true && (
            <Flag icon="sheep" name="Pasou se tu stáda" testId="selection-grazed" />
          )}
          {details.mow !== null && (
            <Stat icon="hay" name="Seč sena" testId="selection-mow">
              {formatPercent(details.mow)}
            </Stat>
          )}
        </div>
      )}
      {founding && (
        <div className={ROW}>
          <Bar value={founding.progress} name="Založení" testId="selection-progress" />
          <Stat icon="labor" name="Zbývá práce (člověkodny)" testId="selection-labor-left">
            {formatDecimal(founding.laborLeft, 1)}
          </Stat>
          {founding.trees > 0 && (
            <Stat icon="wood" name="Stromy – dají klády" testId="selection-trees">
              {founding.trees}
            </Stat>
          )}
          {founding.clearing && <ClearingStageFlag clearing={founding.clearing} />}
        </div>
      )}
    </div>
  );
}

/**
 * Čtverec sadu (orchard.md – Co hráč vidí): výměra, stáří, úroda čtverce a cesta z domu;
 * výsadba či obnova průběhem, čtverec čekající na obnovu ikonou přesýpacích hodin.
 */
export function OrchardSquareBody({
  details,
}: {
  details: Extract<SelectionDetails, { kind: 'orchard-square' }>;
}): ReactElement {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className={ROW}>
        <Tooltip content="Výměra" placement="above">
          <span
            data-testid="selection-area"
            tabIndex={0}
            className="text-sm font-semibold tabular-nums"
          >
            {formatM2(details.areaM2)}
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
        <Walk meters={details.walkM} />
        {details.renewal && details.planting === null && (
          <Flag icon="hourglass" name="Čeká na obnovu" testId="selection-renewal" />
        )}
      </div>
      {details.planting !== null && (
        <div className="flex items-center gap-1.5">
          <Bar
            value={details.planting}
            name={details.renewal ? 'Obnova' : 'Výsadba'}
            testId="selection-progress"
          />
          {details.plantingWaits && (
            <Flag
              icon="date"
              name="Sází se na jaře a na podzim"
              testId="selection-planting-waits"
            />
          )}
        </div>
      )}
    </div>
  );
}

export function CemeteryBody({
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
  const full = details.freePlaces === 0;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-3">
        {/* místa na hroby – mohyla významného zabere víc míst (cemetery.md) */}
        <Tooltip content={`Hroby – pohřbených ${details.graves}`} placement="above">
          <span
            data-testid="selection-graves"
            tabIndex={0}
            className={`text-sm font-semibold tabular-nums ${full ? 'text-red-400' : ''}`}
          >
            {details.usedPlaces}/{details.capacity}
          </span>
        </Tooltip>
        <Stat icon="date" name="Místo na roky" testId="selection-years">
          {formatYearsShort(details.yearsLeft)}
        </Stat>
        <Wear condition={details.condition} abandoned={details.abandoned} name="Plot – stav" />
      </div>
      {details.building !== null && <Bar value={details.building} name="Rozšíření" />}
      {details.repair !== null && <RepairBar value={details.repair} name="Oprava plotu" />}
    </div>
  );
}

export function OrchardBody({
  details,
}: {
  details: Extract<SelectionDetails, { kind: 'orchard' }>;
}): ReactElement {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className={ROW}>
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

/** Ikona a název druhu koně v seznamu ohrady. */
const HORSE_KIND_NAMES: Record<VillageHorse['kind'], { icon: string; name: string }> = {
  foal: { icon: 'foal', name: 'Hříbě' },
  mare: { icon: 'mare', name: 'Klisna' },
  riding: { icon: 'horse', name: 'Jezdecký kůň' },
};

/** Popisek kování koní: dny do termínu, kdo kuje a cena cizího kováře (horses.md – Kování). */
function shoeingName(s: NonNullable<VillageHorses['shoeing']>): string {
  const when = s.unshod
    ? 'Jezdecký kůň není podkutý – nejezdí a nevycvičuje se'
    : `Dny do kování jezdeckých koní: ${formatInteger(Math.max(0, s.daysLeft))}`;
  if (s.source === 'own') return `${when}; kuje vlastní kovář`;
  if (s.source === 'foreign') {
    return `${when}; kuje kovář z jiné vsi (cesta ${formatInteger(s.foreignDays)} ${plural(s.foreignDays, 'den', 'dny', 'dní')}, cena ${formatInteger(s.foreignKg)} kg obilí)`;
  }
  return `${when}; kovář chybí`;
}

/**
 * Koně ohrady koní (horses.md – Co hráč vidí): místa v ohradách koní / kolik koní ves chce
 * (červeně, když se nevejdou), obilí koní za den (červeně, když ho nemají), seno na zimu a seznam
 * koní této ohrady – druh, věk, výcvik (přesýpací hodiny do 12 let) a hřebec (podkova).
 */
function HorsesBlock({ horses, penId }: { horses: VillageHorses; penId: number }): ReactElement {
  const wanted = horses.wanted.riding + horses.wanted.mares + horses.wanted.foals;
  const grainAlert = !horses.fed && horses.grainKgPerDay > 0;
  const mine = horses.horses.filter((h) => h.penId === penId);
  return (
    <>
      <div className="flex items-center gap-3">
        <Stat
          src="/icons/build/ohrada.png"
          name={`Místa v ohradách koní / kolik koní ves chce (jezdečtí ${formatInteger(horses.wanted.riding)}, klisny ${formatInteger(horses.wanted.mares)}, hříbata ${formatInteger(horses.wanted.foals)}); koní ve vsi ${formatInteger(horses.count)}`}
          testId="selection-horses-need"
          alert={horses.overRoom}
        >
          {formatInteger(horses.places)}/{formatInteger(wanted)}
        </Stat>
        <Stat
          icon="food"
          name={
            grainAlert
              ? 'Obilí koní za den (kg) – koně jsou bez obilí, výcvik se zpomalil'
              : 'Obilí koní za den (kg)'
          }
          testId="selection-horses-grain"
          alert={grainAlert}
        >
          {formatDecimal(horses.grainKgPerDay, horses.grainKgPerDay % 1 === 0 ? 0 : 1)}
        </Stat>
        <Stat icon="hay" name="Seno koní na zimu" testId="selection-horses-hay">
          {formatTons(horses.hayWinterKg)}
        </Stat>
        {horses.shoeing && (
          <Stat
            icon="horse"
            name={shoeingName(horses.shoeing)}
            testId="selection-horses-shoeing"
            alert={horses.shoeing.unshod}
          >
            {formatInteger(Math.max(0, horses.shoeing.daysLeft))}
            {horses.shoeing.source === 'foreign'
              ? ` / ${formatInteger(horses.shoeing.foreignKg)}`
              : ''}
          </Stat>
        )}
      </div>
      {mine.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {mine.map((h) => {
            const kind = HORSE_KIND_NAMES[h.kind];
            const training = h.kind === 'riding' && h.training < 1;
            return (
              <span key={h.id} className="flex items-center gap-1">
                <Stat
                  icon={kind.icon}
                  name={`${kind.name}${h.stallion ? ' – hřebec' : ''}, ${formatInteger(h.ageYears)} ${plural(h.ageYears, 'rok', 'roky', 'let')}${training ? `, výcvik ${formatPercent(h.training)}` : ''}`}
                  testId={`selection-horse-${h.id}`}
                >
                  {formatInteger(h.ageYears)}
                </Stat>
                {training && (
                  <Stat
                    icon="hourglass"
                    name={`Výcvik koně (hotový ve 12 letech) ${formatPercent(h.training)}`}
                    testId={`selection-horse-${h.id}-training`}
                  >
                    {formatPercent(h.training)}
                  </Stat>
                )}
                {h.stallion && (
                  <Stat icon="jizda" name="Hřebec" testId={`selection-horse-${h.id}-stallion`}>
                    {''}
                  </Stat>
                )}
              </span>
            );
          })}
        </div>
      )}
    </>
  );
}

/**
 * Ohrada (oxen.md – Co hráč vidí, Ohrady podle druhu): rozestavěná jen průběh stavby; hotová druh
 * zvířat s obsazením a místy na noc (v ohradě / místa), místa všech ohrad druhu / kolik jich stádo
 * potřebuje (červeně, když chybí – Martin 20. 10. 2026), čtverce (nejvýš 4), rozšíření ve stavbě,
 * seno, stav (chátrání, oprava), stádo vsi jen druhu ohrady (slepice a ostatní druhy ne – issue #3); ohrada spřežení voly, stáří spřežení (kolik
 * let ještě slouží) a průběh výcviku. Spřežení se cvičí samo (Martin 19. 10. 2026) – tlačítko není.
 */
export function PenBody({
  details,
}: {
  details: Extract<SelectionDetails, { kind: 'pen' }>;
}): ReactElement {
  const squares = (
    <Stat icon="fields" name="Čtverce ohrady (nejvýš 4)" testId="selection-pen-squares">
      {details.squares}/{MAX_PEN_SQUARES}
    </Stat>
  );
  if (!details.built) {
    return (
      <div className="flex flex-col justify-center gap-1.5">
        <div className="flex items-center gap-3">
          <Stat icon="labor" name="Stavba">
            {formatPercent(details.progress)}
          </Stat>
          {squares}
        </div>
        <Bar value={details.progress} name="Stavba" testId="selection-progress" />
      </div>
    );
  }
  const animal = penVariant(details.species);
  const team = details.species === 'team';
  const oxen = details.oxenVillage;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-3">
        {team ? (
          <>
            <Stat icon="ox" name="Voli v ohradě" testId="selection-oxen">
              {details.oxen}
            </Stat>
            {oxen && (
              <Stat
                src="/icons/build/ohrada.png"
                name={`Místa v ohradách volů / kolik volů ves chce (vycvičení ${formatInteger(oxen.trained)}, ve výcviku ${formatInteger(oxen.training)})`}
                testId="selection-oxen-need"
                alert={oxen.places < oxen.wanted}
              >
                {formatInteger(oxen.places)}/{formatInteger(oxen.wanted)}
              </Stat>
            )}
          </>
        ) : (
          <Stat
            icon={animal.icon}
            name={`${animal.name} v ohradě na noc / místa`}
            testId="selection-pen-animals"
          >
            {formatInteger(details.animals)}/{formatInteger(details.places)}
          </Stat>
        )}
        {details.herdPlaces && (
          <Stat
            src="/icons/build/ohrada.png"
            name={`Místa v ohradách – ${animal.name.toLowerCase()}: všechny ohrady / potřeba (u domů ${formatInteger(details.herdPlaces.home)})`}
            testId="selection-pen-need"
            alert={details.herdPlaces.pens < details.herdPlaces.needed}
          >
            {formatInteger(details.herdPlaces.pens)}/{formatInteger(details.herdPlaces.needed)}
          </Stat>
        )}
        {details.herd && (
          <Stat
            icon={HERD_LABELS[details.herd.species].icon}
            name={`${HERD_LABELS[details.herd.species].name} vsi`}
            testId={`selection-herd-${details.herd.species}`}
          >
            {formatInteger(details.herd.count)}
          </Stat>
        )}
        {squares}
        <Stat icon="hay" name="Seno" testId="selection-hay">
          {formatTons(details.hayKg)}
        </Stat>
        <Wear condition={details.condition} abandoned={details.abandoned} />
      </div>
      {details.horses && <HorsesBlock horses={details.horses} penId={details.id} />}
      {details.repair !== null && <RepairBar value={details.repair} />}
      {details.extension !== null && (
        <Bar value={details.extension} name="Rozšíření ohrady" testId="selection-extension" />
      )}
      {oxen && (
        <div className="flex items-center gap-3">
          <Stat
            icon="ard"
            name="Páry volů s rádlem / páry k orbě, které ves chce"
            testId="selection-oxen-ploughs"
            alert={oxen.teams < oxen.ploughPairs}
          >
            {formatInteger(oxen.teams)}/{formatInteger(oxen.ploughPairs)}
          </Stat>
          {(['two-wheel', 'four-wheel'] as const).map((kind) =>
            oxen.carts[kind] > 0 || oxen.cartTargets[kind] > 0 ? (
              <Stat
                key={kind}
                icon="cart"
                name={`${CART_NAMES[kind]} – má / chce`}
                testId={`selection-oxen-carts-${kind}`}
              >
                {formatInteger(oxen.carts[kind])}/{formatInteger(oxen.cartTargets[kind])}
              </Stat>
            ) : null,
          )}
        </div>
      )}
      {details.team && (
        <div className="flex items-center gap-3">
          <Stat icon="ox" name="Nejstarší vůl – stáří (roky)" testId="selection-team-age">
            {details.team.ageYears}
          </Stat>
          <Stat
            icon="hourglass"
            name="Nejstarší vůl – slouží ještě (roky)"
            testId="selection-team-left"
          >
            {details.team.yearsLeft}
          </Stat>
        </div>
      )}
      {details.training && (
        <div className="flex items-center gap-1.5">
          <Bar value={details.training.progress} name="Výcvik volů" testId="selection-training" />
          <Stat icon="hourglass" name="Výcvik – zbývá dní" testId="selection-training-days">
            {formatInteger(details.training.daysLeft)}
          </Stat>
        </div>
      )}
    </div>
  );
}

/**
 * Otevřená obilná jáma (production-chains.md – Obilné jámy; Martin 20. 10. 2026: „v označení se
 * ukáže kolik v ní je zrní“): zrno v jámě (kg), jak je plná a stáří jámy – bez textů navíc.
 */
export function GrainPitBody({
  details,
}: {
  details: Extract<SelectionDetails, { kind: 'grain-pit' }>;
}): ReactElement {
  return (
    <div className="flex min-w-0 flex-col justify-center gap-1.5">
      <div className={ROW}>
        <Stat
          icon="food"
          name={`Zrno v jámě (kg) – vejde se ${formatInteger(details.capacityKg)} kg`}
          testId="selection-grain-pit-kg"
        >
          {`${formatInteger(details.grainKg)} kg`}
        </Stat>
        <Stat icon="date" name="Stáří jámy (roky)" testId="selection-grain-pit-age">
          {formatInteger(details.ageYears)}
        </Stat>
      </div>
      <Bar
        value={details.capacityKg > 0 ? details.grainKg / details.capacityKg : 0}
        name="Zrno v jámě"
        testId="selection-grain-pit-fill"
      />
    </div>
  );
}

/**
 * Humno (production-chains.md – Humno): staveniště s průběhem stavby, hotové s nevymlácenými
 * snopy vsi (kg) a značkou, že se dnes mlátí – jen ikony a čísla.
 */
export function ThreshingFloorBody({
  details,
}: {
  details: Extract<SelectionDetails, { kind: 'threshing-floor' }>;
}): ReactElement {
  return (
    <div className="flex min-w-0 flex-col justify-center gap-1.5">
      {!details.built && (
        <Bar value={details.progress} name="Stavba" testId="selection-threshing-progress" />
      )}
      {details.built && (
        <div className={ROW}>
          <Stat icon="harvest" name="Nevymlácené snopy (kg)" testId="selection-threshing-sheaves">
            {`${formatInteger(details.sheavesKg)} kg`}
          </Stat>
          {details.threshingToday && (
            <Flag icon="harvest" name="Dnes se mlátí" testId="selection-threshing-today" />
          )}
        </div>
      )}
    </div>
  );
}
