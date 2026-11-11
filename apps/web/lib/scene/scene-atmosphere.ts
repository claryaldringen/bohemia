import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { ColorCurves } from '@babylonjs/core/Materials/colorCurves';
import type { Scene } from '@babylonjs/core/scene';
import type { Landscape, WorldClock } from '@bohemia/game';
import type { SceneVillage, SceneWeather } from '../village-view';
import type { AmbientSound } from './ambient-sound';
import { dayLight, dayLightDistance, type DayLight } from './day-light';
import type { Fauna } from './fauna';
import type { ImpostorForest } from './impostors';
import { overcast, puddleAmount, rainAmount } from './rain';
import { RainRenderer } from './rain-renderer';
import { applySceneLight } from './scene-light';
import { hitPart, type AnimationHit } from './scene-perf';
import {
  seasonDayAt,
  seasonLook,
  seasonLookDistance,
  seasonYearAt,
  type SeasonLook,
} from './season-look';
import { setPuddles, setSeasonShaderState } from './season-materials';
import type { ShadowCasters } from './shadow-casters';
import { gameDayAt } from './smoke-schedule';
import { STORM_RAIN, stormFlash, stormLight, tornadoStorm } from './storm';
import { StormRenderer } from './storm-renderer';
import { TornadoFunnel } from './tornado-funnel';
import type { VillageRenderer } from './village-renderer';
import type { WaterSurface } from './water';

/**
 * Roční období: jak často (ms) se podívá na herní datum a od jaké změny vzhledu (season-look.ts)
 * scénu překreslí. Datum se mění jednou za herní den (≈ 86 s), změna za den je pár procent.
 */
const SEASON_CHECK_MS = 1000;
const SEASON_EPSILON = 0.002;
/**
 * Pod tímto množstvím listí (season-look.ts) 3D listnáče nevrhají stín – holá koruna by vrhala
 * stín plného listí (stínová mapa listí nezná) – a impostory vrhají stín holých korun ze
 * zimního atlasu. Stínová mapa se překreslí jen při přechodu.
 */
const BARE_SHADOW_LEAVES = 0.3;
/**
 * Den a noc (day-light.ts): jak často (ms) se při plynulém pohybu přepočítá světlo dne a od jaké
 * změny (`dayLightDistance`) se scéna překreslí. Slunce oběhne oblohu za herní den (≈ 86 s) –
 * 10× za sekundu je to pod půl stupně, světlo se mění plynule a kreslí se jen 10 snímků za sekundu.
 */
const DAY_LIGHT_MS = 100;
const DAY_LIGHT_EPSILON = 0.002;

/** Hodiny dne: hodina 0–24 v okamžiku `nowMs` (epoch ms). */
export type DayClock = (nowMs: number) => number;

/** Vstupy ovzduší scény – části scény vznikají postupně v `setLandscape`, proto přes getter. */
export interface AtmosphereDeps {
  scene: Scene;
  /** Překreslit v příštím snímku (SceneLoop.requestRender). */
  requestRender: () => void;
  /** Systémové „omezit pohyb“ – smršť se nekreslí, světlo dne jde po krocích. */
  reducedMotion: () => boolean;
  casters: ShadowCasters;
  /** Hodiny světa (bez nastavených ostrý svět). */
  worldClock: () => WorldClock;
  /** Poslední stav vsi – počasí roku, krupobití, povodeň a smršť. */
  village: () => SceneVillage | null;
  /** Kamera – kapky a kroupy padají kolem jejího cíle. */
  camera: () => ArcRotateCamera | null;
  /** Části scény, kterým roční období a světlo nastavují vzhled. */
  villageRenderer: () => VillageRenderer | null;
  impostorForest: () => ImpostorForest | null;
  water: () => WaterSurface | null;
  fauna: () => Fauna | null;
  ambient: () => AmbientSound | null;
}

