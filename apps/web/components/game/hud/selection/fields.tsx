/** Panel výběru pole, dílu pole, sadu, hřbitova, ohrady a obilné jámy. */
import { type ReactElement } from 'react';
import { CART_NAMES, MAX_PEN_SQUARES } from '@bohemia/game';
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
import { Tooltip } from '../Tooltip';
import { Stat, Bar, Wear, RepairBar, ROW, formatM2, Walk, Flag, formatTons } from './parts';

export function FieldBody({
  details,
}: {
  details: Extract<SelectionDetails, { kind: 'field' }>;
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
    </div>
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
 * setí s ikonou plodiny, sklizeň) a kolikátý rok je v osevu; příloh roky ladem, zarůstání,
 * pastvu a seč; zakládaný díl průběh, zbývající práci a stromy na klády.
 */
export function FieldPartBody({
  details,
  onSelectTarget,
}: {
  details: Extract<SelectionDetails, { kind: 'field-part' }>;
  onSelectTarget?: (target: VillageTarget) => void;
}): ReactElement {
  const { crop, holding, founding } = details;
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
          {details.sownYears !== null && (
            <Stat icon="date" name="Rok osevu za sebou" testId="selection-sown-years">
              {details.sownYears + 1}.
            </Stat>
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
