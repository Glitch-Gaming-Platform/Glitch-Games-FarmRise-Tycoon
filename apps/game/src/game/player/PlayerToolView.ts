/**
 * Authored tool silhouettes and contact accents for the three farm-work verbs.
 *
 * The farmer mesh is deliberately one inexpensive asset, so tools live as
 * separate palette-bound meshes and are posed at runtime. This makes watering
 * and harvesting readable at the gameplay camera without adding a skeleton or
 * duplicating the character for every action.
 */
import * as THREE from 'three';
import type { ModelLibrary } from '@assets/registries/ModelLibrary.js';
import type { WorkAction } from './Player.js';

const WATERING_CAN = 'SM_tool_watering_can';
const SICKLE = 'SM_tool_sickle';
const TROWEL = 'SM_tool_trowel';

/**
 * Where the spout's rose sits in the can's own local space, in metres.
 *
 * `tool_watering_can()` builds the spout along Blender's +X, ending in a rose
 * at `(0.60, 0, 0.39)`; the glTF exporter's Y-up conversion maps that to
 * `(x, z, -y)`, so in Three.js the spout runs along local **+X** with zero Z.
 * Measured off the built mesh rather than copied from the builder call, so it
 * accounts for the rose's own radius.
 *
 * This is the number that makes the can point somewhere. The farmer faces +Z,
 * so a can left in its authored orientation pours across their body instead of
 * out in front of them.
 */
const SPOUT_TIP_LOCAL = new THREE.Vector3(0.595, 0.327, 0);

/**
 * Where the can's timber handle sits in its own local space, in metres.
 *
 * The handle is the end the hand actually holds, and it is 0.16 m *behind* the
 * can's origin. `gripPosition` used to hand the arm IK the origin instead, so
 * the farmer gripped the middle of the water tank. That was survivable while
 * the can lay across the body, and stops being so once it is turned to face
 * front, because the handle then swings up to shoulder height.
 */
const CAN_HANDLE_LOCAL = new THREE.Vector3(-0.161, 0.258, 0);

/** Where the off hand steadies the can: the collar where the spout leaves the tank. */
const CAN_SUPPORT_LOCAL = new THREE.Vector3(0.14, 0.23, 0);

/**
 * Yaw that turns the spout from its authored +X to the farmer's facing, +Z.
 *
 * Rotating about Y by -90 degrees maps local +X onto +Z. The previous pose
 * used a yaw of 0.1 rad - about six degrees - which left the spout very nearly
 * along +X, pointing out of the farmer's right hip. Every other watering
 * number was then tuned around that mistake: the stream and splash were placed
 * off to the side because that genuinely was where the water would have come
 * out.
 */
const SPOUT_FORWARD_YAW = -Math.PI / 2;

/** Height of the ground contact ring under the pour, in metres. */
const SPLASH_HEIGHT = 0.055;

export class PlayerToolView {
  readonly object = new THREE.Group();
  readonly #wateringCan: THREE.Mesh;
  readonly #sickle: THREE.Mesh;
  readonly #trowel: THREE.Mesh;
  readonly #waterStream: THREE.Mesh;
  readonly #waterDrops: THREE.InstancedMesh;
  readonly #waterSplash: THREE.Mesh;
  readonly #harvestArc: THREE.Mesh;
  readonly #owned: Array<THREE.BufferGeometry | THREE.Material> = [];
  readonly #usesLibrary: boolean;
  readonly #matrix = new THREE.Matrix4();
  readonly #position = new THREE.Vector3();
  readonly #scale = new THREE.Vector3();
  readonly #rotation = new THREE.Quaternion();
  /** Spout tip in actor-local space, recomputed from the can's pose each frame. */
  readonly #spoutTip = new THREE.Vector3();

  constructor(library: ModelLibrary | null) {
    this.#usesLibrary = Boolean(
      library?.has(WATERING_CAN) && library.has(SICKLE) && library.has(TROWEL),
    );

