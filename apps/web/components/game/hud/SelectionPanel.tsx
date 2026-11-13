import { type ReactElement } from 'react';
import { ChurchBody } from './selection/church';
import {
  CART_NAMES,
  RoadUpgrade,
  WagonRoadPlan,
  type MasonCraft,
  type MasonryCircle,
  type WallKind,
} from '@bohemia/game';
import { useOverflowScroll } from '@/hooks/use-overflow-scroll';
import { VillageTarget } from '@/lib/scene/village-picking';
import { fieldPartName, orchardSquareName, type SelectionDetails } from '@/lib/selection-details';
import { CHURCH_TYPE_NAMES, PEN_NAMES, churchIcon } from '@/lib/build-items';
import { formatPercent } from '@/lib/village-format';
import { ROAD_KIND_NAMES, SACRED_BUILDING_NAMES } from '@/lib/village-view';
import { AbandonPartButton } from './AbandonPartButton';
import { StructureUseButtons, type StructureUseActions } from './StructureUseButtons';
import { CancelConstructionButton } from './RelocationControls';
import type { LordJourneyUi } from './LordJourneyPanel';
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
import { QuarryBody } from './selection/quarry';
import { WildlifeBody } from './selection/wildlife';
import { PremiumSiteBody } from './selection/premium';
import { PREMIUM_TEXTS } from '@/lib/premium-view';
import {
  FORT_GATE_ICON,
  FORT_GATE_NAMES,
  FORT_ICON_SRC,
  type FortActionHandler,
  FORT_NAMES,
  FortGateBody,
  FortSectionBody,
  FortificationBody,
} from './selection/fortification';
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
 * Obydlí, ohrada, modla a svatyně: Opustit / Zbourat / Vrátit (`onStructureUse` – demolition.md),
 * bouraná stavba Zrušit bourání.
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
  alarm,
  onSetSteward,
  onFortAction,
  onFortDemolish,
  onFortReroute,
  gateFort = null,
  onGateMode,
  ennoble,
  onBaptize,
  onInviteLodge,
  onInviteMaster,
  onAbandonPart,
  onStructureUse,
  onOrderQuarrying,
  lordJourney,
}: {
  details: SelectionDetails | null;
  /** Ovládání výjezdu vybraného vojvody (`useLordJourney`); u jiného cíle chybí. */
  lordJourney?: LordJourneyUi | null;
  /** Nalámat do zásoby `m3` kamene v lomu (server action – fortifications.md, Kámen). */
  onOrderQuarrying?: (outcropId: number, m3: number) => Promise<void>;
  /** Opustí díl pole, nebo ho vrátí do osevu (server action – fields.md, Opuštěný díl). */
  onAbandonPart?: (partId: number, abandon: boolean) => Promise<void>;
  /** Povýšení vesničana (vassalage.md): cílové vsi bez vojvody a akce – klíč v panelu muže. */
  ennoble?: EnnobleActions;
  /** Křest vojvody (christianity.md – Křest rodu) – vrací důvod odmítnutí, nebo null. */
  onBaptize?: () => Promise<string | null>;
  /** Pozvání stavební huti okruhu (stone-masonry.md) – vrací důvod odmítnutí, nebo null. */
  onInviteLodge?: (circle: MasonryCircle) => Promise<string | null>;
  /** Pozvání chybějícího mistra oboru (stone-masonry.md) – vrací důvod odmítnutí, nebo null. */
  onInviteMaster?: (craft: MasonCraft) => Promise<string | null>;
  /**
   * Akce panelu opevnění (server action) – vylepšit úsek či vše, doplnit val, napustit příkop,
   * vylepšit bránu; hotovo, až se vrátí.
   */
  onFortAction?: FortActionHandler;
  /** Zboří úsek opevnění s dílem `segment` (server action – demolition.md, Opevnění). */
  onFortDemolish?: (fortificationId: number, segment: number) => Promise<void>;
  /** Úsek od brány k bráně jinudy (demolition.md – Rozhodnutí) – otevře editor trasy. */
  onFortReroute?: (fortificationId: number, segment: number, target: WallKind) => void;
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
  ManorActions &
  Pick<StructureUseActions, 'onStructureUse'>): ReactElement | null {
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
  } else if (details.kind === 'visitor') {
    // cizí vojvoda na výjezdu (lord-control.md – Soused): jméno vojvody, rod a kolik jich jede
    portrait = <Portrait icon="horse" name={details.leader} dir="resources" />;
    body = (
      <div data-testid="visitor-panel" className="flex flex-col gap-1 text-sm text-[#f3dfb0]">
        <Tooltip content="Rod">
          <span className="flex items-center gap-1" data-testid="visitor-house">
            <img src="/icons/house/banner.png" alt="" width={20} height={20} />
            {details.house}
          </span>
        </Tooltip>
        <Tooltip content="Jezdci a pěší">
          <span className="flex items-center gap-1" data-testid="visitor-men">
            <img src="/icons/resources/jizda.png" alt="" width={20} height={20} />
            {details.riders}
            {details.men > details.riders ? ` + ${details.men - details.riders}` : ''}
          </span>
        </Tooltip>
      </div>
    );
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
        onBaptize={onBaptize}
        onInviteLodge={onInviteLodge}
        onInviteMaster={onInviteMaster}
        lordJourney={lordJourney}
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
  } else if (details.kind === 'church') {
    portrait = <Portrait icon={churchIcon(details.type)} name={CHURCH_TYPE_NAMES[details.type]} />;
    body = <ChurchBody details={details} />;
  } else if (details.kind === 'quarry') {
    portrait = <Portrait icon="lom" name="Lom" src="/icons/build/lom.png" />;
    body = <QuarryBody details={details} onOrder={onOrderQuarrying} />;
  } else if (details.kind === 'fortification') {
    portrait = (
      <Portrait icon="" src={FORT_ICON_SRC[details.fortKind]} name={FORT_NAMES[details.fortKind]} />
    );
    body = (
      <FortificationBody
        key={details.id}
        details={details}
        gateMode={gateFort === details.id}
        onAction={onFortAction}
        onGateMode={onGateMode}
      />
    );
  } else if (details.kind === 'fortification-section') {
    // úsek mezi branami – portrét druhu, popisek „Úsek“ (fortifications.md – Rozhraní, Úseky)
    portrait = (
      <Portrait
        icon=""
        src={FORT_ICON_SRC[details.fortKind]}
        name={`${FORT_NAMES[details.fortKind]} – úsek`}
      />
    );
    body = (
      <FortSectionBody
        key={`${details.id}-${details.section.segments[0] ?? 0}`}
        details={details}
        gateMode={gateFort === details.id}
        onDemolish={onFortDemolish}
        onAction={onFortAction}
        onGateMode={onGateMode}
      />
    );
  } else if (details.kind === 'fortification-gate') {
    portrait = <Portrait icon="" src={FORT_GATE_ICON} name={FORT_GATE_NAMES[details.fortKind]} />;
    body = (
      <FortGateBody
        details={details}
        onSelectTarget={onSelectTarget}
        onReroute={onFortReroute}
        onAction={onFortAction}
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
          <Stat icon="labor" name={details.demolition === undefined ? 'Stavba' : 'Bourání'}>
            {formatPercent(details.demolition ?? details.progress)}
          </Stat>
          {details.treesToFell > 0 && <WoodToFell trees={details.treesToFell} />}
        </div>
        {details.demolition === undefined ? (
          <Bar value={details.progress} name="Stavba" testId="selection-progress" />
        ) : (
          <Bar value={details.demolition} name="Bourání" testId="selection-demolition" />
        )}
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
        alarm={alarm}
        steward={details.steward}
        onSetSteward={onSetSteward}
      />
    );
  }
  // Opustit / Zbourat / Vrátit (demolition.md – Rozhraní) u obydlí, ohrady, modly a svatyně
  const structureUse =
    details.kind === 'dwelling' ||
    details.kind === 'pen' ||
    details.kind === 'sacred' ||
    details.kind === 'threshing-floor' ||
    details.kind === 'grain-pit' ||
    details.kind === 'orchard' ||
    details.kind === 'orchard-square' ||
    details.kind === 'cemetery'
      ? details.use
      : undefined;
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
          details.kind === 'field-part' ||
          structureUse !== undefined) && (
          <div className="ml-auto flex items-center gap-1 self-start">
            {details.stewardBuilt && <StewardBuiltMark />}
            {structureUse !== undefined && (
              <StructureUseButtons
                key={`${structureUse.structure}-${structureUse.id}`}
                use={structureUse}
                onStructureUse={onStructureUse}
                onCancelConstruction={onCancelConstruction}
              />
            )}
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
