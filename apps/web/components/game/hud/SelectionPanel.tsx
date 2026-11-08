import { type ReactElement } from 'react';
import { CART_NAMES, RoadUpgrade, WagonRoadPlan, type FortTop } from '@bohemia/game';
import { useOverflowScroll } from '@/hooks/use-overflow-scroll';
import { VillageTarget } from '@/lib/scene/village-picking';
import { fieldPartName, orchardSquareName, type SelectionDetails } from '@/lib/selection-details';
import { PEN_NAMES } from '@/lib/build-items';
import { formatPercent } from '@/lib/village-format';
import { ROAD_KIND_NAMES, SACRED_BUILDING_NAMES } from '@/lib/village-view';
import { AbandonPartButton } from './AbandonPartButton';
import { CancelConstructionButton } from './RelocationControls';
import { Tooltip } from './Tooltip';
import { StewardBuiltMark } from './StewardToggle';
import {
  Portrait,
  Stat,
  Bar,
  dwellingPortrait,
  ROW,
  WoodToFell,
  HappinessGain,
} from './selection/parts';
import {
  PersonPortrait,
  PersonBody,
  TeamBody,
  CartBody,
  type EnnobleActions,
} from './selection/people';
import { DUG_SITE_TEXTS, DugSiteBody, KilnBody } from './selection/crafts';
import { RelocationActions, ManorActions, DwellingBody, DwellingsBody } from './selection/dwelling';
import {
  FieldBody,
  FieldPartBody,
  OrchardSquareBody,
  CemeteryBody,
  OrchardBody,
  PenBody,
  GrainPitBody,
  ThreshingFloorBody,
  FieldsBody,
} from './selection/fields';
import { WildlifeBody } from './selection/wildlife';
import { PremiumSiteBody } from './selection/premium';
import { PREMIUM_TEXTS } from '@/lib/premium-view';
import { FORT_ICONS, FORT_NAMES, FortificationBody } from './selection/fortification';
import { WILDLIFE_LABELS } from '@/lib/wildlife-view';
import { Oaks, OakAge, SACRED_ICONS, SacredBody } from './selection/sacred';
import {
  JUNCTION_ICONS,
  JUNCTION_NAMES,
  JunctionBody,
  ROAD_KIND_ICONS,
  RoadBody,
} from './selection/roads';
export { ROAD_KIND_ICONS } from './selection/roads';

/**
 * Panel výběru dole uprostřed (jako v 0 A.D.) – jen když je něco vybrané: portrét, typ
 * a ikony s čísly. Obydlí: obyvatelé, věk obyvatel, stav, stáří (u přestavby i stromy ke
 * skácení), dílna navíc co dělá, práci za den a zásobu výrobku (crafts.md); staveniště: průběh
 * stavby a stromy, které ještě musí skácet;
 * díl pole (klik): co na něm je, výměra, úrodnost, cesta, hospodářství (`onSelectTarget` vybere
 * dům), letošní práce nebo příloh; pole (dvojklik): výměra, úrodnost, díly podle stadia; hřbitov:
 * hroby, na kolik let místo vystačí a průběh založení / rozšíření; čtverec sadu (klik): výměra,
 * stáří, úroda a výsadba či obnova; sad (dvojklik): výměra, stáří, úroda příští sklizně a průběh
 * výsadby;
 * posvátný dub, háj, modla a svatyně: kolik přidávají štěstí (háj i počet dubů), rozestavěná
 * modla a svatyně průběh stavby a duby ke skácení; ohrada: zvířata, seno, stáda, spřežení
 * a výcvik (cvičí se samo); pevná cesta: délka, stáří, stromy,
 * vylepšení (`onUpgradeRoad`), vozová cesta (`onBuildWagonRoad` s náhledem `wagonPlan`)
 * a výsadba jabloní (`onPlantRoadApples`). Obydlí a víc vybraných
 * obydlí: Odejít (`onLeave` – migration.md); staveniště: Zrušit (`onCancelConstruction`).
 */