/**
 * Ovzduší scény: roční období (season-look.ts), světlo dne a noci (day-light.ts), déšť (rain.ts),
 * bouřka s kroupami, povodeň a smršť (storm.ts) i záblesky. Drží vývojová vynucení (den v roce,
 * déšť, den pohrom, hodiny dne) a renderery deště, bouřky a trychtýře smrště.
 */
export class SceneAtmosphere {
  /** Déšť (rain.ts) – síla 0–1 teď a vývojové vynucení (null = podle dnů deště). */
  private rain: RainRenderer | null = null;
  private rainNow = 0;
  private rainOverride: number | null = null;
  /**
   * Bouřka s kroupami a povodeň (storm.ts, storm-renderer.ts): síla bouřky a záblesk teď, klíč
   * pohrom vsi a vývojové vynucení dne světa (null = podle hodin světa).
   */
  private storm: StormRenderer | null = null;
  /** Trychtýř smrště (tornado-funnel.ts) – ztmavení smrště jde se silou bouřky (`stormNow`). */
  private tornadoFunnel: TornadoFunnel | null = null;
  private stormNow = 0;
  private flashNow = 0;
  private disasterKey = '';
  private disasterDayOverride: number | null = null;
  /** Počasí vsi naposledy předané scéně (JSON) – při změně se hned přepočte vzhled. */
  private weatherKey = 'null';
  /** Vývojový přepínač dne v roce (null = podle herního data). */
  private seasonDay: number | null = null;
  /** Naposledy nastavený vzhled ročního období a kdy se znovu podívat na datum. */
  private season: SeasonLook | null = null;
  private seasonCheckAt = 0;
  /** Den a noc: hodiny dne (null = bez denní doby – pevné odpolední slunce jako dřív). */
  private dayClock: DayClock | null = null;
  /** Naposledy nastavené světlo dne a kdy se počítalo (performance.now). */
  private daylight: DayLight | null = null;
  private daylightAt = 0;

  constructor(private readonly deps: AtmosphereDeps) {}

  /** Naposledy nastavený vzhled ročního období (null – ještě žádný). */
  get look(): SeasonLook | null {
    return this.season;
  }

  /** Naposledy nastavené světlo dne (null – ještě žádné). */
  get light(): DayLight | null {
    return this.daylight;
  }

  /** Vývojově vynucený den světa pro pohromy (null = podle hodin světa). */
  get forcedDisasterDay(): number | null {
    return this.disasterDayOverride;
  }

  /** Déšť a bouřka nové krajiny (staré se zahodí); `decalHeight` – výška sítě terénu. */
  buildRainAndStorm(landscape: Landscape, decalHeight: (x: number, z: number) => number): void {
    const scene = this.deps.scene;
    this.rain?.dispose();
    this.rain = new RainRenderer(scene);
    this.rainNow = 0;
    this.storm?.dispose();
    this.storm = new StormRenderer(scene, { landscape, groundHeight: decalHeight });
    if (this.daylight) this.storm.setSky(this.daylight.waterSky);
  }

  /** Trychtýř smrště nové krajiny a pohromy vsi od začátku (po bouřce a vojsku). */
  buildTornado(decalHeight: (x: number, z: number) => number): void {
    this.tornadoFunnel?.dispose();
    this.tornadoFunnel = new TornadoFunnel(this.deps.scene, { groundHeight: decalHeight });
    if (this.daylight) this.tornadoFunnel.setTone(this.daylight.tone);
    this.stormNow = 0;
    this.flashNow = 0;
    this.disasterKey = '';
    this.applyDisasters();
  }

  /** Nový stav vsi: počasí roku se ukáže hned, ne až při další kontrole období; pak pohromy. */
  villageChanged(): void {
    const weatherKey = JSON.stringify(this.deps.village()?.weather ?? null);
    if (weatherKey !== this.weatherKey) {
      this.weatherKey = weatherKey;
      if (this.season) this.updateSeason(true);
    }
    this.applyDisasters();
  }

