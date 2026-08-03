import { BackSide } from "three";
import { useEffect, useLayoutEffect, useRef } from "react";
import { Color, Matrix4, Sphere, Vector3 } from "three";
import type { InstancedMesh } from "three";

import type { PropKind } from "./catalogTypes";
import type { Placement } from "./placementOps";
import { toonRamp } from "../assets/toonRamp";
import { NEVER_RAYCAST, OUTLINE_INK, OUTLINE_MARGIN, hullSize } from "../assets/outline";
import type { BufferGeometry } from "three";

/**
 * Every live instance of one kind, drawn in a single call.
 *
 * Three details carry the performance of this component, and getting any of
 * them wrong degrades quietly rather than visibly:
 *
 *  1. **Instanced raycasting is disabled.** three tests every instance in turn,
 *     so leaving it on would put an O(n) traversal behind the ground ray, the
 *     three wall rays, and the camera's occlusion ray on every frame. Placement
 *     collision is answered analytically by the spatial hash instead; nothing
 *     ever needs to raycast these.
 *  2. **The buffer is allocated once at the kind's cap** and never grows. The
 *     count is what changes, so placing and removing costs a write rather than
 *     a reallocation.
 *  3. **Matrices are uploaded only when the batch changes**, not per frame. The
 *     world changes a few times a second at most; uploading sixty times a
 *     second would spend the frame budget on nothing.
 */
const scratchMatrix = new Matrix4();
const scratchPosition = new Vector3();
const scratchScale = new Vector3();
const scratchColor = new Color();
const ORIGIN = new Vector3();

interface Props {
  kind: PropKind;
  /** Live placements of this kind. */
  instances: readonly Placement[];
  /** Bumped when `instances` changes, so uploads can be skipped otherwise. */
  version: number;
  /** Authored geometry for this kind, when the catalogue has been loaded. */
  geometry?: BufferGeometry | undefined;
}

export default function InstancedKind({ kind, instances, version, geometry }: Props) {
  const mesh = useRef<InstancedMesh>(null);
  // The outline shares this batch's matrices exactly, so it cannot be scaled
  // separately; its geometry is built larger instead.
  const hull = useRef<InstancedMesh>(null);
  const uploaded = useRef(-1);

  // three tests instanced meshes one instance at a time. Disabling the hook
  // outright is cheaper and clearer than trying to keep them off every
  // raycaster's object list.
  useEffect(() => {
    const current = mesh.current;
    if (!current) return;
    current.raycast = () => {
      /* answered analytically; see the spatial hash */
    };
    current.frustumCulled = true;
    if (hull.current) {
      hull.current.raycast = () => {};
      hull.current.frustumCulled = true;
    }
  }, []);

  // Layout rather than passive effect: the matrices must be in place before
  // the frame that shows them, or a newly placed object appears at the origin
  // for one frame before jumping to where it belongs.
  useLayoutEffect(() => {
    const current = mesh.current;
    if (!current) return;
    if (uploaded.current === version) return;

    const count = Math.min(instances.length, kind.maxInstances);
    let radius = 0;

    for (let i = 0; i < count; i += 1) {
      const place = instances[i];
      if (!place) continue;

      scratchPosition.set(place.x, place.y, place.z);
      scratchScale.setScalar(place.scale);
      scratchMatrix.identity();
      scratchMatrix.makeRotationY(place.yaw);
      scratchMatrix.scale(scratchScale);
      scratchMatrix.setPosition(scratchPosition);
      current.setMatrixAt(i, scratchMatrix);
      hull.current?.setMatrixAt(i, scratchMatrix);

      if (current.instanceColor) {
        scratchColor.set(place.color ?? kind.color);
        current.setColorAt(i, scratchColor);
      }

      radius = Math.max(radius, scratchPosition.distanceTo(ORIGIN) + kind.bounds * place.scale);
    }

    current.count = count;
    current.instanceMatrix.needsUpdate = true;
    if (hull.current) {
      hull.current.count = count;
      hull.current.instanceMatrix.needsUpdate = true;
    }
    if (current.instanceColor) current.instanceColor.needsUpdate = true;

    // The automatically computed sphere is wrong for instanced content: it
    // measures the source geometry, not where the instances ended up, so the
    // batch would be culled while still on screen.
    current.boundingSphere ??= new Sphere();
    current.boundingSphere.set(ORIGIN, radius);
    if (hull.current) {
      hull.current.boundingSphere ??= new Sphere();
      hull.current.boundingSphere.set(ORIGIN, radius + OUTLINE_MARGIN);
    }

    uploaded.current = version;
  }, [instances, version, kind]);

  const lit = kind.material === "dynamic";
  const outlined = hullSize([kind.sizeX, kind.sizeY, kind.sizeZ]);

  return (
    <>
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, kind.maxInstances]}
      count={0}
    >
      {geometry ? (
        <primitive object={geometry} attach="geometry" />
      ) : kind.shape === "box" ? (
        <boxGeometry args={[kind.sizeX, kind.sizeY, kind.sizeZ]} />
      ) : (
        <cylinderGeometry args={[kind.sizeX / 2, kind.sizeX / 2, kind.sizeY, 12]} />
      )}
      {/* Authored geometry carries its own colours per vertex; a primitive
          has one colour for the whole kind. Tinting the former by the kind's
          colour as well would multiply every part towards it and undo the
          reason for baking them in. */}
      {lit ? (
        <meshToonMaterial
          color={geometry ? "#ffffff" : kind.color}
          vertexColors={geometry !== undefined}
          gradientMap={toonRamp()}
        />
      ) : (
        <meshBasicMaterial
          color={geometry ? "#ffffff" : kind.color}
          vertexColors={geometry !== undefined}
        />
      )}
    </instancedMesh>
    <instancedMesh
      ref={hull}
      args={[undefined, undefined, kind.maxInstances]}
      count={0}
      raycast={NEVER_RAYCAST}
    >
      {/* The hull for authored geometry is the kind's measured box rather
          than a swollen copy of the mesh: an inverted hull of a concave prop
          turns inside out at the concavity, and a box silhouette around a
          prop this size is indistinguishable from one that follows it. */}
      {kind.shape === "box" || geometry ? (
        <boxGeometry args={outlined} />
      ) : (
        <cylinderGeometry args={[outlined[0] / 2, outlined[0] / 2, outlined[1], 12]} />
      )}
      <meshBasicMaterial color={OUTLINE_INK} side={BackSide} depthWrite={false} />
    </instancedMesh>
    </>
  );
}
