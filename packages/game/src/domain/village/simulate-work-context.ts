// Sdílený stav dne práce (`work()` v simulate-work.ts) a výsledky jeho kroků, které čtou kroky
// v dalších souborech (simulate-work-people.ts, simulate-work-apply.ts). Kroky běží v pevném
// pořadí jako dřív jedna funkce – stejné losy, mutace stavu i pořadí klíčů (village-core.md –
// Pořadí práce dne).
import type { Landscape, ObstacleLayer } from '../landscape';
import type { CartFleet, HaulPlan, villageCartAccess } from './carts';
import type { CartDemandToday } from './draft';
import type { CartDrives } from './cart-jobs';
import type {
  burnerPlans,
  craftHouseholds,
  ironTravellers,
  restingCrafters,
  smithBellowsToday,
} from './crafts';
import type { harvestHandsDay } from './harvest-hands';
import type { dayChores } from './day-chores';
import type { manorLabor, trainingFamily } from './lord';
import type { villagersToday } from './morning-water';
import type { householdWater } from './labor';
import type { charcoalDeliveries } from './smith-supply';
import type { PloughTravels } from './plough-trip';
import type { herdingDay } from './herding';
import type { walkPurchases } from './craft-buying';
import type { ironTripShares } from './cart-iron';
import type { workExpeditions } from './trade';
import type { CartJobsDay, LogHaul, SmithCartsDay, smithFetchPlans } from './simulate-hauls';
import type { DayTask, FieldTaskEntry, occupiedDwellings } from './simulate-plan';
import type { CartTripLog, CraftCoverage, Crop, CropWork, FieldPart, VillageState } from './types';

/** Kontext dne práce – vstupy `work()` a hodnoty dne, které čte víc kroků. */
export interface WorkDay {
  readonly state: VillageState;
  readonly day: number;
  readonly obstacles: ObstacleLayer | null;
  readonly coverage: CraftCoverage;
  readonly landscape: Landscape | null;
  /** plodiny, jejichž díly čekají na čelo práce (`settlePloughTeams`) */
  readonly waiting: ReadonlySet<Crop>;
  readonly month: number;
  /** jízdy vozů dne (svoz, voda, uhlí, ruda, klády, osivo) – zapíše `flushCartTrips` */
  readonly cartLog: CartTripLog;
  readonly partsById: ReadonlyMap<number, FieldPart>;
  /** délka dne (population.md – Skladba dne podle ročního období) */
  readonly daylight: number;
  /** co by dnes vozy ušetřily (`addCartDemand` – wagons.md, Kolik vozů ves chce) */
  readonly demand: CartDemandToday;
  /** cesty dvoukoláků a čtyřkoláků – spočtou se jednou za den, až je někdo potřebuje */
  readonly drivesOf: () => CartDrives | null;
  readonly drives4Of: () => CartDrives | null;
}

/** Orba dne – kapacita spřežení a jejich cesty (oxen.md). */
export interface PloughDay {
  readonly teamsCap: number;
  readonly ploughCap: number;
  /** spřežení je na poli od rána (oxen.md – Spřežení zůstane na poli) */
  readonly afield: boolean;
  readonly travels: PloughTravels;
  readonly ploughFactor: (cropWork: CropWork) => number;
}

/** Úlohy dne v pořadí důležitosti (`dayTaskOrder` – DAY_WORK_ORDER). */
export interface DayTaskList {
  /** polní úlohy dne (`fieldTasks`) */
  readonly owned: FieldTaskEntry[];
  readonly dayTasks: DayTask[];
  /** do obilných jam ještě přibude zrno (`grainPitTask`) */
  readonly moreGrain: boolean;
  readonly pitSite: () => { x: number; z: number } | null;
}

type CartAccessToday = ReturnType<typeof villageCartAccess>;

/** Vozy dne – flotila, dosah a svoz u úloh dne (wagons.md – Vůz). */
export interface DayCartPlan {
  readonly ploughing: boolean;
  readonly fleet: CartFleet;
  readonly access: CartAccessToday;
  readonly roadAccess: CartAccessToday;
  readonly fourAccess: CartAccessToday;
  readonly hauls: Map<DayTask, HaulPlan>;
}

/** Kdo dnes pracuje se vsí, řemeslníci, rodina vojvody a voda domácností. */
export interface DayPeople {
  readonly households: ReturnType<typeof occupiedDwellings>;
  readonly repairNeeds: number[];
  readonly repairNeed: number;
  readonly productivity: number;
  readonly burners: ReturnType<typeof burnerPlans>;
  readonly resting: ReturnType<typeof restingCrafters>;
  readonly crafts: ReturnType<typeof craftHouseholds>;
  readonly travelling: ReturnType<typeof ironTravellers>;
  readonly family: ReturnType<typeof trainingFamily>;
  readonly villagers: ReturnType<typeof villagersToday>['villagers'];
  readonly manorSkip: ReturnType<typeof villagersToday>['manorSkip'];
  readonly harvestDay: ReturnType<typeof harvestHandsDay>;
  readonly chores: ReturnType<typeof dayChores>;
  readonly waterNeeds: ReturnType<typeof householdWater>;
  readonly manor: ReturnType<typeof manorLabor> | null;
  readonly deliveries: ReturnType<typeof charcoalDeliveries>;
}

/** Jízdy vozů dne domluvené před rozdělením práce (klády, uhlí, ruda, hlína, voda). */
export interface DayCartJobs {
  readonly logs: LogHaul[];
  readonly logPlan: HaulPlan;
  /** jízdy před vodou ráno ve dny orby (`morningWaterDay` je smí doplnit) */
  readonly jobs: CartJobsDay;
  /** uhlí ke kováři, který dnes pracuje se vsí */
  readonly restingFetch: ReturnType<typeof smithFetchPlans>;
  readonly restingCarry: number;
}

/** Uhlí a ruda ke kovářům, pasení a cesty k sousedům po úlohách dne. */
export interface DayTravel {
  readonly smithCarts: SmithCartsDay;
  readonly fetchPlans: ReturnType<typeof smithFetchPlans>;
  readonly bellows: ReturnType<typeof smithBellowsToday>;
  readonly herding: ReturnType<typeof herdingDay>;
  readonly purchases: (
    ReturnType<typeof walkPurchases>[number] | ReturnType<typeof ironTripShares>[number]
  )[];
  readonly trade: ReturnType<typeof workExpeditions>;
}