  /** Krupobití, povodeň a smršť vsi do scény – přestaví pruh a vodu jen při změně. */
  applyDisasters(): void {
    const village = this.deps.village();
    const key = JSON.stringify([
      village?.hail ?? null,
      village?.flood ?? null,
      village?.tornado?.day ?? null,
      village?.tornado?.track ?? null,
    ]);
    if (!this.storm || key === this.disasterKey) return;
    this.disasterKey = key;
    this.storm.setHail(village?.hail ?? null);
    this.storm.setFlood(village?.flood ?? null);
    this.tornadoFunnel?.set(village?.tornado ?? null, village?.home ?? null);
    this.updateDisasters();
    this.deps.requestRender();
  }

  /** Den světa pro pohromy (desetinný) – vývojové vynucení, jinak hodiny světa. */
  disasterDay(): number {
    return this.disasterDayOverride ?? gameDayAt(Date.now(), this.deps.worldClock());
  }

  /** Je bod (x, z) pod rozlitou vodou povodně v okamžiku `nowMs` (vynucený den má přednost)? */
  floodedAt(x: number, z: number, nowMs: number): boolean {
    return (
      this.storm?.floodedAt(
        x,
        z,
        this.disasterDayOverride ?? gameDayAt(nowMs, this.deps.worldClock()),
      ) ?? false
    );
  }

  /** Vývojové vynucení dne světa pro krupobití a povodeň (null = podle hodin světa). */
  setDisasterDay(day: number | null): void {
    this.disasterDayOverride = day;
    this.updateDisasters();
  }

  /** Vývojová volba: roční období podle dne v roce (1–366, i desetinného), null = herní datum. */
  setSeasonDay(day: number | null): void {
    this.seasonDay = day;
    this.updateSeason(true);
  }

  /** Vývojové vynucení deště 0–1 (null = dny deště podle seedu dne v deštivém létě). */
  setRainOverride(amount: number | null): void {
    this.rainOverride = amount;
    this.updateSeason(true);
  }

  /** Hodiny dne (null = bez denní doby) – `LandscapeScene.setDayClock`. */
  setDayClock(clock: DayClock | null): void {
    this.dayClock = clock;
    // Filtr obrazu soumraku a noci (ColorCurves) – zapnutí přeloží shadery všech materiálů,
    // proto jednou při prvních hodinách dne a už se nevypíná (bez filtru obraz nemění).
    const processing = this.deps.scene.imageProcessingConfiguration;
    if (clock && !processing.colorCurvesEnabled) {
      processing.colorCurves ??= new ColorCurves();
      processing.colorCurvesEnabled = true;
    }
    if (this.applyLight(true)) this.deps.requestRender();
  }

  /** Den v roce scény – vývojový přepínač, jinak podle herního data světa. */
  seasonDayOfYear(): number {
    return this.seasonDay ?? seasonDayAt(Date.now(), this.deps.worldClock());
  }

  /** Kontrola ročního období ze smyčky – jednou za SEASON_CHECK_MS. */
  checkSeason(now: number): void {
    if (now >= this.seasonCheckAt) this.updateSeason(false);
  }

  /** Omezený pohyb zapnutý během záblesku – scéna nesmí zůstat rozsvícená. */
  stopFlash(): void {
    if (this.flashNow <= 0) return;
    this.flashNow = 0;
    if (this.applyLight(true)) this.deps.requestRender();
  }

