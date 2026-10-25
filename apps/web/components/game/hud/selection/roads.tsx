/** Panel výběru cesty (vylepšení, vozová cesta, jabloně). */
import { useState, type ReactElement } from 'react';
import { type SelectionDetails } from '@/lib/selection-details';
import { formatDecimal, formatInteger } from '@/lib/village-format';
import { ROAD_KIND_NAMES, ROAD_UPGRADE_NAMES } from '@/lib/village-view';
import { JUNCTION_ICONS, JUNCTION_NAMES, type VillageRoadEnd } from '@/lib/road-end-view';
import type { VillageTarget } from '@/lib/scene/village-picking';
import {
  RoadKind,
  RoadUpgrade,
  RoadUpgradeParts,
  WAGON_NO_WOOD,
  WagonRoadPlan,
} from '@bohemia/game';
import { SwathTrees } from '../ManorPanel';
import { Tooltip } from '../Tooltip';
import { Stat, Bar, ROW, Commands, TargetButton, WoodToFell, formatSpeedGain } from './parts';
import { Oaks } from './sacred';

/** Portréty stupňů cesty a ikony tlačítek vylepšení (`/icons/build/<ikona>.png`). */
export const ROAD_KIND_ICONS: Record<RoadKind, string> = {
  trodden: 'cesta',
  cart: 'cesta-vyjezdena',
  improved: 'cesta-upravena',
  causeway: 'hat',
  wagon: 'cesta-vozova',
};

export { JUNCTION_ICONS, JUNCTION_NAMES };
const LANDMARK_NAMES = {
  tree: 'Strom u křižovatky',
  stone: 'Vztyčený kámen',
  post: 'Dřevěný kůl',
} as const;

/**
 * Křižovatka (paths.md – Křižovatky; Martin, #6): kolik cest do ní vede, znamení (strom, vztyčený
 * kámen, dřevěný kůl) a stáří – jen ikony a čísla, názvy v popiscích.
 */
export function JunctionBody({
  details,
}: {
  details: Extract<SelectionDetails, { kind: 'junction' }>;
}): ReactElement {
  return (
    <div className="flex min-w-0 flex-col justify-center gap-1.5">
      <div className={ROW}>
        <Stat icon="walk" name="Cesty do křižovatky" testId="selection-junction-roads">
          {details.roads}
        </Stat>
        {details.landmark === 'tree' ? (
          <Oaks count={1} name={LANDMARK_NAMES.tree} testId="selection-junction-landmark" />
        ) : (
          <Stat
            icon={details.landmark === 'stone' ? 'ore' : 'wood'}
            name={LANDMARK_NAMES[details.landmark]}
            testId="selection-junction-landmark"
          >
            1
          </Stat>
        )}
        <Stat icon="date" name="Stáří (roky)" testId="selection-junction-age">
          {details.ageYears}
        </Stat>
      </div>
    </div>
  );
}

/**
 * Konec cesty (paths.md – pravidlo 11, Co hráč vidí; Martin 25. 10. 2026): ikona stavby,
 * křižovatky nebo jiné cesty – klik ji vybere –, šipka ke kraji mapy, nebo červené varování, když
 * cesta nikam nevede; jiná cesta bez křižovatky je klikatelná, ale s varováním. Název jen v popisku.
 */
export function RoadEndIcon({
  end,
  testId,
  onSelectTarget,
}: {
  end: VillageRoadEnd;
  testId: string;
  onSelectTarget?: ((target: VillageTarget) => void) | undefined;
}): ReactElement {
  if (end.target && end.icon) {
    return (
      <span
        data-end-kind={end.kind}
        {...(end.alert ? { 'data-alert': true } : {})}
        className={end.alert ? 'relative inline-flex' : 'contents'}
      >
        {end.alert && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-1 -top-1 z-10 text-sm font-bold leading-none text-red-400"
          >
            !
          </span>
        )}
        <TargetButton
          src={end.icon}
          name={end.name}
          testId={testId}
          target={end.target}
          onSelectTarget={onSelectTarget}
        />
      </span>
    );
  }
  const glyph = end.alert ? '!' : end.arrow;
  return (
    <Tooltip content={end.name} placement="above">
      <span
        data-testid={testId}
        data-end-kind={end.kind}
        {...(end.alert ? { 'data-alert': true } : {})}
        aria-label={end.name}
        tabIndex={0}
        className={`inline-flex h-7 w-7 items-center justify-center text-base font-bold ${
          end.alert ? 'text-red-400' : ''
        }`}
      >
        {glyph ??
          (end.icon && (
            <img src={end.icon} alt="" width={128} height={128} className="h-full w-full" />
          ))}
      </span>
    </Tooltip>
  );
}

