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
import { ACTION_EFFECT_CONTACT } from './PlayerActionEffects.js';

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
/** A point just behind the rose, used to derive the authored exit direction. */
const SPOUT_NECK_LOCAL = new THREE.Vector3(0.43, 0.303, 0);

/**
 * Where the right hand closes around the top of the can's timber handle.
 *
 * The old point sat on the lower rear handle mount. That pulled the fist into
 * the tank and hid the handle loop against the torso. The authored handle
 * crests around local y=0.54; this slightly rearward top point leaves the tank
 * hanging visibly below the fist, which is the silhouette players expect.
 */
const CAN_HANDLE_LOCAL = new THREE.Vector3(-0.08, 0.49, 0);

/** Low off-hand contact on the camera-facing shoulder of the tank. */
const CAN_SUPPORT_LOCAL = new THREE.Vector3(0.08, 0.32, -0.1);

/** Centre of the trowel's timber handle in the authored local mesh. */
const TROWEL_GRIP_LOCAL = new THREE.Vector3(0, 0.39, 0);
/** Ultra off-hand contact, pushed onto the visible side of the tank. */
const ULTRA_CAN_SUPPORT_LOCAL = new THREE.Vector3(0.1, 0.32, -0.12);

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

/**
 * Height of the worked plot surface under the pour, in metres.
 *
 * `SM_ground_plot` rises to 0.105 m and its furrows/clods reach 0.123 m. The
 * previous 0.055 m contact plane buried the restrained partial arcs inside the
 * bed, which is why the physically better ballistic pass disappeared at the
 * shipping camera. Keep the effect just above the authored soil instead of
 * solving visibility with depth-test cheats.
 */
const SPLASH_HEIGHT = 0.158;
/** Grounded height for the damp-soil patch, just above the tallest plot relief. */
const WET_CONTACT_HEIGHT = 0.13;
const LEGACY_SPLASH_HEIGHT = 0.145;
const WATER_GRAVITY = 2.85;
const STREAM_FRAGMENT_COUNT = 3;
const STREAM_SEGMENTS_PER_FRAGMENT = 4;
const STREAM_RIBBON_PLANES = 2;
const STREAM_VERTICES_PER_QUAD = 6;
const STREAM_VERTEX_COUNT =
  STREAM_FRAGMENT_COUNT *
  STREAM_SEGMENTS_PER_FRAGMENT *
  STREAM_RIBBON_PLANES *
  STREAM_VERTICES_PER_QUAD;
const WATER_DROP_CAPACITY = 7;
const SPLASH_ARC_CAPACITY = 4;
const SPLASH_CROWN_CAPACITY = 7;
const STREAM_FRAGMENT_STARTS = [0, 0.34, 0.69] as const;
const STREAM_FRAGMENT_ENDS = [0.28, 0.62, 1] as const;
const STREAM_AXIS = new THREE.Vector3(0, 1, 0);
const SPLASH_ROTATION_AXIS = new THREE.Vector3(0, 0, 1);
const WATER_SPLASH_COLOURS = [
  new THREE.Color(0xd0f5ff),
  new THREE.Color(0x9fe8f7),
  new THREE.Color(0xb9effa),
] as const;

export class PlayerToolView {
  readonly object = new THREE.Group();
  readonly #wateringCan: THREE.Mesh;
  readonly #sickle: THREE.Mesh;
  readonly #trowel: THREE.Mesh;
  readonly #waterStream: THREE.Mesh;
  readonly #streamPositions: THREE.BufferAttribute | null;
  readonly #waterDrops: THREE.InstancedMesh;
  readonly #waterSplash: THREE.Mesh;
  readonly #waterCrown: THREE.InstancedMesh | null;
  readonly #waterContact: THREE.Mesh | null;
  readonly #harvestArc: THREE.Mesh;
  readonly #owned: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  readonly #usesLibrary: boolean;
  readonly #advancedEffects: boolean;
  readonly #matrix = new THREE.Matrix4();
  readonly #position = new THREE.Vector3();
  readonly #scale = new THREE.Vector3();
  readonly #rotation = new THREE.Quaternion();
  readonly #euler = new THREE.Euler();
  readonly #colour = new THREE.Color();
  /** Spout tip in actor-local space, recomputed from the can's pose each frame. */
  readonly #spoutTip = new THREE.Vector3();
  readonly #spoutNeck = new THREE.Vector3();
  readonly #streamVelocity = new THREE.Vector3();
  readonly #streamImpact = new THREE.Vector3();
  readonly #streamPointA = new THREE.Vector3();
  readonly #streamPointB = new THREE.Vector3();
  readonly #streamTangent = new THREE.Vector3();
  readonly #ribbonSide = new THREE.Vector3();
  readonly #ribbonNormal = new THREE.Vector3();
  readonly #ribbonAL = new THREE.Vector3();
  readonly #ribbonAR = new THREE.Vector3();
  readonly #ribbonBL = new THREE.Vector3();
  readonly #ribbonBR = new THREE.Vector3();

