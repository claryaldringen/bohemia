import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';

/** Pohled šikmo shora jako v AoE2 (úhel od svislice, rad). */
const BETA = 0.85;
const MIN_RADIUS = 150;
const MAX_RADIUS = 1400;
const ROTATE_SPEED = 1.4; // rad/s pro Q/E
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
  dispose(): void;
}

/**
 * Kamera ve stylu strategií: levé tlačítko posouvá, pravé otáčí kolem svislé osy, kolečko
 * přibližuje; WASD/šipky posouvají, Q/E otáčejí. Cíl kamery drží na terénu uvnitř krajiny.
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
  const { halfExtent, start, groundHeight } = options;
  const camera = new ArcRotateCamera(
    'camera',
    -Math.PI / 2,
    BETA,
    650,
    new Vector3(start.x, groundHeight(start.x, start.z), start.z),
    scene,
  );
  camera.lowerBetaLimit = BETA;
  camera.upperBetaLimit = BETA;
  camera.lowerRadiusLimit = MIN_RADIUS;
  camera.upperRadiusLimit = MAX_RADIUS;
  camera.wheelDeltaPercentage = 0.02;
  camera.mapPanning = true;
  camera.minZ = 1;
  camera.maxZ = 6000;
  camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
  // noPreventDefault = false: kolečko a gesto přiblížení nezoomují stránku a vodorovný swipe
  // na trackpadu nevrací prohlížeč zpět.
  camera.attachControl(canvas, false);
  // Babylon 9 má výchozí mapu vstupů levé = otáčení, pravé = posun; strategie chce opak.
  camera.movement.input.inputMap = [
    { source: 'pointer', button: 0, interaction: 'pan' },
    { source: 'pointer', button: 2, interaction: 'rotate' },
    { source: 'wheel', interaction: 'zoom' },
  ];

  const pressed = new Set<string>();
  const onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    if (event.ctrlKey || event.metaKey || target?.closest('input, textarea, select')) return;
    if (KEYS.has(event.code)) pressed.add(event.code);
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    pressed.delete(event.code);
  };
  const onBlur = (): void => pressed.clear();
  const onContextMenu = (event: Event): void => event.preventDefault();
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
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
    if (move.lengthSquared() > 0)
      camera.target.addInPlace(move.normalize().scale(camera.radius * 0.9 * dt));
    if (pressed.has('KeyQ')) camera.alpha -= ROTATE_SPEED * dt;
    if (pressed.has('KeyE')) camera.alpha += ROTATE_SPEED * dt;

    const target = camera.target;
    target.x = Math.min(halfExtent, Math.max(-halfExtent, target.x));
    target.z = Math.min(halfExtent, Math.max(-halfExtent, target.z));
    target.y = groundHeight(target.x, target.z);

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
    dispose(): void {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('contextmenu', onContextMenu);
      camera.detachControl();
    },
  };
}