  /**
   * Roční období podle herního data (nebo vývojového přepínače): když se vzhled znatelně
   * změnil, nastaví světlo, opar, vodu, stíny, zvuky a uniformy materiálů a scénu jednou
   * překreslí. Vzhled se mění nejvýš jednou za herní den – žádné kreslení navíc.
   */
  updateSeason(force: boolean): void {
    this.seasonCheckAt = performance.now() + SEASON_CHECK_MS;
    const day = this.seasonDayOfYear();
    const look = seasonLook(day, this.weatherNow());
    this.updateDisasters();
    this.updateRain(look.wet);
    // pole podle dne (odhad vzhledu, seč luk) a sněhu – přestaví se, jen když se něco změnilo
    if (this.deps.villageRenderer()?.setSeason(day, look.snow)) {
      this.deps.casters.refresh();
      this.deps.requestRender();
    }
    if (!force && this.season && seasonLookDistance(look, this.season) < SEASON_EPSILON) {
      // den a noc při omezeném pohybu (animace stojí): světlo po krocích jednou za sekundu
      if (this.dayClock && this.deps.reducedMotion() && this.applyLight(false)) {
        this.deps.requestRender();
      }
      return;
    }
    this.season = look;
    setSeasonShaderState(this.deps.scene, look);
    const bare = look.leaves < BARE_SHADOW_LEAVES;
    // obnoví i stínovou mapu – setCastersEnabled ji překreslí
    if (this.deps.casters.setBare(bare)) this.deps.impostorForest()?.setBareShadows(bare);
    this.deps.fauna()?.setIce(look.ice);
    this.deps.ambient()?.setSeason({ ...look.sound, ice: look.ice });
    this.applyLight(true);
    this.deps.requestRender();
  }

  /**
   * Světlo scény z ročního období a denní doby (day-light.ts): slunce (v noci měsíc) a jeho
   * směr, obloha, opar, okolní světlo, stíny (scene-light.ts), tón impostorů a dýmu a odraz
   * oblohy na vodě. Bez hodin dne světlo ročního období a pevné slunce SUN_DIRECTION jako dřív.
   * Vrátí true, když se světlo (znatelně) změnilo – scénu je třeba překreslit.
   */
  applyLight(force: boolean): boolean {
    const look = this.season;
    if (!look) return false;
    this.daylightAt = performance.now();
    const hour = this.dayClock ? this.dayClock(Date.now()) : null;
    // za deště zataženo (rain.ts – `overcast`), za bouřky tma a záblesky (storm.ts)
    const day = stormLight(
      overcast(dayLight(look, this.seasonDayOfYear(), hour), this.rainNow),
      this.stormNow,
      this.flashNow,
    );
    if (!force && this.daylight && dayLightDistance(day, this.daylight) < DAY_LIGHT_EPSILON) {
      return false;
    }
    this.daylight = day;
    applySceneLight(this.deps.scene, look, day, this.deps.casters.sun);
    this.deps.impostorForest()?.setTone(day.tone);
    this.tornadoFunnel?.setTone(day.tone);
    this.deps.villageRenderer()?.setLightTone(day.tone);
    this.deps.water()?.setSeason(look.water.tint, day.waterSky, look.ice);
    this.storm?.setSky(day.waterSky);
    return true;
  }

  /** Kapky a kroupy kolem cíle kamery v tomto okamžiku (při omezeném pohybu stojí). */
  placeDrops(): void {
    const camera = this.deps.camera();
    if (!camera) return;
    const seconds = performance.now() / 1000;
    this.rain?.animate(seconds, camera.target, camera.position, camera.radius);
    this.storm?.animate(seconds, camera.target, camera.position, camera.radius);
  }

  /**
   * Animace počasí v taktu animací: déšť (kapky kolem cíle kamery, jen když prší), bouřka
   * s kroupami (kroupy v pruhu a záblesky – deterministicky z času, jen v bouřce) a smršť
   * (trychtýř přejde stopou kolem vsi – jen v průchodu a s animacemi, den světa jako pohromy;
   * při omezeném pohybu ho skryje `updateDisasters`). True, když se něco hnulo.
   */
  animate(now: number, hit: AnimationHit): boolean {
    let animated = false;
    const rts = this.deps.camera();
    if (rts && this.rain?.animate(now / 1000, rts.target, rts.position, rts.radius)) {
      animated = hitPart(hit, 'déšť');
    }
    if (rts && this.storm?.animate(now / 1000, rts.target, rts.position, rts.radius)) {
      animated = hitPart(hit, 'bouřka');
    }
    if (
      !this.deps.reducedMotion() &&
      this.deps.village()?.tornado &&
      this.tornadoFunnel?.animate(this.disasterDay(), now / 1000)
    ) {
      animated = hitPart(hit, 'smršť');
    }
    if (this.stormNow > 0) {
      const flash = stormFlash(this.stormNow, Date.now());
      if (flash !== this.flashNow) {
        this.flashNow = flash;
        if (this.applyLight(true)) animated = hitPart(hit, 'blesk');
      }
    }
    return animated;
  }

