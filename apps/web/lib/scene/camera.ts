import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import { CAMERA_ZOOM_M } from './constants';
import { edgeScrollDirection } from './edge-scroll';

/**
 * Pohled šikmo shora jako v AoE2 (úhel od svislice, rad) – 41° pod vodorovnou, 0 A.D. má 35°.
 * Změna = nový render atlasu impostorů (`tools/blender/impostors.py`).
 */
const BETA = 0.85;
/** Natočení kamery na začátku a po R – kamera stojí na −z a dívá se k +z (sever nahoře). */
const HOME_ALPHA = -Math.PI / 2;
/** Zorný úhel (svislý, rad) – 45° jako `fov` v 0 A.D. */
const FOV = Math.PI / 4;
/**
 * Krok přiblížení kolečkem (podíl vzdálenosti): jeden zub (deltaY 100) ≈ čtvrtina vzdálenosti –
 * od výchozího přiblížení ≈ 30 m jako zub kolečka v 0 A.D. (32), celý rozsah na 13 zubů.
 */
const WHEEL_DELTA_PERCENTAGE = 0.03;
const ROTATE_SPEED = 1.4; // rad/s pro Q/E
/** Rychlost posunu klávesami a okrajem okna – podíl vzdálenosti kamery za sekundu. */
const PAN_SPEED = 0.9;
const KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'KeyQ',
  'KeyE',
]);

export interface RtsCamera {
  camera: ArcRotateCamera;
  /** Zpracuje vstupy za uplynulý čas; vrátí true, když se změnil pohled (je co překreslit). */
  update(dtSeconds: number): boolean;
  /** Kam vrátí pohled klávesa R (ves – první obydlí, jinak místo vsi). */
  setHome(x: number, z: number): void;
  /** Přesune cíl kamery na bod krajiny (minimapa). */
  moveTo(x: number, z: number): void;
  /** Výchozí pohled na ves (R): domov, natočení k severu, výchozí přiblížení. */
  reset(): void;
  dispose(): void;
}

/** Je událost klávesnice z pole formuláře (psaní jména vsi) – kamera ji pak nechá být? */
function fromFormField(event: KeyboardEvent): boolean {
  const target = event.target instanceof Element ? event.target : null;
  return target?.closest('input, textarea, select, [contenteditable="true"]') !== null;
}

/**
 * Kamera ve stylu 0 A.D.: prostřední tlačítko posouvá, kolečko přibližuje; WASD / šipky
 * a myš u okraje okna posouvají, Q/E otáčejí, R vrátí pohled na ves. Levé a pravé tlačítko
 * kamera nechává výběru a umisťování. Cíl kamery drží na terénu uvnitř krajiny.
 */
