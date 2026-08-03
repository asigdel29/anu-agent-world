import { useMemo } from "react";
import { BufferAttribute, BufferGeometry } from "three";

import { toonRamp } from "../../engine/assets/toonRamp";
import type { ChunkSpec } from "../../engine/streaming/chunkGrid";
import { generateChunk } from "./chunkData";
import { editRevAround } from "./edits";
import { useBuildStore, voxelEdits } from "./buildStore";
import { meshChunk } from "./mesher";
import { VOXEL_SEED, voxelConfig } from "./config";

/**
 * One chunk of the world, generated and built on the spot.
 *
 * Nothing is fetched. The terrain is a function, so a chunk is produced from
 * its coordinates and the world seed — which means there is no request to
 * fail, no file to be missing, and no difference between a chunk somebody has
 * visited and one nobody ever has.
 *
 * The work happens in a memo keyed on the chunk's cell. Generating and
 * meshing sixteen thousand blocks is a few milliseconds, and doing it during
 * a render rather than in an effect is deliberate: the alternative is
 * mounting an empty chunk and filling it a frame later, which is a hole in
 * the ground that closes while somebody is standing over it.
 *
 * **No outline.** The technique the props and the island use — a shell pushed
 * out along the normals, drawn back-face-first — needs a closed silhouette to
 * hide behind. A chunk surface is not closed: it is a sheet of separate
 * faces, so a shell built from it is a sheet too, and its back faces show
 * through the terrain from almost every angle. The world was legible as dark
 * fragments floating in fog until this came out. Block edges here are already
 * carried by flat colour meeting flat colour at a right angle, which is what
 * the outline was for in the first place.
 */

interface Props {
  readonly spec: ChunkSpec;
}

export default function VoxelChunk({ spec }: Props) {
  // Every chunk watches one global counter, and all but the changed one do
  // nothing about it: the memo below keys on this chunk's own cells, so a
  // distant edit costs a re-render that returns the geometry it already had.
  useBuildStore((s) => s.rev);
  const editRev = editRevAround(voxelEdits, spec.cx, spec.cz);

  const { geometry } = useMemo(() => {
    const size = voxelConfig.units.chunkSize;
    const data = generateChunk(spec.cx, spec.cz, size, VOXEL_SEED, undefined, voxelEdits);
    const mesh = meshChunk(data);

    const built = new BufferGeometry();
    built.setAttribute("position", new BufferAttribute(mesh.positions, 3));
    built.setAttribute("normal", new BufferAttribute(mesh.normals, 3));
    built.setAttribute("color", new BufferAttribute(mesh.colours, 3));

    return { geometry: built };
    // `editRev` is not read in the body and is not a redundant dependency:
    // `voxelEdits` is a mutable store, so its contents cannot be a dependency,
    // and its revision is the only value that changes when they do. Removing
    // it leaves a chunk drawing the terrain as it was before anybody built.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.cx, spec.cz, editRev]);

  const size = voxelConfig.units.chunkSize;

  return (
    <group position={[spec.cx * size, 0, spec.cz * size]}>
      {/* Deliberately unnamed. A subtree called "colliders" means simplified
          proxy geometry and is hidden from rendering — which is right for a
          world whose collision is a cheap stand-in for expensive art, and
          exactly wrong here, where the blocks are already the cheapest
          possible description of themselves. Naming it that hid the entire
          world while collision kept working perfectly: grounded, twenty-five
          colliders registered, and nothing on screen. Unnamed, the chunk
          registers whole, and the mesh you see is the mesh you walk on. */}
      <mesh>
        <primitive object={geometry} attach="geometry" />
        <meshToonMaterial vertexColors gradientMap={toonRamp()} />
      </mesh>
    </group>
  );
}

