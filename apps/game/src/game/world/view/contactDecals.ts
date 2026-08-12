/**
 * Soil contact decals under the crop beds.
 *
 * The complaint this fixes is specific: the beds read as plastic bars laid on a
 * surface. Two things cause that, and only one of them is the material.
 *
 * The other is that a bed's silhouette against the ground is a perfect
 * rectangle with a hard edge and no transition. Real worked soil spills. The
 * ground around a bed is walked on, watered, and has soil dragged off it, so
 * there is always a metre of "not quite bed, not quite paddock" around the
 * edge, and its outline is ragged.
 *
 * A decal is the cheap, reversible way to supply that. One InstancedMesh, one
 * draw call for every bed on the estate, a quad slightly larger than the tile
 * lying 6 mm above the ground with a soft irregular alpha edge. It changes no
 * geometry, no collision and nothing about the bed meshes themselves, and on
 * the low tier it does not exist at all.
 *
 * The alternative - re-authoring `SM_ground_plot` with a bevelled skirt - is
 * better and is not available here: `ModelLibrary` exposes one shared material
 * for all authored art, so a bed cannot be given its own surface without
 * splitting that material first. That split is called out in the report.
 */
import * as THREE from 'three';
import type { SurfaceMaps } from '@assets/registries/SurfaceLibrary.js';
import type { RenderPipeline } from '@engine/render/RenderPipeline.js';
import type { FarmWorld } from '../FarmWorld.js';

/** Matches PlotView's instance capacity, for the same reason: parcels add beds. */
const MAX_BEDS = 32;

/**
 * Height above the ground plane.
 *
 * 6 mm is enough to beat depth precision at 13 m without the decal ever being
 * visible as a floating sheet, and it is well below the 22 mm the road surface
 * already sits at, so a decal never pokes through a road.
 */
const DECAL_HEIGHT = 0.006;

/** How much wider than the tile the spill reaches. */
const DECAL_SCALE = 1.62;

export interface BedContactDecals {
  readonly object: THREE.Object3D;
  sync(world: FarmWorld): void;
  dispose(): void;
}

function hash(x: number, z: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function createBedContactDecals(
  world: FarmWorld,
  soil: SurfaceMaps,
  pipeline: RenderPipeline | null,
): BedContactDecals {
  const tile = world.grid.tileSize;
  const size = tile * DECAL_SCALE;
  const geometry = new THREE.PlaneGeometry(size, size);
  geometry.rotateX(-Math.PI / 2);

  // Cloned so the repeat can be set without disturbing any other user of the
  // same surface. `Texture.clone` shares the underlying `source`, so this costs
  // one more texture object and zero additional bytes on the GPU.
  const albedo = soil.albedo.clone();
  const normal = soil.normal.clone();
  const orm = soil.orm.clone();
  const repeat = size / soil.tileMetres;
  for (const texture of [albedo, normal, orm]) {
    texture.repeat.set(repeat, repeat);
    texture.needsUpdate = true;
  }

  const material = new THREE.MeshStandardMaterial({
    map: albedo,
    normalMap: normal,
    roughnessMap: orm,
    roughness: 1,
    metalness: 0,
    transparent: true,
    // The decal must not occlude the ground it is blended into, and it must not
    // be written into the depth buffer the AO pass reads - a 6 mm slab of depth
    // over every bed would produce an AO halo exactly where the blend is
    // supposed to be invisible.
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vDecalUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvDecalUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vDecalUv;')
      .replace(
        '#include <alphamap_fragment>',
        `#include <alphamap_fragment>
{
  // A superellipse rather than a circle: the spill follows the square bed it
  // surrounds, but with corners soft enough that it never reads as a second
  // rectangle drawn around the first.
  vec2 p = abs(vDecalUv - 0.5) * 2.0;
  vec2 q = p * p;
  float d = pow(q.x * q.x + q.y * q.y, 0.25);
  // The soil's own luminance perturbs the boundary, so the edge is ragged and
  // different under every bed instead of being a clean vignette repeated
  // twenty-two times.
  float grain = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  d += (grain - 0.34) * 0.5;
  diffuseColor.a *= 1.0 - smoothstep(0.34, 0.86, d);
  // Worked soil is damper and darker than the pan it sits in. Without this the
  // decal read as a pale halo around each bed - the opposite of the contact
  // shadow it is supposed to be.
  diffuseColor.rgb *= 0.82;
}`,
      );
  };
  material.customProgramCacheKey = () => 'farmrise-bed-decal-v1';

  const mesh = new THREE.InstancedMesh(geometry, material, MAX_BEDS);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.count = 0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;

  pipeline?.registerMaterial(material, 'terrain');

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();

  const place = (currentWorld: FarmWorld): void => {
    const beds = currentWorld.fields.placements.slice(0, MAX_BEDS);
    beds.forEach((plot, index) => {
      const at = currentWorld.grid.tileToWorld(plot.tileX, plot.tileZ);
      // A quarter-turn per bed, chosen deterministically from the tile. Without
      // it the same 3 m patch of soil appears under every bed on the farm, and
      // the repeat is far more obvious than the texture itself.
      const spin = Math.floor(hash(plot.tileX, plot.tileZ) * 4) * (Math.PI / 2);
      const jitter = 0.94 + hash(plot.tileX + 977, plot.tileZ - 331) * 0.16;
      matrix.compose(
        position.set(at.x, DECAL_HEIGHT, at.z),
        quaternion.setFromEuler(euler.set(0, spin, 0)),
        scale.set(jitter, 1, jitter),
      );
      mesh.setMatrixAt(index, matrix);
    });
    mesh.count = beds.length;
    mesh.instanceMatrix.needsUpdate = true;
  };

  place(world);

  return {
    object: mesh,
    sync(currentWorld: FarmWorld): void {
      if (mesh.count !== Math.min(MAX_BEDS, currentWorld.fields.placements.length)) {
        place(currentWorld);
      }
    },
    dispose(): void {
      pipeline?.unregisterMaterial(material);
      mesh.dispose();
      geometry.dispose();
      material.dispose();
      albedo.dispose();
      normal.dispose();
      orm.dispose();
    },
  };
}