/**
 * Pevná cesta (roads.md – Co hráč vidí, Cesta pro hráče – celý řetěz úseků): délka, u cesty
 * z víc stupňů délka po stupních, vozová část, stáří, stromy u ní, jabloně (z nich plodící),
 * mokřina a brody; rozestavěné vylepšení a výsadba jabloní průběh; tlačítka vylepšení a „Vysadit
 * jabloně“ (ikony, cena v popisku jako v 0 A.D.) – když nejde, zašedlé s důvodem červeně.
 */
/** Procenta sklonu na desetiny (6 %, 7,2 %). */
export function gradeText(grade: number): string {
  const v = Math.round(grade * 1000) / 10;
  return `${Number.isInteger(v) ? formatInteger(v) : formatDecimal(v, 1)} %`;
}

/** Minuty jízdy vozu na desetiny; vůz neprojede. */
export function minutesText(minutes: number | null): string {
  if (minutes === null) return 'neprojede';
  return `${minutes < 10 ? formatDecimal(minutes, 1) : formatInteger(minutes)} min`;
}

/** Proč vozovou cestu nejde zahájit (cena předem): stavba sama, trasa, nebo chybějící dřevo na lávku. */
function wagonReason(
  blocked: string | null,
  plan: WagonRoadPlan | null | undefined,
): string | null {
  if (blocked) return blocked;
  if (!plan) return null;
  if (!plan.ok) return plan.reason;
  return plan.missingWood > 0 ? WAGON_NO_WOOD : null;
}

/**
 * Popisek tlačítka „Upravit pro vozy“ (roads.md – Vozová cesta): cena (práce, stromy v průseku),
 * délka nové trasy proti staré, nejprudší místo, největší úvoz a násep a doba jízdy vozem dřív
 * a teď – z náhledu (`plan`, stejná funkce jako server); než se trasa najde, „Hledá se trasa“.
 */
export function WagonTooltip({
  blocked,
  plan,
}: {
  blocked: string | null;
  plan: WagonRoadPlan | null | undefined;
}): ReactElement {
  const reason = wagonReason(blocked, plan);
  return (
    <span className="flex flex-col gap-0.5">
      <span>Upravit pro vozy</span>
      {!reason && plan?.ok && (
        <>
          <span className="flex items-center gap-2 tabular-nums">
            <span className="flex items-center gap-1">
              <img src="/icons/resources/labor.png" alt="" width={16} height={16} />
              {formatDecimal(plan.laborManDays, 0)}
            </span>
            {plan.trees > 0 && <SwathTrees trees={plan.trees} />}
          </span>
          <span data-testid="wagon-length" className="tabular-nums">
            {formatInteger(plan.oldLengthM)} → {formatInteger(plan.lengthM)} m
          </span>
          <span data-testid="wagon-grade" className="tabular-nums">
            sklon {gradeText(plan.oldMaxGrade)} → {gradeText(plan.maxGrade)}
          </span>
          {(plan.maxCutM > 0 || plan.maxFillM > 0) && (
            <span data-testid="wagon-earthworks" className="tabular-nums">
              úvoz {formatDecimal(plan.maxCutM, 1)} m · násep {formatDecimal(plan.maxFillM, 1)} m
            </span>
          )}
          <span data-testid="wagon-minutes" className="flex items-center gap-1 tabular-nums">
            <img src="/icons/resources/cart.png" alt="" width={16} height={16} />
            {minutesText(plan.minutesBefore)} → {minutesText(plan.minutesAfter)}
          </span>
        </>
      )}
      {!reason && !plan && <span data-testid="wagon-pending">Hledá se trasa…</span>}
      {reason && (
        <span data-testid="road-wagon-blocked" className="font-semibold text-red-400">
          {reason}
        </span>
      )}
    </span>
  );
}