    if (this.#usesLibrary && library) {
      // Handheld tools are tiny, fast-moving gameplay symbols. A fully lit
      // material let the blade and handle fall to near-black whenever the
      // work pose turned them away from the sun. Keep their authored vertex
      // colours, but render them unlit so watering and harvesting never read
      // as detached black shapes.
      const toolMaterial = new THREE.MeshBasicMaterial({
        vertexColors: true,
        toneMapped: true,
      });
      toolMaterial.name = 'M_FarmRise_ReadableTools';
      this.#owned.push(toolMaterial);
      this.#wateringCan = new THREE.Mesh(library.require(WATERING_CAN), toolMaterial);
      this.#sickle = new THREE.Mesh(library.require(SICKLE), toolMaterial);
      this.#trowel = new THREE.Mesh(library.require(TROWEL), toolMaterial);
    } else {
      const teal = new THREE.MeshStandardMaterial({ color: 0x3f7a82, roughness: 0.85 });
      const metal = new THREE.MeshStandardMaterial({ color: 0xa9b4ba, roughness: 0.82 });
      const timber = new THREE.MeshStandardMaterial({ color: 0x9c6b3f, roughness: 0.88 });
      const can = new THREE.CylinderGeometry(0.17, 0.15, 0.25, 8);
      const sickle = new THREE.BoxGeometry(0.08, 0.48, 0.055);
      const trowel = new THREE.ConeGeometry(0.1, 0.46, 5);
      this.#owned.push(teal, metal, timber, can, sickle, trowel);
      this.#wateringCan = new THREE.Mesh(can, teal);
      this.#sickle = new THREE.Mesh(sickle, metal);
      this.#trowel = new THREE.Mesh(trowel, timber);
    }