export function SelectionPanel({
  details,
  onSelectTarget,
  onCancelConstruction,
  onLeave,
  onLeaveSon,
  onPreviewSon,
  onUpgradeRoad,
  onPlantRoadApples,
  onBuildWagonRoad,
  wagonPlan,
  onBuildTrail,
  onDeclareHunt,
  onSetStance,
  onDecidePrisoner,
  onSendExpedition,
  onSetSteward,
  onFortWork,
  gateFort = null,
  onGateMode,
  ennoble,
  onAbandonPart,
}: {
  details: SelectionDetails | null;
  /** Opustí díl pole, nebo ho vrátí do osevu (server action – fields.md, Opuštěný díl). */
  onAbandonPart?: (partId: number, abandon: boolean) => Promise<void>;
  /** Povýšení vesničana (vassalage.md): cílové vsi bez vojvody a akce – klíč v panelu muže. */
  ennoble?: EnnobleActions;
  /** Zadá vylepšení opevnění (server action) – hotovo, až se vrátí. */
  onFortWork?: (fortificationId: number, work: 'upgrade' | 'top', top?: FortTop) => Promise<void>;
  /** Opevnění, kterému se právě přidává brána kliknutím na obvod; null = nic. */
  gateFort?: number | null;
  /** Zapne / vypne přidávání brány kliknutím na obvod (null = vypnout). */
  onGateMode?: (fortificationId: number | null) => void;
  /** Zapne / vypne správce vsi (server action) – přepínač v panelu dvorce. */
  onSetSteward?: (on: boolean) => Promise<unknown>;
  /** Vybere jiný cíl ve vsi – dům hospodářství z panelu dílu pole. */
  onSelectTarget?: (target: VillageTarget) => void;
  /** Zadá vylepšení pevné cesty (server action) – hotovo, až se vrátí. */
  onUpgradeRoad?: (roadId: number, upgrade: RoadUpgrade) => Promise<void>;
  /** Zadá výsadbu jabloní podél pevné cesty (server action) – hotovo, až se vrátí. */
  onPlantRoadApples?: (roadId: number) => Promise<void>;
  /** Zadá vozovou cestu (server action) – hotovo, až se vrátí (roads.md – Vozová cesta). */
  onBuildWagonRoad?: (roadId: number) => Promise<void>;
  /** Náhled vozové cesty vybrané cesty (`planWagonRoad` ve scéně); null – ještě se hledá. */
  wagonPlan?: WagonRoadPlan | null;
} & RelocationActions &
  ManorActions): ReactElement | null {
  const [panelRef, scroll] = useOverflowScroll();
  if (!details) return null;
  let portrait: ReactElement;
  let body: ReactElement;
  if (details.kind === 'ore-site' || details.kind === 'clay-site') {
    const texts = DUG_SITE_TEXTS[details.kind];
    portrait = <Portrait icon={texts.portrait} name={texts.name} />;
    body = <DugSiteBody details={details} onSelectTarget={onSelectTarget} />;
  } else if (details.kind === 'premium-site') {
    portrait = (
      <Portrait icon={details.type} name={PREMIUM_TEXTS[details.type].short} dir="premium" />
    );
    body = <PremiumSiteBody details={details} />;
  } else if (details.kind === 'wildlife') {
    portrait = (
      <Portrait
        icon={WILDLIFE_LABELS[details.species].icon}
        name={WILDLIFE_LABELS[details.species].name}
        dir="resources"
      />
    );
    body = <WildlifeBody details={details} />;
  } else if (details.kind === 'person') {
    portrait = (
      <PersonPortrait
        icon={details.portrait}
        name={details.role}
        personName={details.name ?? null}
      />
    );
    body = (
      <PersonBody
        key={details.id}
        details={details}
        onSelectTarget={onSelectTarget}
        ennoble={ennoble}
      />
    );
  } else if (details.kind === 'plough-team') {
    portrait = <PersonPortrait icon="ox" name="Spřežení" testId="selection-team-portrait" />;
    body = <TeamBody details={details} onSelectTarget={onSelectTarget} />;
  } else if (details.kind === 'cart') {
    portrait = (
      <PersonPortrait
        icon="cart"
        name={CART_NAMES[details.cartKind]}
        testId="selection-cart-portrait"
      />
    );
    body = <CartBody details={details} onSelectTarget={onSelectTarget} />;
  } else if (details.kind === 'kiln') {
    portrait = <Portrait icon="milir" name={details.stage === 'remnant' ? 'Milířiště' : 'Milíř'} />;
    body = <KilnBody details={details} onSelectTarget={onSelectTarget} />;
  } else if (details.kind === 'threshing-floor') {
    portrait = <Portrait icon="humno" name="Humno" />;
    body = <ThreshingFloorBody details={details} />;
  } else if (details.kind === 'fortification') {
    portrait = (
      <Portrait
        icon={FORT_ICONS[details.fortKind]}
        name={FORT_NAMES[details.fortKind]}
        dir="resources"
      />
    );
    body = (
      <FortificationBody
        key={details.id}
        details={details}
        gateMode={gateFort === details.id}
        onWork={onFortWork}
        onGateMode={onGateMode}
      />
    );
  } else if (details.kind === 'grain-pit') {
    portrait = <Portrait icon="obilna-jama" name="Obilná jáma" />;
    body = <GrainPitBody details={details} />;
  } else if (details.kind === 'junction') {
    portrait = (
      <Portrait icon={JUNCTION_ICONS[details.shape]} name={JUNCTION_NAMES[details.shape]} />
    );
    body = <JunctionBody details={details} />;
  } else if (details.kind === 'road') {
    portrait = (
      <Portrait icon={ROAD_KIND_ICONS[details.roadKind]} name={ROAD_KIND_NAMES[details.roadKind]} />
    );
    body = (
      <RoadBody
        key={details.id}
        details={details}
        onUpgrade={onUpgradeRoad}
        onPlantApples={onPlantRoadApples}
        onBuildWagon={onBuildWagonRoad}
        wagonPlan={wagonPlan}
        onSelectTarget={onSelectTarget}
      />
    );
  } else if (details.kind === 'pen') {
    portrait = <Portrait icon="ohrada" name={PEN_NAMES[details.species]} />;
    body = <PenBody key={details.id} details={details} />;
  } else if (details.kind === 'field') {
    portrait = <Portrait icon="pole" name="Pole" />;
    body = <FieldBody details={details} onSelectTarget={onSelectTarget} />;
  } else if (details.kind === 'fields') {
    portrait = <Portrait icon="pole" name={`Pole (${details.ids.length})`} />;
    body = <FieldsBody details={details} />;
  } else if (details.kind === 'field-part') {
    portrait = <Portrait icon="pole" name={fieldPartName(details)} />;
    body = <FieldPartBody details={details} onSelectTarget={onSelectTarget} />;
  } else if (details.kind === 'orchard-square') {
    portrait = <Portrait icon="sad" name={orchardSquareName(details)} />;
    body = <OrchardSquareBody details={details} />;
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
        <div className={ROW}>
          <HappinessGain value={details.happiness} />
          <OakAge years={details.ageYears} />
        </div>
      </div>
    );
  } else if (details.kind === 'grove') {
    portrait = <Portrait icon="haj" name="Dubový háj" />;
    body = (
      <div className="flex flex-col justify-center gap-1.5">
        <div className={ROW}>
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
      <div className="flex flex-col items-start justify-center gap-1.5">
        <div className={ROW}>
          <Stat icon="labor" name="Stavba">
            {formatPercent(details.progress)}
          </Stat>
          {details.treesToFell > 0 && <WoodToFell trees={details.treesToFell} />}
        </div>
        <Bar value={details.progress} name="Stavba" testId="selection-progress" />
      </div>
    );
  } else if (details.kind === 'dwellings') {
    portrait = <Portrait icon="zemnice" name={`Obydlí (${details.ids.length})`} />;
    body = <DwellingsBody details={details} onLeave={onLeave} />;
  } else {
    // dvorec vojvody (trade.md) – i když je to zatím zemnice zakladatelů
    portrait = details.manor ? (
      <Portrait icon={details.type} name="Dvorec vojvody" />
    ) : details.lordWifeHome ? (
      // dům vedlejší manželky jmenuje vojvodu – slova jen v popisku (lord.md – Kde se jméno ukazuje)
      <Tooltip content={details.lordWifeHome} placement="above">
        <div tabIndex={0} data-testid="selection-lord-wife-home">
          {dwellingPortrait(details.type, details.workshop?.craft ?? null)}
        </div>
      </Tooltip>
    ) : (
      dwellingPortrait(details.type, details.workshop?.craft ?? null)
    );
    body = (
      <DwellingBody
        details={details}
        onSelectTarget={onSelectTarget}
        onLeave={onLeave}
        onLeaveSon={onLeaveSon}
        onPreviewSon={onPreviewSon}
        onBuildTrail={onBuildTrail}
        onDeclareHunt={onDeclareHunt}
        onSetStance={onSetStance}
        onDecidePrisoner={onDecidePrisoner}
        onSendExpedition={onSendExpedition}
        steward={details.steward}
        onSetSteward={onSetSteward}
      />
    );
  }
  // Panel roste s obsahem (w-max) do mezí `hud-selection` (globals.css – mezi minimapou a mřížkou
  // staveb, nejvýš 70 % okna); text se nezalamuje, širší obsah se zalomí po celých položkách.
  return (
    <section
      ref={panelRef}
      data-testid="selection-panel"
      data-kind={details.kind}
      data-scroll={scroll || undefined}
      data-hud-block
      aria-label="Výběr"
      className="hud-panel hud-selection fixed left-1/2 z-20 w-max min-w-[20rem] -translate-x-1/2 p-2 whitespace-nowrap"
    >
      <div className="flex min-h-24 gap-3">
        {portrait}
        {body}
        {(details.cancelConstructionId !== undefined ||
          details.stewardBuilt ||
          details.kind === 'field-part') && (
          <div className="ml-auto flex items-center gap-1 self-start">
            {details.stewardBuilt && <StewardBuiltMark />}
            {details.kind === 'field-part' && (
              <AbandonPartButton
                partId={details.partId}
                abandoned={details.abandoned}
                sown={details.stage === 'sown'}
                block={details.abandonBlock}
                onToggle={onAbandonPart}
              />
            )}
            {details.cancelConstructionId !== undefined && (
              <CancelConstructionButton
                constructionId={details.cancelConstructionId}
                onCancel={onCancelConstruction}
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
}