  /** Den a noc – slunce jde po obloze (světlo se mění pomalu, stačí DAY_LIGHT_MS). */
  animateDaylight(now: number, hit: AnimationHit): boolean {
    if (this.dayClock && now - this.daylightAt >= DAY_LIGHT_MS && this.applyLight(false)) {
      return hitPart(hit, 'světlo');
    }
    return false;
  }

  dispose(): void {
    this.rain?.dispose();
    this.storm?.dispose();
    this.tornadoFunnel?.dispose();
  }

  /**
   * Průběh pohrom (jednou za kontrolu období a při změně vsi): kroupy, bílý pás, voda a bahno po
   * desetinách; při změně síly bouřky déšť a světlo. Záblesky jdou v `animate()`.
   */
  private updateDisasters(): void {
    if (!this.storm) return;
    const day = this.disasterDay();
    if (this.storm.update(day)) {
      // při omezeném pohybu kroupy stojí – rozmístí se jednou
      this.placeDrops();
      this.deps.requestRender();
    }
    // smršť ztmaví scénu jako bouřka (storm.ts – `tornadoStorm`); trychtýř jen s animacemi
    const tornado = this.deps.village()?.tornado;
    const storm = Math.max(this.storm.storm, tornado ? tornadoStorm(day - tornado.day) : 0);
    if (this.deps.reducedMotion() && this.tornadoFunnel?.hide()) this.deps.requestRender();
    if (storm === this.stormNow) return;
    this.stormNow = storm;
    if (storm === 0) this.flashNow = 0;
    if (this.season) {
      this.updateRain(this.season.wet);
      this.applyLight(true);
    }
    this.deps.requestRender();
  }

  /**
   * Déšť ve dnech deště deštivého léta (rain.ts – ze dne světa, jen vzhled): kapky, kaluže a
   * zataženo. Při změně síly (po desetinách) kapky jednou rozmístí – i při omezeném pohybu, kdy
   * stojí – a světlo přepočítá.
   */
  private updateRain(wet: number): void {
    const days =
      this.rainOverride ?? rainAmount(gameDayAt(Date.now(), this.deps.worldClock()), wet);
    // kroupy padají s deštěm (storm.ts)
    const rain = Math.max(days, Math.round(STORM_RAIN * this.stormNow * 10) / 10);
    setPuddles(this.deps.scene, puddleAmount(wet, rain));
    if (rain === this.rainNow) return;
    this.rainNow = rain;
    this.rain?.setAmount(rain);
    this.placeDrops();
    if (this.season) this.applyLight(true);
    this.deps.requestRender();
  }

  /**
   * Počasí roku vsi pro vzhled (disasters.md – Ve scéně) – jen v roce, pro který platí (po Novém
   * roce do další odpovědi serveru normální rok). S vývojovým dnem (`setSeasonDay`) bez ohledu
   * na rok – ukázka počasí na /dev/landscape. Zahození po Novém roce vzhled nezmění: všechny
   * dráhy počasí (`weatherAmounts`) jsou 1. 1. nulové (test v season-look.test.ts).
   */
  private weatherNow(): SceneWeather | undefined {
    const weather = this.deps.village()?.weather;
    if (!weather) return undefined;
    if (this.seasonDay !== null) return weather;
    const year = seasonYearAt(Date.now(), this.deps.worldClock());
    return weather.year === year ? weather : undefined;
  }
}