export function createRtsCamera(
  scene: Scene,
  canvas: HTMLCanvasElement,
  options: {
    halfExtent: number;
    start: { x: number; z: number };
    groundHeight: (x: number, z: number) => number;
  },
): RtsCamera {
  const { halfExtent, groundHeight } = options;
  const home = { ...options.start };
  const camera = new ArcRotateCamera(
    'camera',
    HOME_ALPHA,
    BETA,
    CAMERA_ZOOM_M.default,
    new Vector3(home.x, groundHeight(home.x, home.z), home.z),
    scene,
  );
  camera.fov = FOV;
  camera.lowerBetaLimit = BETA;
  camera.upperBetaLimit = BETA;
  camera.lowerRadiusLimit = CAMERA_ZOOM_M.min;
  camera.upperRadiusLimit = CAMERA_ZOOM_M.max;
  camera.wheelDeltaPercentage = WHEEL_DELTA_PERCENTAGE;
  camera.mapPanning = true;
  camera.minZ = 1;
  camera.maxZ = 6000;
  camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
  // noPreventDefault = false: kolečko a gesto přiblížení nezoomují stránku a vodorovný swipe
  // na trackpadu nevrací prohlížeč zpět.
  camera.attachControl(canvas, false);
  // Jako v 0 A.D.: prostřední tlačítko posouvá, kolečko přibližuje. Levé vybírá a staví,
  // pravé ruší – kameru nehýbou.
  camera.movement.input.inputMap = [
    { source: 'pointer', button: 1, interaction: 'pan' },
    { source: 'wheel', interaction: 'zoom' },
  ];

  const pressed = new Set<string>();
  /** Kurzor u okraje okna (posun krajiny), nebo null. */
  let pointer: { x: number; y: number; blocked: boolean } | null = null;

  const clamp = (): void => {
    const target = camera.target;
    target.x = Math.min(halfExtent, Math.max(-halfExtent, target.x));
    target.z = Math.min(halfExtent, Math.max(-halfExtent, target.z));
    target.y = groundHeight(target.x, target.z);
  };
  const moveTo = (x: number, z: number): void => {
    camera.target.x = x;
    camera.target.z = z;
    clamp();
    // Babylon jinak dotáhne rozjetou setrvačnost posunu – pohled by po skoku ještě ujel.
    camera.inertialPanningX = 0;
    camera.inertialPanningY = 0;
  };
  const reset = (): void => {
    camera.alpha = HOME_ALPHA;
    camera.radius = CAMERA_ZOOM_M.default;
    camera.inertialAlphaOffset = 0;
    camera.inertialRadiusOffset = 0;
    moveTo(home.x, home.z);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey || fromFormField(event)) return;
    if (KEYS.has(event.code)) pressed.add(event.code);
    if (event.code === 'KeyR' && !event.repeat) reset();
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    pressed.delete(event.code);
  };
  const onBlur = (): void => {
    pressed.clear();
    pointer = null;
  };
  const onPointerMove = (event: PointerEvent): void => {
    const target = event.target instanceof Element ? event.target : null;
    // Nad panely rozhraní (minimapa, nabídka staveb…) se krajina okrajem neposouvá.
    pointer = {
      x: event.clientX,
      y: event.clientY,
      blocked: target !== canvas && target?.closest('[data-hud-block]') !== null,
    };
  };
  const onMouseOut = (event: MouseEvent): void => {
    if (event.relatedTarget === null) pointer = null; // kurzor opustil okno
  };
  const onContextMenu = (event: Event): void => event.preventDefault();
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  window.addEventListener('pointermove', onPointerMove);
  document.addEventListener('mouseout', onMouseOut);
  canvas.addEventListener('contextmenu', onContextMenu);

  const lastView = new Matrix();
  let hasView = false;

  const update = (dt: number): boolean => {
    // Krajina se při tažení posouvá zhruba s kurzorem, při každém přiblížení.
    camera.panningSensibility = 14_000 / camera.radius;

    const forward = new Vector3(-Math.cos(camera.alpha), 0, -Math.sin(camera.alpha));
    const right = new Vector3(Math.sin(camera.alpha), 0, -Math.cos(camera.alpha));
    const move = Vector3.Zero();
    if (pressed.has('KeyW') || pressed.has('ArrowUp')) move.addInPlace(forward);
    if (pressed.has('KeyS') || pressed.has('ArrowDown')) move.subtractInPlace(forward);
    if (pressed.has('KeyD') || pressed.has('ArrowRight')) move.subtractInPlace(right);
    if (pressed.has('KeyA') || pressed.has('ArrowLeft')) move.addInPlace(right);
    if (pointer && !pointer.blocked) {
      const edge = edgeScrollDirection(pointer, { width: innerWidth, height: innerHeight });
      move.addInPlace(right.scale(-edge.x)).addInPlace(forward.scale(-edge.y));
    }
    if (move.lengthSquared() > 0) {
      camera.target.addInPlace(move.normalize().scale(camera.radius * PAN_SPEED * dt));
    }
    if (pressed.has('KeyQ')) camera.alpha -= ROTATE_SPEED * dt;
    if (pressed.has('KeyE')) camera.alpha += ROTATE_SPEED * dt;
    clamp();

    // Vstupy myši a setrvačnost – scéna se pak kreslí bez další aktualizace kamery.
    camera.update();
    const view = camera.getViewMatrix(true);
    const changed = !hasView || !view.equals(lastView);
    lastView.copyFrom(view);
    hasView = true;
    return changed;
  };

  return {
    camera,
    update,
    setHome(x: number, z: number): void {
      home.x = x;
      home.z = z;
    },
    moveTo,
    reset,
    dispose(): void {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('mouseout', onMouseOut);
      canvas.removeEventListener('contextmenu', onContextMenu);
      camera.detachControl();
    },
  };
}