  constructor(library: ModelLibrary | null, advancedEffects = true) {
    this.#advancedEffects = advancedEffects;
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

    if (advancedEffects) {
      // Two crossed, camera-resilient ribbons trace three broken fragments of
      // a solved ballistic path. The fixed dynamic buffer gives the stream a
      // smooth liquid silhouette without allocating per frame or turning
      // every sample into a visible bead/cylinder.
      const streamGeometry = new THREE.BufferGeometry();
      this.#streamPositions = new THREE.BufferAttribute(
        new Float32Array(STREAM_VERTEX_COUNT * 3),
        3,
      );
      this.#streamPositions.setUsage(THREE.DynamicDrawUsage);
      streamGeometry.setAttribute('position', this.#streamPositions);
      const streamMaterial = new THREE.MeshBasicMaterial({
        color: 0xa9ecff,
        transparent: true,
        opacity: 0.82,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      this.#waterStream = new THREE.Mesh(streamGeometry, streamMaterial);
      this.#waterStream.frustumCulled = false;
      this.#waterStream.userData['fragmentCount'] = STREAM_FRAGMENT_COUNT;
      this.#waterStream.userData['motion'] = 'ballistic-ribbon-fragments';

      const dropGeometry = new THREE.OctahedronGeometry(0.03, 0);
      const dropMaterial = new THREE.MeshBasicMaterial({
        color: 0xb9f1ff,
        transparent: true,
        opacity: 0.34,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      this.#waterDrops = new THREE.InstancedMesh(dropGeometry, dropMaterial, WATER_DROP_CAPACITY);
      this.#waterDrops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.#waterDrops.userData['poolCapacity'] = WATER_DROP_CAPACITY;

      // Small filled lobes overlap imperfectly and drift outwards on different
      // clocks. They read as thin water sheets instead of a target reticle or
      // the hooked ends produced by partial toruses.
      const splashGeometry = new THREE.CircleGeometry(0.14, 8);
      const splashMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        vertexColors: true,
        transparent: true,
        opacity: 0.3,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      const splash = new THREE.InstancedMesh(splashGeometry, splashMaterial, SPLASH_ARC_CAPACITY);
      splash.rotation.x = -Math.PI / 2;
      splash.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(SPLASH_ARC_CAPACITY * 3).fill(1),
        3,
      );
      splash.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      splash.frustumCulled = false;
      splash.userData['poolCapacity'] = SPLASH_ARC_CAPACITY;
      this.#waterSplash = splash;

      const crownGeometry = new THREE.OctahedronGeometry(0.032, 0);
      const crownMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        vertexColors: true,
        transparent: true,
        opacity: 0.22,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      this.#waterCrown = new THREE.InstancedMesh(
        crownGeometry,
        crownMaterial,
        SPLASH_CROWN_CAPACITY,
      );
      this.#waterCrown.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(SPLASH_CROWN_CAPACITY * 3).fill(1),
        3,
      );
      this.#waterCrown.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.#waterCrown.frustumCulled = false;
      this.#waterCrown.renderOrder = 4;
      this.#waterCrown.userData['poolCapacity'] = SPLASH_CROWN_CAPACITY;

      // A feathered procedural alpha patch darkens the soil under the impact.
      // The texture has an irregular edge and no hard polygon silhouette, so
      // it reads as damp earth rather than another flat VFX card.
      const contactGeometry = new THREE.PlaneGeometry(0.62, 0.46);
      const contactAlpha = createWetSoilAlphaTexture();
      const contactMaterial = new THREE.MeshBasicMaterial({
        color: 0x7e3620, // soil_wet
        alphaMap: contactAlpha,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        toneMapped: true,
      });
      this.#waterContact = new THREE.Mesh(contactGeometry, contactMaterial);
      this.#waterContact.rotation.x = -Math.PI / 2;
      this.#waterContact.renderOrder = 2;
      this.#waterContact.userData['motion'] = 'soft-soil-build-and-decay';
      this.#waterContact.userData['edge'] = 'procedural-feathered';

      this.#owned.push(
        streamGeometry,
        dropGeometry,
        splashGeometry,
        crownGeometry,
        contactGeometry,
        contactAlpha,
        streamMaterial,
        dropMaterial,
        splashMaterial,
        crownMaterial,
        contactMaterial,
      );
    } else {
      // Low retains the original three-draw watering structure. Brighter,
      // slightly broader geometry is still the same cylinder + shared drop
      // draw + torus budget, with no crown/contact materials constructed.
      const streamGeometry = new THREE.CylinderGeometry(0.024, 0.04, 1, 7, 1, true);
      const streamMaterial = new THREE.MeshBasicMaterial({
        color: 0xa9ecff,
        transparent: true,
        opacity: 0.94,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      this.#streamPositions = null;
      this.#waterStream = new THREE.Mesh(streamGeometry, streamMaterial);

      const dropGeometry = new THREE.OctahedronGeometry(0.035, 0);
      this.#waterDrops = new THREE.InstancedMesh(dropGeometry, streamMaterial, 5);

      const splashGeometry = new THREE.TorusGeometry(0.14, 0.018, 5, 18);
      const splashMaterial = new THREE.MeshBasicMaterial({
        color: 0x8fe4f4,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      this.#waterSplash = new THREE.Mesh(splashGeometry, splashMaterial);
      this.#waterSplash.rotation.x = Math.PI / 2;
      this.#waterCrown = null;
      this.#waterContact = null;
      this.#owned.push(
        streamGeometry,
        dropGeometry,
        splashGeometry,
        streamMaterial,
        splashMaterial,
      );
    }

    this.#waterStream.name = 'FarmTool_WaterStream';
    this.#waterStream.visible = false;
    this.#waterStream.renderOrder = 3;
    this.#waterDrops.name = 'FarmTool_WaterDrops';
    this.#waterDrops.visible = false;
    this.#waterDrops.frustumCulled = false;
    this.#waterDrops.renderOrder = advancedEffects ? 4 : 3;
    this.#waterSplash.name = 'FarmTool_WaterSplash';
    this.#waterSplash.visible = false;
    this.#waterSplash.renderOrder = 3;
    if (this.#waterCrown) {
      this.#waterCrown.name = 'FarmTool_WaterCrown';
      this.#waterCrown.visible = false;
    }
    if (this.#waterContact) {
      this.#waterContact.name = 'FarmTool_WaterContact';
      this.#waterContact.visible = false;
    }

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
    this.#owned.push(arcGeometry, arcMaterial);

    this.object.add(
      this.#wateringCan,
      this.#sickle,
      this.#trowel,
      this.#waterStream,
      this.#waterDrops,
      this.#waterSplash,
      this.#harvestArc,
    );
    if (this.#waterCrown) this.object.add(this.#waterCrown);
    if (this.#waterContact) this.object.add(this.#waterContact);
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
    if (tool === this.#trowel) {
      // Its origin sits near the blade/shaft junction. Solving the hand to the
      // origin put the blade across the chest and left the handle floating
      // above the fist. Track the authored timber handle instead.
      tool.updateMatrix();
      return target.copy(TROWEL_GRIP_LOCAL).applyMatrix4(tool.matrix);
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
    return target
      .copy(this.#advancedEffects ? ULTRA_CAN_SUPPORT_LOCAL : CAN_SUPPORT_LOCAL)
      .applyMatrix4(this.#wateringCan.matrix);
  }

  sync(action: WorkAction | null, progress: number, elapsedSeconds: number): void {
    this.#wateringCan.visible = false;
    this.#sickle.visible = false;
    this.#trowel.visible = false;
    this.#waterStream.visible = false;
    this.#waterDrops.visible = false;
    this.#waterSplash.visible = false;
    if (this.#waterCrown) this.#waterCrown.visible = false;
    if (this.#waterContact) this.#waterContact.visible = false;
    this.#harvestArc.visible = false;
    if (!action) return;

    const p = Math.min(1, Math.max(0, progress));
    const beat = Math.sin(p * Math.PI);

    if (action === 'plant') {
      this.#trowel.visible = true;
      // The handle stays around waist height while the blade travels to the
      // soil in front of the leading foot. Previously the mesh origin was
      // placed at the hand, which raised the entire trowel into the chest.
      this.#trowel.position.set(0.24 + beat * 0.02, 0.5 - beat * 0.29, 0.47 + beat * 0.27);
      this.#trowel.rotation.set(-0.34 - p * 0.95, 0.18, -0.22 + beat * 0.18);
      this.#trowel.scale.setScalar(1.12);
      return;
    }

    if (action === 'tend') {
      const pour = smoothPulse(p, 0.14, 0.86);
      this.#wateringCan.visible = true;
      if (this.#advancedEffects) {
        // Offset the can from the torso and turn it slightly off the exact
        // front axis. That exposes the tank, handle loop and round rose as
        // separate shapes while the spout still points dominantly forward.
        this.#wateringCan.position.set(-0.22, 0.61 - pour * 0.08, 0.69 + pour * 0.03);
        this.#wateringCan.rotation.set(0.02, SPOUT_FORWARD_YAW + 0.44, -0.1 - pour * 0.3);
        this.#wateringCan.scale.setScalar(0.94);
      } else {
        // Low uses the same readable silhouette with a slightly smaller can;
        // the water-effect draw and material budgets remain unchanged below.
        this.#wateringCan.position.set(-0.22, 0.62 - pour * 0.08, 0.68 + pour * 0.03);
        this.#wateringCan.rotation.set(0.03, SPOUT_FORWARD_YAW + 0.42, -0.1 - pour * 0.3);
        this.#wateringCan.scale.setScalar(0.88);
      }
      if (this.#advancedEffects) {
        if (p >= ACTION_EFFECT_CONTACT.tend && pour > 0.08) {
          this.#syncWaterPour(p, pour, elapsedSeconds);
        }
      } else if (pour > 0.08) {
        this.#syncLegacyWaterPour(pour, elapsedSeconds);
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

    const harvestContact = this.#advancedEffects ? ACTION_EFFECT_CONTACT.harvest : 0.1;
    if (p >= harvestContact && p < 0.82) {
      this.#harvestArc.visible = true;
      this.#harvestArc.position.set(0.0, 0.76, 0.38);
      this.#harvestArc.rotation.set(0, 0, -1.24 + swing * 1.02);
      this.#harvestArc.scale.setScalar(0.76 + beat * 0.28);
      (this.#harvestArc.material as THREE.MeshBasicMaterial).opacity = beat * 0.7;
    }
  }

  #syncWaterPour(progress: number, pour: number, elapsedSeconds: number): void {
    if (!this.#waterCrown || !this.#waterContact) return;
    this.#waterStream.visible = true;
    this.#waterDrops.visible = true;
    this.#waterSplash.visible = true;
    this.#waterCrown.visible = true;
    this.#waterContact.visible = true;

    // Alpha follows the authored pour envelope so the effect eases in and out
    // instead of popping on at contact and vanishing at follow-through. These
    // are existing materials; changing their scalar opacity allocates nothing.
    (this.#waterStream.material as THREE.MeshBasicMaterial).opacity = 0.58 + pour * 0.28;
    (this.#waterDrops.material as THREE.MeshBasicMaterial).opacity = 0.32 + pour * 0.34;
    (this.#waterSplash.material as THREE.MeshBasicMaterial).opacity = 0.26 + pour * 0.38;
    (this.#waterCrown.material as THREE.MeshBasicMaterial).opacity = 0.2 + pour * 0.34;

    // Both points come from the posed can. The stream therefore leaves along
    // the rose's authored direction before gravity pulls it into an arc.
    this.#wateringCan.updateMatrix();
    this.#spoutTip.copy(SPOUT_TIP_LOCAL).applyMatrix4(this.#wateringCan.matrix);
    this.#spoutNeck.copy(SPOUT_NECK_LOCAL).applyMatrix4(this.#wateringCan.matrix);
    this.#streamVelocity.subVectors(this.#spoutTip, this.#spoutNeck).normalize();
    // The can is deliberately shown in three-quarter view so its tank and
    // handle separate from the torso. Keep the water aimed at the crop row,
    // rather than inheriting the whole visual yaw and spraying sideways.
    this.#streamVelocity.x *= 0.35;
    this.#streamVelocity.normalize().multiplyScalar(1.18 + pour * 0.34);

    const dropHeight = Math.max(0.05, this.#spoutTip.y - SPLASH_HEIGHT);
    const verticalSpeed = this.#streamVelocity.y;
    const flightSeconds =
      (verticalSpeed + Math.sqrt(verticalSpeed * verticalSpeed + 2 * WATER_GRAVITY * dropHeight)) /
      WATER_GRAVITY;
    this.#sampleBallistic(1, flightSeconds, this.#streamImpact);
    this.#streamImpact.y = SPLASH_HEIGHT;

    this.#writeStreamRibbons(pour, elapsedSeconds, flightSeconds);
    this.#writeStreamDrops(pour, elapsedSeconds, flightSeconds);
    this.#writeSplashArcs(pour, elapsedSeconds);
    this.#writeSplashCrown(pour, elapsedSeconds);
    this.#writeWaterContact(progress, elapsedSeconds);
  }

  #syncLegacyWaterPour(pour: number, elapsedSeconds: number): void {
    this.#waterStream.visible = true;
    this.#waterDrops.visible = true;
    this.#waterSplash.visible = true;

    this.#wateringCan.updateMatrix();
    this.#spoutTip.copy(SPOUT_TIP_LOCAL).applyMatrix4(this.#wateringCan.matrix);

    // The one Low cylinder now connects the rose to a slightly forward impact
    // instead of hanging vertically beneath it. Reusing the class scratch
    // vectors/quaternion keeps this path allocation-free.
    this.#streamImpact.set(0, LEGACY_SPLASH_HEIGHT, this.#spoutTip.z - 0.32);
    this.#streamTangent.subVectors(this.#streamImpact, this.#spoutTip);
    const streamLength = Math.max(0.12, this.#streamTangent.length());
    this.#streamTangent.multiplyScalar(1 / streamLength);
    this.#rotation.setFromUnitVectors(STREAM_AXIS, this.#streamTangent);
    this.#waterStream.position.lerpVectors(this.#spoutTip, this.#streamImpact, 0.5);
    this.#waterStream.position.y += Math.sin(elapsedSeconds * 24) * 0.008;
    this.#waterStream.quaternion.copy(this.#rotation);
    this.#waterStream.scale.set(0.88 + pour * 0.34, streamLength, 0.88 + pour * 0.34);
    (this.#waterStream.material as THREE.MeshBasicMaterial).opacity = 0.72 + pour * 0.24;

    for (let index = 0; index < 5; index += 1) {
      const fall = (elapsedSeconds * 2.8 + index * 0.19) % 1;
      this.#position.lerpVectors(this.#spoutTip, this.#streamImpact, fall);
      this.#matrix.compose(
        this.#position.set(
          this.#position.x + Math.sin(index * 2.3) * 0.032,
          this.#position.y,
          this.#position.z + Math.cos(index * 1.7) * 0.028,
        ),
        this.#rotation,
        this.#scale.set(0.68, 1.45, 0.68),
      );
      this.#waterDrops.setMatrixAt(index, this.#matrix);
    }
    this.#waterDrops.instanceMatrix.needsUpdate = true;

    const splashPulse = 0.86 + Math.sin(elapsedSeconds * 17) * 0.14;
    this.#waterSplash.position.copy(this.#streamImpact);
    this.#waterSplash.scale.setScalar(splashPulse * (0.84 + pour * 0.34));
    (this.#waterSplash.material as THREE.MeshBasicMaterial).opacity = 0.66 + pour * 0.26;
  }

  #writeStreamRibbons(pour: number, elapsedSeconds: number, flightSeconds: number): void {
    if (!this.#streamPositions) return;
    let vertex = 0;

    for (let fragment = 0; fragment < STREAM_FRAGMENT_COUNT; fragment += 1) {
      const drift = Math.sin(elapsedSeconds * (2.1 + fragment * 0.17) + fragment * 2.31) * 0.016;
      const start = STREAM_FRAGMENT_STARTS[fragment]! + (fragment === 0 ? 0 : drift);
      const end =
        STREAM_FRAGMENT_ENDS[fragment]! + (fragment === STREAM_FRAGMENT_COUNT - 1 ? 0 : drift);

      for (let segment = 0; segment < STREAM_SEGMENTS_PER_FRAGMENT; segment += 1) {
        const localA = segment / STREAM_SEGMENTS_PER_FRAGMENT;
        const localB = (segment + 1) / STREAM_SEGMENTS_PER_FRAGMENT;
        const pathA = THREE.MathUtils.lerp(start, end, localA);
        const pathB = THREE.MathUtils.lerp(start, end, localB);
        this.#sampleRibbonPoint(
          pathA,
          fragment,
          pour,
          elapsedSeconds,
          flightSeconds,
          this.#streamPointA,
        );
        this.#sampleRibbonPoint(
          pathB,
          fragment,
          pour,
          elapsedSeconds,
          flightSeconds,
          this.#streamPointB,
        );
        this.#streamTangent.subVectors(this.#streamPointB, this.#streamPointA).normalize();

        this.#ribbonSide.set(0, 1, 0).cross(this.#streamTangent);
        if (this.#ribbonSide.lengthSq() < 0.0001) this.#ribbonSide.set(1, 0, 0);
        else this.#ribbonSide.normalize();
        this.#ribbonNormal.crossVectors(this.#streamTangent, this.#ribbonSide).normalize();

        const fragmentTaperA = 0.5 + Math.sin(localA * Math.PI) * 0.5;
        const fragmentTaperB = 0.5 + Math.sin(localB * Math.PI) * 0.5;
        const widthA =
          THREE.MathUtils.lerp(0.026, 0.011, pathA) * fragmentTaperA * (0.94 + pour * 0.12);
        const widthB =
          THREE.MathUtils.lerp(0.026, 0.011, pathB) * fragmentTaperB * (0.94 + pour * 0.12);
        vertex = this.#writeRibbonQuad(
          vertex,
          this.#streamPointA,
          this.#streamPointB,
          this.#ribbonSide,
          widthA,
          widthB,
        );
        vertex = this.#writeRibbonQuad(
          vertex,
          this.#streamPointA,
          this.#streamPointB,
          this.#ribbonNormal,
          widthA * 0.72,
          widthB * 0.72,
        );
      }
    }

    this.#streamPositions.needsUpdate = true;
  }

  #sampleRibbonPoint(
    path: number,
    fragment: number,
    pour: number,
    elapsedSeconds: number,
    flightSeconds: number,
    target: THREE.Vector3,
  ): void {
    this.#sampleBallistic(path, flightSeconds, target);
    const separation = Math.sin(path * Math.PI);
    const flutter = 0.006 + fragment * 0.0018;
    target.x +=
      Math.sin(elapsedSeconds * (7.1 + fragment * 0.4) + path * 15.2 + fragment * 1.91) *
      flutter *
      separation;
    target.z +=
      Math.cos(elapsedSeconds * 5.9 + path * 11.7 + fragment * 2.37) * flutter * 0.7 * separation;
    target.y += Math.sin(elapsedSeconds * 8.3 + path * 18.1) * 0.0025 * separation * pour;
  }

  #writeRibbonQuad(
    vertex: number,
    pointA: THREE.Vector3,
    pointB: THREE.Vector3,
    side: THREE.Vector3,
    widthA: number,
    widthB: number,
  ): number {
    this.#ribbonAL.copy(pointA).addScaledVector(side, widthA);
    this.#ribbonAR.copy(pointA).addScaledVector(side, -widthA);
    this.#ribbonBL.copy(pointB).addScaledVector(side, widthB);
    this.#ribbonBR.copy(pointB).addScaledVector(side, -widthB);

    vertex = this.#writeRibbonVertex(vertex, this.#ribbonAL);
    vertex = this.#writeRibbonVertex(vertex, this.#ribbonAR);
    vertex = this.#writeRibbonVertex(vertex, this.#ribbonBR);
    vertex = this.#writeRibbonVertex(vertex, this.#ribbonAL);
    vertex = this.#writeRibbonVertex(vertex, this.#ribbonBR);
    vertex = this.#writeRibbonVertex(vertex, this.#ribbonBL);
    return vertex;
  }

  #writeRibbonVertex(vertex: number, point: THREE.Vector3): number {
    this.#streamPositions?.setXYZ(vertex, point.x, point.y, point.z);
    return vertex + 1;
  }

  #writeStreamDrops(pour: number, elapsedSeconds: number, flightSeconds: number): void {
    for (let index = 0; index < WATER_DROP_CAPACITY; index += 1) {
      // Irrational phase spacing and a small speed split avoid an evenly
      // spaced bead-chain silhouette while still reusing one fixed pool.
      const phase = (index * 0.61803398875) % 1;
      const path = (elapsedSeconds * (1.08 + (index % 3) * 0.07) + phase) % 1;
      this.#sampleBallistic(path, flightSeconds, this.#position);
      const separation = Math.sin(path * Math.PI);
      this.#position.x += Math.sin(index * 2.17 + elapsedSeconds * 8.8) * 0.03 * separation;
      this.#position.z += Math.cos(index * 1.73 + elapsedSeconds * 6.9) * 0.024 * separation;
      this.#sampleBallisticTangent(path, flightSeconds, this.#streamTangent);
      this.#rotation.setFromUnitVectors(STREAM_AXIS, this.#streamTangent);
      const size = (0.54 - path * 0.18) * (0.9 + pour * 0.16);
      this.#matrix.compose(
        this.#position,
        this.#rotation,
        this.#scale.set(size, 0.9 + path * 0.42, size),
      );
      this.#waterDrops.setMatrixAt(index, this.#matrix);
    }
    this.#waterDrops.count = WATER_DROP_CAPACITY;
    this.#waterDrops.instanceMatrix.needsUpdate = true;
  }

  #writeSplashArcs(pour: number, elapsedSeconds: number): void {
    const splash = this.#waterSplash as THREE.InstancedMesh;
    splash.position.copy(this.#streamImpact);
    for (let index = 0; index < SPLASH_ARC_CAPACITY; index += 1) {
      const phase = (elapsedSeconds * (1.72 + index * 0.11) + index * 0.237) % 1;
      const angle = index * 1.73 + elapsedSeconds * (0.34 + index * 0.055);
      const growth = (0.32 + phase * 0.36) * (0.88 + pour * 0.12);
      const drift = 0.008 + phase * 0.026;
      this.#position.set(Math.cos(angle) * drift, Math.sin(angle) * drift, 0);
      this.#rotation.setFromAxisAngle(SPLASH_ROTATION_AXIS, angle + (phase - 0.5) * 0.72);
      this.#matrix.compose(
        this.#position,
        this.#rotation,
        this.#scale.set(
          growth * (0.9 + Math.sin(index * 2.1) * 0.09),
          growth * (0.54 + Math.cos(index * 1.7) * 0.07),
          0.82,
        ),
      );
      splash.setMatrixAt(index, this.#matrix);
      this.#colour
        .copy(WATER_SPLASH_COLOURS[index % WATER_SPLASH_COLOURS.length]!)
        .multiplyScalar(0.92 + (1 - phase) * 0.08);
      splash.setColorAt(index, this.#colour);
    }
    splash.count = SPLASH_ARC_CAPACITY;
    splash.instanceMatrix.needsUpdate = true;
    if (splash.instanceColor) splash.instanceColor.needsUpdate = true;
  }

  #writeSplashCrown(pour: number, elapsedSeconds: number): void {
    const crown = this.#waterCrown;
    if (!crown) return;
    crown.position.copy(this.#streamImpact);
    for (let index = 0; index < SPLASH_CROWN_CAPACITY; index += 1) {
      const phase = (elapsedSeconds * (2.05 + (index % 2) * 0.14) + index * 0.139) % 1;
      const lift = Math.sin(phase * Math.PI);
      const angle = index * 2.399 + elapsedSeconds * 0.46;
      const radius = 0.022 + phase * (0.072 + (index % 3) * 0.008);
      this.#position.set(
        Math.cos(angle) * radius,
        0.012 + lift * (0.044 + (index % 3) * 0.008),
        Math.sin(angle) * radius,
      );
      this.#euler.set(Math.sin(angle) * 0.18, angle, -Math.cos(angle) * 0.18);
      this.#rotation.setFromEuler(this.#euler);
      const width = (0.42 + lift * 0.24) * (0.9 + pour * 0.12);
      this.#matrix.compose(
        this.#position,
        this.#rotation,
        this.#scale.set(width, 0.64 + lift * 0.5, width),
      );
      crown.setMatrixAt(index, this.#matrix);
      this.#colour
        .copy(WATER_SPLASH_COLOURS[(index + 1) % WATER_SPLASH_COLOURS.length]!)
        .multiplyScalar(0.94 + lift * 0.06);
      crown.setColorAt(index, this.#colour);
    }
    crown.count = SPLASH_CROWN_CAPACITY;
    crown.instanceMatrix.needsUpdate = true;
    if (crown.instanceColor) crown.instanceColor.needsUpdate = true;
  }

  #writeWaterContact(progress: number, elapsedSeconds: number): void {
    const contact = this.#waterContact;
    if (!contact) return;
    const build = smoothstep(ACTION_EFFECT_CONTACT.tend, 0.62, progress);
    const decay = 1 - smoothstep(0.68, 0.9, progress);
    const shimmer = Math.sin(elapsedSeconds * 2.7) * 0.018;
    const expansion = 0.5 + build * 0.6;
    contact.position.copy(this.#streamImpact);
    contact.position.y = WET_CONTACT_HEIGHT;
    contact.rotation.z = 0.12 + Math.sin(elapsedSeconds * 0.65) * 0.035;
    contact.scale.set(expansion + shimmer, expansion * 0.76 - shimmer * 0.5, 1);
    (contact.material as THREE.MeshBasicMaterial).opacity =
      (0.12 + build * 0.42) * (0.32 + decay * 0.68);
  }

  #sampleBallistic(path: number, flightSeconds: number, target: THREE.Vector3): void {
    const seconds = path * flightSeconds;
    target.copy(this.#spoutTip).addScaledVector(this.#streamVelocity, seconds);
    target.y -= 0.5 * WATER_GRAVITY * seconds * seconds;
  }

  #sampleBallisticTangent(path: number, flightSeconds: number, target: THREE.Vector3): void {
    target.copy(this.#streamVelocity);
    target.y -= WATER_GRAVITY * path * flightSeconds;
    target.normalize();
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

function createWetSoilAlphaTexture(): THREE.DataTexture {
  const size = 48;
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = ((x + 0.5) / size) * 2 - 1;
      const ny = ((y + 0.5) / size) * 2 - 1;
      const angle = Math.atan2(ny, nx);
      const edge =
        0.82 +
        Math.sin(angle * 3 + 0.7) * 0.075 +
        Math.sin(angle * 7 - 1.1) * 0.04 +
        Math.cos(angle * 11 + 0.35) * 0.022;
      const radius = Math.sqrt(nx * nx + ny * ny * 1.12);
      const feather = 1 - THREE.MathUtils.smoothstep(radius, edge * 0.48, edge);
      const mottling =
        0.84 + Math.sin(nx * 13.1 + ny * 7.7) * 0.055 + Math.cos(nx * 6.3 - ny * 15.9) * 0.045;
      data[y * size + x] = Math.round(255 * THREE.MathUtils.clamp(feather * mottling, 0, 1));
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat);
  texture.name = 'T_FarmTool_WetSoilAlpha';
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