    for (const tool of [this.#wateringCan, this.#sickle, this.#trowel]) {
      tool.castShadow = true;
      tool.visible = false;
      tool.renderOrder = 2;
    }
    this.#wateringCan.name = 'FarmTool_WateringCan';
    this.#sickle.name = 'FarmTool_Sickle';
    this.#trowel.name = 'FarmTool_Trowel';

    const streamGeometry = new THREE.CylinderGeometry(0.018, 0.032, 1, 7, 1, true);
    const streamMaterial = new THREE.MeshBasicMaterial({
      color: 0x83c4d1,
      transparent: true,
      opacity: 0.84,
      depthWrite: false,
      toneMapped: false,
    });
    this.#waterStream = new THREE.Mesh(streamGeometry, streamMaterial);
    this.#waterStream.name = 'FarmTool_WaterStream';
    this.#waterStream.visible = false;
    this.#waterStream.renderOrder = 3;

    const dropGeometry = new THREE.OctahedronGeometry(0.028, 0);
    this.#waterDrops = new THREE.InstancedMesh(dropGeometry, streamMaterial, 5);
    this.#waterDrops.name = 'FarmTool_WaterDrops';
    this.#waterDrops.visible = false;
    this.#waterDrops.frustumCulled = false;
    this.#waterDrops.renderOrder = 3;

    const splashGeometry = new THREE.TorusGeometry(0.11, 0.012, 5, 18);
    const splashMaterial = new THREE.MeshBasicMaterial({
      color: 0x83c4d1,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      toneMapped: false,
    });
    this.#waterSplash = new THREE.Mesh(splashGeometry, splashMaterial);
    this.#waterSplash.name = 'FarmTool_WaterSplash';
    this.#waterSplash.visible = false;
    this.#waterSplash.rotation.x = Math.PI / 2;
    this.#waterSplash.renderOrder = 3;

    const arcGeometry = new THREE.TorusGeometry(0.42, 0.027, 6, 24, Math.PI * 1.12);
    const arcMaterial = new THREE.MeshBasicMaterial({
      color: 0xf5d341,
      transparent: true,
      opacity: 0.66,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.#harvestArc = new THREE.Mesh(arcGeometry, arcMaterial);
    this.#harvestArc.name = 'FarmTool_HarvestArc';
    this.#harvestArc.visible = false;
    this.#harvestArc.renderOrder = 3;
    this.#owned.push(
      streamGeometry,
      dropGeometry,
      splashGeometry,
      streamMaterial,
      splashMaterial,
      arcGeometry,
      arcMaterial,
    );

    this.object.add(
      this.#wateringCan,
      this.#sickle,
      this.#trowel,
      this.#waterStream,
      this.#waterDrops,
      this.#waterSplash,
      this.#harvestArc,
    );
  }

  /**
   * Where the currently-visible tool wants to be held, in the actor's local
   * space. Returns null when no tool is out.
   *
   * The arm IK reaches for this point. Tools are posed on their own authored
   * arcs - a sickle swings on a curve that has nothing to do with any joint
   * angle - so rather than trying to keep two independent animations in
   * agreement, the tool leads and the hand follows it. That inverted
   * relationship is the whole reason the grip now looks like a grip.
   */
  gripPosition(target: THREE.Vector3): THREE.Vector3 | null {
    const tool = this.#trowel.visible
      ? this.#trowel
      : this.#wateringCan.visible
        ? this.#wateringCan
        : this.#sickle.visible
          ? this.#sickle
          : null;
    if (!tool) return null;
    if (tool === this.#wateringCan) {
      // The can is the one tool held by a handle offset from its origin, and
      // the one posed with a large yaw, so where that handle ends up is not
      // something a literal can track. Transform it.
      tool.updateMatrix();
      return target.copy(CAN_HANDLE_LOCAL).applyMatrix4(tool.matrix);
    }
    return target.copy(tool.position);
  }

  /** A second contact point used by the off hand to steady the watering can. */
  supportPosition(target: THREE.Vector3): THREE.Vector3 | null {
    if (!this.#wateringCan.visible) return null;
    // Derived from the can for the same reason the grip is: a fixed point was
    // only ever correct for one pose of it, and it stopped being correct the
    // moment the can was turned to face front.
    this.#wateringCan.updateMatrix();
    return target.copy(CAN_SUPPORT_LOCAL).applyMatrix4(this.#wateringCan.matrix);
  }

  sync(action: WorkAction | null, progress: number, elapsedSeconds: number): void {
    this.#wateringCan.visible = false;
    this.#sickle.visible = false;
    this.#trowel.visible = false;
    this.#waterStream.visible = false;
    this.#waterDrops.visible = false;
    this.#waterSplash.visible = false;
    this.#harvestArc.visible = false;
    if (!action) return;

    const p = Math.min(1, Math.max(0, progress));
    const beat = Math.sin(p * Math.PI);

    if (action === 'plant') {
      this.#trowel.visible = true;
      this.#trowel.position.set(0.24, 0.73 - beat * 0.18, 0.31 + beat * 0.1);
      this.#trowel.rotation.set(-0.34 - p * 0.95, 0.18, -0.22 + beat * 0.18);
      this.#trowel.scale.setScalar(1.08);
      return;
    }

    if (action === 'tend') {
      const pour = smoothPulse(p, 0.14, 0.86);
      this.#wateringCan.visible = true;
      // Carried further forward than the one-handed tools. Turning the spout
      // to face front also swings the handle end round to point backwards, and
      // at the old z of 0.32 that end passed straight through the farmer's
      // chest. The handle reaches 0.18 m behind the origin, so the can has to
      // sit clear of the torso rather than on it.
      this.#wateringCan.position.set(0.19, 0.78 - pour * 0.08, 0.4);
      // Euler XYZ applies Z first, then Y, then X. So the Z term tips the can
      // in its own frame - spout nose-down, the way you actually tip a can -
      // and the Y term then swings that whole tipped pose round to face front.
      // Doing the tilt on X instead, as the old pose did, rolled the can about
      // the spout axis: the body leaned over but nothing ever pointed down.
      // 0.15 to 0.73 rad, about 42 degrees at full pour. The old value went to
      // 1.10 rad, which was invisible while it was rolling the can about its
      // own spout axis but tips the rose almost to the soil once the spout
      // actually points somewhere - the tip fell to 0.26 m off the ground.
      this.#wateringCan.rotation.set(0.06, SPOUT_FORWARD_YAW, -0.15 - pour * 0.58);
      // 0.9 rather than the 1.1 the other tools use. The mesh is 0.82 m from
      // handle to rose, so at 1.1 it was 0.90 m on a 1.60 m farmer - over half
      // their height. That read as a barrel rather than a can once the spout
      // was aimed forward and the whole length became visible in silhouette;
      // side-on it ran clean out of frame.
      this.#wateringCan.scale.setScalar(0.9);

      if (pour > 0.08) {
        this.#waterStream.visible = true;
        this.#waterDrops.visible = true;
        this.#waterSplash.visible = true;

        // Water leaves the spout because it is *derived from* the spout, not
        // because three sets of literals were tuned to agree with it. The old
        // hard-coded offsets were the reason the effect could drift away from
        // the can silently: nothing tied them together, so retuning the pose
        // left the stream hanging in mid-air next to it.
        this.#wateringCan.updateMatrix();
        this.#spoutTip.copy(SPOUT_TIP_LOCAL).applyMatrix4(this.#wateringCan.matrix);

        const ripple = Math.sin(elapsedSeconds * 24) * 0.018;
        // Span the gap rather than pick a length: the stream runs from the rose
        // to the ground ring, so it always connects the two and can never hang
        // in the air or punch through the soil as the tilt changes. Pour
        // strength drives the stream's thickness instead, which is what varies
        // when you tip a can further anyway.
        const streamLength = Math.max(0.12, this.#spoutTip.y - SPLASH_HEIGHT);
        this.#waterStream.position.set(
          this.#spoutTip.x,
          (this.#spoutTip.y + SPLASH_HEIGHT) * 0.5 + ripple,
          this.#spoutTip.z,
        );
        this.#waterStream.rotation.set(0.1, 0, 0);
        this.#waterStream.scale.set(0.72 + pour * 0.4, streamLength, 0.72 + pour * 0.4);
        (this.#waterStream.material as THREE.MeshBasicMaterial).opacity = 0.52 + pour * 0.34;

        const fallHeight = Math.max(0.1, this.#spoutTip.y - SPLASH_HEIGHT);
        for (let index = 0; index < 5; index += 1) {
          const fall = (elapsedSeconds * 2.8 + index * 0.19) % 1;
          this.#matrix.compose(
            this.#position.set(
              this.#spoutTip.x + Math.sin(index * 2.3) * 0.028,
              this.#spoutTip.y - fall * fallHeight,
              this.#spoutTip.z + Math.cos(index * 1.7) * 0.025,
            ),
            this.#rotation,
            this.#scale.set(0.58, 1.35, 0.58),
          );
          this.#waterDrops.setMatrixAt(index, this.#matrix);
        }
        this.#waterDrops.instanceMatrix.needsUpdate = true;

        const splashPulse = 0.82 + Math.sin(elapsedSeconds * 17) * 0.18;
        this.#waterSplash.position.set(this.#spoutTip.x, SPLASH_HEIGHT, this.#spoutTip.z);
        this.#waterSplash.scale.setScalar(splashPulse * (0.74 + pour * 0.38));
        (this.#waterSplash.material as THREE.MeshBasicMaterial).opacity = 0.38 + pour * 0.34;
      }
      return;
    }

    // Transfers, repairs and animal handling use distinct body gestures but
    // no farm tool. Falling through here used to put the sickle in the
    // farmer's hand, which made Put down look exactly like Harvest.
    if (action !== 'harvest') return;

    const swing = easeInOutCubic(Math.min(1, p / 0.76));
    this.#sickle.visible = true;
    this.#sickle.position.set(0.27 - swing * 0.12, 0.81 + beat * 0.06, 0.31);
    this.#sickle.rotation.set(-0.34, 0.16, -1.05 + swing * 2.18);
    this.#sickle.scale.setScalar(1.18);

    if (p > 0.1 && p < 0.82) {
      this.#harvestArc.visible = true;
      this.#harvestArc.position.set(0.0, 0.76, 0.38);
      this.#harvestArc.rotation.set(0, 0, -1.24 + swing * 1.02);
      this.#harvestArc.scale.setScalar(0.76 + beat * 0.28);
      (this.#harvestArc.material as THREE.MeshBasicMaterial).opacity = beat * 0.7;
    }
  }

  dispose(): void {
    this.object.removeFromParent();
    for (const resource of this.#owned) resource.dispose();
    if (!this.#usesLibrary) {
      this.#wateringCan.removeFromParent();
      this.#sickle.removeFromParent();
      this.#trowel.removeFromParent();
    }
    this.object.clear();
  }
}

function smoothPulse(value: number, start: number, end: number): number {
  const rise = smoothstep(start, start + 0.18, value);
  const fall = 1 - smoothstep(end - 0.16, end, value);
  return rise * fall;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function easeInOutCubic(value: number): number {
  return value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
}
