import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GameScene, Vector3 } from '@van-thuong/shared';

/**
 * Owns the browser-only 3D controls. React Three Fiber supplies the renderer,
 * scene and camera; the server, NOT this class, owns the actual world position.
 */
export class SceneEngine {
  private readonly keys = new Set<string>();
  private touchInput = { right: 0, forward: 0 };
  private readonly loader = new GLTFLoader();
  private readonly hemisphere: THREE.HemisphereLight;
  private readonly sun: THREE.DirectionalLight;
  private readonly direction = new THREE.Vector3();
  private readonly desiredCamera = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly cameraAim = new THREE.Vector3();
  private dragging = false;
  private previousPointerX = 0;
  private previousPointerY = 0;
  /** Left-button press bookkeeping so a camera drag never fires a stray attack. */
  private primaryDown = false;
  private primaryStartX = 0;
  private primaryStartY = 0;
  private primaryStartAt = 0;
  private primaryAction: (() => void) | null = null;
  /** Y lock: the camera trails the character's facing instead of orbiting manually. */
  private cameraLocked = false;
  /** Space: purely visual hop of the avatar, timed here so it survives avatar re-renders. */
  private jumpStartedAt = 0;
  private static readonly JUMP_MS = 640;
  private static readonly JUMP_HEIGHT = 1.35;
  private yaw = 0.27;
  private pitch = 0.31;
  private distance = 14;
  private lastRotation = Math.PI;
  private cinematicUntil = 0;
  private shakeUntil = 0;
  private isTribulation = false;
  private isWilderness = false;
  private isAscendant = false;
  private isInterior = false;
  private isAdminSky = false;
  private wasCinematic = false;
  private previewView: 'body' | 'face' | null = null;
  private previousGameYaw: number | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly canvas: HTMLCanvasElement,
  ) {
    scene.background = new THREE.Color('#8bb8bb');
    scene.fog = new THREE.FogExp2('#88adb0', 0.0095);

    this.hemisphere = new THREE.HemisphereLight('#e5fbff', '#284653', 1.6);
    this.sun = new THREE.DirectionalLight('#ffebc8', 2.35);
    this.sun.position.set(-16, 28, 12);
    this.sun.castShadow = true;
    const shadowResolution = window.matchMedia('(max-width: 720px)').matches ? 1024 : 2048;
    this.sun.shadow.mapSize.set(shadowResolution, shadowResolution);
    this.sun.shadow.camera.left = -42;
    this.sun.shadow.camera.right = 42;
    this.sun.shadow.camera.top = 42;
    this.sun.shadow.camera.bottom = -42;
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 90;
    this.sun.shadow.bias = -0.0002;
    scene.add(this.hemisphere, this.sun, this.sun.target);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('contextmenu', this.onContextMenu);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  /** Load an optional GLB/GLTF avatar; the procedural skinned avatar is the fallback. */
  async loadGLTF(url: string): Promise<THREE.Group> {
    const gltf = await this.loader.loadAsync(url);
    gltf.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    return gltf.scene;
  }

  /** Left click attacks; the callback is provided by the scene so it can use the live target. */
  setPrimaryAction(action: (() => void) | null): void {
    this.primaryAction = action;
  }

  /**
   * Y: locked third person. The body always faces away from the camera, the camera swings
   * around behind it (mouse or A/D), and it never flips to a first-person or top-down shot.
   */
  setCameraLock(locked: boolean, facing = this.lastRotation): void {
    if (this.cameraLocked === locked) return;
    this.cameraLocked = locked;
    this.dragging = false;
    if (locked) {
      // Snap immediately so the first frame after Y already looks over the shoulder.
      this.yaw = facing + Math.PI;
      this.lastRotation = facing;
      this.pitch = THREE.MathUtils.clamp(this.pitch, 0.08, 0.42) || 0.27;
      this.distance = THREE.MathUtils.clamp(this.distance, 4.6, 10);
    }
  }

  isCameraLocked(): boolean { return this.cameraLocked; }

  /** Space: hop in place. The server position never leaves the ground plane. */
  triggerJump(): void { this.jumpStartedAt = performance.now(); }

  private jumpOffset(): number {
    if (!this.jumpStartedAt) return 0;
    const progress = (performance.now() - this.jumpStartedAt) / SceneEngine.JUMP_MS;
    if (progress >= 1) { this.jumpStartedAt = 0; return 0; }
    return Math.sin(Math.max(0, progress) * Math.PI) * SceneEngine.JUMP_HEIGHT;
  }

  setTouchInput(right: number, forward: number): void {
    this.touchInput = { right: THREE.MathUtils.clamp(right, -1, 1), forward: THREE.MathUtils.clamp(forward, -1, 1) };
  }

  /** Snap camera and input with the authoritative avatar when changing maps (never fly between islands). */
  enterZone(zone: GameScene, position: Vector3): void {
    this.keys.clear();
    this.touchInput = { right: 0, forward: 0 };
    // Place the camera to the side of the room's entry door. Otherwise the exit door
    // blocks the avatar and its sprite fills the screen on arrival.
    const interior = zone === 'residence' || zone === 'sanctum';
    const safeOpen = zone === 'overworld' || zone === 'village';
    this.distance = safeOpen ? 7.1 : interior ? 5.0 : zone === 'tribulation' ? 12 : 7.5;
    this.pitch = zone === 'tribulation' ? 0.34 : interior ? 0.24 : 0.27;
    // Third-person chase axis: W advances away from the camera, never toward it.
    // The sect spawns facing +Z; wilderness, Ascendant and private rooms face -Z.
    this.yaw = safeOpen ? Math.PI : interior ? 0.85 : 0;
    this.lastRotation = zone === 'overworld' ? 0 : Math.PI;
    this.lookAt.set(position.x, position.y + 1.65, position.z);
    this.camera.position.set(
      this.lookAt.x + Math.sin(this.yaw) * Math.cos(this.pitch) * this.distance,
      this.lookAt.y + Math.sin(this.pitch) * this.distance + 1.2,
      this.lookAt.z + Math.cos(this.yaw) * Math.cos(this.pitch) * this.distance,
    );
    this.camera.lookAt(this.lookAt);
  }

  /** The real human's face morphs are visible close up; entering the world restores game framing. */
  setPreviewView(view: 'body' | 'face' | null, facing?: number): void {
    if (view === this.previewView) return;
    if (view && facing !== undefined && this.previousGameYaw === null) {
      this.previousGameYaw = this.yaw;
      this.yaw = facing; // character editor: view the actual face, not the back of the head
    }
    if (!view && this.previousGameYaw !== null) {
      this.yaw = this.previousGameYaw;
      this.previousGameYaw = null;
    }
    this.previewView = view;
    this.distance = view === 'face' ? 1.7 : view === 'body' ? 5.3 : this.isInterior ? 5.0 : this.isWilderness || this.isAscendant ? 7.5 : 7.1;
    this.pitch = view === 'face' ? 0.05 : view === 'body' ? 0.18 : this.isTribulation ? 0.34 : this.isInterior ? 0.24 : 0.27;
  }

  getMovement(): { x: number; z: number; rotation: number } {
    const forward = Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) - Number(this.keys.has('KeyS') || this.keys.has('ArrowDown')) + this.touchInput.forward;
    const right = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft')) + this.touchInput.right;
    const magnitude = Math.min(1, Math.hypot(forward, right));
    this.direction.set(
      right * Math.cos(this.yaw) - forward * Math.sin(this.yaw),
      0,
      -right * Math.sin(this.yaw) - forward * Math.cos(this.yaw),
    );
    if (this.cameraLocked) {
      // Locked TPP: the body always faces away from the camera. Deriving the facing from the
      // strafe vector instead would spin the character in a circle while the camera chases it.
      if (magnitude > 0.08) this.direction.normalize().multiplyScalar(magnitude);
      else this.direction.set(0, 0, 0);
      const facing = Math.atan2(Math.sin(this.yaw + Math.PI), Math.cos(this.yaw + Math.PI));
      this.lastRotation = facing;
      return { x: this.direction.x, z: this.direction.z, rotation: facing };
    }
    if (magnitude > 0.08) {
      this.direction.normalize().multiplyScalar(magnitude);
      this.lastRotation = Math.atan2(this.direction.x, this.direction.z);
    } else this.direction.set(0, 0, 0);
    return { x: this.direction.x, z: this.direction.z, rotation: this.lastRotation };
  }

  /** Client prediction is only visual; snapshots from the server reconcile it. */
  update(
    delta: number,
    avatar: THREE.Object3D | null,
    serverPosition: { x: number; y: number; z: number },
    movementSpeed: number,
    canMove: boolean,
  ): void {
    const dt = Math.min(delta, 0.05);
    if (avatar) {
      if (canMove) {
        const { x, z, rotation } = this.getMovement();
        avatar.position.x += x * movementSpeed * dt;
        avatar.position.z += z * movementSpeed * dt;
        // A locked camera also turns a standing body so it keeps facing away from the view.
        if (x !== 0 || z !== 0 || this.cameraLocked) avatar.rotation.y = rotation;
      }
      this.target.set(serverPosition.x, serverPosition.y, serverPosition.z);
      if (avatar.position.distanceTo(this.target) > 6) avatar.position.copy(this.target);
      else avatar.position.lerp(this.target, Math.min(1, dt * 5));
      // Applied after the reconciliation lerp so the hop is not pulled back to the ground.
      const hop = this.jumpOffset();
      if (hop > 0) avatar.position.y += hop;
      this.lookAt.copy(avatar.position).add(new THREE.Vector3(0, this.previewView === 'face' ? 1.62 : this.previewView ? 1.03 : 1.65, 0));
    } else {
      this.lookAt.set(0, this.previewView === 'face' ? 1.62 : 1.65, 0);
    }

    // Locked camera keeps a stable over-the-shoulder angle; only zoom stays manual.
    if (this.cameraLocked && !this.previewView) {
      this.pitch += (THREE.MathUtils.clamp(this.pitch, 0.08, 0.42) - this.pitch) * Math.min(1, dt * 2.2);
    }

    const cinematic = performance.now() < this.cinematicUntil;
    if (cinematic !== this.wasCinematic) {
      this.wasCinematic = cinematic;
      this.applyAtmosphere();
    }
    if (cinematic && avatar) {
      // Cut IN FRONT of the character's face, not behind their back.
      this.desiredCamera.copy(this.lookAt).add(new THREE.Vector3(
        Math.sin(avatar.rotation.y) * 3.2, 0.35, Math.cos(avatar.rotation.y) * 3.2,
      ));
    } else {
      this.desiredCamera.set(
        this.lookAt.x + Math.sin(this.yaw) * Math.cos(this.pitch) * this.distance,
        this.lookAt.y + Math.sin(this.pitch) * this.distance + (this.previewView === 'face' ? 0 : this.previewView ? 0.1 : 1.2),
        this.lookAt.z + Math.cos(this.yaw) * Math.cos(this.pitch) * this.distance,
      );
    }
    // Looking up requires a negative pitch. Keep the camera above the ground and
    // raise its aim separately; a simple negative orbit would bury it below terrain.
    const skyward = !this.isInterior && !this.previewView && !cinematic ? Math.max(0, -this.pitch) : 0;
    if (skyward && avatar) this.desiredCamera.y = Math.max(this.desiredCamera.y, avatar.position.y + 1.35);
    this.cameraAim.copy(this.lookAt).addScaledVector(THREE.Object3D.DEFAULT_UP, skyward * this.distance * 1.35);
    // Keep an interior chase camera on the player's side of the walls even after
    // zooming, rotating, or walking right up to a cupboard.
    if (this.isInterior && avatar) {
      this.desiredCamera.x = THREE.MathUtils.clamp(this.desiredCamera.x, -7.35, 7.35);
      this.desiredCamera.z = THREE.MathUtils.clamp(this.desiredCamera.z, -7.35, 7.7);
      this.desiredCamera.y = Math.min(this.desiredCamera.y, 5.05);
    }
    this.camera.position.lerp(this.desiredCamera, Math.min(1, dt * (cinematic ? 5 : 6)));
    if (performance.now() < this.shakeUntil) {
      this.camera.position.x += (Math.random() - 0.5) * 0.12;
      this.camera.position.y += (Math.random() - 0.5) * 0.12;
    }
    this.camera.lookAt(this.cameraAim);
  }

  playCinematic(durationMs = 1550): void {
    this.cinematicUntil = performance.now() + durationMs;
  }

  shake(durationMs = 440): void {
    this.shakeUntil = performance.now() + durationMs;
  }

  setAtmosphere(tribulation: boolean, admin: boolean, wilderness = false, ascendant = false, interior = false): void {
    this.isTribulation = tribulation;
    this.isAdminSky = admin;
    this.isWilderness = wilderness;
    this.isAscendant = ascendant;
    this.isInterior = interior;
    this.applyAtmosphere();
  }

  private applyAtmosphere(): void {
    const dark = this.isTribulation || this.wasCinematic;
    const color = dark ? '#171729' : this.isInterior ? '#342f42' : this.isAscendant ? '#9cbad2' : this.isAdminSky ? '#b97c68' : this.isWilderness ? '#828e9e' : '#8bb8bb';
    this.scene.background = new THREE.Color(color);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.set(color);
      this.scene.fog.density = dark ? 0.023 : this.isInterior ? 0.007 : this.isAscendant ? 0.012 : this.isWilderness ? 0.016 : 0.008;
    }
    this.sun.color.set(dark ? '#b1a5ed' : this.isInterior ? '#f2d6c5' : this.isAscendant ? '#e3f2ff' : this.isAdminSky ? '#ffb77a' : this.isWilderness ? '#e1d0c1' : '#ffebc8');
    this.hemisphere.intensity = dark ? 0.65 : this.isInterior ? 1.2 : this.isAscendant ? 1.85 : this.isWilderness ? 1.15 : 1.6;
  }

  dispose(): void {
    this.scene.remove(this.hemisphere, this.sun, this.sun.target);
    this.hemisphere.dispose();
    this.sun.dispose();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.canvas.removeEventListener('wheel', this.onWheel);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.target instanceof HTMLElement && (event.target.closest('input, textarea, select, [contenteditable="true"]'))) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      this.keys.add(event.code);
      if (event.code.startsWith('Arrow')) event.preventDefault();
    }
  };
  private onKeyUp = (event: KeyboardEvent): void => { this.keys.delete(event.code); };
  private onBlur = (): void => {
    this.keys.clear(); this.touchInput = { right: 0, forward: 0 };
    this.dragging = false; this.primaryDown = false;
  };
  private onContextMenu = (event: Event): void => { event.preventDefault(); };
  private onPointerDown = (event: PointerEvent): void => {
    // Right button (or a touch drag) orbits the camera; the left button attacks on release.
    if (event.button === 2 || event.pointerType === 'touch') {
      this.dragging = true;
      this.previousPointerX = event.clientX;
      this.previousPointerY = event.clientY;
      this.canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    this.primaryDown = true;
    this.primaryStartX = event.clientX;
    this.primaryStartY = event.clientY;
    this.primaryStartAt = performance.now();
    this.canvas.setPointerCapture(event.pointerId);
  };
  private onPointerMove = (event: PointerEvent): void => {
    // Left button: a click attacks, but dragging past a small threshold turns into a camera orbit.
    if (!this.dragging && this.primaryDown && event.buttons === 1 &&
        Math.hypot(event.clientX - this.primaryStartX, event.clientY - this.primaryStartY) > 10) {
      this.dragging = true;
      this.previousPointerX = this.primaryStartX;
      this.previousPointerY = this.primaryStartY;
    }
    if (!this.dragging) return;
    // Panning still works while locked: the camera sweeps around and the body turns with it,
    // it just can never drop into a first-person or top-down angle.
    this.yaw -= (event.clientX - this.previousPointerX) * 0.006;
    const minPitch = this.cameraLocked ? 0.06 : this.isInterior || this.previewView ? 0.18 : -1.15;
    const maxPitch = this.cameraLocked ? 0.68 : 1.13;
    this.pitch = THREE.MathUtils.clamp(this.pitch + (event.clientY - this.previousPointerY) * 0.004, minPitch, maxPitch);
    this.previousPointerX = event.clientX;
    this.previousPointerY = event.clientY;
  };
  private onPointerUp = (event: PointerEvent): void => {
    this.dragging = false;
    if (!this.primaryDown) return;
    this.primaryDown = false;
    // Only a real click counts as an attack: dragging the camera or aiming must not swing.
    const moved = Math.hypot(event.clientX - this.primaryStartX, event.clientY - this.primaryStartY);
    if (event.button === 0 && moved <= 9 && performance.now() - this.primaryStartAt <= 420) this.primaryAction?.();
  };
  private onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const [min, max] = this.previewView === 'face' ? [1.2, 3.5] : this.previewView ? [3.2, 8]
      : this.isInterior ? [3.2, 5.6] : [5.2, 23];
    this.distance = THREE.MathUtils.clamp(this.distance + event.deltaY * 0.015, min, max);
  };
}
