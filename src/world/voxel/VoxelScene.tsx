import { useCallback } from "react";

import type { ColliderRegistry } from "../../engine/collision/colliderRegistry";
import { isCoarsePointer } from "../../engine/input/orientation";
import ChunkManager from "../../engine/streaming/ChunkManager";
import type { ChunkSpec } from "../../engine/streaming/chunkGrid";
import { radiiForDevice } from "../../engine/streaming/chunkGrid";
import { voxelConfig as CFG } from "./config";
import { voxelChunks } from "./manifest";
import VoxelChunk from "./VoxelChunk";
import BuildTool from "./BuildTool";

/**
 * The voxel world: lighting, and terrain generated around whoever is in it.
 *
 * Chunks are generated rather than fetched, and the streaming manager cannot
 * tell the difference — it mounts and unmounts pieces without knowing whether
 * a piece arrived over a network or was computed on the spot. That is the
 * same boundary that let this world replace an exported island without the
 * engine noticing, and it is why the pivot cost a scene component rather than
 * a rewrite.
 */

interface Props {
  colliderRegistry: ColliderRegistry;
}

export default function VoxelScene({ colliderRegistry }: Props) {
  const { sun, ambient } = CFG.atmosphere;

  const radii = radiiForDevice(
    isCoarsePointer(),
    CFG.streaming.radii,
    CFG.streaming.mobileRadii,
  );

  const renderChunk = useCallback((spec: ChunkSpec) => <VoxelChunk spec={spec} />, []);

  return (
    <>
      <hemisphereLight
        args={[ambient.skyColor, ambient.groundColor, ambient.intensity]}
      />
      <directionalLight
        position={[-sun.direction[0] * 80, -sun.direction[1] * 80, -sun.direction[2] * 80]}
        color={sun.color}
        intensity={sun.intensity}
      />

      <ChunkManager
        chunks={voxelChunks}
        chunkSize={CFG.units.chunkSize}
        radii={radii}
        selectIntervalSec={CFG.streaming.selectIntervalSec}
        colliderRegistry={colliderRegistry}
        renderChunk={renderChunk}
      />

      <BuildTool />
    </>
  );
}