export function RoadBody({
  details,
  onUpgrade,
  onPlantApples,
  onBuildWagon,
  wagonPlan,
  onSelectTarget,
}: {
  details: Extract<SelectionDetails, { kind: 'road' }>;
  onUpgrade?: (roadId: number, upgrade: RoadUpgrade) => Promise<void>;
  onPlantApples?: (roadId: number) => Promise<void>;
  onBuildWagon?: (roadId: number) => Promise<void>;
  wagonPlan?: WagonRoadPlan | null;
  onSelectTarget?: ((target: VillageTarget) => void) | undefined;
}): ReactElement {
  const [busy, setBusy] = useState(false);
  const buildWagon = (): void => {
    if (!onBuildWagon || busy) return;
    setBusy(true);
    void onBuildWagon(details.id).finally(() => setBusy(false));
  };
  const wagonBlocked = wagonReason(details.wagon.blocked, wagonPlan);
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
    <div className="hud-split">
      <div className="flex min-w-0 flex-col justify-center gap-1.5">
        <div className={ROW}>
          <RoadEndIcon
            end={details.ends[0]}
            testId="selection-road-end-0"
            onSelectTarget={onSelectTarget}
          />
          <RoadEndIcon
            end={details.ends[1]}
            testId="selection-road-end-1"
            onSelectTarget={onSelectTarget}
          />
          <Tooltip content="Délka" placement="above">
            <span
              data-testid="selection-length"
              tabIndex={0}
              className="text-sm font-semibold tabular-nums"
            >
              {formatInteger(details.lengthM)} m
            </span>
          </Tooltip>
          {details.kinds.length > 1 &&
            details.kinds.map((k) => (
              <Stat
                key={k.kind}
                src={`/icons/build/${ROAD_KIND_ICONS[k.kind]}.png`}
                name={ROAD_KIND_NAMES[k.kind]}
                testId={`selection-road-${k.kind}`}
              >
                {formatInteger(k.lengthM)} m
              </Stat>
            ))}
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
          {details.treeSpeed > 0 && (
            <Stat icon="walk" name="Stromy zrychlí chůzi i vozy" testId="selection-road-tree-speed">
              {formatSpeedGain(details.treeSpeed)}
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
          <div className={ROW}>
            <Bar value={details.building.progress} name="Vylepšení" testId="selection-progress" />
            {details.building.treesToFell > 0 && (
              <WoodToFell trees={details.building.treesToFell} />
            )}
          </div>
        )}
        {details.wagon.status === 'building' && (
          <div className={ROW}>
            <Bar
              value={details.wagon.progress}
              name="Vozová cesta"
              testId="selection-wagon-progress"
            />
          </div>
        )}
        {apples.planting && (
          <div className={ROW}>
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
      </div>
      <Commands row>
        {details.upgrades.map((option) => (
          <Tooltip
            key={option.upgrade}
            placement="above"
            content={
              <span className="flex flex-col gap-0.5">
                <span>{ROAD_UPGRADE_NAMES[option.upgrade]}</span>
                <UpgradeParts parts={option.parts} />
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
                  {option.swathTrees > 0 && <SwathTrees trees={option.swathTrees} />}
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
                src={`/icons/build/${ROAD_KIND_ICONS[option.upgrade]}.png`}
                alt=""
                width={40}
                height={40}
                className="h-full w-full"
              />
            </button>
          </Tooltip>
        ))}
        {details.wagon.status !== 'built' && (
          <Tooltip
            placement="above"
            content={<WagonTooltip blocked={details.wagon.blocked} plan={wagonPlan} />}
          >
            <button
              type="button"
              data-testid="road-wagon"
              aria-label="Upravit pro vozy"
              disabled={wagonBlocked !== null || !wagonPlan?.ok || busy || !onBuildWagon}
              aria-busy={busy}
              onClick={buildWagon}
              className={`hud-inset h-10 w-10 overflow-hidden rounded ${busy ? 'disabled:cursor-wait disabled:opacity-60' : 'disabled:cursor-not-allowed disabled:opacity-45 disabled:grayscale'}`}
            >
              <img
                src={`/icons/build/${ROAD_KIND_ICONS.wagon}.png`}
                alt=""
                width={40}
                height={40}
                className="h-full w-full"
              />
            </button>
          </Tooltip>
        )}
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
      </Commands>
    </div>
  );
}

const UPGRADE_PART_NAMES = {
  improved: 'Úprava',
  causeway: 'Hať',
  footbridge: 'Lávka',
} as const;

/**
 * Rozpad ceny úpravy cesty v popisku: úprava, hať přes mokřinu a lávka přes brod – každá část,
 * která se staví, s prací a dřevem (celek pod tím). Jen když se staví víc než jedna část.
 */
function UpgradeParts({ parts }: { parts: RoadUpgradeParts }): ReactElement | null {
  const rows = (Object.keys(UPGRADE_PART_NAMES) as (keyof typeof UPGRADE_PART_NAMES)[]).filter(
    (key) => parts[key].manDays > 0 || parts[key].trees > 0,
  );
  if (rows.length < 2) return null;
  return (
    <span data-testid="road-upgrade-parts" className="flex flex-col gap-0.5 tabular-nums">
      {rows.map((key) => (
        <span
          key={key}
          data-testid={`road-upgrade-part-${key}`}
          className="flex items-center gap-2"
        >
          <span className="w-12">{UPGRADE_PART_NAMES[key]}</span>
          <span className="flex items-center gap-1">
            <img src="/icons/resources/labor.png" alt="" width={16} height={16} />
            {formatDecimal(parts[key].manDays, 0)}
          </span>
          {parts[key].trees > 0 && (
            <span className="flex items-center gap-1">
              <img src="/icons/resources/wood.png" alt="" width={16} height={16} />
              {parts[key].trees}
            </span>
          )}
        </span>
      ))}
    </span>
  );
}
